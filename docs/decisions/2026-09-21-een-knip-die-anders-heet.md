# Een knip die anders heet — QS8-579

**21-09-2026.** `knip:controle` bewaakt sinds QS8-446 dat niemand een achttiende
eigen commentaarknip schrijft. Hij deed dat op **naam**: `DEFINITIE` matcht
`function zonderCommentaar\w*(`. 📏 Tien knippen liepen daaromheen, en twee ervan
faalden open.

Dit issue is bijvangst van QS8-574, dat moest uitzoeken waarom zijn detector acht
bestanden vond waar het issue er twaalf noemde. Vier van die twaalf knipten wél —
met een functie die niet `zonderCommentaar` heet.

## 📏 De meting

Met de vormdetector uit dit issue over `scripts/`, `tests/`, `src/` en `app/`:
**tien** functies met een knip-lichaam en een andere naam. Vier in
`tests/beloftes/`, zes in `scripts/`. Geen van tien stond in een register.

| knip | bestand | gemeten |
|---|---|---|
| `ontdaanVanCommentaar()` | `tests/beloftes/datumopmaak.test.ts` | **faalt open** |
| `normaliseer()` | `scripts/edge-tijd-controle.mjs` | **faalt open** — correctheidsregel 7 |
| `ontdaanVanCommentaar()` | `tests/beloftes/onboarding-schrijft-niets-over.test.ts` | faalt dicht, maar op de verkeerde grendel |
| `plat()` | `tests/beloftes/aanmeldscherm.test.ts` | faalt dicht (1 rood) |
| `bronZonderCommentaar()` | `tests/beloftes/tabbalk-bovenaan.test.ts` | faalt dicht (2 rood) |
| `beoordeelBestand()` | `scripts/avatar-controle.mjs` | op regelbegin verankerd — niet blind |
| `zonderDefinities()` | `scripts/dode-keten-controle.mjs` | SQL-knip |
| `registersIn()` | `scripts/registerdrift-controle.mjs` | SQL-knip |
| `tijdzonekandidaten()` | `scripts/tijdzones-controle.mjs` | op regelbegin verankerd |
| `controleer()` | `scripts/verbindingen-controle.mjs` | op regelbegin verankerd |

### De twee die open faalden — mét tegenproef

Allebei droegen ze dezelfde vorm: `.replace()` met één regex die vanaf een `//`
tot het regeleinde knipt. Dat is de blinde vorm van QS8-412 — hij eet alles op ná
de `//` van een URL.

**1. `datumopmaak.test.ts`** bewaakt dat geen enkel scherm of module zelf een
datum opmaakt.

| mutatie in `src/modules/goals/adempauze.ts` | uitslag |
|---|---|
| `const BRON = 'https://…'; const STEMPEL = new Date().toLocaleDateString('nl-NL');` | **25 groen** — faalt open |
| tegenproef: dezelfde opmaak **zonder** de URL ervoor | 1 rood |
| na de reparatie: mét de URL | 1 rood |

De tegenproef is het punt: hij bewijst dat de mutatie de grendel wél bereikt, en
dat het groen dus door de URL komt en niet doordat de mutatie miste.

**2. `edge-tijd-controle.mjs`** bewaakt dat de twee kopieën van `shared/time`
hetzelfde rekenen — de kopie in `supabase/functions/_shared/` bestaat omdat Deno
niet uit `src/` kan importeren.

| mutatie in `clock.ts`, in bééde kopieën | uitslag |
|---|---|
| `const doc = 'https://…'; const marge = 0;` tegen `marge = 7` | **groen** — faalt open |
| tegenproef: hetzelfde verschil **zonder** de URL | rood |
| na de reparatie: mét de URL | rood, *"clock.ts: now — rekent anders"* |
| tegenproef ná de reparatie: een verschil in **alleen commentaar** | groen — dat mag hier |

⚠️⚠️ **En de eerste reparatie was te bot — de poort ving dat.** `normaliseer()`
werd eerst helemaal vervangen door de gedeelde knip, en toen viel
`tests/scripts/edge-tijd.test.ts` om op `const a = 1; // uitleg`. Terecht: de
gedeelde knip gooit een regel weg die mét `//` begint en laat een
**staartcommentaar** staan. Voor een zeef is dat veilig, maar deze controle
**vergelijkt** twee kopieën, en de kop zegt er met zoveel woorden bij dat
commentaar mág verschillen — de Edge-kopie legt terecht andere dingen uit. Een
gedeelde knip zou daar een verschil melden dat er geen is.

Hij houdt dus zijn eigen knip en draagt nu de `(^|[^:])`-wacht van QS8-412, met
een rij in `MET_REDEN` die dat uitlegt. 📏 Nagemeten in beide richtingen: de
URL-mutatie gaat rood, een verschil in alléén commentaar blijft groen.

**De les eronder: "deel de gedeelde knip" is niet het doel.** Het doel is dat
elke knip een keuze is met een reden. Hier was de reden er, en de reparatie was
de wacht en niet de vervanging.

⚠️⚠️ **Die tweede is de zwaarste van de tien.** Twee uiteenlopende exemplaren van
`shared/time` werden gelijk verklaard. Dat is correctheidsregel 7, en CLAUDE.md
zegt erbij wat die kost: *een streak die om middernacht verkeerd breekt, kost je
een gebruiker.* De rollover en de app zouden 's nachts met andere weekgrenzen
rekenen en niets werd er rood van.

### En één die dicht faalde om de verkeerde reden

`onboarding-schrijft-niets-over.test.ts` droeg dezelfde blinde knip, en zijn kop
had er een verdediging bij staan:

> Zodra er een `'https://…'` in `app/onboarding/**` komt te staan, eet de
> regel-commentaarregex de rest van die regel op — inclusief een `}`. Wat dat
> vandaag ophoudt, is grendel 4: een stuk dat deze parser niet leest, is een rode
> test en geen stilte.

📏 Gemeten in plaats van geloofd. Met een ongezien veld op de regel die de patch
sluit — `hulp: 'https://q-projects.tech/hulp' });` — werd de suite rood op
**grendel 2** (*"laat alleen helpers schrijven die het bestaande profiel lezen"*),
niet op grendel 4. De accoladetelling liep dóór de aanroep heen en kwam toevallig
op een andere regel uit.

Dicht gefaald dus, maar niet om de reden die er stond. **Een toevallige grendel is
er morgen niet.** Met de gedeelde knip valt dezelfde mutatie op **grendel 1** —
*"schrijft geen veld dat de gebruiker niet ziet"* — en dát is de belofte.
CLAUDE.md: *kijk wélke test omvalt, niet dát er een omvalt.*

Dit is voor de tweede keer in twee issues dezelfde les. QS8-574 vond twee koppen
die uitschreven waaróm ze geen knip nodig hadden, en allebei klopten ze half.
**Een afwijking die je onderbouwt is duurder dan een die je vergeet.**

## De keuze: detecteren op de operatie, niet op het teken

Criterium 2 waarschuwde dat *"elke functie die commentaar wegknipt"* niet op naam
te bepalen is, en vroeg om een gemeten rand.

📏 Een eerste versie die op het commentaar**teken** matchte, meldde
`git('diff', '--name-only', …)` in `branches-controle.mjs` en elke URL-regex. De
detector eist daarom twee dingen tegelijk:

1. een **operatie** — `.replace(`, `.split(`, `.filter(` of `.test(`;
2. een patroon dat een commentaar**opener** codeert — `\/\*` in een regex, `\/\/`
   dat geen `https:\/\/` is, `--[^\n]*`, of `startsWith('//')` en familie.

Plus: precies **één parameter**. Een knip neemt bron en geeft bron terug. Dat is
de eis die de meeste ruis wegneemt, en hij kost wat in de randtabel.

### De rand, gemeten en opgeschreven

| vorm | |
|---|---|
| `function naam(bron) { … .replace(<commentaarregex>) … }` | gezien |
| een knip ergens middenin een grotere functie | gezien |
| een pijlfunctie: `const knip = (b) => b.replace(…)` | **gemist** |
| een methode in een klasse of object-literal | **gemist** |
| een knip die teken voor teken loopt zonder regex | **gemist** |
| een knip met twee parameters | **gemist** |

⚠️ Die vierde rij is vandaag gratis: de teken-voor-teken-vorm is die van
`sleutelvorm`, `idlijst` en `klokgrens`, en die staan alle drie al op naam in
`MET_REDEN`. Morgen kan dat anders zijn, en dan is dít de regel die verruimd moet
worden — niet een nieuwe controle ernaast.

## Drie uitwegen, en de derde is nieuw

Elke vormtreffer is voortaan geclassificeerd. Hij deelt de gedeelde knip, of hij
staat in `MET_REDEN` met een reden, of hij staat in het nieuwe **`GEEN_KNIP`**
met een reden waarom hij géén knip is.

⚠️⚠️ **Die derde uitweg is de precisiehelft en hij hoort erbij.** Een
vormdetector zonder plek voor zijn eigen valse treffers wordt een controle die je
uitzet — en dan bewaakt hij de échte elfde ook niet meer. Er staan er drie in, en
ze delen één vorm: ze **selecteren** commentaarregels in plaats van ze weg te
gooien. De kop van een migratie ís commentaar, en `kopNummer()` en
`padOnderbroken()` lezen daar juist iets uit.

⚠️ Een rij in `GEEN_KNIP` vrijwaart één **functie** en niet het bestand — zelfde
overweging als bij `MET_REDEN`. Komt er morgen een echte knip naast, dan meldt de
controle die gewoon. `tests/scripts/knip-controle.test.ts` toetst precies dat.

## Twee rijen die de controle zelf rechtzette

⚠️ **`dode-keten-controle.mjs` stond in `ZONDER_KNIP`** — het register van
bronlezers die géén knip hebben — terwijl `zonderDefinities()` al sinds 28-08 een
SQL-knip ín zich draagt. Zodra die functie in `MET_REDEN` kwam, meldde
`verweesdeVrijstellingen()` die rij als overbodig. De rij is weg en zijn meting is
mee verhuisd naar de nieuwe rij.

⚠️ **En `verweesdeRedenen()` moest de nieuwe helft mee gaan voeden.** Die telde
alleen naam-treffers, dus elke vormgeregistreerde knip leek verdwenen: zeven
rijen tegelijk gemeld als *"bestaat niet meer"*. Een controle die onzin meldt,
leer je negeren — en dit was hem op de eerste run.

## De ijking

Eén mutatie per grendel, met "ervoor" gemeten:

| | exitcode |
|---|---|
| ervoor | 0 — groen |
| een elfde knip onder een andere naam erbij | **1** — rood, en alléén die functie genoemd |
| dezelfde naam, maar een CLI-vlagfilter in plaats van een knip | 0 — groen |
| na het opruimen | 0, dezelfde tellingen als ervoor |

`tests/scripts/knip-controle.test.ts` staat op 48 toetsen, waarvan de helft
vormen die de detector met rust moet laten: een `--name-only`-vlag, een
URL-regex, een functie met twee parameters, een knip die alleen in commentaar
staat.

## Wat er níet in zit

- **De zeven knippen die dicht falen zijn niet omgebouwd.** Ze staan in
  `MET_REDEN` met de reden waarom ze hun vorm houden — vier knippen SQL of zijn
  op regelbegin verankerd, twee dragen de `(^|[^:])`-wacht van QS8-412 al, en één
  moet regelposities heel houden. De gedeelde knip ombuigen naar al die vormen is
  een andere belofte dan deze controle maakt.
- **Of een geregistreerde knip het júiste doet**, blijft handwerk. Deze controle
  vraagt om classificatie, niet om correctheid — dezelfde grens die `knip:controle`
  sinds QS8-567 met zoveel woorden trekt.
