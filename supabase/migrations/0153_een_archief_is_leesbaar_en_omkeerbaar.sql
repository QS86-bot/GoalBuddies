-- 0153_een_archief_is_leesbaar_en_omkeerbaar.sql — nazorg op 0092 (QS8-217).
--
-- ROLLBACK-PAD:
--   drop function if exists public.heropen_groep(uuid, boolean);
--   -- de tien SELECT-policies terug naar `is_group_member(...)`: voer de
--   -- betreffende `create policy`-blokken opnieuw uit uit 0016, 0037, 0045,
--   -- 0076, 0092 en 0102. `mag_groep_lezen()` mag daarna weg:
--   drop function if exists public.mag_groep_lezen(uuid);
--   drop function if exists public.archiefleesgat();
--   -- de CHECK terug zonder 'group_reopened':
--   alter table public.group_events drop constraint if exists group_events_type_valid;
--   alter table public.group_events add constraint group_events_type_valid
--     check (event_type in ('admin_transferred','group_archived','member_left',
--                           'visibility_changed','discoverable_changed',
--                           'join_request_decided','member_removed'));
--   -- en `archief_blijft_archief()` terug naar de vorm van 0092 (zonder de GUC).
--
--   ⚠️ Terugrollen kan alleen zolang geen enkele groep is heropend; een groep die
--      op `active` staat na een heropening ziet er daarna uit als een groep die
--      nooit gearchiveerd is geweest. De `group_events`-rij blijft wel staan.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Dossierrij van 25-08, risico Laag, met open eind. 0092 zette de archieftoets in
-- `is_group_member()` omdat daar tien schrijfpolicies langslopen — tien losse
-- voorwaarden is tien kansen om er één te vergeten. Maar `groups_select` loopt
-- langs diezelfde functie, en dus zijn de chat, de weekafsluitingen en De Ketting
-- van een gearchiveerde groep voor niemand meer te openen.
--
-- Er werd niets gewist. Maar **"archief" belooft leesbaarheid die er niet is**,
-- en de bevestigingstekst zei dat daarom ook met zoveel woorden.
--
-- 📏 **Gemeten in `pg_policies` en niet geteld in de migratiebestanden:** zeventien
--    policies lopen langs `is_group_member()` — **elf SELECT** en zes die schrijven
--    (INSERT, UPDATE, en één ALL op `week_reviews`).
--
-- De splitsing is dus precies de splitsing die de dossierrij beschrijft: de
-- schrijfkant houdt `is_group_member()` ongewijzigd, de leeskant krijgt een eigen
-- functie. **De archieftoets blijft daarmee op één plek per richting staan**, en
-- dat is nog steeds het punt van 0092.
--
-- ---------------------------------------------------------------------------
-- Tien van de elf, en de elfde is de interessante
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`chain_links_select` gaat NIET open, en dat is domeinregel 7.**
--    Die policy draagt sinds 0037 een venster: van een ánder zie je alleen de
--    lopende periode, want daarin betekent een ontbrekende schakel "nog niet" en
--    nooit "gemist". In een gearchiveerde groep is élke periode afgesloten, dus
--    een ontbrekende schakel betekent daar altijd het tweede. De rij openzetten
--    zou precies het lek zijn dat 0037 dichtte, met "archief" als omweg.
--
--    Je eigen kettinggeschiedenis blijft leesbaar: de eerste tak van die policy
--    (`user_id = auth.uid()`) heeft geen lidmaatschapstoets en raakt dit niet.
--
-- ⚠️ **`weekly_goals_select` staat er niet tussen en gaat ook niet open.** Die
--    loopt langs `shares_group_with_goal()`, dat zijn eigen archieftoets heeft.
--    Dat is de zwaarste tabel van domeinregel 7 — hij draagt `missed`, `carried`
--    en `excused` — en "leesbaar archief" is geen reden om daar aan te komen.
--    Het gevolg is dat een gearchiveerde groep zijn chat en weekafsluitingen
--    toont maar niet de weekdoelen zelf. Dat is een gat in de belofte en het is
--    de veilige kant ervan; het staat als losse bevinding in
--    `docs/ENGINEER-REVIEW.md`.
--
-- De tien die wél opengaan dragen geen tegenslag over een ánder die er niet al
-- stond vóór het archiveren: de groep zelf, wie erin zat, welke doelen eraan
-- hingen, de chat (waarvan de systeemberichten al een allowlist hebben, 0034),
-- de weekafsluitingen en hun reacties (vraag 2 deelt de gebruiker zélf — de
-- eerste van de drie routes uit domeinregel 7), de commitments die verschuldigd
-- werden, de deadline-verzoeken (A7, die vraag je zelf aan), de groepsgebeurtenissen
-- en de seizoensrecaps (per domeinregel 7 alleen positieve signalen).
--
-- ⚠️ **Archiveren verruimt geen oppervlak.** De maskering van A41 wordt zelfs
--    strénger: `lid_van_open_groep()` en `deelt_open_groep_met_doel()` hebben
--    allebei hun eigen archieftoets, dus een ópen groep gedraagt zich na
--    archiveren als een beschermde. Dat is met opzet niet aangeraakt.
--
-- ⚠️ **Hier stond "elke rij die na deze migratie zichtbaar is, was zichtbaar toen
--    de groep nog liep", en dat is te sterk.** De security-ronde wees twee
--    definer-schrijvers aan die géén archieftoets hebben:
--    `maak_straffen_verschuldigd()` (0057) filtert alleen op
--    `g.status <> 'completed'`, en `plaats_systeembericht()` (0059) kent er geen.
--    Een straf kan dus weken ná het archiveren op `due` springen, en dan
--    verschijnt er een `commitment_due`-systeembericht in de chat van een groep
--    die al gesloten was.
--
--    **Dat is geen lek** — een zelf ingestelde straf is de uitzondering die
--    domeinregel 7 met zoveel woorden noemt, en domeinregel 11 zegt dat de
--    begunstigde groep juist dán leesrecht krijgt. Maar het argument waaróp het
--    openzetten van tien oppervlakken rust, moet kloppen, want dat is precies de
--    zin waarmee de volgende lezer oppervlak elf openzet. Vandaar de smallere
--    formulering hierboven, en een rij in `docs/ENGINEER-REVIEW.md` voor de twee
--    functies zelf.
--
-- ---------------------------------------------------------------------------
-- De weg terug, en waarom er een sleutel bij hoort
-- ---------------------------------------------------------------------------
--
-- `archief_blijft_archief()` (0092) pint `status` vast voor **elke** rol, ook
-- `service_role` en definer-functies. Dat is met opzet: drie van de vier routes
-- terug naar `active` zijn definer-functies, dus een rolfilter zou hier juist
-- het gat zijn.
--
-- Een `heropen_groep()` moet daar dus doorheen. De discriminator kan geen rol
-- zijn en geen tabelinhoud; wat wél onderscheidt is **welke functie er draait**.
-- Vandaar één transactielokale instelling die alleen `heropen_groep()` zet.
--
-- ⚠️ **Hij draagt het groeps-id en niet `true`, en dat verschil is de hele
--    zorgvuldigheid.** Een booleaanse vlag ontgrendelt binnen die transactie élke
--    gearchiveerde groep die er toevallig langskomt; een id ontgrendelt er precies
--    één, de groep waarvoor de beheerder net getekend heeft. Lekt de instelling
--    ooit — via een toekomstige functie die `set_config` doorgeeft — dan is de
--    schade begrensd tot die ene rij in plaats van tot de hele tabel.
--
-- ⚠️ **`is_group_admin()` is hier onbruikbaar** en dat is geen bug: hij geeft
--    onwaar voor een gearchiveerde groep. `heropen_groep()` kijkt daarom
--    rechtstreeks in `group_members`. Dat stond al in de kop van 0092.
--
-- ⚠️ **`set_config(..., true)` — transactielokaal.** Zonder die `true` blijft de
--    instelling voor de rest van de sessie staan, en PostgREST hergebruikt
--    verbindingen uit een pool. Dan is de ontgrendeling niet één transactie lang
--    geldig maar tot iemand anders diezelfde verbinding krijgt.

begin;

-- ---------------------------------------------------------------------------
-- 1. De leeskant krijgt een eigen functie
-- ---------------------------------------------------------------------------
--
-- ⚠️ Identiek aan `is_group_member()` op één regel na: de archieftoets is eruit.
--    Dat verschil is de hele functie, en daarom staat het hier als commentaar en
--    niet als vanzelfsprekendheid.

create or replace function public.mag_groep_lezen(gid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members m
    where m.group_id = gid
      and m.user_id  = auth.uid()
      and m.status  <> 'inactive'
  );
$$;

comment on function public.mag_groep_lezen(uuid) is
  'Actief lid, óók van een gearchiveerde groep — de leeskant van '
  '`is_group_member()` (0153, QS8-217). Uitsluitend voor SELECT-policies: elke '
  'policy die schrijft hoort langs `is_group_member()` te lopen, die zijn '
  'archieftoets houdt. `archiefleesgat()` telt of dat zo blijft.';

revoke all on function public.mag_groep_lezen(uuid) from public, anon, authenticated;
grant execute on function public.mag_groep_lezen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. De tien SELECT-policies om
-- ---------------------------------------------------------------------------
--
-- ⚠️ Elk hieronder is de gedéployde qual uit `pg_policies`, met uitsluitend
--    `is_group_member` vervangen door `mag_groep_lezen`. Niet overgeschreven uit
--    een migratiebestand: `pg_get_functiondef()` en `pg_policies` zijn de
--    waarheid, en tussen 0016 en 0122 is aan een aantal van deze policies nog
--    gesleuteld (`auth.uid()` in een subquery, 0122).

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (mag_groep_lezen(group_id));

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
  );

drop policy if exists deadline_requests_select on public.deadline_requests;
create policy deadline_requests_select on public.deadline_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or mag_groep_lezen(group_id));

drop policy if exists goal_group_links_select on public.goal_group_links;
create policy goal_group_links_select on public.goal_group_links
  for select to authenticated
  using (mag_groep_lezen(group_id));

drop policy if exists group_events_select on public.group_events;
create policy group_events_select on public.group_events
  for select to authenticated
  using (mag_groep_lezen(group_id));

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select to authenticated
  using (mag_groep_lezen(group_id));

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (mag_groep_lezen(id));

drop policy if exists season_recaps_select on public.season_recaps;
create policy season_recaps_select on public.season_recaps
  for select to authenticated
  using (mag_groep_lezen(group_id));

drop policy if exists week_review_replies_select on public.week_review_replies;
create policy week_review_replies_select on public.week_review_replies
  for select to authenticated
  using (
    exists (
      select 1 from week_reviews r
      where r.id = week_review_replies.week_review_id and mag_groep_lezen(r.group_id)
    )
  );

drop policy if exists week_reviews_select on public.week_reviews;
create policy week_reviews_select on public.week_reviews
  for select to authenticated
  using (mag_groep_lezen(group_id));

-- ---------------------------------------------------------------------------
-- 2b. Drie deuren die er al zaten, en die deze migratie bereikbaar maakt
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Gevonden door de security-ronde, en daarna nagemeten en nagespeeld.** Drie
--    schrijfpolicies dragen géén archieftoets, omdat ze `is_group_member()` nooit
--    genoemd hebben en dus ook niet in de telling van zeventien zaten:
--
--      chat_messages_delete        using (sender_id = auth.uid())
--      week_review_replies_delete  using (author_id = auth.uid())
--      week_reviews_write (ALL)    using (user_id   = auth.uid())
--
--    `authenticated` heeft DELETE op alle drie de tabellen — nagekeken in
--    `information_schema.role_table_grants`, niet aangenomen.
--
-- ⚠️ **Vóór deze migratie was dat onbereikbaar en daarom onzichtbaar.** De chat
--    van een gearchiveerde groep laadde niet, dus de verwijderknop stond er niet.
--    0153 opent de leeskant en daarmee de gang ernaartoe: scherm laadt →
--    verwijderknop rendert → verwijderen slaagt. **Dit is dus een bevinding van
--    déze migratie en niet van 0122**, ook al staat de policy daar.
--
--    📏 Nagespeeld op de lokale stack: een lid van een gearchiveerde groep
--    verwijderde als `authenticated` zijn eigen bericht, en het was weg.
--
-- ⚠️ **En de copy die in deze wijziging meekomt ontkent het met zoveel woorden** —
--    `bevestiging.groep_archiveren.uitleg` zegt *"niemand kan er daarna nog iets
--    in doen"* en `beheer.archief_waarschuwing` zegt *"er wordt niets gewist"*.
--    Een tekst die onomkeerbaarheid belooft naast een knop die hem breekt, is de
--    duurste combinatie die dit project kent.
--
-- **Er waren twee uitwegen en dit is de conservatiefste:** de drie policies
-- krijgen de toets die de rest van de schrijfkant al heeft. Archiveren is in deze
-- app de vervanger van weggooien (0092), er zijn geen backups op de gratis tier,
-- en domeinregel 6 zegt dat geschiedenis gecorrigeerd wordt met een correctie en
-- niet door te overschrijven. De andere uitweg — de tekst aanpassen en het wissen
-- toestaan — is een productbesluit en staat als zodanig in `docs/ENGINEER-REVIEW.md`.
--
-- ⚠️ **Bijwerking, met opzet en in de goede richting:** een **inactief** lid kan
--    zijn eigen berichten nu ook in een lévende groep niet meer wissen. Dat is
--    consistent met elke andere schrijfpolicy, die allemaal `status <> 'inactive'`
--    eisen — het was hier de uitzondering en niet de regel.

drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages
  for delete to authenticated
  using (sender_id = (select auth.uid()) and is_group_member(group_id));

drop policy if exists week_review_replies_delete on public.week_review_replies;
create policy week_review_replies_delete on public.week_review_replies
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1 from week_reviews r
      where r.id = week_review_replies.week_review_id and is_group_member(r.group_id)
    )
  );

-- ⚠️ `week_reviews_write` is `for all`, en DELETE kent geen `with_check` — dus de
--    `is_group_member` die daarin stond gold niet voor verwijderen. Hij wordt
--    gesplitst zodat de `using` de toets zelf draagt.
drop policy if exists week_reviews_write on public.week_reviews;
create policy week_reviews_write on public.week_reviews
  for all to authenticated
  using (user_id = (select auth.uid()) and is_group_member(group_id))
  with check (user_id = (select auth.uid()) and is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- 2c. En een vierde, gevonden door de teller zelf
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De nieuwe derde tak van `archiefleesgat()` vond er nog één, en dat is het
--    beste bewijs dat die tak nodig was.** `completion_approvals_insert` schrijft
--    het lidmaatschap ínline uit (`group_members ... status <> 'inactive'`) in
--    plaats van `is_group_member()` aan te roepen, en heeft daardoor nooit een
--    archieftoets gehad. Goedkeuren in een gearchiveerde groep kent punten toe en
--    zet een weekdoel op `approved` — dat is de zwaarste schrijfhandeling die
--    dit project kent (domeinregel 3 én 10).
--
--    Bereikbaar met een voltooiings-id van vóór het archiveren; de leeskant is
--    dicht maar de schrijfkant vroeg er niet naar. Ouder dan 0153 en niet erger
--    geworden door 0153 — maar hij staat hier omdat de teller van déze migratie
--    hem vond en het onverantwoord is hem te laten liggen tot iemand anders
--    struikelt.
--
-- ⚠️ De inline-toets blijft staan en de functie komt ernáást. Hem vervangen zou
--    een pagineringswijziging in een autorisatiepolicy zijn: de inline-vorm doet
--    de toets op `completion_approvals.group_id` en de functie doet hem opnieuw,
--    en dat verschil hoort niet in deze migratie te worden uitgezocht.

drop policy if exists completion_approvals_insert on public.completion_approvals;
create policy completion_approvals_insert on public.completion_approvals
  for insert to authenticated
  with check (
    approver_id = (select auth.uid())
    and is_group_member(group_id)
    and exists (
      select 1 from group_members m
      where m.group_id = completion_approvals.group_id
        and m.user_id  = (select auth.uid())
        and m.status  <> 'inactive'
    )
    and exists (
      select 1
      from completions c
      join weekly_goals w on w.id = c.weekly_goal_id
      join goal_group_links l on l.goal_id = w.goal_id
      where c.id = completion_approvals.completion_id
        and l.group_id = completion_approvals.group_id
        and c.user_id <> (select auth.uid())
        and c.superseded_by is null
    )
  );

-- ---------------------------------------------------------------------------
-- 3. De teller die de splitsing bewaakt
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Zonder deze functie is de splitsing een afspraak en geen grendel.** De
--    reden dat 0092 de archieftoets in één functie zette, was dat tien losse
--    voorwaarden tien kansen zijn om er één te vergeten. Twee functies naast
--    elkaar hebben datzelfde probleem één laag hoger: de volgende SELECT-policy
--    krijgt `is_group_member()` omdat dat de naam is die iedereen kent, en dan
--    is één tabel stilzwijgend dicht in het archief.
--
--    Deze functie telt wat er niet klopt, in **drie** richtingen.
--
-- ⚠️ **De derde tak is er pas ná de security-ronde bij gekomen, en dat is de les
--    van deze migratie.** De eerste twee takken zochten policies die één van de
--    twee functienamen letterlijk noemen. Wat ze daarmee bewezen was *"geen
--    schrijfpolicy noemt `mag_groep_lezen`"* — een eigenschap van een naam. Wat
--    ze belóófden was *"in een archief valt niet te schrijven"* — een eigenschap
--    van het geheel. Drie DELETE-policies noemden geen van beide functies en
--    bestonden voor deze teller dus niet, terwijl ze precies het gat waren.
--
--    Regel 18 vraag 2 in het gereedschap zelf: een controle die naar een náám
--    zoekt in plaats van naar de belofte, is groen om de verkeerde reden.
--
-- ⚠️ Tak 1 filtert op `cmd in ('SELECT','ALL')` en niet alleen op SELECT: een
--    `for all`-policy poort óók lezen. `week_reviews_write` is er vandaag zo een.
--
-- ⚠️ En `schemaname in ('public','storage')`, want `storage-controle` kent al een
--    bijlagenbucketfixture met `is_group_member(...)` erin. Die bucket bestaat nog
--    niet, en juist dan hoort de teller er al te staan.

create or replace function public.archiefleesgat()
  returns table (naam text, bezwaar text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select (p.tablename || '.' || p.policyname)::text,
         'leespolicy loopt langs is_group_member(); die sluit een archief uit'
  from pg_policies p
  where p.schemaname in ('public', 'storage')
    and p.cmd in ('SELECT', 'ALL')
    and coalesce(p.qual, '') like '%is_group_member%'
    -- ⚠️ De uitzonderingen met naam en reden, niet met een stilzwijgen. De
    --    Ketting hóórt dicht te blijven (zie de kop); `week_reviews_write` is een
    --    schrijfpolicy die toevallig `for all` is en waarvan het lezen langs
    --    `week_reviews_select` loopt.
    and p.policyname not in ('chain_links_select', 'week_reviews_write')
  union all
  select (p.tablename || '.' || p.policyname)::text,
         'schrijvende policy loopt langs mag_groep_lezen(); die laat een archief door'
  from pg_policies p
  where p.schemaname in ('public', 'storage')
    and p.cmd <> 'SELECT'
    and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%mag_groep_lezen%'
  union all
  -- ⚠️ **De derde tak, en de enige die naar de belófte kijkt in plaats van naar
  --    een functienaam.** Elke schrijvende policy op een tabel met een
  --    `group_id`-kolom moet érgens een archieftoets dragen. Vier functies
  --    hebben er een: `is_group_member`, `is_group_admin`,
  --    `shares_group_with_goal` en `deelt_open_groep_met_doel`. Noemt een
  --    schrijfpolicy er geen enkele, dan staat die tabel open in een archief —
  --    en dat is precies hoe `chat_messages_delete` er drie migraties lang in
  --    zat zonder dat iets het zag.
  select (p.tablename || '.' || p.policyname)::text,
         'schrijvende policy op een groepstabel zonder enige archieftoets'
  from pg_policies p
  join information_schema.columns c
    on c.table_schema = p.schemaname
   and c.table_name   = p.tablename
   and c.column_name  = 'group_id'
  where p.schemaname = 'public'
    and p.cmd <> 'SELECT'
    and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '%is_group_member%'
    and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '%is_group_admin%'
    and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '%shares_group_with_goal%'
    and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '%deelt_open_groep_met_doel%'
    -- Policies die niets doorlaten hoeven geen toets.
    and coalesce(p.qual, '') <> 'false'
    and coalesce(p.with_check, '') <> 'false'
    -- ⚠️ Twee uitzonderingen, met naam en reden en niet met een stilzwijgen:
    --
    --   `goal_group_links_delete` — de eigenaar koppelt zijn eigen doel los. Dat
    --   hóórt ook uit een gearchiveerde groep te kunnen: het doel is van hem, en
    --   hem daaraan vastketenen omdat de groep gesloten is zou het archief een
    --   slot op iemand ánders spullen maken.
    --
    --   `group_members_insert_founder` — de oprichtersrij bij het aanmaken. Een
    --   groep die net gemaakt wordt staat per constructie op `active`; er ís op
    --   dat moment geen archief om tegen te toetsen.
    and p.policyname not in ('goal_group_links_delete', 'group_members_insert_founder')
  order by 1;
$$;

comment on function public.archiefleesgat() is
  'Policies die aan de verkeerde kant van de lees/schrijf-splitsing van 0153 '
  'staan. Hoort leeg te zijn. Tweezijdig: een SELECT-policy die een archief '
  'uitsluit én — gevaarlijker — een schrijfpolicy die er een doorlaat.';

revoke all on function public.archiefleesgat() from public, anon, authenticated;
-- ⚠️ Expliciet en niet geërfd. `alter default privileges` geeft `service_role` dit
--    recht toch al, en precies dát is de klasse waar 0115 en `functiegrants.test.ts`
--    voor bestaan: een recht zonder grant-regel is geërfd en niet besloten.
grant execute on function public.archiefleesgat() to service_role;

-- ---------------------------------------------------------------------------
-- 3b. Wie mag de sleutel zetten?
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De belofte "die instelling zet alleen `heropen_groep()`" stond in
--    commentaar en nergens als controle.** Dit project heeft voor precies die
--    klasse `pinuitzonderingen-controle`, `realtime_bewaking()`,
--    `triggerfuncties_in_de_api()` en `archiefleesgat()`. Een nieuw
--    bypass-mechanisme zonder eigen teller zou de uitzondering zijn.
--
--    Twee functies mogen `app.heropent_groep` noemen: degene die hem zet en
--    degene die hem leest. Elke derde is een tweede sleutel.

create or replace function public.sleutelzetters()
  returns table (naam text, bezwaar text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select p.proname::text,
         'noemt app.heropent_groep; alleen heropen_groep() en '
         'archief_blijft_archief() horen die sleutel te kennen (0153)'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosrc like '%app.heropent_groep%'
    and p.proname not in ('heropen_groep', 'archief_blijft_archief', 'sleutelzetters')
  order by 1;
$$;

comment on function public.sleutelzetters() is
  'Functies die de ontgrendelsleutel van het archief noemen (0153). Hoort leeg '
  'te zijn: alleen `heropen_groep()` zet hem en alleen `archief_blijft_archief()` '
  'leest hem. Een derde functie is een tweede sleutel.';

revoke all on function public.sleutelzetters() from public, anon, authenticated;
grant execute on function public.sleutelzetters() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Een gebeurtenis die nog niet bestond
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een allowlist-CHECK, net als `chat_messages_system_event_bekend` (0034):
--    een nieuw type vraagt een migratie en is niet stilletjes toe te voegen.

alter table public.group_events drop constraint if exists group_events_type_valid;
alter table public.group_events add constraint group_events_type_valid
  check (event_type in (
    'admin_transferred', 'group_archived', 'member_left', 'visibility_changed',
    'discoverable_changed', 'join_request_decided', 'member_removed',
    'group_reopened'
  ));

-- ---------------------------------------------------------------------------
-- 5. Het slot krijgt één sleutel
-- ---------------------------------------------------------------------------

create or replace function public.archief_blijft_archief()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if old.status = 'archived' and new.status is distinct from 'archived' then
    -- ⚠️ De sleutel draagt het groeps-id. Een booleaan zou binnen deze
    --    transactie élke gearchiveerde groep ontgrendelen die langskomt; zo is
    --    het er precies één. `nullif` want een niet-gezette instelling komt als
    --    lege string terug en niet als NULL.
    if nullif(current_setting('app.heropent_groep', true), '') is distinct from old.id::text then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.archief_blijft_archief() is
  'Houdt een gearchiveerde groep gearchiveerd, tenzij `app.heropent_groep` het '
  'id van precies deze groep draagt — en dat zet alleen `heropen_groep()` '
  '(0153). Geldt verder voor élke rol, ook service_role en definer-functies: '
  'drie van de vier routes terug naar active zijn definer-functies, dus de '
  'rolfilter van guard_group_update() zou hier juist het gat zijn. Pint vast in '
  'plaats van te gooien (les van 0017).';

-- ---------------------------------------------------------------------------
-- 6. Heropenen
-- ---------------------------------------------------------------------------

create or replace function public.heropen_groep(
  p_group_id uuid,
  p_bevestigd boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_lidmaatschap integer;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  -- ⚠️ Rechtstreeks in `group_members` en niet via `is_group_admin()`: die geeft
  --    onwaar voor een gearchiveerde groep, en dat is precies de toestand waar
  --    deze functie voor bestaat. Stond al in de kop van 0092.
  if not exists (
    select 1 from group_members m
    where m.group_id = p_group_id
      and m.user_id  = auth.uid()
      and m.role     = 'admin'
      and m.status  <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  select g.status into v_status
  from groups g
  where g.id = p_group_id
  for update;

  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  if v_status <> 'archived' then
    return jsonb_build_object('ok', false, 'reason', 'unchanged');
  end if;

  -- ⚠️ **Dezelfde telling als in `create_group()` en `join_group_with_code()`,
  --    en zonder deze regel is de grens van tien te omzeilen.** Die twee tellen
  --    gearchiveerde groepen níét mee, met de goede reden dat archiveren anders
  --    net zo duur is als weggooien: je raakt de groep kwijt én je plek blijft
  --    bezet. Dat was sluitend zolang archiveren onomkeerbaar was.
  --
  --    Met een weg terug is het een gat: tien groepen maken, alle tien
  --    archiveren (teller op nul), tien nieuwe maken, en daarna alles heropenen.
  --    Gevonden door de security-ronde op deze migratie.
  select count(*) into v_lidmaatschap
  from group_members m
  join groups g on g.id = m.group_id
  where m.user_id = auth.uid()
    and m.status <> 'inactive'
    and g.status <> 'archived';

  if v_lidmaatschap >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
  end if;

  -- De sleutel, transactielokaal en met het id erin.
  perform set_config('app.heropent_groep', p_group_id::text, true);

  -- ⚠️ `last_activity_at` gaat mee. `slaap_stille_groepen()` (0016) zet elke
  --    actieve groep met oude activiteit terug op `sleeping` mét een
  --    systeembericht; een groep die een maand in het archief stond zou dus de
  --    eerstvolgende nacht in slaap vallen met "deze groep is een tijdje stil
  --    geweest" — direct na het terughalen.
  update groups set status = 'active', last_activity_at = now() where id = p_group_id;

  -- ⚠️ Teruglezen en niet aannemen. `archief_blijft_archief()` pint stil vast in
  --    plaats van te gooien, dus een mislukte heropening geeft zonder deze
  --    controle `ok: true` terwijl er niets veranderd is — precies de vorm die
  --    dit project als zijn duurste kent.
  select g.status into v_status from groups g where g.id = p_group_id;
  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'pinned');
  end if;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    auth.uid(),
    'group_reopened',
    jsonb_build_object('status', 'archived'),
    jsonb_build_object('status', 'active')
  );

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.heropen_groep(uuid, boolean) is
  'Haalt een groep terug uit het archief (0153, QS8-217). Vraagt een actieve '
  'beheerder — rechtstreeks uit group_members, want is_group_admin() geeft '
  'onwaar voor een archief — en een expliciete bevestiging, en laat een rij na '
  'in group_events. Leest de status terug: de pin van archief_blijft_archief() '
  'weigert stil, dus zonder die controle zou een mislukte heropening ok geven.';

revoke all on function public.heropen_groep(uuid, boolean) from public, anon, authenticated;
grant execute on function public.heropen_groep(uuid, boolean) to authenticated;

commit;
