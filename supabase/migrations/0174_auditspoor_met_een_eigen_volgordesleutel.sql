-- 0174_auditspoor_met_een_eigen_volgordesleutel.sql — het auditspoor van een commitment had geen sleutel die twee gebeurtenissen uit één transactie uit elkaar houdt (QS8-303)
--
-- ROLLBACK-PAD:
--   drop index if exists public.commitment_events_volgorde_idx;
--   alter table public.commitment_events drop column if exists seq;
--   drop function if exists public.volgorde_bewaking();
--   drop function if exists public.volgorde_register();
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
-- zie 0172, waar precies dat verschil de belofte kostte. `always` maakt het een
-- grendel: ook een toekomstige grant kan de kolom niet zetten.
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

with genummerd as (
  select ctid, row_number() over (order by created_at, ctid) as n
  from public.commitment_events
  where seq is null
)
update public.commitment_events e
   set seq = g.n
  from genummerd g
 where e.ctid = g.ctid;

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

  alter table public.commitment_events alter column seq set not null;

  select coalesce(max(seq), 0) + 1 into v_start from public.commitment_events;

  execute format(
    'alter table public.commitment_events alter column seq add generated always as identity (start with %s)',
    v_start
  );
end $$;

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
--   4. een client heeft er schrijfrecht op — vandaag weigert Postgres dat recht
--      te gebruiken omdat de kolom `always` is, maar de grant is het signaal dat
--      iemand het geprobeerd heeft, en tak 2 en tak 4 samen zijn wat de kolom
--      buiten handen van de client houdt
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
  order by 1, 2;
$$;

revoke execute on function public.volgorde_bewaking() from public, anon, authenticated;

comment on function public.volgorde_bewaking() is
  'Meldt elke tabel uit volgorde_register() waarvan de volgordesleutel zijn '
  'belofte niet meer kan waarmaken. Zie 0174 en QS8-303.';
