-- 0146_het_ritme_in_het_dashboard.sql — `goals.ritme` is nergens te lezen (QS8-260)
--
-- ROLLBACK-PAD:
--   De view terug zonder `ritme`, met de kolomlijst uit 0050 §2. Let op de
--   volgorde: `create or replace view` mag geen kolom verwijderen, dus dat is een
--   `drop view` gevolgd door de oude definitie — en dan ook de `grant select`
--   opnieuw.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-260 vraagt om een formulier voor een ritme-weekdoel, en schrijft erbij dat
-- `goals.ritme` het vóórstel stuurt: het formulier hoort te beginnen op de
-- voorkeur die de gebruiker bij zijn doel heeft gezet.
--
-- ⚠️ **Dat kan vandaag niet, en dat is de derde onderbroken schakel in dezelfde
--    keten.** `fetchDoel()` leest `goal_dashboard`, en die view heeft sinds 0050
--    een **expliciete kolomlijst**. Migratie 0140 zette `ritme` op `goals` en
--    raakte de view niet aan, dus de kolom bestaat, is schrijfbaar, en is voor
--    geen enkel scherm zichtbaar.
--
--    De andere twee schakels staan in QS8-260 zelf: er was geen veld dat de
--    dagen invoert, en `maakWeekdoel()` gaf ze niet door. Alle drie zijn ze
--    onzichtbaar voor élke test, want er is niets kapot — CLAUDE.md regel 18,
--    vraag 5.
--
-- ⚠️ **Dit is niet dezelfde val als bij `mijn_profiel` in 0143, en dat verschil
--    is de moeite waard.** Daar stond `select p.*` en klapte Postgres de ster
--    één keer uit; hier stáát de lijst er met de hand, en dan is een vergeten
--    kolom geen verrassing maar een weglating. De uitkomst is dezelfde: een
--    kolom die nergens aankomt.
--
-- ---------------------------------------------------------------------------
-- Wat dit wél en niet openzet
-- ---------------------------------------------------------------------------
--
-- ⚠️ `goal_dashboard` draait met `security_invoker = true`, dus RLS van de
--    aanroeper geldt. `goals_select` laat een groepsgenoot van een gekoppeld doel
--    de rij lezen, dus die ziet vanaf nu ook het ritme.
--
--    **Dat is geen nieuw oppervlak en zeker geen tegenslag.** Een ritme is een
--    voorkeur, van dezelfde soort als `title`, `category` en `target_date`, die
--    alle drie al in deze view staan. Er valt geen gemiste week uit af te leiden:
--    "deze persoon werkt er dagelijks aan" zegt niets over of het gelukt is.
--    Wat dát zou verraden is `weekly_goals.floor_days`/`ceiling_days` naast
--    `achieved_level`, en die staan bij oppervlak 3 in beslisdocument 002.

begin;

-- ⚠️ **`create or replace` en géén `drop`**, en de volgorde eronder is daarom
--    geen stijlkeuze: replace mag kolommen toevoegen maar niet verwijderen of
--    herordenen, en toevoegen kan alleen aan het éínd. `ritme` staat dus achter
--    de tellingen en niet netjes bij de andere `goals`-kolommen. Een `drop view`
--    zou dat oplossen en ook elke afhankelijkheid meenemen — dat is de duurdere
--    kant van hetzelfde.

create or replace view public.goal_dashboard
with (security_invoker = true) as
  select
    g.id,
    g.owner_id,
    g.title,
    g.description,
    g.category,
    g.identity_statement,
    g.target_date,
    g.available_hours_per_week,
    g.max_points,
    g.status,
    g.created_at,
    g.updated_at,
    (select count(*) from public.milestones m
      where m.goal_id = g.id and m.status <> 'dropped') as milestones_total,
    (select count(*) from public.milestones m
      where m.goal_id = g.id and m.status = 'done') as milestones_done,
    (select count(*) from public.weekly_goals w
      where w.goal_id = g.id) as weekly_total,
    (select count(*) from public.weekly_goals w
      where w.goal_id = g.id and w.status = 'approved') as weekly_approved,
    -- QS8-260, migratie 0140. Zie de kop.
    g.ritme
  from public.goals g;

-- ⚠️ Staat er ook bij een `or replace`, waar hij blijft staan. Reden: bij een
--    herstel op een lege database is dit blok de enige plek waar iemand hem nog
--    leest, en de combinatie van `security_invoker` en deze grant *ís* de werking
--    van deze view (0050, 0095).
grant select on public.goal_dashboard to authenticated;

commit;
