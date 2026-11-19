# Palet-architectuur en de uiterlijken A en B (QS8-723, 1.1a)

**Besluit.** Een *uiterlijk* is een benoemde, volledige set paletten per modus (`src/shared/theme/uiterlijken.ts`). B is het huidige stelsel (goud met groen
voor voortgang), ongewijzigd; A is hetzelfde oppervlak met een **blauwgroen accent**. Het huidige thema (`navyTheme`, `navyLightTheme`) wordt uit B afgeleid,
zodat het uiterlijk dat de app vandaag toont op één plek bestaat.

**Waarom zo.**
- **Eén bron.** Een tweede samenstelling van B naast `themes.ts` zou stil afwijken zodra iemand er één wijzigt; de code-critic vond dat en het is hersteld.
- **De toetsen lopen over `allePaletten()`.** `contrast.test.ts`, `kleurafstand.test.ts` en `uiterlijken.test.ts` meten elk palet van elk uiterlijk, met dezelfde lat (7:1 voor tekst,
  3:1 voor categoriekleuren, drie families, 10 afstand tot de statuskleuren en het eigen accent). QS8-724 en QS8-725 voegen waarden toe en krijgen de toetsen vanzelf.
- **De knop zit in het palet** (`knop`, `knopTekst`), want een ander accent vraagt een andere combinatie die 4,5:1 haalt. De waarden voor B zijn ongewijzigd.
- **A en B delen** statuskleuren, categoriekleuren en het heldenpalet; alleen `accent`, `accentDim`, `gridLine` en de knop verschillen. Dat is de kleinste stap; C (QS8-724) mag méér laten verschillen.

**Het accent van A, en wat ik mat.** Emerald (`#10b981`) valt op 3,2 van het statusgroen (gemeten in het issue). Donker: `#22d3ee`. Licht: `#0e7490` zakte op **9,9** van het statusgroen
(`#1f7a56`) en haalde de drempel 10 niet; gemeten alternatieven (afstand tot groen / contrast op bg): `#0b6b8f` 11,5 / 5,48, `#0a6e9a` 12,5 / 5,19, `#0369a1` 14,5 / 5,44. Gekozen: **`#0b6b8f`**,
het blauwgroenste dat de toets haalt. Het is een voorstel dat de toets moet halen; de waarde is niet heilig.

**Wat nog niet is gedaan.**
- **Niets kiest een uiterlijk.** `ThemeProvider` bewaart nog `systeem | navy | navy-licht`. De voorkeur per account is QS8-729 (een migratie, wacht op de nummerketen) en het scherm QS8-731.
- **Bestaande schermen staan niet op de nieuwe maten** (criterium 4, tweede zin). Er zijn `radius.lg`, `afstand` en `cijfer`, en nul aanroepers; er zijn ook al 72 losse maten in `app/` en `src/shared/ui`.
  `afstand` is bovendien een tweede schaal naast `space` (de Q-Projects-maten per onderdeel); wanneer welke geldt, is nog niet besloten.
- **`exports:controle` ziet deze map niet** (hij leest alleen de barrels van `src/modules/*`), dus dode exports in `src/shared/theme` vindt geen controle.
- **De kop van `tokens.ts`** zegt op deze tak nog *"verzin hier nooit een kleur bij"*; de bijgewerkte kop staat op de tak van QS8-722. Samenvoegen is tekstueel schoon, maar de zin *"veranderen pas in QS8-723"*
  is dan achterhaald en hoort bij die merge bijgewerkt te worden.

## Nagelopen tegen de besluiten na de start (19-11-2026, zesde en zevende ronde)

- **Het bord (criterium 8).** `src/shared/theme/heldenbord.ts`: `heldVlak()` geeft per held en per palet `palet` zolang het accent `WCAG.AA_LARGE` haalt op `bg` én `panel`, anders `bord` met het neutrale
  palet-vlak (`bg`, `panel`, `panelDark`, `text`) dat het best contrasteert. Geen nieuwe kleur. 📏 Gemeten: op alle vier de paletten blijft elke held op `palet`, dus er rendert nog geen bord;
  alleen de hook staat vast. `HELDENOPPERVLAKKEN` is leeg en `onbevoegdeGebruikers()` wordt rood zodra een ander bestand de module noemt. Het **component** zelf is niet gebouwd: er is nog geen
  heldenoppervlak dat hem nodig heeft (OPEN: bouwen bij het eerste palet waar `soort: 'bord'` voorkomt, QS8-724).
- **Standaard B en donker (E8, E9).** `STANDAARD_UITERLIJK` en `STANDAARD_MODUS` bestaan als constanten; `uiterlijkVoorVoorkeur()` laat elke bestaande voorkeur (`systeem | navy | navy-licht`) op B wijzen.
  `ThemeProvider` is ongewijzigd: de opslag en de terugval op donker is QS8-729.
- **Eén statusrood (QS8-743).** De waarde is niet vastgesteld; een toets eist alleen dat `red` binnen een modus in elk uiterlijk dezelfde kleur is.
- **Geijkt met de hand:** een bordgebruiker in `Card.tsx`, `leesbaarOpPalet` altijd waar, een eigen rood in A, de brug voor `navy` naar licht; elke keer rood op de bedoelde toets, daarna schoon.
- **Niet gemeten:** rendering op een scherm of apparaat; hoe helden op een toekomstig C-palet lezen.
