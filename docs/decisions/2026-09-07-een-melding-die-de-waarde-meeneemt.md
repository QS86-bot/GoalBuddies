# Een melding die de waarde meeneemt — QS8-315

**07-09-2026.** De dossierrij van 04-09 stond op *Laag* met een voorwaarde eronder:
*"wordt zwaarder als `SENTRY_DSN` gezet wordt"*. Die voorwaarde staat op het punt
waar te worden — QS8-24 wacht alleen nog op het aanzetten van de DSN — dus is de
rij afgewerkt vóór het aanzetten en niet erna.

## 1. Wat er precies fout was

Drie `meld()`-aanroepen interpoleerden de PostgREST-foutmelding letterlijk in de
tekst die naar Sentry gaat. De verdediging stond in het commentaar ernaast: *"de
melding van Postgres gaat door `scrubMessage()` heen voordat er iets verstuurd
wordt"*. Dat is waar en het is niet genoeg.

📏 **Gemeten met de échte functie, niet beredeneerd:**

| Melding | Wat eruit komt |
|---|---|
| `Europe/Bogus is geen bekende tijdzone` | **onveranderd** |
| `Te veel avatars voor deze gebruiker (12).` | **onveranderd** |
| `p_termijn_dagen moet minstens 1 zijn, kreeg 0` | **onveranderd** |
| `season_recap voor groep 3a2b is niet in de chat beland` | **onveranderd** |
| `duplicate key value violates unique constraint "groups_invite_code_key"` | `… constraint [weggelaten]` |
| `Key (invite_code)=(ZOMER2026) already exists.` | `Key (invite_code)=([weggelaten])` |

⚠️ **De onderste twee regels zijn het ongemakkelijkste deel van deze meting.**
`QUOTED` schoont de constraintnaam — schemametadata, precies wat je bij het
opzoeken nodig hebt — en laat de `%`-waarde staan. De schoonmaak beschermde de
veilige helft en liet de gevaarlijke door. Dat stond al met zoveel woorden in de
kop van `scrub.ts` en was daar als "een aparte afweging" weggezet; dit document is
die afweging voor de helft die te repareren viel.

De vorm is geen randgeval: `%` is hoe PL/pgSQL interpoleert, dus het is de vorm
die **onze eigen wachters** gooien. 📏 `grep` op de migraties geeft **42**
`raise`-regels met een `%` erin, in 22 verschillende vormen.

## 2. De rij telde er twee, en noemde er één verkeerd

De dossierrij zei *"twee andere plekken in dezelfde functie (de
goedkeuringstermijn en het inschuiven)"*. Nagemeten met een scan die haakjesparen
telt in plaats van regels te lezen:

| Plek | Waar |
|---|---|
| `rollover/index.ts:521` | `rollover.profielen` |
| `rollover/index.ts:653` | `rollover.goedkeuringstermijn` |
| `notificaties/index.ts:178` | `notificaties.profielen` — **een functie die de rij niet noemt** |

Het inschuiven roept `meld()` helemaal niet aan; dat telt alleen. Zelfde vorm als
QS8-206, waar de rij twee `console.error` telde en het er elf in twee functies
bleken. ⚠️ **Een dossierrij is een momentopname en geen inventaris.** Wie hem
afwerkt, telt opnieuw — en telt met een instrument, niet met zijn ogen.

⚠️ **En de eerste telling van vandaag was zelf ook fout.** Een regex
`\$\{[^}]*\.message[^}]*\}` telde `rollover.profielen` níét mee, want daar stond
`${(profielFout as { message: string }).message}` en de accolade van het type
sluit de klasse te vroeg. Dat geval staat nu als test in de ijking; het is de
reden dat `interpolaties()` accolades telt.

## 3. De reparatie: splitsen, niet schrappen

Het huispatroon lag al vast — in de kop van migratie 0158 en in het recap-pad van
QS8-171 — en de drie plekken zijn eraan gelijk getrokken:

* de **volledige tekst** gaat naar `console.error`, dus naar het functielog. Dat
  is een ander systeem met een andere bewaartermijn, en het verlaat de database
  niet;
* **Sentry** krijgt een vaste zin plus `{ code, sqlstate }`.

⚠️ **Dit is een verplaatsing en geen informatieverlies**, en dat verschil is de
hele reden dat het zo kan. Wie de melding nodig heeft, vindt hem — één klik verder
weg, in de logs van de functie die hem gooide.

### Waarom er een `sqlstate` bij moest

Zonder iets van de fout is `Error: profielen ophalen mislukte` in Sentry niet te
plaatsen: je weet dat het misging en verder niets, en dan is elke gebeurtenis een
uitstapje naar de Supabase-logs. Een SQLSTATE zegt genoeg om te weten wát voor
soort fout het is — `42501` is een recht, `PGRST202` een verdwenen route, `23514`
een constraint — en draagt per definitie geen gebruikerstekst. Dezelfde keuze als
in 0158, waar de teruggave per groep een `sqlstate` draagt en **geen** `sqlerrm`.

### Waarom die sleutel een vormtoets heeft en geen plek op de allowlist

`sqlstate` staat bewust **niet** in `ALLOWED_KEYS`. Een allowlist-sleutel is een
kanaal: alles wat een volgende aanroeper er in stopt, komt eruit — `scrubValue()`
haalt hem hooguit door `scrubMessage()`, en dat is precies de functie waarvan
hierboven gemeten is dat hij deze vorm doorlaat. Een sleutel die als vervanging
van een lek wordt ingevoerd, mag niet het volgende lek zijn.

Dus een **vormtoets**: `/^(?:[0-9A-Z]{5}|PGRST\d{3})$/`, en alles wat daar niet aan
voldoet wordt `[weggelaten]`. Wie er `sqlstate: fout.message` in zet, krijgt geen
melding maar ook geen inhoud. ⚠️ **Het verschil tussen een grens die afdwingt en
een afspraak die je moet onthouden** — en dat is precies de reden dat dit project
`revoke ... from public, anon, authenticated` uitschrijft in plaats van erop te
vertrouwen dat iemand eraan denkt.

## 4. De grendel, en wat de mutatietoets opleverde

Een tekstuele regel verliest het van de volgende `meld()` die iemand erbij zet,
want die is nuttig op het moment dat je hem schrijft. Daarom
`npm run meldtekst:controle` — geëxporteerd, tweezijdig geijkt, en meedraaiend in
de poort.

⚠️ **Hij is smal gehouden, en dat is een besluit.** Hij meldt niet dat een
foutobject rechtstreeks wordt doorgegeven (`meld(fout, …)`). Dat zijn er 173, en
een controle die 173 dingen meldt leert je hem te negeren — dezelfde stelregel als
bij `logboek-controle` en `persoon-in-jsonb-controle`. Die klasse staat als eigen
issue in §5.

**Zes mutaties, zes keer rood** — maar niet in één ronde:

| Grendel | Mutatie | Uitslag |
|---|---|---|
| de échte code van vóór de reparatie | teruggezet in `rollover/index.ts` | rood, met de juiste regel |
| `eersteArgument` | knipt niet meer op de eerste komma | rood |
| `interpolaties` | telt geen accolades meer | rood |
| `MELDINGSVORMEN` | alleen nog `.message` | rood |
| de declaratie-uitzondering | weggehaald | rood |
| `AANROEPEN` lookbehind | `(?<![.\w])` weggehaald | **eerst groen** |
| `FOUTCODE` in `scrub.ts` | vormtoets weggehaald | rood |

⚠️ **Die ene groene is de opbrengst van deze ronde.** Het ijkgeval zette
`log.meld(fout)` naast een echte treffer — maar `meld(fout)` geeft een object door
en wordt sowieso niet gemeld, dus de lookbehind viel weg zonder dat er iets rood
werd. De ijking voerde zijn geval door een pad dat een éérdere grendel al afving,
en bewaakte dus niets van wat hij beloofde. Precies de val die in `CLAUDE.md` bij
regel 18 staat, hier in het echt. Het geval is vervangen door een `.meld(` die
wél geflagd zou worden; daarna rood.

## 5. Wat hiermee **niet** opgelost is

📏 **173 aanroepen geven een foutobject rechtstreeks door** aan `meld()` of
`reportError()` — 📏 10 in de Edge Functions, 160 in `src/` en 3 in `app/`. Die leunen
allemaal op dezelfde `scrubMessage()` met hetzelfde gat: draagt zo'n object een
databasefout met een `%`-vorm, dan gaat de waarde alsnog mee.

⚠️ **Wat hier eerlijk bij hoort: hoevéél van die 173 er op een echte databasefout
uitkomen, is niet gemeten.** Een naamgebaseerde schatting zegt de meeste, maar dat
is een schatting en geen meting — en dit document is niet de plek om er een getal
van te maken dat er als een meting uitziet.

Dit is de eigenlijke oorzaak, en hij is niet per aanroeper te repareren maar
alleen in de schoonmaaklaag — met een echte ruil, want elke bezem die de
`%`-vorm vangt, kost ook leesbaarheid bij de 173 plekken die vandaag nuttige
meldingen doorgeven. Dat is een eigen afweging en dus een eigen issue: **QS8-319**.

**Wordt zwaarder als:** `SENTRY_DSN` in de Edge-omgeving gezet wordt (dan gaat de
edge-helft daadwerkelijk de deur uit), of zodra de eerste echte gebruiker zich
aanmeldt — vandaag is de database leeg en lekt het naar een Sentry-project van de
eigenaar zelf.

## 6. Wat er niet gebeurd is, en waarom

De `Response`-body van beide functies draagt de volledige melding nog wél
(`{ error: fout.message }`). Dat is bewust gelaten: die body gaat naar de
aanroeper van de job — de planner, met de service-role — en niet naar Sentry. Hij
verlaat Supabase niet, net zomin als het functielog. Het meeverhuizen zou de
diagnose van een mislukte job weghalen zonder dat er een lek mee dichtgaat.
