# Het AI-dagquotum kijkt ook naar wat een job kost

**QS8-296 — 06-09-2026. Migratie 0174.**

## 1. Wat er stond

Onwrikbare regel 6: *"Elke AI-call kost geld: cache, dedupliceer, quota per
gebruiker, log kosten per user-id."*

Alle vier stonden er. Ze raakten elkaar alleen niet. Gemeten in de gedeployde
functies:

```
ai_dag_limiet()  -> 10
de teller        -> count(*) from ai_jobs where user_id = auth.uid()
```

Tien jobs per dag, ongeacht hoe groot ze zijn. En `ai_jobs` droeg al
`input_tokens`, `output_tokens` én `cost_cents` — er werd per job vastgelegd wat
hij kostte, en de limiet keek er niet naar.

Wie tien maximale prompts stuurt, kost een veelvoud van wie er tien korte
stuurt. Op een gratis tier zonder uitgavenplafond is dat de kant waar het
misgaat: de rekening loopt op de tokens, niet op het aantal aanroepen.

## 2. ⚠️ Waarom de telling van tien blijft staan

Het issue vraagt om te tellen in centen *in plaats van* in rijen, en waarschuwt
voor twee eenheden naast elkaar — de tekstlengte-affaire (QS8-118), waar een
grens in codepunten en een teller in UTF-16-eenheden uit elkaar liepen.

**Ik heb het budget ernáást gezet en niet ervoor in de plaats.** Twee redenen,
allebei gemeten.

### 2a. Vervangen is een verslechtering op de misbruik-as

Een budget begrenst de rékening, niet het aantal aanroepen. Wie duizend
piepkleine, telkens net iets andere prompts stuurt, blijft ruim onder elk budget
en doet toch duizend HTTP-calls. De dedupe in `vraag_ai_job` vangt alleen
identieke invoer.

Rate limiting is onwrikbare regel 5, kostenbeheersing is regel 6. **Dat zijn twee
beloftes, geen twee eenheden voor dezelfde belofte** — en dat is precies het
verschil met QS8-118, waar één grens in twee eenheden geteld werd.

### 2b. En de telling ís de reservering — dit is de naad

`cost_cents` bestaat pas als een job **klaar** is. Toelating gebeurt als hij
**begint**. Daartussen staat een job op `queued` met `cost_cents = null`.

Een budget dat alleen `sum(cost_cents)` optelt is dus te racen: vuur er tien
tegelijk af en ze worden allemaal toegelaten, want op het moment van toelaten
heeft nog niets iets gekost. Dat is regel 18 vraag 1 in zijn zuiverste vorm — de
boekhouding en de toelating zijn twee momenten, en de belofte zit ertussen.

De telling van tien dekt precies dat gat. Er kunnen nooit meer dan tien jobs per
dag bestaan, in de lucht of afgerond, dus de maximale overschrijding is tien maal
wat één job hoogstens kost.

**De twee grenzen dekken elkaars blinde vlek.** Haal je de telling weg, dan is
het budget raceable; haal je het budget weg, dan zie je het verschil tussen groot
en klein niet. Er staat een test op die dat vastlegt: tien lopende jobs, met
`besteed_cent` op nul én de poort dicht.

## 3. Waar de 100 cent vandaan komt

Een beredeneerde keuze, geen meting — er zijn nog geen duizenden echte calls om
een verdeling uit te halen (QS8-187 telt er drie).

```
een maximale job (8000 tekens in, MAX_TOKENS uit) kost ~15 cent
  -> het budget bindt na ~6 à 7 daarvan
een gewone job kost veel minder
  -> de telling van 10 bindt eerder
```

Dat is de bedoelde verdeling: **voor gewoon gebruik bindt de telling, voor duur
gebruik bindt het budget.** Zodra er echt verbruik is, hoort dit getal opnieuw
tegen `ai_kosten_per_week()` gelegd te worden.

## 4. ⚠️ De prijzen stonden zes dagen verkeerd

Bij het narekenen van die 15 cent liep ik tegen dit commentaar in
`supabase/functions/doelcoach/index.ts`:

> *"Peildatum 19-08-2026. Dit is de introductieprijs van Sonnet 5, die loopt tot
> en met 31-08-2026; daarna wordt het 300 / 1500. **Zet dat dan hier om.**"*

Vandaag is 06-09-2026. De constante stond nog op 200 / 1000, dus **elke
`cost_cents` van de afgelopen zes dagen is ongeveer de helft te laag geboekt.**

Dat is niet los te zien van dit issue: sinds 0174 hangt er een budget in centen
aan die getallen, en een prijs die te laag staat maakt dat budget stilzwijgend te
ruim. De constante is bijgewerkt naar 300 / 1500.

⚠️ **Een datum in een commentaarregel is geen grendel.** Dit is dezelfde vorm als
de zin over een grant uit QS8-293: een uitspraak die waar was toen hij geschreven
werd, die vanzelf onwaar wordt, en waar niets rood van gaat. Het verschil met een
grant is dat je hier niet kúnt meten of het klopt — de prijslijst staat niet in
dit systeem. Wat wél kan is de vervaldatum zichtbaar maken; dat staat als rij in
`docs/ENGINEER-REVIEW.md`.

⚠️ **De prijswijziging werkt pas na een deploy van de Edge Function**, en die
loopt via Quintens machine (zie het issue). Tot dat moment blijft productie in de
oude prijzen boeken en is het budget daar dus ruimer dan het hier lijkt.

## 5. De ijking

| Mutatie | Rood |
|---|---|
| de budgettak uit `vraag_ai_job` | *een dure job zet de poort dicht terwijl de telling nog ruimte heeft* |
| `ai_dag_budget_cent()` op 0 | *goedkope jobs komen er gewoon doorheen* (plus zes andere — een budget van nul maakt de Doelcoach stuk in plaats van begrensd, en dat hoort luid te falen) |
| de `coalesce` uit `ai_verbruik()` | *een job die nog draait telt niet als nul* en *het verbruik noemt het budget* |

⚠️ Die derde mutatie is de interessantste: zonder `coalesce` geeft `sum` over
uitsluitend nulls `null`, en dan verdwijnt `besteed_cent` zodra iemand één
lopende job heeft. In `vraag_ai_job` zou dezelfde fout erger uitpakken —
`null >= budget` is `null`, dus de tak zou stilzwijgend nooit vuren. Een grendel
die niet weigert maar ook niet klaagt.

## 6. Wat er niet in zit

**Een grens op de geschatte invoer vóór de aanroep** — het issue noemt die als
waarschijnlijk nodig. Die bestaat al: `ai_invoer_max()` (0120) weigert invoer
boven 8000 tekens, vóór de job wordt aangemaakt. Wat er níét is, is een schatting
van de *uitvoer*; die wordt begrensd door `MAX_TOKENS` in de Edge Function, en
dat is een harde grens van de API zelf. De invoerkant is daarmee gedekt en de
uitvoerkant heeft een plafond dat niet te overschrijden is.

**Een budget over meerdere dagen of over alle gebruikers samen.** Dit is een
grens per gebruiker per dag. Eén gebruiker kan dus nog steeds elke dag een euro
kosten, en honderd gebruikers honderd euro. Een plafond over het geheel hoort bij
het uitgavenplafond in het Supabase- en Anthropic-dashboard, en dat is
QS8-141 — een schakelaar die geen code is.
