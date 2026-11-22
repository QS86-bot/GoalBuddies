-- 0337_een_organisatie_aanmaken_vraagt_toelating.sql — QS8-776: `maak_organisatie()` weigert wie niet op de allowlist staat
--
-- ROLLBACK-PAD (de tabel is bij het landen leeg; staan er rijen in die Quinten met de hand heeft gezet, dan
-- gaan die verloren, en dat is grens 2: eerst `pg_dump`):
--   -- 1. `maak_organisatie(text)` terugzetten naar het lichaam uit 0316 (zonder het blok "Toelating").
--   -- 2. drop table if exists public.organisatie_aanmakers;
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-663 verbergt de knop "Organisatie aanmaken" achter `ORGANISATIE_AANMAKEN_ZICHTBAAR`
-- (`src/modules/organisaties/zichtbaarheid.ts`), op besluit van Quinten van 20-11-2026 (punt 3) en besluit 33:
-- zolang de juridische toets niet klaar is, kom je een organisatie alleen binnen met een uitnodiging of een code.
-- **Verborgen is niet afgeschermd.** 📏 `maak_organisatie()` (0316) heeft `grant execute … to authenticated` en
-- toetst niets behalve ingelogd zijn, naam, dagteller en plafond: elke ingelogde gebruiker kan via PostgREST een
-- organisatie aanmaken, en `/organisatie/nieuw` is met de hand te openen. Productie, alleen gelezen op 22-11-2026:
-- 0 organisaties, laatste migratie 0336.
--
-- **Besluit van Quinten, 22-11-2026 (QS8-776, via de orchestrator), op twee meerkeuzevragen:**
--   1. *Optie A:* een allowlist per persoon, `organisatie_aanmakers(user_id, toegevoegd_op, reden)`. RLS aan, geen
--      grant aan `anon` of `authenticated`, alleen te vullen door Quinten via SQL of `service_role`, en hij begint
--      leeg. Een weigering geeft `{ok:false, reason:'niet_toegelaten'}`, met een eigen zin in nl en en.
--   2. *"Nee, knop blijft verborgen":* `ORGANISATIE_AANMAKEN_ZICHTBAAR` blijft hard `false`, en `/organisatie/nieuw`
--      blijft de enige weg voor wie wél is toegelaten. Er komt geen RPC die de client vertelt of hij mag.
--
-- ⚠️ **De tabel begint leeg, dus na deze migratie kan niemand een organisatie aanmaken.** Dat is het besluit en
--    geen bijwerking. Iemand toelaten is één regel, als `postgres` of `service_role`:
--      insert into public.organisatie_aanmakers (user_id, reden) values ('<uuid>', '<waarom>');
--
-- ⚠️ **Vier policies die `false` zijn, en geen grant.** Zelfde vorm als `organization_role_events` (0318), en niet
--    die van `opslag_dagtellers` (0233, geen policy): regel 1 eist policies voor SELECT, INSERT, UPDATE én DELETE,
--    en `adviseurdrift:controle` is tegen productie geijkt op precies drie tabellen zonder policy. Zou
--    `authenticated` hier mogen schrijven, dan zet iedereen zichzelf op de lijst en is de afscherming een stap
--    langer maar niet dichter. Lezen mag ook niet: de lijst zegt wie er buiten de publieke route om toegang heeft,
--    en je eigen rij lezen is de "mag ik?"-RPC die Quinten afwees. `maak_organisatie()` is `security definer` en
--    leest hem als eigenaar; dat is de enige lezer.
--
-- ⚠️ **De toets staat vóór alles wat telt of lockt.** Een weigering raakt de dagteller `organisaties` niet en
--    neemt geen advisory lock: wie niet mag, verbruikt niets en hoort niets over naam of plafond. De volgorde van
--    de redenen is daarmee ook geen orakel: `niet_toegelaten` komt altijd eerst.
--
-- ⚠️ **Gekopieerd van de laatste definitie op main:** `maak_organisatie(text)` uit 0316 (geen latere herdefinitie,
--    gemeten met `grep -l 'function public.maak_organisatie' supabase/migrations/*.sql` op `bfeb5a0d`). Het enige
--    nieuwe is het blok "Toelating"; de rest is woordelijk.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De allowlist
-- ---------------------------------------------------------------------------

create table if not exists public.organisatie_aanmakers (
  -- De primaire sleutel is ook de index op de foreign key (regel 11). Een account dat verdwijnt, neemt zijn
  -- toelating mee: wisrecht, en een toelating hoort bij een persoon en niet bij een uuid.
  user_id       uuid        primary key references public.profiles(id) on delete cascade,
  toegevoegd_op timestamptz not null default now(),
  -- Waarom deze persoon erop staat: het auditspoor van een toelating die buiten de app om gegeven wordt.
  reden         text        not null check (char_length(reden) between 1 and 500)
);

comment on table public.organisatie_aanmakers is
  'Wie maak_organisatie() mag aanroepen zolang de juridische toets niet klaar is (QS8-776, besluit Quinten '
  '22-11-2026). Begint leeg. Alleen te vullen als postgres of service_role; vier policies false en geen grant '
  'voor anon en authenticated. De enige lezer is maak_organisatie() (security definer).';

alter table public.organisatie_aanmakers enable row level security;

revoke all on table public.organisatie_aanmakers from public, anon, authenticated;

drop policy if exists organisatie_aanmakers_select on public.organisatie_aanmakers;
create policy organisatie_aanmakers_select on public.organisatie_aanmakers
  for select to authenticated using (false);
drop policy if exists organisatie_aanmakers_insert on public.organisatie_aanmakers;
create policy organisatie_aanmakers_insert on public.organisatie_aanmakers
  for insert to authenticated with check (false);
drop policy if exists organisatie_aanmakers_update on public.organisatie_aanmakers;
create policy organisatie_aanmakers_update on public.organisatie_aanmakers
  for update to authenticated using (false) with check (false);
drop policy if exists organisatie_aanmakers_delete on public.organisatie_aanmakers;
create policy organisatie_aanmakers_delete on public.organisatie_aanmakers
  for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- 2. maak_organisatie() met de toelating ervoor
-- ---------------------------------------------------------------------------

create or replace function public.maak_organisatie(p_naam text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_naam  text;
  v_vorig text;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- Toelating (QS8-776, 0337): alleen wie op de allowlist staat. Vóór de lock en de dagteller, zodat een
  -- weigering niets verbruikt en niets over naam of plafond verraadt.
  if not exists (select 1 from organisatie_aanmakers a where a.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegelaten');
  end if;

  -- ⚠️ Eén aanroep per gebruiker tegelijk (security-ronde, L1): anders tellen
  --    N gelijktijdige aanroepen allemaal dezelfde stand onder het plafond.
  perform pg_advisory_xact_lock(hashtext('organisatielidmaatschap:' || v_uid::text));

  -- Grove bovengrens vóór de dure normalisatie (zelfde reden als 0287).
  if char_length(coalesce(p_naam, '')) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_naam');
  end if;

  -- Tot een vast punt, want `schone_naam()` is niet idempotent (0287).
  v_naam := coalesce(p_naam, '');
  for i in 1..5 loop
    v_vorig := v_naam;
    v_naam  := public.schone_naam(v_vorig);
    exit when v_naam = v_vorig;
  end loop;
  if char_length(v_naam) < 1 or char_length(v_naam) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_naam');
  end if;

  -- Dagteller (regel 5): drie nieuwe organisaties per persoon per etmaal.
  if public.dagteller_stand('organisaties', 'gebruiker', v_uid::text, interval '1 day') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  if (select count(*) from organization_members m
        join organizations o on o.id = m.organization_id
       where m.user_id = v_uid and m.status = 'active' and o.status = 'active') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'te_veel_organisaties');
  end if;

  for poging in 1..5 loop
    begin
      insert into organizations (name, created_by) values (v_naam, v_uid)
      returning id into v_id;
      exit;
    exception
      when unique_violation then null;  -- codebotsing: nieuwe default, opnieuw
      when check_violation then
        return jsonb_build_object('ok', false, 'reason', 'ongeldige_naam');
    end;
  end loop;
  if v_id is null then
    raise exception 'Geen vrije uitnodigcode na vijf pogingen';
  end if;

  insert into organization_members (organization_id, user_id, role, status)
  values (v_id, v_uid, 'admin', 'active');

  perform public.tel_dagteller('organisaties', 'gebruiker', v_uid::text, 3,
                               interval '1 day', 'nieuwe organisaties');

  return jsonb_build_object('ok', true, 'organization_id', v_id);
end;
$$;
comment on function public.maak_organisatie(text) is
  'Maakt een organisatie met de aanroeper als beheerder. Alleen voor wie in organisatie_aanmakers staat '
  '(QS8-776, 0337); anders {ok:false, reason:niet_toegelaten}. Geeft geen code terug; die komt uit '
  'organisatie_uitnodigcode(). Dagteller: 3 per etmaal — QS8-652.';
revoke all on function public.maak_organisatie(text) from public, anon, authenticated;
grant execute on function public.maak_organisatie(text) to authenticated;
