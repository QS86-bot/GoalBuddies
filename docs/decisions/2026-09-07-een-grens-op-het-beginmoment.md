# Een grens op het beginmoment

**07-09-2026.** QS8-343, migratie 0192.

## Wat er stuk was

📏 Gemeten als gewone `authenticated` gebruiker via PostgREST, tegen
`weekly_goals` — een tabel die de limiet **wél** had (200 per dag):

```
POST 300 weekdoelen in één verzoek, vanaf nul  ->  201, alle 300 geland
```

`weekdoelen_over()` is `STABLE SECURITY DEFINER` en telt gecommitte rijen.
Binnen één INSERT-statement ziet hij de snapshot van vóór dat statement, dus de
rijen die op dát moment ingevoegd worden tellen niet mee. Elke rij in de batch
leest dezelfde teller en komt tot hetzelfde antwoord.

**De limiet begrensde wanneer je mocht beginnen, niet hoeveel je invoegde.**

⚠️ **Regel 18 vraag 1 in zijn zuiverste vorm.** De teller deed precies wat hij
belooft: hij telde de gecommitte rijen. De policy deed precies wat zíj belooft:
ze eiste ruimte `> 0`. Beide onderdelen correct, beide getest, en de naad ertussen
— *telt iemand de rijen van dit statement zelf?* — was van geen van beide een
eigenschap en dus door niets bewaakt.

## Waarom dit Urgent was

Onwrikbare regel 5 eist rate limiting. Voor vijf tabellen bestónd die rem, stond
hij opgeschreven, werd hij in vijf policies aangeroepen en gold hij in de
dossierrij als afgedekt — en hij hield niet. Wie het patroon naar een nieuwe
tabel kopieerde, kreeg een limiet die niet limiteert.

📏 En `goals`, `milestones` en `goal_events` hadden helemaal geen teller: 500
doelen in één verzoek landden in 101 ms. Bij ~376 byte per rij is de 500 MB van
de gratis tier in minuten vol te schrijven vanaf één gewoon account, met de
anon-key die per ontwerp in de bundel zit — en er zijn geen automatische backups.

## De keuze, en de beslissing die hij tegenspreekt

⚠️⚠️ **0083 koos met zoveel woorden een policy en géén trigger:**

> *"Een trigger zou voor beide gelden, en een trigger die op een rolnaam beslist
> faalt open. De grens hoort op de laag waar de rol al verschil maakt."*

Die redenering staat nog steeds, en daarom beslist de trigger van 0192 **niet op
een rolnaam** maar op de aanwezigheid van een sessie.

⚠️ **En die tak kan geen achterdeur zijn, wat de kern van het bezwaar was.** Voor
een client mét sessie slaat de trigger toe. Voor een client zónder sessie is
`auth.uid()` leeg — en dan weigert de policy hem al, want élke `*_over()` geeft
bij een lege `auth.uid()` nul terug en de policy eist `> 0`. De enige aanroeper
die de lege tak bereikt, is er een die RLS sowieso omzeilt. 📏 Gemeten:
`set role service_role` zónder JWT-claims geeft `auth.uid() = NULL`, en zo
verbinden de rollover en de notificatiejob.

Anders gezegd: hij faalt niet open, want wie langs de lege tak komt, was al langs
de policy gekomen.

| Richting | Oordeel |
|---|---|
| De teller de eigen rijen laten meetellen | ⚠️ Kan niet. In een `with check` bestaan de rijen van het statement per definitie nog niet. |
| `for each row`-trigger met een teller per statement | Werkt, maar telt bij een batch van 300 driehonderd keer. |
| `after insert ... for each statement` met transitietabel | ✅ **Gebouwd.** Eén telling per verzoek. |

## De vorm van de grens

⚠️ **Een absolute telling en geen optelsom.** De trigger telt ná het statement
hoeveel rijen er in het venster staan en vergelijkt dát met het plafond. De
verleiding is om `count(*) from nieuw` bij `*_over()` op te tellen, maar dan hangt
de uitkomst af van de vraag óf `*_over()` de zojuist ingevoegde rijen al ziet —
een snapshot-vraag met een subtiel antwoord, en precies het soort aanname waar
dit gat uit ontstaan is. De absolute telling heeft die vraag niet.

⚠️ **De policy blijft staan naast de trigger.** Ze doen niet hetzelfde: de policy
weigert je te beginnen als je al op het plafond zit (403, en dat is de melding die
de app vandaag toont), de trigger weigert de batch die eroverheen gaat.

⚠️ **Het plafond staat vanaf nu op één plek.** Het getal stond als letterlijke
waarde in `*_over()`; nu geeft `<naam>_plafond()` het, en zowel de teller als de
trigger leest die. Twee plekken met hetzelfde getal is hoe ze uit elkaar gaan
lopen — en dan begrenst de policy iets anders dan de trigger.

## De ijking

Elke grendel apart, elk met een `grep` of een `pg_get_functiondef()` vooraf om te
bevestigen dát de mutatie in de database stond.

| Mutatie | Wat er rood werd |
|---|---|
| elk van de **acht** triggers los weggehaald | telkens **precies één** test — die van díé tabel |
| de `auth.uid()`-tak weg | **1** — precies de must-allow dat `service_role` erlangs mag |
| `weekdoelen_plafond()` op 5000 | **1** — precies de weekdoelentest; de trigger leest dus de gedeelde bron |
| de trigger altijd laten werpen | de suite valt om in de opbouw, **exitcode 1** |

⚠️ Die laatste is eerlijk opgeschreven en niet mooier gemaakt: de tests melden
zich dan als **overgeslagen** en niet als rood, want de `beforeAll` komt niet door
zijn eigen invoeging heen. De exitcode is 1, dus de poort vangt het — maar
"overgeslagen" is niet "rood", en dat verschil is in dit project uitgevochten.

### Twee tests die groen waren om de verkeerde reden

⚠️⚠️ **De ijking betrapte de tests zelf, en dat is het nuttigste van deze ronde.**
Bij de eerste ronde gaf het weghalen van twee triggers **nul** rode tests:

* **`weekly_plan_steps`** — de 201 rijen hadden een oplopende `order_index`, en
  `CHECK weekly_plan_steps_order_bereik` eist 1..52. De batch werd geweigerd door
  díé constraint, met **dezelfde foutcode 23514**.
* **`day_checkins`** — de 501 datums lagen in 2024, en `afvinking_binnen_de_cyclus`
  laat alleen de zeven dagen van de week van het weekdoel toe. Ook 23514.

Beide tests waren dus groen zonder dat het dagplafond ook maar aangeroepen werd.
**Een gelijke foutcode is geen bewijs van een gelijke oorzaak** — en een test die
alleen op de code kijkt, kan dat verschil niet zien. Herbouwd: `order_index`
cyclisch binnen 1..52, en 504 afvinkingen verdeeld over 72 weekdoelen van zeven
dagen.

### Een must-allow die meeliftte

⚠️ Het weghalen van de trigger op `weekly_goals` maakte er twee rood in plaats van
één: de belofte-test én de must-allow. Terecht, maar niet informatief — de batch
landde dan alsnog, vulde daarmee het dagplafond van diezelfde gebruiker, en dus
faalde de must-allow als **gevolg** van de eerste test. Een must-allow die
meelift op de uitkomst van de test die hij moet tegenwegen, meet niet wat hij
belooft. De must-allows hebben nu een eigen gebruiker.

## Wat hier niet in zit

* **QS8-344 — vijftien andere tabellen zonder enige teller.** Deze migratie dekt
  de acht uit QS8-343. Bij het bouwen bleek de lijst langer dan de drie die het
  issue noemde: 📏 achttien tabellen zijn door een client te beschrijven zonder
  dagteller. Ze vragen elk een eigen weging — `commitments` raakt domeinregel 5,
  `user_blocks` en `reports` zijn veiligheidsvoorzieningen waar een limiet de
  verkeerde kant op faalt — en dat is een inventarisatie en geen reparatie.

  ⚠️ **Bij het opstellen van die lijst ging één query mis, en dat is het
  opschrijven waard:** filteren op `cmd = 'INSERT'` in `pg_policies` mist elke
  `ALL`-policy. De eerste telling zei daardoor dat `milestones` geen INSERT-policy
  had, terwijl `milestones_write` (`ALL`) er gewoon een is.

* **Een grens op het aantal rijen per verzoek in het algemeen.** PostgREST kent
  geen maximum op de bodygrootte in dit project; dat is een aparte laag en een
  aparte afweging.
