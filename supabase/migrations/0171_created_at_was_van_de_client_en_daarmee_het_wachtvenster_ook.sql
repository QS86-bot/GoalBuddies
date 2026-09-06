-- 0171_created_at_was_van_de_client_en_daarmee_het_wachtvenster_ook.sql — de 24-uursgrendel van 0170 hing aan een kolom die de client zelf meestuurt (QS8-293)
--
-- ROLLBACK-PAD:
--   grant insert on public.commitments to authenticated;
--   plus `create or replace` op `commitments_insert` zonder de klokconjuncten
--   (definitie in 0169).
--   ⚠️ Deze migratie voegt alleen weigeringen toe; er gaat bij een terugzet
--   niets verloren behalve de bescherming zelf.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- De derde security-ronde op dit issue. 0170 beloofde: *een straf die je
-- vastlegt, gaat nooit binnen een dag af*, en hing die belofte aan
-- `c.created_at < now() - interval '24 hours'` — "server-tijd aan beide kanten,
-- met geen enkele gebruikerskolom te verzetten".
--
-- **`created_at` wás die kolom.** Gemeten:
--
--   INSERT-grant commitments | beneficiary_group_id, beneficiary_user_id, body,
--                              confirmed_at, created_at, goal_id, id, image_url,
--                              status, type
--   UPDATE-grant commitments | body, image_url, status
--
-- 0057 versmalde alleen de UPDATE-grant. De INSERT-grant is nooit versmald en is
-- dus nog de standaard die Supabase via `alter default privileges` uitdeelt —
-- álle kolommen. En dan is de aanval terug, in één statement meer dan eerst:
--
--   A  created_at zoals de client hem meestuurde: 2020-01-01 00:00:00+00
--   B  rollover verschuldigd = 1   status = due
--
-- ⚠️⚠️ **De duurste regel van dit issue staat niet in een migratie maar in een
-- testbestand.** In `tests/rls/epic9.test.ts` stond, als toelichting bij de
-- opbouw:
--
--   "die kolom staat niet in de UPDATE- of INSERT-grant van `authenticated`,
--    en dat hoort zo — een gebruiker die zijn eigen `created_at` kiest, kiest
--    zijn eigen wachtvenster."
--
-- De invariant was juist. De vaststelling was onwaar. En er stond geen query
-- naast, dus niets werd er rood van. **Een zin over een grant is pas waar als er
-- een query naast staat** — dat is de les van deze ronde, en hij staat als eigen
-- rij in `docs/ENGINEER-REVIEW.md`.
--
-- ---------------------------------------------------------------------------
-- Twee grendels, en geen van beide bindt `service_role`
-- ---------------------------------------------------------------------------
--
-- **1. De INSERT-grant versmallen**, dezelfde vorm die 0044 en 0046 elders al
-- gebruiken. Dit is de grendel die het vandaag dichtzet: de client kan de kolom
-- niet meer noemen, dus de default `now()` geldt.
--
-- **2. Een klokconjunct in `commitments_insert`**, want een grant overleeft het
-- volgende "bewerk je commitment"-scherm niet. Wordt de grant ooit verruimd, dan
-- weigert de policy een teruggedateerde rij alsnog. Twee onafhankelijke sloten
-- op één belofte, elk apart te ijken.
--
-- ⚠️ **Een trigger zou hier verkeerd zijn en dat is geen luiheid.** Een BEFORE
--    INSERT-trigger die `new.created_at := now()` forceert, bindt óók
--    `service_role` — en dan kan geen enkele opstelling meer een straf bouwen
--    die er gisteren al stond. Precies de grendel van 0170 wordt daarmee
--    ontoetsbaar. Grant en policy laten `service_role` met rust, en dát is hier
--    de juiste kant: de aanvaller heeft die rol niet.
--
-- ⚠️ **Een venster van vijf minuten en niet nul.** Met de versmalde grant vult
--    Postgres de kolom zelf, dus het venster doet vandaag niets. Het bestaat
--    voor het geval de grant terugkomt: dan is een client die zijn eigen klok
--    meestuurt een paar seconden of minuten scheef, en een grens op de seconde
--    zou een eerlijke insert weigeren. De aanval heeft dagen nodig, geen minuten.
--
-- ⚠️ **Beide kanten, en de bovenkant is niet cosmetisch.** Een `created_at` in de
--    tóekomst stelt je eigen straf onbeperkt uit — dat is je eigen commitment
--    device ontlopen, en domeinregel 5 gaat precies daarover.
--
-- ⚠️ **`confirmed_at` krijgt dezelfde behandeling**, en dat is geen meelift.
--    Dat veld ís de bevestiging waar domeinregel 5 om vraagt: "expliciet
--    bevestigd, auditeerbaar". Een client die hem vrij kiest, kiest wanneer hij
--    volgens de administratie ja gezegd heeft. Hij blijft in de grant staan
--    omdat `zetStraf()` hem meestuurt (`confirmed_at: 'now'`), dus hier doet
--    alleen de policy het werk. `null` blijft toegestaan: een commitment dat nog
--    niet bevestigd is, hoort te kunnen bestaan.
--
-- ⚠️ **`id` en `status` gaan er ook uit.** Geen enkel schrijfpad in `src/` of
--    `app/` stuurt ze mee — gemeten door `kolomrechten:controle`, die daar rood
--    van werd toen ik ze "voor de zekerheid" had laten staan. Zie de toelichting
--    bij de grant zelf.
--
-- ---------------------------------------------------------------------------
-- Idempotent: `revoke`/`grant` zijn dat van nature, en de policy wordt eerst
-- gedropt.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De INSERT-grant versmallen
-- ---------------------------------------------------------------------------
--
-- ⚠️ `from public, anon, authenticated` en niet `from public, anon` — zie
--    onwrikbare regel 4 en `docs/decisions/2026-08-28-revoke-from-public-is-niet-van-iedereen.md`.
--
-- ⚠️ **`id` en `status` staan er níét in, en dat is een correctie op mijn eigen
--    eerste versie.** Die had ze allebei "voor de zekerheid" laten staan — `id`
--    omdat weghalen een client zou kunnen breken, `status` omdat een expliciete
--    `'set'` dan op de policy stuit in plaats van op een permissiefout.
--
--    `npm run kolomrechten:controle` werd daar rood van, en terecht: hij toetst
--    sinds QS8-258 óók de schrijfkant, en meldt elke kolom met een INSERT-grant
--    die geen enkel schrijfpad in `src/` of `app/` gebruikt. Gemeten: `maak()`
--    in `src/modules/commitments/api.ts` stuurt precies de zeven kolommen
--    hieronder, en laat `status` er met zoveel woorden buiten. Een grant die
--    niemand gebruikt, is geen zekerheid maar een gat dat op zijn beurt weer
--    moet worden dichtgeredeneerd — dit issue heeft daar drie rondes over gedaan.
--
--    De redenering die ik voor `status` had, klopt bovendien niet: de policy pint
--    hem al vast op `'set'`, dus een client die iets ánders meestuurt hoort te
--    stuiten, en een client die `'set'` meestuurt bestaat niet.
revoke insert on public.commitments from public, anon, authenticated;

grant insert (
  goal_id,
  type,
  body,
  image_url,
  beneficiary_group_id,
  beneficiary_user_id,
  confirmed_at
) on public.commitments to authenticated;

-- ---------------------------------------------------------------------------
-- 2. En de policy, voor het geval de grant ooit terugkomt
-- ---------------------------------------------------------------------------

drop policy if exists commitments_insert on commitments;
create policy commitments_insert on commitments
  for insert to authenticated
  with check (
    exists (
      select 1 from goals g
      where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
    )
    and status = 'set'
    and (beneficiary_group_id is null or is_group_member(beneficiary_group_id))
    and (beneficiary_user_id is null or shares_group_with_user(beneficiary_user_id))
    and (
      type <> 'penalty'
      or exists (
        select 1 from goals g
        where g.id = commitments.goal_id and g.target_date >= mijn_datum()
      )
    )
    -- ⚠️ QS8-293, derde ronde. Zie de kop: hieraan hangt het wachtvenster van
    --    0170, en het hing tot nu toe aan een veld uit de POST-body.
    and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
    and (
      confirmed_at is null
      or confirmed_at between now() - interval '5 minutes' and now() + interval '5 minutes'
    )
  );
