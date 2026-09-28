# De rijen die niemand las

**Datum:** 23-09-2026
**Issue:** QS8-595 (bijvangst van QS8-589)
**Status:** gebouwd
**Raakt:** `scripts/tabelcellen-controle.mjs`, `tests/scripts/tabelcellen-controle.test.ts`,
`docs/ENGINEER-REVIEW.md`, `docs/WERKVOORRAAD.md`,
`docs/decisions/002-domeinregel7-oppervlakken.md`,
`docs/decisions/2026-09-06-de-adempauze-wordt-vrij.md`

## 1. Hoe dit boven kwam

Niet door te zoeken. Bij QS8-589 hoorde een dossierrij, en die is — zoals de
werkafspraak vraagt — nagekeken met `npm run tabelcellen:controle`. Die zei
groen. 📏 Hij zei ook **hetzelfde aantal rijen als vóór de toevoeging**: 3867,
twee keer achter elkaar.

Dat getal had niet mogen kloppen, en dat is het enige wat er te zien was. De
proef erachteraan was één regel: een rij met drie cellen onder een kop van vier,
toegevoegd aan het einde van `docs/ENGINEER-REVIEW.md`. 📏 Exitcode **0**,
dezelfde tekst, geen klacht.

⚠️ **De controle was groen omdat hij niet keek.** Dat is precies de klasse
waarvoor hij in QS8-500 gebouwd is, en waarvoor QS8-415 de instanties opruimde.

## 2. Wat er aan de hand was

`klachtenVan()` sloot de lopende tabel bij de eerste regel die geen tabelrij is,
en sloeg daarna elke tabelregel zonder kop erboven stil over (`continue`). Dat
laatste is met reden zo gebouwd: een `|` staat in dit project ook in codeblokken
en citaten, en een controle die die meldt, leer je uitzetten.

Maar het maakt hem blind voor de vorm die hij juist moet vinden: **één lege
regel midden in een tabel**. Daarna is elke rij een rij zonder kop, en dus een
rij die niet gelezen wordt.

📏 Op `docs/ENGINEER-REVIEW.md`: lege regels op regel 541 en 822, en daardoor
**428** van de **748** datarijen gelezen. 320 rijen stonden buiten elke controle.

## 3. En het is geen telfout maar een renderfout

De eerste versie van dit issue schreef op dat die 320 rijen _waarschijnlijk_
niet als tabel renderen, met de GFM-spec als grond en met erbij dat het **niet
gemeten** was: `POST /api/markdown` is vanuit een cloudsessie niet bereikbaar
("sessions are bound to their configured repositories"), en de blobpagina van
GitHub rendert tegenwoordig in de browser — 📏 232 kB HTML, **nul** `<table>`.

Die aanname is alsnog gemeten, en wel met **`cmark-gfm`** — de renderer die
GitHub zelf gebruikt, uit het npm-register gehaald in een wegwerpmap buiten de
repo. 📏 Op `docs/ENGINEER-REVIEW.md` zoals hij op `main` stond:

|                                    | ervóór            | erna    |
| ---------------------------------- | ----------------- | ------- |
| `<tr>`                             | 430               | **750** |
| alinea's die met een `\|` beginnen | **2**             | 0       |
| tekens in die alinea's             | 552.087 en 80.135 | —       |

Die 320 rijen kwamen er dus uit als **twee muren tekst met strepen erin**. Geen
kolommen, geen risicokolom, geen stand — de hele tweede helft van het dossier.

⚠️ **Dat maakt dit een zwaardere bevinding dan "een controle telt niet mee".**
`docs/ENGINEER-REVIEW.md` is de agenda voor de engineer-review in november, en
`docs/decisions/002-domeinregel7-oppervlakken.md` is het document waar CLAUDE.md
de lezer bij **élk nieuw groepszichtbaar oppervlak** heen stuurt.

## 4. De reparatie, en waarom hij smal moest zijn

Een tabelregel zonder kop erboven wordt nu gemeld als **weesrij** — maar alleen
als er tussen hem en zijn kop **niets dan lege regels** staat. Staat er gewone
tekst tussen, dan is de tabel echt afgelopen en is de rij een alinea die
toevallig met een streep begint.

Twee grenzen kwamen erbij omdat de eerste meting ze eiste, en geen van beide is
bedacht:

- **Een regel met een scheidingsregel eronder is een kóp en geen wees.** Zo
  begint een tweede tabel onder een eerste, en dat is in dit project de gewone
  vorm. 📏 Twee van de zes eerste treffers waren dit, allebei terecht. Zonder
  deze vooruitblik meldt de controle de normale vorm, en dan leer je hem negeren.
- **Een codefence zet de lezer uit.** ⚠️ Dit verandert vandaag **niets** aan de
  uitslag en dat staat er met de meting bij: 📏 mét en zónder de knip telt de
  controle 721 tabellen en 4216 rijen in dezelfde 261 bestanden. Er staat geen
  markdown-tabel in een codeblok onder `docs/`. Hij staat er voor de vorm die
  dit project schrijft zodra iemand een tabel als voorbeeld toont.

En één melding per **reeks**, niet per rij: 320 losse regels zijn geen bevinding
maar een muur, en een muur leer je overslaan. De reeks heeft één oorzaak — de
lege regel erboven — dus hij is één melding, met zijn lengte erin.

## 5. Wat de controle vond zodra hij keek

Vier bestanden, en niet één:

| bestand                                                | reeks           | rijen |
| ------------------------------------------------------ | --------------- | ----- |
| `docs/ENGINEER-REVIEW.md`                              | vanaf regel 542 | 320   |
| `docs/decisions/002-domeinregel7-oppervlakken.md`      | vanaf regel 76  | 23    |
| `docs/decisions/2026-09-06-de-adempauze-wordt-vrij.md` | vanaf regel 142 | 6     |
| `docs/WERKVOORRAAD.md`                                 | regel 1293      | 1     |

En dáárachter zat de eigenlijke vondst. Zodra die 349 rijen gelezen wérden,
meldde de controle twee kapotte rijen in `002-domeinregel7-oppervlakken.md` —
rijen die er al stonden en die niemand kón zien, want ze werden niet gelezen:

- **Rij 20 (Commitments)** had een **zesde** cel onder een kop van vijf. GFM
  laat de overtollige cel aan het eind vallen, dus de hele passage over wat er
  met `commitment_due` en `commitment_unlocked` gebeurt bij een
  accountverwijdering (QS8-335, migratie 0247) stond in het bestand en nergens
  op het scherm. Teruggezet in cel 5, zonder iets aan de strekking te veranderen.
- **Boven rij 40** stond een **tweede, misvormde rij 40** met vier cellen: hij
  miste de kolom _Waar_. Zijn inhoud — dat dit oppervlak aan de straf en het
  doel hangt en niet aan `groups.zichtbaarheid` — stond niet in de echte rij 40.
  Samengevoegd; het fragment is weg.

📏 De telling gaat daarmee van **3867** naar **4216** rijen.

⚠️ **Dat is de opbrengst van het mechanisme en niet van de instanties.** De vier
lege regels weghalen was tien seconden werk; ze zijn in dit issue pas gevonden
doordat de controle ze noemde, en de twee kapotte rijen in 002 waren met geen
enkele handmatige blik te vinden — dat is precies wat QS8-500 al schreef over de
handmatige telling die vindt wat je toevallig aankijkt.

## 6. De ijking

Stand ervóór gemeten: **22 groen, 0 rood**. Eén mutatie per grendel, en gekeken
wélke toets omvalt.

| #   | Mutatie                                              | Wat er rood werd                                                               |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | een lege regel terug op regel 541 van het dossier    | _leest de documenten en vindt daar vandaag niets_; de controle meldt 320 rijen |
| 2   | de weesmelding eruit (terug naar de oude `continue`) | de vier weestoetsen                                                            |
| 3   | de kop-vooruitblik eruit                             | _laat een tweede tabel met een eigen kop met rust_, plus twee                  |
| 4   | de codefence eruit                                   | _telt een tabel binnen een codeblok niet als tabel_                            |
| 5   | élke niet-tabelregel houdt de verlaten kop in leven  | _laat een rij met rust waar gewone tekst tussen staat_, plus het echte corpus  |

⚠️ **Eén toets bewoog niet, en die staat er nog met de meting erbij.** _Laat een
streep in een codeblok met rust_ blijft groen mét én zónder de fence-knip: de
fenceregel is zélf ook een niet-tabelregel, dus hij sluit de verlaten kop
sowieso. Wat de knip wél draagt is de toets over een hele tabel binnen een
codeblok. De eerste blijft staan als must-allow, niet als grendel — stil
weghalen zou de meting wissen, stil laten staan zou hem als grendel laten lezen.
Zelfde keuze als bij QS8-589 een dag eerder.

## 7. Een toets die het defect vastlegde

⚠️⚠️ De suite droeg een toets die precies de stilte vastlegde die hier weg moest:
_stopt de tabel bij de eerste regel die er geen is_, met
`expect(uitslag.klachten).toEqual([])`. De naam klopte — de tabel stópt, en de
losse rij telt niet als gelezen rij — maar de lege klachtenlijst eromheen was
geen belofte, alleen de stand van toen.

Dat is regel 18 vraag 3 in zijn vervelendste vorm: een toets kan groen blijven
terwijl de belofte breekt, óók als hij zélf het gedrag vastlegt dat haar breekt.
De toets is herschreven en draagt die geschiedenis in zijn kop.

## 8. Wat dit niet is

- **Geen uitspraak dat elke `|`-regel een tabel hoort te zijn.** De melding komt
  alleen als er niets dan lege regels tussen de rij en zijn kop staat.
- **Geen reparatie van de rendering van GitHub.** De vier bestanden zijn
  hersteld; de controle voorkomt de volgende.
- **Geen wijziging aan de strekking van welke dossierrij dan ook.** De twee
  rijen in 002 zijn teruggezet in de kolom waar ze horen, met hun tekst intact.

## 9. Stand

- `npm run poort`: niets rood; 24 controles ongemeten — de gedocumenteerde set
  voor een cloudsessie.
- `tabelcellen:controle`: 721 tabellen, **4216** rijen in 261 bestanden.
- `tests/scripts/tabelcellen-controle.test.ts`: 22 groen.
- 📏 `cmark-gfm` over de vier herstelde bestanden: **nul** alinea's die met een
  `|` beginnen.
