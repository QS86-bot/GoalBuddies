# Werkprompt — twee sessies naast elkaar op GoalBuddies

> Dit document bezit één ding: **de afspraken tussen gelijktijdige sessies**, en
> de meting die het sessieaantal draagt.
>
> Het bezit de stand **niet**. Voor migratiebereik, testteller en wat er af is:
> `docs/WERKVOORRAAD.md` §0. Voor de regels: `CLAUDE.md`. Voor de startprompt van
> één sessie: `docs/VOLGENDE-SESSIE.md`. Staat een feit daar, dan verwijst dit
> document ernaar en herhaalt het niet — `npm run docs:controle` wordt rood zodra
> dat wel gebeurt, en dit bestand staat sinds QS8-583 in zijn `DOCUMENTEN`.

Vul één regel in en begin.

```
JOUW BAAN: <A | B>
```

---

## 0. De meting die dit document draagt

📏 Momentopname van `origin/main` = `20cc23fc` (21-09-2026, 20:55 UTC), gemeten op
**22-09-2026** en **hermeten op 24-09-2026 (QS8-603)** op dezelfde commit. Dit is
een gedateerde momentopname en geen stand; hermeet hem voordat je hem gebruikt om
iets te besluiten.

⚠️ **De eerste versie van deze tabel reproduceerde niet**, en dat is bij de
verificatie van QS8-583 gevonden. Ze noemde 152 merges waar het er 144 zijn, 84%
waar het 79% is, en *"3 commits op `app/` in zes weken"* waar het er 212 zijn. De
categorieën stonden er zonder definitie bij: *"raakt `scripts/` + `tests/` en
verder niets"* letterlijk genomen geeft **3**, omdat bijna elke merge ook `docs/`
raakt. Hieronder staan de getallen die het script eronder oplevert, mét de
definities; wie hermeet, draait dat script en niet een eigen lezing.

**Van de 144 merges op `main` sinds 13-09 (first-parent, `--since=2026-09-13T00:00:00Z`):**

| | merges | % |
| --- | --- | --- |
| raakt gereedschap en geen broncode | 75 | 52% |
| raakt geen van beide (alleen docs, migraties, config) | 38 | 26% |
| raakt broncode én gereedschap | 30 | 21% |
| **raakt broncode zónder gereedschap** | **1** | **1%** |
| raakt `app/` | 9 | 6% |
| **raakt `docs/ENGINEER-REVIEW.md`** | **114** | **79%** |
| raakt `docs/WERKVOORRAAD.md` | 70 | 49% |
| raakt `docs/VOLGENDE-SESSIE.md` | 20 | 14% |

*Gereedschap* is een pad onder `scripts/` of `tests/`; *broncode* een pad onder
`app/`, `src/` of `supabase/functions/`. De eerste vier rijen sluiten elkaar uit
en tellen op tot 144. De ene merge met broncode zónder gereedschap is `58bf8343`
(PR #464, het heldenpalet): hij raakt `src/shared/theme/` en twee testbestanden
die ín `src/` staan, dus met deze definitie geen gereedschap.

```bash
C=20cc23fc; VANAF=2026-09-13T00:00:00Z
for m in $(git log --merges --first-parent --since=$VANAF --format=%H $C); do
  f=$(git diff --name-only $m^1 $m)
  gr=$(echo "$f" | grep -cE '^(scripts|tests)/')
  br=$(echo "$f" | grep -cE '^(app|src|supabase/functions)/')
  echo "$gr $br $(echo "$f" | grep -c '^app/') $(echo "$f" | grep -cx 'docs/ENGINEER-REVIEW.md')" \
       "$(echo "$f" | grep -cx 'docs/WERKVOORRAAD.md') $(echo "$f" | grep -cx 'docs/VOLGENDE-SESSIE.md')"
done | awk '{ n++; if ($1>0 && $2==0) g++; else if ($1==0 && $2==0) geen++;
              else if ($1>0) beide++; else bron++;
              if ($3>0) app++; if ($4>0) rev++; if ($5>0) wv++; if ($6>0) vs++ }
            END { print n, g, geen, beide, bron, app, rev, wv, vs }'
# → 144 75 38 30 1 9 114 70 20  (merges, gereedschap, geen van beide, beide,
#   bron zonder gereedschap, app/, ENGINEER-REVIEW, WERKVOORRAAD, VOLGENDE-SESSIE)
```

**Verder:**

| meting | waarde | hoe |
| --- | --- | --- |
| commits op `app/`, zonder merges, sinds 13-09 | **13** van 423 | `git log 20cc23fc --no-merges --since=2026-09-13T00:00:00Z --oneline -- app/` |
| commits op `app/`, zonder merges, in zes weken (sinds 11-08) | 212 | idem met `--since=2026-08-11T00:00:00Z` |
| Linear Backlog + Todo | 22, **waarvan 22 met `wacht-op-Quinten`** | `list_issues` per status |
| open PR's | 0 | `list_pull_requests` |
| open rijen in `docs/ENGINEER-REVIEW.md` | 320 — 3 Hoog, 44 Middel, 273 Laag | `grep -oE '\| *(Hoog\|Middel\|Laag\|Kritiek) *\|'` |
| CI-duur op `main` | mediaan 8 min, spreiding 5:31–16:00 | `created_at` → `updated_at` over 30 runs |

### Wat hieruit volgt

**Er is geen bouwbare Linear-backlog meer.** Alle 22 issues in Backlog en Todo
dragen `wacht-op-Quinten`, en dat label sluit ze uit. Wat de sessies de afgelopen
negen dagen gebouwd hebben, hebben ze **zelf gevonden**. De wachtrij is geen
voorraad die leegloopt — hij wordt door de sessies zelf gevuld, en **meer sessies
leveren dus meer wachtrij, niet minder.**

**De app zelf beweegt weinig.** 9 van de 144 merges raakten `app/`, en 13 van
de 423 commits sinds 13-09. Eén merge raakte broncode zonder gereedschap.

⚠️ Hier stond eerst *"de app beweegt niet"*, met *"drie commits in zes weken"*
eronder. Dat getal was onwaar (212), en *niet* was te sterk. De richting houdt
stand, maar alleen als verhouding: het werk van deze periode zat voor het
overgrote deel in gereedschap en dossier, niet in schermen.

⚠️ **Wat hier níet uit volgt:** dat het grendelwerk verspild is. Dat werk vindt
echte fouten, en `docs/ENGINEER-REVIEW.md` telt honderden doorgestreepte rijen
die daar staan. Wat er wél uit volgt is dat **het sessieaantal niet is wat de app
afmaakt** — de finish loopt door die 22 issues, en die zijn geblokkeerd op
Quinten en niet op capaciteit.

---

## 1. Hoeveel sessies parallel — twee

**Ideaal: 2. Plafond: 3, en alleen onder §1c. Minimum: 1.**

| baan | doet | eigen boom | raakt nooit |
| --- | --- | --- | --- |
| **A — de afmaakbaan** | alles wat de app dichter bij af brengt: `app/`, `src/modules/`, `src/shared/`, `supabase/migrations/`, `supabase/functions/` | broncode | `scripts/` |
| **B — de grendelbaan** | controles, ijkingen, testdekking, dossierrijen | `scripts/`, `tests/scripts/` | `app/` |

Raakt jouw werk de andere boom, dan is dat een **vervolgissue** en geen uitstapje.
Dat is dezelfde regel als in `CLAUDE.md`: één branch per Linear-issue, en raakt je
werk meerdere issues, dan zijn het meerdere branches en meerdere PR's.

📏 De splitsing is gemeten en niet bedacht (§0): 75 van de 144 merges raakten
gereedschap en geen broncode, en **één** raakte broncode zonder gereedschap. De
overlap is 21%.

### 1a. Waarom niet drie, en waarom niet vijf

📏 `docs/ENGINEER-REVIEW.md` wordt geraakt door 79% van alle merges (114 van 144,
§0). Dat is geen slordigheid maar de grondwet: elke bevinding hoort in het
dossier, en `CLAUDE.md` schrijft voor dat je bij elk bijgewerkt feit alle drie de
overdrachtsdocumenten nagrept.

De kans dat minstens twee gelijktijdige branches op dat ene bestand botsen, bij
p = 114/144 per branch — `1 − (1−p)ⁿ − n·p·(1−p)ⁿ⁻¹`:

| banen | kans op een conflict in `docs/ENGINEER-REVIEW.md` | botsende paren per ronde, verwacht |
| --- | --- | --- |
| 2 | **63%** | 0,6 |
| 3 | **89%** | 1,9 |
| 4 | **97%** | 3,8 |

⚠️ Deze tabel stond eerst op p = 0,84 (71% / 93% / 99%), een getal dat niet
reproduceerde (QS8-603). De conclusie verandert er niet door: de sprong zit
tussen twee en drie banen, en bij vier is een conflict per ronde vrijwel zeker.

Bij twee banen is dat in ongeveer zes van de tien rondes één conflict, additief
op te lossen aan het eind van het bestand — dat is op 21-09 zes keer achter
elkaar gedaan en het werkte elke keer. Bij drie banen zijn het er verwacht bijna
twee per ronde, in een bestand van honderden regels.

⚠️ **Een conflict is hier niet gratis op te lossen.** 📏 Op 21-09 sneed een
conflictgrens dwars door het lichaam van een `it()` in
`tests/scripts/knip-controle.test.ts`: "allebei behouden" gaf een bestand dat niet
parseert (`Expected } but found EOF`). Een conflict kost hier een herbouw vanaf
`git show origin/main:<bestand>`, geen keuze tussen twee blokken.

### 1b. De harde bovengrens zit op `main`

📏 CI op `main` duurt mediaan 8 minuten. Op 21-09 landden drie merges om
20:33:23, 20:33:31 en 20:33:38 UTC — 8 en 7 seconden na elkaar — en alle drie hun
runs staan op `cancelled`, attempt 1. Drie commits op `main` hebben daardoor
**geen uitslag**: niet groen, niet rood, er niet.

⚠️ **En `hoofdrun:controle` ving dat niet**, terecht niet: die bewaakt
`cancel-in-progress`, en die staat correct. GitHub houdt per concurrency-groep
maar één run in de **wachtrij**, en een volgende merge annuleert de wachtende. De
grendel dekt de lópende run; de wachtende is zijn blinde vlek. Dat is QS8-582.

**Dus: minstens acht minuten tussen twee merges op `main`.** Dat is ongeveer
zeven merges per uur met een uitslag op elke commit. Twee banen halen dat ruim;
vijf banen leveren bursts, en een burst is precies wat dit kapotmaakt.

⚠️⚠️ **En de oorzaak eronder is op 22-09-2026 weggenomen (QS8-582), maar de
afspraak blijft tot iemand hem heeft nagemeten.** De concurrency-groep is op
`main` per commit geworden, dus er staat niets meer in een wachtrij om uit geduwd
te worden; `hoofdrun:controle` toetst die groep nu tweezijdig en `hoofdrun:stand`
meldt elke commit op `main` zonder afgeronde uitslag. Dat maakt van de acht
minuten een **voorspelling**: hij zou niet meer nodig moeten zijn. Een
voorspelling is hier geen meting. **Wat hem sluit is één waarneming** — twee
merges binnen acht minuten, en daarna van beide commits vastgesteld dat hun run
een uitslag hield. Doe je die waarneming, schrijf haar hier op en haal deze
afspraak weg; tot dan houd je de acht minuten aan. Uitleg in
`docs/decisions/2026-09-22-de-wachtende-run-is-niemands-uitslag.md`.

### 1c. Wanneer wél een derde baan, en wanneer terug naar één

**Een derde baan mag alleen als hij het dossier niet aanraakt.** Concreet: hij
werkt aan één afgebakend onderwerp, schrijft zijn bevindingen in het Linear-issue
in plaats van in `docs/ENGINEER-REVIEW.md`, en baan A of B vouwt ze later in één
commit in. Spreek dat vooraf af of doe het niet.

**Terug naar één baan zodra er geen niet-geblokkeerd issue meer is dat `app/` of
`src/` raakt.** Op dat moment kan een tweede baan alleen nog grendelwerk
fabriceren: dat kost tokens, het vult de wachtrij die het zelf leegmaakt, en
📏 het raakt de app in 5% van de gevallen.

### 1d. Wat de app wél afmaakt — doe dit eerst

De `wacht-op-Quinten`-issues zijn nooit meer nagelezen sinds ze het label kregen.
Onder *Beslisbevoegdheid* in `CLAUDE.md` zijn er precies twee redenen om te stoppen
en te vragen, en een label is er geen van beide. Loop de lijst één keer door en
splits hem in drie:

1. **Echt grens 1 of 2** — developer-accounts, een uitgavenplafond, de repo
   privé, een betaalprovider, een wachtwoordbelofte aan een mens. Die blijven
   staan — maar **schrijf het besluit vóór voor Quinten**: één vraag, twee opties,
   de meting erbij, zodat zijn antwoord één zin is.
2. **Vraagt een mens, geen besluit** — schermen die nog nooit doorlopen zijn, de
   app in het Engels nalopen. Bereid de route voor: een klikpad en een lijst met
   wat je verwacht, zodat het tien minuten kost.
3. **Was gelabeld en is bouwbaar.** **Meet het, haal het label eraf, bouw het.**

⚠️ Haal een label er nooit af op grond van dit document alleen. Lees het issue
**én zijn reacties** — `CLAUDE.md`, en de aanleiding is QS8-408.

---

## 2. De claimpoort — `npm run claim`, en hij weegt twee bronnen

Dit project heeft er gereedschap voor; bouw je eigen ritueel niet.

```bash
npm run claim -- <gitBranchName van Linear>
```

`scripts/claim.mjs` fetcht zelf en leest twee bronnen die verschillend wegen
(QS8-449): een **branch op de remote** betekent *hier zit iemand nu* en weigert
hard; een **gelande PR op `main`** betekent *hier is werk geweest* en weigert
zonder te pushen, met `--vervolg` als expliciete uitweg.

⚠️ **Een hoge branchteller is een vertekening.** Veel remote branches zijn
verlaten werk, en enkele staan er omdat een cloudsessie 403 krijgt op verwijderen
(QS8-240). Een claim die daarop weigert is een vals alarm — maar **behandel hem
tóch als bezet** tot je met `git log origin/<branch>..origin/main` hebt
vastgesteld dat hij volledig in `main` zit. Dat kost dertig seconden; het
alternatief is dat twee sessies hetzelfde issue bouwen, wat op één dag drie keer
gebeurd is.

⚠️ **Het issue op In Progress zetten is géén claim** (QS8-214: het is gedáán, vóór
de eerste regel code, en de andere sessie begon alsnog). Doe het wel, vertrouw er
niet op.

---

## 3. Meet op `main`, en noem de commit

- Elke meting gaat tegen `origin/main`, of je noemt de branch én de commit erbij.
  `git log --oneline -1 origin/main` hoort in je eerste comment.
- **De waarheid over de database is `pg_get_functiondef()` en `pg_policy`**, niet
  het migratiebestand en niet de tekst van een rij.
- **Een issue dat zegt dat iets stuk is, is geen bewijs dat het stuk is.** Ook
  niet als jij het zelf schreef. Reproduceer vóór je repareert.
- **Een branchbevinding is pas een bevinding ná een verse `git fetch --all`**
  (QS8-435). Voor je eigen migratienummer maakt een oud beeld niet uit; voor wat
  je over het werk van een ander beweert wel.

---

## 4. De drie gedeelde documenten — additief, achteraan, nooit herschikken

Er komt **geen fragmentenmap**: de eigenaarstabel in `CLAUDE.md` wijst
`CLAUDE.md`, `docs/WERKVOORRAAD.md` en `docs/VOLGENDE-SESSIE.md` aan als de plek
waar hun feiten wonen, en `npm run docs:controle` bewaakt dat ze elkaar niet
herhalen. Wat er wél komt is discipline over de vórm:

1. **Voeg toe aan het eind van de sectie, in één aaneengesloten blok.** Eén blok
   conflicteert met één blok; twee verspreide bewerkingen conflicteren met alles.
2. **Herschik nooit** — geen rijen sorteren, geen kolommen uitlijnen, geen
   nummering hernummeren, geen regels opnieuw afbreken. Een herschikking maakt van
   een additief conflict een handmatige samenvoeging van het hele bestand.
3. **Los een conflict additief op**: beide helften blijven, allebei melden.
4. **Controleer na het oplossen dat het bestand nog parseert.** Bij een
   testbestand `npx vitest run <bestand>`; bij een markdown-tabel
   `npm run review:controle`.
5. Een `|` in een tabelcel schrijf je als `\|`, óók binnen backticks (QS8-415).

⚠️ `docs/decisions/` is gedateerd en niet genummerd, en dat is precies waarom het
hier géén probleem is: één bestand per besluit, per definitie conflictvrij. **Maak
geen nieuw genummerd document.**

---

## 5. Wat hier wél botst: migratienummers en registers in een functielichaam

**Migratienummers.** Begin met `npm run migratie:nieuw -- "naam"` — die fetcht
zelf en kijkt naar élke branch die de remote kent. Het nummer sluit aan op je
eigen map; de branches bepalen de *waarschuwing*, niet het nummer (QS8-365: een
gat is erger dan een botsing, want CI checkt één branch uit en ziet de branch die
het gat vult niet).

⚠️ **Dragen twee PR's toch hetzelfde nummer: wie als tweede merget, hernummert.**
Controleer vlak vóór het mergen opnieuw of jouw nummer nog vrij is.
`npm run migratie:hernummer` neemt de verwijzingen mee; de kale die hij níét
aanraakt print hij, en die lees je stuk voor stuk.

**Een register in een `create or replace`-lichaam.** Twee migraties die dezelfde
functie herdefiniëren staan in verschillende bestanden, dus git ziet geen
conflict; het hoogste nummer wint en het register van de ander verdwijnt zonder
een woord (QS8-358). **Breid je een register uit, ververs dan eerst je beeld van
`main` en kopieer het lichaam van dáár.** `npm run registerdrift:controle` wordt
rood zodra een herdefinitie een rij laat vallen.

---

## 6. Agents — naar risico, niet naar schema

Onwrikbare regel 19 in `CLAUDE.md` is hier bindend. Kort:

| wat je raakt | wie er komt |
| --- | --- |
| auth, RLS, punten, goedkeuring, commitments, een nieuw groepszichtbaar oppervlak | `security-reviewer`, **direct** |
| UI, gamification, cosmetisch | één lichte controle |
| einde van een milestone | `code-critic` + `critical-user`, samen in één opdracht |

**Geen agent** bij een wijziging in één of twee bestanden, een tekstcorrectie, of
een meting die je zelf kunt doen. **Nooit een agent om iets te meten wat je met
één `grep` weet** — dat is altijd verlies, in tijd én in tokens.

⚠️ **Verifieer elke bevinding zelf voordat je hem verwerkt.** Ze hebben het ook
mis: in één ronde was de zwaarste bevinding aantoonbaar onjuist — ze las een
migratiebestand waar de gedéployde functie strenger was — terwijl twee andere
kritieke bevindingen wél klopten.

---

## 7. Token- en tijdregels

- **Lees nooit een heel groot bestand.** `CLAUDE.md`, `docs/VOLGENDE-SESSIE.md`,
  `docs/WERKVOORRAAD.md` en `docs/ENGINEER-REVIEW.md` zijn elk honderden tot
  duizenden regels. Gebruik `grep -n` en dan `sed -n 'a,bp'`.
- **`npm ci` één keer aan het begin** als `node_modules` leeg is. Zonder dat is de
  poort rood op `ERR_MODULE_NOT_FOUND`, en dat is een sandbox-artefact en geen
  fout in het project. "Repareer" dat nooit.
- **Draai `npm run poort` in zijn geheel, één keer per commit** — niet een greep
  eruit, niet per bewerking.
- ⚠️ **Een controle zonder database is niet groen maar *ongemeten*.** Meet de
  ongemeten verzameling vóórdat je begint en leg hem ernaast als je klaar bent:
  **dezelfde verzameling, niet alleen hetzelfde aantal.** Een controle die van
  rood naar ongemeten schuift ziet eruit als vooruitgang.
- **Meet één keer, schrijf het op met een datum.** Staat er een gedateerde meting
  in een kop of een beslisdocument, meet die niet opnieuw tenzij de code eronder
  gewijzigd is.
- **Eén ronde per issue.** Claim, reproduceer, bouw, ijk, poort, lever. Geen
  tweede analyseronde omdat het "nog netter" kan.

---

## 8. Bouwen — de ronde

1. **Claim** (§2). Issue op In Progress. Lees de reacties.
2. **Reproduceer de bevinding zelf** op `origin/main`, en noem de commit.
3. **Branch**: de naam die Linear voorstelt (`gitBranchName`), af van `origin/main`.
4. **Bouw tegen de acceptatiecriteria**, met tests terwijl je bouwt — niet erna.
   Minstens één test staat op de náád (onwrikbare regel 18, de zes vragen).
5. **Ijk je eigen belofte.** Breek hem met de hand en kijk **wélke** test rood
   wordt, niet dát er een rood wordt. **Eén mutatie per grendel**, en **meet
   "ervoor"** — een rood dat er al was is niet jouw rood.
6. **`npm run poort`**, in zijn geheel.
7. **Beslisdocument** bij elke niet-vanzelfsprekende keuze, gedateerd in
   `docs/decisions/`.
8. **Commit in het Nederlands**: eerste regel wat er verandert, daarna waaróm.
9. `git push -u origin <branch>`; bij netwerkfouten 4× opnieuw met 2/4/8/16 s.

⚠️ **Een afwijking die je onderbouwt is duurder dan een die je vergeet.** Een
omissie valt op; een uitgeschreven argument leest de volgende persoon als een
reden om er niet aan te twijfelen. Wijk je af van het issue, zeg dan dát je
afwijkt — verdedig het niet in een migratiekop.

⚠️ **Regelovertredingen buiten je taak: niet stilzwijgend repareren.** Een rij in
`docs/ENGINEER-REVIEW.md` erbij, of een Linear-issue, en noem het in je
samenvatting.

---

## 9. PR's en mergen

**Je opent de PR en je merget hem zelf.** Wat in de plaats komt van een
menselijke goedkeuringspoort is dat je vóór de merge vier dingen zelf vaststelt:

1. CI **success** op de huidige head — niet op een eerdere commit.
2. Geen merge-conflict: `git merge-tree --write-tree origin/main origin/<branch>`,
   exitcode 0.
3. Je migratienummer is nog vrij (§5).
4. De PR-tekst klopt nog met wat erin zit. Een branch die intussen bewoog maakt
   een beschrijving stil onwaar.

**Merge-commit, nooit squash** — de commit-berichten dragen het waaróm, en
squashen slaat dat plat (`CLAUDE.md`, Versiebeheer).

⚠️ **Minstens acht minuten tussen twee merges op `main`** — zie §1b. Merg je
sneller, dan verliest een commit zijn CI-uitslag zonder dat iets rood wordt.

**Kies de volgorde zo dat conflicten op jouw eigen branch landen**, niet op die
van de andere sessie: test elke branch eerst met `git merge-tree` en merg de
schone eerst.

⚠️ **Na élke merge: `npm run hoofdrun:stand`.** Twee terecht groene PR's kunnen
samen rood zijn. Draait de run nog, dan ben je niet klaar. Rood op `main` is werk
nú, en het is van wie als laatste merde.

⚠️ **Push niet naar een branch waarvan de PR al gemerged is.** Dat maakt de
automatisch opgeruimde branch opnieuw aan, en `npm run claim` leest een branch op
de remote als *hier zit iemand nu*. Een cloudsessie krijgt hem daarna niet meer
weg (QS8-240).

**Een PR die je niet zelf schreef repareer je niet.** Zet de bevindingen als
comment op de PR met een voorstel, en merg niet.

---

## 10. Stoppen en vragen — precies twee redenen

Uit `CLAUDE.md`, *Beslisbevoegdheid*. In élk ander geval: kies de conservatiefste
optie die het werk áf maakt, bouw door, en zet de aanname zichtbaar in het issue
én in het beslisdocument.

**Grens 1 — beloofd of in rekening gebracht.** Een commitment device; iets dat
Quinten geld kost of hem extern vastlegt; een eerste uitgaande stroom naar echte
mensen.

**Grens 2 — onomkeerbaar vernietigend.** `drop`, `truncate`, een `delete` zonder
filter, een migratie zonder rollback-pad op een **gevulde** tabel, gebruikers in
bulk verwijderen, `git push --force` over werk dat niet van jou is, een sleutel
roteren waarmee je jezelf of Quinten buitensluit.

Een migratie die kolommen **toevoegt** aan een lege tabel valt hier niet onder.
Rollback in de kop, doorgaan.

**Gewoon verboden, en dat is iets anders dan vragen:** een tijd- of weekberekening
buiten `src/shared/time`; een Vercel-specifieke API of package;
`REPLICA IDENTITY FULL` op een tabel in de realtime-publicatie; een nieuw type
systeembericht zonder migratie. De runtime is Expo + Supabase op Hostinger — zie
`docs/DEPLOY.md`.

---

## 11. Afronden

Na elk issue: een korte samenvatting in de chat **en** als comment op het issue,
in deze volgorde en niet in een andere:

> **wat gebouwd — wat getest — wat een aanname is — wat de volgende afgebakende stap is**

⚠️ Het derde punt is het punt. Een verslag dat alleen zegt wat er gebouwd en
getest is, laat de lezer raden welk deel gemeten is en welk deel aangenomen — en
dat is de klasse fout waar de hele grondwet over gaat.

Status naar **In Review** — Done is aan Quinten. Dan door naar het volgende zonder
te vragen welke.

Aan het eind van je sessie: werk `docs/VOLGENDE-SESSIE.md` bij, en noem wat er
open bleef staan en waarom.
