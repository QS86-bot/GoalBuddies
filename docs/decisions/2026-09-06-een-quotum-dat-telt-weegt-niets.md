# Een quotum dat telt, weegt niets

**06-09-2026 — QS8-296, migratie 0175**

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
uitvoer  MAX_TOKENS = 8.000 (doelcoach/index.ts), à 1000 cent/Mtok  → 8,0 cent
invoer   ai_invoer_max() = 8.000 codepunten + systeemprompt,
         ruim geschat 4.000 tokens, à 200 cent/Mtok                 → 0,8 cent
--------------------------------------------------------------------------
één job in het slechtste geval                                      ≈ 8,8 cent
```

Tien daarvan is **88 cent per gebruiker per dag**, en dat is wat het quotum
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

1. **Een `queued` of `running` job eet meteen budget.** Een burst van twintig
   jobs komt dus niet langs de poort, ook al is er nog van geen enkele een
   bedrag bekend.
2. **Een `failed` job houdt het voorschot.** Het commentaar in
   `doelcoach/index.ts` zegt het al: *"een call die halverwege afbreekt is al
   betaald."* Tot 0175 stond dat er als voornemen; nu telt het.
3. **Een job die op `cost_cents = 0` uitkomt, telt alsnog.** Dat gat is echt:
   `doelcoach/index.ts` doet `data.usage?.input_tokens ?? 0`, dus een antwoord
   zonder usage-blok boekt een gratis job. **Nul is geen bedrag maar een
   ontbrekend bedrag.**

Punt 3 is tegelijk de ijking die het issue zelf voorstelde: zet de kostenkolom op
nul en kijk of de limiet dan alsnog bijt. Hij bijt, en hij valt precies terug op
het gedrag van gisteren — tien jobs. Een meting die stukgaat, maakt het quotum
dus niet losser dan het was.

## 4. Wat dit met het plafond doet

|  | plafond per gebruiker per dag |
|---|---|
| vóór 0175 | 10 × 8,8 = **88 cent** |
| na 0175 | budget 30 cent + hoogstens één job overschot ≈ **39 cent** |

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
één regel SQL.

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
rapporteert sinds 0175 in dezelfde eenheid als de poort weegt.

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

Gevonden doordat één nieuwe comment-regel in 0175 een puntkomma bevatte en
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

## 9. Wat er níét in zit

⚠️ **`PRIJS_PER_MTOK_CENT` in `doelcoach/index.ts` is verlopen.** Het commentaar
erboven zegt met zoveel woorden dat de introductieprijs van Sonnet 5 tot en met
**31-08-2026** liep en dat het daarna 300 / 1500 wordt — *"Zet dat dan hier om."*
Vandaag is het 06-09. Elke `cost_cents` die na 31-08 geboekt wordt, is daarmee
ongeveer een derde te laag, en dit budget rekent in diezelfde te lage cent.

Niet in deze migratie meegenomen, en dat is een keuze met twee redenen: het
bedrag is van buiten dit project en hier niet te verifiëren, en `cost_cents` is
een boekhoudkundig feit — er een niet-geverifieerd getal in schrijven is erger dan
een getal dat aantoonbaar van 19-08 is. Bovendien vraagt het een deploy van de
Edge Function, en die loopt via Quintens machine. Staat als eigen issue en als rij
in `docs/ENGINEER-REVIEW.md`.

Het budget verandert er niet wezenlijk van: gaat de prijs omhoog, dan koopt 30
cent minder jobs — precies de kant die je wilt.
