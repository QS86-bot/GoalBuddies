-- 0174_de_getuige_krijgt_een_melding.sql — de persoon-getuige van een straf hoorde pas dat hij getuige was als hij de app zelf opende (QS8-298)
--
-- ROLLBACK-PAD:
--   alter table public.notifications_sent drop constraint notifications_sent_kind_bekend;
--   alter table public.notifications_sent add constraint notifications_sent_kind_bekend
--     check (kind in ('nudge', 'approval_request', 'approval_received', 'cycle_summary'));
--   drop function if exists public.getuigenissen_voor(uuid);
--   ⚠️ Staan er al rijen met `kind = 'commitment_witness'`, dan weigert de CHECK
--   bij het terugzetten — terecht. Verwijder die rijen eerst, of laat de
--   verruiming staan: hij verplicht tot niets.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-292 gaf de persoon-getuige zijn leesoppervlak: `getuigenissen()` (0169)
-- plus een blok *Jij bent getuige* op *Vandaag*. Wat er niet kwam is de duw
-- ernaartoe. 📏 Gemeten op de draaiende database:
--
--   * `meld_commitment()` plaatst alleen een systeembericht bij
--     `beneficiary_group_id is not null` — de persoonstak doet niets.
--   * `src/modules/notifications/regels.ts` noemt `commitment` nul keer.
--   * `pg_publication_tables` voor `supabase_realtime`: chat_messages,
--     completions, weekly_goals. `commitments` staat er niet in.
--
-- De groepstak krijgt dus wél een bericht en de persoonstak niet. Dat is de
-- asymmetrie die hier weggaat.
--
-- ⚠️ **En dit vraagt wél een migratie, anders dan QS8-292 aannam.** Die schreef:
-- *"een notificatietype vraagt alleen een migratie als het een systeembericht
-- wordt."* Nagemeten klopt dat niet:
--
--   notifications_sent_kind_bekend ->
--     CHECK (kind = ANY (ARRAY['nudge','approval_request',
--                              'approval_received','cycle_summary']))
--
-- Zonder rij in `notifications_sent` is er geen ontdubbeling, en dan stuurt de
-- uurjob dezelfde melding elke ronde opnieuw. De CHECK is dus geen formaliteit
-- maar de plek waar de ontdubbeling op leunt.
--
-- ---------------------------------------------------------------------------
-- Domeinregel 7 — waarom dit mag, en waarom het de regel niet verruimt
-- ---------------------------------------------------------------------------
--
-- De kop van `regels.ts` zegt met zoveel woorden dat geen van de vier soorten
-- over de tegenslag van een ánder gaat, en dat er zo geen bij mag komen. **Deze
-- is de eerste die dat wél doet**, en dat kan op precies één grond: de
-- uitzondering die domeinregel 7 zelf noemt — *"een straf die de gebruiker zelf
-- vooraf heeft ingesteld en bevestigd"*.
--
-- Drie dingen dragen die grond, en geen ervan mag weg:
--
-- 1. **De eigenaar heeft deze persoon zelf als getuige aangewezen**, en dat is
--    langs geen enkele weg te omzeilen: `commitments_insert` eist
--    `shares_group_with_user(beneficiary_user_id)`, `bewaak_begunstigde()`
--    (0168) verbiedt zelfgetuige én het leeghalen van de kolom en bindt ook
--    `service_role`, en de kolomgrant laat `authenticated` na de insert alleen
--    `body`, `image_url` en `status` bijwerken — `goal_id` en
--    `beneficiary_user_id` staan dus vast.
--
--    ⚠️ **Hier stond eerst "en het commitment bevestigd (`confirmed_at`)", en
--    dat was een grendel die niet bestaat.** 📏 `confirmed_at` is `not null`
--    zonder default: de kolom ís altijd gevuld, dus die conjunct kan nooit
--    onwaar zijn en kan dus ook nooit rood worden. De echte bevestiging leeft in
--    de UI; de policy eist alleen dat de waarde binnen vijf minuten van `now()`
--    ligt. De conjunct is uit de functie gehaald en deze zin uit de
--    onderbouwing. Een opgeschreven grendel die niet bestaat is duurder dan geen
--    grendel — de volgende lezer bouwt erop. Gevonden in de security-review van
--    07-09-2026.
-- 2. **De melding gaat pas af als de straf verschuldigd is** — `status = 'due'`,
--    dezelfde grens als `commitment_zichtbaar_voor_persoon()` en dezelfde als
--    domeinregel 11. Vóór dat moment weet de getuige van niets, en dat blijft zo.
-- 3. **Er gaat niets naar de groep.** Dit is een pushmelding aan één persoon.
--    Via de groepschat zou de hele groep horen wat expliciet naar één iemand
--    ging — precies de verruiming die QS8-228 níét maakte.
--
-- ⚠️ **Wat dit dus níét is:** geen precedent voor een melding over een gemiste
-- week, een verbroken reeks of een achterstand. Die hebben geen vooraf
-- bevestigde afspraak onder zich en blijven verboden. Wie hier een tweede soort
-- aan wil hangen, leest eerst deze drie punten en vraagt zich af welke ervan hij
-- kan aanwijzen.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De vijfde soort
-- ---------------------------------------------------------------------------
--
-- ⚠️ Drop en opnieuw, want een CHECK is niet te wijzigen. Idempotent doordat de
--    drop `if exists` is; draait deze migratie twee keer, dan staat er daarna
--    dezelfde constraint.

alter table public.notifications_sent
  drop constraint if exists notifications_sent_kind_bekend;

alter table public.notifications_sent
  add constraint notifications_sent_kind_bekend check (
    kind in ('nudge', 'approval_request', 'approval_received', 'cycle_summary',
             'commitment_witness')
  );

-- ---------------------------------------------------------------------------
-- 2. Waar de job zijn vraag stelt
-- ---------------------------------------------------------------------------
--
-- ⚠️ **SECURITY DEFINER met de gebruiker als parameter, en dat is geen
--    gemakzucht.** Dezelfde reden als bij `te_beoordelen_voor()` (0054): de job
--    draait als `service_role`, en een INVOKER-functie zou daar élke
--    verschuldigde straf in het hele project teruggeven. Een melding daarop
--    baseren betekent iemand vertellen over de straf van een wildvreemde. De
--    autorisatiegrens hoort dus ín de functie.
--
-- ⚠️ **`authenticated` mag hem niet uitvoeren.** Hij toetst zijn aanroeper niet
--    — hij kán dat niet, want hij krijgt de gebruiker als argument — en dan is
--    de enige veilige stand: alleen `service_role`. Zie 0167, tak 4 van
--    `definer_bewaking()`. Onwrikbare regel 4: de revoke noemt `authenticated`
--    met zoveel woorden.
--
-- ⚠️ **Geen tijdvenster, wél een anti-join en een dagplafond.** De ontdubbeling
--    loopt op `ref_id` — het commitment-id — en die is blijvend, dus een venster
--    zou alleen meldingen kunnen laten wégvallen als de job een ronde overslaat.
--
-- ⚠️⚠️ **De eerste versie had de anti-join niet, en dat was geen detail.** Er
--    stond alleen `limit 50`, met in deze kop de zin *"zelfde vorm als
--    `te_beoordelen_voor()`"*. Dat was onwaar: 0054 heeft wél een
--    `not exists (… completion_approvals …)`, en dáárdoor schuift het venster op.
--    Zonder die conjunct levert de functie elke ronde dezelfde vijftig oudste
--    rijen, slaat `alVerstuurd()` ze allemaal over, en **komt nummer 51 nooit
--    aan**.
--
--    En dat is permanent en niet tijdelijk. 📏 Gemeten: geen enkele functie in
--    `public` zet `status = 'resolved'` — `wikkel_commitments_af()` raakt alleen
--    `set`, en `commitments_update` heeft `using (status = 'set' …)`, dus geen
--    client kan een `due` verplaatsen. Een straf die eenmaal verschuldigd is,
--    blijft dat, en het venster zou dus voor altijd vastzitten. Gevonden in de
--    security-review van 07-09-2026, en nagemeten voordat hij verwerkt werd.
--
-- ⚠️ **Het dagplafond is onwrikbare regel 5 en geen zuinigheid.** Deze wijziging
--    tilt een leesoppervlak naar een pushkanaal, en dan telt wie er hoeveel van
--    kan sturen. 📏 Gemeten: er is een dagquotum op groepen, toetredingen,
--    AI-jobs en weekdoelen, maar **niet op `goals`** — `goals_insert` telt niet
--    en geen van de drie triggers op die tabel telt. Eén groepsgenoot kan dus
--    vijftig doelen aanmaken met elk één straf (`commitments_een_open_per_soort`
--    is per doel) en de dag erna vijftig meldingen op andermans vergrendelscherm
--    laten landen. De ontvanger kan de getuigenrol niet weigeren
--    (`bewaak_begunstigde()` verbiedt het leeghalen), heeft geen opt-out per
--    soort, en kan alleen álle meldingen uitzetten.
--
--    Vijf per etmaal per ontvanger. Een echte getuige van meer dan een handvol
--    verstreken straffen op één dag ís het misbruikpatroon; een legitieme
--    achterstand druppelt eruit, want de anti-join laat het venster nu opschuiven.
--
-- ⚠️ **En het lidmaatschap wordt getoetst, net als in 0054.** De grond onder deze
--    melding is *"de eigenaar heeft deze persoon zélf aangewezen"*, en die
--    aanwijzing kon alleen omdat er een groepsband was (`commitments_insert`
--    eist `shares_group_with_user`). Verdwijnt die band, dan verdwijnt de grond.
--    Voor een nieuw oppervlak is beschermd het antwoord tot iemand het tegendeel
--    besluit.
--
--    ⚠️ `getuigenissen()` (0169) toetst dit **niet**, dus wie de groep verlaat
--    ziet zijn getuigenis nog wél als hij de app opent. Dat is bewust niet in
--    deze ronde meegenomen — het is het oppervlak van QS8-292 en niet van dit
--    issue — en het staat als QS8-306. De richting klopt wel: niet duwen is
--    minder dan niet tonen, dus de kant die hier gekozen is, is de veilige.

create or replace function public.getuigenissen_voor(p_user_id uuid)
returns table(commitment_id uuid, eigenaar_naam text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, p.display_name
  from commitments c
  join goals    g on g.id = c.goal_id
  join profiles p on p.id = g.owner_id
  where c.beneficiary_user_id = p_user_id
    -- ⚠️ De grens van domeinregel 11 en van `commitment_zichtbaar_voor_persoon()`.
    --    Een straf die nog niet verschuldigd is, bestaat voor de getuige niet.
    and c.status = 'due'
    -- ⚠️ Nooit jezelf. `bewaak_begunstigde()` (0168) laat zo'n rij niet ontstaan,
    --    ook niet als `service_role` — maar een melding sturen over je eigen straf
    --    is een andere fout dan een rij die niet had mogen bestaan, en deze regel
    --    kost niets. De opstelling die hem ijkt staat in
    --    `tests/rls/getuigemelding.test.ts` en zet die trigger even uit.
    and g.owner_id <> p_user_id
    -- ⚠️ De groepsband die de aanwijzing droeg, moet er nog zijn — dezelfde band
    --    die `commitments_insert` bij het aanmaken eiste, en verder niets.
    --
    --    ⚠️⚠️ **De eerste versie eiste méér dan dat en was daarmee fout.** Die
    --    keek naar `goal_group_links` — of het dóél aan een gedeelde groep hangt
    --    — omdat `te_beoordelen_voor()` (0054) dat doet. Maar dáár slaat het op
    --    de voltooiing die de groep beoordeelt; hier is de invariant
    --    `shares_group_with_user(beneficiary_user_id)`, en die eist alleen dat
    --    eigenaar en getuige één groep delen. Een doel hóéft aan geen enkele
    --    groep te hangen. De testopstelling viel er meteen over, en dat was
    --    terecht: de conjunct sloot een geldige getuigenis uit.
    --
    --    De statusgrens is `<> 'inactive'` en niet `= 'active'`, precies zoals
    --    `shares_group_with_user()` hem trekt: een lid met een adempauze
    --    (`paused`) is nog steeds een groepsgenoot.
    and exists (
      select 1
      from group_members eigenaar
      join group_members getuige on getuige.group_id = eigenaar.group_id
      where eigenaar.user_id  = g.owner_id
        and eigenaar.status  <> 'inactive'
        and getuige.user_id   = p_user_id
        and getuige.status   <> 'inactive'
    )
    -- ⚠️ De anti-join. Zonder deze schuift het venster niet op en komt melding 51
    --    nooit aan; zie de kop hierboven.
    and not exists (
      select 1
      from notifications_sent n
      where n.user_id = p_user_id
        and n.kind    = 'commitment_witness'
        and n.ref_id  = c.id
    )
  order by c.confirmed_at, c.id
  -- ⚠️ Het dagplafond, en niet zomaar een limiet. `greatest(0, …)` want een
  --    negatieve `limit` is een fout en geen lege uitkomst.
  limit greatest(0, 5 - (
    select count(*)
    from notifications_sent n
    where n.user_id = p_user_id
      and n.kind    = 'commitment_witness'
      and n.sent_at > now() - interval '24 hours'
  ));
$$;

revoke execute on function public.getuigenissen_voor(uuid) from public, anon, authenticated;
grant  execute on function public.getuigenissen_voor(uuid) to service_role;

comment on function public.getuigenissen_voor(uuid) is
  'De verschuldigde straffen waarvan deze gebruiker de getuige is, voor de '
  'meldingenjob. Alleen `service_role`: de functie toetst haar aanroeper niet '
  'maar krijgt de gebruiker als argument. Zie 0174 en QS8-298.';
