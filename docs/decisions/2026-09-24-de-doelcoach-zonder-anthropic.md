# Kan de Doelcoach zonder de Anthropic-API?

**Datum:** 24-09-2026
**Issue:** QS8-587 (uit QS8-141)
**Aard:** onderzoek — een meting en een aanbeveling, géén implementatie
**Beslist:** niets. Dit valt onder grens 1 van de *Beslisbevoegdheid* (wat een
gebruiker beloofd wordt, en wat Quinten geld kost). De keuze is aan Quinten.

## 0. Het korte antwoord

**Ja, en dat pad is al gebouwd.** De app is vandaag volledig te doorlopen met
nul AI-aanroepen; wat er zonder AI ontbreekt is geen code maar **inhoud** — een
mijlpaalpatroon per categorie.

Maar de vraag achter de vraag is *"moet die rekening er zijn"*, en daar is het
antwoord genuanceerder: 📏 de gemeten kosten zijn **1,53 dollarcent** voor het
zwaarste gebruikersmoment, en **de rekening die je vandaag ziet is 1,5× te
hoog** — dat is één deploy en geen productbesluit.

## 1. Wat er gemeten is, en wat er niet gemeten is

### 1a. De enige echte kostenmeting die dit project heeft

📏 Productie (`wehgocadxehottiiyvsc`), `ai_jobs`, opgehaald 24-09-2026. De hele
tabel is **één rij**:

| | |
| -- | -- |
| soort | `plan` |
| status | `done` |
| datum | 14-09-2026 |
| invoertokens | 1.807 |
| uitvoertokens | 1.164 |
| geboekt | **2,2881 cent** |

### 1b. En die rij bewijst dat de gedeployde prijstabel achterloopt

Reken de rij na met de twee prijstabellen:

| prijs per MTok | invoer | uitvoer | totaal |
| -- | -- | -- | -- |
| **200 / 1000** (lijstprijs, wat er in de repo staat) | 0,3614 | 1,1640 | **1,5254 cent** |
| **300 / 1500** (de oude introductieprijs) | 0,5421 | 1,7460 | **2,2881 cent** |

📏 De geboekte waarde is **exact** de tweede, tot op vier decimalen. Dat is geen
schatting maar een identificatie: de gedeployde `doelcoach` rekent nog met
`300/1500`. `supabase/functions/doelcoach/index.ts` staat in de repo op
`200/1000` sinds 10-09-2026; QS8-243 (Edge Functions lopen achter) is de reden.

⚠️⚠️ **Dat is niet alleen een rapportagefout, en dat is de scherpste vondst van
dit onderzoek.** Het dagquotum telt sinds `0182` géén jobs meer maar **cent**,
en het leest `cost_cents` — dus het getal dat 1,5× te hoog staat, is hetzelfde
getal waarmee de poort dichtgaat.

📏 Wat dat doet, met de waarden die vandaag op productie staan
(`ai_dag_budget_cent()` = 30, `ai_job_voorschot_cent()` = 3,
`ai_dag_limiet()` = 10, `ai_invoer_max()` = 8.000):

| | plafond van één job | maximale jobs per dag |
| -- | -- | -- |
| zoals gedeployd (300/1500) | 13,2 cent | 2 + één overschot |
| na de deploy (200/1000) | **8,8 cent** | 3 + één overschot |

Voor een *gewone* job maakt het niets uit — die blijft onder het voorschot van
3 cent en telt dus voor 3. Voor een zware job **knijpt de poort vandaag anderhalf
keer harder dan ontworpen**.

⚠️ En het raakt de beslissing van QS8-141 rechtstreeks: een uitgavenplafond dat
je zet op grond van `ai_kosten_per_week()` is een plafond op een getal dat **50%
te hoog** is.

### 1c. Wat er niet gemeten is, en dat hoort er eerlijk bij

Er is **geen enkele** gemeten rij voor `milestones`, `weekly_goals` of
`milestone_tip`. Alles wat hieronder over die drie staat, is gemodelleerd uit de
grenzen die de code zélf afdwingt, en niet uit gedrag.

## 2. Wat de Doelcoach kost, per eenheid die ertoe doet

⚠️ **Niet "per gebruiker per maand", en dat is geen ontwijking.** 📏 De vier
soorten job hangen alle vier aan een **doel of een mijlpaal**, niet aan een week:
`milestone_tip` is één keer per mijlpaal, en `weekly_goals` draait per mijlpaal
op een knop met een cache van een dag. De kosten zijn dus **vooraan in de reis
geconcentreerd** en niet terugkerend. Een maandbedrag verbergt precies dat.

| | | |
| -- | -- | -- |
| één `plan` | **1,53 cent** | 📏 gemeten |
| één volledig gecoacht doel, 6 mijlpalen | **≈ 16 cent** | gemodelleerd, band 10–25 |
| één maximale job | **8,8 cent** | afgeleid uit `MAX_TOKENS` en `ai_invoer_max()` |
| één gebruiker, maximaal misbruik per dag | **38,8 cent** | budget 30 + één overschot |

Omgerekend naar het schaaldoel van 100k gebruikers, en met de nadruk op *wat het
getal is*:

| scenario | kosten |
| -- | -- |
| 100k gebruikers maken elk één volledig gecoacht doel | ≈ **$16.000**, eenmalig |
| 10% van 100k maakt maandelijks een nieuw doel | ≈ **$1.600 per maand** |
| 100k gebruikers vreten elk elke dag hun quotum op | ≈ **$1,16 miljoen per maand** |

⚠️ De derde rij is er niet om te dreigen maar om te laten zien waar de rem zit:
het **dagbudget per gebruiker**, en niet de gemiddelde gebruiker. Een
uitgavenplafond bij Anthropic (QS8-141) is de tweede rem, en die twee doen
verschillende dingen — de eerste beschermt de gebruikerservaring tegen één
misbruiker, de tweede beschermt de rekening tegen honderdduizend.

## 3. De vier richtingen

### Richting 1 — niets veranderen, met het plafond eroverheen

| | |
| -- | -- |
| kosten | ≈ 16 cent per gecoacht doel; $1.600/maand bij 100k met 10% maandelijks nieuw doel |
| de gebruiker merkt | niets |
| grendels | geen wijziging. `ai_dag_budget_cent()` = 30 blijft de per-gebruiker-rem, QS8-141 het platformplafond |
| kosten om te doen | **nul** |

⚠️ Dit is niet "niets doen": QS8-141 is op zichzelf zinnig en QS8-243 (de deploy)
is gratis en verbetert de meting waarop elke andere keuze rust.

### Richting 2 — een sjabloonpad zonder AI

📏 **Het code-deel hiervan is al af en aangesloten, en dat is met de hand
nagemeten:**

| wat | waar | stand |
| -- | -- | -- |
| doel maken zonder AI | `app/doel/nieuw.tsx` | bestaat, en staat als tweede knop op `app/(tabs)/doelen.tsx` |
| mijlpaal met de hand toevoegen | `app/doel/[id].tsx` → `maakMijlpaal()` in `src/modules/goals/mijlpalen.ts` | bestaat en wordt aangeroepen |
| weekdoel met de hand toevoegen | `app/doel/[id].tsx` → `maakWeekdoel()` in `src/modules/goals/weekly.ts` | bestaat en wordt aangeroepen |

**Een gebruiker kan de hele app vandaag doorlopen zonder één AI-aanroep.** Wat
"het sjabloonpad" nog mist is geen laag maar inhoud: een mijlpaalpatroon per
categorie, en 📏 er zijn er **twaalf** in `src/shared/categorieen/index.ts`
(`fitness`, `nutrition`, `self_care`, `mindfulness`, `creativity`,
`productivity`, `connection`, `other`, `business`, `study`, `building`,
`skills`).

| | |
| -- | -- |
| kosten per aanroep | **nul** |
| de gebruiker merkt | het verschil tussen *"één zin, de rest komt vanzelf"* en *"kies een categorie en pas het patroon aan"* |
| grendels | `vraag_ai_job()`, het dagbudget en de kostenlogging worden dode code op het standaardpad; `keten:controle` en `exports:controle` gaan daar terecht over klagen |
| kosten om te doen | twaalf patronen schrijven en onderhouden, plus vertaling — dit is redactiewerk en geen programmeerwerk |

⚠️⚠️ **Wat de app hiermee inlevert, is een epic dat expres gebouwd is.** 📏 De
twee primaire knoppen naar een nieuw doel — op `app/(tabs)/doelen.tsx` en
`app/groep/[id].tsx` — wijzen sinds QS8-383 naar `app/doel/plan.tsx` en
uitdrukkelijk niet meer naar `app/doel/nieuw.tsx`. De commentaarregels dáár
noemen dat met zoveel woorden *"de hele epic waard"*. Richting 2 kiezen is die
knoppen terugdraaien, en dat is een productbesluit en geen bezuiniging.

### Richting 3 — een andere aanbieder of een eigen model

📏 **De koppeling aan Anthropic is kleiner dan het issue aannam**, en dat is
geteld: `vraagClaude()` in `supabase/functions/doelcoach/index.ts` is
**68 regels** (705–772), plus twee constanten (`MODEL`,
`PRIJS_PER_MTOK_CENT`) en een URL. Daarbinnen zit alles wat aanbiederspecifiek
is:

- het endpoint en de `anthropic-version`- en `x-api-key`-headers;
- `output_config.format: { type: 'json_schema' }` — het mechanisme voor
  gestructureerde uitvoer heet bij elke aanbieder anders;
- `stop_reason` met `refusal` en `max_tokens`;
- `usage.input_tokens` / `usage.output_tokens`.

Wat **niet** aanbiederspecifiek is, en dus blijft staan: de vier promptbouwers,
de Zod-schema's, `vraag_ai_job()` met cache, dedup en dagbudget, de
kostenlogging in cent, en `src/modules/ai/jobs.ts`.

| | |
| -- | -- |
| kosten | onbekend, en dat is een aanname die ik hier niet wegschrijf — prijzen van derden zijn niet uit deze omgeving te meten |
| de gebruiker merkt | de kwaliteit van de opsplitsing. Dat is het product |
| grendels | `PRIJS_PER_MTOK_CENT` is een typegrendel: een model zonder prijsregel komt de typecheck niet door. Die blijft werken, maar `tests/beloftes/doelcoach-prijs.test.ts` draagt de datum en de bron van de prijsmeting en moet mee |
| kosten om te doen | één functie van 68 regels, plus een nieuwe prijsregel en een nieuwe sleutel in `docs/DEPLOY.md` |

⚠️ **Zelf hosten is hier geen richting maar een ander project.** De stack draait
op de gratis Supabase-tier en op Hostinger; een model draaien vraagt een GPU en
dus een rekening die groter is dan de rekening die we wegnemen. Dat is geen
meting maar een grootteorde, en zo staat hij hier.

### Richting 4 — een mengvorm: sjabloon als standaard, AI op een knop

| | |
| -- | -- |
| kosten | evenredig met hoe vaak de knop gebruikt wordt; de `plan`-job verdwijnt van het standaardpad |
| de gebruiker merkt | een keuze in plaats van een automatisme |
| grendels | het dagbudget wordt een ánder getal: de zware `plan`-job zit niet meer in het standaardpad, dus 30 cent per dag is dan ruim |
| kosten om te doen | alles van richting 2, plus een tweede ingang houden |

⚠️ Dit is niet automatisch het midden. Het voegt een **keuze** toe op het moment
dat een gebruiker het minst weet wat hij wil — de eerste minuut. Twee paden naar
hetzelfde scherm is ook een last.

## 4. De aanbeveling

**Richting 1, en eerst meten.** Drie stappen, in deze volgorde, en alleen de
eerste is dringend:

1. **Deploy `supabase/functions/doelcoach/index.ts`** (QS8-243). Dat is gratis en
   het haalt de 1,5× uit elk getal waarop elke andere keuze rust — inclusief het
   uitgavenplafond van QS8-141.
2. **Zet het plafond** (QS8-141). Dat is onafhankelijk zinnig zolang de Doelcoach
   draait, en het is de enige rem die bij honderdduizend gebruikers werkt.
3. **Beslis dit issue pas na honderd echte jobs.** 📏 Er is er vandaag **één**.
   `ai_kosten_per_week()` geeft dan het antwoord op de enige vraag die er
   werkelijk toe doet — hoeveel gebruikers de coach hoe vaak gebruiken — en dat
   is precies het getal dat nu ontbreekt.

⚠️⚠️ **Waarom niet richting 2 of 4, terwijl die gratis zijn per aanroep.** Omdat
de gemeten kosten van het zwaarste moment **1,53 cent** zijn en de rem er al
staat. Het sjabloonpad vervangt een epic dat gebouwd is om precies dit weg te
nemen (QS8-200: *"één zin, de AI doet de rest"*), en het kost twaalf
mijlpaalpatronen die iemand moet schrijven én onderhouden. Dat is een echte prijs
tegen een besparing die vandaag niet te becijferen valt — er is één job.

⚠️ **En wat dit onderzoek níét zegt:** dat richting 2 verkeerd is. Het zegt dat
de drie getallen die hem zouden kunnen dragen — hoeveel doelen een gebruiker
maakt, hoe vaak hij de coach opnieuw vraagt, en wat de andere drie soorten job
kosten — geen van drieën bestaan. Een besluit dat op nul metingen rust is een
gok, ook als hij goed afloopt.

## 5. Wat hierna een eigen issue is

- **De drie ongemeten jobsoorten.** Zodra er echte rijen zijn: `milestones`,
  `weekly_goals` en `milestone_tip` per soort uitrekenen uit `ai_jobs`. Vandaag
  is dat één query op een lege tabel.
- **Het voorschot van 3 cent her-ijken.** `0182` zegt zelf dat dat getal een
  behoedzame schatting is en na honderd jobs één regel SQL. 📏 Met de enige
  meting die er is (1,53 cent) is 3 cent vandaag ongeveer het dubbele van een
  echte job, en dat is de goede kant om op te zitten — maar het is geen meting.
- **Een mijlpaalpatroon per categorie**, als richting 2 of 4 gekozen wordt. Dat
  is redactiewerk voor twaalf categorieën en hoort niet in een technisch issue.
