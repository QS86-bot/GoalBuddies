# Een rem is geen tweede plafond

**08-09-2026 — QS8-347, migratie 0199**

## Waar dit over gaat

0192 (QS8-343) legde dagplafonds op acht tabellen met een
`AFTER INSERT ... FOR EACH STATEMENT`-trigger en een transitietabel, zodat de
batch zichzelf meetelt. Dat werkt: een te grote batch wordt geweigerd en er blijft
geen rij staan.

Maar `AFTER` betekent ná het schrijven. 📏 Op een verse database, één
`authenticated`-sessie, één statement van 50.000 doelen:

```
pg_total_relation_size('goals') vooraf   136 kB
insert 50.000 doelen                ->   23514 Te veel doelen in één dag
rijen van die gebruiker erna             0
pg_total_relation_size('goals') erna    9784 kB
```

Nul rijen, 9,6 MB groei, en die ruimte komt pas terug bij een `vacuum full`. Op een
gratis tier van 500 MB zonder automatische backups is dat een gebruiker die de
database van iedereen kan vullen — vanaf één gewoon account, met de anon-key die
per ontwerp in de bundel zit.

## De aanname die eronder lag, en de meting die hem omkeerde

QS8-347 en het beslisdocument van QS8-343 zeiden allebei: *"Dit is niet in de
database op te lossen. Een `BEFORE`-trigger heeft geen transitietabel en kan de
batch dus niet tellen."*

De eerste helft klopt. De tweede volgt er niet uit, en dat is een redenering waar
een meting hoorde.

📏 Een `BEFORE INSERT ... FOR EACH ROW`-trigger **ziet de rijen die eerder in
hetzelfde statement zijn ingevoegd.** Hij heeft daar geen transitietabel voor
nodig — hij telt de tabel, en die rijen staan er al in. Op een proeftabel met
plafond 5 en een batch van 100 gaat hij af bij `n = 5`: vijf rijen fysiek
geschreven, niet honderd.

📏 En omdat de vraag daarna meteen opkomt: in een `BEFORE ROW`-trigger ziet ook
een `STABLE` functie die rijen (`direct=5 stable=5 volatile=5`). Dat is het
tegenovergestelde van wat QS8-343 op de `AFTER`-kant vond, en het is de reden dat
de remmen hun telling zélf doen in plaats van `<naam>_over()` aan te roepen: dat
zou de grendel laten afhangen van een volatiliteitsmarkering die iemand later
verandert. (`*_over()` geeft bovendien `0` bij een lege `auth.uid()`, en dat zou
in een rem juist `service_role` buitensluiten.)

## Waarom de laag ervóór geen optie is

Acceptatiecriterium 1 vroeg te meten wat er vandaag vóór PostgREST zit.

📏 `docs/DEPLOY.md`: Hostinger serveert **alleen de statische bundel** uit
`public_html/goalbuddies`. De app praat daarna rechtstreeks met
`<ref>.supabase.co` — `supabase-js` → PostgREST over HTTPS. **Hostinger zit dus
niet in het pad van een API-verzoek**, en er is aan onze kant geen reverse proxy
waar een bodygrens op kan.

Wat er wél voor PostgREST staat is de edge van Supabase zelf, en die is op de
gratis tier niet in te stellen: `db-max-rows` begrenst het lézen en niet het
schrijven.

⚠️ Dat verandert zodra er een langdraaiende Node-server op Hostinger komt
(`docs/DEPLOY.md` §2.7). Deze migratie maakt die keuze niet onmogelijk; ze maakt
hem alleen niet nodig.

## Wat de rem telt: dit verzoek, niet het venster

De rem houdt een **transactielokale teller** bij
(`set_config('app.rem_<naam>', …, true)`). PostgREST voert elk verzoek in één
transactie uit, dus dat is precies "hoeveel rijen schrijft deze POST".

⚠️ **De eerste versie telde het venster van een etmaal, net als de teller van
0192, en dat was op twee manieren fout.** Allebei gevonden in de security-review
van 08-09 en zelf nagespeeld.

**Fout 1 — het venster is gedeeld, de rem was dat niet.** De rollover schrijft
weekdoelen als `service_role`. Die rijen tellen mee in het venster van de
eigenaar terwijl hij ze niet gemaakt heeft. 📏 Met 450 rollover-weekdoelen op één
doel gaf één eigen weekdoel:

```
met de vensterrem   23514  Te veel weekdoelen in één verzoek (450 …)
zonder de rem       42501  new row violates row-level security policy
```

De gebruiker was allebei de keren geblokkeerd — het venster stond al boven het
plafond — maar de verkeerde grendel sprak, met een melding die "in één verzoek"
zei bij een verzoek van één rij. Dat is precies het defect dat dit document
elders belooft te vermijden, één laag dieper.

**Fout 2 — de kosten waren kwadratisch.** Elke rij hertelde het venster,
inclusief wat hetzelfde statement er net in had gezet. 📏 De review mat 1924 ms
voor een geweigerde batch van 50.000 mét die rem tegen 774 ms zonder: de rem
maakte een geweigerd verzoek **duurder**.

Een teller die alleen dit verzoek telt heeft geen van beide problemen. 📏 Na de
herbouw, dezelfde geweigerde batch van 50.000 doelen:

```
met rem       11,5 ms
zonder rem  1030,4 ms
```

En een normale batch betaalt niets van betekenis — twaalf mijlpalen voor een
gebruiker met 900 in het venster: `mijlpalen_rem` 0,293 ms over 12 calls, tegen
0,804 ms voor de teller van 0192 in één call. Er is geen index voor nodig, want
er wordt niet in een tabel gekeken.

⚠️ **De les die blijft: een grendel die een gedeelde toestand leest, deelt ook de
fouten van de andere schrijvers.** De vraag "wie vult deze teller nog meer?" hoort
bij élke grens die op een venster rekent.

## De fout die ik onderweg maakte, en waarom hij hier staat

De rem ging eerst af op `> plafond`. De redenering: dan laat hij `plafond + 1`
rijen door, precies genoeg om de handhaver van 0192 nog aan het woord te laten, en
stopt hij alles daarboven.

📏 Twee bestaande tests werden er rood van, en allebei terecht:

| Test | Wat er gebeurde |
| -- | -- |
| `cyclusgrens.test.ts` | verlaagt het plafond naar 3 en biedt 5 rijen aan. De rem ging af bij rij 5, dus de teller kwam niet aan bod en de melding noemde de batch niet. |
| `afvinkgrens.test.ts` | verwachtte `42501` van de policy en kreeg `23514` van de rem. |

De les is niet dat de tests mee moeten. **Een rem is geen tweede plafond.** Zijn
drempel hoort búiten het bereik van het beleid te liggen, niet er één rij boven —
anders concurreert hij met de handhaver om wie de weigering mag melden, en dan
hangt het van de batchgrootte af welke melding de gebruiker ziet.

Vandaar `plafond * 2`: het kleinste veelvoud dat een legitiem verzoek nooit haalt,
want de teller en de policy weigeren al bij het plafond zelf, en dat geen nieuwe
constante nodig heeft.

## Twee grendels, twee taken, allebei bereikbaar

| Grendel | Vorm | Telt | Taak |
| -- | -- | -- | -- |
| `begrens_*()` (0192) | `AFTER INSERT ... FOR EACH STATEMENT` met transitietabel | het venster van een etmaal | handhaaft het dagplafond en noemt het aantal uit dit verzoek |
| `rem_*()` (0199) | `BEFORE INSERT ... FOR EACH ROW` | de rijen van dít verzoek | noodstop op tweemaal het plafond; begrenst wat er fysiek geschreven wordt |

⚠️ **Een grendel die altijd als eerste afgaat, maakt de grendel erachter dode
code die je kunt slopen zonder dat er iets rood wordt.** Daarom staat er een
naadtoets in `tests/rls/bulkschrijf.test.ts` die een batch van `plafond + 1`
aanbiedt en eist dat de mélding van 0192 terugkomt — niet alleen dat er een fout
is.

## Wat het oplevert

📏 Zelfde batch van 50.000 doelen, echte tabel, verse database:

```
zonder rem   136 kB -> 9784 kB   (9,6 MB aangroei)
met rem       40 kB ->  176 kB   (136 kB aangroei)
```

## De grendel die mij betrapte

De migratie werd rood op `sleutelzetters()` (0153, uitgebreid in 0187): die meldt
élke functie die een `app.`-sessie-instelling noemt en niet in zijn register
staat. De reden is echt — zo'n instelling kán een ontgrendelsleutel zijn, en
`app.heropent_groep` ís er een.

De negen tellers zijn een andere klasse: ze ontgrendelen niets, geen policy of
CHECK leest ze, en ze leven één transactie. Maar "het is een andere klasse" is
precies wat de vólgende schrijver ook denkt. Ze staan daarom **met naam en al** in
het register — elke rem mag exact zijn eigen instelling zetten — in plaats van dat
de teller een uitzondering op vorm krijgt.

⚠️ Kan een client zo'n teller vervalsen? Nee: PostgREST zet alleen
`request.*`-instellingen uit het JWT en de headers, en geen enkele RPC geeft
`set_config` door. En zou het ooit wél kunnen, dan is het gevolg dat de rem niet
afgaat — de toestand van vóór deze migratie — en niet dat er een grens opengaat.

## IJking

| Mutatie | Rood |
| -- | -- |
| `drop trigger doelen_rem on goals` | `een geweigerde bulk-POST laat de tabel niet volschrijven` (1928 kB gemeten) |
| `rem_weekdoelen()` het venster laten tellen | `de rem telt dit verzoek en niet het gedeelde venster` |
| de noodgrens op `> doelen_plafond()` | `de noodstop overstemt de handhaver niet` |

⚠️ Bij de vensterversie van de rem was voor de derde mutatie `>=` nodig in plaats
van `>`, omdat `> plafond` daar precies bij `plafond + 1` zweeg. Met een teller
per verzoek is `>` genoeg: die begint op nul en bereikt 201 binnen dezelfde batch.
Hetzelfde ijkgeval, een andere mutatie — een mutatie die door een grens loopt die
het geval al afvangt, bewaakt niets.

## Wat hier niet in zit

* **⚠️ De rem begrenst rijen per verzoek, niet verzoeken per seconde.** 📏 De
  security-review mat 30 geweigerde POSTs van 500 maximale doelen: 905 kB per
  verzoek, **7,6 MB/s vanaf één seriële client**. 500 MB is daarmee in ongeveer
  een minuut vol. Wat hier weggaat is de factor honderd per verzoek; wat blijft is
  dat er geen rate limit vóór PostgREST staat. Dat is een andere laag, en het
  staat als rij in `docs/ENGINEER-REVIEW.md`.

* **De elf client-beschrijfbare tabellen zonder dagteller uit QS8-344.** 📏 De
  review mat `daily_moves`: 50.000 rijen in één POST, 32 kB → 38 MB,
  **gecommit en zonder foutmelding** — erger dan het geweigerde geval, want die
  ruimte komt nooit terug.

  ⚠️⚠️ **Landt QS8-344 zonder rem, dan is dit defect opnieuw gebouwd op tien
  tabellen.** Die branch zet er `after insert ... for each statement`-tellers op:
  precies de vorm waar deze rem bij hoort. Die twee horen als één set gedacht te
  worden.
* **`vacuum full`.** De ruimte die eerdere geweigerde batches al hebben gekost,
  komt hier niet mee terug. Dat is een onderhoudsactie op productie en geen
  migratie.
