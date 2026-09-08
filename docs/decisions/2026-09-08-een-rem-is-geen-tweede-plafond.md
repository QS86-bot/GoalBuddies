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

| Grendel | Vorm | Taak |
| -- | -- | -- |
| `begrens_*()` (0192) | `AFTER INSERT ... FOR EACH STATEMENT` met transitietabel | handhaaft het dagplafond en noemt het aantal uit dit verzoek |
| `rem_*()` (0199) | `BEFORE INSERT ... FOR EACH ROW` | noodstop op tweemaal het plafond; begrenst wat er fysiek geschreven wordt |

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

## IJking

| Mutatie | Rood |
| -- | -- |
| `drop trigger doelen_rem on goals` | `een geweigerde bulk-POST laat de tabel niet volschrijven` (1928 kB gemeten) |
| de noodgrens op `>= doelen_plafond()` | `de noodstop overstemt de handhaver niet` |

⚠️ De tweede mutatie moet `>=` zijn en niet `>`. Met `> plafond` zwijgt de rem bij
precies die batch van `plafond + 1` en komt de handhaver gewoon aan het woord —
een mutatie die door een grens loopt die het geval al afvangt, bewaakt niets.

## Wat hier niet in zit

* **De vijftien tabellen zonder dagteller uit QS8-344.** Die krijgen hun teller op
  een andere branch; een rem heeft pas zin waar een plafond staat. Landt QS8-344,
  dan hoort daar dezelfde rem bij.
* **`vacuum full`.** De ruimte die eerdere geweigerde batches al hebben gekost,
  komt hier niet mee terug. Dat is een onderhoudsactie op productie en geen
  migratie.
