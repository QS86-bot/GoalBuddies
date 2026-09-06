# Een plafond op straffen, en een streefdatum die niet in het verleden begint

**Datum:** 06-09-2026 · **Issue:** QS8-293 · **Migratie:** 0169

---

## 1. De aanval, end-to-end gemeten

Uit de security-ronde op QS8-228, waar twee reviews los van elkaar hetzelfde
maten. Als gewone `authenticated`-gebruiker:

```
doel met target_date = current_date - 30           -> INSERT 0 1
5 straffen op dat doel, allemaal bob als getuige   -> INSERT 0 5
maak_straffen_verschuldigd(alice, current_date)    -> 5
bob leest                                          -> 5 rijen, met de body
```

Geen unieke index, geen teller, geen quotum, geen rate limit, en
`commitments_body_len` staat 500 tekens vrije tekst per stuk toe.

## 2. Waarom dit pas iets werd bij QS8-228

Vóór dat issue was de begunstigde van een straf een **groep waar je zelf al lid
van was**. Nu is het een **aangewezen individu** die er niet om gevraagd heeft,
de rij niet kan verwijderen, en op dit oppervlak geen blokkeer- of meldknop
heeft.

⚠️ Onwrikbare regel 5 eist een limiet bij uitnodigingen omdat dat een
spam-vector is. Dit is dezelfde klasse; commitments stonden alleen niet in die
opsomming. **De regel benoemt drie plekken, niet drie soorten** — en dat is
precies hoe de vierde erbuiten valt.

## 3. Drie grenzen — en de eerste twee sloten de route níét

⚠️ **Hier stond "twee grenzen, en samen sluiten ze de route". Dat was fout, en
het is de belangrijkste les van dit issue.** De security-ronde op deze branch
mat het na met beide grenzen er al in, als gewone `authenticated`-gebruiker:

```
A doel met deadline vandaag        -> aangemaakt als gebruiker | 1
B straf op een verstreken deadline -> aangemaakt als gebruiker | 1
C maak_straffen_verschuldigd(...)  -> 1
D status                           -> due
```

Grens 3b bewaakt het **aanmaken van een doel**. Grens 3a bewaakt het **aantal**
straffen. Allebei correct, allebei getest, allebei groen — en de belofte zit
ertússen, want een straf is een tweede handeling op een later moment, en tussen
die twee handelingen kan de datum verstrijken. Eén dag wachten was genoeg om de
hele route uit §1 weer open te leggen: twintig doelen met de datum van vandaag,
morgen bij elk een straf met dezelfde persoon als getuige.

Dat is onwrikbare regel 18 vraag 1 in zijn zuiverste vorm — *waar knopen twee
correcte onderdelen aan elkaar?* — en ik had hem bij het schrijven van §7
beantwoord met de naad tussen `goals_insert` en de rollover, niet met de naad
tussen het doel en de straf. **Het onderdeel dat ontbrak, was het onderdeel dat
er niet was.**

§10 hieronder is de reparatie — **en §12 vertelt dat óók die niet genoeg was.**
Lees die twee samen; §10 op zichzelf beweert opnieuw te veel.

### 3a. Eén openstaand commitment per soort per doel

Een unieke partiële index op `(goal_id, type) where status in ('set',
'unlocked', 'due')`.

⚠️ **Het scherm nam dit al aan.** `app/doel/[id].tsx` zoekt de straf met
`.find(c => c.type === 'penalty')` en toont er precies één. Stonden er meer, dan
zag de eigenaar de rest niet en haalde `trekIn()` er één weg terwijl de andere
bleven staan en later alsnog verschuldigd werden. Dat is regel 18 vraag 6 — een
aanname dat er "altijd precies één" is, terwijl er meer konden zijn. Deze index
maakt de aanname waar in plaats van hem te laten bestaan.

⚠️ **Partieel, en dat is de kern van de vorm.** `resolved` en `cancelled` tellen
niet mee: een ingetrokken straf hoort je niet voor altijd te blokkeren, en
intrekken-en-opnieuw-vastleggen is precies wat het scherm aanbiedt.

### 3b. Een streefdatum begint niet in het verleden

Op **drie** plekken, want een grens die alleen bij het aanmaken geldt, verplaats
je met de eerste de beste verzetknop. De drie schrijvers zijn gemeten en niet
geraden: `goals_insert` (de enige INSERT-route — `authenticated` heeft geen
UPDATE-grant op `target_date`), `zet_streefdatum()` en
`vraag_deadline_verschuiving()`.

⚠️ **`beslis_deadline_verzoek()` krijgt hem met opzet niet.** Een verzoek dat bij
het indienen geldig was, mag niet stranden doordat een buddy er een week over
doet. De datum is dan al met een mens afgesproken; hem bij de goedkeuring alsnog
weigeren zou de gebruiker straffen voor de traagheid van een ander. Dat een
goedgekeurde datum inmiddels verstreken is, is een waar antwoord en geen aanval
— de rem daar is het akkoord van de buddy (A7).

## 4. Waarom er een hulpfunctie bij komt

De grens is "niet vóór vandaag", en *vandaag* is de dag van de **gebruiker** en
niet van de server. `current_date` is UTC; iemand op UTC-10 die zijn eigen
vandaag invult, zou geweigerd worden.

`eigenaarsdatum(uid)` doet dit al, maar `authenticated` mag hem niet uitvoeren
en dat hoort zo te blijven: hij neemt een wíllekeurige uid aan en geeft de
lokale datum van díe persoon terug. Hem opengooien zou bovendien de vierde tak
van `definer_bewaking()` (0167) op zijn kop zetten — definer, uitvoerbaar door
`authenticated`, geen `auth.uid()` in het lichaam.

`mijn_datum()` neemt daarom geen argument. Hij noemt `auth.uid()` zelf, kan
niets over een ander zeggen, en past in diezelfde tak.

## 5. ⚠️ Twee regels die op elkaar lijken en dat niet zijn

| | Regel | Waar | Waarom |
|---|---|---|---|
| Client | `datum > vandaag` | `datumLigtInDeToekomst()` | **productregel**: een doel loopt minstens tot morgen |
| Database | `target_date >= mijn_datum()` | `goals_insert` en twee functies | **misbruikgrens**: een deadline begint niet in het verleden |

De database is met opzet de ruimere van de twee. Zou hij even streng zijn, dan
weigert hij ooit iets wat een legitieme route wél mag produceren, en dan is de
gebruiker de dupe van een grens die voor een aanvaller bedoeld was.

⚠️ **De kant waarop ze mogen verschillen ligt vast: de database weigert nooit wat
de client toelaat.** Andersom mag wel. Dat is dezelfde vorm als bij de
tekstgrenzen (QS8-118), waar een client die in UTF-16 telt door laat wat Postgres
weigert — daar ging het de gevaarlijke kant op, hier de veilige.

## 6. Wat er níét in zit

Punt 2 uit het issue — *een grens op hoeveel straffen één gebruiker op één ándere
persoon kan richten, of instemming van die persoon* — zit hier niet in.

Met 3a is het aantal openstaande straffen per doel één, dus de vector loopt nu
via het aantal dóélen. Dat afgrenzen raakt de vraag **of een getuige mag
weigeren**, en dat is een productbeslissing over een commitment device
(domeinregel 5, beslisbevoegdheid grens 1). Die hoort bij Quinten en niet in deze
migratie. Rij in `docs/ENGINEER-REVIEW.md` met de voorwaarde waaronder hij
zwaarder wordt.

## 7. De ijking

Zeven grendels, elk apart kapot gemaakt.

| # | Grendel | Mutatie | Test die rood werd |
|---|---|---|---|
| 1 | het plafond per doel | de index gedropt | een tweede straf op hetzelfde doel kan niet |
| 2 | het plafond geldt per **soort** | index alleen op `goal_id` | een beloning naast een straf kan wél |
| 3 | de index is partieel | index zonder `where` | na intrekken mag er wél een nieuwe |
| 4 | de datumgrens bij het aanmaken | de conjunct uit de policy | een doel met een streefdatum in het verleden kan niet |
| 5 | de grens is `>=` en niet `>` | `>` in de policy | vandaag mag nog wél |
| 6 | `zet_streefdatum()` | de toets eruit | de streefdatum is ook niet naar het verleden te verzetten |
| 7 | `vraag_deadline_verschuiving()` | de toets eruit | en een verschuiving naar het verleden is niet eens aan te vragen |

⚠️ **Grendel 5 is de must-allow op de grens zelf.** Zonder haar laat een
strengere grens ongemerkt passeren, en dan is de database strenger dan de client
— precies de kant die §5 verbiedt.

## 8. ⚠️ Wat de tests vonden en een review niet had gevonden

De twee functies kregen dezelfde bewaking, en ik heb hem gekopieerd. De
parameters heten alleen niet hetzelfde: `zet_streefdatum(p_goal_id, **p_date**)`
tegenover `vraag_deadline_verschuiving(p_goal_id, p_group_id, **p_new_date**,
p_reason)`. De kopie in de tweede functie noemde `p_date`.

**plpgsql compileert lui**, dus de migratie draaide zonder klacht en de functie
bestond. Pas bij de eerste áánroep kwam `42703: column "p_date" does not exist`
— en toen viel de halve suite om, inclusief opstellingen die niets met datums te
maken hebben.

Dat is geen slordigheid die je met beter lezen voorkomt: een gekopieerde
bewaking tussen twee functies met verschillende parameternamen ziet er in de
diff identiek en correct uit. **Wat hem ving was dat de suite draait vóór de
poort en niet erna.**

## 9. Wat er in de opstellingen veranderde, en waarom dat geen verzwakking is

Drie fixtures maakten een doel met een streefdatum in het verleden aan **als
gebruiker**, omdat ze een gemiste week of een afgegane straf nodig hadden. Die
maken hem nu vooruit aan en zetten hem terug via `adminDb()`.

⚠️ Dat is dezelfde omweg die epic13 al gebruikte voor `weekly_goals.status`, en
met dezelfde reden: **de omweg hoort in de ópbouw en niet in wat getest wordt.**
Geen van die drie tests gaat over het aanmaken van een doel.


## 10. De derde grens — een straf hangt niet aan een verstreken deadline

```sql
and (
  type <> 'penalty'
  or exists (
    select 1 from goals g
    where g.id = commitments.goal_id and g.target_date >= mijn_datum()
  )
)
```

**Alleen `penalty`.** Een beloning geeft niemand leesrecht en legt niemand iets
op; hem aan een afgelopen doel hangen is hooguit zinloos. Domeinregel 11 gaat
over de straf en dit is de grens die daarbij hoort. Er staat een must-allow op
die soortgrens: haal `type <> 'penalty'` weg en *"een beloning op datzelfde doel
mag wél"* wordt rood.

**In de policy en niet in `bewaak_begunstigde()`.** Dezelfde afweging als bij de
bandtoets van 0168: de grens gaat over wat een *gebruiker* zelf mag vastleggen,
en hij hangt aan `mijn_datum()` — dat is `auth.uid()`, en die is leeg in de
rollover. In de trigger zou hij `service_role` stilzwijgend blokkeren, of met de
eigenaarsdatum erin een tweede kopie worden van een regel die dan niet los te
ijken is. Dat is precies de val waar 0168 al een keer in liep.

### De ijking, per grendel

| Mutatie | Rood | Groen |
|---|---|---|
| conjunct helemaal weg | *een straf op een doel waarvan de deadline al voorbij is, kan niet* | 9 |
| `type <> 'penalty'` weg (geldt dan ook voor beloningen) | *een beloning op datzelfde doel mag wél* | 9 |
| `>=` wordt `>` | *op een doel dat vandaag afloopt mag een straf nog wél* | 9 |

Drie mutaties, drie verschillende rode tests, elk de test die zijn eigen belofte
noemt. Geen enkele mutatie liet iets anders rood worden — dus geen van deze drie
gevallen wordt door een éérdere grendel afgevangen.

### Wat hiermee niet dicht is

**(a) De tijdzone is van de gebruiker zelf.** `mijn_datum()` rekent in
`profiles.tz`, en dat is een kolom die de gebruiker schrijft. 0119 toetst hem
tegen `pg_timezone_names`, dus het is altijd een échte zone — en dat begrenst
het meteen: van UTC-12 tot UTC+14 spant de lokale datum precies `current_date -
1` tot `current_date + 1`. Eén dag speling, inherent aan tijdzones.

⚠️ **Een absolute vloer `and target_date >= current_date - 1` erbij is
overwogen en bewust níét toegevoegd.** Hij zou nooit binden: `current_date - 1`
is exact de ondergrens die een geldige zone al oplevert. Dat is een conjunct die
streng oogt en niets weigert, en die is erger dan geen conjunct — de volgende
lezer denkt dat daar iets bewaakt wordt.

**(b) Het aantal doelen is nergens begrensd.** Met één straf per doel loopt de
spamvector daarlangs. Die grens raakt de vraag óf een getuige mag weigeren, en
dat is een productbeslissing over een commitment device — zie §6 en de rij in
`docs/ENGINEER-REVIEW.md`, die daarom op **Middel** staat en niet op Laag.

## 11. Wat er in de opstellingen veranderde door de derde grens

Op drie plekken in `tests/rls/epic9.test.ts` werd een doel teruggedateerd
**vóór** er een straf op ging — één in de opbouw van de suite en twee in de test
over het weggooien van een doel. Dat kan sinds de derde grens niet meer, en de reparatie is geen
omweg maar de juiste volgorde: **eerst de straf, dán de datum laten
verstrijken.** Dat is ook het echte pad — de straf werd vastgelegd toen het doel
nog liep. Een opstelling die de handelingen in de verkeerde volgorde deed, was
al een opstelling die een situatie bouwde die in productie niet kan ontstaan.

⚠️ Dat is een derde soort winst van deze grens, naast de twee in §1: hij maakt
een onmogelijke toestand ook in de tests onmogelijk, en dat is precies waar een
fixture stilletjes gaat liegen over wat hij bewijst.

## 12. ⚠️⚠️ De tweede security-ronde — de derde grens sloot de route óók niet

§3 hierboven vertelt dat "twee grenzen, en samen sluiten ze de route" onwaar
bleek. §10 verving die zin door: de derde grens sluit hem, met als restrisico
"één dag speling, inherent aan tijdzones".

**Dat was voor de tweede keer te veel beweerd.** Gemeten in de tweede ronde,
end-to-end, als gewone `authenticated`-gebruiker in één transactie:

```
A  mijn_datum west = 2026-09-06   (server utc = 2026-09-06)   -- tz = Etc/GMT+12
B  doel met die datum aangemaakt als gebruiker: ja
C  straf erop aangemaakt als gebruiker: ja
D  mijn_datum oost  = 2026-09-07   (verschil = 1 dagen)       -- tz = Etc/GMT-14
E  rollover verschuldigd = 1    status = due
F  bob leest de straf: 1 rij(en)
```

Nul vertraging. De derde grens kostte de aanvaller één `PATCH /profiles`.

**Waar de redenering in §10(a) fout ging.** Die klopte over de *statische*
speling: `mijn_datum()` ligt op elk moment in `[current_date - 1,
current_date + 1]`, en een absolute vloer `>= current_date - 1` zou dus nooit
binden. Dat is nagemeten en het staat nog steeds. Maar de grens vergelijkt
**twee momenten** — `mijn_datum()` bij de insert, en
`localDateIn(profiel.tz, now())` in de rollover — en de waarde ertussen is een
kolom die de gebruiker zelf schrijft. Eén dag statische speling is dan twee
dagen stuurbare speling.

⚠️ **De vorm van deze fout is dezelfde als in §3, één laag dieper.** In §3 zat de
naad tussen twee grenzen; hier zit hij tussen een grens en de rollover. Beide
keren was elk onderdeel correct. Beide keren stond er in `ENGINEER-REVIEW.md`
dat het gemeten en dicht was. **Dat document is twee rondes achter elkaar
geruststellender geweest dan de meting rechtvaardigde, en dat is een ernstiger
patroon dan de bug zelf** — wat daar als dicht staat, kijkt niemand meer na.

### De reparatie: een belofte aan de serverklok (migratie 0170)

Elke grens die in gebruikerstijd rekent, is met dezelfde kolom te verzetten. De
eigenschap die je wilt, hangt aan niets dat een gebruiker aanraakt:

> *Een straf die je vastlegt, kan niet binnen een dag verschuldigd worden.*

`maak_straffen_verschuldigd` krijgt daarom `and c.created_at < now() - interval
'24 hours'`. Dat is **geen tweede kopie van de policyregel** maar een andere
belofte op een andere plek — hetzelfde onderscheid dat 0168 maakte tussen de
bandtoets in de policy en de getuigetoets in de trigger.

⚠️⚠️ **Hier stond "server-tijd aan beide kanten, met geen enkele gebruikerskolom
te verzetten". Dat was onwaar, en §15 gaat daarover.** De rechterkant is
serverklok; de linkerkant kwam uit de POST-body. Derde ronde, derde te stellige
zin.

En het is op zichzelf de betere regel. Domeinregel 5 zegt dat een commitment
device nooit stilzwijgend in werking treedt; een nacht tussen het vastleggen en
het afgaan ís dat. Voor een eerlijke gebruiker verandert er hooguit dat een straf
op een doel dat vandaag afloopt een paar uur later afgaat.

## 13. Route 2 — een trage goedkeuring die een straf laat afgaan

§3b liet `beslis_deadline_verzoek()` bewust buiten de datumgrens, met deze reden:
*een verzoek dat bij het indienen geldig was, mag niet stranden doordat een buddy
er een week over doet.* Die redenering klopte over het verzoek en zag één ding
over het hoofd: **staat er een straf op het doel, dan is de goedkeuring de
trekker van een commitment device.**

Gelezen uit `pg_get_functiondef()`: `update goals set target_date = r.new_date`,
zonder enige toets.

```
Alice vraagt op 1 september om 3 september.   Volkomen legitiem.
Bob keurt goed op 6 september.
target_date wordt 2026-09-03, dus verstreken.
De straf die er al op stond, gaat bij de eerstvolgende rollover af.
```

Alice deed op dat moment niets. Haar buddy was traag.

**De weigering in 0170 is smal en niet algemeen.** Alleen bij een akkoord, en
alleen als de gevraagde datum al voorbij is, gemeten aan
`eigenaarsdatum(r.requester_id)` — de dag van de *aanvrager*, niet die van de
goedkeurder, anders hangt de uitkomst af van waar de buddy woont. Een datum die
nog in de toekomst ligt gaat door zoals altijd, en daar staat een must-allow op.

⚠️ De tak staat **vóór** de `update` op `deadline_requests`, dus een verlopen
verzoek blijft `open`. Anders is de knop van de goedkeurder verbruikt zonder dat
er iets gebeurd is.

⚠️ Wat dit níét oplost: de aanvrager krijgt een weigering en moet zelf opnieuw
vragen. Automatisch laten verlopen mét bericht zou vriendelijker zijn, maar een
nieuw type systeembericht vraagt een migratie op de allowlist en dat is een eigen
issue. Het staat als rij in `ENGINEER-REVIEW.md`.

## 14. De ijking van ronde 2 — zeven mutaties

| Mutatie | Rood |
|---|---|
| `created_at`-conjunct weg uit `maak_straffen_verschuldigd` | *een straf die net is vastgelegd wordt niet verschuldigd* + *de tijdzone omzetten levert niets op* |
| dezelfde conjunct te streng (`400 days`) | *na een dag gaat hij wél af* |
| verlooptak weg uit `beslis_deadline_verzoek` | *een goedkeuring kan de streefdatum niet naar het verleden zetten* |
| verlooptak te breed (`<= +30`) | *een verzoek waarvan de datum nog niet voorbij is, wordt gewoon ingewilligd* |
| `grant update (target_date) on goals` | *een gebruiker kan `goals.target_date` niet rechtstreeks bijwerken* |
| `grant update (type) on commitments` | *een gebruiker kan `commitments.type` niet bijwerken* |
| `magBijwerken()` altijd `false` | *de kolommen die wél bijgewerkt mogen worden, zijn er ook echt* |

⚠️ Die laatste drie gaan over iets wat helemaal geen policy is. **Twee routes uit
de security-ronde zijn dicht door een UPDATE-kolomgrant** — de reward→penalty-flip
en het rechtstreeks verzetten van `target_date` — en er was geen enkele test die
rood werd als een van die kolommen aan de grant werd toegevoegd. `commitments_update`
toetst `type` nergens; de grant is de héle grendel. Nu ligt hij vast, inclusief
een must-allow zodat een kapotte query niet als "dicht" leest.


## 15. ⚠️⚠️ Derde ronde — en de duurste regel stond in een testbestand

0170 hing zijn belofte aan `c.created_at`. De derde security-ronde mat
`information_schema.column_privileges`:

```
INSERT-grant commitments | beneficiary_group_id, beneficiary_user_id, body,
                           confirmed_at, created_at, goal_id, id, image_url,
                           status, type
UPDATE-grant commitments | body, image_url, status
```

0057 versmalde alleen de UPDATE-grant. De INSERT-grant was nooit versmald en dus
nog de standaard die Supabase via `alter default privileges` uitdeelt: álle
kolommen. Zelf nagemeten, als gewone `authenticated`-gebruiker:

```
A  created_at zoals de client hem meestuurde: 2020-01-01 00:00:00+00
B  rollover verschuldigd = 1   status = due
```

Eén veld in de POST-body en het wachtvenster van 0170 stond op nul.

### Wat dit issue drie keer heeft laten zien

| Ronde | De zin | Waar hij fout zat |
|---|---|---|
| 1 | "twee grenzen, en samen sluiten ze de route" | de naad tussen twee grenzen |
| 2 | "één dag speling, inherent aan tijdzones" | een grens die twee momenten vergelijkt met een gebruikerskolom ertussen |
| 3 | "server-tijd aan beide kanten" | de linkerkant kwam uit de request-body |

Alle drie de keren was elk onderdeel correct. Alle drie de keren stond de
geruststelling in `ENGINEER-REVIEW.md` vóórdat iemand hem gemeten had.

⚠️ **En de scherpste vorm ervan stond in `tests/rls/epic9.test.ts`:**

> *"die kolom staat niet in de UPDATE- of INSERT-grant van `authenticated`, en
> dat hoort zo — een gebruiker die zijn eigen `created_at` kiest, kiest zijn
> eigen wachtvenster."*

De invariant is precies goed. Hij is opgeschreven als vaststelling, er stond geen
query naast, en dus werd er niets rood van. **Een zin over een grant is pas waar
als er een query naast staat.** Dat staat als eigen rij in `ENGINEER-REVIEW.md`,
want het is een gewoonte en geen bug.

### De reparatie: twee sloten, geen van beide op `service_role`

**1. De INSERT-grant versmallen** (0171), dezelfde vorm die 0044 en 0046 elders
al gebruiken. Dit zet het vandaag dicht: de client kan de kolom niet noemen, dus
de default `now()` geldt.

**2. Een klokconjunct in `commitments_insert`**, want een grant overleeft het
volgende "bewerk je commitment"-scherm niet:

```sql
and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
and (confirmed_at is null
     or confirmed_at between now() - interval '5 minutes' and now() + interval '5 minutes')
```

⚠️ **Beide kanten van het venster, en de bovenkant is niet cosmetisch.** Een
`created_at` in de toekomst stelt je eigen straf onbeperkt uit — je eigen
commitment device ontlopen, en daar gaat domeinregel 5 over.

⚠️ **`confirmed_at` erbij, en dat is geen meelift.** Dat veld ís de bevestiging
waar domeinregel 5 om vraagt. Hij blijft in de grant omdat `zetStraf()` hem
meestuurt, dus daar doet alleen de policy het werk.

⚠️ **Géén trigger, en dat is een keuze.** Een BEFORE INSERT die `created_at`
forceert, bindt óók `service_role` — en dan kan geen enkele opstelling meer een
straf bouwen die er gisteren al stond, waarmee de grendel van 0170 zelf
ontoetsbaar wordt. Grant en policy laten `service_role` met rust, en dat is hier
de juiste kant: de aanvaller heeft die rol niet.

### De ijking, en waarom er een grant tijdelijk terug open gaat

| Mutatie | Rood | Groen |
|---|---|---|
| klokconjuncten uit de policy (grant smal) | de drie kloktests | 21 |
| INSERT-grant weer volledig open (policy intact) | *een gebruiker kan `commitments.created_at` niet meesturen* | 23 |

⚠️ **Die eerste werkt alleen omdat het kloksblok de grant tijdens zijn eigen
tests terugzet.** Met de versmalde grant erop stuiten die inserts op een
permissiefout en niet op de policy — ze zouden groen zijn met de conjunct er
volledig uit. Dat is letterlijk de val die CLAUDE.md bij regel 18 beschrijft: een
ijking die zijn geval door een pad voert dat een éérdere grendel al afvangt,
bewaakt niets. Het geval dat de policy bewaakt is *"stel dat de grant ooit
terugkomt"*, dus hoort de grant tijdens die tests terug te zijn.
