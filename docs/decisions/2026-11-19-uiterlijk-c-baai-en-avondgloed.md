# Uiterlijk C met Baai en Avondgloed (QS8-724, 1.1b)

**Besluit.** Uiterlijk C bestaat in twee kleurvarianten, elk donker en licht: acht paletten in totaal met A en B. De ids zijn `C-baai` en `C-avondgloed`
(`src/shared/theme/uiterlijken.ts`). Een palet draagt nu ook `verloop`: `{ achtergrond: [bg, bg2], accent: [van, naar] }`, of `null` (A en B, die vlak blijven).
`src/shared/ui/Verloop.tsx` tekent een verloop uit die waarden en kent zelf geen kleur. Het is een uitbreiding van QS8-723 en geen nieuwe structuur.

**Dependency (besluit Quinten, 19-11-2026).** `expo-linear-gradient@~57.0.2` is toegevoegd, de versie bij Expo SDK 57. `npx expo install` zelf haalde de
compatibiliteitsdata niet op (de cloudsessie sluit `api.expo.dev` af), dus de versie is met `npm view expo-linear-gradient dist-tags` (`sdk-57`) vastgesteld en met
`npm install` geschreven; dat levert dezelfde regel op. Reden: een verloop op de achtergrond, de knop en de voortgangsstreep is niet te tekenen met `View` alleen.
Het gebruikt alleen palet-tokens. Niet gemeten: de native bouw (alleen typecheck en unit-tests hier; de web-export draait in CI).

**Waarden en wat er gemeten is.**
- **Baai.** Donker: accent `#22d3ee`, verloop `#60a5fa` naar `#22d3ee`; achtergrond `#0a1230` naar `#0a4152`. Licht: accent `#0a6e94`,
  verloop `#2563eb` naar `#0a6e94`. Proefwaarde `#0a7a8c` voor licht zakte op **8,5** van het statusgroen (drempel 10) en is verlaten; `#0a6e94` haalt hem.
- **Avondgloed.** Donker: accent `#e879f9`, verloop amber `#f59e0b` naar `#e879f9`; achtergrond `#1a0b33` naar `#3b1a4f`. Licht: accent `#8e24aa`, verloop `#9a3412` naar `#8e24aa`.
  Het roze uit het voorbeeld, `#f472b6`, staat op **8,5** van softskills en faalt; `#e879f9` haalt de toets (14,0). 📏 Terug op `#f472b6` zetten maakt
  `kleurafstand.test.ts` rood, op de categoriekleur softskills.
- **Statusrood.** C gebruikt het rood van B. Eén rood voor de hele app is besloten (QS8-743) en wordt daar vastgesteld; deze branch stelt het niet vast.
- Categoriekleuren en helden zijn die van A en B.

**Wat de toetsen sinds dit issue méér meten.** De afstandstoets (`kleurafstand.test.ts`) neemt ook de twee tinten van het accentverloop mee, want een knop die van amber naar roze loopt
draagt beide. En de contrasttoetsen lopen langs het héle verloop (elf monsters in sRGB) en niet alleen langs de uiteinden. Een mengsel kan onder beide uiteinden zakken; het monster
zelf is geijkt met rood naar groen.

**Geijkt met de hand (elke keer rood op de bedoelde toets, daarna hersteld).** Roze terug op `#f472b6`; Baai-accent op `#10b981`; een te lichte `bg2`; knoptekst die het verloop niet haalt;
een verloop op B; een ander rood in C; emerald of het oude lichte amber als begin van het verloop.

**Wat de review vond en wat ik deed.** De `critical-user`-ronde mat met `kleurafstand()` dat een verloop dat in de statuskleuren begint leest als "gehaald" of "dreigt mis te gaan",
en dat de eerste versie van de toets alleen de tweede tint tegen de statuskleuren legde. 📏 Gemeten: emerald `#10b981` op 3,2 van het statusgroen (donker) en `#047857` op 1,2 (licht);
het lichte amber `#b45309` op **0,8** van het statusoranje. Daarom: de eerste tint van Baai is nu een blauw (`#60a5fa` donker 19,6 van groen; `#2563eb` licht 25,6), en het lichte amber is `#9a3412`
(6,7 van de dichtstbijzijnde statuskleur). Een nieuwe toets legt **beide** tinten tegen groen, oranje en rood (minstens 10) en tegen de tweede achtergrondtint (3:1).
Terug op emerald of op `#b45309` maakt hem rood (met de hand gemeten).

**Het risico dat Quinten accepteerde (criterium 5, vervangen).** Avondgloed-amber (`#f59e0b`) ligt op 8,1 van het statusoranje in donker (normaal zicht, `kleurafstand()`; de 3,8 en 6,2 uit het issue
zijn de slechtste-geval-maat over kleurenblindheid en dus niet dezelfde grootheid). Quinten liet het amber staan. Het lichte amber `#9a3412` is een eigen aanpassing aan de lichte modus en ligt
onder 10: beide staan in `AMBER_GEACCEPTEERD` in `uiterlijken.test.ts` met hun gemeten bodem (8 en 6,5), zodat ze niet slechter kunnen worden. ⚠️ Dat het lichte amber onder 10 blijft is **mijn aanname binnen
Quintens besluit**, geen uitdrukkelijk besluit over de lichte modus; een amber dat 3:1 haalt op een lichte achtergrond komt niet verder van oranje (`#d97706` haalt 11,5 maar slechts 2,9 op `bg`).

**Wat nog niet is gedaan.**
- **Niets kiest C.** De voorkeur per account is QS8-729, het scherm QS8-731. `Verloop` is dus niet aangesloten op `Button`, `Screen` of `MilestoneProgress`; dat is code die nu niet draait en hoort bij QS8-731.
  `Theme` draagt het verloop ook nog niet.
- **Het id wordt een opgeslagen waarde** zodra QS8-729 de voorkeur bewaart (`C-baai`, `C-avondgloed`). Het alternatief is één `C` met een variantveld. Beslis dat vóór QS8-729 landt.
- **Het heldenpalet** haalt 3:1 op `bg` en `panel` van alle acht paletten (`heldenbord.test.ts`, over `allePaletten()`), dus er rendert geen bord. Op het verloopeinde `bg2` is dat niet gemeten.
- **Geen vóór-/ná-screenshot van Vandaag** (criterium 7): geen enkel scherm kan C tonen zolang niets het uiterlijk kiest.
- **Niet gemeten:** hoe het verloop op een toestel oogt; of Baai donker (zelfde accent als A donker) genoeg afwijkt door het verloop alleen.
