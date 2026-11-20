-- 0322_de_laatste_beheerder_sluit_de_deur.sql — verdwijnt de laatste actieve
-- beheerder van een organisatie, dan trekt de database de uitnodigcode in; en
-- accountverwijdering archiveert geen teamgroep meer (QS8-659, epic QS8-650).
--
-- ROLLBACK-PAD:
--   drop trigger if exists organization_members_beheerder_weg_delete on public.organization_members;
--   drop trigger if exists organization_members_beheerder_weg_update on public.organization_members;
--   drop function if exists public.trek_organisatiecode_in_zonder_beheerder();
--   -- en `verwijder_mijn_account()` terug uit 0309_een_behaalde_prestatie_delen_is_een_handeling_van_de_gebruiker.sql
--   -- (bij het hernummeren op 20-11-2026 was dat 0247; 0309 kwam er op main tussen).
--   -- ⚠️ De backfill onderaan zet `invite_revoked` op true; terugdraaien kan
--   --    alleen met de `pg_dump` van vóór de migratie. Op het moment van
--   --    schrijven staan de organisatiemigraties (0316 e.v.) nog niet op productie, dus hij raakt niets.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten in de security-ronde op QS8-695 en zelf nagemeten: A treedt
--    terug, B (de laatste beheerder) verwijdert zijn account → **0** beheerders,
--    en de uitnodigcode blijft werken. Niemand kan hem dan nog intrekken; wie
--    hem heeft komt binnen en ziet de ledenlijst. Dat kon al zodra de enige
--    beheerder zijn account verwijderde: `organization_members.user_id` is
--    `on delete cascade` (0316).
--
-- **Besluit van Quinten, 18-11-2026** (reactie op QS8-659): verdwijnt de
-- laatste beheerder, dan trekt de database de code in. Niemand krijgt
-- automatisch een rol, en het wisrecht blijft onverkort. De keuzes staan in
-- `docs/decisions/2026-11-18-de-laatste-beheerder-sluit-de-deur.md`.
--
-- ---------------------------------------------------------------------------
-- 1. De trigger: op statementniveau, en waarom
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Een trigger op `organization_members` en geen regel in
--    `verwijder_mijn_account()`.** Zo vangt hij elke route waarlangs een
--    beheerder verdwijnt: de cascade vanuit `profiles`, `verlaat_organisatie()`,
--    en een latere route die een rol verlaagt (QS8-695). Een regel in één RPC
--    vergeet de volgende.
--
-- ⚠️⚠️ **Statementniveau met een transition table, en niet per rij.** Een
--    rijtrigger vergrendelt de organisaties in de volgorde waarin de cascade
--    de rijen toevallig weghaalt. Twee beheerders die tegelijk hun account
--    verwijderen en samen in twee organisaties zitten, kúnnen dan in een
--    deadlock (40P01) lopen — en dan faalt het wisrecht. Hier staan alle rijen
--    van één statement in `oud`, en wordt er vergrendeld op volgorde van id: de
--    volgorde van `verlaat_organisatie()` (eerst de organisatierij). ⚠️ Voor
--    accountverwijdering gold dat pas nadat `verwijder_mijn_account()` zelf de
--    organisaties als eerste vergrendelt (sectie 2): de cascade lockt anders al
--    een teamgroep vóór deze trigger draait (K1).
--
--    ⚠️ **Dat is een redenering en geen meting.** 📏 Een rijvariant van deze
--    trigger bleef groen in de race van `tests/rls/teamvertrek.test.ts` (twee
--    beheerders, twee gedeelde organisaties): de cascade haalde de rijen in
--    beide sessies toevallig in dezelfde volgorde weg. De statementvorm is
--    hier gekozen omdat hij de volgorde afdwingt in plaats van hem te
--    veronderstellen; geen toets onderscheidt de twee vandaag.
--
-- ⚠️ **Hij hoort nooit te gooien**, want een fout erin draait de
--    accountverwijdering terug — precies het wisrecht dat besluit 2 onverkort
--    wil. ⚠️⚠️ **Maar dat is een doel en geen garantie** (security-ronde, M1):
--    een UPDATE toetst álle CHECKs van de rij opnieuw, ook die op de naam. 📏
--    Gemeten met een strengere naam-CHECK `not valid`: de laatste beheerder kon
--    zijn account niet meer verwijderen. Dezelfde val zit al in de
--    `created_by`-set-null van 0316. Een naamregel aanscherpen zonder de
--    bestaande namen mee te nemen, breekt dus het wisrecht. Bewust géén
--    `exception when others`: dan bleef de code stil open bij nul beheerders.
--
-- ⚠️ `for no key update` en niet `for update` (security-ronde, M2): zo botst
--    hij niet met de FK-locks van gewone schrijvers (een nieuw lid, een nieuw
--    team), en wél met de `for update` van `verlaat_organisatie()`, zodat de
--    serialisatie blijft.
--
-- ⚠️ **Na de lock opnieuw tellen** (READ COMMITTED: een volatile functie leest
--    per statement een verse snapshot). Verwijderen twee beheerders tegelijk
--    hun account, dan ziet de tweede ná de commit van de eerste dat er niemand
--    meer is, en trekt hij de code in.

create or replace function public.trek_organisatiecode_in_zonder_beheerder()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1
    from organizations o
   where o.id in (select organization_id from oud where role = 'admin' and status = 'active')
   order by o.id
     for no key update;

  update organizations o
     set invite_revoked = true
   where o.id in (select organization_id from oud where role = 'admin' and status = 'active')
     and not o.invite_revoked
     and not exists (
       select 1 from organization_members m
        where m.organization_id = o.id and m.role = 'admin' and m.status = 'active'
     );

  return null;
end;
$$;
comment on function public.trek_organisatiecode_in_zonder_beheerder() is
  'Statementtrigger op organization_members: verdwijnt de laatste actieve '
  'beheerder van een organisatie (delete, vertrek of een lagere rol), dan wordt '
  'de uitnodigcode ingetrokken. Lockt op volgorde van id en gooit nooit — '
  'QS8-659, besluit van Quinten 18-11-2026.';
revoke all on function public.trek_organisatiecode_in_zonder_beheerder() from public, anon, authenticated;

-- Twee triggers, want een trigger met een transition table mag maar één
-- gebeurtenis dragen.
drop trigger if exists organization_members_beheerder_weg_delete on public.organization_members;
create trigger organization_members_beheerder_weg_delete
  after delete on public.organization_members
  referencing old table as oud
  for each statement execute function public.trek_organisatiecode_in_zonder_beheerder();

drop trigger if exists organization_members_beheerder_weg_update on public.organization_members;
create trigger organization_members_beheerder_weg_update
  after update on public.organization_members
  referencing old table as oud
  for each statement execute function public.trek_organisatiecode_in_zonder_beheerder();

-- ---------------------------------------------------------------------------
-- 2. Accountverwijdering archiveert geen teamgroep meer
-- ---------------------------------------------------------------------------
--
-- 📏 De lus over solo-groepen in `verwijder_mijn_account()` (0247) archiveerde
--    óók een teamgroep waarvan een organisatiebeheerder het enige actieve lid
--    was: `archiveer_groep()` laat hem door via `is_teambeheerder()` (0317).
--    Een gearchiveerd team kan daarna niemand heropenen (QS8-653, L1).
--
-- ⚠️ **Het lichaam is woordelijk `pg_get_functiondef()` van de gedeployde
--    versie (0247), op één voorwaarde na:** `g.organization_id is null` in de
--    solo-lus. ⚠️ **Plus, sinds het hernummeren (20-11-2026), het blok van 0309**
--    (QS8-736: het `prestatie_gedeeld`-bericht gaat mee bij accountverwijdering).
--    0309 kwam op main na de basis van deze tak; zonder dat blok zette deze
--    migratie die uitzondering stil terug. Verder verandert er niets aan wat er gewist wordt — het wisrecht
--    volgt onverkort.

CREATE OR REPLACE FUNCTION public.verwijder_mijn_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  mij  uuid := auth.uid();
  solo record;
  v_berichten integer := 0;
  v_prestaties integer := 0;
begin
  if mij is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  -- ⚠️⚠️ QS8-659 (security-ronde, K1): **eerst de organisaties, dan pas de
  --    rest.** De cascade hieronder lockt een teamgroep (`groups.created_by`
  --    set null) vóór de statementtrigger van 0322 de organisatierij vraagt;
  --    `verlaat_organisatie()` en `zet_organisatielid_uit()` doen het andersom
  --    (organisatie, dan via de vertrek-trigger van 0317 de teamgroep). 📏 Met
  --    drie sessies gemeten: 40P01, en de accountverwijdering viel om. Door de
  --    organisaties hier als eerste te nemen, op volgorde van id, is de volgorde
  --    overal organisatie → groep. Ook de organisaties die hij aanmaakte
  --    (`organizations.created_by` set null, 0316): daar zat dezelfde inversie.
  perform 1
    from organizations o
   where o.created_by = mij
      or o.id in (select m.organization_id from organization_members m
                   where m.user_id = mij and m.role = 'admin' and m.status = 'active')
   order by o.id
     for no key update;

  -- ⚠️ Laatste beheerder van een groep met andere leden? Dan eerst het
  --    beheerderschap overdragen. Zonder deze regel blijft er een groep achter
  --    die niemand meer kan beheren: de code niet roteren, geen lid uitzetten,
  --    de groep niet opheffen. Dat is geen verwijdering maar een wrak.
  if exists (
    select 1
    from group_members mijn
    where mijn.user_id = mij
      and mijn.role    = 'admin'
      and mijn.status <> 'inactive'
      and exists (
        select 1 from group_members ander
        where ander.group_id = mijn.group_id
          and ander.user_id <> mij
          and ander.status <> 'inactive'
      )
      and not exists (
        select 1 from group_members mede
        where mede.group_id = mijn.group_id
          and mede.user_id <> mij
          and mede.role     = 'admin'
          and mede.status  <> 'inactive'
      )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'last_admin');
  end if;

  -- ⚠️ Sinds 0102: de groepen waarvan ik het énige actieve lid ben, gaan mee het
  --    archief in. Anders blijft er een `active` groep staan met nul leden en een
  --    werkende uitnodigingscode, en loopt een wildvreemde er als enig,
  --    niet-beherend lid binnen.
  --
  -- ⚠️ **Via `archiveer_groep()` en niet met een eigen schrijfopdracht op de
  --    groepstabel**, om dezelfde reden als in `verlaat_groep()` §6b:
  --    `groups.status` is een gepinde kolom, en `npm run pin:controle` maakte de
  --    eerste versie hiervan terecht rood.
  --
  -- ⚠️ Dit werkt alleen vóór de delete: `archiveer_groep()` eist een actieve
  --    beheerder, en dat ben ik in mijn eigen solo-groep nog.
  for solo in
    select g.id
    from groups g
    where g.status <> 'archived'
      -- ⚠️ QS8-659 (A1): een teamgroep is van de organisatie en niet van
      --    degene die er toevallig als laatste in zit. Een buitenstaander kan er
      --    niet in (de teamlid-trigger van 0317), dus de reden van 0102 om een
      --    lege groep dicht te zetten geldt hier niet — en gearchiveerd kan
      --    niemand een team heropenen (QS8-653, L1).
      and g.organization_id is null
      and exists (
        select 1 from group_members m
        where m.group_id = g.id and m.user_id = mij and m.status <> 'inactive'
      )
      and not exists (
        select 1 from group_members m
        where m.group_id = g.id and m.user_id <> mij and m.status <> 'inactive'
      )
  loop
    perform archiveer_groep(solo.id, true);
  end loop;

  -- ⚠️⚠️ **QS8-335, en zie de kop.** Dit blok is de enige plek in de codebase waar
  --    een systeembericht gewist wordt. Het staat vóór de delete omdat
  --    `chat_messages.subject_id` daarna `null` is — de foreign key staat op
  --    `set null` — en het bericht dan niet meer aan mij te koppelen valt. Ná de
  --    delete is dit blok een no-op, en dat is precies het gat dat het dicht.
  --
  --    De twee gebeurtenissen zijn de enige die `meld_commitment()` plaatst, en
  --    allebei zetten ze mij als `subject_id`. De grens is bewust smal: dit gaat
  --    over consequenties die ik zelf ben aangegaan, niet over alles wat er ooit
  --    over mij gezegd is.
  delete from chat_messages
   where subject_id = mij
     and type = 'system'
     and system_event in ('commitment_due', 'commitment_unlocked');
  get diagnostics v_berichten = row_count;

  -- ⚠️ Overgenomen uit 0309 bij het hernummeren (20-11-2026): deze tak is
  --    gebouwd op het lichaam van 0247, van vóór 0309, en zonder dit blok zette
  --    0322 de tweede uitzondering stil terug (registerdrift, QS8-358).
  -- ⚠️⚠️ **QS8-736, de tweede benoemde uitzondering — zie de kop van 0309.** Het
  --    prestatiebericht noemt de persoon en de prestatie en wordt alleen op een
  --    uitdrukkelijke handeling geplaatst; wie zijn account opzegt, neemt het mee.
  --    **Alleen dit ene type**, en een eigen statement met een eigen filter: de
  --    lijst hierboven is de grens van QS8-335 en wordt niet verruimd. Zelfde
  --    reden voor de volgorde: ná de delete is `subject_id` `null` en vindt dit
  --    blok niets meer.
  delete from chat_messages
   where subject_id = mij
     and system_event = 'prestatie_gedeeld';
  get diagnostics v_prestaties = row_count;

  delete from auth.users where id = mij;

  return jsonb_build_object(
    'ok', true,
    'systeemberichten_gewist', v_berichten,
    'prestatieberichten_gewist', v_prestaties
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Backfill: een organisatie die nu al zonder beheerder staat
-- ---------------------------------------------------------------------------
--
-- Idempotent. De organisatiemigraties (0316 e.v.) staan bij het schrijven nog niet op productie, dus dit
-- raakt vandaag geen rij.
update public.organizations o
   set invite_revoked = true
 where not o.invite_revoked
   and not exists (
     select 1 from public.organization_members m
      where m.organization_id = o.id and m.role = 'admin' and m.status = 'active'
   );
