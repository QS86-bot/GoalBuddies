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

## 3. Twee grenzen, en samen sluiten ze de route

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
