# De taakbalk hoort bij het scherm en niet bij de navigator

**Datum:** 12-09-2026 · **Issue:** QS8-437 · **Status:** gebouwd

Wens van Quinten uit de testronde van 12-09-2026: *de taakbalk moet altijd
zichtbaar zijn.*

## Waar hij niet stond

De balk werd getekend door de navigator in `app/(tabs)/_layout.tsx` en bestond
daarmee alleen binnen die map. 📏 **24 van de 29 schermen lagen erbuiten**: alles
onder `app/doel/`, `app/groep/` en `app/onboarding/`, plus `/beoordelen`,
`/overzicht`, `/aanmelden` en `/uitnodiging/[code]`.

Elk van die schermen was op zichzelf in orde. Wat ontbrak was een uitspraak over
het gehéél, en dat is precies de vorm die regel 18 beschrijft.

## Het besluit: B, in een vorm die het issue niet overwoog

Het issue bood drie vormen aan. De gekozen vorm is **B — de balk buiten de
navigator**, maar niet zoals het issue hem beschreef, en dat verschil is de hele
reden dat hij wint.

| | Wat het issue erover zei | Wat er gemeten is |
|---|---|---|
| **A** — detailschermen onder de tabbladen hangen | *"elke route verhuist"* | ⚠️ Dat viel mee: `(tabs)` is een route**groep**, dus een bestand dat erin verhuist houdt zijn URL. Wat *niet* meevalt staat hieronder. |
| **B** — de balk buiten de navigator | *"dan is hij geen navigator meer; twee bronnen van waarheid over waar ben ik"* | Klopt voor de vorm met twee balken. Vervalt zodra het er één is. |
| **C** — een deel verhuizen | — | Wordt hier het resultaat, maar als lijst en niet als verhuizing. |

### Waarom A alsnog afvalt, en dat is een meting en geen smaak

Twee dingen, en het tweede is dragend:

1. Alle detailschermen zouden verborgen tabbladen (`href: null`) van één
   tab-navigator worden. Dat is geen stack: ze blijven gemount, de
   terugsemantiek verandert, en dat is een gedragswijziging op **24 schermen**
   die dit project met geen enkele test kan zien.
2. ⚠️⚠️ **`app/groep/weekafsluiting/[id].tsx` kan er niet in.** Daar staat een
   vertrekwacht op onopgeslagen tekst (QS8-192) die op `usePreventRemove` leunt.
   Die haakt op het verwijderen van een route; **een tab-navigator verwijdert
   niets bij het wisselen**, dus de wacht vuurt niet en de tekst is weg. Dat is
   geen hoekgeval maar precies acceptatiecriterium 4.

### Waarom B's bezwaar vervalt

Het bezwaar was: *twee componenten die er hetzelfde uit moeten zien, en twee
antwoorden op "waar ben ik".* Dat geldt zolang de navigator óók een balk tekent.

Hij tekent er geen meer: `tabBar={() => null}`. Er is nu precies **één**
balkcomponent (`src/shared/ui/Taakbalk.tsx`) en precies **één** bron voor "waar
ben ik" (de router, via `usePathname()`). Het bezwaar ging over de vorm met twee
balken, en die is hier niet gebouwd.

### Wat het goedkoop maakte

📏 De meting die dit besluit draagt: **alle 27 routes renderen precies één
`<Screen>`**. Geteld, niet aangenomen. `Screen` is daarmee de ene naad waarlangs
een balk élk scherm bereikt — zonder dat er één routebestand verhuist.

Dat weegt zwaar, want regel 18 noemt een verhuizing de gevaarlijkste beweging die
er is: de tests verhuizen mee en blijven groen terwijl de belofte eraan hing. Dit
besluit doet er nul.

## Wie hem met reden niet krijgt — acceptatiecriterium 3

Vier rijen, en ze staan met hun reden in `ZONDER_TAAKBALK` in
`src/shared/ui/taakbalk.ts`, niet alleen hier.

| Scherm | Waarom niet |
|---|---|
| `/aanmelden` | Geen sessie. De balk wijst naar vijf schermen die de routewacht meteen terugstuurt; vijf knoppen die niets doen. |
| `/onboarding/**` | Een stap in een flow. De routewacht houdt je hier tot `onboarded_at` staat. |
| `/uitnodiging/**` | Het eerste dat iemand van dit product ziet, bereikbaar zónder sessie. Eén bedoelde volgende stap. |
| `/groep/weekafsluiting/**` | De vertrekwacht van QS8-192. Vijf linkjes zijn vijf routes die langs `verlaat()` hadden moeten gaan. |

⚠️ **Een register en geen prop.** Een `taakbalk={false}` op vier schermen is vier
kansen om het bij het vijfde te vergeten. Een register is in één blik te lezen
naast zijn reden, en het is te voeden en dus te ijken — een prop in JSX is dat
niet, want er is geen renderer in dit project.

⚠️ **Een nieuw scherm krijgt vanzelf een balk.** `toontTaakbalk()` zegt standaard
ja. Dat is de veilige kant: een balk te veel valt op, een balk te weinig merkt
alleen de gebruiker.

## De twee vallen die het issue noemde

**Val 1 — de dubbele bovenrand.** Die is niet omzeild maar weggenomen. Er waren
twee dingen die `insets.top` telden (de balk van de navigator en `Screen`), met
een context `BovenrandAlVerrekend` ertussen om ze te verzoenen. Nu telt alleen
`Screen`, en de balk staat bínnen die ruimte in plaats van ernaast. De context is
daarmee overbodig en **verwijderd**, niet uitgebreid.

⚠️ Regel 18 vraagt bij elke verhuizing: *welke belofte hing eraan en wordt die
nog getoetst?* De belofte was *de bovenrand wordt precies één keer geteld*, en die
staat nu strenger in `tests/beloftes/tabbalk-bovenaan.test.ts`: niet meer "de
rekensom klopt", maar **er is maar één plek die telt**. 📏 Geijkt met een tweede
`useSafeAreaInsets()` in een scherm.

**Val 2 — vijf labels is krap.** De balk scrollt liever dan af te kappen
(`ScrollView horizontal`), en de labels zijn onveranderd. Deze wijziging maakt de
balk niet breder maar zet hem wel op smallere schermen die hem eerst niet hadden.

## Wat er wél gemeten is

📏 `npm run build` (`expo export --platform web`) **prerendert alle 27 routes in
Node en valt niet om**. Dat is geen schoonheidsprijs maar dekt het grootste
structurele risico van deze vorm: `Taakbalk` roept `usePathname()` aan en zet een
`Link` met `asChild` om een `Pressable`. Zou een van die drie buiten een
navigator ongeldig zijn, dan gooit de prerender op élke route. Hij deed dat niet.

Verder: de pure logica (`toontTaakbalk`, `actiefTabblad`, het register) staat
onder test in `tests/beloftes/taakbalk-overal.test.ts`, en de naden — wie tekent
de balk, wie telt de bovenrand, tekent de navigator er nog een — in
`tests/beloftes/tabbalk-bovenaan.test.ts`. Allebei per grendel met de hand geijkt;
de tabellen staan in de koppen van die bestanden.

## Wat hier niet mee bewezen is

⚠️ **Native is niet nagemeten.** Er is in deze omgeving geen simulator en geen
toestel; wat hieronder aan gedrag gemeten is, is gemeten op web. De code is
platformneutraal (`Link`, `Pressable`, `ScrollView`, `useSafeAreaInsets`) en er
staat geen `Platform.OS` in, maar dat is een argument en geen meting.
Acceptatiecriterium 2 noemt web én native; de tweede helft staat open en hoort in
de eerstvolgende testronde op een toestel gedaan te worden.

⚠️⚠️ **En de balk is nergens *gezien*.** Dat is geprobeerd en het lukte niet, en
dat hoort hier te staan in plaats van weggelaten te worden. De statische export is
een schil: 📏 `dist/doelen.html` bevat nul keer het woord *Doelen* en nul keer
*Vandaag*, want elk scherm rendert pas na hydratie. En met een echte Chromium
ertegenaan komt de routewacht zonder sessie niet verder dan `/aanmelden`, waar de
balk met reden niet hoort te staan. **De negatieve helft is dus wel te zien en de
positieve niet** — en een instrument dat alleen de helft kan zien die je verwacht,
is geen bewijs. Criteria 2, 4 en 5 van het issue vragen om een testronde met een
sessie; die staat open.

⚠️ **En de notch is op web niet te zien.** `useSafeAreaInsets()` geeft daar nul,
dus de dubbele marge die val 1 beschrijft is hier per definitie onzichtbaar. Dat
is precies de reden dat de grendel op het aantal tellers staat en niet op de
uitkomst van de rekensom.
