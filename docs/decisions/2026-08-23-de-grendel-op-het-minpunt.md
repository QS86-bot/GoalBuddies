# De grendel op het minpunt — waarom 0064/0065 niet af waren

**Datum:** 23-08-2026
**Aanleiding:** security-review op branch `claude/goalbuddies-rls-suite-b6mi31`
**Issue:** QS8-110
**Migraties:** 0066, 0067, 0068

## Wat er misging

Migraties 0064 en 0065 gaven een gebruiker zonder buddy geen minpunt meer. Het
idee klopt en blijft staan: wie zijn week door niemand kan laten goedkeuren,
hoort er ook niet voor gestraft te worden.

De uitvoering deugde niet. De vraag *"kon iemand deze week beoordelen"* werd
gesteld op het moment dat het punt geboekt werd, en beantwoord door te kijken of
het doel op **dat moment** aan een groep hing. Allebei de kanten van die
koppeling zijn een knop in de eigen app:

```
goal_group_links_delete  — de doeleigenaar mag verwijderen, onvoorwaardelijk
goal_group_links_insert  — en terugzetten zolang hij lid is
```

Nagemeten met `pg_get_functiondef()` en `pg_policy` tegen het echte project, niet
uit de migratiebestanden gelezen.

**De route:** zie vrijdag dat je je week niet haalt, ontkoppel het doel van je
groep, laat de rollover langslopen (status wordt `missed`, minpunt vervalt),
koppel maandag terug. Elke slechte week. Je score kan dan alleen nog omhoog.

Dat is letterlijk wat domeinregel 10 verbiedt: *"anders is missen gratis en zegt
de score niets"*. Dezelfde klasse als de vier routes uit 0043 t/m 0046.

## Het besluit

**De vraag wordt niet slimmer gesteld; het antwoord wordt vastgelegd.**

`weekly_goals.beoordeelbaar` is een grendel die maar één kant op beweegt:

| gebeurtenis | grendel |
|---|---|
| weekdoel aangemaakt terwijl het doel in een groep zit | gaat om |
| doel gaat gedurende de cyclus alsnog een groep in | gaat om |
| doel gaat de groep uit | blijft staan |
| eigenaar zet de kolom zelf op `false` | blijft staan |

Die laatste regel is geen bijzaak. Zonder de `BEFORE UPDATE`-trigger is de hele
reparatie een decoratie: `weekly_goals` is voor de eigenaar bij te werken, dus
dan zet je de conclusie gewoon zelf om. Twee sloten, want er zijn twee routes.

### Waarom geen historie op `goal_group_links`

Dat was het alternatief: een append-only tabel met koppel- en ontkoppelmomenten,
en dan de vraag beantwoorden over het interval van de cyclus. Correcter in
theorie, en een tabel erbij voor precies één vraag. De grendel geeft hetzelfde
antwoord voor elke situatie die zich in de praktijk voordoet, en hij is met vier
triggers en één kolom te lezen.

### De bewust gulle kant

Koppel je een doel dat al weken solo openstaat alsnog aan een groep, dan tellen
die openstaande weken vanaf dat moment mee. Dat kan een minpunt opleveren voor
een week waarin je feitelijk geen buddy had.

Dat is de goede kant om fout te gaan. De andere kant is de kant waar missen weer
gratis wordt. Alleen onafgewikkelde weekdoelen (`todo`/`cancelled`) worden
geraakt — een cyclus die al `missed`, `approved` of `excused` is, blijft met rust
(domeinregel 6, append-only).

## Bewijs

Uitgevoerd tegen `wehgocadxehottiiyvsc` in transacties die op `rollback`
eindigen, zodat er niets bleef staan:

| stap | verwacht | gemeten |
|---|---|---|
| A. weekdoel op gekoppeld doel | grendel `true` | `true` |
| A. weekdoel op solodoel | grendel `false` | `false` |
| B. ontkoppelen, dan minpunt boeken | koppeling weg, punt tóch geboekt | 0 koppelingen, 1 puntrij |
| C. eigenaar zet grendel op `false` | blijft `true` | `true` |
| D. solodoel alsnog gekoppeld | grendel gaat om | `true` |
| E. écht solo, minpunt boeken | geen puntrij | 0 rijen |
| E. écht solo, correctie boeken | wél een puntrij | 1 rij |

Stap E is er om te bewijzen dat QS8-110 zelf nog werkt, en dat de trigger alleen
`cycle_missed` raakt.

De regressietest staat in `tests/rls/minpunt.test.ts`, blok *"laat ontkoppelen na
afloop het minpunt niet verdampen"*. Gaat die ooit rood, dan is de score weer te
sturen.

## Meegenomen uit dezelfde review

**M1 — drie definities van "telt mee als groepslid".** 0064 schreef
`m.status = 'active'`, de goedkeuringspolicy uit 0023 gebruikt
`m.status <> 'inactive'` (net als elf andere plekken), en 0037 gebruikt
`not in ('inactive','paused')`. Gevolg: staat je enige buddy op `paused`, dan
mág die je week goedkeuren terwijl het minpunt vervalt — dezelfde asymmetrie als
K1, via de status van iemand anders. 0066 zet `kan_beoordeeld_worden` gelijk aan
de goedkeuringspolicy, want de vraag is precies "kon iemand goedkeuren".

**M2 — 0062 brak webregistratie van pushtokens (migratie 0067).** 0062 zette een
CHECK op `push_tokens` die websleutels verplicht stelt, en
`registreer_push_token()` is niet meegewijzigd. Elke aanroep met
`p_platform = 'web'` liep op een CHECK-schending stuk, ongevangen, dus de
gebruiker kreeg een ruwe Postgres-fout (23514) door PostgREST heen in plaats van
`{ok:false, reason}`. De RPC is aan `authenticated` gegrant, dus elke ingelogde
gebruiker kon die 500 opwekken.

> **De les die hier hoort te blijven staan:** 0062 voegde een constraint toe op
> een tabel waar precies één functie in schrijft, zónder die functie mee te
> wijzigen. De tabel was leeg, dus de migratie slaagde en er ging niets zichtbaar
> stuk. Een CHECK op een kolom die de enige schrijver niet vult, is geen
> bescherming maar een tijdbom — hij gaat pas af als de feature aangaat.

**M3 — `image_url` accepteerde `javascript:` (migratie 0068).** `z.string().url()`
is in zod 4 geen schema-allowlist; nagemeten met 4.4.3 komen
`javascript:alert(1)`, `data:text/html,…` en `file:///etc/passwd` er alle drie
doorheen. Server-side stond er niets. Een commitment is per domeinregel 11
leesbaar voor de begunstigde groep zodra de straf verschuldigd wordt, dus zodra
iets dat veld rendert is dat opgeslagen XSS richting je groepsgenoten. Vandaag
onbereikbaar — er is geen renderpad — maar dit is wél de wijziging die dat schema
onder test bracht, en de test legde de te ruime regel vast als correct. **Een
test die een gat bekrachtigt is erger dan geen test.**

Nu allebei: een `.refine()` op `https://` én een CHECK in de database.

## Kleiner, in dezelfde ronde

- `public/sw.js` — `//evil.com` begint met een schuine streep en is voor de
  browser een protocol-relatieve URL, dus `clients.openWindow()` opende een
  externe site vanaf een melding. Nu ook `!pad.startsWith('//')`.
- `scripts/sync-edge-shared.mjs` — de kop van `webpush-crypto.ts` beloofde dat
  `edge:sync` hem meenam, en die lijst kende hem niet. Dat is precies de
  motivering om dat bestand in `src/` te zetten. Belofte waargemaakt in plaats
  van geschrapt: hij heeft nul imports en gebruikt alleen WebCrypto.
- `.env.example` — verwees naar een secret-scan in `scripts/deploy-web.mjs`. Dat
  bestand bestaat niet en heeft nooit bestaan. Wie dat leest, denkt dat er een
  vangnet is.
- `tests/rls/harness.ts` — het opruimen liet elke run één groep achter, opgelopen
  tot zeventig wezen op 22-08. Mechanisme: `besluiten.test.ts` verwijdert `dave`
  als onderdeel van A3, `groups.created_by` gaat via ON DELETE SET NULL op NULL,
  en daarna vindt `wipe('groups','created_by')` die groep niet meer. Nu worden de
  groepen van de run vooraf opgeschreven en achteraf opgeruimd — maar alleen als
  er daarna niemand meer in zit.

## Wat dit over het proces zegt

Regel 19 zegt dat de security-reviewer nooit wacht, met als reden dat wat je
uitstelt meegroeit met wat je erop bouwt. Dit is daar een voorbeeld van in beide
richtingen:

- De review vond het gat **in dezelfde sessie** waarin 0064/0065 gebouwd werden.
  De reparatie was één migratie. Was EPIC 12 er bovenop gebouwd, dan was elke
  score-afgeleide verdacht geweest.
- Diezelfde regel zegt óók: *verifieer elke bevinding zelf*. Van de zeven
  bevindingen die verwerkt zijn, is er geen enkele op gezag aangenomen — K1, M1,
  M2 en M3 zijn stuk voor stuk nagemeten tegen `pg_get_functiondef()`,
  `pg_policy` en een echte `zod`-aanroep vóór er iets veranderd is.

En één die de review zelf niet kon zien: de repo mist nog steeds de migraties
0057 t/m 0061, dus `supabase/migrations/` kan het project niet reconstrueren.
Dat staat in `2026-08-22-rls-suite-tegen-productie.md` en blijft open.
