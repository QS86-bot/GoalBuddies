# De knip die geen functie is

**Datum:** 28-09-2026 · **Issue:** QS8-576 · **Raakt:** `scripts/knip-controle.mjs`

## Waar dit over gaat

QS8-576 vroeg dat `knip:controle` een eigen commentaarknip vindt, ook als hij
niet `zonderCommentaar` heet. Dat issue is op 21-09 twee keer gebouwd. De eerste
versie (branch van QS8-576, detectie per bestand) is nooit als PR geopend. De
tweede (QS8-579, #575, detectie per benoemde functie) is dezelfde avond op
`main` geland. Dit document gaat over wat er ná QS8-579 nog openstond.

## Wat QS8-579 zelf als rand opschreef

`knipVormenIn()` ziet een knip in het lichaam van een benoemde functie met één
parameter. De kop ervan zegt met zoveel woorden wat hij mist: een pijlfunctie,
een methode, een knip die teken voor teken loopt, en een knip met twee
parameters.

## De meting

📏 Op `origin/main` = `daa22b64` de bestandsdetector van de oorspronkelijke
QS8-576-branch naast de controle van `main` gelegd, over `scripts/`, `tests/`,
`src/` en `app/`: **acht** bestanden passen een eigen knip toe die geen van de
drie helften ziet en die in geen enkel register staan.

| bestand | vorm |
| -- | -- |
| `scripts/logboek-controle.mjs` | SQL, teken voor teken |
| `scripts/migraties-controle.mjs` | SQL, verzamelt de kop |
| `tests/beloftes/een-document-voert-niets-uit.test.ts` | blok en regel |
| `tests/beloftes/een-foto-is-getekend-of-niets.test.ts` | blok en regel |
| `tests/beloftes/geen-foto-verlaat-de-app-met-metadata.test.ts` | blok |
| `tests/beloftes/pushdienst-allowlist.test.ts` | SQL-regelfilter |
| `tests/migraties/bewaking-zonder-lijst.test.ts` | SQL, regelbehoudend |
| `tests/rls/functiegrants.test.ts` | SQL, regelbehoudend |

## Twee daarvan faalden open

`een-document-voert-niets-uit.test.ts` en `een-foto-is-getekend-of-niets.test.ts`
knipten hun props-blok met een regelcommentaar-regex **zonder** de `:`-wacht van
QS8-412, terwijl hetzelfde bestand twee regels hoger de goede vorm gebruikt.

| mutatie | vóór | ná |
| -- | -- | -- |
| `Document.tsx`: `soort: 'pdf' \| 'https://voorbeeld' \| null; readonly pad: string;` | **61 groen** | *heeft geen url- of pad-prop* rood |
| tegenproef zonder de URL | rood | rood |
| `Foto.tsx`: `alt: 'https://x'; readonly pad: string;` op de regel van `url` | **13 groen** | *heeft geen pad-, bucket- of uri-prop* rood |

De tegenproef bewijst dat de mutatie de grendel bereikt en dat het groen door
de URL kwam.

## Het besluit: een vierde helft, per bestand

`bestandsvormenIn()` kijkt of een bestand érgens een commentaar-afbakening op
bron toepast, in drie vormen (`blok`, `regel-js`, `regel-sql`). Een bestand met
zo'n vorm krijgt een klacht als het geen pas heeft: het importeert geen gedeelde
knip, staat niet in `MET_REDEN`, `GEEN_KNIP` of `EIGEN_KNIP`, en de eerste en
derde helft zien er geen benoemde knip in.

**De prijs is acht rijen in `EIGEN_KNIP`**, elk met een reden. De twee blinde
knippen hebben daarbij de `:`-wacht gekregen; ze houden hun eigen knip, want die
haalt ook een áchterlopend commentaar weg, en de gedeelde knip doet dat niet.

⚠️ **Met opzet niet "alles".** De SQL-vorm eist dat de knip op iets
bron-achtigs werkt (`regel`, `bron`, `inhoud`, `sql`, …). 📏 Zonder die eis
meldde een eerdere versie op 21-09 het `--` van een git-aanroep, een
CLI-argument en een URL-regex.

## De rand

- **Per bestand.** Een bestand dat al een pas heeft, krijgt die ook voor een
  tweede, naamloze knip ernaast. Dezelfde grens als `knipt()` al had.
- **`tests/scripts/`** blijft buiten beeld, om dezelfde reden als bij de andere
  helften (`ZONDER_TOETS`).
- **`hoofd()` staat niet onder een unit-toets.** 📏 Met de hand gemeten: een
  verweesde `EIGEN_KNIP`-rij geeft exit 1, en zonder de bedrading in `hoofd()`
  exit 0. Zelfde stand als bij de andere drie registers.

## IJking

Per grendel één mutatie, en telkens gekeken wélke toets omviel (87 toetsen in
`tests/scripts/knip-controle.test.ts`, ervóór alle 87 groen):

| mutatie | wat er omvalt |
| -- | -- |
| de vierde helft niet aanroepen in `klachten()` | *meldt een naamloze knip in een bestand zonder pas* |
| `EIGEN_KNIP` negeren | *zwijgt over een bestand dat in EIGEN_KNIP staat*, en de controle zelf (exit 1) |
| een gedeelde knip geeft geen pas | de must-allow op de import, en de verweesde rij die inmiddels importeert |
| `verweesdeEigenKnippen()` let niet op "knipt niet meer" | *meldt een rij waarvan het bestand niet meer knipt* |
| de regelvorm zonder wacht niet herkennen | *een regelknip zonder wacht* |

## ⚠️ De les over het dubbel bouwen

QS8-576 werd om 14:56 UTC geclaimd en om 15:20 afgebouwd, zonder PR. QS8-579
werd om 18:20 geclaimd voor hetzelfde gat, onder een ander nummer, en landde.
De claim beschermt een issuenummer en geen probleem: twee issues over hetzelfde
gat botsen niet. Dat is geen regel die een script kan dragen. Wie een issue
aanmaakt, zoekt eerst of het gat al een issue heeft; wie een branch afbouwt,
opent de PR dezelfde dag.
