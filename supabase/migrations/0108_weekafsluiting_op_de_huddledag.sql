-- 0108_weekafsluiting_op_de_huddledag.sql — een lid kon in één statement 30 schakels en twee mijlpaalberichten maken
--
-- ROLLBACK-PAD:
--   Herstel `bewaak_week_review_periode()` uit 0037: laat alleen de twee
--   venstergrenzen staan en haal de huddledagtoets eruit. Er is geen
--   datamigratie; bestaande rijen worden niet aangeraakt (de trigger draait
--   alleen op INSERT en UPDATE van de rij zelf).
--
-- ---------------------------------------------------------------------------
-- Waarom dit bestaat
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De bevinding van 18-08 noemde zijn eigen voorwaarde en die is ingetreden.**
--    De rij zei dat `week_reviews.group_period_start` van de client komt, dat
--    dat vandaag onschadelijk is, en: *"wordt zwaarder als de groep die periode
--    ergens te zien krijgt, of zodra er iets op geboekt wordt (punten, De
--    Ketting, een mijlpaal). Dan is een zelfgekozen periode geen rariteit meer
--    maar een hefboom."*
--
--    De Ketting is dáárna gebouwd (0070). `ketting_uit_weekafsluiting` schrijft
--    sindsdien een schakel uit elke weekafsluiting, en `meld_ketting_mijlpaal`
--    kondigt drempels aan in de groepschat. Beide voorwaarden zijn dus vervuld
--    en niemand heeft de rij herlezen. Dit is precies waarvoor QS8-123 die zin
--    verplicht stelde — hij werkt alleen als iemand hem naleest.
--
-- ⚠️ **Nagemeten op 28-08-2026, via de clientkant en niet als beheerder** — rol
--    `authenticated`, RLS actief, één lid alleen in een verse groep:
--
--      insert into week_reviews (…, group_period_start, …)
--      select …, current_date - d, … from generate_series(0, 29) d;
--
--      -> 30 rijen in `chain_links`
--      -> 2 systeemberichten: "De Ketting van deze groep telt 10 schakels."
--                             "De Ketting van deze groep telt 25 schakels."
--
--    Eén lid, één statement, twee groepsbrede aankondigingen. De drempels staan
--    op 10 en 25 (`ketting_drempels()`) en het venster van 0037 bood 37 dagen,
--    dus er was ruimte zat.
--
-- ⚠️ **Wat er ontbrak is geen grens maar een vórm.** 0037 klemde `group_period_start`
--    op `[current_date - 35, current_date + 1]` — dat werkt tegen "vijftig weken
--    terug", en die helft van de bevinding was dus al achterhaald. Maar niets
--    eiste dat de datum een périodestart ís. Een periode begint op de huddledag
--    van de groep; 31 van die 37 dagen zijn dat niet en hoorden er nooit te zijn.
--
-- ⚠️ **Dit is een validatie en geen berekening — correctheidsregel 7 blijft
--    overeind.** De database rekent nog steeds niet uit wélke periode nu loopt;
--    dat blijft `shared/time`, en dat is precies de reden dat de bevinding de
--    vrijheid oorspronkelijk accepteerde. Hier wordt alleen getoetst dat een
--    aangeleverde datum op de huddledag van díe groep valt. `plan_adempauze()`
--    doet sinds zijn eerste versie hetzelfde met `week_start_day`
--    (`extract(dow from p_starts_cycle)::smallint <> v_startdag` → `geen_cyclusstart`),
--    dus dit is het bestaande patroon en geen nieuwe bevoegdheid voor de database.
--
-- ⚠️ **De trigger staat BEFORE en de kettingschrijver AFTER**, dus deze toets
--    sluit beide paden in één keer: een geweigerde rij bereikt
--    `ketting_uit_weekafsluiting` nooit. Het slot hoort hier en niet in de
--    kettingtrigger — dan zou een vervalste weekafsluiting alsnog in de tabel
--    staan en alleen de schakel wegblijven.
--
-- ⚠️ **Een eigen SQLSTATE (`22023`) en niet die van 0037 (`22007`), en dat is
--    geen smaak.** De bestaande test op de venstergrens toetst op `22007`. Zou
--    deze toets dezelfde code geven, dan wordt die test groen zodra een datum om
--    de éne of de ándere reden geweigerd wordt — en dan bewaakt hij niet meer
--    welke grens hem tegenhield. Dat is vraag 3 uit onwrikbare regel 18: kan
--    deze test groen blijven terwijl de belofte breekt? Met één code: ja.
--    `22023` is `invalid_parameter_value`, dezelfde klasse, andere reden.
--
-- ⚠️ **Wat er blijft, blijft met opzet.** Binnen het venster liggen ongeveer zes
--    huddledagen, dus een lid kan nog steeds zes periodes tegelijk bijwerken. Dat
--    ís het doel van de 35 dagen uit 0037: wie twee weken op vakantie was, moet
--    zijn weken kunnen inhalen. Zes rijen die elk een échte periode aanduiden is
--    inhalen; eenendertig rijen op dagen die geen periode zijn, is verzinnen.
--    De rest van de bevinding — of dat inhalen ook een drempel mag halen —
--    staat als open punt in `docs/ENGINEER-REVIEW.md`.

create or replace function public.bewaak_week_review_periode()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_huddledag smallint;
begin
  if new.group_period_start > current_date + 1
     or new.group_period_start < current_date - 35 then
    raise exception 'group_period_start % ligt buiten het toegestane venster',
      new.group_period_start
      using errcode = '22007';
  end if;

  -- ⚠️ Zie de kop: een periode begint op de huddledag van de groep. Zonder deze
  --    toets is elke dag in het venster een geldige "periodestart" en telt De
  --    Ketting zesendertig weken waar er zes waren.
  select g.huddle_day into v_huddledag from groups g where g.id = new.group_id;

  -- Geen groep gevonden betekent dat de foreign key zo meteen afgaat; die
  -- foutmelding is duidelijker dan een zelfbedachte.
  if v_huddledag is not null
     and extract(dow from new.group_period_start)::smallint <> v_huddledag then
    raise exception 'group_period_start % is geen periodestart van deze groep',
      new.group_period_start
      using errcode = '22023';
  end if;

  return new;
end;
$$;
