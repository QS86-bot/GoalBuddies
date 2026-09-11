# De nesting die erbij kwam zonder dat iemand hem schreef — 11-09-2026

**Issue:** QS8-422
**Raakt:** `eslint.config.js`, `scripts/regel15-controle.mjs`, `src/shared/bladeren/index.ts`,
`supabase/functions/{rollover,notificaties,doelcoach}/index.ts`,
`tests/scripts/regel15-controle.test.ts`, `src/shared/bladeren/bladeren.test.ts`,
`docs/ENGINEER-REVIEW.md`

---

## 1. Het gat, en waarom juist deze map

`eslint.config.js:7` sloot `supabase/*` volledig uit. `deno lint` draait er sinds
25-08 wél overheen, maar kent geen complexiteitsregels. Dat is ~6.700 regels
TypeScript waar coderegel 15 nergens gold — in de map die elk uur met
`service_role` tegen productie draait en dus langs élke RLS-policy heen gaat.

De rij van 07-09 in `docs/ENGINEER-REVIEW.md` hield dat op **Middel** met de
voorwaarde: *"wordt zwaarder als er logica bijkomt in een edge-functie die niet
alleen doorgeeft maar beslist."* Die voorwaarde is deze week ingetreden met de
bijlagen-opruimpas in `rollover/index.ts`.

## 2. Twee metingen die het issue anders had

Het issue vraagt met zoveel woorden om te hermeten (*"of hermeet vóór je het
plafond zet"*), en dat was terecht — allebei de getallen kwamen er anders uit.

### 2a. De lengte: zes en niet tien

| Opties | Boven de vijftig | Langste |
| -- | -- | -- |
| `skipBlankLines`, `skipComments` — wat dit project overal gebruikt | **6** | **282** (`draaiRollover`) |
| zonder die opties — wat het issue telde | 10 | 710 |

Het issue wees het getal van de code-critic (28 / *"282 regels"*) af als
achterhaald. 📏 Dat getal was juist het goede: de code-critic had geteld met de
opties waarmee `regel15-controle.mjs` en elke `max-lines-per-function`-regel in
`eslint.config.js` tellen.

> **Een plafond in een andere eenheid dan de lintregel is een plafond dat de
> volgende meting niet terugvindt.**

Dezelfde klasse als de emoji-regel in CLAUDE.md, waar een teller in grafemen bij
een grens in codepunten *"een nieuwe fout en geen reparatie"* heet. Het plafond
staat daarom op **6**.

### 2b. De nesting: 22, en achttien ervan schreef niemand

22 overtredingen van `max-depth: 3`, verdeeld over twee bestanden. Achttien
kwamen niet uit de logica maar uit één vorm:

```ts
for await (const pagina of paginas(haalProfielen, PROFIELEN_PER_PAGINA)) {
  profielenGezien += pagina.length;

for (const profiel of pagina) {        // ← dezelfde inspringing als de lus erboven
```

📏 In béide jobs stond de binnenste lus op **dezelfde inspringing** als de
buitenste. Het lichaam is bij het invoeren van de paginering (QS8-206) nooit
herschreven — de diff was minimaal, en dat is precies waarom niemand het gezien
heeft. De extra laag duwde élke vertakking eronder een stap dieper dan de code
leest, tot diepte **6** in `notificaties`.

Dat is de eigenlijke vondst van dit issue. Een lintregel die een map nooit
gezien heeft, meldt bij het aanzetten niet alleen wat er fout aan is — hij meldt
ook wat er **per ongeluk** in staat, en dat is hier vier vijfde van het totaal.

## 3. Wat de reparatie is: `rijen()`, en niet een refactor

`src/shared/bladeren` heeft er een tweede generator bij:

```ts
export async function* rijen<T>(haal: Paginahaler<T>, grootte: number)
```

Hij vouwt de pagina's open en leent elke stopvoorwaarde van `paginas()` — ook
die op een korte pagina, wat de stille afkapping van PostgREST's `max-rows` was.
Beide jobs lopen nu `for await (const profiel of rijen(…))`, en `profielenGezien
+= pagina.length` is `+= 1` geworden.

**Waarom in `src/` en niet in de Edge Function:** dezelfde reden die in
`bladeren/index.ts` al stond. De map draait op Deno en er is hier geen runtime
voor; in `src/` kan vitest hem elke vorm los aanbieden en gaat hij via
`npm run edge:sync` mee. `paginas()` blijft bestaan voor de aanroeper die de
pagina zélf nodig heeft — de blokgewijze `remove()` in de opruimpas.

De vier die overbleven zijn met guards vlak getrokken:

- **`rollover`** — de adempauzetak was een `if` in een `if`. Nu twee guards naast
  elkaar, met de schrijfactie achter dezelfde voorwaarde als hiervoor.
- **`notificaties`** — de twee poorten van het cyclusoverzicht zijn er één
  geworden. `&&` kortsluit, dus de twee query's draaien nog steeds alleen op het
  overzichtsuur; `previousCycle()` rekent nu elke ronde mee, en dat is rekenwerk
  op een object dat er al is.
- **`notificaties`** — het paar `if (stand === 'verstuurd') … if (stand ===
  'onderdrukt') …` stond er **vijf keer** woordelijk. Het is één `tel()`-closure
  geworden; een aanroep zet de dieptemeter terug.

## 4. Wat er níet gebeurd is, en dat is het issue zijn eigen grens

> ⚠️ **Splits in dit issue geen functies op.** … `draaiRollover` van 710 naar
> iets leesbaars brengen is een refactor met eigen risico op de job die elk uur
> draait.

Die grens is aangehouden: **geen enkele functie is opgesplitst.** `draaiRollover`
(282) en `draaiNotificaties` (202) staan er nog, en ze staan in de ratel.

Dat was niet vanzelfsprekend. `try` telt mee voor `max-depth` — 📏 met een probe
nagegaan en niet aangenomen — en in `notificaties` zit het hele profiellichaam in
een `try`, dus onder `for` + `try` bleef er precies één laag over. De
voor de hand liggende uitweg was het lichaam naar een functie met een naam
tillen, wat dit project bij `scripts/` (QS8-291) ook elf keer gedaan heeft. Hier
mocht dat niet, en het bleek ook niet nodig.

⚠️ **Wat dat kostte was een vorm die je niet vanzelf kiest**: een samengevoegde
poort met vier `&&`-takken, en een telhulp die er alleen staat omdat een
functiegrens de dieptemeter terugzet. Beide zijn in het commentaar verantwoord.
Wie ooit alsnog aan de lengte begint, mag ze terugdraaien.

## 5. Wat het aanzetten er verder uit haalde

De map linten haalt niet alleen coderegel 15 binnen maar de hele Expo-config.
Twee bevindingen, allebei echt:

- **`import/first`** — in `notificaties` stond `const PROFIELEN_PER_PAGINA = 200;`
  tussen de imports, in `doelcoach` stonden drie imports ná een functie en een
  type. Verplaatst, niet uitgezet.
- **`import/no-unresolved`** op `jsr:@supabase/supabase-js@2` — dit is de enige
  regel die uit gaat, met reden: ESLint kent alleen Node-paden, en dát die import
  klopt toetst `deno check` in `npm run edge:types:controle`. Niets onbewaakt,
  alleen elders bewaakt.

📏 `no-explicit-any` en `no-empty` gaven nul treffers, zoals het issue al zei.

## 6. De ijking

Elke grendel apart gebroken, en elke keer met een grep nagegaan dát de mutatie in
het bestand stond vóór de uitslag geloofd werd.

| Grendel | Mutatie | Uitslag |
| -- | -- | -- |
| A — `max-depth` geldt nu in deze map | een vierde `if` terug in `draaiRollover` | rood, `npm run lint`, noemt dat bestand en die regel |
| B — de map valt binnen de ratel | `PLAFOND['supabase/functions/']` op 5 | rood, "meer functies boven de vijftig dan het plafond toestaat", met de zes erbij |
| C — de ratel slaat óók terug | `PLAFOND['supabase/functions/']` op 7 | rood, "zakte onder zijn plafond" |
| D — `rijen()` doet wat `paginas()` doet | de `yield` binnen de binnenste lus laten vallen | rood, vijf toetsen in `bladeren.test.ts` |
| E — de map valt binnen `laagVan()` | `'supabase/functions/'` uit `PLAFOND` | rood, en de zes tellen dan als `buiten` |

⚠️ **C is de grendel die dit soort ratel nodig heeft en die je vergeet te ijken.**
Zonder haar is het een plafond waar je onder kunt blijven zitten: de winst van
vandaag is niet vastgezet en de volgende lange functie glijdt in de vrijgekomen
ruimte.

⚠️ **Wat níet te ijken is, en dat hoort hier opgeschreven:** dat de twee jobs zich
ná deze wijziging hetzelfde gedragen. Er is geen runtime voor Deno in de poort.
Wat er wél is: `deno check` en `deno lint` groen, de rekenkunde die verhuisd is
staat onder vitest in `src/shared/bladeren`, en de drie andere wijzigingen zijn
met de hand naast het origineel gelegd. Dat is minder dan een test, en het is de
reden dat de lengterefactor terecht een eigen issue is.

## 7. Wat dit niet is

Geen uitspraak over of de Edge Functions het júíste doen — alleen dat ze nu
onder dezelfde coderegels vallen als de rest. Geen wijziging aan `tsconfig.json`:
die map hoort bij `deno check` en niet bij `tsc`, en dat is sinds 25-08 een
besluit. En geen verruiming van de ratel naar de rest van `supabase/`:
`migrations/` en `shim/` dragen SQL, en een laag die op `supabase/` zou beginnen
gaat bij de eerste `.ts` daarbuiten stilletjes meetellen.
