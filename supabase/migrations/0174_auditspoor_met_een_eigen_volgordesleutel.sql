-- 0174_auditspoor_met_een_eigen_volgordesleutel.sql — het auditspoor van een commitment had geen sleutel die twee gebeurtenissen uit één transactie uit elkaar houdt (QS8-303)
--
-- ROLLBACK-PAD:
--   drop index if exists public.commitment_events_volgorde_idx;
--   alter table public.commitment_events drop column if exists seq;
--   drop function if exists public.volgorde_bewaking();
--   drop function if exists public.volgorde_register();
--   plus de regels `volgorde_bewaking` uit BEWAAKT_BUITEN_DE_APP in
--   `scripts/dode-keten-controle.mjs` — anders wijst dat register naar een
--   functie die niet meer bestaat en wordt `keten:controle` rood zonder uitleg.
--   plus `create or replace` op de leesvolgorde in `src/modules/commitments/api.ts`
--   terug naar `created_at`.
--   ⚠️ De kolom draagt geen gegevens die ergens anders vandaan komen — hij is
--   afgeleid van de schrijfvolgorde. Een terugzet verliest dus de volgorde,
--   niet de gebeurtenissen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `tests/rls/epic9.test.ts` is op 06-09-2026 rood gegaan in `npm run poort`,
-- op twee gevallen, allebei met dezelfde vorm:
--
--   verwacht  ['confirmed', 'triggered', 'posted']
--   gekregen  ['confirmed', 'posted', 'triggered']
--
-- en groen bij een losse run van hetzélfde bestand op dezélfde database. Dat is
-- niet "een flake" maar een meting: de volgorde ligt niet vast.
--
-- ⚠️ **De oorzaak zit in de default en niet in de test.**
-- `commitment_events.created_at` had `now()` als default, en `now()` is in
-- Postgres gelijk aan `transaction_timestamp()` — constant binnen één
-- transactie. Gemeten:
--
--   begin;
--   create temp table t(a timestamptz default now(),
--                       b timestamptz default clock_timestamp());
--   insert into t default values; select pg_sleep(0.02); insert into t default values;
--   select count(distinct a) as nu, count(distinct b) as klok from t;
--   -- nu = 1, klok = 2
--
-- Aan één UPDATE op `commitments` hangen twee AFTER-triggers die allebei in
-- `commitment_events` schrijven — `commitments_audit` (`noteer_commitment`,
-- `triggered`) en `commitments_systeembericht` (`meld_commitment`, `posted`).
-- Ze vuren in naamvolgorde, dus de schríjfvolgorde ligt wél vast. Alleen kreeg
-- elke rij daarna exact dezelfde `created_at`, en `commitment_events.id` is een
-- `gen_random_uuid()` en zegt niets. `order by created_at` had dus niets om op
-- te sorteren en mocht van Postgres kiezen.
--
-- ⚠️ **En dat is meer dan een testprobleem.** `fetchCommitmentSpoor()` in
-- `src/modules/commitments/api.ts` sorteerde óók op `created_at` en toont het
-- spoor aan de eigenaar. Die kon dus "geplaatst in de groep" bóven
-- "verschuldigd geworden" zien staan — in het spoor waar domeinregel 6
-- (append-only, corrigeren via een correctie-record) op leunt.
--
-- ---------------------------------------------------------------------------
-- Waarom een eigen kolom en niet `clock_timestamp()`
-- ---------------------------------------------------------------------------
--
-- `alter column created_at set default clock_timestamp()` is één regel en lost
-- het geval van vandaag op: twee inserts in dezelfde transactie krijgen dan een
-- verschillende klok. Twee redenen om het niet zo te doen:
--
-- 1. **Het is een kans en geen garantie.** `timestamptz` telt in microseconden.
--    Twee inserts in dezelfde microseconde zijn vandaag onwaarschijnlijk en
--    morgen op snellere hardware minder onwaarschijnlijk — en "onwaarschijnlijk"
--    is precies het soort aanname dat dit project een keer een dag gekost heeft.
-- 2. **Een wandklok kan achteruit.** NTP zet hem terug; dan draait de volgorde
--    van twee gebeurtenissen om. Een auditspoor mag daar niet van afhangen.
--
-- Een identity-kolom is exact: hij kan niet knopen en hij kan niet achteruit.
-- `created_at` houdt daarmee zijn eigen betekenis — *wanneer dit gebeurde* — en
-- `seq` draagt de volgorde. Twee dingen, twee kolommen.
--
-- ---------------------------------------------------------------------------
-- Waarom alleen deze tabel — de rondgang langs de andere acht
-- ---------------------------------------------------------------------------
--
-- `src/` sorteert op negen plekken op `created_at`. Acht daarvan dragen deze
-- fout niet, en dat is gemeten en niet aangenomen:
--
--   group_join_requests, goal_interviews, deadline_requests, weekly_goals,
--   commitments, completion_approvals   één rij per gebruikershandeling, dus
--                                       nooit twee in dezelfde transactie
--   weekly_plan_steps                   sorteert éérst op `order_index` en
--                                       daarna nog eens in JS (`opVolgorde()`);
--                                       `created_at` is er hoogstens tiebreak
--   chat_messages (in 0024/0059)        sorteert op `created_at desc, id desc`,
--                                       dus bepaald — al is `id` willekeurig
--
-- ⚠️ **Dat maakt het register in `volgorde_register()` klein, en dat hoort zo.**
-- De vraag bij een nieuwe tabel is niet "staat er een `created_at` op" maar
-- *kunnen hier twee rijen uit één transactie komen die een mens in volgorde
-- leest*. Alleen dan hoort hij hier.
--
-- ⚠️ **`generated always`, niet `by default`.** De client heeft vandaag geen
-- INSERT-recht op deze tabel (alleen SELECT en REFERENCES; er wordt uitsluitend
-- via definer-functies geschreven), maar dat is een toestand en geen grendel —
-- zie 0172, waar precies dat verschil de belofte kostte.
--
-- ⚠️⚠️ **Hier stond dat `always` betekent dat "ook een toekomstige grant de kolom
-- niet kan zetten", en dat is onwaar.** Gemeten met een echte `set role
-- authenticated` en alleen INSERT+SELECT:
--
--   insert into t (seq, x) overriding system value values (99, 'gespooft');
--   INSERT 0 1   -- seq = 99
--
-- `OVERRIDING SYSTEM VALUE` zet de kolom gewoon; `always` blokkeert alleen de
-- kále insert en elke UPDATE. **De dragende grendel is tak 4** — geen client mag
-- een schrijfrecht op deze kolom hebben. `always` is de tweede laag en niet de
-- eerste. Twee tegenstrijdige uitspraken in één bestand over welke grendel de
-- belofte draagt, is precies hoe een tak later als overbodig wordt opgeruimd.
-- Gevonden in de security-review van 07-09-2026.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De kolom, in drie stappen zodat de bestaande rijen hun volgorde houden
-- ---------------------------------------------------------------------------
--
-- `add column ... generated always as identity` vult bestaande rijen in de
-- volgorde waarin de herschrijving ze tegenkomt — fysieke volgorde, geen
-- belofte. Daarom eerst leeg toevoegen, dan zelf vullen op `created_at`, dan
-- pas de identity eraan hangen.

alter table public.commitment_events
  add column if not exists seq bigint;

-- ⚠️⚠️ **De vulling staat bínnen de grendel, en de eerste versie niet.** Toen
--    stond de UPDATE erbuiten, en dat maakte deze migratie niet-idempotent:
--    zodra `seq` een identity is, weigert Postgres het statement **bij het
--    plannen** — ook als het nul rijen raakt. Gemeten op de tweede ronde:
--
--      ERROR: column "seq" can only be updated to DEFAULT
--      DETAIL: Column "seq" is an identity column defined as GENERATED ALWAYS.
--
--    Dat valt niet in de tweede klasse die onwrikbare regel 20 met rust laat
--    (een botsing met een *latere* migratie); deze botste met zichzelf.
--
-- ⚠️ **En de grendel in `tests/migraties/idempotentie.ts` kon het niet zien:**
--    die leest de tekst van een migratie en kent regels voor `create`-statements,
--    niet voor een `update` op een identity-kolom. Gevonden in de
--    security-review van 07-09-2026, niet door een test.

do $$
declare
  v_start bigint;
begin
  if exists (
    select 1 from pg_attribute a
    where a.attrelid = 'public.commitment_events'::regclass
      and a.attname  = 'seq'
      and a.attidentity <> ''
  ) then
    return;  -- al gedraaid
  end if;

  with genummerd as (
    select ctid, row_number() over (order by created_at, ctid) as n
    from public.commitment_events
    where seq is null
  )
  update public.commitment_events e
     set seq = g.n
    from genummerd g
   where e.ctid = g.ctid;

  alter table public.commitment_events alter column seq set not null;

  select coalesce(max(seq), 0) + 1 into v_start from public.commitment_events;

  execute format(
    'alter table public.commitment_events alter column seq add generated always as identity (start with %s)',
    v_start
  );
end $$;

-- ---------------------------------------------------------------------------
-- 1b. De sequence eronder — de eerste in dit schema
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`public` had tot deze migratie nul sequences, en dat is precies waarom
--    dit misging.** Onwrikbare regel 4 bestaat omdat Supabase's
--    `alter default privileges` élk nieuw ding in `public` uitdeelt aan `anon`,
--    `authenticated` én `service_role`. Tot nu toe ging die regel over tabellen
--    en functies. Een identity-kolom brengt een *sequence* mee, en die krijgt
--    dezelfde behandeling. Gemeten vlak na de eerste versie van deze migratie:
--
--      commitment_events_seq_seq | anon USAGE=t | auth USAGE=t
--                                | auth UPDATE=t | anon SELECT=t
--
--    `UPDATE` op een sequence is `setval()`. Wie de teller terugzet, laat de
--    volgende triggerschrijving botsen op `commitment_events_volgorde_idx` óf
--    een lagere `seq` hergebruiken — en dan draait het auditspoor om. Dat is
--    exact de belofte die deze migratie komt vestigen. Sequences kennen geen
--    RLS, dus `commitment_events_select` doet hier niets.
--
--    Er is vandaag geen pad van een REST-client naar `setval()` — PostgREST
--    exposeert sequences niet en `setval` staat in `pg_catalog`. **Maar dat is
--    een toestand en geen grendel**, en dat is letterlijk het argument waarmee
--    deze migratie `generated always` boven `by default` koos. Dezelfde
--    redenering hoort te gelden voor het onderdeel dat ze zelf introduceert.
--
--    Gevonden in de security-review van 07-09-2026. Tak 5 van
--    `volgorde_bewaking()` maakt er een grendel van in plaats van een regel.

revoke all on sequence public.commitment_events_seq_seq from public, anon, authenticated;

comment on column public.commitment_events.seq is
  'De schrijfvolgorde van het auditspoor. `created_at` kan knopen — `now()` is '
  'constant binnen een transactie en twee triggers op één UPDATE schrijven '
  'allebei — dus sorteer hierop en niet op de klok. QS8-303.';

-- ---------------------------------------------------------------------------
-- 2. De index waar de leesquery op landt
-- ---------------------------------------------------------------------------
--
-- `commitment_events_commitment_idx` staat op `(commitment_id, created_at desc)`
-- en blijft staan: hij dekt de lijstquery's die op recentheid kijken. Deze is
-- de sorteerindex van het spoor zelf, en hij is uniek — dat is meteen de
-- grendel dat `seq` niet twee keer dezelfde waarde binnen één commitment kan
-- dragen.

create unique index if not exists commitment_events_volgorde_idx
  on public.commitment_events (commitment_id, seq);

-- ---------------------------------------------------------------------------
-- 3. De bewaking
-- ---------------------------------------------------------------------------
--
-- Het register is met de hand, zoals `definer_uitzonderingen()` in 0167, en om
-- dezelfde reden: er is geen catalogusvraag die "deze tabel draagt een volgorde
-- die een mens leest" beantwoordt. Komt er een tweede spoortabel bij, dan hoort
-- die hier — en dat is een regel voor een mens, niet iets dat een script kan
-- afleiden.
--
-- Wat hij wél afleidt is of de sleutel zijn belofte nog kan waarmaken. Vier
-- takken, elk apart te ijken:
--
--   1. de kolom is er niet meer
--   2. de kolom is niet `generated always as identity` — dan kan hij knopen,
--      leeg blijven of door een client gezet worden
--   3. de unieke index is weg — dan kan de sleutel binnen één commitment
--      dubbel voorkomen
--   4. een client heeft er schrijfrecht op — en dit is de tak die de belofte
--      dráágt, niet `always`: met `OVERRIDING SYSTEM VALUE` zet een INSERT-grant
--      de kolom alsnog (gemeten, zie hierboven)
--   5. een client heeft rechten op de sequence eronder — `USAGE` is `nextval`,
--      `UPDATE` is `setval`, en dat laatste zet de teller terug
--
-- ⚠️ **Vier takken in één functie en niet vier losse tests, en dat is een keuze
--    die één ijking gekost heeft.** De grantcontrole stond eerst als losse test
--    in `tests/rls/auditspoor-volgorde.test.ts`, en toen ging bij mutatie A —
--    de kolom weghalen — *allebei* rood: `has_column_privilege` werpt op een
--    kolom die niet bestaat. Eén mutatie die twee tests rood maakt, isoleert
--    niets meer. Als takken van dezelfde bewaking is het één rode test met vier
--    afzonderlijk te ijken meldingen.
--
-- ⚠️ **Tak 1 en tak 3 komen bij één mutatie samen omhoog**, en dat is juist:
--    `drop column seq cascade` neemt de unieke index mee. Twee meldingen, één
--    rode test — geen tak die de andere maskeert.

create or replace function public.volgorde_register()
returns table(tabel text, kolom text, indexnaam text, reden text)
language sql
immutable
set search_path = public, pg_temp
as $$
  select *
  from (values
    ('commitment_events', 'seq', 'commitment_events_volgorde_idx',
     'Twee AFTER-triggers op één UPDATE van commitments schrijven allebei een '
     'gebeurtenis; created_at knoopt dan. QS8-303.')
  ) as v(tabel, kolom, indexnaam, reden);
$$;

revoke execute on function public.volgorde_register() from public, anon, authenticated;

create or replace function public.volgorde_bewaking()
returns table(tabel text, bevinding text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with register as (
    select * from volgorde_register()
  ),
  kolom as (
    select r.tabel, r.kolom, r.indexnaam, a.attidentity
    from register r
    left join pg_attribute a
      on a.attrelid = ('public.' || r.tabel)::regclass
     and a.attname  = r.kolom
     and a.attnum   > 0
     and not a.attisdropped
  )
  select k.tabel, 'volgordekolom ' || k.kolom || ' bestaat niet'
    from kolom k where k.attidentity is null
  union all
  select k.tabel, 'volgordekolom ' || k.kolom || ' is geen generated always as identity'
    from kolom k where k.attidentity is not null and k.attidentity <> 'a'
  union all
  select k.tabel, 'unieke sorteerindex ' || k.indexnaam || ' ontbreekt'
    from kolom k
   where not exists (
     select 1 from pg_index i
     join pg_class c on c.oid = i.indexrelid
     where i.indrelid = ('public.' || k.tabel)::regclass
       and c.relname  = k.indexnaam
       and i.indisunique
   )
  union all
  select k.tabel, 'volgordekolom ' || k.kolom || ' staat in een ' || cp.privilege_type
                  || '-grant van ' || cp.grantee
    from kolom k
    join information_schema.column_privileges cp
      on cp.table_schema = 'public'
     and cp.table_name   = k.tabel
     and cp.column_name  = k.kolom
   where k.attidentity is not null
     and cp.grantee in ('anon', 'authenticated')
     and cp.privilege_type in ('INSERT', 'UPDATE')
  union all
  -- ⚠️ Tak 5. De sequence onder een identity-kolom is een eigen object met eigen
  --    rechten, en Supabase deelt hem net zo goed uit als een tabel. `USAGE` is
  --    `nextval`, `UPDATE` is `setval` — en `setval` zet de teller terug.
  select k.tabel,
         'sequence ' || s.relname || ' is ' || p.recht || ' voor ' || p.rol
    from kolom k
    join pg_attribute a on a.attrelid = ('public.' || k.tabel)::regclass
                       and a.attname  = k.kolom
    join pg_depend    d on d.refobjid = a.attrelid
                       and d.refobjsubid = a.attnum
                       and d.deptype  = 'i'
    join pg_class     s on s.oid = d.objid and s.relkind = 'S'
    cross join (values ('anon', 'USAGE'), ('anon', 'UPDATE'), ('anon', 'SELECT'),
                       ('authenticated', 'USAGE'), ('authenticated', 'UPDATE'),
                       ('authenticated', 'SELECT')) as p(rol, recht)
   where has_sequence_privilege(p.rol, s.oid, p.recht)
  order by 1, 2;
$$;

revoke execute on function public.volgorde_bewaking() from public, anon, authenticated;

comment on function public.volgorde_bewaking() is
  'Meldt elke tabel uit volgorde_register() waarvan de volgordesleutel zijn '
  'belofte niet meer kan waarmaken. Zie 0174 en QS8-303.';
