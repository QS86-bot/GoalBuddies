# Een grendel die op een naam afgaat, bewaakt de naam

**21-09-2026 — QS8-576**

## Waar dit over gaat

QS8-567 zette twee helften onder `knip:controle`. De eerste eist dat elke eigen
knip de gedeelde importeert of met een reden in `MET_REDEN` staat, en vond die
knippen zo:

```js
export const DEFINITIE = /(?:export\s+)?function\s+(zonderCommentaar\w*)\s*\(/g;
```

Dat is een detector op **naam**. De tweede helft had hem nog kunnen vangen, maar
die draait alleen op `scripts/`. Een knip in `tests/`, `src/` of `app/` viel dus
door allebei.

## De meting

📏 Geteld op 21-09-2026, over `scripts/`, `tests/`, `src/` en `app/`:

| | |
|---|---|
| knippen die `zonderCommentaar*` heten | **18** |
| knippen die iets anders heten of naamloos zijn | **19** |

**Meer dan de helft van het veld was onzichtbaar.**

De aanleiding was één instantie: tijdens QS8-570 kwam er een knip bij in
`tests/migraties/idempotentie.ts` — teken voor teken, geneste blokken,
dollar-quotes, literaalinhoud. Naar elke maatstaf uitgebreider dan de meeste
rijen die al in `MET_REDEN` stonden. Hij heette `schoneBron`.

Identieke code, groen bij die naam, rood zodra hij `zonderCommentaarEnTekst`
ging heten. **Wat de grendel zag, hing af van de naam** — en `schoneBron` was
gewoon de betere naam voor wat de functie doet. Dat maakt het erger, niet beter:
dit is de vorm die je per ongeluk bereikt.

⚠️ En er zat er eentje bij die ík gemaakt heb. `avatar-controle.mjs` had een
lokale `const zonderCommentaar`; bij QS8-567 heb ik die hernoemd naar `codeDeel`
omdat hij de geïmporteerde overschaduwde. Dat was nodig, en het maakte de knip
in één klap onzichtbaar voor de controle die ik in datzelfde issue bouwde.

## Het besluit: op gedrag, met een register

`knipvormenIn(bron)` kijkt naar wat een bestand **doet** — past het een
commentaar-afbakening toe op bron — en meldt welke van drie vormen: `blok`,
`regel-js`, `regel-sql`. Drie en niet één, want een SQL-knip is een andere
belofte dan een JS-knip, en een registerrij hoort te kunnen zeggen welke hij
heeft.

**De prijs staat hier omdat hij echt is: 16 registerrijen.** Dat is de kost van
detectie op gedrag, en hij is met opzet betaald — wat het register toevoegt is
dat de vólgende knip een keuze wordt in plaats van een gewoonte.

### Waarom niet "alles detecteren"

📏 Een ruwer signaal meldde er **29**, waarvan er tien geen knip waren: het `--`
van een git-aanroep, een CLI-argument, `https://` in een URL-regex, een regex
die sterretjes uit vetgedrukte tekst haalt.

De eis dat een SQL-knip op iets **bron-achtigs** werkt (`regel`, `bron`,
`inhoud`, `sql`, …) bracht dat terug naar 19. Een register dat volloopt met
zulke rijen leert je hem te negeren — dezelfde waarschuwing als bij de
`GEEN_FOUTCODE`-lijst in `foutsleutel-controle.mjs`, die zo breed was dat hij
nooit bereikt werd.

## Twee knippen droegen de QS8-412-vorm

`tests/beloftes/datumopmaak.test.ts` en
`tests/beloftes/onboarding-schrijft-niets-over.test.ts` heetten allebei
`ontdaanVanCommentaar` en gebruikten een regel-commentaarregex **zonder** de
`:`-wacht — precies de vorm die alles opeet ná de dubbele schuine streep van een
URL, en die dit project bij QS8-412 een halve ijking kostte.

📏 Hun doelbestanden dragen vandaag geen URL, dus de fout was **latent**. Hij
stond er wel. Allebei gebruiken ze nu de gedeelde knip, die de URL-vorm in zijn
eigen ijking heeft staan.

⚠️ Dat is meteen het antwoord op de vraag of het register niet gewoon
gedoogbeleid is: de detector vond twee echte defecten die niemand zocht.

## Wat de andere veertien rijen zeggen

Ze houden met reden hun eigen vorm, en die redenen zijn niet inwisselbaar:

- **vier** verzámelen de kopregels in plaats van ze weg te knippen
  (`migratie-hernummer`, `migraties-controle`, `rollbackpad`) — de kop ís daar
  het onderwerp, en dat is een andere belofte dan een knip;
- **vier** in `tests/beloftes/` halen óók een áchterlopend `//` weg, mét
  `:`-wacht — dus **strenger** dan de gedeelde knip, die alleen hele
  commentaarregels filtert;
- **drie** knippen SQL regelbehoudend, omdat hun melding een regelnúmmer draagt;
- de rest is taal- of positiegebonden.

## ⚠️ Een observatie uit het schrijven zelf

Twee keer tijdens dit issue brak een bestand omdat ik in een JSDoc-blok over
commentaartekens schreef en de tekst een `*` gevolgd door een `/` bevatte — dat
sluit het blok. Eén keer in een testkop, één keer in de kop van `KNIPVORM` zelf.

Dat is geen anekdote maar de reden dat deze klasse blijft terugkomen: **de plek
waar je uitlegt hoe je commentaar behandelt, is zelf commentaar.** Wie hierover
schrijft, schrijft binnen het ding dat hij beschrijft. Vermijd de letterlijke
combinatie in proza en beschrijf hem in woorden.

## Wat hierna nog openstaat

QS8-572 gaat over de **tweede** helft: vier vormen die
`leestBronMetNaampatroon()` mist, en twee bronlezers zonder classificatie. Dit
issue raakt dat niet aan.

En de grens die blijft: `knipt()` en de registers oordelen per **bestand**. Een
bestand met twee leesplekken krijgt een pas zodra er één knipt — het geval dat
QS8-567 zelf opleverde, en dat nog steeds handwerk is.
