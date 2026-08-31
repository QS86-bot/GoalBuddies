# Plan vooruit, activeer per week — waarom een weekplan geen weekdoel is

*31-08-2026 · QS8-203 · migratie 0138*

## De vraag

Uit de review van 30-08: *"op basis van de mijlpalen wil ik dat er automatisch
weekdoelen gegenereerd worden."*

Dat klinkt als een knop die ontbreekt. Het is een ontwerpprobleem.

## Waarom de knop er niet was

Twee regels die elk voor zich klopten, maakten samen een val.

**Correctheidsregel 7** zegt dat geen enkele week- of tijdberekening buiten
`shared/time` gebeurt. `maakWeekdoel()` zet daarom altijd de **huidige** cyclus;
er was geen schrijfpad naar een toekomstige week, en dat is geen omissie maar de
regel die voorkomt dat een formulier bepaalt welke week het is.

**Domeinregel 10** zegt dat elk weekdoel het puntenplafond verhoogt —
`goals.max_points` is een trigger op `SUM(points_ceiling)` over `weekly_goals`.

Samen: zes voorgestelde weekstappen in één keer overnemen zou zes weekdoelen in
dezelfde week zetten. **Vijf gegarandeerd gemiste weken en vijf minpunten, voor
iets wat de app zélf heeft voorgesteld.**

Dat is de reden dat `/doel/weekdoelen/[id]` tot vandaag geen verzamelknop had, en
de kop van dat bestand schreef dat ook uit.

## Het besluit (Quinten, 30-08-2026)

**Plan vooruit, activeer per week.** De Doelcoach genereert het hele weekplan
onder een mijlpaal en zet dat weg als *plan*. Alleen de eerste stap wordt een
echt weekdoel in de huidige cyclus. Bij elke rollover schuift de volgende stap in
als weekdoel van de nieuwe cyclus.

## Wat er gebouwd is, en waarom zo

### Een eigen tabel, geen vlaggetje op `weekly_goals`

Dit is de belangrijkste keuze en hij is niet esthetisch.

Een geplande stap in `weekly_goals` zetten met een `gepland`-vlaggetje laat hem
meetellen in **élke telling die er nu al is**: `max_points` via de trigger,
`herbereken_reeks()`, `goal_dashboard`, `weekdoelen_over()`, en de rollover die
hem `missed` zou stempelen. De vraag wordt dan niet "welke tellingen moet ik
aanpassen" maar **"welke tellingen ben ik vergeten"** — en die tweede vraag
beantwoordt zich pas als er een minpunt te veel geboekt is.

`weekly_plan_steps` begint bij nul tellingen. Dat is de hele reden.

### De idempotentie is een index, geen afspraak

De rollover draait elk uur. Hij mag dus niet elke ronde een stap inschuiven —
dan staat er zondagavond een weekdoel of zeven.

⚠️ **De voor de hand liggende grendel bestaat niet en mag niet bestaan.** Een
unieke constraint op `weekly_goals (goal_id, cycle_start_date)` zou dit in één
regel oplossen, maar **besluit A37** (24-08-2026) staat twee weekdoelen op
hetzelfde doel in één week juist toe, en migratie 0074 rekent daarmee. De kop van
0083 heeft diezelfde voorgestelde constraint al eens afgewezen.

De grendel staat daarom op de nieuwe tabel, waar hij niets terugdraait:

```sql
create unique index weekly_plan_steps_een_per_cyclus
  on weekly_plan_steps (goal_id, activated_cycle)
  where activated_cycle is not null;
```

Eén doel activeert per cyclus hoogstens één stap. Een tweede rollover-ronde
krijgt `al_geactiveerd` terug.

### Twee kolommen voor één gebeurtenis

`activated_cycle` is de waarheid over "verbruikt". `weekly_goal_id` is de
terugverwijzing en **mag leeglopen**: `verwijder_weekdoel()` (0046) staat de
eigenaar toe een vers weekdoel weg te gooien.

Er is met opzet géén constraint die eist dat ze allebei gevuld of allebei leeg
zijn. Zo'n constraint zou `verwijder_weekdoel()` laten falen op een weekdoel dat
uit een plan komt — een storingsmelding op een handeling die niets met plannen te
maken heeft.

**Gevolg dat je moet weten:** gooi je het ingeschoven weekdoel weg, dan blijft de
stap verbruikt en schuift volgende week de vólgende stap in. Dat is de juiste
uitkomst — je wilde die week niet — maar het is een keuze en geen toeval.

### Drie functies en niet één

De rollover belt als `service_role` en heeft geen `auth.uid()`. De gebruiker belt
met een sessie en heeft er wel een.

Eén functie die "geen `auth.uid()`" leest als "dus service_role" ís de NULL-val
die dit project al eens veertig regels gekost heeft (`CLAUDE.md`, regel 19,
reden 2). Dus: één interne functie met het werk
(`weekplanstap_naar_weekdoel()`, aan geen enkele rol gegeven), en twee ingangen
die elk hun eigen toegangsbewijs eisen — `activeer_weekplanstap()` voor de
rollover, `start_weekplanstap()` voor de eigenaar.

`start_weekplanstap()` herhaalt de dagrem uit 0083/0091 met zoveel woorden. Hij
is SECURITY DEFINER en loopt dus om `weekly_goals_insert` heen; zonder die regel
is "start deze nu" het gat in die limiet. Precies de fout die 0091 voor
`schuif_weekdoel_door()` moest repareren.

### `userCycle` en niet `closableUserCycle`

Dat is het verschil tussen de twee helften van de rollover, en het is de
gevaarlijkste regel van deze migratie.

Afschrijven gaat over de week die vóórbij is en mag pas na de coulanceperiode.
Inschuiven gaat over de week waar de gebruiker **nú** in zit. Zou het inschuiven
`afsluitbaar` nemen, dan komt het nieuwe weekdoel binnen de coulanceperiode in de
vórige week terecht — en die is al verstreken, dus de eerstvolgende ronde
schrijft hem meteen als gemist af. **Een minpunt op een weekdoel dat de app zelf
net heeft aangemaakt.**

### Eén vraag per gebruiker, niet twee per doel

`weekplan_kandidaten()` geeft de actieve doelen met een openstaande stap én de
vroegste cyclus van dat doel in één keer terug. Dat tweede is de query die
`eersteCyclusVanDoel()` in de app per doel stelt; in een job die over élke
gebruiker en élk doel loopt, is dat de klassieke N+1 (onwrikbare regel 12).

⚠️ **`min(cycle_start_date)` is geen weekberekening**, en dat onderscheid is de
reden dat dit in SQL mag staan. Er wordt geen week afgeleid, geen week-startdag
toegepast en geen tijdzone gelezen. Het omrekenen naar een cyclusnummer gebeurt
in `shared/time`, in de Edge Function.

### Domeinregel 7

Eigenaar-only, alle vier de werkwoorden, met opzet géén tak voor groepsgenoten —
dezelfde vorm als `goal_risk` (0050) en `milestone_tips` (0103). Ook in een
**open** groep (A41) blijft dit dicht: `groups.zichtbaarheid` komt in geen enkele
policy voor.

Er komt **geen nieuw type systeembericht** bij. Een geplande stap is geen belofte
aan de groep; pas als hij een weekdoel wordt, gelden de bestaande regels en de
bestaande berichten.

Opgenomen als oppervlak 26 in `002-domeinregel7-oppervlakken.md`.

### Inschuiven is nooit stil

QS8-203 eist het met zoveel woorden: *automatisch inschuiven mag nooit
stilzwijgend het puntenplafond verhogen zonder dat de gebruiker het ziet.*

`fetchIngeschovenDezeCyclus()` voedt een melding op het hoofdscherm. Zonder die
melding komt er een weekdoel bij zonder dat iemand iets deed, en verandert de
score zonder dat iemand het ziet.

⚠️ Die melding leest `cyclus` en niet `afTeSluiten`, om dezelfde reden als de
rollover. Zou hij `afTeSluiten` lezen, dan verdwijnt hij precies in het venster
waarin hij het meest verrast.

## Wat de ijking opleverde, en de fout die daarin zat

Zeven grendels apart gebroken — mutatie per grendel, niet één mutatie voor het
geheel.

⚠️ **En de eerste ronde vond een fout in de test zelf.** Het geval *"heeft
dezelfde grenzen als `weekdoelSchema`"* zette titel, vloertekst en plafondtekst
alle drie in één object op 201 tekens. Toen de titelgrens bij het ijken van 200
naar 400 werd gezet, **bleef die test groen**: het object viel nog steeds om op
`floor_text`, dus de titel werd helemaal niet bewaakt.

Dat is dezelfde vorm als de ijking in `tekst:controle` van 28-08 die zijn geval
door een eerdere grendel voerde. **De les herhaalt zich: mutatie per grendel geldt
ook als de grendel in je eigen test zit.** Het geval is uit elkaar getrokken met
`it.each` over de drie velden; daarna wordt elke verruiming apart rood.

## Wat hiermee níét bewezen is

De RLS-suite draait in CI en niet hier — er is in deze omgeving geen database, en
de poort noemt dat *ongemeten* en niet groen.

En het pad is **niet in werking gezien**. Dat kan ook niet: het inschuiven zit in
de rollover, en die staat sinds 27-08 op productie met de code van vóór #116.
QS8-243 heeft de deploy en de vijf openstaande migraties.
