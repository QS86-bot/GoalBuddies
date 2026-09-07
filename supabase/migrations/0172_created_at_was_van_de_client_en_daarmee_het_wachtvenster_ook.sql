-- 0172_created_at_was_van_de_client_en_daarmee_het_wachtvenster_ook.sql — de 24-uursgrendel van 0171 hing aan een kolom die de client zelf meestuurt (QS8-293)
--
-- ROLLBACK-PAD:
--   grant insert on public.commitments to authenticated;
--   plus `create or replace` op `commitments_insert` zonder de klokconjuncten
--   (definitie in 0170).
--   ⚠️ Deze migratie voegt alleen weigeringen toe; er gaat bij een terugzet
--   niets verloren behalve de bescherming zelf.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- De derde security-ronde op dit issue. 0171 beloofde: *een straf die je
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
-- **2. Een klokconjunct in `commitments_insert`**, zodat een verruiming van de
-- INSERT-grant de belofte niet meteen weer opent. Twee sloten op één belofte,
-- elk apart te ijken.
--
-- ⚠️⚠️ **Onafhankelijk zijn die twee alleen voor de INSERT, en de eerste versie
--    van deze kop beweerde meer.** Daar stond dat het tweede slot er is "want een
--    grant overleeft het volgende bewerk-je-commitment-scherm niet" — maar zo'n
--    scherm vraagt een **UPDATE**-recht, en `commitments_update` heeft geen
--    enkele klokconjunct. Gemeten: geef `authenticated`
--    `update (created_at, confirmed_at)` en het wachtvenster van 0171 staat weer
--    op nul, langs de UPDATE-kant.
--
--    Voor die kant draagt de kolomgrant het dus alléén, net als vóór deze
--    migratie. Dat is verdedigbaar — de UPDATE-grant is sinds 0057 met opzet
--    versmald tot `body, image_url, status` — maar het hoort gemeten te zijn en
--    niet aangenomen: `tests/rls/straf-plafond.test.ts` legt nu ook
--    `commitments.created_at` en `commitments.confirmed_at` op de UPDATE-kant
--    vast. Een klokconjunct in `commitments_update` erbij zou een derde kopie van
--    dezelfde regel zijn op een pad dat vandaag niet bestaat; dat is de vorm die
--    0168 er juist uit haalde omdat hij niet te ijken viel.
--
-- ⚠️ **Een trigger zou hier verkeerd zijn en dat is geen luiheid.** Een BEFORE
--    INSERT-trigger die `new.created_at := now()` forceert, bindt óók
--    `service_role` — en dan kan geen enkele opstelling meer een straf bouwen
--    die er gisteren al stond. Precies de grendel van 0171 wordt daarmee
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
--    alleen de policy het werk.
--
--    ⚠️ Hier stond eerst een tak `confirmed_at is null or …`, met de toelichting
--    dat een onbevestigd commitment moet kunnen bestaan. Gemeten:
--    `confirmed_at | timestamp with time zone | not null`, zonder default. Die
--    tak kon dus nooit vuren en de zin erboven beschreef een toestand die het
--    schema verbiedt. **Precies de klasse fout die dit issue drie rondes gekost
--    heeft** — een uitspraak over het schema, opgeschreven als vaststelling,
--    zonder query ernaast. De tak is eruit.
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
    --    0171, en het hing tot nu toe aan een veld uit de POST-body.
    and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
    and confirmed_at between now() - interval '5 minutes' and now() + interval '5 minutes'
  );
