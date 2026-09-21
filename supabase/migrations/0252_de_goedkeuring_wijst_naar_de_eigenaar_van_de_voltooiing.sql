-- 0252_de_goedkeuring_wijst_naar_de_eigenaar_van_de_voltooiing.sql — de tweede
-- grendel van domeinregel 3 hield maar de helft tegen: hij verbood jezelf
-- goedkeuren, maar niet een goedkeuring die naar een wíllekeurige derde wees.
--
-- ROLLBACK-PAD:
--   alter table public.completion_approvals
--     drop constraint if exists completion_approvals_subject_is_eigenaar;
--   alter table public.completions
--     drop constraint if exists completions_id_gebruiker_uniek;
--   drop index if exists public.completion_approvals_subject_eigenaar_idx;
--   create index if not exists completion_approvals_completion_idx
--     on public.completion_approvals (completion_id);
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
-- ⚠️⚠️ **Deze keuze stond geparkeerd voor de engineer-review.** De reactie op
--    QS8-182 van 10-09-2026 15:40 zet het issue met zoveel woorden terug naar
--    Backlog, omdat juist de keuze tussen trigger en foreign key het oordeel is
--    dat die rij voor de engineer bewaart. Wat de parkering opheft is Quintens
--    opdracht van diezelfde dag dat elk issue met `review:november` uitgevoerd
--    mag worden — en uitvoeren betekent hier de vorm kiezen. De dossierrij
--    blijft staan met de vormvraag erin; alleen de dékkingsvraag is beslist.
--    Volledige verantwoording in
--    `docs/decisions/2026-09-10-de-goedkeuring-wijst-naar-de-eigenaar.md`.
--
-- 📏 **De prijs, en die is gemeten en niet geschat:** één extra unieke index op
--    `completions`, een tabel die veel schrijft. Op productie staan er vandaag
--    **nul rijen** in `completions` en **nul** in `completion_approvals`
--    (gemeten op 10-09-2026 tegen `wehgocadxehottiiyvsc`), dus deze migratie
--    voegt toe aan lege tabellen en heeft geen herschrijving nodig.
--
-- ⚠️⚠️ **Twee afhankelijke objecten in één bestand: de drops staan bovenaan en in
--    omgekeerde volgorde.** 📏 Gemeten door dit bestand een tweede keer af te
--    spelen toen de opruiming nog per blok stond: `2BP01` —
--    *cannot drop constraint completions_id_gebruiker_uniek ... because other
--    objects depend on it*. De unieke constraint droppen kán niet zolang de
--    foreign key die 30 regels lager bijkomt er nog op leunt.
--
--    Dat is onwrikbare regel 20, en de reflex die hem duur maakt staat in
--    CLAUDE.md met zoveel woorden: de standaardreactie op een half gelukte
--    migratie is *"draai hem opnieuw"*. Die reflex gaf hier een melding over een
--    afhankelijkheid en niet over "staat er al" — een foutmelding die naar het
--    verkeerde probleem wijst.
--
--    ⚠️ Dit is **niet** de uitzonderingsklasse die CLAUDE.md beschermt (een
--    látere migratie die de vorm van hetzelfde object verandert; die botsing
--    hoort te blijven staan). Dit bestand botste op zichzelf, op een vers
--    schema, zonder dat er een tweede migratie aan te pas kwam.
--
--    ⚠️ **En de statische grendel had dit niet gevangen** — 📏 nagelezen in
--    `tests/migraties/idempotentie.ts`: `bezwarenIn()` toetst of er vóór elke
--    `create` een `drop ... if exists` staat, en die stónd er voor allebei de
--    constraints. De fout zit in de volgorde tússen twee objecten, en dat is een
--    andere klasse dan wat die grendel kan zien. Staat als QS8-413.
--
-- ⚠️ **`begin;`/`commit;` eromheen**, zoals 44 van de migraties in deze map. Zonder
--    transactie laat een fout tussen statement 1 en 2 een halve staat achter, en
--    dat is precies het geval waarin iemand hem opnieuw draait.
--
-- ⚠️ **Als `completions` ooit gevuld is, is dit niet meer gratis.** `add
--    constraint ... unique` neemt ACCESS EXCLUSIVE en bouwt de index
--    niet-concurrent; de foreign key neemt SHARE ROW EXCLUSIVE op beide tabellen
--    en valideert. Op een gevulde `completions` — een tabel die per definitie
--    veel schrijft — is de weg: `create unique index concurrently` buiten een
--    transactie, dan `add constraint ... unique using index`, en de FK als
--    `not valid` gevolgd door `validate constraint`. Vandaag onnodig (nul rijen,
--    hierboven gemeten) en daarom niet gebouwd, maar de volgende lezer hoeft het
--    dan niet zelf uit te zoeken.
--
-- ---------------------------------------------------------------------------
-- 0. Opruimen — in omgekeerde afhankelijkheidsvolgorde, zie de kop
-- ---------------------------------------------------------------------------

begin;

alter table public.completion_approvals
  drop constraint if exists completion_approvals_subject_is_eigenaar;

alter table public.completions
  drop constraint if exists completions_id_gebruiker_uniek;

-- ---------------------------------------------------------------------------
-- 1. De sleutel waar de foreign key naar wijst
-- ---------------------------------------------------------------------------
--
-- ⚠️ `(id, user_id)` en niet andersom. `id` is al de primaire sleutel, dus deze
--    index is functioneel overbodig voor het opzoeken — hij bestaat alleen omdat
--    een foreign key een unieke constraint nodig heeft om naar te wijzen.

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

-- ---------------------------------------------------------------------------
-- 3. De index die onwrikbare regel 11 eist
-- ---------------------------------------------------------------------------
--
-- 📏 **De poort vond dit en niet ik.** `indexdekking_bewaking()` meldde de
--    nieuwe constraint meteen: *elke foreign key staat vooraan in een index*, en
--    Postgres indexeert de kindkant van een foreign key nooit zelf. De
--    bestaande `completion_approvals_completion_idx` dekt alleen `(completion_id)`
--    en is dus te kort voor een FK van twee kolommen.
--
-- ⚠️ **Dat is hier geen formaliteit maar het cascadepad.** Deze FK draagt
--    `on delete cascade`: zonder index is het verwijderen van een voltooiing —
--    en dus ook van een account — een seq scan over de goedkeuringen van
--    iedereen. Precies het geval dat de kop van `indexdekking.test.ts` als de
--    duurste plek aanwijst.
--
-- ⚠️⚠️ **En daarom gaat de oude index wég in plaats van ernaast te blijven
--    staan.** `(completion_id, subject_id)` dekt elke vraag die
--    `(completion_id)` dekte, want de kolom staat vooraan. Drie indexen die met
--    `completion_id` beginnen (deze, `completion_approvals_one_vote` en de
--    oude) op een tabel die veel schrijft, is schrijfkosten betalen voor niets —
--    en die redundantie ontstaat dóór deze migratie, dus hij hoort hier
--    opgeruimd te worden en niet in een issue. `one_vote` blijft: dat is een
--    unieke constraint met een ándere tweede kolom (`approver_id`) en die draagt
--    onwrikbare regel 9.

create index if not exists completion_approvals_subject_eigenaar_idx
  on public.completion_approvals (completion_id, subject_id);

drop index if exists public.completion_approvals_completion_idx;

commit;
