# De kop die zijn eigen reparatie voorspelde

**Datum:** 24-09-2026
**Issue:** QS8-598 (gevonden in de audit van dezelfde dag)
**Status:** gebouwd
**Raakt:** `scripts/auditkop.mjs` (nieuw), `.claude/commands/audit.md`,
`tests/scripts/auditkop.test.ts`

## 1. Hoe dit boven kwam

Niet door te zoeken, maar doordat het mij een verkeerde bevinding liet
rapporteren. De audit van 24-09 opende met drie dingen voor Quinten, en het
derde was: _"`stand:controle` zegt niets en staat niet in CI."_

📏 **Beide helften zijn onwaar.** Hij staat sinds QS8-417 (10-09) in baan `repo`,
en zijn stilte is met opzet — `hoofd()` drukt op de succesweg alleen iets af als
je hem **zonder** `--controle` draait, en de poort telt hem als gemeten en
groen. Ik had hem los gedraaid, de stilte gelezen als een gebrek, en de kop van
`/audit` bevestigde dat met zoveel woorden.

## 2. Wat er in die kop stond

Een tabel _"Niet in CI"_, nagemeten op **31-08-2026**: drie controles, met bij
`stand:controle` de aantekening _"geen sleutel nodig — staat er gewoon niet in,
en dat is waarschijnlijk een omissie"_.

📏 Gemeten op 24-09-2026:

| bewering in de kop                   | gemeten                                     |
| ------------------------------------ | ------------------------------------------- |
| 23 van de 26 controles draaien in CI | **64 van de 74** (48 repo, 16 database)     |
| drie draaien niet in CI              | **tien**, alle met een reden in `ZONDER_CI` |
| `stand:controle` staat niet in CI    | **staat er wél in**, baan `repo`            |

## 3. De kop voorspelde zijn eigen reparatie

Twee alinea's lager stond, woordelijk:

> _Wie zo'n opsomming met de hand onderhoudt, onderhoudt hem niet — dit hoort
> een gegenereerde regel te zijn, zoals het stand-blok in WERKVOORRAAD §2._

Die machinerie kwam er in QS8-417: `scripts/ci-controles.mjs` deelt élke
`*:controle` in vanuit `package.json` en `HEEFT_DATABASE_NODIG`, `ZONDER_CI`
draagt de reden per uitzondering, en `cidekking:controle` wordt rood zodra er
een handmatige stap naast komt. **De kop van `/audit` was het laatste stuk dat
die bron niet las.**

⚠️⚠️ **En de instantie bijwerken is aantoonbaar niet de reparatie.** Dat is op
31-08 gedáán — `register:controle` en `vapid:controle` eruit, het getal
bijgesteld, mét een aantekening erbij dat dit eigenlijk gegenereerd hoorde te
zijn. Drie weken later stond er weer iets onwaars. Dat is QS8-417 in zijn eigen
kop: _een reparatie die de instanties opruimt en het mechanisme laat staan,
groeit terug — en hij doet dat onder een aantekening die de juiste diagnose al
stelde._

## 4. Wat er nu staat

`npm run auditkop` schrijft het blok tussen twee markeringen in
`.claude/commands/audit.md`, uit dezelfde indeling die CI gebruikt.
`auditkop:controle` wordt rood zodra het achterloopt, valt vanzelf in baan
`repo`, en draait dus in de poort én in CI — hij kan zijn eigen klasse fout niet
meer maken.

Twee keuzes zijn overgenomen van het stand-blok en één is nieuw:

- **Geen datum in het blok.** Anders verandert hij elke dag zonder dat er iets
  veranderd is, en is de conflictbron terug met een stempel die betrouwbaar oogt.
- **De redenen komen letterlijk uit `ZONDER_CI`** en worden niet herschreven.
  Twee plekken die hetzelfde uitleggen, lopen uiteen.
- **Een `|` in een reden wordt ontsnapt.** De redenen zijn handgeschreven proza;
  een kale streep knipt de tabelrij op en de laatste kolom valt weg. Dat is de
  klasse van QS8-415, hier vooraf afgevangen in plaats van achteraf gemeten.

📏 De eerste generatie: **65 van de 75** in CI (49 repo, 16 database), tien
erbuiten. `stand:controle` staat er niet meer bij.

## 5. De ijking

Stand ervóór gemeten: **14 groen, 0 rood**.

| #   | Mutatie                                                  | Wat er rood werd                                                                           |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | het blok met de hand op "23 van de 26" — het echte geval | _draagt de markeringen en een blok dat klopt_, en `auditkop:controle` meldt "loopt achter" |
| 2   | `stand:controle` terug in `ZONDER_CI` — de onware regel  | _noemt stand:controle niet als uitzondering_                                               |
| 3   | de streep-ontsnapping eruit                              | _ontsnapt een streep in een reden_                                                         |
| 4   | de blockquote eraf                                       | **de mutatie landde niet**                                                                 |
| 4b  | idem, met het juiste anker                               | _zet elke regel in een blockquote_, plus het echte document                                |
| 5   | de sortering eruit                                       | _sorteert de uitzonderingen_, plus het echte document                                      |
| 6   | `vervangBlok` zwijgt in plaats van te werpen             | _werpt als de markeringen ontbreken_                                                       |

⚠️ **Rij 4 is de les van QS8-593 nog een keer, en die blijft goedkoop te maken.**
Mijn `python`-anker matchte niet door een ontsnappingsfout, de suite bleef groen,
en dat zag er een seconde lang uit als "de blockquote doet er niet toe". **Een
mutatie die niets rood maakt is eerst een verdenking tegen de mutatie** — met
het juiste anker viel hij meteen om, op twee toetsen.

## 6. Wat dit niet is

- **Geen oordeel over `stand:controle`.** Er is niets mis mee; de kop beweerde
  dat er iets mis mee was.
- **Geen verruiming van `/audit`.** De tekst eronder — de stappen, de valkuilen —
  is onaangeroerd. Alleen de tabel die een stand beweert, is gegenereerd.
- **Geen belofte dat de rest van de kop klopt.** Dit blok bewaakt de
  CI-indeling. Andere getallen in dat bestand zijn nog steeds handwerk.

## 7. Stand

- `npm run poort`: niets rood; 25 controles ongemeten.
- `tests/scripts/auditkop.test.ts`: 14 groen.
- `cidekking:controle`: 65 van de 75 in CI, 10 met een reden.
