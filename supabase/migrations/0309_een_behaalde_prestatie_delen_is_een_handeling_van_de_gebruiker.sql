-- 0309_een_behaalde_prestatie_delen_is_een_handeling_van_de_gebruiker.sql — een
-- behaalde prestatie delen in één groep naar eigen keuze: een nieuw type
-- systeembericht (`prestatie_gedeeld`), de RPC `deel_prestatie()`, en de tweede
-- benoemde uitzondering bij accountverwijdering (QS8-736).
--
-- ROLLBACK-PAD (in deze volgorde, in één transactie en met ON_ERROR_STOP):
--   1. `verwijder_mijn_account()` woordelijk terug uit **0247** (zonder het
--      tweede delete-blok en zonder de sleutel `prestatieberichten_gewist`).
--   2. drop function if exists public.deel_prestatie(uuid, text);
--      drop function if exists public.prestatie_delen_dagmax();
--      drop function if exists public.teamgroep_mag_prestatie_delen();
--      drop function if exists public.is_teamgroep(uuid);
--      drop function if exists public.prestatie_deelbaar(text);
--   3. drop index if exists public.chat_messages_prestatie_eenmaal;
--      alter table public.chat_messages drop constraint if exists chat_messages_prestatie_payload_is_een_sleutel;
--   4. de CHECK `chat_messages_system_event_bekend` opnieuw zonder
--      'prestatie_gedeeld' (lijst uit **0208**) — ⚠️ pas ná
--      `delete from chat_messages where system_event = 'prestatie_gedeeld'`,
--      anders weigert de CHECK zichzelf op de bestaande rijen.
--
--   ⚠️ **Wat niet terug te draaien is:** de berichten die `verwijder_mijn_account()`
--      al gewist heeft. Dat is het besluit zelf (grens 2 van de beslisbevoegdheid);
--      draai `pg_dump` vóór het toepassen, zoals altijd.
--
-- ⚠️ **Wacht op Quintens "backup gedaan"** (docs/PROMPT-SESSIE.md §12d): de
--    migratie bevat `grant`, `revoke`, een herdefinitie van een
--    wisfunctie en een nieuw groepszichtbaar oppervlak, en wordt dus niet door een
--    bouwsessie op productie gezet.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-722 en QS8-736, besluit van Quinten van 19-11-2026, in vijf rondes:
--
--   1. Delen is een handeling van de gebruiker, per prestatie, in één groep.
--      Er gaat niets automatisch en er is geen "deel met alle groepen".
--   2. Ook in teamgroepen op dezelfde manier (tegen het advies in) — maar pas
--      ná QS8-649, en alleen als dat besluit er ruimte voor maakt. Teamgroepen
--      bestaan nog niet in de code; dit bestand schrijft het delen voor elk
--      groepstype en zet het voor een teamgroep UIT (keuze 4).
--   3. Accountverwijdering: het prestatiebericht verdwijnt, als **tweede
--      benoemde uitzondering** naast QS8-335 (§5).
--   4. Limiet: 5 gedeelde prestaties per gebruiker per dag, de dag in de
--      tijdzone van de gebruiker (keuze 3).
--   5. Zichtbaarheid: alle leden van die groep, zoals elk systeembericht.
--
-- ---------------------------------------------------------------------------
-- Wat het bericht draagt, en wat niet (domeinregel 7)
-- ---------------------------------------------------------------------------
--
-- `subject_id` = de deler, `payload = {"badge": "<sleutel>"}`, `body` = een
-- generieke zin zonder naam. **Geen titel, notitie, niveau, XP of datum.** De
-- twee vragen van CLAUDE.md:
--
--   • Kan hieruit iemands gemiste week worden afgeleid? Nee. Het bericht bestaat
--     alleen als de gebruiker het zelf plaatst, en wie niets deelt zegt niets:
--     *"de badge die er níét staat, is het signaal"* (`badges.ts`) wordt hier
--     niet geschonden, want er is geen lijst van wat iemand NIET deelde.
--   • Kan iemand dat met één API-verzoek uitlezen buiten de UI om? Het bericht
--     is leesbaar voor wie `chat_messages_select` toelaat (leden van de groep),
--     en voor niemand anders. Er is geen kolom, view of RPC die de badges van
--     een ander toont: `badges_select` blijft `user_id = auth.uid()`.
--
-- ⚠️ **Een open groep verandert hier niets aan.** Dit bericht is geen tegenslag;
--    beschermd is het antwoord voor een nieuw oppervlak tot iemand het
--    tegendeel besluit, en hier is er niets om te verruimen. Rij 53 in
--    `docs/decisions/002-domeinregel7-oppervlakken.md`.
--
-- ---------------------------------------------------------------------------
-- Keuzes van de bouwsessie (geen besluit van Quinten nodig)
-- ---------------------------------------------------------------------------
--
-- 1. **Eén RPC en geen INSERT-policy.** `chat_messages_insert` eist
--    `type <> 'system'` en `system_event is null`; dat blijft zo. Een client kan
--    dus nooit zelf een `prestatie_gedeeld` schrijven: alleen `deel_prestatie()`
--    (security definer) doet dat, en die toetst ten opzichte van `badges` voor
--    `auth.uid()` — de server beslist of je de prestatie hebt (regel 3).
-- 2. **Dubbel delen is onmogelijk op twee manieren.** Een eerste toets in de
--    functie geeft een nette `already_shared`; de partiële unieke index
--    `chat_messages_prestatie_eenmaal` is het slot voor twee verzoeken die
--    elkaar kruisen. De RPC schrijft met `on conflict do nothing` en leest
--    `row_count`: `plaats_systeembericht()` slikt een fout in en zou een
--    dubbel verzoek stil laten verdwijnen, en dat is hier juist het antwoord
--    dat de gebruiker moet horen.
-- 3. **De dag is de dag van de gebruiker.** `eigenaarsdatum(uid)` is de
--    bestaande helper (`now() at time zone profiles.tz`); er is geen tweede
--    berekening (correctheidsregel 7). De limiet telt de berichten van vandaag
--    in die tijdzone, onder een advisory lock per gebruiker zodat twee
--    gelijktijdige verzoeken niet allebei onder de grens passeren.
-- 4. **Teamgroepen: geschreven, en uit.** `is_teamgroep()` is vandaag een stub
--    die `false` geeft (er is geen kolom die een groep van een organisatie
--    markeert) en `teamgroep_mag_prestatie_delen()` geeft `false`. De RPC
--    weigert met `team_off` zodra beide waar zijn. ⚠️ **Het gevaar is de
--    vergeten stub**: landt QS8-649 en wordt `is_teamgroep()` waar voor echte
--    groepen, dan staat het delen daar automatisch uit — de veilige kant. Het
--    aanzetten is een bewuste wijziging van één functie, en dat is precies
--    het besluit dat dit issue vraagt. De test zet de stub in een transactie
--    om en bewijst de bedrading.
-- 5. **Wie vertrokken is deelt niets**: `is_group_member()` is false voor een
--    uitgezet lid en voor een gearchiveerde groep, dus beide weigeren met
--    `not_member`.
--
-- ⚠️ **Realtime.** `chat_messages` staat al in de publicatie met
--    `relreplident = 'd'`; hier verandert dat niet. De uitzondering van §5
--    leunt op die waarde voor zijn DELETE (§5, zie 0247).

begin;

-- ---------------------------------------------------------------------------
-- 1. De allowlist (domeinregel 7, tweede slot)
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een nieuw type systeembericht vraagt een migratie**, en de kopie in
--    `src/modules/buddies/chat-schemas.ts` + de test erop gaan in dezelfde
--    wijziging mee. De lijst is die van 0208 plus één.
alter table public.chat_messages
  drop constraint if exists chat_messages_system_event_bekend;

alter table public.chat_messages
  add constraint chat_messages_system_event_bekend
  check (
    system_event is null
    or system_event = any (array[
      'chain_milestone', 'commitment_due', 'commitment_unlocked',
      'completion_approved', 'completion_pending', 'deadline_requested',
      'goal_completed', 'group_opened', 'group_protected', 'group_sleeping',
      'member_joined', 'milestone_done', 'season_recap', 'group_discoverable',
      'huddle_day_changed', 'prestatie_gedeeld'
    ])
  );

-- ---------------------------------------------------------------------------
-- 2. Het slot tegen dubbel delen
-- ---------------------------------------------------------------------------
--
-- Eén prestatie van één gebruiker in één groep is hoogstens één bericht.
-- `subject_id` voorop: dezelfde index dient de dagtelling in §4 (één gebruiker,
-- een handvol rijen) en vraagt geen tweede.
create unique index if not exists chat_messages_prestatie_eenmaal
  on public.chat_messages (subject_id, group_id, ((payload ->> 'badge')))
  where system_event = 'prestatie_gedeeld';

-- De payload van dit type is de badgesleutel en verder niets, en dat staat in de
-- database en niet alleen in de functie: de CHECK geldt ook voor `service_role`,
-- net als de allowlist. Geen NOT NULL op `subject_id`: `on delete set null` zou
-- dan de foreign-key-actie breken.
alter table public.chat_messages
  drop constraint if exists chat_messages_prestatie_payload_is_een_sleutel;

alter table public.chat_messages
  add constraint chat_messages_prestatie_payload_is_een_sleutel
  check (
    system_event is distinct from 'prestatie_gedeeld'
    -- ⚠️ `coalesce(..., false)`: een CHECK laat NULL door, en `payload is null` zou dan
    --    een geldig bericht zijn.
    or coalesce(
      payload = jsonb_build_object('badge', payload ->> 'badge')
      and (payload ->> 'badge') ~ '^[a-z0-9_]{1,40}$',
      false
    )
  );

-- ---------------------------------------------------------------------------
-- 3. De twee instelknoppen, de deelbaar-lijst en de teampoort
-- ---------------------------------------------------------------------------
create or replace function public.prestatie_delen_dagmax()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$ select 5 $$;

-- ⚠️ **De deelbaar-lijst is expliciet en staat hier, niet in `badges_bekend`.** Een
--    badge die later bij `badges` komt is daardoor níét vanzelf deelbaar: hij moet
--    eerst langs de twee vragen van domeinregel 7 en dan bewust in deze lijst.
--    `tests/rls/prestatie-delen.test.ts` legt deze lijst naast de TypeScript-kopie.
create or replace function public.prestatie_deelbaar(p_badge text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_badge = any (array[
    'first_goal', 'first_milestone', 'first_review', 'streak_4', 'streak_12'
  ])
$$;

create or replace function public.is_teamgroep(p_group_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select false $$;

create or replace function public.teamgroep_mag_prestatie_delen()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select false $$;

comment on function public.is_teamgroep(uuid) is
  'Stub (QS8-736): er is nog geen organisatie-kolom, dus altijd false. QS8-649 vervangt hem. '
  'Wordt hij waar voor een echte teamgroep, dan staat het delen van een prestatie daar uit '
  'tot teamgroep_mag_prestatie_delen() bewust true geeft.';

revoke all on function public.prestatie_delen_dagmax() from public, anon, authenticated;
revoke all on function public.prestatie_deelbaar(text) from public, anon, authenticated;
revoke all on function public.is_teamgroep(uuid) from public, anon, authenticated;
revoke all on function public.teamgroep_mag_prestatie_delen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. deel_prestatie()
-- ---------------------------------------------------------------------------
--
-- Antwoorden (`reason`): not_signed_in, not_earned, not_shareable, not_member, team_off,
-- already_shared, rate_limited. `ok: true` zonder reden bij succes.
--
-- ⚠️ **`not_earned` komt vóór `not_member`**: beide zeggen alleen iets over de
--    beller zelf. Er is geen antwoord dat iets over een ándere gebruiker of een
--    groep waar de beller niet in zit verraadt.
create or replace function public.deel_prestatie(p_group_id uuid, p_badge text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  mij        uuid := (select auth.uid());
  v_vandaag  date;
  v_aantal   integer;
  v_etmaal   integer;
  v_geplaatst integer;
begin
  if mij is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  if p_badge is null or not exists (
    select 1 from badges b where b.user_id = mij and b.badge = p_badge
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_earned');
  end if;

  if not public.prestatie_deelbaar(p_badge) then
    return jsonb_build_object('ok', false, 'reason', 'not_shareable');
  end if;

  if p_group_id is null or not public.is_group_member(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if public.is_teamgroep(p_group_id) and not public.teamgroep_mag_prestatie_delen() then
    return jsonb_build_object('ok', false, 'reason', 'team_off');
  end if;

  -- Serialiseer per gebruiker: zonder dit passeren twee gelijktijdige verzoeken
  -- allebei de telling hieronder.
  perform pg_advisory_xact_lock(hashtextextended('prestatie_delen:' || mij::text, 0));

  if exists (
    select 1 from chat_messages m
    where m.subject_id = mij
      and m.group_id = p_group_id
      and m.system_event = 'prestatie_gedeeld'
      and m.payload ->> 'badge' = p_badge
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_shared');
  end if;

  v_vandaag := public.eigenaarsdatum(mij);
  select count(*)::integer into v_aantal
  from chat_messages m
  join profiles p on p.id = mij
  where m.subject_id = mij
    and m.system_event = 'prestatie_gedeeld'
    and m.created_at > now() - interval '2 days'
    and (m.created_at at time zone p.tz)::date = v_vandaag;

  -- ⚠️ **Een vangnet dat niet van de tijdzone afhangt** (security-review): `profiles.tz` mag de
  --    gebruiker zelf wijzigen, dus wie vijf deelde en van zone wisselde kreeg een nieuwe "dag"
  --    (gemeten: rate_limited werd ok). De kalenderdag blijft de regel; daarnaast staan er in elke
  --    24 uur nooit meer dan twee keer het dagmaximum (een zonewissel verschuift een dag hooguit
  --    zo ver).
  select count(*)::integer into v_etmaal
  from chat_messages m
  where m.subject_id = mij
    and m.system_event = 'prestatie_gedeeld'
    and m.created_at > now() - interval '24 hours';

  if v_aantal >= public.prestatie_delen_dagmax()
     or v_etmaal >= 2 * public.prestatie_delen_dagmax() then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into chat_messages (group_id, sender_id, type, system_event, body, subject_id, payload)
  values (
    p_group_id, null, 'system', 'prestatie_gedeeld',
    'Een lid heeft een prestatie gedeeld.', mij,
    jsonb_build_object('badge', p_badge)
  )
  on conflict (subject_id, group_id, ((payload ->> 'badge')))
    where system_event = 'prestatie_gedeeld'
  do nothing;
  get diagnostics v_geplaatst = row_count;

  if v_geplaatst = 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_shared');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ⚠️ `authenticated` met zoveel woorden (regel 4): `from public, anon` houdt
--    precies de rol over waaronder iedere ingelogde gebruiker draait. Hier is dat
--    bedoeld, en dus staat er een expliciete grant.
revoke all on function public.deel_prestatie(uuid, text) from public, anon, authenticated;
grant execute on function public.deel_prestatie(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. verwijder_mijn_account() — de tweede benoemde uitzondering
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Het lichaam is dat van `main` (`pg_get_functiondef()`, 0247), niet van een
--    oude migratie** — een register in een functielichaam botst zonder
--    git-conflict. Er komt precies één blok bij; de rest is woordelijk 0247.
--
-- ⚠️ **Wat dit is, en wat niet.** Domeinregel 7: *een bericht is een
--    onveranderlijke kopie die de autorisatie overleeft waaronder hij gemaakt is.*
--    Die zin blijft gelden, behalve voor twee routes: QS8-335 (`commitment_due` en
--    `commitment_unlocked`) en deze — `prestatie_gedeeld`, waarvan de opzeggende
--    gebruiker het **onderwerp** is. Besluit van Quinten, 19-11-2026, vierde
--    ronde, op QS8-736. **Niet omdat er een naam achterblijft** (sinds 0213 bakt
--    geen bericht er nog een in; na verwijdering staat er "Een oud-lid"), maar
--    omdat Quinten koos wat een wisverzoek meeneemt. Een derde type kan zich er
--    niet op beroepen, en de eerste uitzondering blijft zoals ze is.

create or replace function public.verwijder_mijn_account()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  mij  uuid := auth.uid();
  solo record;
  v_berichten integer := 0;
  v_prestaties integer := 0;
begin
  if mij is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

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
$$;

-- Verlaat de transactie pas als alles er staat.
commit;
