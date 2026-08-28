-- 0121_reacties_pagineren_met_een_cursor.sql — nazorg op 0035 (EPIC 7)
--
-- ROLLBACK-PAD:
--   drop function if exists public.weekafsluiting_reacties(uuid, date, integer, timestamptz, uuid);
--   -- en de offsetversie terug uit 0035; let op dat dat een ándere handtekening
--   -- is, dus de drop hierboven raakt hem niet en andersom ook niet.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Bevinding van de code-review op EPIC 7, 18-08: `weekafsluiting_reacties()`
-- pagineert met `limit`/`offset` op `(created_at, id)` oplopend. Voor
-- tóevoegingen is dat stabiel — nieuwe rijen krijgen de hoogste tijdstempel en
-- komen achteraan — maar `verwijderReactie()` bestaat, en een verwijdering vóór
-- de cursor schuift alles één plek naar voren.
--
-- 📏 **Aangetoond en niet beredeneerd**, met vier reacties en `p_limit = 2`:
--
--     pagina 1 (offset 0):  reactie 1, reactie 2
--     reactie 1 wordt verwijderd
--     pagina 2 (offset 2):  reactie 4          ← reactie 3 is verdwenen
--
-- `voegReactiesSamen()` ontdubbelt wel, maar kan een overgeslagen rij niet
-- terughalen: die is nooit opgehaald. De gebruiker ziet hem pas terug als hij
-- het scherm opnieuw opent.
--
-- ---------------------------------------------------------------------------
-- De vorm komt uit de chat en is niet nieuw bedacht
-- ---------------------------------------------------------------------------
--
-- `groepschat()` doet dit al goed: `(m.created_at, m.id) < (p_before_at,
-- p_before_id)` met een `order by` die dezelfde twee kolommen in dezelfde
-- richting neemt. Deze functie leest oplopend, dus hier is het `>` en heet de
-- cursor `p_na_*`.
--
-- ⚠️ **De cursor moet compleet zijn of hij telt niet.** Eén van de twee waarden
--    NULL betekent "geen cursor" en dus de eerste pagina — precies zoals in de
--    chat. Een half ingevulde cursor stil als grens gebruiken zou `(x, null)`
--    opleveren, en dat is in SQL geen vergelijking maar NULL: de hele pagina
--    valt dan weg zonder foutmelding.
--
-- ---------------------------------------------------------------------------
-- Twee dingen die hier anders zijn dan een naamswijziging
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De drop noemt de vólledige handtekening, en dat is geen formaliteit.**
--    `create or replace` kan een argumentenlijst niet wijzigen: het resultaat is
--    een tweede functie naast de eerste, met dezelfde naam. De offsetversie zou
--    dan gewoon aanroepbaar blijven en de fout hierboven blijven maken, terwijl
--    de migratie er groen uitziet. Dit project heeft die val al een keer gezet —
--    0059 dropte `plaats_systeembericht(uuid, text, text)` en maakte er een met
--    zes argumenten — en daarom leest `migraties:controle` de handtekening en
--    niet de naam.
--
-- ⚠️ **`total_replies` betekent nu iets anders.** Het was `count(*) over ()`, en
--    dat telt met een cursorfilter erop nog maar de rijen die ná de cursor
--    komen. Dat is voor "hoeveel reacties zijn er" het verkeerde getal. Het is
--    nu een scalaire subquery over de hele periode, dus het telt wat er staat en
--    het verandert niet mee met waar je bent in de lijst.
--
-- ⚠️ **En de client leidt "er is meer" niet meer af uit dat getal.** Dat deed
--    hij met `offset + opgehaald < totaal`, en juist die rekensom klopt niet
--    zodra er tussendoor iets verdwijnt: het totaal daalt, de teller niet, en de
--    knop blijft staan of verdwijnt te vroeg. Voortaan: een volle pagina
--    betekent "er kan meer zijn". Dat kost hoogstens één leeg verzoek aan het
--    eind en kan niet liegen.
--
-- ---------------------------------------------------------------------------

drop function if exists public.weekafsluiting_reacties(uuid, date, integer, integer);

create or replace function public.weekafsluiting_reacties(
  p_group_id uuid,
  p_period_start date,
  p_limit integer default 100,
  p_na_at timestamptz default null,
  p_na_id uuid default null
)
returns table (
  id uuid,
  week_review_id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  body text,
  created_at timestamptz,
  total_replies bigint
)
language sql
stable
set search_path = public, pg_temp
as $$
  with zichtbaar as (
    select w.id
    from week_reviews w
    where w.group_id = p_group_id and w.group_period_start = p_period_start
  )
  select
    a.id,
    a.week_review_id,
    a.author_id,
    p.display_name,
    p.avatar_url,
    a.body,
    a.created_at,
    (
      select count(*)
      from week_review_replies t
      join zichtbaar z2 on z2.id = t.week_review_id
    ) as total_replies
  from week_review_replies a
  join zichtbaar z on z.id = a.week_review_id
  left join profiles p on p.id = a.author_id
  where
    p_na_at is null
    or p_na_id is null
    or (a.created_at, a.id) > (p_na_at, p_na_id)
  order by a.created_at asc, a.id asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

comment on function public.weekafsluiting_reacties(uuid, date, integer, timestamptz, uuid) is
  'De reacties van een periode, oplopend, met een cursor op (created_at, id) — '
  'dezelfde vorm als groepschat(). Met `offset` sloeg een verwijdering vóór de '
  'cursor een rij over; zie 0121.';

revoke all on function public.weekafsluiting_reacties(uuid, date, integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.weekafsluiting_reacties(uuid, date, integer, timestamptz, uuid)
  to authenticated;
