# De klasse die de catalogus niet ziet

**Datum:** 11-09-2026 · **Issue:** QS8-433 · **Migratie:** 0254

Vervolg op `2026-09-11-een-grant-is-niet-altijd-het-slot.md` (QS8-428). Dat
document gaat over een grendel die de **catalogus** verkeerd las. Dit gaat over
het geval waarin de catalogus klópt en het slot tóch niet sluit.

## 1. De meting, en de volgorde die hem maakt

📏 Tegen de lokale PostgREST, op `berichten_plafond()` — een functie waar `anon`
het uitvoerrecht níet heeft — met de **bevoorrechte rol als eerste aanroeper op
een verse pool**:

| stand van de functie | `service_role` 20× | daarna `anon` 25× |
|---|---|---|
| `immutable` (vóór 0254) | 200 × 20 | **200 × 25** |
| `stable` (ná 0254) | 200 × 20 | **401 × 25** |

`has_function_privilege('anon', …, 'execute')` was in beide gevallen `false`.

⚠️⚠️ **De volgorde is zelf een meetinstrument, en dat is de scherpste les van
dit issue.** Begin je met mislukte anon-aanroepen, dan cachet dát plan mét de
functieaanroep erin, en alles erna is per ongeluk dicht. Zo mat het issue *2 van
de 25* waar het er 25 van de 25 zijn — en zo mat ík aanvankelijk dat `stable`
zonder zoekpad veilig was, terwijl het dat niet is. **Wie deze klasse nameet en
met `anon` begint, meet zijn eigen beschermlaag.**

## 2. Twee routes, en pas als béide dicht zijn sluit de grant

Een aanroep verdwijnt op twee manieren uit het plan:

| | Route A — constant folding | Route B — SQL-inlining |
|---|---|---|
| **Wanneer** | `immutable` en alle argumenten constant: nul argumenten, óf allemaal een default | `language sql`, geen `proconfig`, geen `security definer` |
| **Argumenten** | moet zonder argumenten aanroepbaar zijn | geen grens — 📏 een `stable` sql-functie mét argument lekt óók |
| **`SET search_path` helpt?** | 📏 **nee** — `immutable` + zoekpad + nul argumenten lekt `200 × 25` | 📏 **ja** — dezelfde functie mét zoekpad geeft `401 × 25` |
| **`plpgsql`?** | n.v.t. | 📏 immuun; die wordt niet ingelined |

⚠️ **Dit is een correctie op mijn eigen eerste versie van dit document.** Daar
stond *"`stable` mág niet weggevouwen worden, dus dit is veilig"*. Dat is onwaar:
`stable` sluit route A, niet route B. Gevonden in de security-review en daarna
zelf nagemeten.

⚠️ **En een correctie op die review.** Die concludeerde dat de achtentwintig al
dicht wáren door hun `SET search_path`, en dat 0254 dus niets toevoegde. 📏 Ook
onwaar, en op de echte functie gemeten: `berichten_plafond()` mét zoekpad maar
terug op `immutable` lekt `200 × 25`. **Beide eigenschappen zijn nodig, en ze
sluiten verschillende routes.** De review had gelijk over het mechanisme en
ongelijk over de conclusie; dat verschil is alleen met een meting te zien.

⚠️⚠️ **Route B is in dit project al dicht, en niet door dit issue.** Elke functie
in `public` draagt een `SET search_path`, afgedwongen door de tak
`'geen set search_path'` in `definer_bewaking()` (0106/0167). 📏 Nul functies
zonder `proconfig`. Dat is een grendel die er voor iets ánders staat en deze
klasse toevallig meedekt — onwrikbare regel 18 vraag 1 in zuivere vorm: twee
correcte onderdelen, en de naad ertussen stond nergens opgeschreven. **Wie ooit
een uitzondering aan die zoekpadregel toevoegt, heropent route B.** Daarom meet
`volatiliteit:controle` route B zélf mee in plaats van erop te vertrouwen.

## 3. Waarom `stable` en niet iets anders

| | Waarom niet |
|---|---|
| `db-prepared-statements = false` | Een instelling buiten de repo die élke query trager maakt om één klasse te repareren — en hij staat in een dashboard, niet in git. |
| De grants intrekken | Ze zíjn al ingetrokken. Dat is het punt: de catalogus klopt. |
| `alter function … stable` | Een **zwakkere** belofte dan `immutable`, dus semantisch altijd veilig: waar `immutable` mocht, mag `stable` ook. Staat in een migratie en dus in git. |

## 4. Alle 28, en niet alleen de 22 waar de grant dicht is

Zes van de 28 mag `authenticated` met reden uitvoeren, en bij één geldt dat ook
voor `anon` (`commitment_zichtbaar_voor_groep()`, besloten in 0253). Daar valt
niets te lekken — het recht ís gegeven. Ze gaan tóch mee: **een klasse met een
uitzonderingslijst erin is er een die niemand in één blik controleert**, en het
register zou dan alleen maar kunnen verlopen.

⚠️ Daarom is het register met opzet leeg. De enige echte eis voor `immutable`
komt van indexexpressies en gegenereerde kolommen, en 📏 geen van de 28 staat
daarin.

## 5. Wat de wijziging kostte, en wat er per geval gemeten is

* **`ai_invoer_max()` staat in de CHECK `ai_jobs_input_len`.** 📏 In een
  terugrollende transactie, vóór én na: te lange invoer wordt beide keren
  geweigerd met `23514`, korte invoer landt. Postgres hervalideert een constraint
  niet bij `alter function`, dus dit moest gemeten.
* **`ai_jobkosten_cent(numeric)` gaat mee naar `stable`.** Die is `immutable` en
  roept `ai_job_voorschot_cent()` aan, die sinds §5 `stable` is — een `immutable`
  functie die een `stable` functie aanroept is een onwaar label, en Postgres
  dwingt dat niet af. Uit de security-review.
* **Twee aanroepen in `commitments_select` worden gewikkeld.** ⚠️ Dat is een
  **regressie van deze migratie** en geen losse verbetering: als `immutable`
  werden ze bij het plannen gevouwen, als `stable` per rij geëvalueerd. 📏 In het
  plan nagemeten: met `(select …)::text[]` staat er `InitPlan 7 (returns $6)` en
  `status = ANY ($6)` — één keer per query. Zelfde vorm als `( SELECT auth.uid() )`
  twee conjuncten verderop, en dezelfde reden (onwrikbare regel 12).
  ⚠️ De cast is geen opsmuk: `= any (subquery)` leest Postgres als een
  verzameling rijen en niet als een array, en dan vindt hij geen operator.
  ⚠️ `initplan_bewaking()` ziet deze klasse niet — die zoekt alleen een kale
  `auth.uid()`. Staat als rij in `docs/ENGINEER-REVIEW.md`.

⚠️ **Hier stond dat een indexexpressie een harde fout zou geven bij `stable`.**
📏 Bij meting onwaar: `alter function` slaagt gewoon en Postgres hervalideert
niets. De inventarisatie klopt (er is er geen), maar het vangnet waar de
redenering op leunde bestond niet.

## 6. Wat er niet gemeten is

⚠️ **Of PostgREST op productie met prepared statements draait**, en of de
achtentwintig daar al `stable` zijn — productie loopt op het moment van schrijven
drieëndertig migraties achter. Het verandert niets aan de reparatie, wél aan de
vraag of het gat daar ooit écht openstond. Staat als rij in
`docs/ENGINEER-REVIEW.md`, met terugkeervoorwaarde.

## 7. De regel die overblijft

> **Een grant is een slot op de catalogus, niet op het plan.**

`functies_met_uitvoerrecht()` (0253) certificeert dat de catalogus klopt, en dat
blijft waardevol — maar het is niet hetzelfde als "niemand komt erbij". Waar dit
project schrijft *"de grant is hier de enige grendel"* — zoals 0115 dat doet bij
`seizoensrecap_cijfers()` — geldt dat alleen zolang er iets te plannen valt.
