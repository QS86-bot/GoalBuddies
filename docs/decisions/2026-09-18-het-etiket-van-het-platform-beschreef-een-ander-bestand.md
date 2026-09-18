# Het etiket van het platform beschreef een ander bestand

**Datum:** 18-09-2026 · **Issue:** QS8-547 · **Aanleiding:** criterium 1 van QS8-436

## Wat er mis was

`kiesFoto()` vroeg `expo-image-picker` om `base64: true` en gebruikte twee dingen
uit het antwoord: de **bytes** uit `base64`, en het **formaat** uit `mimeType`.

Die twee gaan over verschillende bestanden.

📏 Gelezen in de meegeleverde native bron van `expo-image-picker` **57.0.14**, per
schakel:

| # | waar | wat er gebeurt |
| -- | -- | -- |
| 1 | `ios/ImagePickerModule.swift:94` | zonder `allowsEditing` gaat iOS naar de **PHPicker** |
| 2 | `ios/ImagePickerOptions.swift:44` | `preferredAssetRepresentationMode` staat op `.current` — geen transcodering |
| 3 | `ios/MediaHandler.swift:131` | de fast path eist `quality >= 1`; met 0.6 volgt de slow path |
| 4 | `ios/ImageUtils.swift:146` | `case UTType.heic.identifier: return (rawData, ".heic")` — de **originele** bytes |
| 5 | `ios/MediaHandler.swift:200-202` | die bytes gaan naar schijf als `.heic`; `fileSize` leest dát bestand |
| 6 | `ios/MediaHandler.swift:307` | `mimeType` volgt de extensie → `image/heic` |
| 7 | `ios/MediaHandler.swift:210` | `base64` is altijd JPEG: `readJpegBase64From(image:compressionQuality:)` |

Dus: `mimeType = image/heic`, `base64 = een JPEG`. `image/heic` staat niet in
`GEKEND`, dus `ontdoeVanMetadata()` gaf `onbekend_formaat` en de gebruiker las
`chatfoto.kiezen_mislukt`.

**Een foto van een iPhone die op "Hoge efficiëntie" staat — de standaard sinds
iOS 11 — kon niet verstuurd worden.** Niet in de groepschat, niet als bewijs.

⚠️ En er zat een tweede helft aan die niet in het issue stond: ook de omgekeerde
scheefstand deed pijn. Een **png** waar het platform `image/jpeg` op plakt, ging
door `knipJpeg()` en kwam eruit als `stukke_afbeelding` — een foutmelding op een
volstrekt geldig bestand. Gevonden doordat de must-allow-test bij de ijking
meeviel; zie hieronder.

## Waarom geen enkele test dit zag

Er stonden twee suites op dit pad en allebei bleven ze terecht groen:

- `geen-foto-verlaat-de-app-met-metadata.test.ts` toetst dát elke kiezer via
  `ontdoeVanMetadata()` loopt.
- `een-bijlagekeuze-valt-nooit-stil.test.ts` toetst dát een keuze niet stilvalt.

Dat zijn eigenschappen van **onderdelen**: de routering en de afloop. De belofte —
*er komt een foto uit* — had geen test. Regel 18, vraag 2 en 3, in zijn zuiverste
vorm: elk onderdeel klopte. De picker leverde geldige data, `ontdoeVanMetadata()`
weigerde terecht een formaat dat hij niet kan strippen, en de faalstand viel
terecht dicht. **De naad was dat niemand de twee formaatbegrippen naast elkaar
had gelegd.**

📏 Het woord `heic` kwam één keer voor in de hele repository, in een
beslisdocument, als hypothese.

## Het besluit

**Het formaat komt uit de bytes.** `herkenFormaat(bytes)` in
`src/shared/afbeelding` leest de kop en geeft `image/jpeg`, `image/png`,
`image/webp` of `null`. Beide kiezers gebruiken hem; `gekozen.mimeType` wordt
nergens meer gelezen.

Dat is de conservatiefste vorm die het werk áf maakt:

- **Niet** `image/heic` aan `GEKEND` toevoegen. Er is geen `knipHeic()`, dus
  `knip()` zou terugvallen op `knipWebp()` — een stripper die het formaat niet
  kent, op precies het pad waar QS8-395 belooft dat er geen coördinaten uit gaan.
- **Niet** `preferredAssetRepresentationMode: 'compatible'` meegeven. Dat
  verplaatst het probleem naar het toestel, verandert niets op Android, en laat
  de scheefstand tussen de twee velden staan.
- **Niet** de handtekening van `ontdoeVanMetadata()` wijzigen. Zijn suite voedt
  bewust mismatchende mimes (`ontdoeVanMetadata(jpegMetGps(), 'image/gif')`) en
  bewaakt daarmee echte eigenschappen; die verbouwen om deze bug te dichten is de
  verhuizing waar CLAUDE.md voor waarschuwt.

### De prijs

`herkenFormaat()` kijkt naar de eerste bytes en niet naar het hele bestand. Een
bestand dat met een geldige JPEG-kop begint en daarna iets anders is, heet hier
`image/jpeg` — en wordt dan door `knipJpeg()` alsnog geweigerd als
`stukke_afbeelding`. De herkenner is dus een *toewijzing*, geen validatie; de
validatie staat er nog steeds achter.

## ⚠️ Wat de avatar-kiezer hiervan leert

`useAvatarKeuze.ts` viel **niet** om, en de reden is het opschrijven waard: hij
geeft `allowsEditing: true` mee, en dat stuurt iOS naar de legacy picker
(`ImagePickerModule.swift:94`). De `mediaInfo`-tak van `readDataAndFileExtension`
kent **geen HEIC-geval**, dus een HEIC valt daar door naar `default` en wordt
JPEG.

**Zijn veiligheid hing dus aan een optie die over bijsnijden gaat.** Niemand die
ooit besluit dat een avatar niet meer bijgesneden hoeft te worden, zou kunnen
raden dat hij daarmee het formaatgedrag omzet. Hij gebruikt nu dezelfde helper,
en de reden staat in zijn kop.

## ⚠️⚠️ Twee van de vier ijkingsmutaties landden achter een bestaande grendel

Dit is de tweede les en hij geldt breder dan deze bug.

| mutatie | voorspeld | gemeten |
| -- | -- | -- |
| H — `isJpeg()` altijd waar | 3 rood | **3 rood** |
| I — lengte-eis uit `isWebp()` | 1 rood | **0 rood** |
| J — `herkenFormaat()` gokt jpeg | 1 rood | **1 rood** |
| L — terug naar `gekozen.mimeType` | 2 rood | **3 rood** |
| M — de `null`-tak weg | 1 rood | **0 rood** |

**I** deed niets omdat `leesVier()` met `subarray()` leest en dat afklemt op de
lengte: `leesVier(b, 8) === 'WEBP'` kán alleen waar zijn bij twaalf bytes. **M**
deed niets omdat `ontdoeVanMetadata()` die bytes toch al weigert.

Allebei zijn het tweede grendels op dezelfde deur. Ze blijven staan — ze zijn
gratis en ze dragen de bedoeling — maar er staat nu bij dat geen test ze bewaakt,
in plaats van dat stilzwijgend aan te nemen.

⚠️ **En bij I ging ik daarna zelf de fout in die dit project al kent.** Toen I
niets deed, schreef ik erbij dat de lengte-eis bij `isJpeg()` *wél* draagt. Die
zin was een redenering: er stond geen geval in de suite dat hem raakte. Pas nadat
`FF D8` als eigen invoer is toegevoegd, wordt die mutatie (K) rood. **Een grendel
waarvan je uitlegt dat hij draagt zonder een geval dat hem raakt, is dezelfde
aanname als een grendel die nooit rood is geweest.**

## Wat hier gelezen is en wat afgeleid

Schakels 1 t/m 7 zijn stuk voor stuk uit de bron van de geïnstalleerde versie
gelezen. Wat niet te lezen valt, is wat iOS op runtime als eerste in
`itemProvider.registeredTypeIdentifiers` zet — daar leunt schakel 4 op.

**Voor de reparatie maakt dat niet uit**, en dat is met opzet zo gebouwd: het
formaat komt nu van de bytes, dus of iOS nu HEIC of JPEG aanlevert, de app leest
wat er werkelijk staat. De keten hierboven verklaart *waarom* het misging; de
oplossing hangt er niet van af.

⚠️ Deze uitslag is gelezen uit **57.0.14**. Verandert `expo-image-picker` van
major, dan is dit opnieuw te lezen — en dat is tien minuten werk, geen toestel.

## Wat dit voor QS8-436 betekent

Dat issue vroeg of `fileSize` de bewerkte of de onbewerkte grootte is. 📏 Het
antwoord is geen van beide maar *het hangt ervan af*: op Android altijd de
originele (`MediaHandler.kt:73` leest `OpenableColumns.SIZE` op de bron-URI), op
iOS de verwerkte voor JPEG en de originele voor HEIC, TIFF, AVIF, WEBP en BMP.

En doordat `base64` op beide platformen de gecomprimeerde versie is, beschrijft
`fileSize` **structureel een ander bestand** dan wat er geüpload wordt. Een poort
erop zou goede foto's weigeren. Dat is geval 3 van dat issue: het blijft zoals het
is, met deze meting als reden.
