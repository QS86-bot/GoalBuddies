# Uiterlijk C met Baai en Avondgloed (QS8-724, 1.1b)

**Besluit.** Uiterlijk C bestaat in twee kleurvarianten, elk donker en licht: acht paletten in totaal met A en B. De ids zijn `C-baai` en `C-avondgloed`
(`src/shared/theme/uiterlijken.ts`). Een palet draagt nu ook `verloop`: `{ achtergrond: [bg, bg2], accent: [van, naar] }`, of `null` (A en B, die vlak blijven).
`src/shared/ui/Verloop.tsx` tekent een verloop uit die waarden en kent zelf geen kleur. Het is een uitbreiding van QS8-723 en geen nieuwe structuur.

**Dependency (besluit Quinten, 19-11-2026).** `expo-linear-gradient@~57.0.2` is toegevoegd, de versie bij Expo SDK 57. `npx expo install` zelf haalde de
compatibiliteitsdata niet op (de cloudsessie sluit `api.expo.dev` af), dus de versie is met `npm view expo-linear-gradient dist-tags` (`sdk-57`) vastgesteld en met
`npm install` geschreven; dat levert dezelfde regel op. Reden: een verloop op de achtergrond, de knop en de voortgangsstreep is niet te tekenen met `View` alleen.
Het gebruikt alleen palet-tokens. Niet gemeten: de native bouw (alleen typecheck en unit-tests hier; de web-export draait in CI).

**Waarden en wat er gemeten is.**
- **Baai.** Donker: accent `#22d3ee`, verloop emerald `#10b981` naar `#22d3ee` (de tweede tint mag emerald zijn); achtergrond `#0a1230` naar `#0a4152`. Licht: accent `#0a6e94`,
  verloop `#047857` naar `#0a6e94`. Proefwaarde `#0a7a8c` voor licht zakte op **8,5** van het statusgroen (drempel 10) en is verlaten; `#0a6e94` haalt hem.
- **Avondgloed.** Donker: accent `#e879f9`, verloop amber `#f59e0b` naar `#e879f9`; achtergrond `#1a0b33` naar `#3b1a4f`. Licht: accent `#8e24aa`, verloop `#b45309` naar `#8e24aa`.
  Het roze uit het voorbeeld, `#f472b6`, staat op **8,5** van softskills en faalt; `#e879f9` haalt de toets (14,0). 📏 Terug op `#f472b6` zetten maakt
  `kleurafstand.test.ts` rood, op de categoriekleur softskills.
- **Statusrood.** C gebruikt het rood van B. Eén rood voor de hele app is besloten (QS8-743) en wordt daar vastgesteld; deze branch stelt het niet vast.
- Categoriekleuren en helden zijn die van A en B.

**Wat de toetsen sinds dit issue méér meten.** De afstandstoets (`kleurafstand.test.ts`) neemt ook de twee tinten van het accentverloop mee, want een knop die van amber naar roze loopt
draagt beide. En de contrasttoetsen lopen langs het héle verloop (elf monsters in sRGB) en niet alleen langs de uiteinden. Een mengsel kan onder beide uiteinden zakken; het monster
zelf is geijkt met rood naar groen.

**Geijkt met de hand (elke keer rood op de bedoelde toets, daarna hersteld).** Roze terug op `#f472b6`; Baai-accent op `#10b981`; een te lichte `bg2`; knoptekst die het verloop niet haalt;
een verloop op B; een ander rood in C.

**Het risico dat Quinten accepteerde (criterium 5, vervangen).** Avondgloed-amber (`#f59e0b`) ligt in het slechtste geval op 3,8 van goud en 6,2 van oranje (meting uit het issue, niet opnieuw
gemeten met een kleurenblindheidsscript). Quinten liet het amber staan; het wordt hier gemeld en niet opnieuw voorgelegd. ⚠️ In de lichte modus is het amber donkerder (`#b45309`) en ligt dat
bij het lichte statusoranje `#b3541c`; dat is nu **niet gemeten** met een afstandsmaat en geen toets vangt het (de toets meet categoriekleuren, niet accent tegen oranje). Een aanname, geen bewijs.

**Wat nog niet is gedaan.**
- **Niets kiest C.** De voorkeur per account is QS8-729, het scherm QS8-731. `Verloop` is dus niet aangesloten op `Button`, `Screen` of `MilestoneProgress`; dat is code die nu niet draait en hoort bij QS8-731.
  `Theme` draagt het verloop ook nog niet.
- **Het id wordt een opgeslagen waarde** zodra QS8-729 de voorkeur bewaart (`C-baai`, `C-avondgloed`). Het alternatief is één `C` met een variantveld. Beslis dat vóór QS8-729 landt.
- **Het heldenpalet** haalt 3:1 op `bg` en `panel` van alle acht paletten (`heldenbord.test.ts`, over `allePaletten()`), dus er rendert geen bord. Op het verloopeinde `bg2` is dat niet gemeten.
- **Geen vóór-/ná-screenshot van Vandaag** (criterium 7): geen enkel scherm kan C tonen zolang niets het uiterlijk kiest.
- **Niet gemeten:** hoe het verloop op een toestel oogt; of Baai donker (zelfde accent als A donker) genoeg afwijkt door het verloop alleen.
