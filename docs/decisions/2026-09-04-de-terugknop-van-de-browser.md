# De terugknop van de browser: de reden was verlopen, niet de regel

**Datum:** 04-09-2026
**Aanleiding:** QS8-192 — de dossierrij van 27-08-2026 in `docs/ENGINEER-REVIEW.md`,
de staart van *"De uitgangen van de weekafsluiting"*.

## Wat er stond

De rij was **Laag**, en droeg zijn eigen vervaldatum mee:

> ⚠️ **Wordt zwaarder als:** expo-router een ondersteunde manier gaat exporteren
> om een navigatie tegen te houden (dan is dit één hook en geen omweg meer), of
> zodra er een tweede scherm bijkomt met tekst die je niet nog een keer typt.

De reden om hem te laten liggen was dat `usePreventRemove` wel in de interne
react-navigation-fork van expo-router zat, maar dat het pakket geen `exports`-veld
heeft en er dus geen ondersteund pad naartoe was.

## Wat er van klopte

Het eerste deel. Het tweede niet — en niet meer sinds langer dan de rij oud is.

`expo-router@57.0.13` publiceert `react-navigation.js` en `react-navigation.d.ts`
in de wortel van het pakket, en beide staan in `files`, náást `stack`, `tabs`,
`ui` en `testing-library`. Dat is een gepubliceerd toegangspunt en geen interne
indeling. Erachter loopt `build/react-navigation` → `native` → `core`, en dáár
staat `usePreventRemove`.

⚠️ **Het ontbrekende `exports`-veld wees de andere kant op dan gedacht.** Zónder
`exports` mag je in Node juist élk pad in het pakket importeren — ook
`expo-router/build/react-navigation/core/usePreventRemove`. Dat resolvet, en
`tsc` vindt er niets van. De afwezigheid van `exports` maakte het probleem dus
niet kleiner maar groter: er is geen rem die een diepe import tegenhoudt, terwijl
zo'n pad bij de volgende SDK stilletjes verschuift.

**De les is niet "expo-router is veranderd".** De les is dat de rij een reden
noemde die verifieerbaar was — één `package.json` — en dat niemand hem in de acht
dagen daarna nagemeten heeft. Een "Wordt zwaarder als" die op een controleerbaar
feit staat, hoort bij elke aanraking nagemeten te worden.

## Wat er gebouwd is

`useVertrekwacht` heeft er een derde been bij. De verdeling is nu:

| Uitgang | Mechanisme | Platform |
|---|---|---|
| verversen, tabblad sluiten, adres intypen | `beforeunload` | web |
| hardwareknop | `BackHandler` | Android |
| **terugknop van de browser** | **`usePreventRemove`** | **web** |
| **terugveeggebaar, header-terug** | **`usePreventRemove`** | **iOS + Android** |
| de knop die het scherm zelf tekent | het scherm | overal |

De iOS-regel is nieuw: het beslisdocument van 27-08 zette daar een streepje met
*"er is geen equivalent"*. Dat was waar voor `beforeunload`; `usePreventRemove`
dekt het gebaar wél.

### De val die er meteen bij hoorde

Een routerwacht houdt óók een navigatie **binnen** de app tegen. En "Toch weg,
zonder delen" is zelf zo'n navigatie.

⚠️ **Zonder tegenmaatregel houdt de wacht dus zijn eigen nooduitgang dicht.** De
knop doet dan zichtbaar niets, er is geen fout, er is geen melding, en de
gebruiker zit vast met precies de tekst die hij weg wilde gooien. Elk onderdeel
werkt; alleen de deur zit op slot. Dat is vraag 5 van regel 18 in zijn zuiverste
vorm — de keten is af en er is niets kapot.

De uitweg is niet "de wacht even overslaan", want dan is er een tweede pad langs
de wacht en groeit dat pad mee. Het is een render ertussen:

1. De knop meldt een **wens** aan de wacht (`verlaat(() => router.replace(...))`).
2. Daardoor valt `actief` weg — alle drie de benen laten los.
3. Pas in de commit dáárna wordt er genavigeerd.

Die volgorde staat als `vertrekstap()` in `src/shared/ui/vertrekwacht.ts`, waar
hij zonder React te toetsen is. De hook geeft `verlaat` terug, zodat de goede
weg ook de makkelijke weg is.

⚠️ **De volgorde binnen de hook is geen toeval.** `usePreventRemove(...)` staat
met opzet vóór het effect dat navigeert: effecten draaien in de volgorde van hun
hooks, en react-navigation werkt zijn luisteraar bij in een `useInsertionEffect`,
dus die is gegarandeerd al bij als er genavigeerd wordt. Wissel je de twee om,
dan blokkeert de wacht af en toe zijn eigen uitgang — af en toe, want het hangt
van de commit af.

## Wat er open blijft — en dat is nieuw en smaller

**De adresbalk loopt één ingang achter zolang de gebruiker blijft.**

Op web is de terugknop al gebeurd tegen de tijd dat de app hem kan weigeren: de
browser is verplaatst, `popstate` is afgegaan, en pas dán vraagt expo-router de
router om de route te verwijderen. Weigeren we dat, dan blijft het scherm staan
terwijl de adresbalk de vórige pagina toont. `useLinking` zet dat niet terug —
nagelezen in `build/fork/useLinking.js`: de correctie hangt aan het
`state`-event, en dat gaat bij een geweigerde navigatie niet af.

Gevolgen, in volgorde van waarschijnlijkheid:

- De gebruiker deelt zijn tekst of gebruikt "Toch weg" → de eerstvolgende
  navigatie zet de adresbalk vanzelf recht. Dit is verreweg het gewone geval.
- De gebruiker blijft en drukt nóg een keer terug → hij komt twee pagina's terug
  in plaats van één, want de eerste tik is opgegaan aan de waarschuwing.
- De gebruiker blijft en ververst → `beforeunload` waarschuwt eerst; drukt hij
  door, dan landt hij op de vorige pagina.

**In geen enkel geval gaat er tekst verloren zonder waarschuwing, en dat is de
belofte.** Vandaag gaat die tekst er zonder één woord af.

⚠️ **En er is met opzet geen `history.forward()` bij gezet.** Dat zou de
adresbalk rechtzetten en is één regel, maar het is opnieuw de browsergeschiedenis
sturen — precies de soort slimmigheid die deze rij op 27-08 heeft laten liggen.
Ik kan hier bovendien geen echte browser draaien, dus het zou ongemeten meegaan.
De rij hieronder is er om die afweging opnieuw te maken als iemand hem wél kan
meten.

Blijft staan als eigen rij in `docs/ENGINEER-REVIEW.md`, risico **Laag**, met
`**Wordt zwaarder als:**` erbij.

## Hoe het bewaakt wordt

- `src/shared/ui/vertrekwacht.test.ts` — `vertrekstap()` erbij, vijf gevallen,
  tweezijdig: `wachten` naast `gaan`. Met de hand rood gemaakt door `wachten` op
  `gaan` te zetten en door `undefined` als wens te laten tellen.
- `tests/beloftes/de-terugknop-van-de-router.test.ts` — de naad, en de reden dat
  hij bestaat is dat `npm run typecheck` hier twee dingen níet ziet: een diepe
  import resolvet en typecheckt prima, en een scherm dat langs zijn eigen wacht
  navigeert is geldige TypeScript.

  Zes grendels, elk apart geijkt tegen de échte bestanden — een mutatie per
  grendel en niet één voor de hele controle:

  | Mutatie | Wordt rood |
  |---|---|
  | import uit `expo-router/build/...` | ja |
  | `usePreventRemove(true, …)` | ja |
  | de aanroep helemaal weg | ja |
  | `usePreventRemove(wacht, () => {})` | ja |
  | het scherm roept `router.replace()` rechtstreeks aan | ja |
  | het scherm neemt `verlaat` niet aan | ja |

  En één die groen moet blijven: `useVertrekwacht.ts` hernoemen. De test zoekt
  het aansluitpunt op `export function useVertrekwacht` en niet op een pad, dus
  hij verhuist mee. Dat was op 03-09 drie keer fout.
