# Bosrand, Pruim en Koraal van uiterlijk C (QS8-725, 1.1c)

**Besluit.** Uiterlijk C krijgt drie kleurvarianten erbij, elk donker en licht: `C-bosrand`, `C-pruim` en `C-koraal`
(`src/shared/theme/uiterlijken.ts`). Dat zijn veertien paletten in totaal. Het is een uitbreiding in de vorm van QS8-723 en QS8-724:
alleen waarden en tests, geen nieuwe structuur, geen scherm, niets kiest ze nog (QS8-729 en QS8-731). De statuskleuren zijn die van navy,
dus het ene statusrood van QS8-743 (`#ff3f1e` donker, `#cd0034` licht); er is geen eigen rood per palet.

**Richting van het verloop.** Zoals bij Baai en Avondgloed eindigt het accentverloop op het accent van het palet (toets uit QS8-724). Het voorbeeld
liep van accent naar tweede tint; hier staat de tweede tint dus vóór het accent, en het accent is de waarde die het issue mat.

## Donker (de voorstellen uit het voorbeeld, op twee punten bijgesteld)

| Palet | Accent | Verloop accent | Achtergrond | Wat veranderde |
|---|---|---|---|---|
| Bosrand | `#a3e635` | `#00e8a8` naar `#a3e635` | `#06180f` naar `#0c4026` | eerste tint was `#34d399`, einde achtergrond was `#0e4a2a` |
| Pruim | `#c084fc` | `#f0abfc` naar `#c084fc` | `#150b30` naar `#3b1a6e` | niets |
| Koraal | `#fb7185` | `#fdba74` naar `#fb7185` | `#2a0f1c` naar `#6b2230` | paneel donkerder gemaakt (voorstel was 7% wit) |

📏 **Gemeten.**
- `#34d399` ligt op **5,5** van het statusgroen (`#3fbf8f`), onder `MIN_AFSTAND` 10: een knop die in "gehaald" begint. Vervangen door `#00e8a8`
  (gezocht: dichtstbijzijnde kleur in OKLab die 11 houdt tot groen, oranje, rood, het accent en de drie families, 3:1 op beide achtergrondtinten, 4,5:1 met de knoptekst).
- Het einde van het Bosrand-verloop `#0e4a2a` gaf het statusrood **2,94:1**; `statusrood.test.ts` werd rood op "elk element langs het verloop". `#0c4026` haalt **3,37**.
- Koraal: het statusrood op een paneel van 7% wit (`#3c2430`) haalt **4,02:1**, onder de bodem van 4,3 voor rode tekst (QS8-743). Paneel `#331e29` haalt 4,40 en
  `#2e1a25` hoger; het scherm leest daardoor iets minder "glazig" dan het voorbeeld. De twee Koraal-tinten halen de toets: `#fb7185` ligt op 10,1 van oranje en 10,9 van het statusrood
  (krap, zoals het issue zei), `#fdba74` op 13,6 van oranje.

## Licht (hier week het voorstel ver af)

| Palet | Accent | Verloop accent | Achtergrond |
|---|---|---|---|
| Bosrand | `#185818` | `#006888` naar `#185818` | `#f2fbe9` naar `#d9f5e3` |
| Pruim | `#8020d0` | `#b808c0` naar `#8020d0` | `#f7f0ff` naar `#efe1ff` |
| Koraal | `#981840` | `#681030` naar `#981840` | `#fff3f3` naar `#ffe4dc` |

Dezelfde zoekmethode als QS8-743: elke kleur in stappen van 8 per kanaal, 11 afstand tot groen, oranje, rood en de lichte families, 3:1 op `bg`, wit en `bg2`,
en 4,5:1 met witte knoptekst. 📏 De voorstellen uit het voorbeeld halen dat **niet**: het olijf `#3f6212` valt op de lichte ambitiekleur (`#6d5a00`), het
smaragd `#047857` ligt tegen het lichte statusgroen, en het Koraal-rood `#be123c` en -oranje `#c2410c` liggen op het statusrood en -oranje. Het dichtstbijzijnde
alternatief per palet staat hierboven.

⚠️ **Koraal licht is een andere kleur dan donker.** Binnen het toegestane gebied is er geen warm koraal meer: een lichter, oranjer begin viel op oranje of
op het statusrood, en het enige dat overbleef (`#885868`) is een dof mauve. Daarom loopt het lichte Koraal van wijnrood (`#681030`) naar roze-rood (`#981840`),
niet van perzik naar roze. Dat is **mijn aanname binnen Quintens besluit om Koraal te houden**; of dit nog Koraal is, is een oordeel over het uiterlijk dat een screenshot moet beantwoorden.
⚠️ Koraal licht ligt op 11,0 afstand van het statusrood (14,7 van oranje), maar `#981840` is donker en rood-achtig; "rood is uitsluitend deadline-risico" rust hier op een gemeten afstand en niet op een kleurnaam.
Bosrand licht `#185818` is een donker bosgroen: 11,9 van het statusgroen, maar dezelfde kleurfamilie.

## Wat de toetsen sinds dit issue méér meten

Niets nieuws in code: `uiterlijken.test.ts` en `kleurafstand.test.ts` lopen over `allePaletten()` en namen de zes paletten vanzelf op. De teller (zeven uiterlijken, veertien paletten)
en de lijst `cIds` zijn bijgewerkt.

**Geijkt met de hand (elke keer rood op de bedoelde toets, daarna hersteld).** Bosrand terug op `#34d399` (afstand tot groen); Koraal licht met een oranje begin (statusrood- én accentverlooptoets);
Koraal-accent op `#ff6b6b` (statusrood en "eindigt op het accent"); Pruim licht op `#a21caf` (familie tegen statuskleur, `kleurafstand` en `uiterlijken`). En vóór de bijstelling:
het oude einde van Bosrand en het 7%-paneel van Koraal werden rood op `statusrood.test.ts`.

## Aannames, niet gemeten

- **Geen vóór-/ná-screenshot per palet (criterium 6).** Niets kiest C en er is in een cloudsessie geen lokale stack; zelfde reden als bij QS8-724.
- Dat Bosrand-limoen op het donkere achtergrondverloop goed leesbaar blijft: gemeten als contrast (`#a3e635` op `#0c4026` is 7,8:1), niet als oog.
- Het heldenpalet haalt de toets op `bg` en `panel` van alle veertien paletten (`heldenbord.test.ts`); op het verloopeinde `bg2` is dat niet gemeten, zoals bij QS8-724.
- Dat het kleurenblindheidsmodel (`kleurafstand.ts`) de werkelijkheid goed genoeg volgt, en niet hoe het verloop op een toestel oogt.
- Het id wordt een opgeslagen waarde bij QS8-729; zelfde open vraag als in het besluit van QS8-724 (aparte ids of één `C` met een variantveld).
