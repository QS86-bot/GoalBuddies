# Een quotum dat telt, weegt niets

**06-09-2026 — QS8-296, migratie 0182**

De poort voor AI-jobs deed `count(*)`. Tien jobs per dag, ongeacht hun omvang.
De gegevens om het beter te doen stonden er al: `ai_jobs` draagt sinds 0001
`input_tokens`, `output_tokens` én `cost_cents`. Er wérd dus per job geboekt wat
hij kostte; alleen de poort keek er niet naar.

Dit is de tweede helft van bevinding 4 van de controleronde van 28-08. De eerste
helft is 0123: sinds toen is één job begrensd op `ai_invoer_max()` = 8.000
codepunten. Wat er nog stond was de **dag**.

## 1. De meting, en waarom hij zo dun is

📏 Gemeten op productie op 06-09-2026, vóór de migratie:

| Wat | Uitkomst |
|---|---|
| `ai_dag_limiet()` | `10` |
| Rijen in `ai_jobs` | **3** |
| Rijen mét `cost_cents` | **0** |
| `vraag_ai_job()` op productie | byte voor byte de versie uit 0136 (md5 `d17235a9…`) |

Alle drie de jobs staan op `failed` en dragen dezelfde reden: QS8-195, de
CORS-periode van eind augustus. **Er is dus geen enkele geslaagde call om een
gemiddelde uit te trekken.** Dat is de belangrijkste zin van dit document, want
elk bedrag hieronder is daarmee een aanname en geen meting.

Wat er wél is, zijn de grenzen die de code zelf al afdwingt:

```
uitvoer  MAX_TOKENS = 8.000 (doelcoach/index.ts), à 1500 cent/Mtok  → 12,0 cent
invoer   ai_invoer_max() = 8.000 codepunten + systeemprompt,
         ruim geschat 4.000 tokens, à 300 cent/Mtok                 →  1,2 cent
--------------------------------------------------------------------------
één job in het slechtste geval                                      ≈ 13,2 cent
```

⚠️ Die prijzen zijn 300 / 1500 en niet de 200 / 1000 die er tot vandaag stonden.
De introductieprijs van Sonnet 5 liep tot en met 31-08-2026 en `PRIJS_PER_MTOK_CENT`
stond op 06-09 nog op het oude getal; dat is in dezelfde ronde rechtgezet. Zie §9.

Tien daarvan is **132 cent per gebruiker per dag**, en dat is wat het quotum
toestond. Op een tier zonder uitgavenplafond is dat de kant waar het misgaat: de
rekening bij Anthropic loopt op tokens en niet op aanroepen.

## 2. Eén eenheid, en het is cent

⚠️ **Tokens zijn geen eenheid maar twee.** Invoer en uitvoer hebben een andere
prijs; ze bij elkaar optellen geeft een getal waar geen bedrag uit volgt. Cent is
precies de omrekening die dat verschil al draagt, en `cost_cents` bestaat al —
`ai_kosten_per_week()` somt hem al op. Er komt dus geen nieuwe grootheid bij.

Dat is niet alleen netjes, het is de les van QS8-118: tekstlengte in UTF-16 én in
codepunten naast elkaar heeft dit project een echte bug gekost. Het issue vroeg
er expliciet om — kies er één en laat client, functie en limiet allemaal díe
tellen.

**`ai_dag_limiet()` blijft en is geen poort meer.** Hij is nu het aantal *gewone*
jobs dat in een dag past, en het budget volgt eruit:

```
ai_dag_budget_cent() = ai_dag_limiet() × ai_job_voorschot_cent()
                     = 10 × 3 = 30 cent
```

Zo staat het getal 10 nog steeds op precies één plek. Dat is dezelfde reden
waarom 0056 het ooit uit twee functies heeft weggehaald.

## 3. Het voorschot is een bodem, en dat is de kern

Het issue zag de valkuil zelf al: *"een limiet achteraf stopt de job die het
budget opmaakt niet — die is dan al gedraaid en al betaald."* Dat klopt, en het
antwoord is geen tweede mechanisme aan de invoerkant maar een bodem:

```sql
ai_jobkosten_cent(cost) = greatest(coalesce(cost, 0), ai_job_voorschot_cent())
```

Elke job kost minstens het voorschot vanáf het moment dat hij in de tabel staat.
Drie gevolgen, alle drie bedoeld:

1. **Een `queued` of `running` job eet meteen budget**, ook al is er nog van geen
   enkele een bedrag bekend. ⚠️ Dat alléén stopt een burst *niet* — zie §11; daar
   is een slot voor nodig. Wat de bodem wél doet is de burst duur maken zodra de
   rijen er staan.
2. **Een `failed` job houdt het voorschot.** Het commentaar in
   `doelcoach/index.ts` zegt het al: *"een call die halverwege afbreekt is al
   betaald."* Tot 0182 stond dat er als voornemen; nu telt het.
3. **Een job die op `cost_cents = 0` uitkomt, telt alsnog.** Dat gat is echt:
   `doelcoach/index.ts` doet `data.usage?.input_tokens ?? 0`, dus een antwoord
   zonder usage-blok boekt een gratis job. **Nul is geen bedrag maar een
   ontbrekend bedrag.**

Punt 3 is tegelijk de ijking die het issue zelf voorstelde: zet de kostenkolom op
nul en kijk of de limiet dan alsnog bijt. Hij bijt, en hij valt precies terug op
het gedrag van gisteren — tien jobs. Een meting die stukgaat, maakt het quotum
dus niet losser dan het was.

## 4. Wat dit met het plafond doet

|  | plafond per gebruiker per dag | poort weigert bij |
|---|---|---|
| vóór 0182 | 10 × 13,2 = **132 cent** | de 11e job, hoe duur ook |
| na 0182 | budget 30 cent + hoogstens één job overschot ≈ **43 cent** | de 3e maximale job |

📏 Beide met de hand nagemeten op de lokale stack met jobs à 13,2 cent, en
daarnaast de variant waarin het budget níét uit `limiet × voorschot` volgt maar
op 100 cent staat: die weigert pas bij de achtste. Dat verschil is de wijziging.

⚠️ **De overschrijding is begrensd op één job**, want de laatste job wordt
toegelaten op het voorschot en kan daarna duurder uitvallen. Dát is waarom
`ai_invoer_max()` en `MAX_TOKENS` ertoe doen: zonder die twee is de laatste
toegelaten job onbegrensd, en dan is dit budget een suggestie. De twee helften
van bevinding 4 dragen elkaar.

⚠️ **Een gewone gebruiker merkt er niets van, en dat is de eis en geen
bijvangst.** Het voorschot staat op 3 cent — de bovenkant van wat een normale job
kost, niet het gemiddelde — zodat een normale job precies één van de tien plekken
kost. Wie tien gewone jobs draait, houdt er tien. Wie tien máximale jobs draait,
krijgt er drie.

⚠️ **Het getal is een aanname en hoort her-ijkt te worden.** Zodra er honderd
echte jobs geboekt zijn, staat het antwoord in `ai_kosten_per_week()` en is het
één regel SQL. Bij 300 / 1500 kost een gewone ronde (≈2.500 tokens in, ≈1.200
uit) zo'n 2,5 cent, dus 3 cent zit vandaag net aan de bovenkant van normaal.

## 5. De melding noemt geen getal meer

`coach.daglimiet` zei *"Je hebt vandaag al {limiet} keer de Doelcoach gebruikt"*,
met het getal uit de database zodat de tekst niet de tweede plek werd waar het
plafond stond. Die reden is goed en hij staat overeind — maar het getal kan niet
blijven. Wie grote prompts stuurt, loopt bij drie jobs tegen dezelfde muur als
een ander bij tien; elk getal in die zin klopt dan voor de één en liegt tegen de
ander. Een terugvalwaarde (`?? 10`) zou dezelfde leugen zijn met een nettere
oorzaak.

Cent in de melding zetten is geen optie: dat is Quintens rekening en niet iets
waar een gebruiker mee lastiggevallen hoort te worden. Dus noemt de zin niets, en
geeft `vraag_ai_job()` bij `quota_reached` ook geen getal meer terug. Wie de
cijfers nodig heeft, roept `ai_verbruik()` aan — die is er precies voor, en
rapporteert sinds 0182 in dezelfde eenheid als de poort weegt.

## 6. De naad, en waarom de eerste versie van die test niets bewees

Twee correcte onderdelen die uit elkaar kunnen lopen: `ai_verbruik()` vertelt wat
er op is, `vraag_ai_job()` beslist. Zeggen ze niet hetzelfde, dan toont de app
ruimte die er niet is. Dat is exact het geval dat 0056 voor het getal 10 heeft
moeten opruimen toen het in twee functies stond — vandaar dat de bodemregel hier
in één functie staat (`ai_jobkosten_cent()`) en niet twee keer uitgeschreven is.

De test daarvoor toetst geen bedrag maar de **gelijkheid van de twee oordelen**
over een rij standen. Dat blijft kloppen als iemand het voorschot verzet; een
test op "30" zou dan rood worden zonder dat er iets stuk is.

⚠️ **En hij was in eerste opzet waardeloos.** De vier standen waren
`[0, null]`, `[3, 1]`, `[3, 8.8]` en `[10, 0]` — en in álle vier zijn een
cent-poort en een rijen-poort het toevallig eens. Met de hand de poort teruggezet
naar `count(*)` terwijl de meter cent bleef tellen: de test bleef groen. Pas met
`[4, 8.8]` erbij — de meter zegt "op" (35,2 ≥ 30), een rijen-poort zegt "nog
ruimte" (4 < 10) — wordt hij rood. Onwrikbare regel 18, vraag 3, in zijn zuiverste
vorm: *kan deze test groen blijven terwijl de belofte breekt?*

## 7. Het tweede slot op `ai_jobs`, en waarom het niet meetelt

De poort weegt wat er geboekt is, en de enige die boekt is de Edge Function. Mag
een gebruiker `cost_cents` zelf zetten, dan zet hij hem op nul en is er geen
grens meer. Bij het ijken van dat geval — met de hand een `grant update
(cost_cents)` én een UPDATE-policy erop — kwam de update er nog steeds niet door:

```
permission denied for function ai_invoer_max
```

De CHECK `ai_jobs_input_len` roept die functie aan en die is voor `authenticated`
ingetrokken, dus élke schrijfpoging op deze tabel valt om op de CHECK, ongeacht
de kolomrechten. Meegenomen, maar het is **niet** het slot waar de test over
gaat: het verdwijnt zodra iemand `ai_invoer_max()` uitdeelt, en dan staat het
budget alleen nog op de ontbrekende grant.

⚠️ Voor de ijking betekende het dat er twee grendels tegelijk weg moesten om iets
te bewijzen. Dat is de vorm die CLAUDE.md benoemt: *een ijking die zijn geval door
een pad voert dat een éérdere grendel al afvangt, bewaakt niets van wat hij
belooft.*

## 8. Wat er onderweg boven water kwam: `keten:controle` las prosa als code

`npm run keten:controle` haalde `comment on function … is '…';` uit de romp met
`[^;]*;`. Dat stopt bij de **eerste** puntkomma — óók een die binnen de tekst
staat. De rest van de zin bleef staan, en elke functienaam mét haakjes die daarin
genoemd werd, heette daarna aangeroepen.

Gevonden doordat één nieuwe comment-regel in 0182 een puntkomma bevatte en
`ai_verbruik()` daardoor opeens "levend" was. Met de reparatie erin meldde de
controle twee functies die er al maanden onder zaten:

| Functie | Wat het is | Aanroeper |
|---|---|---|
| `realtime_bewaking()` (0027) | de grendel onder het `REPLICA IDENTITY FULL`-verbod | `tests/rls/epic7.test.ts`, `tests/rls/epic13.test.ts` |
| `systeembericht_allowlist()` (0026) | de CHECK-waarden van `chat_messages_system_event_bekend` | `tests/rls/epic7.test.ts`, `tests/rls/definer-aanroepertoets.test.ts` |

Allebei bewakingen met een aanroeper in `tests/`, dus ze horen op
`BEWAAKT_BUITEN_DE_APP` — mét reden, zoals de andere. Het punt is niet dat er iets
kapot was; het punt is dat ze **niet op die lijst stonden omdat de controle ze
levend noemde**, en dat is dezelfde klasse als het commentaargat van 28-08.

De reparatie zoekt de afsluitende puntkomma buiten tekstliteralen
(`eindeVanStatement()`), en geldt nu voor élk `comment on` en niet alleen die op
een functie — een toelichting op een tabel, kolom, constraint of policy is net zo
min een aanroep, en die vier stonden niet in het patroon.

⚠️ Drie ijkingen, één per grendel, allemaal met de hand rood gemaakt: de
tekstblinde puntkomma (5 rood), het nooit stoppen bij de puntkomma (5 rood, en
dáár valt de "aanroep ná een comment telt gewoon"-kant om), en het patroon terug
naar alleen `comment on function` (1 rood).

## 9. De prijs die verlopen was

⚠️ **`PRIJS_PER_MTOK_CENT` in `doelcoach/index.ts` stond nog op de
introductieprijs.** Het commentaar erboven zei het zelf: de introductieprijs van
Sonnet 5 liep tot en met **31-08-2026** en wordt daarna 300 / 1500 — *"Zet dat
dan hier om."* Op 06-09 stond hij nog op 200 / 1000. Zes dagen lang zou elke
`cost_cents` ongeveer een derde te laag geboekt zijn.

📏 Praktisch gevolg vandaag: **nul.** `ai_jobs` bevat drie rijen, alle drie
`failed`, geen enkele met een bedrag. Er is niets fout geboekt.

De constante staat nu op 300 / 1500, en de bedragen in dit document en in de kop
van 0182 zijn daarop herrekend. Dat is geen detail: een budget in cent is precies
zo goed als de prijs waarmee die cent geboekt wordt.

⚠️ **Een datum in een commentaarregel is geen grendel.** Dat is de les die blijft
staan, en het is dezelfde vorm als de zin over een grant uit QS8-293: een
uitspraak die waar was toen hij geschreven werd, die vanzelf onwaar wordt, en
waar niets rood van gaat. Er staat een rij over in `docs/ENGINEER-REVIEW.md`.

## 10. Twee sessies, één issue — en wat er van beide in zit

Dit issue is op 06-09 door twee sessies tegelijk gebouwd, de vierde keer op één
dag. `npm run claim` bestaat sinds QS8-294 precies hiervoor, maar de andere
sessie was al begonnen voordat de claim op de remote stond: **een claim werkt
alleen vooraf.**

Beide versies waren af. Ze zijn naast elkaar gemeten op dezelfde lokale stack, met
jobs van 13,2 cent — en dat is de enige reden dat er hier iets te kiezen viel in
plaats van te betogen:

| | poort weigert bij | plafond/dag | tien jobs zonder bedrag |
|---|---|---|---|
| twee poorten: `count(*) >= 10` én `sum(cost_cents) >= 100` | 8e maximale job | ≈119 cent | glijden langs het budget, gestopt door de telling |
| één poort in cent, met het voorschot als bodem | 3e maximale job | ≈43 cent | gestopt door het budget zelf |

Wat er uit de andere versie is overgenomen: **de prijsreparatie** (§9) — die was
daar wél gedaan en hier bewust uitgesteld, en het bleek de betere keuze omdat de
code zelf het nieuwe getal noemde. Wat er níét in zit: de tweede poort. De reden
is niet dat twee grenzen slecht zijn maar dat ze hier hetzelfde meten in twee
eenheden, en dat de telling dan de bindende blijft — precies wat dit issue moest
weghalen. Zonder bodem telt een job zonder bedrag voor nul, en dat is de helft
van het probleem.

⚠️ **Eén getal blijft een vraag voor Quinten en niet voor Claude:** hoeveel mag
één gebruiker per dag kosten? 30 cent (hier) of 100 cent (de andere versie)
scheelt een factor drie in de rekening en drie tegen acht maximale jobs voor een
zware gebruiker. Dat raakt grens 1 van de beslisbevoegdheid — wat er in rekening
gebracht wordt — dus staat hier de behoedzame kant, en is het één regel SQL om
hem te verzetten.

## 11. Wat de security-review erbij vond, en waarom het blokkerend was

Twee gaten, allebei zelf nagemeten en allebei in deze ronde gedicht. Ze staan hier
apart omdat ze samen het patroon dragen: **de poort was goed en de omgeving niet.**

### 11a. Het budget was met drie gewone verzoeken terug te zetten

`ai_jobs.goal_id` droeg `on delete cascade` naar `goals` — sinds 0001, en
ongewijzigd op productie (`pg_get_constraintdef` nagemeten). `verwijder_doel()` is
`security definer` met `execute` voor `authenticated`, en weigert bij een
groepskoppeling, weekdoelen, punten, een lopend commitment of een doel ouder dan
`bedenktijd()`. Een vers doel met alléén AI-jobs eronder voldoet aan alle vijf.

📏 En de twee vensters sluiten exact op elkaar aan: `bedenktijd()` is **24 uur** en
het quotum telt over `now() - interval '1 day'`. Élke job die meetelt hing dus aan
een doel dat nog verwijderbaar was. Doel maken → quotum opmaken → doel weggooien →
opnieuw. Onbeperkt, want er staat geen grens op het aantal doelen.

De reparatie is `on delete set null`. Het doel mág weg — dat is een bestaande
belofte uit 0058 — maar de rekening blijft staan. De kolom was al nullable en
`plan`-jobs staan er sinds 0136 al op NULL, dus het is geen nieuwe toestand.

⚠️ **Dit is regel 18 vraag 5 in zuivere vorm.** Elk schakeltje was af: de poort
telde goed, `cost_cents` zat dicht, de tests waren groen. De keten liep toch rond,
langs een knop die niets met de Doelcoach te maken heeft. Er was geen test die
vroeg of de rijen kúnnen verdwijnen — alleen of ze te wijzigen waren.

### 11b. De poort was te racen, en de kop beweerde het tegendeel

Lezen en schrijven staan in twee stappen. PostgREST geeft elk HTTP-verzoek zijn
eigen transactie, dus gelijktijdige verzoeken zien allemaal hetzelfde oude getal.

📏 Gemeten met twintig parallelle aanvragen op een leeg venster: **13 tot 14
toegelaten waar er 10 passen**, drie runs achter elkaar. Bij vijftig verbindingen
is het budget vijftig keer zo groot.

Dat was géén regressie — de `count(*)`-poort van vóór 0182 was even raceable —
maar het ís de belofte die deze wijziging doet, en de eerste versie van de
migratiekop en van §3 hierboven zei letterlijk dat een burst er niet langs kwam.
**Een verkeerde geruststelling in de documentatie is erger dan geen
geruststelling**, want de volgende lezer bouwt erop verder. De zin is rechtgezet
en het slot is er nu: `pg_advisory_xact_lock` op de gehashte `auth.uid()`, per
gebruiker, vrijvallend bij commit.

⚠️ Opvallend genoeg benoemde de concurrerende implementatie (§10) deze race
expliciet — en hield er de telling voor aan, wat hem niet oplost maar wel begrenst.
Hier is hij opgelost.

### 11c. Wat er niet gerepareerd is, maar wel is opgeschreven

- **Een storing verbrandt het dagbudget en de melding beweert het omgekeerde.**
  Een `failed` job kost het voorschot — bedoeld, want een afgebroken call is al
  betaald. Maar tijdens een storing als QS8-195 verbrandt een gebruiker zijn hele
  dag aan mislukkingen en leest daarna "De Doelcoach heeft vandaag genoeg voor je
  gedaan". Dat is onwaar op het moment dat het het meest telt. En er is geen
  telemetrie: `quota_reached` is een geslaagde RPC, dus `reportError()` vuurt niet.
  Rij in `docs/ENGINEER-REVIEW.md`.
- **`ai_jobs` leunt op een ontbrekende grant en niet op een policy.** Er is één
  policy (`ai_jobs_select`); schrijven wordt tegengehouden doordat de rechten er
  niet zijn. Dat is de bewuste vorm sinds 0118, maar één `grant` in een latere
  migratie opent de deur zonder dat een policy hem dichthoudt. Vastgelegd met een
  test in plaats van met een policy: `ai-budget.test.ts` legt de afwezigheid van
  INSERT, UPDATE en DELETE vast via `schrijfrechten_bewaking()`, en die test is
  met de hand rood gemaakt door de grant te zetten.
- **`ai_verbruik()` heeft in `database.types.ts` het type `Json`.** De sleutels
  zijn hernoemd en geen typecheck vangt dat. Vandaag ongevaarlijk — de app leest
  hem nergens — maar zodra er een scherm komt is dit een stille breuk.
