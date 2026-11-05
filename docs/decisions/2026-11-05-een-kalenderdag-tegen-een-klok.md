# Een kalenderdag tegen een klok — 05-11-2026

**Issue:** QS8-668.
**Raakt:** `tests/rls/nevenschade.test.ts`, `tests/rls/seizoensmoment.ts`,
`tests/beloftes/de-seizoenstest-volgt-de-klok.test.ts`.
**Beslist door:** de bouwsessie, binnen de beslisbevoegdheid: een testprobleem,
geen migratie, geen RLS-definitie.

## Wat er mis was

`nevenschade.test.ts` zet zijn weken `now()`-relatief neer en gaf
`maak_seizoensrecaps()` een vaste `p_op` mee: `2026-10-01T06:30:00Z` in de
bereikstest en `2026-11-15T02:30:00Z` in de grenstest. `seizoensgrens()` wijst
het kwartaal vóór `p_op` aan, dus die vaste datum wees een venster aan waar de
fixture elke week een stukje verder uit wegschoof. 📏 Op 02-11 en 05-11 gaf de
voorwaardetoets 0 recaps; de RLS-job stond rood op `main` (sha `8c7d1707`, de
sha van een groene run op 06-10), op de claim-commit en op de afleversha van
QS8-651 — identiek, één test van 2176.

De test had het zelf voorspeld, letterlijk: *"valt vanaf begin november 2026
buiten het seizoen"*. En het was de derde keer in deze familie: `2026-05-13` →
`2026-11-15` (31-08), en nu allebei.

## Wat er níet mis was

De voorwaardetoets. Die bestaat sinds QS8-577 om stil slagen te voorkomen en
heeft precies dat gedaan: luid omvallen in plaats van groen zonder iets te
bewaken. De fout zat ervóór — een kalenderdag naast een klok.

## De reparatie

`seizoensmomenten(peildatum, tz)` in `tests/rls/seizoensmoment.ts` rekent uit de
fixture zelf: het kwartaal van de peildatum (week `-2`, de middelste
goedgekeurde week), de eerste dag van het kwartaal erna om 08:30 lokaal als
`open` (grens open: `is_eerste_dag` én `is_acht_uur`), en twee weken later om
02:30 lokaal als `dicht` (zelfde afgesloten seizoen, grens dicht). Beide tests
lezen die momenten; er staat geen datum meer in het bestand.

⚠️ **De peildatum is week `-2` en niet `cyclus.startDate`.** De fixture heeft
goedgekeurde weken op `-4`, `-3`, `-2` en `-1`; welk kwartaal die ook straddlen,
het kwartaal van `-2` bevat minstens die ene en de groep telt dus nooit als stil.

⚠️ **`utcFromZoned()` en `parseIsoDate()` komen rechtstreeks uit
`src/shared/time/zoned.ts`** en niet via de publieke rand. Ze op de rand zetten
voor één testhelper is een export zonder pad naar een scherm; een eigen
datumberekening in de test is correctheidsregel 7 overtreden. Van de twee is
een directe import van een bouwsteen de kleinste afwijking.

## Hoe het bewaakt wordt zonder database

De RLS-suite draait in een cloudsessie niet (geen PostgREST; het ophalen van de
binary is in deze sessie geweigerd). `tests/beloftes/de-seizoenstest-volgt-de-klok.test.ts`
toetst daarom de rekenregel: exacte waarden voor zomer- en wintertijd, de
eigenschap "eerste dag om acht uur" voor de open kant en het tegendeel voor de
dichte kant, en — acceptatiecriterium 3 — met `freezeNow()` de klok in vier
kwartalen, waarbij de fixture-week elke keer in het aangewezen seizoen ligt.
Vier mutaties met de hand gedraaid; de kop van de test zegt per mutatie welke
tests omvielen. ⚠️ Mutatie 3 is de fout van `main` zelf, en die wordt rood op
precies de klokstand van 05-11-2026.

**Wat ongemeten blijft tot CI draait:** dat de RLS-job op deze tak groen is. De
redenering dat hij dat wordt is: dezelfde functie, hetzelfde seizoen als de
fixture, één recap bij `open` en nul bij `dicht` — maar dat is redenering, en de
CI-run op de afleversha is de meting.

## Wat er níet mee besloten is

- Of `seizoensrecap.test.ts` ook aan de beurt is. Dat bestand gebruikt vaste
  weken (`2026-07-06`, `2026-08-10`) mét een vaste `EERSTE_DAG_Q4`; die twee
  horen bij elkaar en verlopen niet. Grep op `p_op: '20` en `MOMENT = '` in
  `tests/rls/` vond buiten `nevenschade.test.ts` niets.
- Een tweede tak voor `season_cadence = 'monthly'`. Geen fixture staat erop.
