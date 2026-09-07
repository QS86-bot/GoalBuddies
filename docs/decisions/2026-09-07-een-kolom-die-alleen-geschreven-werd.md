# Een kolom die alleen geschreven werd — QS8-147

**07-09-2026.** Migratie 0181. Dossierrij van 27-08-2026, risico Middel.

## De meting

📏 Over `src/`, `app/`, `supabase/` en `tests/`:

| | |
|---|---|
| `cycle_index` geschreven op | 5 plekken (`weekly.ts` ×2, `weekplan.ts`, de rollover, en de fixtures) |
| gelezen voor logica | **nul.** Geen query selecteert hem, geen functie noemt hem, `herbereken_reeks()` groepeert op `cycle_start_date` |

Migratie 0139 kwam in augustus tot dezelfde uitkomst en schreef hem op: *"hij
wordt alleen geschréven en nooit voor logica gelezen — het is een weekteller voor
het scherm."* Die migratie liet hem daarom bewust níét meeverhuizen bij een
week-startwijziging, en dat is het tweede argument: na zo'n wijziging schuift het
hele raster op en klopt de teller sowieso niet meer.

⚠️ **De prijs stond niet in de kolom maar ernaast.** Om hem te vullen riep de
client `eersteCyclusVanDoel()` aan — één extra `maybeSingle()` vóór élk aanmaken
en élk doorschuiven, op vijf aanroepplekken. Dat is de hele opbrengst: een query
minder op een pad dat een gebruiker meerdere keren per week loopt, voor een getal
dat niemand opvraagt.

## Waarom weg en niet server-side afleiden

Het issue bood twee uitwegen, en de tweede is dicht.

`cycle_index` is *het aantal cycli tussen de eerste week van het doel en deze*,
en dat rekenen vraagt de week-startdag van de gebruiker. **Correctheidsregel 7
verbiedt elke week- of tijdberekening buiten `shared/time`.** De kop van 0139
zegt het met zoveel woorden: zo'n trigger zou *"wanneer begint een week"* in SQL
neerzetten. Vandaar dat de client rekende en de server schreef — en vandaar dat
elke variant waarin de kolom blijft, een schrijver houdt en dus de query houdt.

⚠️ **De drop is expliciet afgestemd** (07-09): dit is grens 2, en het antwoord
was *helemaal weg, ga uit van leeg*. Wat verloren gaat is een cache en geen
geschiedenis.

## Vier functies opnieuw, en dat is de gevaarlijkste beweging die er is

De parameter zat in vier handtekeningen, en die kun je niet met `create or
replace` wijzigen. Vier keer drop en opnieuw dus — en CLAUDE.md noemt een
verhuizing de gevaarlijkste beweging die er is, omdat de tests meeverhuizen en
groen blijven.

Wat er per functie overeind moest blijven, één voor één overgenomen uit
`pg_get_functiondef()` van de draaiende database:

| Functie | Wat er niet mocht sneuvelen |
|---|---|
| `schuif_weekdoel_door` | `weekdoelen_over() < 1` — de dagrem van 0083, die deze definer anders omzeilt |
| `weekplanstap_naar_weekdoel` | `for update` tegen twee overlappende rollover-rondes; `al_verbruikt`, `al_geactiveerd`, `doel_niet_actief` |
| `activeer_weekplanstap` | `order by order_index, created_at, id` — drie kolommen, want bij gelijkspel kiest het queryplan (de fout van QS8-56) |
| `start_weekplanstap` | het orakel-antwoord: onbekend en niet-van-jou geven hetzelfde |

## Drie dingen die daarbij misgingen, en alle drie zijn het lessen

### 1. `service_role` kwam er stilzwijgend bij

📏 Na de eerste versie:

```
weekplanstap_naar_weekdoel(uuid,date)   anon=false auth=false svc=true
```

terwijl de oude handtekening `svc=false` had. Supabase's `alter default
privileges` deelt élke nieuwe functie ook aan `service_role` uit, dus een
drop-en-opnieuw verruimt vanzelf. Onwrikbare regel 4 gaat over `authenticated`,
maar de mechaniek erachter is breder: **na een drop moet je de rechten meten en
niet aannemen.**

### 2. Een grendel die eruitzag als een verbetering, maakte een naad-test blind

De `p_cycle_index is null`-tak verdween, en ik zette er een
`p_cycle_start_date is null`-tak voor terug — "anders krijgt de gebruiker een
ruwe not-null-schending in plaats van `ongeldige_cyclus`".

Daarmee ging `tests/rls/doorschuiven.test.ts` rood, en terecht. Die test bewijst
dat de update naar `carried` en de insert **één transactie** zijn, en hij doet
dat door de insert láát te laten falen: met een null-datum klapt hij ná de
update, en die update rolt mee terug. Een vroege `return` maakt dat pad
onbereikbaar.

⚠️ **De not-null van de kolom ís de grendel.** Een extra toets die netter voelt
en een naad-test blind maakt, is duurder dan de ruwe fout die hij vervangt.

### 3. Een sorteersleutel vervangen door een die knoopt

`tests/rls/epic13.test.ts` sorteerde zijn weekdoelen op `cycle_index`. Bij het
opruimen zette ik daar `cycle_start_date` neer — en beide rijen van die
opstelling delen die datum. Drie tests werden rood met wisselende volgorde.

**Dat is QS8-303 nog een keer, nu in een testhelper.** De sleutel is nu `title`:
wat die test wil weten is wélke titels zichtbaar zijn, en alfabetisch kan niet
knopen.

⚠️ De les die de vorige keer al opgeschreven is, geldt hier net zo goed: **bij
het vervangen van een sorteersleutel is de vraag niet of de nieuwe bestaat, maar
of hij uniek is over de rijen die je sorteert.**

### Bonus: twee grendels die niets bewaakte

Bij het ijken van de vier herbouwde functies bleek dat er maar één van hun
grendels een rode test opleverde:

| Grendel | Mutatie | Uitkomst |
|---|---|---|
| `weekdoelen_over() < 1` in `schuif_weekdoel_door` | eruit | ✅ 1 rood |
| `for update` in `weekplanstap_naar_weekdoel` | eruit | ❌ groen |
| `order by order_index, created_at, id` | terug naar één kolom | ❌ groen |

**Dat is precies het risico dat CLAUDE.md aan een verhuizing hangt**: een grendel
die je blind overneemt, neem je ook blind weg. De derde is met deze PR afgedekt
(`tests/rls/weekplan.test.ts`); de tweede staat als dossierrij, want die toetsen
vraagt twee gelijktijdige transacties en dus een eigen opzet.

⚠️ **En die nieuwe test was zelf twee pogingen nodig.** De eerste versie zette de
oudste stap als eerste neer, en dan geeft een seq scan op twee rijen toevallig
het goede antwoord: de mutatie bleef groen. Pas met de fysieke volgorde
tégengesteld aan de bedoelde is er verschil tussen *wat er toevallig uitkomt* en
*wat de `order by` belooft*. Vraag 3 in zijn zuiverste vorm — en de tweede keer
vandaag dat een ijking pas werkte nadat het geval een pad opzocht dat niet al
door iets anders werd afgevangen.

## Wat er blijft staan

`cyclesBetween()` in `shared/time` had hierin zijn enige aanroeper in de app. De
functie blijft, want `shared/time` is de plek waar zo'n som hoort te staan en de
tests gebruiken hem. Komt er nooit een tweede lezer, dan is dat een vraag voor
een opruimronde en niet voor dit issue.
