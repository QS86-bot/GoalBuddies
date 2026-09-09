-- 0213_de_groep_die_om_uitstel_gevraagd_wordt_ziet_de_straf.sql — een blind akkoord op een commitment device (QS8-370)
--
-- ROLLBACK-PAD:
--   begin;
--   drop policy if exists commitments_select on public.commitments;
--   create policy commitments_select on public.commitments
--     for select to authenticated
--     using (
--       exists (
--         select 1 from goals g
--         where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
--       )
--       or (
--         beneficiary_group_id is not null
--         and status = any (commitment_zichtbaar_voor_groep())
--         and mag_groep_lezen(beneficiary_group_id)
--       )
--       or (
--         beneficiary_user_id = (select auth.uid())
--         and status = any (commitment_zichtbaar_voor_persoon())
--         and deelt_groep_met_eigenaar(goal_id)
--       )
--     );
--   drop function if exists public.gevraagd_om_uitstel_op(uuid);
--   drop index if exists public.deadline_requests_goal_idx;
--   commit;
--
--   ⚠️ De `drop function` hoort erbij en is geen netheid: zonder hem blijft er
--      een `security definer`-functie staan die `authenticated` mag uitvoeren
--      terwijl niets hem meer aanroept. Dezelfde les als in 0183.
--   ⚠️ Deze migratie versmalt niets en gooit niets weg; een terugzet neemt
--      alleen de verruiming zelf terug. Er wordt geen kolom aangeraakt.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-370, gevonden door de security-ronde op de branch van QS8-322.
-- `zet_streefdatum()` draagt sinds 0184 een rem: een straf die op `set` staat,
-- laat de streefdatum niet vooruit schuiven. `beslis_deadline_verzoek()` draagt
-- die rem niet, en dat is geen vergeten achterdeur — 0184 zegt zelf dat de route
-- via `vraag_deadline_verschuiving()` wél bestaat en de gebruiker díé hoort te
-- lezen. De groep mag dus verschuiven wat de eigenaar alleen niet mag.
--
-- ⚠️ **Wat er scheef stond is niet dát, maar dat het akkoord blind was.**
--    📏 Gemeten op de lokale stack, met Bob als beslissend groepslid en een
--    straf op `set`, allebei de vormen die `commitments` kent:
--
--      bob ziet de persoonsstraf (beneficiary_user_id = bob)   = 0
--      bob ziet de groepsstraf   (beneficiary_group_id = grp)  = 0
--
--    `commitment_zichtbaar_voor_groep()` geeft `unlocked, due, resolved` en
--    `commitment_zichtbaar_voor_persoon()` geeft `due, resolved`. Een straf op
--    `set` valt buiten allebei. Het groepslid dat "Akkoord" indrukt, maakt dus
--    een commitment device losser zonder te weten dat het er staat.
--
--    Domeinregel 5 zegt dat een consequentie expliciet bevestigd en
--    auditeerbaar is en nooit stilzwijgend geactiveerd. De spiegelzijde — nooit
--    stilzwijgend ge-de-activeerd, al helemaal niet door iemand die niet ziet
--    waar hij ja tegen zegt — stond er niet, en dat is precies het gat.
--
-- ---------------------------------------------------------------------------
-- De keuze, en waarom hij niet van Claude is
-- ---------------------------------------------------------------------------
--
-- QS8-370 gaf vier richtingen. Richting 1 en 2 (dezelfde rem in
-- `beslis_deadline_verzoek()` of in `vraag_deadline_verschuiving()`) zijn
-- gebouwd en gemeten: 📏 tien bestaande tests werden rood, waaronder twee
-- must-allows in `tests/rls/straf-plafond.test.ts`. Die reparatie is dus geen
-- "strenger maken" maar het intrekken van een belofte die vandaag onderdeel is
-- van de afspraak. Beslisbevoegdheid grens 1.
--
-- **Quinten heeft richting 3 gekozen, en breder dan het issue hem stelde:**
-- *"Iedereen van de groep mag de straf zien"* — niet alleen degene die toevallig
-- op de knop drukt. De volledige afweging staat in
-- `docs/decisions/2026-09-08-de-groepsroute-is-geen-uitweg.md`.
--
-- ---------------------------------------------------------------------------
-- Waarom dit niet `commitment_zichtbaar_voor_groep()` verruimt
-- ---------------------------------------------------------------------------
--
-- Het issue schreef richting 3 op als *"dit verruimt `commitment_zichtbaar_voor_groep()`
-- met `set`"*. 📏 De meting hierboven zegt dat dat het gat niet dicht doet en
-- tegelijk te ver gaat, en allebei die helften zijn hier de reden:
--
--   * **Te weinig.** Die lijst geldt voor de **begunstigde** groep. De groep die
--     over het uitstel beslist is `deadline_requests.group_id`, en die moet van
--     `vraag_deadline_verschuiving()` alleen aan het dóél gekoppeld zijn
--     (`goal_group_links`) — niet de begunstigde zijn. En de straf in de tests
--     van `straf-plafond.test.ts` heeft helemaal geen groep als begunstigde maar
--     een persoon. Verruimen van die ene lijst laat dus precies de gemeten
--     gevallen open.
--   * **Te veel.** Hij zou élke begunstigde groep élke straf laten zien vanaf
--     het moment dat hij vastgelegd wordt, ook zonder dat er ooit iets gevraagd
--     is. Domeinregel 7: voor élk nieuw oppervlak is beschermd het antwoord tot
--     iemand het tegendeel besluit, en besloten is *"de groep mag de straf zien"*
--     in de context van een uitstelverzoek.
--
-- ⚠️ En er is een derde reden om die lijst met rust te laten, en die is
--    aantoonbaar: `verwijder_doel()` leest hem óók, voor de weigering
--    `commitment_in_werking`. Sinds 0190 vangt een látere tak daar élke
--    commitment af met de reden `heeft_commitment`, en die twee redenen hebben
--    elk hun eigen zin in de catalogus (`doel.commitment_in_werking` en
--    `doel.heeft_commitment`). `set` aan de lijst toevoegen verandert dus stil de
--    melding die iemand krijgt die zijn verse doel weggooit — van "er staat een
--    commitment aan dit doel" naar "je straf is al in werking getreden", en dat
--    laatste is niet waar. `tests/rls/straf-houdt-zijn-spoor.test.ts` toetst die
--    reden op drie plekken.
--
-- ---------------------------------------------------------------------------
-- Wat er dan wél gebeurt
-- ---------------------------------------------------------------------------
--
-- Een vierde tak in `commitments_select`: **een groep die om uitstel op dit doel
-- gevraagd is, leest de straffen op dat doel.**
--
-- ⚠️ **Elk verzoek telt, niet alleen een open verzoek.** Een oppervlak dat
--    dichtklapt zodra er beslist is, neemt de beslisser het zicht af op wat hij
--    net heeft toegestaan — en dat is precies het tegendeel van "auditeerbaar"
--    uit domeinregel 5. Je hebt deze groep gevraagd je afspraak losser te maken;
--    wat ze daarbij gezien hebben, blijft staan.
--
-- ⚠️ **Alleen `type = 'penalty'`.** Een beloning heeft geen rem van 0184 en er is
--    niets aan te ontsnappen; hem meenemen zou een verruiming zijn die niemand
--    gevraagd heeft. Geen statuslijst: wie de straf op `set` mag zien, mag hem
--    ook zien nadat hij afgaat of ingetrokken wordt — een tweede lijst om
--    synchroon te houden levert hier niets op.
--
-- ⚠️ **Dit lekt geen gemiste week** (domeinregel 7). Een straf op `set` zegt "ik
--    heb mezelf een consequentie opgelegd", niet "ik heb iets niet gehaald". De
--    tegenslag-kant van een straf is `due`, en die was voor de begunstigde al
--    zichtbaar. Rij toegevoegd aan `docs/decisions/002-domeinregel7-oppervlakken.md`.
--
-- ⚠️ **En de eigenaar weet het vooraf.** Dat een verzoek dit oppervlak opent, is
--    zelf een consequentie, en domeinregel 5 verbiedt een stilzwijgende. Het
--    aanvraagscherm zegt het vóór de verzendknop; de tekst staat onder
--    `deadlineverzoek.straf_waarschuwing` in de catalogus.
--
-- ⚠️ **Een `security definer`-helper en geen subquery in de policy.** Een
--    subquery in een policy leest de andere tabel ónder RLS, en dan hangt de
--    uitslag van deze policy af van `deadline_requests_select`. Dat is de fout
--    die 0183 gemeten heeft: met de join in de policy zag een getuige die nog
--    gewoon lid was zijn eigen rij niet meer. De helper stelt de vraag zelf, en
--    stelt hem aan `mag_groep_lezen()` — dezelfde opvatting van "mag deze groep
--    lezen" die de tweede tak al gebruikt, en niet een tweede.
--
-- ⚠️ **In één transactie**, om dezelfde reden als 0168, 0169 en 0183:
--    `docs/DEPLOY.md` §2.2b past migraties toe zonder `-1`. Faalt de
--    `create policy` na de `drop policy if exists`, dan staat `commitments` met
--    RLS aan en zonder SELECT-policy en leest niemand meer iets, ook de eigenaar
--    niet.

begin;

-- ⚠️ Een index op `goal_id` alleen. Die is er nog niet: van de twee bestaande
--    indexen op die kolom is er één partieel op `status = 'open'` en de andere
--    op `(goal_id, old_date) where status = 'rejected'`. De helper hieronder
--    vraagt over álle statussen, en die draait in een policy — dus op elke rij
--    van elke commitmentquery (onwrikbare regel 11).
create index if not exists deadline_requests_goal_idx
  on public.deadline_requests (goal_id);

create or replace function public.gevraagd_om_uitstel_op(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from deadline_requests r
    where r.goal_id = p_goal_id
      and mag_groep_lezen(r.group_id)
  );
$$;

-- ⚠️ Regel 4: `authenticated` staat met zoveel woorden in de `revoke`. In
--    Supabase deelt `alter default privileges` elke nieuwe functie in `public`
--    uit aan `anon`, `authenticated` én `service_role`; `from public, anon` laat
--    precies de rol staan waaronder iedere ingelogde gebruiker draait.
revoke all on function public.gevraagd_om_uitstel_op(uuid) from public, anon, authenticated;
grant execute on function public.gevraagd_om_uitstel_op(uuid) to authenticated;

comment on function public.gevraagd_om_uitstel_op(uuid) is
  'Heeft de aanroeper, via een groep waar hij van leest, een uitstelverzoek op dit doel '
  'gekregen? Draagt de vierde tak van commitments_select: wie gevraagd wordt een afspraak '
  'losser te maken, ziet de straf die eraan hangt (QS8-370, 0213). Elk verzoek telt en niet '
  'alleen een open — het zicht op wat je hebt toegestaan blijft staan (domeinregel 5). '
  'Niet te verwarren met deelt_groep_met_eigenaar(), die naar de eigenaar van het doel kijkt '
  'en niet naar een verzoek.';

-- ⚠️ De eerste drie takken zijn letterlijk de gedéployde qual uit `pg_policies`
--    en niet overgeschreven uit een migratiebestand: tussen 0084 en 0183 is er
--    aan deze policy gesleuteld (`is_group_member` werd `mag_groep_lezen` in
--    0153, `auth.uid()` ging in een subquery in 0122). `pg_policies` is de
--    waarheid, net als `pg_get_functiondef()` dat voor functies is.
drop policy if exists commitments_select on public.commitments;
create policy commitments_select on public.commitments
  for select to authenticated
  using (
    exists (
      select 1 from goals g
      where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
    )
    or (
      beneficiary_group_id is not null
      and status = any (commitment_zichtbaar_voor_groep())
      and mag_groep_lezen(beneficiary_group_id)
    )
    or (
      beneficiary_user_id = (select auth.uid())
      and status = any (commitment_zichtbaar_voor_persoon())
      and deelt_groep_met_eigenaar(goal_id)
    )
    or (
      type = 'penalty'
      and gevraagd_om_uitstel_op(goal_id)
    )
  );

commit;
