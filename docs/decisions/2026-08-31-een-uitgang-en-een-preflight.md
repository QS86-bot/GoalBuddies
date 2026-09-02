# Een uitgang en een preflight — 31-08-2026

QS8-195 en QS8-211. Twee bugs uit de doorloop van 30-08, allebei van dezelfde
soort: elk onderdeel af en getest, de keten op één plek verbroken, en geen enkele
test die dat kón zien. Dit document legt de vier keuzes vast die niet
vanzelfsprekend waren.

---

## 1. De CORS-allowlist heeft een ingebakken standaard

**Keuze:** `TOEGESTANE_HERKOMSTEN` uit de omgeving, en zonder die variabele het
adres uit `CLAUDE.md`.

De alternatieven waren een wildcard en een lege standaard, en die zijn allebei
slechter.

`*` is niet nodig: de functies draaien onder het JWT van de aanroeper, dus een
wildcard levert niets op wat een lijst niet ook levert. Wat hij wél doet, is elk
domein in staat stellen om met de sessie van een ingelogde gebruiker mee te
lezen.

Een lege standaard leest als de veilige keuze en is het niet. Hij maakt de
Doelcoach precies zo onbereikbaar als de bug van QS8-195 — alleen dan stil, pas
op productie, en met een lege `TOEGESTANE_HERKOMSTEN` als enige spoor. Dezelfde
afweging staat al bij `STANDAARD_APP_URL` in `src/lib/env.ts` en om dezelfde
reden.

⚠️ **Wat er gebeurt als iemand tóch `*` in die variabele zet:** niets goeds en
niets gevaarlijks. `corsKoppen()` vergelijkt de `Origin` met de lijst, en geen
enkele herkomst is letterlijk `*`. De functie valt dan dicht en niet open. Dat is
de kant waarop een misconfiguratie hoort te falen, en het is geen toeval — het is
de reden dat er een `includes()` staat en geen patroonvergelijking.

## 2. Alle drie de functies krijgen CORS, ook de twee die het niet nodig hebben

**Keuze:** `metCors` om `rollover` en `notificaties` heen, terwijl die
server-side worden aangeroepen en dus nooit een preflight krijgen.

Het kost ze niets: zonder `Origin` geeft `corsKoppen()` een lege verzameling
terug en verandert er niets aan het antwoord. Wat het oplevert is dat de volgende
functie die vanaf het web wordt aangeroepen, niet dezelfde twee minuten kost die
de Doelcoach gekost heeft — twee jobs op `queued`, een scherm dat zestig rondes
volmaakte, en een dag zoeken.

⚠️ De preflight wordt beantwoord vóór de rolcontrole van die twee. Dat is geen
gat: een preflight draagt per definitie geen `Authorization`, en het antwoord is
een lege 204. Wie wil weten of de functie bestaat, wist dat al uit de 403.

## 3. `Terug.naar` is verplicht

**Keuze:** de bestemming is geen optie maar een eis van het type.

QS8-211 vroeg om "een `terug`-prop met een standaard die `router.back()` doet, en
de mogelijkheid om een expliciete bestemming mee te geven". De mogelijkheid is
een verplichting geworden, en dat is bewust strenger dan gevraagd.

`router.back()` alleen is op web een dode knop zodra iemand een URL rechtstreeks
opvraagt, en dat is geen randgeval: `scripts/deploy-web.mjs` schrijft juist een
`.htaccess` die elke diepe route naar de app stuurt, en een uitnodigingslink, een
bladwijzer en een melding komen alle drie zo binnen. Een dode terugknop is erger
dan geen terugknop — de gebruiker denkt dan dat de app hangt.

Met een verplichte bestemming is die toestand **onmogelijk** in plaats van
onwaarschijnlijk, en het kost één woord per scherm. Het gedrag blijft wat de
issue vroeg: `canGoBack()` beslist, en `naar` is de terugval.

⚠️ **Dezelfde val zat in zes schermen die hun eigen "annuleren" tekenden** met een
kale `router.back()`. Die waren op web precies zo dood als de schermen zónder
knop, en ze zagen er alleen niet zo uit. Daarom is `useTerug()` geëxporteerd:
niet omdat het twee regels scheelt, maar omdat de volgende schrijver de afweging
dan niet opnieuw hoeft te maken.

## 4. De uitgang van het doelscherm staat buiten de `AsyncView`

**Keuze:** "Klaar, naar mijn overzicht" hangt aan het scherm en niet aan de data.

Binnen de datatak is de knop er precies niet tijdens het laden en na een fout, en
dat zijn de twee toestanden waarin je hem het hardst nodig hebt. Dit scherm heeft
geen tabbalk onder zich; valt de uitgang weg, dan is er niets.

---

## 5. Nagekomen op 01-09: de ontwikkelserver hoorde erbij, en een 204 bewijst niets

Twee dingen kwamen pas boven toen de reparatie live stond en er echt tegenaan
gewerkt werd. Ze horen bij dit besluit, dus ze staan hier en niet in een eigen
document.

**De allowlist bevatte alleen het productieadres.** Dat maakte de Doelcoach
onbereikbaar vanaf `npm run dev:web`, en dat is precies dezelfde klasse fout als
QS8-195: de functie is er, hij werkt, en je kunt er niet bij — alleen viel deze
niet op productie op maar op de plek waar je hem zou repareren.
`isOntwikkelherkomst()` laat nu `localhost` en `127.0.0.1` toe op elke poort.

Waarom dat mag: een pagina kan zijn eigen `Origin` niet kiezen, dus alleen iets
dat écht op jouw machine draait krijgt die kop, en de functie eist nog steeds een
geldig JWT. CORS is hier geen authenticatie maar een beperking op wie het
ántwoord mag lézen. Supabase' eigen voorbeelden gebruiken `*`; dit is strikt
strenger.

⚠️ **De toets kijkt naar de hostnaam en niet of de tekst `localhost` bevat.**
Dat verschil is het hele slot: `https://localhost.kwaadaardig.example` bevat
`localhost` en is van iemand anders. Er staat een test op die precies dat geval
voedt, en de naïeve variant is met de hand gebroken om te zien dat hij rood wordt.

**En de statuscode van een preflight bewijst niets.** `metCors` antwoordt altijd
met 204, ook op een herkomst die niet op de lijst staat; alleen de kop is
voorwaardelijk. Dat is correct CORS-gedrag — de browser blokkeert op de
ontbrekende kop — maar het is een slecht debugsignaal, en op 31-08 is "de OPTIONS
geeft 204" gelezen als bewijs dat de reparatie werkte. Dat kostte een avond.

Het gedrag blijft zoals het is; wat verandert is dat het nu **vastligt** in
`tests/beloftes/edge-cors.test.ts` ("de status bewijst niets") en dat
`docs/DEPLOY.md` uitschrijft waar je wél naar kijkt. Wie de status ooit tóch wil
laten variëren, ziet dan dat het een besluit was en geen slordigheid.

## Wat hierna nog met de hand moet

De CORS-reparatie staat in de repo en niet op productie. Zolang
`npx supabase functions deploy doelcoach rollover notificaties` niet gedraaid is,
krijgt de preflight nog steeds 405. Zie QS8-140, dat over dezelfde stap gaat.
