# De poort en de klok eronder

**Datum:** 17-09-2026 · **Issue:** QS8-531 · **Status:** gebouwd (migratie 0288)
**Raakt:** `beslis_deadline_verzoek()`, `docs/ENGINEER-REVIEW.md` (de rij van 06-09)

## Het geval

`beslis_deadline_verzoek()` weigert sinds 0171 een akkoord op een uitstelverzoek
waarvan de gevraagde datum al voorbij is, en zet sinds 0177 een `due` straf terug
op `set` als de nieuwe datum weer in de toekomst ligt. Allebei die vragen gingen
naar dezelfde klok:

```sql
if p_akkoord and r.new_date < eigenaarsdatum(r.requester_id) then …
if r.new_date >= eigenaarsdatum(r.requester_id) then …
```

`r.requester_id` is de doeleigenaar — de gestrafte. `eigenaarsdatum()` is
`(now() at time zone profiles.tz)::date`, en 📏
`has_column_privilege('authenticated','public.profiles','tz','UPDATE')` is `t`.

**De gestrafte zette dus zelf de klok die bepaalt of zijn verzoek nog geldig is.**

📏 Nagemeten op 17-09-2026 om 14:40 UTC, als de goedkeurende buddy, met echte
rijen en teruggerold. Straf op `due`, verzoek `open`, en als énige variabele de
`profiles.tz` van de aanvrager — **verzet ná het aangaan van de straf**:

| zone | verzoek | zonder 0288 | met 0288 |
|---|---|---|---|
| `Pacific/Kiritimati` (+14) | 1 dag te laat | `verzoek_verlopen` | `verzoek_verlopen` |
| `UTC` | 1 dag te laat | **`ok`, straf → `set`** | `verzoek_verlopen` |
| `Etc/GMT+12` (−12) | 1 dag te laat | **`ok`, straf → `set`** | `verzoek_verlopen` |

## De meetfout die er eerst in zat, want die is leerzamer dan de meting

📏 De eerste opstelling gaf **zes identieke regels**, vóór én na 0288 — het zag
eruit alsof de reparatie niets deed.

De oorzaak was de opstelling en niet de code. `bevries_commitmentzone()` (0280)
kopieert `profiles.tz` bij de `insert` op `commitments`. Mijn harnas zette de
zone vóór die regel, dus het manipuleerde **ook de bevroren klok** — en dan meten
beide versies hetzelfde en is er niets te zien.

⚠️ **De aanval is een volgorde en geen waarde.** Eerlijk aangaan, dán verzetten.
Een opstelling die dat samentrekt, meet een wereld waarin de aanval niet bestaat
en komt terug met "geen verschil". Dat is regel 18 vraag 3 in zijn
onaangenaamste vorm: de toets was groen omdat hij de verkeerde vraag stelde.

## Het besluit

⚠️ **Grens 1, dus voorgelegd.** Het verandert wanneer een straf verschuldigd is,
en dat is wat een gebruiker als consequentie beloofd is — dezelfde reden waarom
0280 een besluit van Quinten vroeg.

**Besluit van Quinten, 17-09-2026: bevriezen op `commitments.tz`.** Staat er een
straf op het doel, dan meet de poort aan de zone die bij het aangaan is
vastgelegd. Dat is de enige van de drie opties die niemands belofte verandert: je
houdt precies de coulance die je had toen je je vastlegde, en je kunt hem
achteraf niet meer verschuiven.

⚠️⚠️ **En hier stond "je kunt hem achteraf niet meer verschuiven". Dat is te
sterk, en het is in de security-ronde op deze branch nagemeten.** De bevroren
zone van een bestáánde straf is niet te verzetten — 📏 `update commitments set
tz = …` als de eigenaar geeft `42501` — maar een straf is te **annuleren en
opnieuw aan te gaan**, en dan wordt de zone opnieuw bevroren:

| stap | uitkomst |
|---|---|
| straf aangegaan met profiel op `Europe/Amsterdam` | `commitments.tz = Europe/Amsterdam` |
| `update commitments set tz = 'Pacific/Midway'` | `42501`, geweigerd |
| profiel naar Midway, straf annuleren, opnieuw aangaan | `commitments.tz = Pacific/Midway` |
| profiel terug naar Amsterdam | levende straf staat op Midway |

⚠️ **Dat is geen verruiming van 0288.** Vóór deze migratie was dezelfde speling er
met één PATCH op `profiles.tz`, op het moment zelf en zonder voorbereiding; nu
kost het een annulering en een nieuwe afspraak, en het laat een auditspoor achter.
Maar de zin gold over de **rij** en niet over de **afspraak**, en dat verschil
hoort opgeschreven — een geruststelling die niet klopt, leest de volgende persoon
als een reden om er niet aan te twijfelen. De route staat als toets in de suite en
als QS8-536 in Linear; hem sluiten is opnieuw grens 1.

Afgewezen:

- **Meten aan `deadline_requests.created_at` in UTC.** Simpel en niet te
  manipuleren, maar het neemt speling af van wie oostelijk zit zonder dat hij
  iets fout deed. Dat is wél een wijziging aan de belofte.
- **Laten staan.** De poort staat vierentwintig uur per dag open met één dag
  bereik; het drie-datumsvenster van QS8-529 bepaalt alleen of dat één dag wordt
  of twee. Geen randgeval.

Ook besloten: QS8-531 en QS8-533 landen **apart**. Dit zit volledig in de
database; QS8-533 haalt zijn datum uit de Edge Function.

## Wat 0288 doet, en waarom het één waarde is

```sql
select max((now() at time zone c.tz)::date) into v_vandaag
  from commitments c
 where c.goal_id = r.goal_id and c.type = 'penalty' and c.status in ('set','due');

v_vandaag := coalesce(v_vandaag, eigenaarsdatum(r.requester_id), current_date);
```

Daarna gebruiken de verlooppoort én de terugzetter `v_vandaag`.

⚠️ **Eén waarde en geen twee aanroepen.** De functie vroeg het twee keer los, en
twee plekken die hetzelfde moeten weten zijn twee plekken waar de volgende
schrijver er één kan verzetten. Zelfde vorm als QS8-515, waar `create_group()`
de naam met `btrim()` streek terwijl de CHECK hem met `schone_naam()` toetste.

⚠️ **Zonder straf blijft `eigenaarsdatum()` staan.** Geen commitment device, geen
consequentie om aan te sleutelen — en de dag van de aanvrager is daar het
antwoord dat 0171 met reden opschreef. De bevriezing hangt aan de straf, niet aan
de poort.

⚠️ **`max()` hoewel er er maar één kan zijn.** 📏 `commitments_een_open_per_soort`
is een unieke index op `(goal_id, type)` waar `status in ('set','unlocked','due')`,
dus een doel draagt hoogstens één open straf. `max()` geeft daar hetzelfde
antwoord en kiest de **strengste** klok als die index ooit verdwijnt — regel 18
vraag 6 op de plek waar hij van toepassing is.

## Wat er níet in zit

📏 `eigenaarsdatum()` heeft zes aanroepers. Twee raken `commitments`:
`wikkel_commitments_af()` (bevroren in 0280) en deze. De andere vier —
`herbereken_risico`, `plan_adempauze`, `weekdoel_cyclus_klopt`,
`zet_week_startdag` — beslissen niets over een consequentie en houden terecht de
levende zone. Geteld in `pg_proc`, niet geschat.

Het zevendaagse schild in `maak_straffen_verschuldigd()` heeft dezelfde klasse en
staat als QS8-533 open.

## De regressie die deze migratie zelf maakte

`vraag_deadline_verschuiving()` weigert een verzoek op `p_new_date < mijn_datum()`
— de **levende** klok. Die twee konden vóór 0288 niet uit elkaar lopen. Met alleen
de besliskant verzet, wél.

📏 Gemeten, straf aangegaan in Kiritimati, profiel daarna naar Midway — een
doodgewone verhuizing en geen aanval:

```
INDIENEN  met new_date = 2026-09-17 (= mijn_datum())  ->  ok: true
BESLISSEN direct erna                                 ->  verzoek_verlopen
bevroren strafklok Kiritimati -> 2026-09-18 ; levende zone Midway -> 2026-09-17
```

Het verzoek blijft `open` (0171 by design) en `already_open` blokkeert een nieuw
verzoek. Geen doodlopende weg — intrekken kan — maar een deterministische
regressie voor iedereen wiens profielzone westelijk van zijn strafzone staat.

**Dat is dezelfde fout als de fout die dit issue repareert, één laag hoger
teruggelegd.** Daarom staat de vraag vanaf nu op één plek: `public.doeldatum()`,
aangeroepen door allebei de kanten. Ze kunnen niet meer uit elkaar lopen zonder
dat iemand die ene functie verzet.

⚠️ Gevonden door de security-ronde en niet door mij. Ik had de ene kant van de
naad verzet en de vraag "wie stelt deze vraag nog meer" niet gesteld — regel 18
vraag 1, op de dag dat ik hem in de migratiekop citeerde.

## De grendels, en wat elke ijking opleverde

| mutatie | wat er rood werd |
|---|---|
| de hele functie terug op de versie van 0177 | `weigert een verzoek dat verlopen is in de zone waarin de straf is aangegaan` |
| de `coalesce`-terugval op `eigenaarsdatum()` weg | `weigert zonder straf een verzoek dat in de zone van de aanvrager voorbij is` |
| alléén de terugzetter terug op de levende klok | `zet de straf terug met dezelfde klok waarmee de poort meet` |
| de aanvraagkant terug op `mijn_datum()` | `weigert bij het indienen al wat de beslisser verlopen zou noemen` |
| `status in (set, due)` versmald tot `set` | drie toetsen tegelijk — de poort, de terugzetter én de statustoets |
| `cancelled` erbij in die lijst | `telt een levende straf mee en een afgehandelde niet` |

⚠️⚠️ **Die derde toets bestond eerst niet, en dat kwam uit de ijking.** Met alleen
de terugzetter gemuteerd bleef de suite **groen op vijf toetsen**: de poort
weigert immers alles wat in de bevroren klok verlopen is, dus de tweede vraag
komt zelden aan bod. Zelden is niet nooit — gaat de gestrafte naar het **oosten**,
dan loopt de levende klok vóór op de bevroren, haalt het verzoek de poort, en
blijft de straf op `due` staan terwijl zijn reden vervallen is. Geen aanval maar
een halve afhandeling.

**Een grendel die je niet apart kunt breken, is een grendel die je niet apart
hebt getoetst** — en hier was de reparatie van de toets een nieuw gemeten geval
en niet een strakkere assertie op een bestaand geval.

⚠️ **Geen enkele toets in de suite hangt van het uur van de dag af.** Kiritimati
(`UTC+14`) en Midway (`UTC−11`) liggen 25 uur uit elkaar en staan dus nooit op
dezelfde datum. De les van QS8-529 staat in de kop van het testbestand.
