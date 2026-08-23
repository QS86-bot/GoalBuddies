# Linear bijwerken — openstaand na de sessie van 23-08-2026

> **Waarom dit bestand bestaat.** De Linear-koppeling verliep halverwege de
> sessie van 22-08 en was op 23-08 nog niet beschikbaar in de draaiende sessie.
> Alles hieronder is werk dat gedaan is maar nooit in Linear is geland. Dit
> bestand staat in de repo en niet in een scratchpad, omdat die met de container
> verdwijnt.
>
> **Weggooien zodra het verwerkt is.**

## Hoe je dit afmaakt

Start een verse Claude Code-sessie (de herkoppeling van de connector werkt pas
in een sessie die daarná begint) en geef als opdracht: *"werk docs/linear-bijwerken-2026-08-23.md
af in Linear en verwijder daarna het bestand"*.

⚠️ **Lees per issue eerst de bestaande tekst voordat je een status omzet.** De
lijst hieronder zegt wat er in deze branch gebeurd is, niet wat er nu in Linear
staat. Waar ik onzeker ben over de scope van een issue, staat dat erbij.

---

## 1. Twee teksten die al klaarstonden (22-08)

Deze twee zijn woordelijk geschreven maar nooit geplaatst. Ze zijn als bestand
aan Quinten geleverd op 23-08; staan ze niet meer op zijn machine, dan zijn ze te
reconstrueren uit commit `bd7ff78` en `docs/decisions/2026-08-22-rls-suite-tegen-productie.md`.

| Wat | Waarheen |
|---|---|
| `linear-QS8-119-comment.md` | comment op **QS8-119** |
| `linear-nieuw-issue-migratieledger.md` | **nieuw issue**, project GoalBuddies. Titel, label en prioriteit staan bovenaan het bestand |

Het tweede issue blokkeert QS8-119 en op termijn meer: de repo mist 0057 t/m
0061 en het migratieregister kent twee onverenigbare nummeringen, dus
`supabase/migrations/` kan het schema niet opbouwen.

## 2. Issues uit deze branch

Branch `claude/goalbuddies-rls-suite-b6mi31`, PR
[#1](https://github.com/QS86-bot/GoalBuddies/pull/1).

| Issue | Wat er gebeurd is | Voorstel |
|---|---|---|
| **QS8-116** | De harnas tekent gebruikerstokens nu zelf (HS256) in plaats van in te loggen. `tests/rls/jwt.test.ts` draait zonder credentials en dus mee in CI, getoetst aan de RFC 7515 §A.1-vector. ⚠️ De diagnose in het issue klopte niet: het is een burstlimiet per IP, geen aanmeldquotum per uur — dat is nagemeten in de auth-logs. Zet die correctie in een comment, want het issue leidt anders de volgende lezer om de tuin. | Afgerond |
| **QS8-114** | Web push van nul gebouwd: `webpush-crypto.ts` (RFC 8291/8188/8292, alleen WebCrypto), service worker, manifest, iconen. Migratie 0067 repareert dat 0062 webregistratie onmogelijk had gemaakt. ⚠️ **Niet af:** `public/sw.js` wordt nergens geregistreerd — geen `navigator.serviceWorker.register` in `src/` of `app/`. | Open houden, of afsplitsen naar een nieuw issue voor de registratie |
| **QS8-117** | PWA-installatieadvies, inclusief iPadOS dat zich als Macintosh voordoet (`maxTouchPoints > 1`). | Afgerond |
| **QS8-118** | `src/shared/tekst`: codepunten als eenheid overal, want dat is wat `char_length` telt. Bij een ondergrens laat een client die in UTF-16 telt door wat Postgres weigert. | Afgerond |
| **QS8-119** | Grendel op het opruimen van testgebruikers, plus twee lekken gedicht: `createTestProfile` registreerde zijn gebruikers niet, en `besluiten.test.ts` liet elke run een wezen-groep achter. ⚠️ Het **structurele** deel (geen tweede project, geen lokale stack) blijft geblokkeerd door het migratieledger-issue uit punt 1. | Deels — niet afsluiten |
| **QS8-120** | ⚠️ **Ik weet de scope van dit issue niet zeker.** Het is in deze sessiereeks aangemaakt en afgewerkt, maar ik kan de issuetekst niet lezen. Lees hem eerst en vergelijk met de commits tussen `232fc0e` en `72a334e`. | Nakijken |
| **QS8-121** | Vier Zod-schema's losgeknipt van de Supabase-client zodat ze zonder client testbaar zijn. Daarbij bleek de CHECK op `commitments.body` volledig te ontbreken (migratie 0063). | Afgerond |
| **QS8-110** | Optie C gebouwd (geen minpunt zonder beoordelaar, 0064/0065) — en de security-review vond dat die twee migraties zelf een scoregat openzetten. 0066 dicht het met een grendel. Zie punt 3. | Afronden ná de merge van PR #1 |

## 3. QS8-110 verdient een eigen comment

Dit is de zwaarste bevinding van de sessie en hij hoort niet in een statusregel
te verdwijnen.

`kan_beoordeeld_worden()` uit 0064 vroeg *"kon iemand deze week beoordelen"* op
het moment dat het punt geboekt werd, en keek daarvoor of het doel op **dat
moment** aan een groep hing. De doeleigenaar mag `goal_group_links`
onvoorwaardelijk verwijderen én terugzetten — beide zijn een knop in de app. Dus:
ontkoppel op vrijdag, laat de rollover langsgaan, koppel maandag terug. Geen
minpunt. Elke slechte week. De score kan dan alleen nog omhoog.

Dat is precies wat domeinregel 10 verbiedt, en het maakt het getal waarop EPIC 12
en 9 gaan leunen betekenisloos.

0066 legt het antwoord vast op `weekly_goals.beoordeelbaar`, als grendel die maar
één kant op beweegt, plus een tweede trigger die verlagen door de eigenaar
blokkeert. Bewezen tegen prod in transacties die op `rollback` eindigen;
regressietest in `tests/rls/minpunt.test.ts`. Uitleg in
`docs/decisions/2026-08-23-de-grendel-op-het-minpunt.md`.

## 4. Eén nieuw issue dat er nog niet is

**Titel:** Hoe merken we dat een als "Laag" weggelegde bevinding zwaarder wordt
door iets dat we er later op bouwen?
**Label:** area:proces · **Prioriteit:** Medium

Op 17-08 staat in `docs/ENGINEER-REVIEW.md` de rij *"Bewijseis te omzeilen met
ontkoppelen"*: dezelfde primitieve handeling (eigenaar ontkoppelt en koppelt
terug), toen bewust als **Laag** weggelegd omdat het zelfbedrog was en geen
autorisatiegrens. Dat oordeel klopte op dat moment.

Vier dagen later stond er een feature bovenop die er wél een scoregat van maakte.

Het project heeft het antwoord al een keer goed gedaan: de A17-aantekening
("herbevestigen vóór EPIC 12") werkte precies zo, en CLAUDE.md noemt dat expliciet
als het bewijs dat zo'n aantekening werkt. Bij deze rij stond er geen. De vraag is
wanneer je zo'n aantekening plaatst en wie hem herleest.
