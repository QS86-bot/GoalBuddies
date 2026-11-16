# Een vaste streefdatum in een RLS-toets verloopt — 09-11-2026 (QS8-675)

**Beslist door:** de sessie die QS8-675 bouwde, binnen de beslisbevoegdheid van `CLAUDE.md`: een toets en een controle, geen commitment device, geen kosten, niets onomkeerbaars. Het datamodel en de RLS-policies zijn niet aangeraakt.

## Wat er gebeurde

Op 09-11-2026 stond `RLS-policies` rood op `main` (schema-run van 16:14 UTC) en op PR #660, zonder dat er iets aan de code veranderd was. Precies één toets viel om, 1 van 2175: `tests/rls/beheerdersgrens.test.ts`, *ruimt bij verwijder_lid() het openstaande deadline-verzoek op*, met `new row violates row-level security policy for table "goals"`.

📏 Lokaal gereproduceerd op een zelf opgebouwde stack (Postgres 16 en PostgREST 12.2.12, `scripts/lokale-stack.sh`): **1 rood, 9 groen** voor de reparatie, **10 groen** erna.

## Oorzaak

De toets zette `target_date: '2026-11-07'`. Sinds migratie 0170 weigert `goals_insert` een streefdatum die vóór `mijn_datum()` ligt. Geschreven op 22-09 met een datum die toen ver weg leek; vanaf 08-11 is hij verleden tijd. De database deed wat hij moest doen. Het was de vierde keer dat een vaste datum in deze familie verliep (de derde is QS8-668, `tests/rls/seizoensmoment.ts`).

## Wat er besloten is

1. **`datumOver(dagen)` in `tests/rls/datums.ts`.** Een datum relatief aan de klok, met een ondergrens van 2 dagen omdat `mijn_datum()` in de tijdzone van de gebruiker rekent (UTC-12 tot UTC+14) en de lokale datum dus tot een dag naast de UTC-datum ligt. De falende toets gebruikt 30 en 60 dagen.
2. **`npm run datums:controle`** (`scripts/vaste-datum-controle.mjs`): een vaste datum voor `target_date`, `p_new_date` of `p_date` in `tests/rls/` moet minstens **120 dagen** weg liggen. De controle wordt rood **vóór** de toets dat wordt, met vier maanden voorsprong.
3. **25 plekken in 15 bestanden omgezet** naar `datumOver(60)`: de plekken die al binnen het venster vielen (`2026-12-31` en `2027-01-01`). De afstand is bijna gelijk aan die van vandaag (52 en 53 dagen), zodat het gedrag van de toetsen niet verschuift.

## Wat afgewogen en niet gekozen is

* **Alles omzetten naar `datumOver()`, ook de datums ver weg.** Dat sluit de klasse volledig, maar het zijn 55 plekken onder de drie sleutels (45 `target_date`, 6 `p_new_date`, 4 `p_date`, op het moment van tellen), en ik heb niet per stuk gelezen of een toets op de afstand tot de streefdatum rekent. Een omzetting die ik niet kon lezen en alleen met de suite kon meten, is een tweede risico naast het eerste. Het venster geeft dezelfde bescherming tegen verlopen zonder dat. Wil de engineer het verbod, dan is dat een uitbreiding: het register `ZONDER_VERLOOP` en het venster zijn de twee knoppen.
* **De datum vastzetten met een nepklok in de database.** Dat toetst een andere database dan productie.
* **De policy versoepelen.** De database is hier juist: 0170 bestaat omdat een doel in het verleden een straf de dag erna verschuldigd kon maken.

## Wat de controle niet ziet

* **Andere sleutels.** `cycle_start_date`, `local_date` en dergelijke worden door het schema niet tegen "vandaag" gehouden en vallen buiten de drie sleutels. Wordt dat anders, dan is dat een nieuwe sleutel in `SLEUTELS`.
* **Een datum via een variabele** (`const d = '2026-11-07'; … target_date: d`) leest hij niet.
* **Een datum die het venster pas later binnenloopt** wordt wel gemeld, maar pas op het moment dat hij binnen 120 dagen komt. Dat is het ontwerp: een melding die elke dag opnieuw rood is, leer je overslaan.
* **Blokcommentaar waarvan de regels niet met `*` beginnen**: de eigen regelzeef (zie `ZONDER_KNIP` in `scripts/knip-controle.mjs`) ziet dat niet; het faalt dicht, als melding op uitleg.

## Gemeten

* De hele RLS-suite op de lokale stack, na de wijziging: **192 testbestanden en 2175 toetsen geslaagd, 1 overgeslagen**. Niet gemeten: dezelfde suite op `main` zelf vóór de wijziging (die was rood in CI op dezelfde toets).
* `tests/scripts/vaste-datum-controle.test.ts` (14 toetsen) en een ijking per grendel, elk apart gebroken: het venster, de grens zelf, `p_new_date`/`p_date`, het commentaar, de uitzonderingen, het wees-register en het rood worden. Elke mutatie liet precies de bedoelde toets omvallen.

## Terugdraaien

Haal `scripts/vaste-datum-controle.mjs`, zijn toets en de rij `datums:controle` in `package.json` weg, zet de rij in `ZONDER_KNIP` terug, en vervang `datumOver(60)` weer door een datum. Er is geen migratie, geen data en geen workflow bij betrokken.
