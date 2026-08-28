# Bladeren met een waarde in plaats van een plek

**Datum:** 28-08-2026
**Aanleiding:** de dossierrij van 28-08 over `openstaande_beoordelingen()`
**Raakt:** migratie 0125, `src/modules/completions/approvals.ts`,
`app/beoordelen.tsx`, en twee nieuwe testbestanden

## 1. Wat er stond

`openstaande_beoordelingen()` pagineerde met `limit`/`offset` op `submitted_at`
oplopend. Dat is dezelfde fout als 0121 bij `weekafsluiting_reacties()`, maar met
een aanleiding die veel vaker voorkomt.

⚠️ **Bij de reacties moest iemand ánders iets verwijderen. Hier haalt goedkeuren
de rij uit de lijst, en goedkeuren is precies waar dit scherm voor is.** De
gebruiker duwt de rijen dus zelf omhoog door te doen wat er van hem gevraagd
wordt.

## 2. Aangetoond, niet beredeneerd

Gemeten met vier wachtende beoordelingen en `p_limit = 2`, tegen de échte
0111-functie op een draaiende database, met dezelfde fixture als de nieuwe test:

```
pagina 1 (offset 0):  Bladerproef 1, Bladerproef 2
beoordeling 1 wordt goedgekeurd   ← de knop op dit scherm
pagina 2 (offset 2):  Bladerproef 4
OVERGESLAGEN: 1
```

**Bladerproef 3 komt pas terug als je het scherm opnieuw opent.** Dat is een
buddy die op zijn oordeel wacht en het niet krijgt: geen foutmelding, en een
lijst die er compleet uitziet. De succesmetriek van de PRD is ≥80% binnen 48 uur.

⚠️ **Een eerste poging om dit ná te bouwen mislukte, en dat is het opschrijven
waard.** Ik heb eerst een "offset-emulatie" in de nieuwe functie geschreven om de
fout te reproduceren; die telde over de verkeerde verzameling en gaf nul
overgeslagen rijen. **De emulatie bewees niets en zag er groen uit.** Pas door de
échte 0111-functie terug te zetten en de échte fixture te gebruiken kwam het
getal. Bouw een bug na met het origineel, niet met een schets ervan.

## 3. De vorm

Cursor op `(submitted_at, id)`, dezelfde twee kolommen in dezelfde richting als
de `order by` — de vorm van `groepschat()` en 0121. `completions.submitted_at` is
`not null` (0001) en `id` is de primaire sleutel, dus samen zijn ze een totale
ordening: er kan geen rij permanent achter de cursor blijven hangen.

**Een cursor is een wáárde en geen plek.** De rij waar hij naar wijst mag
verdwijnen; `(submitted_at, id) >` blijft een geldige vergelijking. Dat is
precies wat een `offset` niet kan.

## 4. `total_open` moest anders, en anders dan bij 0121

Het was `count(*) over ()`, en dat telt met een cursorfilter erop nog maar de
rijen ná de cursor. 0121 loste dat op met een losse scalaire subquery. **Dat kan
hier niet zonder de hele `where` inclusief twee laterals te herhalen** — en een
tweede kopie van een autorisatievoorwaarde is precies de naad waar regel 18 over
gaat: twee plekken die hetzelfde moeten zeggen en het een keer niet doen.

Vandaar een CTE. De verzameling staat één keer beschreven, de teller telt hem
helemaal, de cursor knipt er een pagina uit.

⚠️ **`materialized` staat er met opzet.** Zonder dat woord mag Postgres de CTE
twee keer uitvoeren — één keer voor de teller en één keer voor de pagina — en dan
kost elke pagina twee volledige scans in plaats van één. Met `offset` was dit één
scan, en een paginering die het aantal query's verdubbelt is geen reparatie.

⚠️ **Dit getal is niet cosmetisch.** `app/(tabs)/groep.tsx` toont er de kaart "er
wachten er N op jou" mee, en dat is de enige plek waar een gebruiker ziet dát er
iets op hem wacht.

## 5. Het scherm: een stapel en geen paginanummer

Dit scherm heeft *Vorige* én *Meer laden*, en een cursor is vooruit-alleen. De
oplossing is een stapel: `null` op plek 0 is de eerste pagina, doorbladeren duwt
de cursor van de laatste rij erop, *Vorige* haalt er een af.

⚠️ **En herladen na een oordeel is nu stabiel.** Het scherm herlaadt zichzelf na
elke beoordeling. Met een `offset` schoof de lijst dan onder de plek door; met
een cursor wijst hij naar een waarde die niet verschuift.

## 6. Twee dingen die de tests vonden en het lezen niet

**a. De hele unitsuite bleef groen bij een omgegooid pagineringscontract.** Van
`p_offset` naar een cursor, en `meer` van een rekensom naar "er kwam een volle
pagina terug" — 1280 van 1280 groen. Er was niets dat de clientkant van deze
lijst raakte. Vandaar `src/modules/completions/beoordelingen-bladeren.test.ts`:
dat toetst de náád, niet de SQL.

**b. Mijn eigen `volgendeCursor()` bevatte de lus die hij moest voorkomen.** De
eerste versie zocht terug naar de laatste rij mét beide waarden. Een onleesbare
laatste rij zou dan buiten de cursor vallen, bij de volgende pagina wéér
meekomen, weer wegvallen — en je blijft "meer laden" indrukken op dezelfde
pagina. **De test ving hem bij de eerste run**, en het commentaar erboven legde
op dat moment precies uit waaróm dat niet mocht.

De reparatie kijkt naar de láátste rij en niet naar de laatste bruikbare. Twee
van de vier eisen van `naarTeBeoordelen()` gaan niet over de cursorkolommen, dus
een rij die om een andere reden afvalt levert nog steeds een geldige cursor. Kan
de laatste rij zélf geen cursor leveren, dan is er geen cursor en stopt het
bladeren — doorgaan zou betekenen dat je gokt waar je bent.

**c. Een RPC-parameter die niet bestaat komt door typecheck heen.** `p_offset: 0`
in `tests/rls/besluiten.test.ts` compileerde probleemloos en viel pas om bij het
draaien, met `PGRST202`. Dat is de openstaande dossierrij van 28-08, hier
opnieuw bevestigd. De client zelf is er nu wél tegen beschermd: het gegenereerde
type kent de nieuwe parameternamen, en daarom gaan ze bij "geen cursor" er
hélemaal áf in plaats van als `null` mee.

## 7. IJking

Vier RLS-tests, en elke grendel is met de hand gebroken:

| Wat kapot ging | Wat rood werd |
|---|---|
| de cursor slaat een rij over | *slaat niemand over als er tussen twee bladerslagen iets goedgekeurd wordt* |
| `total_open` terug naar `count(*) over ()` | *houdt total_open gelijk op elke pagina* |
| `or p_na_id is null` weg | *behandelt een half ingevulde cursor als geen cursor* |

⚠️ **De eerste poging van de derde mutatie beet niet**, en dat is dezelfde les als
gisteren bij `tekst:controle`: ik brak de éérste clausule van de OR-keten terwijl
de grendel in de twééde zat. De test bleef groen. **Mutatie per grendel, en
controleer dat de mutatie de grendel raakt die hij noemt.**

## 8. Wat er nog staat

Er was nog één `p_offset`-aanroeper: `group_overview()` via
`src/modules/buddies/api.ts`. Die heeft dezelfde vorm maar een andere kans:
leden verdwijnen niet uit een groepsoverzicht door iets dat de kijker zelf doet.
Hij staat als eigen rij in het dossier — één branch per issue.
