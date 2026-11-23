# Statische bestanden buiten de catalogus: een besluit per bestand (QS8-797)

Datum: 23-11-2026. Issue: QS8-797 (F3 en F4 uit de Engelse doorloop van QS8-143).

## Probleem

`tekst:controle` leest `src/` en `app/`. Nederlandse tekst in `public/manifest.json`,
`public/sw.js`, `app.json` en het linkvoorbeeld bereikte ook Engelse gebruikers, en
niets werd er rood van. Een statisch bestand kan maar één taal dragen.

## Besluiten

| Bestand | Keuze | Reden |
| --- | --- | --- |
| `public/manifest.json` | taalneutraal: `description` en `lang` weg | `name` is de merknaam; een beschrijving voor iedereen in één taal is voor de helft fout. Het installatiescherm valt dan terug op de naam. |
| `public/sw.js` | taalneutraal: terugvalmelding heeft alleen de titel | De server stuurt de tekst in de taal van de gebruiker; de terugval komt alleen bij een lege push en mag niets prijsgeven. Een melding met alleen titel volstaat om de toestemming te behouden. |
| linkvoorbeeld (`og:description`, `description`, `twitter:description`) | tweetalig: Nederlandse zin plus Engelse zin | Eén pagina voor alle talen en voor elke ontvanger gelijk. Titel is de merknaam. Nog steeds geen groepsnaam, ledental, code of afzender (domeinregel 7 en 4); de naadtest blijft. |
| `app.json` iOS-fototoestemming | Engels als basis, Nederlands in `locales/nl.json` (`ios.NSPhotoLibraryUsageDescription`) | Expo's `locales` is ingebouwd en vraagt geen nieuwe dependency. |
| F4: hint bij streefdatum van een mijlpaal | formaatnaam weg (nl en en) | Het veld is een kalenderkiezer en toont de datum in de taal van de gebruiker (01/01/2027); een hint met `yyyy-mm-dd` beloofde een invoervorm die er niet is. De adempauze-velden zijn echte tekstvelden en houden hun hint. |

## Besluit van Quinten (23-11-2026, meerkeuze via de orchestrator)

Quinten koos beide keren het advies: **A** tweetalig in één tekst uit de catalogus,
zonder groepsgegevens; **B** Engels als basis met Nederlands via `locales/nl.json`,
alleen zonder nieuwe dependency (anders alleen Engels). De drie kleine wijzigingen
(manifest zonder `description`, sw.js zonder terugvaltekst, datumhint zonder formaat)
zijn akkoord.

## Aanname (niet gemeten)

`npx expo config` leest `locales` en geeft de Engelse tekst als basis; dat iOS er een
`InfoPlist.strings` van maakt is niet te meten zonder native prebuild. `package.json`
kreeg geen dependency. Ook niet gemeten: de kaart in WhatsApp en Outlook.

## Grendel

`npm run statische-tekst:controle` (`scripts/statische-tekst-controle.mjs`) wordt rood
bij een Nederlandse zin in `manifest.json`, `sw.js` of `app.json`, en bij een
`description` of `lang` in het manifest. Met de hand geijkt: met de oude
`photosPermission` in `app.json` meldt hij `app.json:28`; met de oude `body` in
`sw.js` en `description` in het manifest meldt hij die ook (zie de test).
Zijn woordenlijst is smal met opzet: een Nederlandse zin zonder functiewoord uit de
lijst ontsnapt. `locales/nl.json` en de catalogi zijn bewust Nederlands en staan niet
in de lijst.
