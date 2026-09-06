# Het register trok zijn eigen grens, en niemand mat waar die grens langs liep

**Datum:** 06-09-2026 · **Issue:** QS8-286 · **Geen migratie**

---

## 1. Wat er aan de hand was

`scripts/definers-controle.mjs` telt de klasse "SECURITY DEFINER-functies die
schrijven waar een autorisatievraag hoort". Die klasse werd afgebakend door
`KERNTABELLEN`, en daar stonden vijf tabellen in: `goals`, `weekly_goals`,
`milestones`, `completions`, `points_ledger`.

Alle vijf gaan over een **doel**. Wie aan `groups`, `group_members`,
`deadline_requests`, `approval_withdrawals`, `weekly_plan_steps` of `badges`
schreef, viel er buiten — en daarmee uit het enige rapport dat deze klasse telt.
Achttien functies, waarvan dertien aanroepbaar door `authenticated`.

**Dat is precies het oppervlak waar domeinregel 7 aan hangt.** Wie mag zien wat
er over een ánder zichtbaar is, wordt bepaald door groepslidmaatschap, en dat
staat in `group_members`. Een register dat alleen naar doelen keek, keek langs de
helft van het probleem heen.

⚠️ **Dit is dezelfde vorm als de bevinding die `definers-controle.mjs` deed
ontstaan, één laag hoger.** Daar deed een sweep van zeven functies zich voor als
een inventarisatie van de klasse, terwijl het er twaalf waren. Hier trekt het
gereedschap dát die fout moest voorkomen zijn eigen grens — en die grens is
opnieuw een aanname die niemand heeft nagemeten.

## 2. De meting

Per functie de eerste autorisatiepoort geneutraliseerd (`if false then`), de
volledige RLS-suite gedraaid, daarna byte-identiek teruggezet en dat
gecontroleerd. 995 tests.

| Functie | Poort | Rood |
|---|---|---|
| `rotate_invite_code` | `not_admin` | 7 |
| `set_invite_revoked` | `not_admin` | 7 |
| `verwijder_lid` | `not_admin` | 5 |
| `zet_groepszichtbaarheid` | `not_admin` | 5 |
| `heropen_groep` | `not_admin` | 3 |
| `zet_groepsontdekbaarheid` | `not_admin` | 3 |
| `archiveer_groep` | `not_admin` | 2 |
| `beslis_lidmaatschapsverzoek` | `not_admin` | 2 |
| `verlaat_groep` | `not_member` | 2 |
| **`herorden_weekplan`** | `not_owner` | **0** |
| **`trek_deadline_verzoek_in`** | `not_yours` | **0** |
| **`vraag_deadline_verschuiving`** | `not_owner` | **0** |

Negen van de twaalf waren gedekt. Drie niet.

⚠️ **`heropen_groep` stond in de dossierrij bij de functies waarvan "de poort
niet automatisch herkend" werd.** Dat was een beperking van dát sweep-script en
niet van de functie: hij heeft een gewone `not_admin`-poort en die is gedekt.
Nagemeten en gecorrigeerd.

## 3. Wat die drie gaten betekenen

- **`herorden_weekplan`** — een groepsgenoot herordent jouw weekplan.
- **`trek_deadline_verzoek_in`** — een groepsgenoot trekt jouw openstaande
  verzoek in.
- **`vraag_deadline_verschuiving`** — een groepsgenoot dient namens jou een
  deadline-verschuiving in.

Alle drie de poorten stónden er en werkten. Wat ontbrak was iets dat rood wordt
als ze verdwijnen. Elke bestaande test riep deze functies aan als de eigenaar op
zijn eigen doel; de poort weghalen veranderde daar niets aan.

### 3a. De derde ondergraaft een argument dat hier eerder gemaakt is

QS8-282 verklaarde `beslis_deadline_verzoek` veilig met deze redenering: die
functie toetst niet op `owner_id`, maar dat hoeft niet, want een verzoek kán
alleen door de eigenaar aangemaakt zijn — `vraag_deadline_verschuiving()` toetst
`g.owner_id = auth.uid()` en `deadline_requests_insert` heeft `check false`.

**Die redenering klopt nog steeds. Maar de schakel waar hij op rust was door
niets bewaakt.** Valt die poort weg, dan maakt een groepsgenoot een verzoek voor
jouw doel en keurt een derde lid het goed via `beslis_deadline_verzoek`: je
streefdatum verschuift zonder dat je er iets van weet.

Dat is voor de derde ronde op rij dezelfde vorm. Eerder gebeurde het bij
`gedeeld_met_groep` (QS8-283) en bij de fixture-koppeling in dezelfde ronde.

> **Een argument dat leunt op een grendel die niets bewaakt, is een aanname.**

Wie een functie veilig noemt omdát een ándere functie iets afdwingt, hoort in
dezelfde adem na te gaan of díe afdwinging onder test staat. Anders verplaatst
het argument het risico in plaats van het weg te nemen.

## 4. Twee functies zonder poort, en waarom dat geen vrijbrief is

`create_group` en `join_group_with_code` hebben geen autorisatiepoort om weg te
halen: alles wat ze schrijven is op de aanroeper zelf gescopeerd
(`created_by = auth.uid()`, en de lidmaatschapsrij gaat naar `auth.uid()`). Er is
geen slachtoffer om voor te schrijven.

⚠️ **Precies daar ging QS8-282 mis.** Daar stond over `zet_week_startdag` dat de
mutatievorm er "principieel blind voor is", en die zin werd gelezen als "hier is
niets te halen". De regel die daaruit volgde: **een zin die een functie opzij
zet, hoort te zeggen wélke vorm hem wél raakt.**

Die vorm is hier "schrijf voor iemand anders": de lidmaatschapsrij naar een ánder
profiel laten wijzen. Gemeten: `create_group` **66 rood**, `join_group_with_code`
**109 rood**. De scoping is dus gedekt — alleen niet door de vorm die bij de
andere RPCs werkt.

## 5. De reparatie, en waarom de lijst de kern is

Het testblok in `definerpoorten.test.ts` dicht de drie gaten. Maar dat is de
symptoombestrijding; **de kern is `KERNTABELLEN`**. Zonder die stap valt de
volgende RPC die alleen groepslidmaatschap schrijft opnieuw buiten élk rapport.

De lijst telt nu elf tabellen, in twee groepen (over een doel, en over een groep
en wie erin zit), en het register 41 functies in plaats van 23.

⚠️ **`tests/scripts/definers-controle.test.ts` bewaakt niet dat de lijst
compleet is — dat kán een test niet.** Hij bewaakt dat de zes die het probleem
waren er niet stilletjes weer uit vallen, en hij voedt `schrijftNaarKerntabel()`
vier nieuwe vormen die er alleen op lijken (`group_events`,
`group_member_requests`, `badge_definities`, `deadline_requests_archief`) — want
een verbrede lijst maakt juist die verwarring waarschijnlijker.

## 6. De ijking

Elk van de drie nieuwe gevallen is in **twee** vormen kapot gemaakt, en niet in
één:

| Vorm | Wat hij nadoet |
|---|---|
| poort eruit (`if false then`) | de grendel verdwijnt bij een refactor |
| poort verruimd (`or shares_group_with_goal(...)`) | iemand "repareert" een klacht dat een buddy niet kan helpen |

| Functie | poort eruit | verruimd |
|---|---|---|
| `herorden_weekplan` | 2 rood | 2 rood |
| `trek_deadline_verzoek_in` | 3 rood | 3 rood |
| `vraag_deadline_verschuiving` | 5 rood | 5 rood |

De tweede vorm is de realistische: een poort verdwijnt zelden, maar hij wordt wél
opgerekt. En hij is scherper, want hij bewijst meteen dat de acteur in de test de
**sterke** acteur is — een groepsgenoot die het doel deelt, en niet een
wildvreemde die al door `goals_select` wordt tegengehouden.

### 6a. Een voorwaarde die andersom stond

De eerste versie van het weekplanblok toetste vooraf dat de groepsgenoot de
stappen kón lezen — "anders is hij niet de sterke acteur". Gemeten: hij ziet er
nul. `weekly_plan_steps_select` is eigenaar-only.

**Voor een definer-functie is dat geen verzwakking maar het hele punt.** Bob mag
die rijen niet eens zíen, en kon ze zonder de poort in de functie wél
herordenen. Dat is exact de klasse waar dit register over gaat, en de reden dat
`rls:dekking` er niets over zegt: die meet policies, en een definer-functie komt
daar principieel niet langs.

De voorwaarde toetst nu wat ze hoorde te toetsen — dat hij het **doel** ziet, dus
geen wildvreemde is die al door `goals_select` wordt afgevangen — plus dat het
weekplan zelf dicht blijft.

⚠️ **De effectassertie staat vóór de reden**, en dat is de les van QS8-285: zou
`reason` eerst staan, dan valt de test bij een weggehaalde poort om op een
veranderde fóutreden en zegt hij nog steeds niets over wat er met de rij van een
ander gebeurde.
