# Een poort die ná de kosten staat, is geen poort

**Datum:** 12-09-2026 · **Issue:** QS8-431 · **Migratie:** geen

## De keuze

`kiesDocument()` las het gekozen bestand volledig in JS-geheugen en liet de
keuring dáárna pas oordelen: `keurChatdoc(keuze.data.byteLength, …)` tegen
`CHATDOC_MAX_BYTES`. Een gekozen bestand van 500 MB werd dus volledig geladen om
vervolgens *"te groot"* te zeggen. Op een telefoon is dat het verschil tussen een
melding en een gedode app.

Er staat nu een tweede poort vóór het lezen. Vier besluiten daaromheen, en geen
ervan spreekt vanzelf.

## 1. De grens is een parameter en geen constante

`CHATDOC_MAX_BYTES` woont in `src/modules/buddies/chatdoc.ts`, en
`src/shared/kiezers` mag `modules/**` niet importeren — sinds QS8-423 een
lintregel (`import/no-restricted-paths`) en geen gewoonte.

De uitweg is niet een eigen constante in de kiezer. Dat zou een tweede bron voor
dezelfde grens zijn, en twee bronnen voor één getal lopen uit elkaar; dat is in
dit project de duurste klasse die er is. `kiesDocument(maxBytes)` neemt hem dus
van de aanroeper aan, precies zoals `kiesFoto(sleutel)` zijn foutsleutel van de
aanroeper krijgt en om dezelfde reden: **wat het domein weet, komt van het
domein.**

⚠️ De prijs staat in §4: er is dan een wiring-eigenschap ("iedereen geeft déze
constante mee") die geen runtime-oppervlak heeft.

## 2. Dezelfde foutsleutel, dus geen enkele tak erbij

De poort geeft `chatdoc.te_groot` terug — letterlijk de sleutel die
`keurChatdoc()` al gaf. Dat is criterium 3 van het issue: *geen nieuwe tekst,
geen tweede melding voor dezelfde zaak*.

Het aardige gevolg is dat de aanroeper **niets** hoefde te leren. In
`useChatbijlage.ts` stond al:

```ts
if (keuze.soort === 'fout') { setFout(t(keuze.sleutel)); return; }
```

Een nieuwe variant (`soort: 'te_groot'`) zou daar een tak bij hebben gevraagd, en
dus een tweede plek waar iemand kan vergeten dezelfde zin te tonen. Het type
`Documentfoutsleutel` is nu een unie van twee, om dezelfde reden als bij
`kiesFoto.ts`: een sleutel buiten de catalogus is dan een typefout en geen lege
melding.

## 3. Alleen de omvang, en het gedragsverschil staat opgeschreven

`keurChatdoc()` toetst type vóór omvang. De poort toetst alleen omvang en staat
ervóór. Een bestand dat **én** te groot is **én** een verkeerd type heeft, meldde
daarom tot vandaag `chatdoc.type_niet_toegestaan` en meldt nu `chatdoc.te_groot`.

Allebei waar; de tweede kost geen 500 MB om vast te stellen.

⚠️ **Bewust niet opgelost door de typetoets in de kiezer te herhalen.** Dan staat
dezelfde regel op twee plekken — de klasse uit §1 — en dat weegt zwaarder dan een
andere melding in een randgeval dat de `type: 'application/pdf'`-filter van de
kiezer toch al zeldzaam maakt. Het verschil staat in de kop van `kiesDocument.ts`
omdat CLAUDE.md daar scherp over is: **een afwijking die je vergeet op te
schrijven is goedkoper dan een die je onderbouwt, maar een die je verzwijgt is
het duurst.**

⚠️ En de poort is een **extra** en geen vervanging. `size` is optioneel bij
`expo-document-picker` (📏 `size?: number`, nagemeten in
`node_modules/expo-document-picker/build/types.d.ts`); ontbreekt hij, dan blijft
de oude weg volledig over. `keurChatdoc()` blijft de grens die telt, want zij
ziet de échte `byteLength` en niet wat het platform over het bestand beweert.

## 4. De naad, en de ene helft die een bronzeef nodig had

Regel 18 vraag 1: *waar knopen twee correcte onderdelen aan elkaar?* Hier: twee
poorten voor één grens. Elk apart is triviaal juist. Wat kan breken is het
geheel, op drie manieren — een ander getal, een andere melding, of de poort die
ná het lezen komt te staan.

Die derde is de gevaarlijkste, want de uitkomst blíjft dan kloppen. Daarom telt
`tests/beloftes/een-te-groot-document-wordt-niet-gelezen.test.ts` hoe vaak
`fetch` is aangeroepen in plaats van alleen het antwoord te lezen. 📏 Gemeten met
mutatie B (de poort één regel naar beneden): **2 rood, en alleen de
leestellingen** — een suite die alleen `soort: 'fout'` toetst was daar volledig
groen op gebleven.

⚠️ **Eén helft van de naad heeft geen runtime-oppervlak**, en daar is een
concessie gedaan. Alle runtime-tests geven de grens zélf mee, dus ze blijven
groen als een tweede aanroeper `5_242_880` intypt. Er is één bronzeef die élke
aanroep van `kiesDocument(` in `src/` en `app/` naast `CHATDOC_MAX_BYTES` legt.

Dat is precies wat regel 18 vraag 4 afraadt — een test die naar een plek grijpt
verhuist niet mee. Wat hem draaglijk maakt: hij kijkt niet naar één bestand maar
naar de hele boom, dus een verhuizing neemt de eis mee. En de belofte *"niemand
verzint zijn eigen grens"* heeft geen andere vorm: TypeScript kent `number` en
niet "dít getal".

## 5. En `kiesFoto()` draagt dit patroon níét

Criterium 5 vroeg het, en het antwoord is nee — met een reden die de moeite van
het opschrijven waard is.

`kiesFoto()` roept `launchImageLibraryAsync({ …, base64: true })` aan. **De bytes
ontstaan binnen die aanroep.** Tegen de tijd dat onze code het asset ziet, is het
geheugen al uitgegeven; `fileSize` staat er wel op, maar pas ná de aanroep die de
kosten maakte. Er ís hier geen "ervóór", anders dan bij het document, waar
`leesBestand()` in onze eigen code staat.

⚠️ **En de voor de hand liggende fix draagt een val.** `quality: 0.6` hercodeert
naar JPEG — de kop van `kiesFoto.ts` zegt zelf dat die waarde laag staat *"omdat
beide buckets op 1 MB dicht zitten"*, dus de app leunt erop dat compressie
bestanden ónder de grens brengt. 📏 De typedoc zegt over `fileSize` alleen *"File
size of the picked image or video, in bytes"* en niet of dat de gekozen of de
verwerkte afbeelding is. Is het de originele, dan weigert een poort erop een HEIC
van 3 MB die vandaag prima als 400 kB doorgaat — **een regressie en geen
bescherming.**

Dat is niet uit de types te beantwoorden en ook niet uit de package-bron: het
vraagt een meting op een echt toestel, per platform. Vandaar **QS8-436** en geen
regel in deze branch.

## 6. IJking

Per grendel apart, vooraf gemeten op 9 groen.

| mutatie | wat er brak | wat er rood werd |
| -- | -- | -- |
| A | de poort weg | 3 — de twee leestellingen en de zin |
| B | de poort ná `leesBestand()` | **2 — alleen de leestellingen**; de uitkomst bleef juist |
| C | `>` naar `>=` in `teGroot()` | 2 — "precies op de grens" en de naadtest |
| D | de sleutel naar `chatdoc.kiezen_mislukt` | 3 — waaronder "dezelfde zin als de keuring erachter" |
| E | de aanroeper typt `5_242_880` | **1 — alleen de bronzeef** |

B en E zijn de twee die ertoe doen: ze isoleren allebei precies één grendel, en
allebei zijn het de vorm die je in het echt krijgt — een poort die te laat staat,
en een tweede aanroeper die zijn eigen getal meeneemt.

⚠️ Bij elke mutatie is met een `grep` vastgesteld dát hij in het bestand stond
vóór de uitslag geloofd werd, en daarna is het bestand teruggezet uit een kopie.
