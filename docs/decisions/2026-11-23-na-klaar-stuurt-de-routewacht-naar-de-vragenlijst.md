# Na Klaar stuurt de routewacht naar de vragenlijst — QS8-793

Datum: 23-11-2026. Gevonden in de klikronde van 22-11 (QS8-785, afdruk 733/03); op besluit van Quinten gerepareerd.

## Wat er gemeten is

Op de web-export van `main` 10116ee3, tegen een lokale database (Postgres 16 met alle migraties en PostgREST 12.2.12),
met een kleine lokale nabootsing van de auth (zelfgetekende tokens, geen GoTrue). Route: nieuw account, uitleg, profiel
(naam, Maandag, "Ik wil zelf een doel"), **Klaar**.

- **Vóór, 3 van 3:** navigatielog `… → replace /onboarding/profiel → replace /`. Geen enkele replace naar de vragenlijst.
- **De oorzaak, gemeten met een tijdelijke diagnose-build** (logregels in `Routewacht` en in `bewaar()`, niet
  gecommit): `zetProfiel()` en daarna `router.replace('/onboarding/vragenlijst')` liepen allebei synchroon. De
  eerstvolgende render van de wacht zag `onboarded = true` met de segmenten nog op `onboarding/profiel`, gaf `/`, en
  die replace won. Er kwam **geen enkele render met tak `vragenlijst`**. Het vermoeden uit het issue klopte.
- **Na, 3 van 3:** `… → /onboarding/profiel → /onboarding/vragenlijst → /doelen?belofte=na-vragenlijst → /`.
- **Een bestaand account, nieuwe sessie:** `/onboarding/profiel` en `/onboarding/uitleg` gaan naar `/` zoals altijd;
  `/onboarding/vragenlijst` rechtstreeks blijft openen (QS8-266); `/` blijft staan.

## Wat de bouw koos

1. **Eén navigator: de routewacht stuurt zelf naar de vragenlijst, het profielscherm navigeert niet meer.** Twee
   navigatoren raceten, en welke wint hangt af van wanneer de navigatie in de segmenten landt — dat is een eigenschap van
   expo-router op een platform, niet van deze code. Met één navigator is er niets om te raceten.
2. **De wacht weet het van een vlag `netAfgerond` in `ProfielProvider`, gezet in dezelfde handler als het profiel
   (`zetAfgerondProfiel()`).** Daardoor is er geen render waarin de wacht het afgeronde profiel ziet zonder de vlag. De
   vlag is van een gebruiker (`netAfgerondVoor === userId`), dus hij lekt niet naar een volgend account op hetzelfde
   apparaat, en hij leeft alleen in het geheugen: een herlaad of een nieuwe sessie kent hem niet.
3. **De vlag geldt alleen binnen `onboarding/` en buiten `NA_ONBOARDING_BEREIKBAAR`.** Hij neemt nooit een andere route
   over; dat staat onder test in `routewacht.test.ts`.
4. **`useRoutebestemming()` ruimt de vlag op zodra de vragenlijst in beeld is, of de route de onboarding uit is.** Anders
   stuurt een latere diepe link naar `/onboarding/profiel` in dezelfde sessie opnieuw naar de vragenlijst in plaats van
   naar `/` (criterium 2). Het tweede geval kwam uit de code-critic: `Werkcodewacht` en `Uitnodigingswacht` starten op
   dezelfde overgang en navigeren later, dus wie met een openstaande uitnodiging of werkcode afrondt, landt daar en niet
   op de vragenlijst. Dat was vóór deze wijziging ook zo (gelezen, niet gemeten).
5. **De standsamenstelling van de wacht verhuisde van `app/_layout.tsx` naar `useRoutebestemming()`.** `_layout` laadt
   niet onder de render-opstelling; zo is de naad met de échte provider te renderen.

## Afgewogen en niet gekozen

- **`'profiel'` aan `NA_ONBOARDING_BEREIKBAAR` toevoegen.** Dan blijft een afgerond account op het profielscherm staan
  en kan het daar zijn week-startdag en tijdzone overschrijven — precies wat de kop van `profiel.tsx` uitsluit.
- **De wacht een afgerond profiel op `profiel` altijd naar de vragenlijst laten sturen.** Dan gaat ook een bestaand
  account dat daar via een link belandt opnieuw door de vragenlijst; dat breekt criterium 2.
- **Het bewaren uit `profiel.tsx` naar een hook in `src/` verhuizen**, zodat het hele scherm-stuk te renderen is. Vijf
  beloftetests lezen dat bestand (`onboarding-schrijft-niets-over`, `de-tijdzone-volgt-het-apparaat`, …); een
  verhuizing laat die stil iets anders bewaken. De kleinere ingreep raakt alleen de laatste stap.

## Toetsing

- `src/modules/auth/routewacht-afronden.test.ts`: de echte `ProfielProvider`, `useRoutebestemming()` en
  `bestemmingVoor()` onder jsdom; alleen `fetchProfiel` en de sessie zijn vervangen. **De segmenten blijven met opzet op
  `profiel` staan na het afronden** — de gemeten vertraging. Met de hand gebroken, per grendel, en telkens viel de
  bedoelde test om:
  - het scherm terug op `zetProfiel()` + `router.replace()` → *het profielscherm rondt af met zetAfgerondProfiel()…*
    (de bronhelft; `profiel.tsx` laadt niet onder jsdom);
  - de nieuwe regel in de wacht uit → *gaat naar de vragenlijst, ook terwijl de route nog op profiel staat*;
  - `zetAfgerondProfiel()` zonder vlag → idem;
  - de vlag niet opgeruimd → *blijft daarna op de vragenlijst staan…* en *stuurt na de vragenlijst niet opnieuw…*;
  - de vlag ook buiten `onboarding/` → bleef in eerste instantie groen; daarom kwam het geval in `routewacht.test.ts`
    erbij, dat er daarna op omviel.
- `tests/beloftes/onboarding-eindigt-ergens.test.ts` las het pad uit `router.replace()` in `profiel.tsx`. Dat scherm
  navigeert niet meer; de bestemming van de wacht na Klaar wordt nu uit `bestemmingVoor()` gelezen en naast de
  routetabel gelegd.

## Aannames en wat niet gemeten is

- **Open productvraag, niet in dit issue:** hoort iemand die via een uitnodigingslink of werkcode binnenkomt de vragenlijst
  te zien? Vandaag niet, vóór en na deze wijziging.

- **Native is niet gemeten** (iOS/Android). De reparatie hangt niet af van het platform — er is één navigator — maar
  dat het op een toestel zo loopt, is niet gezien.
- **Productie is niet gemeten**; de meting liep op een lokale stack met een nagebootste auth.

## Besluit van Quinten

- 23-11-2026, meerkeuze via de hoofdorchestrator: **optie A**. Het eind van de vragenlijst verandert niet; na "Bewaren en
  verder" gaat een nieuw account naar `/doelen?belofte=na-vragenlijst`, zoals QS8-762 het doet. "Ziet daarna Vandaag" in
  criterium 1 betekent: daarna de app.
