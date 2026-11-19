# Meerkleurige pictogrammen als gegevens, met `react-native-svg` (QS8-730, 1.6a)

**Besluit.** Elf eigen pictogrammen (vlam, ster, schild, medaille, trofee, ketting, doel, kroon, bliksem, hart, duim) als SVG-paden in `src/shared/ui/pictogrammen.ts`,
getekend door `src/shared/ui/Pictogram.tsx` met `react-native-svg`. De kleuren staan in `src/shared/theme/pictogramkleuren.ts`. Voorbeeld op beide modi, open en vergrendeld:
`docs/research/pictogrammen-voorbeeld.png`.

**De dependency.** `react-native-svg` `15.15.4`, de versie die `node_modules/expo/bundledNativeModules.json` voor SDK 57 noemt. `npx expo install` haalt zijn versielijst van het
netwerk en faalde in de cloudsessie; ik heb dezelfde versie exact met npm gezet (zoals QS8-724 deed voor `expo-linear-gradient`). 📏 Web-export: `expo export --platform web` bouwt en
het pictogram zit in de bundel. **Native niet gemeten** (geen toestel of simulator in de cloud). Dit is de tweede dependency uit het besluit van QS8-722.

**Waarom gegevens en geen zes componenten.** Een tekening is een tabel (pad, vulling, rand); één component tekent ze allemaal. Dat houdt elke functie kort (regel 15) en laat elke belofte met
een gewone test meten, zonder react-native. De eenkleurige `CategorieMerk` blijft op `@expo/vector-icons`, zoals het issue vraagt.

**Kleur.** Vaste waarden per modus, niet per uiterlijk: een trofee blijft goud in uiterlijk A. Geen statusrood (palet: uitsluitend deadline-risico). De vlam loopt van geel naar diep oranje.
Elk pictogram noemt zijn *dragende* kleuren (`drager`); die halen 3:1 tegen `bg`, `panel` en `panelDark` van elk palet van elk uiterlijk, en dat zijn de drie vlakken waar `heldVlak()` uit kiest. Een lichte
vulling op een licht vlak mag onder 3:1 blijven, omdat de rand de vorm draagt.

**Domeinregel 7 als type.** `Pictogram` vraagt een `betekenis`, en `BETEKENISSEN` bevat alleen positieve dingen. Een combinatie die niet in `PICTOGRAM_BETEKENISSEN` staat, rendert niets (zoals
`FloorCeiling`). Hart en duim: alleen `aanmoediging`. Kroon en bliksem: alleen `zeldzame_prestatie`. Een toets leest elk gebruik in `app/` en `src/`.

**Vergrendeld** is dezelfde vorm in drie grijzen, zonder verloop, kruis of slot; het label zegt het ook in tekst ("…, nog te behalen").

**Aannames, niet gemeten.** Rendering op een toestel. Dat elf pictogrammen volstaan. Dat de tekeningen op 13 tot 32 punten leesbaar zijn (alleen bekeken op 64). Kleurenblindheid: de
vormen verschillen, maar er is geen simulatie gedraaid.

**Open voor Quinten.** Kies kroon of bliksem, en hart of duim. De andere kant wordt pas verwijderd na jouw keuze; tot dan heeft geen enkel scherm er een aanroeper (dat is QS8-731/732).
