-- 0143_de_korte_vragenlijst_op_het_profiel.sql — vier antwoorden die bij de persoon horen (QS8-257)
--
-- ROLLBACK-PAD:
--   alter table public.profiles drop constraint if exists profiles_focus_areas_geldig;
--   alter table public.profiles drop constraint if exists profiles_minuten_geldig;
--   alter table public.profiles drop constraint if exists profiles_moment_geldig;
--   alter table public.profiles drop constraint if exists profiles_valkuilen_geldig;
--   alter table public.profiles drop column if exists focus_areas;
--   alter table public.profiles drop column if exists minutes_per_day;
--   alter table public.profiles drop column if exists when_i_do_it;
--   alter table public.profiles drop column if exists what_breaks_it;
--
--   ⚠️ De kolomgrants hoeven niet apart teruggedraaid: een grant hangt aan de
--      kolom en verdwijnt met `drop column` mee.
--
--   ⚠️ Dit kost antwoorden die een gebruiker gegeven heeft. Op een gevulde
--      database is dat dus geen rollback maar een besluit.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit A56, Quinten, 31-08-2026: de korte vragenlijst komt **ná** de
-- aanmeldmuur. Habit Huddle zet hem ervóór, uitgelogd bruikbaar, als
-- acquisitiekanaal; dat is voorgelegd en afgewezen. Het zou een uitgelogd
-- AI-eindpunt vragen met een limiet, een misbruikvector en een rekening zonder
-- gebruiker erachter.
--
-- ---------------------------------------------------------------------------
-- Waarom op `profiles` en niet op `goals`
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De categorie hangt aan het dóél, het focusgebied aan de persóón.** Dat is
--    het besluit uit QS8-224 en het is de reden dat deze vier kolommen hier
--    staan en niet bij een doel. Een focusgebied stuurt de Doelcoach en is de
--    zoekingang voor groepen (QS8-231); het overleeft dus het doel waarvoor je
--    het invulde.
--
-- ⚠️ **Alle vier zijn ze standaard dicht, en dat kost hier geen regel.** De
--    tabelcomment van 0089 zegt het al: `authenticated` heeft geen tabelbrede
--    SELECT op `profiles` maar een expliciete kolomlijst van drie, en alles
--    daarbuiten is alleen voor de eigenaar via de view `mijn_profiel`.
--
--    Dat is precies goed: "wat laat jouw gewoontes normaal gesproken stuklopen"
--    is per definitie een uitspraak over eerdere tegenslag, en domeinregel 7
--    houdt die privé. Hij mag naar de Doelcoach — die werkt voor jou — en nooit
--    naar de groep.
--
-- ⚠️ **Maar die view komt er níét vanzelf bij, en dat is een val die deze
--    migratie bijna in gelopen was.** `mijn_profiel` is `select p.*`, en een
--    `*` in een view wordt bij het aanmaken **één keer** uitgeklapt naar de
--    kolommen die er dan zijn. Postgres bewaart de lijst, niet de ster. Een
--    nieuwe kolom op `profiles` verschijnt daar dus nooit, en het scherm krijgt
--    `42703 column does not exist` — pas op het moment dat een gebruiker zijn
--    eigen profiel opvraagt.
--
--    Gevonden door `tests/rls/vragenlijst.test.ts`, niet door te lezen: de kop
--    van deze migratie beweerde eerst het tegendeel. Sectie 6 hieronder herbouwt
--    de view.
--
-- ---------------------------------------------------------------------------
-- De kolomgrants, en waarom ze hier met zoveel woorden staan
-- ---------------------------------------------------------------------------
--
-- ⚠️ `profiles` heeft sinds 0089 kolomgrants voor INSERT en UPDATE en géén
--    tabelgrant. Een nieuwe kolom is daarmee **niet schrijfbaar** tot hij hier
--    genoemd wordt, en dat faalt met `42501` op het moment dat een client hem
--    meestuurt — niet bij het migreren.
--
--    Dat is op 01-09-2026 bij QS8-224 precies één keer misgegaan, met `goals`:
--    drie nieuwe kolommen zonder grant braken élk doel aanmaken. De les staat in
--    QS8-258; tot die controle er is, is dit blok de handmatige versie ervan.

begin;

-- ---------------------------------------------------------------------------
-- 1. Vraag 1 — waar wil je je op richten?
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een array en geen drie kolommen.** Maximaal drie is een productkeuze die
--    kan verschuiven; drie kolommen zouden dat een migratie maken en bovendien
--    de vraag "staat dit gebied er al in" in de client leggen.
--
-- ⚠️ **De lijst is een kopie van `goals_category_valid` (0142).** Dat is een
--    naad, en hij staat onder test: `tests/rls/vragenlijst.test.ts` legt de twee
--    naast elkaar via `check_waarden()`. Zonder die toets loopt hij uit elkaar
--    zodra iemand er een gebied bij zet — precies de vorm van 0032/0034.

alter table public.profiles
  add column if not exists focus_areas text[] not null default '{}'::text[];

alter table public.profiles drop constraint if exists profiles_focus_areas_geldig;
alter table public.profiles add constraint profiles_focus_areas_geldig check (
  array_length(focus_areas, 1) is null
  or (
    array_length(focus_areas, 1) <= 3
    and focus_areas <@ array[
      'fitness', 'nutrition', 'self_care', 'mindfulness',
      'connection', 'helping', 'creativity',
      'productivity', 'organization', 'learning', 'skills', 'resilience',
      'business', 'study', 'other'
    ]::text[]
  )
);

comment on column public.profiles.focus_areas is
  'Maximaal drie focusgebieden van deze persoon, uit dezelfde woordenlijst als '
  'goals.category (QS8-257). ⚠️ Het gebied hoort bij de persoon, de categorie '
  'bij het doel — QS8-224. Alleen voor de eigenaar leesbaar, via mijn_profiel.';

-- ---------------------------------------------------------------------------
-- 2. Vraag 2 — hoeveel tijd kun je eerlijk geven?
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Per dag en niet per week, en dat is niet hetzelfde veld als
--    `goals.available_hours_per_week`.** De vraag luidt "op een gewone dag, niet
--    je beste dag" en dat is met opzet een andere vraag dan "hoeveel uur heb je
--    deze week". Wie ze samenvoegt, verliest juist het antwoord dat bruikbaar is.
--
--    De omrekening naar uren per week staat op één plek in de app
--    (`urenPerWeekUitMinuten()`) en wordt aan de gebruiker getóónd voordat hij
--    landt — een stille conversie is een getal verzinnen namens iemand anders.

alter table public.profiles
  add column if not exists minutes_per_day integer;

alter table public.profiles drop constraint if exists profiles_minuten_geldig;
alter table public.profiles add constraint profiles_minuten_geldig
  check (minutes_per_day is null or minutes_per_day in (5, 15, 30, 60));

comment on column public.profiles.minutes_per_day is
  'Wat deze persoon op een gewone dag kan geven: 5, 15, 30 of 60+ minuten '
  '(QS8-257). NULL = niet beantwoord, en dat mag.';

-- ---------------------------------------------------------------------------
-- 3. Vraag 3 — wanneer ga je het echt doen?
-- ---------------------------------------------------------------------------
--
-- Cue-verankering. Hangt samen met het ritme uit A53: wie "wisselt sterk"
-- antwoordt, heeft meer aan een weekdoel dan aan een dagelijkse afvinking.

alter table public.profiles
  add column if not exists when_i_do_it text;

alter table public.profiles drop constraint if exists profiles_moment_geldig;
alter table public.profiles add constraint profiles_moment_geldig
  check (when_i_do_it is null or when_i_do_it in ('morning', 'workday', 'evening', 'varies'));

comment on column public.profiles.when_i_do_it is
  'Het moment waarop deze persoon zegt het te gaan doen (QS8-257). Voedt het '
  'voorstel voor een ritme en straks de herinnering.';

-- ---------------------------------------------------------------------------
-- 4. Vraag 4 — wat laat jouw gewoontes normaal gesproken stuklopen?
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is het waardevolste veld van de vragenlijst, en niet om de reden die
--    voor de hand ligt.** Habit Huddle stelt hem bij een prompt bij; wij kunnen
--    er machinerie mee aanwijzen die al gebouwd is — de vloer (domeinregel 8),
--    weekpassen (QS8-81), peer-goedkeuring (domeinregel 3), de adempauze
--    (QS8-82). Elk antwoord wijst naar iets wat wij hebben en zij niet.
--
-- ⚠️ **Dit is de gevoeligste kolom van de vier.** Het antwoord gaat per definitie
--    over eerdere mislukking. Hij deelt daarmee de plaats van
--    `goal_interviews.stuck_before`: eigenaar-only, nooit naar de groep, wel
--    naar de Doelcoach.

alter table public.profiles
  add column if not exists what_breaks_it text[] not null default '{}'::text[];

alter table public.profiles drop constraint if exists profiles_valkuilen_geldig;
alter table public.profiles add constraint profiles_valkuilen_geldig check (
  array_length(what_breaks_it, 1) is null
  or what_breaks_it <@ array[
    'forget', 'motivation_drops', 'all_or_nothing', 'nobody_notices', 'life_chaotic'
  ]::text[]
);

comment on column public.profiles.what_breaks_it is
  'Wat de gewoontes van deze persoon eerder liet stuklopen (QS8-257). ⚠️ Gaat '
  'per definitie over eerdere tegenslag: eigenaar-only, net als '
  'goal_interviews.stuck_before. Nooit naar de groep — domeinregel 7.';

-- ---------------------------------------------------------------------------
-- 5. De vier kolommen schrijfbaar maken
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zonder dit blok landt elke vragenlijst op `42501` — zie de kop. Alleen
--    INSERT en UPDATE; de leeskant loopt via `mijn_profiel` en heeft daarom
--    géén kolomgrant nodig. Een SELECT-grant zou deze vier juist voor élk lid
--    van je groep openzetten, en dat is precies wat 0089 heeft dichtgezet.

grant insert (focus_areas, minutes_per_day, when_i_do_it, what_breaks_it)
  on public.profiles to authenticated;

grant update (focus_areas, minutes_per_day, when_i_do_it, what_breaks_it)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 6. `mijn_profiel` opnieuw, want een `*` in een view is geen `*`
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Zonder dit blok is de leeskant stuk terwijl de schrijfkant werkt** — de
--    ergste combinatie, want het schrijven lukt en het terughalen niet. Zie de
--    kop: Postgres klapt de ster bij `create view` één keer uit en bewaart de
--    kolomlijst.
--
-- ⚠️ `create or replace view` mag kolommen toevoegen maar niet verwijderen of
--    herordenen. Dat is precies wat hier nodig is en het is meteen de reden dat
--    dit veilig is: de bestaande kolommen blijven op hun plek staan, dus geen
--    enkele bestaande query verschuift.
--
-- ⚠️ De eigenaar, `security_invoker = false` en de grants blijven met een
--    `or replace` staan. Ze staan hier toch, omdat dit blok bij een herstel op
--    een lege database de enige plek is waar iemand ze nog leest — en de
--    combinatie van die drie *ís* de werking van deze view (0089, 0095).

create or replace view public.mijn_profiel
  with (security_invoker = false, security_barrier = true)
as
  select p.*
  from public.profiles p
  where p.id = auth.uid();

alter view public.mijn_profiel owner to postgres;

revoke all on public.mijn_profiel from public, anon;
grant select on public.mijn_profiel to authenticated;

commit;
