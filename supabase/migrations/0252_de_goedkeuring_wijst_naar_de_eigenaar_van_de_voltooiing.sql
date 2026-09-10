-- 0252_de_goedkeuring_wijst_naar_de_eigenaar_van_de_voltooiing.sql — de tweede
-- grendel van domeinregel 3 hield maar de helft tegen: hij verbood jezelf
-- goedkeuren, maar niet een goedkeuring die naar een wíllekeurige derde wees.
--
-- ROLLBACK-PAD:
--   alter table public.completion_approvals
--     drop constraint if exists completion_approvals_subject_is_eigenaar;
--   alter table public.completions
--     drop constraint if exists completions_id_gebruiker_uniek;
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op 10-09-2026 (QS8-182), met de trigger `fill_approval_subject()`
--    uitgezet — de vraag was wat het schema zélf tegenhoudt:
--
--      subject_id gelogen naar de goedkeurder zelf   -> 23514 (not_self)
--      subject_id gelogen naar een derde             -> TOEGELATEN
--
--    De CHECK `completion_approvals_not_self` is `approver_id <> subject_id`.
--    Die vraagt nergens of dat subject de eigenaar van de voltooiing ís, want
--    een CHECK mag geen subquery doen — precies de reden dat `subject_id` hier
--    gedenormaliseerd staat.
--
-- ⚠️ **CLAUDE.md domeinregel 3 eist beide helften.** *"Alleen een lid van
--    dezelfde buddy-groep mag een voltooiing goedkeuren. Nooit jezelf.
--    Afgedwongen in RLS **én** met een database-constraint."* De RLS-kant klopt
--    en de trigger vult `subject_id` onvoorwaardelijk, dus in de praktijk komt
--    een client hier niet langs. Maar de constraint-kant droeg maar de helft
--    van wat de regel belooft, en dat is precies wat een tweede grendel niet
--    hoort te doen: hij bestaat voor het geval de eerste wegvalt.
--
-- ⚠️ **Waarom een samengestelde foreign key en geen trigger erbij.** Een trigger
--    is wat er al staat; nog een trigger die hetzelfde bewaakt maakt het net
--    niet dichter, alleen dikker. Een foreign key naar `(id, user_id)` laat de
--    database het verband zélf bewaken — hij kán niet vergeten worden en hij
--    overleeft elke `security definer`-functie die er ooit langs komt.
--
-- 📏 **De prijs, en die is gemeten en niet geschat:** één extra unieke index op
--    `completions`, een tabel die veel schrijft. Op productie staan er vandaag
--    **nul rijen** in `completions` en **nul** in `completion_approvals`
--    (gemeten op 10-09-2026 tegen `wehgocadxehottiiyvsc`), dus deze migratie
--    voegt toe aan lege tabellen en heeft geen herschrijving nodig.
--
-- ---------------------------------------------------------------------------
-- 1. De sleutel waar de foreign key naar wijst
-- ---------------------------------------------------------------------------
--
-- ⚠️ `(id, user_id)` en niet andersom. `id` is al de primaire sleutel, dus deze
--    index is functioneel overbodig voor het opzoeken — hij bestaat alleen omdat
--    een foreign key een unieke constraint nodig heeft om naar te wijzen.

alter table public.completions
  drop constraint if exists completions_id_gebruiker_uniek;

alter table public.completions
  add constraint completions_id_gebruiker_uniek unique (id, user_id);

comment on constraint completions_id_gebruiker_uniek on public.completions is
  'Draagt de samengestelde foreign key van completion_approvals. Zonder deze '
  'constraint kan geen enkele tabel het paar (voltooiing, eigenaar) als geheel '
  'aanwijzen — QS8-182.';

-- ---------------------------------------------------------------------------
-- 2. De tweede helft van domeinregel 3
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`on update cascade` en niet `restrict`.** `completions.user_id` verandert
--    vandaag nergens, en dat is precies waarom `cascade` hier de veilige keuze
--    is: gebeurt het ooit tóch, dan schuift de goedkeuring mee in plaats van de
--    wijziging te blokkeren met een fout die niemand verwacht.
--
-- ⚠️ **`on delete cascade` houdt het gedrag dat er al was.** De bestaande
--    `completion_approvals_completion_id_fkey` doet hetzelfde; die blijft staan,
--    want hij draagt de kolom-index waar de opruiming op leunt.
--
-- ⚠️ Beide kolommen zijn `not null` — 📏 nagemeten — dus er is geen
--    MATCH-SIMPLE-uitweg waarlangs een rij met één lege helft ongetoetst
--    doorglipt.

alter table public.completion_approvals
  drop constraint if exists completion_approvals_subject_is_eigenaar;

alter table public.completion_approvals
  add constraint completion_approvals_subject_is_eigenaar
  foreign key (completion_id, subject_id)
  references public.completions (id, user_id)
  on update cascade
  on delete cascade;

comment on constraint completion_approvals_subject_is_eigenaar on public.completion_approvals is
  'Domeinregel 3, tweede helft: het subject van een goedkeuring is de eigenaar '
  'van de voltooiing waar hij bij hoort. De CHECK not_self verbiedt jezelf '
  'goedkeuren; deze foreign key verbiedt een goedkeuring die naar iemand anders '
  'dan de eigenaar wijst. Gemeten in QS8-182: zonder deze constraint werd dat '
  'toegelaten zodra fill_approval_subject() wegviel.';
