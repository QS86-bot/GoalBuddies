# Een gedeelde uitnodiging met groepsnaam, en een algemeen linkvoorbeeld (QS8-706)

**Besluit (Quinten, 19-11-2026, tekst gekozen 20-11 als optie A).** De berichttekst die een lid zelf
verstuurt noemt de afzender (weergavenaam), de groepsnaam, GoalBuddies en wat de link doet. Het
mailonderwerp noemt de afzender en de app, nooit de groep. Het linkvoorbeeld in de webexport (Open
Graph en Twitter-tags) is voor elke route gelijk: het 512-pixel-logo, "GoalBuddies" en een algemene
zin. Geen groepsnaam, ledental, code of afzender.

**Waarom twee oppervlakken.** De berichttekst gaat naar de mensen die het lid zelf kiest. Het
linkvoorbeeld wordt door crawlers van WhatsApp en mailproviders opgehaald, gecachet en is publiek
(domeinregel 7 en 4). Daarom kent `linkvoorbeeldTags(appUrl)` alleen het adres van de app.

**Eén ontwerp.** `deelbareUitnodiging()` (QS8-751) blijft de enige bron van de link en weigert een
ingetrokken of lege code. `uitnodigingsBericht()` bouwt er de zin omheen; `deelbaarBericht()` koppelt
de twee, zodat een ingetrokken link nooit een bericht oplevert. De drie `*.deel_titel`-sleutels
vervallen.

**Bewaakt door** `tests/beloftes/een-linkvoorbeeld-draagt-geen-groep.test.ts`: elke deelknop gaat via `deelbaarBericht()` (de beheerknop deelde eerst ook bij een gesloten link, gevonden door de security-review); tags zonder
invulplek en alleen met logo, titel en beschrijving; onderwerp-sleutels met alleen `{naam}`; geen
eigen og-tag buiten `linkvoorbeeld.ts`. Elke grendel is met de hand rood gemaakt.

**Niet gemeten.** Hoe WhatsApp en Outlook de kaart tonen kan alleen op de gedeployde site.
**Grenzen.** De tags gelden voor de hele statische export; de beschrijving is daarom algemeen en
alleen in het Nederlands (`<html lang="nl">`).
