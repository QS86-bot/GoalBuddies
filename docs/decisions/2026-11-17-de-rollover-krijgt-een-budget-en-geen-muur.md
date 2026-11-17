# De rollover krijgt een budget en geen muur

**Datum:** 17-11-2026 · **Issue:** QS8-685 · **Status:** gebouwd, nog niet gedeployd

## Aanleiding

De uurjob `rollover` deed alle profielen één voor één af, met drie verzoeken per
profiel achter elkaar. De looptijd groeide dus lineair met het aantal gebruikers,
en twee grenzen lagen in de weg: de curl-timeout van 120 s in
`.github/workflows/rollover.yml`, en de wandkloklimiet van de Edge Function zelf.

## Wat er gemeten is (productie, alleen gelezen, 17-11-2026)

| meting | waarde | bron |
| --- | --- | --- |
| profielen op het moment van run 550 (16-11 18:45:53 UTC) | **262** | `profiles.created_at` |
| profielen verwerkt in run 550 | **262** | 262× `maak_straffen_verschuldigd` in `edge_logs` |
| profielen nu | **1.332** | `count(*)`; 1.070 erbij tussen 16-11 18:48 en 21:15 UTC |
| run 16-11 20:12 | **405** profielen, `shutdown` na **192 s**, geen enkele stap ná de lus | `edge_logs`, `function_logs` |
| run 17-11 03:36 | **368** profielen, `shutdown` na **162 s**, geen enkele stap ná de lus | idem |
| looptijd per profiel, één tegelijk | **0,44–0,47 s** (119/262, 191/405, 162/368) | eerste en laatste verzoek per run |
| werk ná de lus in run 550 | **≈ 1 s** (18:47:52,9 → 53,6) | `edge_logs` |

**De "262 van 298" uit het issue is geen overgeslagen werk.** De 298 is later
geteld: bij de start van run 550 bestonden er 262 profielen, en die zijn alle 262
verwerkt. Het verschil zijn profielen die ná de run zijn aangemaakt.

**De toestand is erger dan het issue beschreef.** Sinds 16-11 18:47 UTC heeft
**geen enkele** stap ná de profielenlus meer gedraaid (stille groepen,
seizoensrecaps, vastgelopen goedkeuringen, opruiming van bijlagen), en elke run
begint vooraan in `order('id')`, dus ≈ 930 profielen achteraan kregen nooit een
rollover: geen afgesloten week, geen minpunt, geen straf die verschuldigd wordt.

⚠️ **De wandkloklimiet is niet scherp 150 s.** Gedocumenteerd is 150 s op de
gratis tier; de twee afgekapte runs liepen 162 en 192 s. Dit document rekent met
150 s, want dat is de grens die het platform belooft en niet de grens die het
toevallig liet passeren.

## Besluit

1. **Een tijdbudget op de profielenlus** (`PROFIELBUDGET_MS = 100_000`). Na 100 s
   begint er geen nieuw profiel meer; wat loopt, wordt afgemaakt. Daarna draait
   het werk ná de lus altijd. Dit is wat de muur weghaalt: de looptijd van de lus
   hangt niet meer van het aantal gebruikers af.
2. **Acht profielen tegelijk** (`PROFIELEN_TEGELIJK = 8`). Binnen één profiel
   blijven de stappen ná elkaar en in dezelfde volgorde (domeinregel 10 en 11).
3. **Een willekeurige startplek.** Eerst `id >= scharnier`, dan `id < scharnier`.
   Zonder dat zijn het bij een vol budget elke run dezelfde profielen die
   achteraan blijven, en dat is precies wat er nu op productie gebeurt.
4. **`volledig` in de uitvoer, en de workflow wordt rood op `false`.** Ook Sentry
   krijgt het (`rollover_profielbudget_op`). Niet alle profielen aan de beurt is
   een storing: er wachten mensen op hun week en hun straf.
5. **De curl-timeout naar 240 s**, boven de gedocumenteerde 150 s én boven de
   gemeten 192 s. Een afgekapte functie komt dan binnen als platformfout en niet
   als curl-timeout.

De generieke lus (`verwerkBinnenBudget()`) staat in `src/shared/bladeren`, waar
vitest draait, en gaat via `npm run edge:sync` mee — zelfde constructie als
`paginas()`.

## De schaalgrens

Met *t* = 0,45 s per profiel (gemeten, één tegelijk) en de aanname dat acht
tegelijk lineair schaalt:

| | formule | profielen |
| --- | --- | --- |
| zonder budget, één tegelijk: 150 s bereikt bij | 150 / 0,45 | **≈ 333** (📏 en dat gebeurde: 368 en 405 werden afgekapt) |
| zonder budget, acht tegelijk: 150 s bereikt bij | 8 × 149 / 0,45 | **≈ 2.650** |
| **met budget, acht tegelijk: elk profiel in één run tot** | 8 × 100 / 0,45 | **≈ 1.780** |
| daarboven | — | `volledig: false`, workflow rood; de 150 s wordt niet meer bereikt |

📏 De test op de naad (`tests/beloftes/rollover-werk-na-de-lus.test.ts`) haalt
met 150 ms per verzoek **1.784** profielen in 100,35 s nagemaakte tijd, daarna het
werk erna, en blijft onder de 150 s. Dat bevestigt de rekensom onder de aanname;
het meet PostgREST niet.

**Vandaag (1.332 profielen) zou één run dus volledig moeten zijn, met ≈ 75 s.**
Boven ≈ 1.780 wordt hij rood, en dan is een van de vervolgstappen hieronder aan
de beurt. Dat is ver onder het schaaldoel van 100k+.

## Aannames — niet gemeten

* **Dat acht tegelijk lineair schaalt.** PostgREST deelt een verbindingenpool, en
  `max_connections` is 60 voor de hele database. Wordt PostgREST de flessenhals,
  dan is de winst kleiner dan 8×. Meten: eerste run na de deploy, `profielen`
  en looptijd uit de uitvoer en `edge_logs`.
* **Dat parallelle profielen elkaar niet raken.** Elke stap is per eigenaar, en
  `points_ledger` heeft een unieke index. Triggers op `weekly_goals` die per
  groep schrijven (systeemberichten, De Ketting) kunnen tussen twee leden van
  dezelfde groep tegelijk lopen; een slot of deadlock komt dan binnen als een
  zachte fout per stap, zoals elke andere fout in de lus. Niet gemeten.
* **Dat 50 s marge genoeg is.** Een profiel met veel gemiste weken doet meer
  verzoeken dan drie. Het werk na de lus kostte in run 550 1 s, maar de
  opruiming van bijlagen kan bij een vol `BIJLAGE_PAS_LIMIET` langer duren.

## Wat afgewezen of uitgesteld is

* **Eén RPC per profiel** (optie 2 van het issue): één rondgang in plaats van
  drie. Vraagt een migratie, en die is voor dit issue afgebakend (productie op
  `0302`, `main` op `0298`). Vervolgissue QS8-687.
* **Alleen profielen met werk** (optie 3): vraagt een query die weet welke
  profielen een cyclusgrens of een verlopen deadline hebben, en dat is
  cyclusrekenwerk (correctheidsregel 7). Hoort bij QS8-687.
* **Een cursor in de database** in plaats van een willekeurige startplek:
  strenger (elke run gaat verder waar de vorige stopte), maar vraagt een tabel.

## Het pad terug

`PROFIELBUDGET_MS = Infinity` en `PROFIELEN_TEGELIJK = 1` geven het oude gedrag,
op de startplek na. De workflow terug op `--max-time 120` en zonder de
`volledig`-toets. Geen migratie, dus niets in de database om terug te draaien.

## Dezelfde muur elders

📏 De notificatiejob (`notificaties.yml`, ook `--max-time 120`) liep op 17-11 om
04:02 ≈ 194 s over 1.200 profielen, één tegelijk. Zelfde vorm, eigen issue:
QS8-688.
