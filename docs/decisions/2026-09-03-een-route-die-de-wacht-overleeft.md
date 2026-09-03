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

⚠️ **Vijf grendels, vijf mutaties, elk apart rood gemaakt:**

| Mutatie | Wat er rood werd |
|---|---|
| `NA_ONBOARDING_BEREIKBAAR` leeg | de eenheidstest én de naadtest |
| `profiel.tsx` stuurt naar `/onboarding/uitleg` | "en dat blijft staan" |
| `profiel.tsx` stuurt naar een scherm dat niet bestaat | "en dat scherm bestaat" |
| de vragenlijst klikt weg naar de onboarding terug | "en dat blijft staan" |
| `routesIn()` telt de groepsmap `(tabs)` wél mee | de ondergrens én de lezerstest |

## Wat hier niet gemeten is

⚠️ **Er is geen browser aan te pas gekomen.** Acceptatiepunt 1 van het issue
vraagt om nameten in een draaiende app; dat vergt een echte sessie tegen
Supabase, en die is er in deze omgeving niet. Wat wél gemeten is: de beslissing
die de wacht neemt is een pure functie, `bestemmingVoor()` gaf voor deze stand
aantoonbaar `'/'`, en `app/_layout.tsx` voert die uitkomst zonder tussenkomst uit
als `router.replace(bestemming)`. Het gat tussen die twee is de renderer, en dat
gat is niet dichtgemeten.
