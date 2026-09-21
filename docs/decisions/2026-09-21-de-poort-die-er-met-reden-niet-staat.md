# De poort die er met reden niet staat — QS8-436

**21-09-2026.** QS8-431 zette in `kiesDocument()` een grootte-poort vóór het
lezen, en vroeg in criterium 5 of `kiesFoto()` dezelfde behandeling moest
krijgen. Het antwoord is **nee**, en dit document draagt waarom — want een
ontbrekende poort ziet er van buiten uit als een vergeten poort.

## Wat QS8-436 dacht dat er nodig was

Het issue schreef dat de vraag *"niet uit de types te beantwoorden en ook niet
uit de bron van de package"* was, en *"een meting op een écht toestel, per
platform"* vroeg.

📏 Die aanname klopt niet. `expo-image-picker` levert zijn native bron gewoon
mee: `node_modules/expo-image-picker/ios/` (Swift) en `android/` (Kotlin). Het
antwoord staat er letterlijk in. Dat is geen detail voor dit ene issue — **het
scheelt tussen "wacht op Quinten met een toestel" en "tien minuten lezen"**, en
die twee uitkomsten liggen ver uit elkaar voor een backlog die op één paar handen
draait.

⚠️ Wat er wél een toestel vraagt, staat hieronder apart. Dat hoort erbij: *"ik
kan het niet meten"* en *"het is in orde"* zijn twee dingen.

## De meting — gelezen in 57.0.14

| platform / formaat | wat `fileSize` beschrijft |
| --- | --- |
| **Android, altijd** | de **originele** grootte |
| iOS, JPEG | de **verwerkte** grootte |
| iOS, HEIC / TIFF / AVIF / WEBP / BMP | de **originele** grootte |
| iOS, PNG | opnieuw gecodeerd — kan **groter** zijn dan het origineel |

**Android**, `MediaHandler.kt:73`:

```kotlin
fileSize = fileData?.fileSize ?: outputFile.length(),
```

`fileData` komt uit `getAdditionalFileData(sourceUri)`, dat `OpenableColumns.SIZE`
opvraagt op de **bron**-URI. De gecomprimeerde `outputFile.length()` is alleen de
terugval als die query niets teruggeeft; bij een gewone MediaStore-URI geeft hij
wél iets terug.

**iOS**, `ImageUtils.swift:147`:

```swift
case UTType.heic.identifier:
  return (rawData, ".heic")
```

Voor HEIC, TIFF, AVIF, WEBP en BMP gaan de rauwe bytes ongewijzigd naar schijf en
doet `quality` niets. Alleen de `default`-tak hercodeert naar JPEG.

## ⚠️⚠️ En dit is zwaarder dan het getal: het gaat over twee verschillende bestanden

`kiesFoto()` leest `base64`, niet het bestand op schijf. En `base64` is op beide
platformen de **gecomprimeerde** versie — op iOS altijd JPEG via
`readJpegBase64From(…)`, met een comment in de bron erbij (*"Always export base64
as JPEG"*); op Android de uitvoer van `CompressionImageExporter`.

Bij een HEIC van 3 MB is `fileSize` dus 3 MB terwijl de app een JPEG van een paar
honderd kB verstuurt.

**Een poort op `fileSize` toetst niet het bestand dat de emmergrens raakt.** Hij
zou een foto weigeren die ruim binnen de 1 MB van de emmers valt (migratie 0222
en 0227) — een regressie voor de gewone gebruiker, geen bescherming. Dat is geval
3 uit het issue, met een sterkere onderbouwing dan dat geval verwachtte: de poort
leest niet *soms* het verkeerde getal, hij leest **structureel een ander
bestand**.

⚠️ Daar komt bij dat er op dit pad geen "ervóór" bestaat: `base64: true` maakt de
bytes bínnen de picker-aanroep. Dat argument stond in het issue voorop, en het is
het zwakste van de twee — het zegt dat een poort niets kan besparen, niet dat hij
schade doet. **Het tweede argument is de reden; het eerste is de aanleiding.**

## Waarom dit een grendel kreeg en niet alleen een alinea

Een meting die uit één versie van een pakket gelezen is, verloopt bij een
upgrade — en een alinea in een kop verandert dan niet mee. Daarom staat ze onder
`tests/beloftes/de-fotokiezer-meet-een-ander-bestand-dan-hij-verstuurt.test.ts`.
Die wordt rood zodra:

- de **major** van `expo-image-picker` verschuift;
- een van de drie gelezen takken uit de bron verdwijnt;
- iemand in `kiesFoto()` alsnog `fileSize` uitleest.

⚠️ **Op de major en niet op de volledige versie.** Een pin die bij élke patch
rood wordt, leer je bijwerken zonder te lezen — en dan bewaakt hij de gewoonte
in plaats van de meting.

### De ijking

Vijf mutaties, elk apart, stand ervóór en erna gemeten op 5 groen. Elke mutatie
maakt precies één toets rood, en telkens die welke hem noemt:

| # | mutatie | rood |
| --- | --- | --- |
| A | `fileSize` uitlezen in `kiesFoto()` | de bronzeef |
| B | de Android-regel naar `outputFile.length()` | de Android-pin |
| C | de iOS-heic-tak hernoemd | de iOS-pin |
| D | `readJpegBase64From` hernoemd | de base64-pin |
| E | de versie op `56.0.14` | de majorpin |

⚠️ B t/m E muteren de bron in `node_modules`. Dat is hier de juiste plek om te
breken: de belofte is *"die bron leest nog zoals hij gemeten is"*, en die breek je
niet door de toets te veranderen. Alle vier de bestanden zijn erna woordelijk
teruggezet en met `diff` vergeleken.

## Wat er níet gemeten is

De bron zegt wat de code **doet**; hij zegt niet wat iOS op runtime als eerste in
`itemProvider.registeredTypeIdentifiers` zet. Dáárvan hangt af of een
iPhone-foto in de HEIC-tak of in de JPEG-tak valt.

⚠️ **Voor deze conclusie maakt het niet uit**, en dat is de reden dat dit issue
niet op een toestel hoeft te wachten: Android is op zichzelf al beslissend, en
ook de iOS-JPEG-tak levert een `fileSize` van een bestand dat we niet versturen.
Eén foto kiezen op een iPhone bevestigt de takkeuze in tien seconden; de
redenering hangt er niet van af.
