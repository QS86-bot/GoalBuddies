-- 0303_de_uiterlijkvoorkeur_hoort_bij_een_gebruiker_en_niemand_anders_leest_hem.sql
-- — `gebruikersvoorkeuren`: één rij per gebruiker met de uiterlijkvoorkeur
-- (stijl, kleurvariant, weergave, dichtheid, emoji), eigenaar-only (QS8-729).
--
-- ROLLBACK-PAD:
--   drop trigger if exists gebruikersvoorkeuren_tijd on public.gebruikersvoorkeuren;
--   drop function if exists public.zet_voorkeur_tijd();
--   drop table if exists public.gebruikersvoorkeuren;
--
-- ⚠️ De tabel is nieuw en dus leeg; `drop table` valt hier niet onder grens 2
--    van de beslisbevoegdheid. Wordt dit teruggedraaid nádat er voorkeuren in
--    staan, dan is dat een andere handeling met een `pg_dump` ervoor — en wat
--    er dan verloren gaat is een kleurkeuze, geen geschiedenis.
--
-- ⚠️ **Wacht op Quintens "backup gedaan"** (docs/PROMPT-SESSIE.md §12d): deze
--    migratie bevat `grant`, `revoke` en `policy`, en wordt dus niet door een
--    bouwsessie op productie gezet.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-722 en QS8-729, besluit van Quinten van 19-11-2026: de voorkeur volgt het
-- account en niet het apparaat, en staat in een **aparte tabel** en niet op
-- `profiles`. 📏 Nagemeten in het schema: `profiles_select` laat een lid van een
-- gedeelde groep andermans rij lezen, en alleen de kolomgrant van 0089 houdt dat
-- bij `id`, `display_name` en `avatar_url`. RLS kan geen kolommen beperken; een
-- voorkeurskolom op `profiles` is veilig zolang niemand hem in die grant zet,
-- en dat is precies het soort veiligheid dat stil verdwijnt. Een aparte tabel
-- heeft die afhankelijkheid niet: er is geen groepstak, dus er valt niets te
-- vergeten.
--
-- ---------------------------------------------------------------------------
-- Wat hier met opzet níet staat
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Geen enkele groepstak, ook niet "alvast een beetje".** Domeinregel 7:
--    de voorkeur is nooit zichtbaar voor een ander, ook niet in een open groep.
--    Een kleurkeuze is geen tegenslag, maar "nooit" is hier een eigenschap van
--    de tabel en geen oordeel per kolom.
--
-- ⚠️ **Geen realtime.** De tabel komt niet in de publicatie en krijgt geen
--    `REPLICA IDENTITY FULL` (Supabase past RLS niet toe op DELETE).
--    `realtime_bewaking()` (0027) maakt dat toetsbaar.
--
-- ⚠️ **Geen DELETE-grant, wel een DELETE-policy.** Zelfde keuze als 0281 bij
--    `hero_profiles`: een grant zonder aanroeper is dood hout, en met een
--    DELETE ernaast is "bewerken" weghalen en opnieuw invoegen — `bijgewerkt_op`
--    zou dan nooit het moment van de wijziging zijn. De policy blijft staan
--    omdat een ontbrekende policy geen dichte deur is maar een ongestelde vraag
--    (onwrikbare regel 1); komt er ooit een knop "standaardwaarden herstellen"
--    die de rij wist, dan is één `grant delete` genoeg. Je rij verdwijnt wél
--    met je account: `on delete cascade` op `profiles`.
--
-- ⚠️ **Geen RPC.** Een rechtstreeks schrijven op de eigen rij (insert of voorwaardelijke update, geen upsert) is hier even veilig
--    als een functie en heeft één definer-functie minder (elke definer-functie
--    is een kopie van de vorige, en elke kopie erft `authenticated` als hij de
--    revoke vergeet). Wat een RPC zou toevoegen — de plek waar de database het
--    tijdstip zet — doet de trigger hieronder.
--
-- ---------------------------------------------------------------------------
-- 1. gebruikersvoorkeuren
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`user_id` is de primaire sleutel en niet een gewone kolom.** Eén rij per
--    gebruiker is een eigenschap van het model; als PK is hij afgedwongen én
--    levert hij de index op de foreign key gratis (onwrikbare regel 11).
--
-- ⚠️ **Geen rij is ook een stand.** Een bestaande gebruiker heeft hier geen rij
--    en krijgt er geen: de app leest dan zijn lokale keuze (`goalbuddies.thema`)
--    en schrijft pas bij een keuze. Een nieuwe gebruiker krijgt dus ook geen
--    rij; de standaard (b, donker) staat in de kolomdefaults én in de client,
--    en `tests/rls/gebruikersvoorkeuren.test.ts` legt ze naast elkaar.
--
-- ⚠️ **De allowlists zijn een kopie van `src/modules/uiterlijk` en geen bron.**
--    Zelfde vorm als `hero_key` (0264) en `chat_messages_system_event_bekend`:
--    de module bezit de lijst, de database dwingt hem af, en de test legt ze in
--    béide richtingen naast elkaar. Een nieuwe variant vraagt dus eerst een
--    migratie; een onbekende waarde faalt dicht.
create table if not exists public.gebruikersvoorkeuren (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  stijl        text        not null default 'b',
  kleurvariant text        not null default 'geen',
  weergave     text        not null default 'donker',
  dichtheid    text        not null default 'ruim',
  emoji        boolean     not null default true,
  bijgewerkt_op timestamptz not null default now(),

  constraint gebruikersvoorkeuren_stijl_bekend
    check (stijl in ('a', 'b', 'c')),
  constraint gebruikersvoorkeuren_kleurvariant_bekend
    check (kleurvariant in ('geen', 'baai', 'avondgloed', 'bosrand', 'pruim', 'koraal')),
  constraint gebruikersvoorkeuren_weergave_bekend
    check (weergave in ('donker', 'licht', 'systeem')),
  constraint gebruikersvoorkeuren_dichtheid_bekend
    check (dichtheid in ('ruim', 'compact')),

  -- ⚠️ Een kleurvariant hoort bij uiterlijk C en bij niets anders: 'geen' dan
  --    en slechts dan als de stijl niet C is. Zonder deze regel kan een rij
  --    "B met koraal" zeggen en moet elke lezer raden welke helft geldt. Dat
  --    is een aanname van de bouwsessie (het issue noemt alleen "geen variant"
  --    als standaard); de client normaliseert vóór het schrijven.
  constraint gebruikersvoorkeuren_variant_hoort_bij_c
    check ((stijl = 'c') = (kleurvariant <> 'geen'))
);

alter table public.gebruikersvoorkeuren enable row level security;

drop policy if exists gebruikersvoorkeuren_select on public.gebruikersvoorkeuren;
create policy gebruikersvoorkeuren_select on public.gebruikersvoorkeuren
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists gebruikersvoorkeuren_insert on public.gebruikersvoorkeuren;
create policy gebruikersvoorkeuren_insert on public.gebruikersvoorkeuren
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ⚠️ `user_id` staat in geen enkele `grant update`, en deze `with check` sluit
--    de weg er alsnog omheen.
drop policy if exists gebruikersvoorkeuren_update on public.gebruikersvoorkeuren;
create policy gebruikersvoorkeuren_update on public.gebruikersvoorkeuren
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists gebruikersvoorkeuren_delete on public.gebruikersvoorkeuren;
create policy gebruikersvoorkeuren_delete on public.gebruikersvoorkeuren
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ⚠️ **`from public, anon, authenticated` en niet `from public, anon`.** Zie
--    docs/decisions/2026-08-28-revoke-from-public-is-niet-van-iedereen.md.
revoke all on table public.gebruikersvoorkeuren from public, anon, authenticated;
grant select on table public.gebruikersvoorkeuren to authenticated;
grant insert (user_id, stijl, kleurvariant, weergave, dichtheid, emoji)
  on table public.gebruikersvoorkeuren to authenticated;
grant update (stijl, kleurvariant, weergave, dichtheid, emoji)
  on table public.gebruikersvoorkeuren to authenticated;
-- ⚠️ Geen `grant delete`: zie de toelichting bovenaan.

-- ---------------------------------------------------------------------------
-- 2. De database bepaalt wat nieuwer is, niet de client
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten (19-11-2026): bij twee apparaten wint de laatste keuze,
-- en een server-side `bijgewerkt_op` bepaalt wat nieuwer is. `bijgewerkt_op`
-- staat in geen enkele schrijfgrant, en deze trigger zet hem bij elke
-- INSERT én UPDATE — een klokfout op een telefoon kan dus nooit een oudere
-- keuze nieuwer maken dan een keuze van een ander apparaat.
create or replace function public.zet_voorkeur_tijd() returns trigger
  language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  -- clock_timestamp() en niet now(): twee schrijfacties in één transactie krijgen
  -- zo toch een verschillende tijd (security-review QS8-729).
  new.bijgewerkt_op := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.zet_voorkeur_tijd() from public, anon, authenticated;

drop trigger if exists gebruikersvoorkeuren_tijd on public.gebruikersvoorkeuren;
create trigger gebruikersvoorkeuren_tijd
  before insert or update on public.gebruikersvoorkeuren
  for each row execute function public.zet_voorkeur_tijd();
