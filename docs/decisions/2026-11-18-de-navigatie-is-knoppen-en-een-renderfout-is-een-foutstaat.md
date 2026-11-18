# De navigatie is vijf knoppen en een renderfout op een tabblad is een foutstaat (QS8-705)

Besloten 18-11-2026 door een bouwsessie, naar aanleiding van een melding van Quinten tijdens het klikpad van QS8-634.

## Wat er gemeld werd

1. "Groep" in het menu en de knop "Naar mijn groepen" geven een volledig wit scherm.
2. Het menu is één lap kleine tekst; Quinten wil knoppen, onder elkaar.

## Wat gemeten is (en wat niet)

📏 Gemeten op een lokale webexport (`expo export --platform web`) met Playwright en gemockte REST-antwoorden, zonder inlog op productie:

| `groups` levert | resultaat vóór de reparatie |
|---|---|
| lege lijst | lege staat, scherm in orde |
| een groep | lijst in orde |
| HTTP 500 | foutstaat van `AsyncView`, in orde |
| een groep met een tijdzone die `Intl` niet kent | **`document.body` leeg**: `RangeError: Invalid time zone` uit `isHuddledagVandaag()` tijdens het renderen |
| een groep met een object waar een tekst hoort | idem (React #31) |

**Het mechanisme is gereproduceerd:** een fout tijdens het *tekenen* heeft nergens een vanger. `AsyncView` vangt een mislukte query, niet een gegooide renderfout, en er stond geen `ErrorBoundary` in `app/`. Elke renderfout op een tabblad laat dus het hele scherm leeg, inclusief menu.

**De trigger in productie is niet gemeten.** Productie is vanuit de cloudsessie niet bereikbaar (de proxy weigert de host) en er is bewust niet ingelogd. Dat "Naar mijn groepen" (`router.replace('/groep')`) hetzelfde scherm geeft, wijst op data-afhankelijkheid van dezelfde tabblad; een onbekende tijdzone is de enige trigger die ik echt heb kunnen laten gebeuren. Na de deploy zegt Sentry het: `reportError(…, 'tab.render')` meldt nu elke vangst met de foutnaam.

De service worker (`public/sw.js`) is alleen een pushontvanger en cachet niets; een verouderde bundel via de worker is daarmee uitgesloten. Of Hostinger of de browser een oude `index.html` serveert (QS8-139) is **ongemeten**.

## Besluiten

1. **Een `ErrorBoundary` per tabblad** (`export { TabFout as ErrorBoundary }` in elk bestand van `app/(tabs)/`) en op `app/groep/[id].tsx`.
   *Niet* één op `app/(tabs)/_layout.tsx`: die vervangt de hele navigator, en de menuknoppen in de foutstaat wijzen dan naar een router die zelf in de fout staat. Gemeten: met een boundary per tabblad werkt het menu in de foutstaat (klik op Doelen toont Doelen; terug op Groep toont de herstelknop weer). *Niet* op de wortel: `RootLayout` draagt zelf de providers, dus een fallback daar heeft geen thema en geen veilige zone.
   De foutstaat toont nooit `error.message` (zelfde reden als `AsyncView`) en meldt de fout, want een door React gevangen fout haalt `window.onerror` niet.
2. **`isHuddledagOp()` toetst de tijdzone vooraf** (`isGeldigeTijdzone()` uit `shared/time`) en geeft bij een zone die dit toestel niet kent `false`, met één `reportError` per zone. Dat is een label bij een groep, geen berekening waar iets van afhangt. Elke andere fout wordt *niet* opgevangen en gaat naar de foutstaat; een brede `try/catch` zou een latere regressie in `shared/time` stil "niet vandaag" laten zeggen, en zou op het renderpad bij elke render een Sentry-event sturen (de eerste versie deed dat; verbeterd na de code-critic).
   ⚠️ **De database weigert zo'n zone** (trigger in 0119 toetst tegen `pg_timezone_names`), dus `Mars/Olympus` komt in productie niet voor. Wat wél kan: de database kent er meer (1196) dan `Intl` op een oudere Hermes of Safari (418, gemeten in de kop van 0119), dus een zone die het toestel van de maker kent kan op dat van een medelid onbekend zijn. Dat is een aanname en niet gemeten; de test gebruikt een onbekende zone als stand-in.
   ⚠️ **Dit beschermt alleen de lijstregel.** `app/groep/weekafsluiting/[id].tsx`, `app/groep/leden/[id].tsx` en `app/groep/chat/[id].tsx` rekenen de groepsperiode uit en hebben geen boundary: dezelfde zone geeft daar nog steeds een wit scherm zonder menu. (Een eerdere versie van dit document beweerde het tegendeel; dat was onjuist.)
3. **De lege groepentab draagt zelf de knop "Groep aanmaken"** (`AsyncView` kreeg een optionele `empty.action`). De knop onderaan verdwijnt alleen als de lijst geladen is en leeg (anders staan er twee); tijdens het laden en bij een fout blijft hij staan.
4. **Het menu is vijf knoppen** met rand, tikvlak van minstens 44 punten en 15 punten tekst. Rol `link` met `aria-current="page"` en niet `button`: het zijn bestemmingen met een adres (`Link` tekent een `<a href>`), en een schermlezer zegt dan "link, huidige pagina". Visueel is het een knop. Landmark `navigation` met label "Hoofdmenu". Alleen themakleuren (`panel`, `border`, `text`, `accent`); geen eigen kleur, geen heldkleur. Het actieve tabblad heeft naast de kleur een dikkere rand.
5. **Twee vormen, breekpunt 900 punten (`BREED_VANAF`), en op beide staan de knoppen onder elkaar.** Breed: een kolom links van 220 breed naast de inhoud. Smal: dezelfde kolom gestapeld bovenaan over de volle breedte, want naast de inhoud laat een kolom van 220 op een telefoon (390) maar 170 punten over. *Eerst* was de smalle vorm een omslaande rij (de conservatieve keuze uit het issue); Quinten besliste op 18-11-2026 dat het ook op een telefoon onder elkaar moet. **De prijs, bewust genomen:** vijf knoppen van 44 punten met tussenruimte nemen bovenaan elk scherm ongeveer 260 punten hoogte in, ook in de groepschat met toetsenbord omhoog. Is dat in de praktijk te veel, dan is een inklapbaar menu de volgende stap en geen terugkeer naar scrollen of afkappen. Scrollen en afkappen blijven uitgesloten: dat verbergt tabbladen.
6. **Beginstand `bovenrand` en de echte breedte pas na het hydrateren** (`useSyncExternalStore` met server-snapshot). De webexport wordt vooraf getekend zonder venster.

## Wat dit niet is

- Geen oorzaak-voor-productie. Wat er bij Quinten gebeurde, is een aanname tot Sentry het toont.
- Geen boundary op alle 27 routes: alleen de vijf tabbladen en het groepsdetail. Een route zonder boundary valt terug op wat er vandaag is. Een vangnet als gewone React-boundary in de JSX van `RootLayout` om `<Stack>` (binnen de providers, dus mét thema; zie de bevinding van de code-critic) is niet gebouwd en wél de juiste volgende stap; het moet resetten op padwissel, anders is het menu in de foutstaat dood. **Vervolgissue.**
- Geen oplossing voor een fout in `Screen`, `Taakbalk` of het thema zelf: de foutstaat tekent dezelfde rand en gooit dan opnieuw. Alleen dat vangnet in de wortel dekt dat, en dan zonder menu.
- De herstelknop herlaadt het scherm; zit de fout in de data zelf, dan keert hij terug.

## Open vragen voor Quinten (niet beslist door de bouwsessie)

1. ~~Menu als rij op een telefoon~~ Beslist: ook op een telefoon onder elkaar (besluit 5). Meet na de deploy of ~260 punten bovenaan elk scherm te veel is.

## Twee dingen die onderweg gemeten zijn en niet van dit issue zijn

- 📏 **React #418 (hydratie) bij elke Nederlandstalige laadbeurt.** De statische export wordt in het Engels vooraf getekend; de client rendert Nederlands. Met `locale: 'en-US'` verdwijnt hij. Hij gaat via `globaal.fout` naar Sentry. Vervolgissue.
- `Link asChild` geeft een stijl-*functie* niet door aan de `<a>` (knoppen bleven 19 punten hoog) en een stijl-*array* ongeflattend door (`Failed to set an indexed property`, wit scherm op elk tabblad). `Taakbalk` flattent daarom een stijlobject.

## Grendels

`tests/beloftes/tabblad-foutstaat.test.ts`: elk bestand in `app/(tabs)/` exporteert de foutstaat; een onbekende zone is geen renderfout (en een geldige rekent nog); het breekpunt. Geijkt met de hand: export uit `lijst.tsx` halen geeft rood op de lijst-toets; de try/catch uit `isHuddledagOp()` halen geeft rood op de zone-toets; `BREED_VANAF` op 700 geeft rood op het breekpunt. Dat expo-router de export ook daadwerkelijk om de route zet is met Playwright gemeten en staat niet in CI.

## Waar wat woont (aanvulling 18-11-2026, uit het klikpad van Quinten)

Het menu heeft vijf bestemmingen en geen zesde. Wat daarbuiten bereikbaar is, woont op een tabblad:

| bestemming | ingang | zichtbaar voor |
|---|---|---|
| `/meldingen` | kaart op het tabblad **Profiel** (`MeldingenIngang` in `app/(tabs)/profiel.tsx`). Wacht er iets: "Er wacht een melding". Wacht er niets: "Meldingen" met de zin dat er nu niets wacht. | platformbeheerder en beheerder van minstens één groep waar je niet inactief in bent; voor niemand anders. Bij een storing een foutkaart met herstelknop. |
| `/beoordelen` | kaart "Te beoordelen" bovenaan het tabblad **Groep** en op **Vandaag** (`TeBeoordelenKaart`) | wie iets te beoordelen heeft |
| `/groep/nieuw`, `/groep/deelnemen`, `/mensen/zoek`, `/groep/ontdek` | knoppen op het tabblad **Groep** | iedereen |

📏 **Waarom Quinten `/meldingen` eerst niet vond.** De kaart verscheen alleen als `openstaande_meldingen()` een rij gaf. Een beheerder met een lege wachtrij en een gewone gebruiker krijgen allebei nul rijen, dus voor beiden was de ingang onzichtbaar.

### Besluit: de permanente ingang (op verzoek van Quinten, 18-11-2026, migratie 0299)

De client mag niet zelf een rol raden (een rolcontrole in de schermlaag is een tweede waarheid naast de RPC, zie `app/meldingen.tsx`). De vraag "beoordeel ik ergens iets?" gaat daarom naar de database, en de functie bestaat al: `moderatiepoort()` uit 0297 (M3), de kostenpoort binnen `openstaande_meldingen()`. Hij was nooit aan `authenticated` gegeven.

- **0299 is alleen een grant** (en een commentaar), geen nieuwe functie en dus geen nieuwe logica. Een wrapper had een tweede definitie betekend die uit elkaar kan lopen met de poort die `openstaande_meldingen()` zelf gebruikt. De gegenereerde types kennen `moderatiepoort` al (`Args: never; Returns: boolean`), dus er is geen typecorrectie en geen handwerk in `database.types.ts`.
- **Wat hij prijsgeeft:** één boolean over de aanroeper zelf (geen argumenten, leest `auth.uid()`). Niets over een ander, dus domeinregel 7 is niet in beeld. `anon` krijgt hem niet.
- **De vraag is "mag ik kijken" en niet "wacht er iets".** De poort is ruimer dan beoordelen: een beheerder van een groep zonder meldingen krijgt ook `true`. Voor een ingang is dat gewenst; wat er te zien is blijft uitsluitend `openstaande_meldingen()` bepalen.
- **Volgorde op het scherm** (`meldingenIngangStand`, `src/modules/buddies/meldingeningang.ts`): wat wacht wint altijd van wat je mag, zodat de urgentie niet achter een rustige kaart verdwijnt; de tweede vraag wordt alleen gesteld als er niets wacht.
- **Elke beheerder van een groep ziet de rustige kaart**, dus ook wie alleen zijn eigen groep aanmaakte (de maker is beheerder). Dat is een keuze: ze kúnnen beoordelen. Wil je dat smaller, dan is dat een eigen besluit over wat "mogen beoordelen" betekent, en niet een knop in het scherm.
- **Bekende ruimte (security-review, laag):** de poort kijkt niet naar `groups.status`, dus een beheerder die alleen nog in een gearchiveerde of slapende groep zit, ziet de rustige kaart zonder dat er iets te beoordelen valt. Dat is geen lek: `mag_melding_als_beheerder()` toetst de status net zo min, en `tests/rls/hulpfunctiemodel.test.ts` legt `archief: false` bewust vast. **Wordt zwaarder als:** `moderatiepoort()` ooit als autorisatiepoort gaat dienen in plaats van als kostenpoort.
- **Migratie wacht op de batch.** Rollback: `revoke execute on function public.moderatiepoort() from public, anon, authenticated;`.
- Gemeten lokaal tegen een schema op 0299 (302 migraties, ook elk twee keer achter elkaar): `tests/rls/moderatiepoort-leesbaar.test.ts` (7), met drie mutaties per grendel. `tests/rls/functiegrants.test.ts` is **niet gedraaid**: hij vraagt PostgREST en die binary ontbreekt in de cloudsessie.

De uitnodigingspagina voor bestaande leden (QS8-708) en het delen van de uitnodiging (QS8-706) zijn buiten dit issue gelaten.

## De naam en inhoud van de Groep-tab (critical-user, 18-11-2026)

Quinten noemde de groepspagina "de instellingenpagina". Het woord "instellen" staat nergens op de tab, de lijst of het groepsscherm; het gevoel komt uit de **volgorde** van `app/groep/[id].tsx`: bovenaan de regel "Zichtbaarheid van deze groep", onderaan vier regelblokken (doel delen, beheren, verlaten, terug). De weekafsluiting staat als vijfde blok midden in de scroll.

**Gewijzigd (alleen tekst en knopvolgorde):** kop van de lijst "Je groepen" (was "Groep", de tab blijft "Groep"); "Ik heb een uitnodiging" (de lege staat zegt "uitnodigingslink", de knop zei "code"); "Een groep vinden om mee te doen" (gelijk aan de kop erachter) vóór "Iemand zoeken op naam" (twee gelijke "zoeken"-knoppen onder elkaar waren niet uit elkaar te houden); "Alle leden" in plaats van de kop herhalen.

**Niet gewijzigd en een besluit voor Quinten:** (1) de zichtbaarheidsregel naar beneden verplaatsen. Besluit A41 vraagt dat de stand continu zichtbaar is voor een gewoon lid; verplaatsen mag, weghalen niet, en welke plek volstaat is zijn keuze. (2) de weekafsluiting hoger zetten, vooral op de huddledag. (3) de blokken doel delen, beheren en verlaten achter één "Groep regelen" zetten. (4) een kop boven de doelkaarten van de leden ("Waar jullie aan werken"). Een tekstwijziging lost geen van de vier op.
