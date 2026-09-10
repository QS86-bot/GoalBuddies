# Metadata uit een afbeelding knippen, en niet her-encoderen

**Datum:** 09-09-2026 · **Issue:** QS8-395, deel 1 van QS8-394 · **Migraties:** geen

## 1. Wat er aan de hand was

📏 Gevonden in de beveiligingsdoorlichting van 09-09-2026:
`grep -rn "exif|EXIF|ImageManipulator|stripMetadata" src/ app/ scripts/ docs/ package.json`
gaf **nul treffers in de hele repository**.

`kiesChatfoto()` gaf de bytes van `expo-image-picker` rechtstreeks door aan
`uploadChatfoto()`. Een foto van een telefoon draagt EXIF, en daar staan
`GPSLatitude` en `GPSLongitude` in. `useAvatarKeuze.ts` had dezelfde vorm — en
avatars staan al live.

⚠️ **`quality: 0.6` is geen bescherming.** Op web negeert de kiezer die optie; daar
is het een `<input type="file">` en krijg je het rúwe bestand. En web is het enige
kanaal dat draait: 📏 er is geen `eas.json` en geen native buildpijplijn.

## 2. Waarom dit vóór de rest van QS8-394 komt

Versleuteling beschermt tegen de **server**. Dit is een probleem met de
**ontvanger**: de coördinaten zitten in het bestand dat de groep per definitie mag
openen. Ook met volmaakte end-to-end-versleuteling deelt iemand die thuis een foto
maakt zijn adres met zijn groep, en met iedereen aan wie een lid de ondertekende
URL doorstuurt.

Daarom is dit geen onderdeel van de opslagdiscussie maar een reparatie die er los
van staat en er vóór hoort.

## 3. De keuze: zelf knippen

De voor de hand liggende route is `expo-image-manipulator`: één bewerking zonder
inhoud, en de encoder laat de metadata vallen. **Afgewezen**, om drie redenen die
samen zwaarder wegen dan het gemak:

1. Een dependency erbij voor iets wat bytewerk is.
2. **Hij werkt per platform anders.** Op native gaat het door een systeemencoder,
   op web door een `canvas`. Dan is *"er zit geen locatie meer in"* een eigenschap
   van een bibliotheek op een platform, en niet iets wat wij kunnen tónen. Dat is
   precies de vorm waar dit project telkens op valt: een grendel die in
   werkelijkheid een aanname is.
3. Her-encoderen comprimeert opnieuw. De gebruiker levert zichtbaar kwaliteit in
   voor een maatregel die dat niet nodig heeft.

Knippen is verliesvrij, identiek op elk platform, en — het punt — **te meten op de
bytes**. De testsuite voert een afbeelding in met een letterlijk herkenbaar
gps-blok en zoekt dat blok terug in de uitvoer. Vindt hij het, dan is de test rood,
ongeacht welk mechanisme eronder zit.

### Wat er weg gaat en wat blijft

| Formaat | Weg | Blijft, en waarom |
|---|---|---|
| JPEG | APP1 (Exif/XMP), APP13 (IPTC), APP3–APP12 (makernotes), `COM` | APP0 (JFIF), APP2 (ICC — weghalen verandert zichtbaar de kleuren), APP14 (de Adobe-merker; weghalen maakt een Adobe-JPEG onleesbaar) |
| PNG | `eXIf`, `tEXt`, `iTXt`, `zTXt`, `tIME` | al het overige; de CRC zit per chunk, dus hele chunks laten vallen houdt het bestand geldig |
| WebP | `EXIF`, `XMP ` | al het overige; de RIFF-lengte in de kop wordt herschreven |

⚠️ `tIME` staat er bewust bij: het tijdstip van de laatste bewerking zegt wanneer
iemand ergens was, en dat is dezelfde soort gegeven als een coördinaat.

## 4. Twee dingen die tijdens het bouwen gemeten en gerepareerd zijn

**De eerste versie verminkte stilzwijgend.** Hij bouwde de uitvoer uit de blokken
die hij gevónden had. Stopt het aflopen halverwege op een blok dat een lengte
opgeeft die buiten het bestand valt, dan vielen alle bytes daarachter weg — en kwam
er een afgeknótte afbeelding uit met `ok: true`. 📏 De test die daarop stond werd
rood met `reden: 'stukke_afbeelding'` in plaats van het verwachte `blijft_dragen`,
en dat verschil was de vondst.

Geen lek, wél stille verminking, en dat is een uitkomst die niemand ooit meldt —
de foto ís er. **Kunnen we niet elke byte verantwoorden, dan gaat er niets de deur
uit.**

**Alles achter `EOI` is geen beeld.** `jpegSegmenten()` stopt bij `SOS`, want
daarachter is `0xFF` gewoon data. Maar dat betekent ook dat een blok áchter de
afsluiter er ongezien én ongemeten doorheen zou komen — en een payload achter `EOI`
is een bekende manier om iets mee te sturen wat geen enkele viewer laat zien.
`knipJpeg()` kapt daarom af op de eerste `FF D9`.

⚠️ Zoeken op `FF D9` kan geen valse treffer geven: binnen de entropie-gecodeerde
data wordt `0xFF` gevuld tot `FF 00`, en de herstartmerkers zijn `FF D0` t/m
`FF D7`.

## 5. De faalstand valt dicht

Onbekend formaat, onleesbaar bestand, of ná het knippen tóch nog metadata: dan is
er **geen foto**. Niet een foto zonder voorvertoning, niet een foto die het toch
probeert.

⚠️ **Het knippen staat in de kiezer en niet in de upload**, en dat is een keuze.
De bytes gaan naar het scherm (voor de voorvertoning) én naar de upload. Knippen we
pas bij het uploaden, dan bestaat er een moment waarop de app een afbeelding mét
coördinaten in handen heeft en doorgeeft. De kiezer is de enige plek waar de bytes
de app binnenkomen, en dus de enige plek waar *"ze zijn nooit ongeknipt geweest"*
een ware zin is.

## 6. Wat hier niet in zit, en wat er open blijft

* **Eén helper voor beide paden**, niet twee. Twee knippers over hetzelfde begrip
  lopen uiteen, en dan is de vraag welke de waarheid is.
* ⚠️ **Niet gemeten: of de kiezer op web de EXIF daadwerkelijk doorlaat.** Wat wél
  gemeten is, is dat er *niets* strípte. De reparatie maakt de eerste vraag
  overbodig — er wordt nu geknipt ongeacht wat de kiezer levert — maar hij komt
  terug op de dag dat iemand deze stap weghaalt met het argument dat het toestel
  het al doet. Staat als rij in `docs/ENGINEER-REVIEW.md`.
* **Video en documenten** vallen hier buiten. Video draagt dezelfde metadata en
  een groter oppervlak; zie QS8-72.
* **De bewaartermijn en de versleuteling** staan in QS8-396 en QS8-397.
