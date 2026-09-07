# Een kolom die alleen geschreven werd — QS8-147

**07-09-2026.** Migratie 0182. Dossierrij van 27-08-2026, risico Middel.

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

⚠️⚠️ **En de premisse klopte óók niet** — nagemeten in de security-ronde van
07-09, nadat de kop van de migratie de weggehaalde tak nog steeds als "bewust
bijgekomen" beschreef. `0091` toetst alleen `p_cycle_index` (r.177), dus een
null-datum mét een geldige index viel ook vóór deze migratie al door naar de
insert en gaf exact dezelfde ruwe `23502`. Er liftte niets mee en er ging niets
verloren. De tak was dus niet alleen schadelijk, hij repareerde ook niets.

Dat is de tweede helft van de les: **ik had een verlies aangenomen in plaats van
het te meten**, en daarna een grendel gebouwd om dat aangenomen verlies te
dekken. De correctie in het lichaam kwam van een rode test; de correctie in de
kop moest van een reviewer komen, want een kop wordt door niets getoetst.

### 2a. Een kop is geen commentaar maar het rollback-pad

Drie beweringen in de kop van deze migratie waren onwaar en geen ervan werd
ergens rood van:

| Bewering | Meting |
|---|---|
| de null-tak is bewust bijgekomen | het lichaam 30 regels lager zegt met zoveel woorden van niet |
| de kolomgrant komt uit `0173/0180` | 📏 0173 noemt `weekly_goals` niet één keer; 0180 gunt alleen een functie. Hij komt uit `0043` (r.95) en `0044` (r.64) |
| "zolang een van de vier hem nog noemt, weigert de drop" | 📏 een plpgsql-functie die een kolom leest, houdt `alter table … drop column` **niet** tegen — de drop slaagt en de functie klapt pas bij aanroep |

De derde is de gevaarlijkste, want hij beschrijft een vangnet dat niet bestaat.
Postgres registreert geen afhankelijkheden voor plpgsql-lichamen; wie bij de
volgende kolomverwijdering op die volgorde vertrouwt en de grep overslaat, zet
een RPC in productie die klapt zodra een gebruiker hem raakt.

**Wat hier telt is niet dat er fouten in een kop stonden, maar dat niets ze kon
vinden.** De poort toetst code; een kop toetst niemand. In dit project is de kop
het rollback-pad en het geheugen — hij hoort dus dezelfde behandeling te krijgen
als een test: elke bewering die iets belooft, met de hand nameten. Dat is
regel 18 vraag 3, toegepast op proza.

### 2b. Een handtekening droppen breekt wat er gedeployd staat

`activeer_weekplanstap` gaat van drie naar twee argumenten. De edge-functie die
hem aanroept staat gedeployd en verandert niet mee: PostgREST geeft `PGRST202`,
de rollover vangt dat zacht af met `continue`, en er schuift stil geen enkele
weekplanstap meer in — elk uur, voor iedereen — terwijl het afschrijven van
gemiste weken doorloopt.

⚠️ **Dat is precies de vorm die niemand ziet**: geen exceptie, geen rode test,
een HTTP 200. De volgorde staat nu in de kop, in `docs/DEPLOY.md` §2.3a en in
WERKVOORRAAD, maar dat is een afspraak en geen grendel — de duurzame vorm is de
oude handtekening één release als dunne wrapper laten staan en hem in een
volgmigratie droppen. Als dossierrij weggelegd.

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
