# Eén statusrood voor de hele app (QS8-743)

Besluit Quinten, 19-11-2026 (reactie op QS8-743): **één statusrood voor alle uiterlijken, donker en licht**, geen eigen rood per
uiterlijk. Dit document zegt welke waarde dat is, waarom precies die, en wat het kost.

## Wat er staat

| Modus | Was | Wordt |
|---|---|---|
| donker (A, B, C-Baai, C-Avondgloed) | `#f05a54` | `#ff3f1e` |
| licht (A, B, C-Baai, C-Avondgloed) | `#b8352f` | `#cd0034` |

Alleen `red` in `navy` en `navyLight` (`src/shared/theme/tokens.ts`); A, B en C erven hem. Geen waarde per palet.

## De eis en de zoekruimte

Elke sRGB-kleur (stap 1–3 per kanaal) met een roodtint (OKLab-hoek 5–42°, chroma ≥ 0,13) is gemeten tegen **alle** paletten van de
modus: de drie families, het accent, beide tinten van elk accentverloop, oranje, groen, grijs en de twee Koraal-kleuren
(`#fb7185`, `#fdba74`, QS8-725). Eis: gewone `kleurafstand` ≥ `MIN_AFSTAND` (10) tot al die kleuren, contrast ≥ 3:1 op bg, panel,
panelDark en het einde van het achtergrondverloop.

📏 **Gemeten.** Het oude rood lag op 6,9 van Koraal (donker; 5,7 in het issue is het slechtste geval over kleurenblindheid) en op 6,7 van
oranje (licht, `#b3541c`) en 4,2 van de roze familie. Zonder verschuiving komt Koraal er niet in.

| | afstand, gewoon | afstand, slechtste kleurenblindheid | contrast bg/panel | contrast overal |
|---|---|---|---|---|
| donker oud `#f05a54` | 6,9 (Koraal) | 4,4 (roze familie) | 4,62 | 3,33 |
| donker nieuw `#ff3f1e` | **10,9** (oranje) | 5,3 (oranje) | 4,39 | 3,16 |
| licht oud `#b8352f` | 6,7 (oranje) | 3,5 (oranje) | 5,37 | 4,67 |
| licht nieuw `#cd0034` | **11,2** (accenttint Avondgloed) | 2,4 (oranje) | **5,28** | 4,60 |

Ignis (`#B3211E`) ligt op 16,7 (donker) en 5,8 (licht, was 3,1) van het nieuwe rood; het heldenpalet is ongewijzigd.

## Waarom precies deze

- **Donker `#ff3f1e`:** de vermiljoenband is de enige roodtint die tussen roze (softskills), Koraal en oranje door past. Hij ligt
  op de rand: 10,9 en contrast 3,16 op het donkerste verloopeinde. Een nog heter rood (`#ff3000`) haalt 12,3, maar zakt op 3,0.
- **Licht `#cd0034`:** de dichtstbijzijnde toegestane waarde die ook 4,5:1 haalt. Heldere roden zonder die eis bestaan wel
  (`#e62068`), maar liggen in het roze en lezen niet meer als rood.

## Wat het kost, en wat niet gehaald is

1. ⚠️ **Rood als tekst haalt in donker 4,39:1 en niet 4,5:1** (het oude rood haalde 4,62). Gezocht over elke roodtint van elk palet:
   de enige kleur die 4,5:1 haalt én 10 afstand houdt tot Koraal is `#ffa0c5`, een roze. Dat is geen rood, dus de bodem is
   4,3 (`statusrood.test.ts`) en dit is een bewuste afwijking van criterium 2 voor de weinige tekst in rood (`Text danger`).
   Als dat te veel is, is de oplossing dat een foutmelding niet meer rode tekst is maar een ander teken; dat is een besluit
   voor Quinten en niet iets dat ik hier meepak.
2. **Slechtste-geval kleurenblindheid** ligt lager dan de eis uit het issue (donker 5,3; licht 2,4 tegen oranje). De bestaande
   toetsen eisen die waarde niet voor status tegen status (alleen voor families onderling), en de statuskleuren dragen daarom
   een vorm naast de kleur (`risicoTeken`). Een rood dat ook dat haalt, bestaat niet binnen de rood-oranje-bandbreedte;
   gemeten, niet aangenomen.
3. **Koraal licht bestaat nog niet.** Het donkere Koraal is hier meegenomen; QS8-725 toetst zijn lichte variant tegen
   `#cd0034` via dezelfde tabel.
4. **Op de verloopbasis van Avondgloed donker (`#3b1a4f`)** is het contrast 3,16; de marge is klein.

## Wat dit níet is

Geen nieuwe plek voor rood. `statusrood.test.ts` legt vast dat alleen de rol `atRisk` rood is en dat buiten het thema precies
drie bestanden hem lezen (Risico-radar, veldrand bij een fout, `Text danger`). Dat `Text danger` een foutmelding kleurt is er al
sinds voor dit issue; of foutmeldingen rood horen te zijn is een vraag voor domeinregel 7 en niet beantwoord hier.

## Aannames, niet gemeten

- Dat de benaderende kleurenblindheidsmatrices (`kleurafstand.ts`) de werkelijkheid goed genoeg volgen.
- Het vóór-/ná-screenshot per palet (criterium 5) is hier niet gemaakt: er is in een cloudsessie geen lokale stack. De tabel
  hierboven vervangt het niet; de bouwsessie met de stack levert de screenshots bij QS8-725.
