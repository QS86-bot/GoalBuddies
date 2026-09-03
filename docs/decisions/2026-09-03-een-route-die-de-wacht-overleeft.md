# Een route die de wacht overleeft

**Datum:** 03-09-2026
**Issue:** QS8-266
**Status:** gebouwd

## Wat er aan de hand was

`app/onboarding/profiel.tsx` zet `onboarded_at`, schrijft het nieuwe profiel in
de context en navigeert daarna naar `/onboarding/vragenlijst`. De routewacht in
`app/_layout.tsx` kreeg alleen het eerste routesegment mee. Dat is `onboarding`,
de gebruiker is op dat moment net afgerond, en de laatste regel van
`bestemmingVoor()` luidde:

```ts
return opAanmelden || inOnboarding ? '/' : null;
```

Gevolg: de vragenlijst uit QS8-257 is nooit vertoond. De gebruiker landde op de
startpagina.

⚠️ **Dit is onwrikbare regel 18, vraag 5, in zuivere vorm.** Elk schakeltje was
af — het scherm, de vier vragen, `patchUitVragenlijst()`, de kolommen en CHECK's
uit migratie 0143, de kolomrechten. Er was niets kapot en dus niets rood te
maken. De keten was alleen nergens verbonden.

## De keuze: een lijst in de wacht, en niet het scherm verplaatsen

Er waren twee manieren om dit te repareren.

**A. Het scherm verhuizen** naar `app/vragenlijst.tsx`. Dan is `wortel` gelijk
aan `vragenlijst`, valt de route buiten `inOnboarding`, en is er helemaal geen
uitzondering nodig. Structureel het schoonst: geen tweede segment, geen lijst.

**B. Een uitzondering in de wacht** — `NA_ONBOARDING_BEREIKBAAR`, gevoed met het
tweede routesegment.

**Het is B geworden, om twee redenen.**

1. **Een verhuizing is de gevaarlijkste beweging die er is** — CLAUDE.md zegt
   dat met zoveel woorden, en twee van de zeven duurste fouten in dit project
   kwamen eruit. Het pad `/onboarding/vragenlijst` staat bovendien in besluit
   A56 en in QS8-257; het verplaatsen maakt drie documenten onwaar om een
   codeprobleem op te lossen.
2. **De uitzondering is de eerlijkere beschrijving.** De vragenlijst hóórt bij de
   onboarding — hij komt er direct achteraan, hij gaat over dezelfde vier vragen,
   en hij staat niet in de tabbalk. Wat er níét klopte, was de aanname dat
   "onboarding" en "nog niet afgerond" hetzelfde zijn. Optie A verstopt die
   aanname door de route eruit te tillen; optie B schrijft hem op.

De prijs van B is dat er nu een lijst is die iemand moet onderhouden. Dat is
bewust: wie er een route aan toevoegt, zegt daarmee dat dat scherm ook ná het
afronden zin heeft, en dat is een besluit.

## Waar de bewaking zit

`src/modules/auth/routewacht.test.ts` toetst de beslissing zelf: de vragenlijst
blijft staan, elk ánder onboardingscherm niet. Dat is het ónderdeel.

De belofte staat in `tests/beloftes/onboarding-eindigt-ergens.test.ts`, en dat is
de naad: **elk scherm waar de onboarding je heen stuurt, bestaat en wordt door de
routewacht met rust gelaten in de stand die er op dat moment is.** Die test leest
de paden uit de schermen in plaats van ze op te schrijven — een test met
`'/onboarding/vragenlijst'` erin getypt toetst de lijst in de wacht tegen
zichzelf en blijft groen als het scherm morgen ergens anders heen stuurt.

⚠️ **Acht grendels, acht mutaties, elk apart rood gemaakt:**

| Mutatie | Wat er rood werd |
|---|---|
| `NA_ONBOARDING_BEREIKBAAR` leeg | de eenheidstest én de naadtest |
| `profiel.tsx` stuurt naar `/onboarding/uitleg` | "en dat blijft staan" |
| `profiel.tsx` stuurt naar een scherm dat niet bestaat | "en dat scherm bestaat" |
| de vragenlijst klikt weg naar de onboarding terug | "en dat blijft staan" |
| `routesIn()` telt de groepsmap `(tabs)` wél mee | de ondergrens én de lezerstest |
| de vragenlijst verhuisd naar `app/onboarding/(extra)/` | "en dat blijft staan" |
| de `AsyncView` uit `vragenlijst.tsx` | grendel 6 in `onboarding-schrijft-niets-over` |
| de lege-patch-tak uit `updateProfiel()` | "een lege patch leest terug en schrijft niet" |

## Wat de security-review opleverde: twee fouten die dit issue zichtbaar maakte

⚠️ **Een scherm bereikbaar maken is een aparte gebeurtenis van een scherm
bouwen.** De vragenlijst was compleet en getest, en juist daarom had niemand hem
ooit doorlopen. De review van 03-09 vond er twee fouten in die tot die dag
onbereikbaar waren — allebei gemeten tegen de lokale stack, allebei zelf
nagespeeld voordat ik ze verwerkte.

**1. "Alles overslaan" eindigde in "Opslaan mislukt".** `patchUitVragenlijst()`
geeft met opzet `{}` terug als je alle vier de vragen overslaat; dat is de regel
die voorkomt dat overslaan bestaande antwoorden wist. `updateProfiel()` stuurde
dat lege object alsnog naar PostgREST, en een `PATCH` zonder velden raakt nul
rijen:

```
LEGE PATCH    >> {"code":"PGRST116","message":"JSON object requested, multiple (or no) rows returned"}
GEVULDE PATCH >> {"data":{"id":"aeb4e629-…"}}
```

De gebruiker las dus "Opslaan mislukt" onder een knop waar letterlijk naast staat
dat overslaan mag (acceptatiecriterium 4 van QS8-37), en `reportError()` schreef
er een melding met zijn user-id bij — ruis waardoor je je eerste échte
productiefout mist. De tak zit nu in `updateProfiel()` en niet bij de aanroeper:
elke aanroeper die het zelf gaat controleren, is de volgende keten die ergens
niet verbonden is.

**2. Het scherm miste de wacht op het profiel die het buurscherm wél heeft.**
`app/onboarding/profiel.tsx` is sinds 28-08 in twee componenten geknipt, met
25 regels uitleg erboven: de `useState`-initialisatoren draaien één keer, er is
geen effect dat ze bijstelt, en monteert het formulier terwijl `profiel` nog
`null` is, dan schrijft "Bewaren" standaardwaarden over wat er stond. Dat is de
week-startdag-bug. `vragenlijst.tsx` had exact hetzelfde patroon en geen
`AsyncView`.

⚠️ **Dat is de kopieerfout waar onwrikbare regel 19 voor waarschuwt: de
oplossing stond ernáást en is niet meegenomen.** Daarom is de reparatie niet
alleen de `AsyncView`, maar ook een register: grendel 6 in
`tests/beloftes/onboarding-schrijft-niets-over.test.ts` eist van élk
onboardingscherm dat een `useState` uit het profiel vult, dat het op het profiel
wacht. Een goed voorbeeld ernaast is geen bewaking.

**En één bevinding over mijn eigen test.** `bijAankomst()` bouwde de segmenten
met `pad.split('/')`, terwijl `useSegments()` **bestands**segmenten geeft —
groepsmappen tellen mee en een dynamisch segment heet letterlijk `[id]`. Vandaag
vallen die samen voor alle onboardingroutes, dus de test klopte toevallig. Kwam
er ooit een `app/onboarding/(x)/vragenlijst.tsx`, dan werd `tak` gelijk aan
`'(x)'`, matchte de allowlist niet meer, was de vragenlijst opnieuw onbereikbaar
— en bleef deze test groen. Dat is regel 18 vraag 3, en het is dichtgezet in
plaats van weggelegd: de segmenten komen nu uit de routetabel. Nagemeten door het
scherm daadwerkelijk in een groepsmap te zetten; dan wordt *"en dat blijft
staan"* rood.

Drie bevindingen zijn wél weggelegd, als Laag-rij in `docs/ENGINEER-REVIEW.md`
mét de voorwaarde die ze laag houdt: de vragenlijst heeft geen ingang buiten de
onboarding, `onboarded_at` is voor de client schrijfbaar, en `updateProfiel()`
kent geen limiet.

⚠️ **Die tweede is de bevestiging en niet de tegenwerping:** de routewacht draait
volledig op een vlag die de gebruiker zelf kan zetten, gemeten met één `PATCH`
die 204 gaf. Dat mag, want hij is navigatie en geen autorisatiegrens. Wie hier
ooit een scherm achter zet omdat het iets *mág*, is die rij tegengekomen.

## Wat hier niet gemeten is

⚠️ **Er is geen browser aan te pas gekomen.** Acceptatiepunt 1 van het issue
vraagt om nameten in een draaiende app; dat vergt een echte sessie tegen
Supabase, en die is er in deze omgeving niet. Wat wél gemeten is: de beslissing
die de wacht neemt is een pure functie, `bestemmingVoor()` gaf voor deze stand
aantoonbaar `'/'`, en `app/_layout.tsx` voert die uitkomst zonder tussenkomst uit
als `router.replace(bestemming)`. Het gat tussen die twee is de renderer, en dat
gat is niet dichtgemeten.
