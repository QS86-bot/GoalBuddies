# Een effect dat niemand rendert is een effect dat niemand bewaakt

Datum: 18-11-2026 · Issue: QS8-714 (vervolg op QS8-712 en QS8-708)

## Wat er aan de hand was

QS8-712 haalde een race uit het uitnodigingsscherm door de opruimfunctie
(`levend = false`) uit het auto-toetreden-effect te halen. De afhandeling zelf
(`verwerkToetreding()`) stond onder test; het effect niet. Zette iemand later
"netjes" een opruimfunctie terug, dan bleven alle tests groen en was de bug terug.
Dat is onwrikbare regel 18, vraag 3: de test toetst een eigenschap van het
onderdeel, de belofte is een eigenschap van het geheel.

## Wat is besloten

1. **Het effect staat nu in een hook**, `src/modules/buddies/useAutomatischToetreden.ts`,
   en het scherm roept hem aan. Gedrag is gelijk: sessie aanwezig, `magToetreden`,
   de sessie was er bij binnenkomst niet, en één poging.
2. **De hook wordt echt gerenderd** in `useAutomatischToetreden.test.ts`
   (`react-dom/client` en `act`, onder `// @vitest-environment jsdom`). Een
   bronniveau-toets die zoekt naar `return () =>` in het scherm is afgewezen: die
   grijpt naar een plek en niet naar de belofte (regel 18, vraag 4), en is te
   omzeilen door dezelfde fout anders te schrijven.
3. **Twee devDependencies erbij**: `jsdom` (`^31.0.1`) en `@types/react-dom`
   (`~19.2.3`, dezelfde reeks als `@types/react`). Dit is het besluit onder
   *Beslisbevoegdheid* ("een dependency toevoegen") en dus verantwoord hier.

## Wat het kost, gemeten (18-11-2026)

| Wat | Meting |
| --- | --- |
| Pakketten in `package-lock.json` | 941 naar 972 (31 nieuw, 0 weg), bijna allemaal onder `jsdom` |
| `@types/react-dom` | nieuw in de lockfile: stond er alleen als optionele peer van `@radix-ui/*` (via `expo-router`), niet geïnstalleerd |
| `jsdom` op schijf | 13 MB |
| Node-eis van `jsdom` 31 | `^22.22.2 \|\| ^24.15.0 \|\| >=26`; `package.json` eist `>=22` en CI draait `'22'` (de nieuwste 22.x), dus het past, maar Node 22.0 tot 22.21 geeft een waarschuwing en kan de test niet draaien |
| Testbestand, tijd | 0,9 s, waarvan 0,4 s voor de jsdom-omgeving |
| Hele `unit`-project | 305 bestanden, 5332 tests, groen |
| `lockfile:controle` | groen, geen dev-vlag op een productieregel; `jsdom` staat op `dev` |
| `audit:controle` | 12 kwetsbare wortels met en zonder deze wijziging |
| Productiebundel | ongewijzigd: beide pakketten zijn alleen `devDependencies` |

## Waarom dit hier kan zonder de testopzet te veranderen

`vitest.config.mts` laat het `unit`-project alleen `src/**/*.test.ts` en `tests/**/*.test.ts` lezen. Een
hooktest is een `.test.ts` met `createElement` in plaats van JSX, en kiest zijn
omgeving per bestand met een docblock. Er is dus geen `.test.tsx`-project nodig en
de andere tests blijven in node draaien.

## Geijkt met de hand

Per grendel in de hook één mutatie, en gekeken welke toets omvalt:

| Mutatie | Toets die omvalt |
| --- | --- |
| de opruimfunctie `levend = false` terug (de bug van QS8-712) | "een dep die wisselt terwijl neemDeel loopt neemt de uitkomst niet weg" |
| het slot `geprobeerd` weg | die toets én "een tweede effectronde na afloop treedt niet nog een keer toe" |
| de momentopname "sessie bij binnenkomst" weg | "wie al ingelogd was bij binnenkomst treedt niet vanzelf toe" |
| `magToetreden` genegeerd | "zolang magToetreden onwaar is …" |
| `sessieLaadt` genegeerd | "een sessie die na het laden al bleek te bestaan is een koude start" |
| `gemount()` niet bekeken bij een fout | "een mislukte aanroep toont de melding, maar alleen als het scherm er nog is" |
| opruimfunctie terug én `uitvoer` uit de deps | de wisselingen van `magToetreden`, `sessieLaadt`, `code` en `toetreden` (vier toetsen) |
| `!ingelogd` weg | "zonder sessie treedt niets toe, ook niet als de rest zegt dat het mag" |

⚠️ **De eerste versie was op drie plekken blind** (gevonden door `code-critic` en met
de hand bevestigd): `magToetreden` en `sessieLaadt` bleven groen, en de toets op de
opruimfunctie wisselde maar één dep (`uitvoer`) — in het scherm juist de stabiele.
Zet iemand de opruimfunctie terug en haalt hij `uitvoer` uit de deps, dan bleef alles
groen. De toets is nu parametrisch over elke dep die echt kan wisselen, en `!ingelogd`
heeft een eigen toets.

De blinde plek bij `magToetreden` en `sessieLaadt` kwam doordat de toets begon met een
sessie die er al bij binnenkomst was, en dan stopt het effect sowieso al op een
eerdere regel. Dat is
dezelfde vorm als het geval waar `CLAUDE.md` voor waarschuwt: een ijking die zijn
geval door een pad voert dat een eerdere grendel al afvangt, bewaakt niets van wat
hij belooft. Het zijn nu toetsen die elk hun eigen grendel als enige raken.

## Wat dit niet doet

* Niet gemeten: het gedrag in een echte browser of op de gedeployde bundel. jsdom is
  geen React Native Web, en de test rendert de hook los van het scherm. Dat de
  bedrading in `app/uitnodiging/[code].tsx` klopt, is getypecheckt en gelint.
* Geen oplossing voor de actieve knop "Deelnemen" tijdens automatisch toetreden
  (genoemd in de afleverregel van QS8-712; nog geen rij in
  `docs/ENGINEER-REVIEW.md`, die rij komt met de batchsessie); dat blijft een eigen issue.

## Wat dit opent, en wat er nu onwaar klinkt

⚠️ **Het project zegt op ruim twintig plekken dat er geen renderer is**, en
sommige van die plekken gebruiken dat als reden voor een ontwerpkeuze. Met deze
wijziging is dat voor hooks niet meer waar. Gemeten met `grep` op "geen renderer",
"geen componenttest" en "geen render":

* broncommentaren: `src/modules/buddies/useChatbijlage.ts`, `samen.ts`,
  `src/modules/auth/aanmeldmodus.ts`, `src/shared/ui/wachtwoordveld.ts`,
  `tabbladen.ts`, `spraakveld.ts` en `app/aanmelden.tsx`;
* testkoppen: `src/shared/ui/spraakveld.test.ts`, `wachtwoordveld.test.ts` en negen
  bestanden in `tests/beloftes/` (onder meer `aanmeldscherm`, `tekstinvoer`,
  `spraakveld`, `wachtwoordveld`, `de-terugknop-van-de-router`);
* `docs/ENGINEER-REVIEW.md`, rij van 2026-09-10 (`Document.tsx` en `ChatRegel.tsx`
  worden nergens getekend) en rij van 2026-11-05 (`DeadlineVerzetten`): beide
  noemen een renderopstelling "een eigen besluit". Dit is dat besluit, voor hooks;
  of `Document.tsx` nu echt getekend kan worden is niet onderzocht;
* beslisdocumenten van 2026-08-23 en 2026-09-12 (historisch, laat staan).

Ze zijn **niet herschreven**: dat zijn meer dan twintig bestanden en elke tekst
verdedigt een eigen keuze. Wat hier wél staat is dat de reden *"er is geen
renderer"* niet meer geldt voor een hook, en dat een bronbewaking niet meer de
enige weg is. Een nieuw besluit om een van die bronbewakingen te vervangen door een
render hoort bij zijn eigen issue. De eerste versie van `useAutomatischToetreden`
laat zien wat dat oplevert: de bronbewaking had `return () =>` kunnen zoeken, maar
niet vinden dat een andere dep dezelfde fout opnieuw veroorzaakt.

## Terugdraaien

De dependencies verwijderen kan met `npm uninstall jsdom @types/react-dom`; dan
vervalt alleen `useAutomatischToetreden.test.ts`, dat zonder DOM niet draait. De
hook en het scherm hebben ze niet nodig.
