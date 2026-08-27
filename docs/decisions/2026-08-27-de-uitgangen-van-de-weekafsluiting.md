# De uitgangen van de weekafsluiting: waarschuwen, niet bewaren

**Datum:** 27-08-2026
**Aanleiding:** de rij van 18-08-2026 in `docs/ENGINEER-REVIEW.md` —
*"Onopgeslagen tekst in de weekafsluiting"*, nagemeten op 25-08 en toen nog open.
Die rij eindigde met **"Kiezen, niet vergeten."**

## Wat er stond

De weekafsluiting stelt drie vragen. Vraag 2 is de enige plek in de app waar
iemand zijn eigen tegenslag opschrijft — een van de precies drie routes waarlangs
tegenslag de groep bereikt, en alle drie lopen via de gebruiker zelf
(domeinregel 7).

Sinds EPIC 7 was er één slot: staat er tekst die nog niet gedeeld is, dan wordt
"Terug naar de groep" eerst een waarschuwing plus "Toch weg, zonder delen". Dat
dekte de uitgang die de app zélf tekent. Alle andere stonden open: verversen, het
tabblad sluiten, de terugknop van de browser, en de hardwareknop op Android.

## De keuze

De rij noemde twee wegen, en ze sluiten elkaar niet uit maar hebben een heel
andere prijs.

**A — waarschuwen op elke uitgang.** Een `beforeunload`-equivalent per platform.
Kost de gebruiker één extra tik op het moment dat hij weg wil.

**B — een lokaal concept bewaren.** De tekst in `AsyncStorage` zetten en bij
terugkomst terugleggen. Kost de gebruiker niets op het moment zelf.

**Gekozen: A. B is afgewezen.**

Op web is `AsyncStorage` gewoon `localStorage`: onversleuteld, leesbaar voor elk
script op de origin, en het blijft staan na uitloggen. Dan ligt de zwaarste zin
uit deze app — "waar liep het vast" — op een gedeelde of geleende computer,
zonder dat iemand daar ooit ja tegen heeft gezegd. Dat is dezelfde soort belofte
als bij een commitment device: iets dat consequenties heeft, mag nooit
stilzwijgend aan staan (domeinregel 5).

B is niet onmogelijk, maar dan hoort er een expliciete keuze bij, een wisknop, en
een opruiming bij uitloggen. Dat is een eigen issue en geen bijvangst van deze
rij. **Waarschuwen kost de gebruiker één tik; bewaren kost hem een belofte.**

## Wat er gebouwd is

`src/shared/ui/vertrekwacht.ts` — de pure kant, zonder imports — en
`useVertrekwacht.ts`, de React-kant die per platform precies één mechanisme
aansluit:

| Platform | Mechanisme | Dekt |
|---|---|---|
| web | `beforeunload` | verversen, tabblad sluiten, een ander adres intypen |
| Android | `BackHandler` | de hardwareknop |
| iOS native | — | er is geen equivalent; de app-knop is daar de enige uitgang |

Drie dingen die niet vanzelf spreken:

1. **Bij `actief === false` wordt er niets geregistreerd.** Dat is geen
   optimalisatie. Een `beforeunload`-luisteraar die er staat, zet de
   back/forward-cache van de browser uit — óók een luisteraar die niets doet.
2. **De handler doet `preventDefault()` én zet `returnValue`.** Het eerste is wat
   de standaard voorschrijft, het tweede is wat oudere Chromium-versies
   daadwerkelijk lezen. Met één van de twee is het in een deel van de browsers
   stil geen dialoog.
3. **De tegengehouden terugknop zegt waarom.** Tegenhouden alleen ziet eruit als
   een kapotte knop, dus het scherm zet er een regel bij en wijst naar de knop
   die wél weggaat.

## Wat er open blijft

**De terugknop van de browser.** Dat is een navigatie bínnen de
single-page-app en geen `unload`, dus `beforeunload` gaat niet af. expo-router 57
exporteert geen `usePreventRemove` (die functie bestaat wel in zijn interne
react-navigation-fork, maar het pakket heeft geen `exports`-veld en dus geen
ondersteund pad ernaartoe). De bekende omweg — bij vuile tekst een eigen
history-ingang duwen en op `popstate` opnieuw duwen — vecht met de router en kan
vooruit navigeren stilzwijgend kapotmaken. Dat is precies het soort slimmigheid
waar dit project al twee keer op is omgevallen, dus die is niet gebouwd.

Blijft staan als rij in `docs/ENGINEER-REVIEW.md`, met deze reden erbij.

## Hoe het bewaakt wordt

- `src/shared/ui/vertrekwacht.test.ts` — negen gevallen, tweezijdig geijkt, en
  met de hand op zes manieren rood gemaakt (terugknop geeft `false`, `returnValue`
  niet gezet, `preventDefault()` weg, registreren zonder tekst, opheffen doet
  niets, het scherm krijgt geen melding).
- `tests/beloftes/vertrekwacht.test.ts` — de naad. Elk bestand dat een
  `*.toch_weg`-sleutel gebruikt, moet ook `useVertrekwacht` aanroepen. Het spoor
  is de catalogussleutel en niet dit bestandspad, want tekst mag niet hardgecodeerd
  worden (`npm run tekst:controle`) en verhuist dus mee met het scherm. Met de
  hand rood gemaakt door de aanroep uit het scherm te halen; hij noemt het bestand
  dan met naam.
