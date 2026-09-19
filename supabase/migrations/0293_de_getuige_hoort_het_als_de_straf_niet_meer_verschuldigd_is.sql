-- 0293_de_getuige_hoort_het_als_de_straf_niet_meer_verschuldigd_is.sql — een
-- getuige die is ingelicht dat een straf verschuldigd werd, hoort het ook als
-- die weer terugvalt naar `set` (QS8-321).
--
-- ROLLBACK-PAD:
--   drop function if exists public.teruggedraaide_straffen_voor(uuid);
--   alter table public.notifications_sent drop constraint notifications_sent_kind_bekend;
--   alter table public.notifications_sent add constraint notifications_sent_kind_bekend
--     check (kind in ('nudge', 'approval_request', 'approval_received',
--                     'cycle_summary', 'commitment_witness'));
--   ⚠️ Staan er al rijen met `kind = 'commitment_reverted'`, dan weigert de CHECK
--   bij het terugzetten — terecht. Verwijder die rijen eerst, of laat de
--   verruiming staan: hij verplicht tot niets.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-321 vroeg of een straf stilzwijgend mag verdwijnen. Het issue stelde dat
-- de persoon-getuige bij het **aanwijzen** een melding krijgt en bij het
-- **intrekken** niets.
--
-- ⚠️⚠️ **Die stelling is onjuist, en dat is hier eerst nagemeten voordat er iets
--    gebouwd is.** 📏 Op stand 0292:
--
--   | moment | hoort de getuige iets | waarom |
--   |---|---|---|
--   | aangewezen (`set`) | **nee**, en hij kan de straf ook niet lezen | `commitment_zichtbaar_voor_persoon()` = `{due, resolved}` |
--   | verschuldigd (`due`) | **ja**, `commitment_witness` | `getuigenissen_voor()` heeft een gate op `c.status = 'due'` |
--   | ingetrokken | nee | `commitments_update` USING eist `status = 'set'` |
--
-- **Gevolg: een bericht bij intrekken kán niet zonder domeinregel 11 te
-- schenden.** Intrekken gebeurt per definitie vanuit `set`, en in die toestand
-- heeft de getuige nooit van de straf gehoord én mag hij er niet van weten —
-- *een straf die nog niet verschuldigd is, bestaat voor de getuige niet*. De
-- melding zou de eerste zijn die hij erover hoort.
--
-- Er is dus geen asymmetrie van de soort die het issue beschreef. De getuige
-- wordt precies één keer ingelicht, op het enige moment dat de regel toestaat.
--
-- ---------------------------------------------------------------------------
-- Wat er wél overbleef, en dat is smaller
-- ---------------------------------------------------------------------------
--
-- 📏 **Er is precies één functie die een straf van `due` terugzet naar `set`:**
-- `beslis_deadline_verzoek()`. Gebeurt dat, dan is de getuige wél ingelicht
-- geweest en verliest die kennis stil haar geldigheid — en daarna kan de straf
-- via de gewone intrekknop verdwijnen zonder dat er ooit iets rechtgezet is.
--
-- ⚠️⚠️ **Hier stond eerst "drie functies", mét een 📏 erbij, en dat was onwaar.**
--    De andere twee kwamen uit een zoekopdracht die een `where`-predicaat en een
--    commentaarregel niet van een `set`-clausule onderscheidde:
--    `maak_straffen_verschuldigd()` schrijft alleen `due` en noemt `'set'` in
--    zijn `where`, en `guard_group_member_update()` noemde het in een comment.
--    📏 Hermeten met `code_zonder_commentaar()` uit 0292: één regel in het hele
--    schema luidt `set status = 'set'`, en die staat in
--    `beslis_deadline_verzoek()`.
--
--    **Dat verschil is niet cosmetisch.** Met drie oorzaken leest deze melding
--    als vaag; met één is ze eenduidig — `commitment_reverted` zegt dan
--    onvermijdelijk *"er is een uitstelverzoek ingewilligd"*, ook al noemt de
--    tekst dat niet. Zie de rij van 19-09-2026 in `docs/ENGINEER-REVIEW.md`.
--
-- Rij 165 van `docs/ENGINEER-REVIEW.md` merkt die teruggang al op: *"vandaag is
-- de teruggang naar `set` stil, en dan is de groep het enige dat het verschil
-- zag."* De persoon-getuige zag het niet.
--
-- Besluit van Quinten (19-09-2026): melden op de teruggang, niet op het
-- intrekken. De getuige hoort het op het moment dat zijn kennis veroudert;
-- daarna staat de straf op `set`, en dát is de toestand die domeinregel 11
-- onzichtbaar houdt.
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Een zesde soort melding
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dezelfde vorm als 0178: de CHECK is een allowlist, dus een nieuw soort is
--    een migratie en geen configuratie.
alter table public.notifications_sent drop constraint if exists notifications_sent_kind_bekend;

alter table public.notifications_sent add constraint notifications_sent_kind_bekend
  check (kind in ('nudge', 'approval_request', 'approval_received',
                  'cycle_summary', 'commitment_witness', 'commitment_reverted'));

-- ---------------------------------------------------------------------------
-- 2. Wie er bericht hoort te krijgen
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De conjunct die dit hele bestand draagt is de `commitment_witness`-eis
--    hieronder, en niet de `reverted`-eis.** Zonder haar meldt deze functie een
--    teruggang aan iemand die van de heenweg nooit gehoord heeft — en dan is dit
--    precies de domeinregel 11-schending waar het oorspronkelijke voorstel op
--    strandde, alleen langs een andere route.
--
--    Het geval is echt en niet theoretisch: de rollover kan een straf
--    verschuldigd maken en `beslis_deadline_verzoek()` kan hem terugzetten
--    binnen hetzelfde venster waarin de notificatie-job nog niet gedraaid heeft.
--    Dan staat er een `reverted`-rij in het spoor terwijl er nooit een duw is
--    uitgegaan. **Je vertelt iemand alleen dat zijn kennis veroudert als hij die
--    kennis had.**
--
-- ⚠️ **Vorm overgenomen van `getuigenissen_voor()` (0178) en met opzet niet
--    gedeeld.** De twee verschillen in hun statusgrens (`due` tegenover `set`),
--    in hun soort, en in die extra conjunct; één functie met een vlag erin zou
--    de grens tussen "mag dit weten" en "mag dit niet weten" in een parameter
--    stoppen, en dat is precies het soort grens dat je niet aan een aanroeper
--    overlaat.
create or replace function public.teruggedraaide_straffen_voor(p_user_id uuid)
returns table(commitment_id uuid, eigenaar_naam text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select c.id, p.display_name
  from commitments c
  join goals    g on g.id = c.goal_id
  join profiles p on p.id = g.owner_id
  where c.beneficiary_user_id = p_user_id
    -- De straf staat nu niet meer verschuldigd. Alleen déze toestand is er een
    -- om over te berichten: `resolved` is afgewikkeld en `cancelled` valt onder
    -- de redenering in de kop.
    and c.status = 'set'
    -- ⚠️ De grendel. Alleen wie de heenweg gehoord heeft, hoort de terugweg.
    and exists (
      select 1
      from notifications_sent n
      where n.user_id = p_user_id
        and n.kind    = 'commitment_witness'
        and n.ref_id  = c.id
    )
    -- Er is werkelijk teruggedraaid, en dat leest hij uit het auditspoor en niet
    -- uit de huidige stand: `reverted` bestaat sinds QS8-308 juist omdat
    -- `due -> set` het tegenovergestelde van triggeren is.
    and exists (
      select 1
      from commitment_events e
      where e.commitment_id = c.id
        and e.event_type    = 'reverted'
    )
    -- ⚠️ Nooit jezelf — zelfde reden en zelfde vorm als in `getuigenissen_voor()`.
    and g.owner_id <> p_user_id
    -- ⚠️ De groepsband die de aanwijzing droeg, moet er nog zijn. Woordelijk
    --    dezelfde eis als `shares_group_with_user()` hem trekt: `<> 'inactive'`
    --    en niet `= 'active'`, want een lid met een adempauze is nog een
    --    groepsgenoot.
    and exists (
      select 1
      from group_members eigenaar
      join group_members getuige on getuige.group_id = eigenaar.group_id
      where eigenaar.user_id  = g.owner_id
        and eigenaar.status  <> 'inactive'
        and getuige.user_id   = p_user_id
        and getuige.status   <> 'inactive'
    )
    -- ⚠️⚠️ **En hij moet in een groep zitten waar dít doel aan hangt. Die eis
    --    staat hier ná de security-ronde en is een besluit van Quinten
    --    (19-09-2026), geen afronding.**
    --
    --    📏 Zonder haar bereikt deze melding iemand buiten de kring die QS8-370
    --    heeft afgebakend. End to end nagespeeld: alice zit in G1 (met bob) en
    --    G2 (met dave), haar doel hangt **alleen** aan G2, en haar getuige is
    --    **bob uit G1**. Dave willigt het uitstel in →
    --    `teruggedraaide_straffen_voor(bob)` gaf **1 rij**. Bob hoorde dus iets
    --    over een uitstel in een groep waar hij niet in zit.
    --
    --    Dat kan omdat `commitments_insert` alleen `shares_group_with_user()`
    --    eist: een getuige deelt één of andere groep met de eigenaar, niet per
    --    se de groep waar het doel aan hangt.
    --
    -- ⚠️⚠️ **Waarom dit ertoe doet, en dat hangt aan de gecorrigeerde meting
    --    hierboven:** er is maar één oorzaak van een teruggang, dus deze melding
    --    zegt onvermijdelijk *"er is een uitstelverzoek ingewilligd"*, hoe
    --    neutraal de woorden ook zijn. Met drie oorzaken leek ze vaag; met één
    --    is ze eenduidig. De bewoording beschermt niets als de gevolgtrekking
    --    maar één kant op kan.
    --
    -- ⚠️ **Dit is nog steeds een verruiming van QS8-370 en niet een gelijkmaking.**
    --    Die verruiming gaat over de gevráágde groep; hier mag óók een lid van
    --    een andere gekoppelde groep het horen. Besluit van Quinten, en het
    --    staat als eigen rij in `docs/decisions/002-domeinregel7-oppervlakken.md`.
    and exists (
      select 1
      from goal_group_links l
      join group_members m on m.group_id = l.group_id
      where l.goal_id  = g.id
        and m.user_id  = p_user_id
        and m.status  <> 'inactive'
    )
    -- ⚠️ De anti-join, zonder welke het venster niet opschuift.
    --
    --    ⚠️⚠️ **Hij maakt de melding ook eenmalig per straf, en dat is een
    --    gemeten grens en geen keuze van vandaag.** `notifications_sent_per_onderwerp`
    --    is uniek op `(user_id, kind, ref_id)`, dus een straf die twee keer
    --    heen en weer gaat, meldt één keer. Dat geldt net zo goed voor
    --    `commitment_witness` zelf sinds 0178 — de tweede keer verschuldigd
    --    worden is daar ook stil. Die eigenschap is hier overgenomen en niet
    --    opgelost; hem doorbreken vraagt een andere sleutel dan `ref_id` en
    --    raakt beide soorten.
    and not exists (
      select 1
      from notifications_sent n
      where n.user_id = p_user_id
        and n.kind    = 'commitment_reverted'
        and n.ref_id  = c.id
    )
  order by c.confirmed_at, c.id
  -- Hetzelfde dagplafond als bij `getuigenissen_voor()`, en `greatest(0, …)` om
  -- dezelfde reden: een negatieve `limit` is een fout en geen lege uitkomst.
  limit greatest(0, 5 - (
    select count(*)
    from notifications_sent n
    where n.user_id = p_user_id
      and n.kind    = 'commitment_reverted'
      and n.sent_at > now() - interval '24 hours'
  ));
$$;

comment on function public.teruggedraaide_straffen_voor(uuid) is
  'Straffen waarvan deze persoon getuige is, die niet meer verschuldigd zijn, en '
  'waarover hij eerder wél een commitment_witness-melding kreeg. Die laatste eis '
  'is de grendel: zonder haar onthult deze functie een `set`-straf aan iemand '
  'voor wie die per domeinregel 11 niet bestaat (QS8-321).';

revoke execute on function public.teruggedraaide_straffen_voor(uuid) from public, anon, authenticated;

commit;
