# Zeventien knippen met één naam

**13-09-2026 — QS8-446.**

## 1. Wat er gemeten is, en hoe de telling drie keer veranderde

Het issue begon met *"27 kopieën"*. 📏 Dat getal klopt voor het aantal
**definities**, maar niet voor wat het suggereert:

```
definities van zonderCommentaar* : 27
bestanden die hem importeren     :  2
verschillende implementaties     : 17
```

**Het zijn geen 27 kopieën van één functie.** Het zijn zeventien verschillende
functies met dezelfde naam, en een deel daarvan doet met reden iets anders: vier
knippen **SQL**-commentaar (`--`), één knipt óók stringliteralen weg, en twee
vervangen een blok door evenveel regeleindes omdat ze regelnúmmers melden.

⚠️ **En de telling van "hoeveel zijn er blind" veranderde drie keer: 14, toen 2,
toen 1.** De eerste twee kwamen uit een script dat op de vórm van de regex
zocht. Alleen met de hand lezen gaf het goede getal:

| Bestand | Waarom hij er blind uitziet en het niet is |
| -- | -- |
| `tests/beloftes/uitkomsttypen.ts` | `/(^\|[^:])\/\/.*$/` — de `[^:]` is de wacht tegen `://` |
| `scripts/gedeelde-identiteit-controle.mjs` | `/^\s*\/\/.*$/gm` — verankerd aan regelbegin |

📏 **Eén was er echt blind:** `tests/beloftes/datum-uit-een-kalender.test.ts`,
met `.replace(/\/\/[^\n]*\/g, '')`. Latent en niet levend — geen enkele `.tsx`
onder `app/` bevat vandaag een `://`, en dat is precies de verzameling die die
test scant.

**De wekelijkse audit noemde er vijf.** Dat getal was nooit nagemeten.

## 2. Waarom dit geen netheidskwestie is

CLAUDE.md noemt deze knip met zoveel woorden een grendel op zichzelf: *"De knip
die een controle scherp houdt, is zelf een grendel."* Bij QS8-412 werd de suite
rood op een ándere toets dan de grendel die de mutatie noemde, en de bedoelde
grendel bleef groen — doordat deze knip in twee bestanden blind was voor
`https://`.

De reden eronder: **deze knip bepaalt wat er *code* heet en wat *uitleg*.** Een
zeef die te veel wegknipt blijft groen terwijl de belofte breekt, en een zeef die
niets meer vindt ziet er precies zo uit als een zeef die niets te vinden heeft.

## 3. Het besluit

**Eén gedeelde bron voor de JS/TS-knip, een register voor de rest, en een
controle die de volgende definitie meldt.**

- `scripts/zonder-commentaar.mjs` draagt de kanonieke knip — de regelvorm, die
  een URL overleeft. **`.mjs` en niet `.ts`,** want `scripts/` is plain JS en kan
  geen `.ts` uit `tests/` halen; andersom kan wel. Dat is dezelfde vorm als het
  psql-register (QS8-414): twee bomen mogen elk hun eigen standaard hebben,
  zolang ze er elk maar één hebben — hier is het er zelfs één voor allebei.
- **Zeven definities zijn eruit:** de zes byte-identieke (implementatie 1) en de
  ene blinde. 27 − 7 = **20**.
- De twintig die blijven staan met reden in `MET_REDEN` van
  `scripts/knip-controle.mjs`. ⚠️ **Op bestand én functienaam**, niet op bestand
  alleen: een uitzondering per bestand zou ook de knip vrijstellen die er morgen
  bijkomt.
- `npm run knip:controle` wordt rood bij een nieuwe definitie **en** bij een
  registerrij waarvan de knip verdwenen is. Die tweede kant is er om dezelfde
  reden als bij `ZONDER_CI`: een vrijstelling die blijft staan nadat zijn geval
  weg is, laat de volgende er gratis langs.

**Wat dit besluit níet is:** geen poging alle zeventien vormen gelijk te trekken.
Die verschillen zijn de reden dat ze bestaan. Wat het toevoegt is dat de
**achttiende** een keuze wordt in plaats van een gewoonte.

## 4. De ijking

📏 **Zes mutaties, één per grendel, alle zes met de hand rood gezien op
13-09-2026, met vooraf gemeten 27 groen.**

| Mutatie | Wat er brak | Wat er rood werd |
|---|---|---|
| A | de knip terug naar de blinde regexvorm | 5, waaronder alle drie de url-toetsen |
| B | blokken niet meer weggeknipt | 4 |
| C | een nieuwe eigen knip erbij | `knip:controle` — de nieuwe naam **én** de verweesde rij |
| D | een registerrij waarvan de knip weg is | `knip:controle`, exitcode 1 |
| E | de definitiezeef telt een import mee | 2 — waaronder "maar niet een import of een aanroep" |
| F | het commentaar niet meer geknipt vóór het tellen | `knip:controle` meldt zijn **eigen** uitleg |

### ⚠️ Twee dingen die bij het ijken misgingen, en ze horen allebei hier

**F is geen bedachte mutatie maar een gemeten fout.** De eerste versie van
`definitiesIn()` las de kale bron, en de controle meldde prompt zijn eigen kop —
die een definitie citeert om uit te leggen waarom de ijkingsmap erbuiten valt.
De reparatie is dat hij de gedeelde knip gebruikt vóór hij telt. Dat hij daarvoor
de knip inzet die hij zélf bewaakt, is de goedkoopste ijking die er is: gaat die
knip stuk, dan gaat deze controle mee. Zelfde stap en zelfde reden als in
`gedeelde-identiteit-controle.mjs`.

**En D leek eerst niets te doen.** Mijn ijkhulpje gaf geen enkele regel terug, en
dat leest als *"de grendel vuurt niet"*. Met de hand overgedaan — mutatie erin,
`grep` erop, script gedraaid — bleek hij gewoon te werken, exitcode 1 en de
verweesde rij bij naam. ⚠️ **Een lege uitslag is geen uitslag.** Dat is dezelfde
les als bij QS8-442, waar de eerste poging tot mutatie C groen bleef omdat de
mutatie het defect niet nabootste: bij een ijking is de stille uitkomst degene
waar je twee keer naar moet kijken.

## 5. De prijs, opgeschreven

`tests/scripts/` valt buiten de controle. Een ijkingstest voedt zijn controle
precies de vormen die hij moet vinden — hier dus definities als **string** — en
📏 zonder die uitzondering meldde de controle acht treffers in zijn eigen toets.

De prijs is echt: een knip die écht in `tests/scripts/` gedefinieerd wordt, ziet
deze controle niet. Dat is smal — die map bevat toetsen óver scripts en geen
zeven die zelf bron lezen — maar het is geen nul, en daarom staat het er.
