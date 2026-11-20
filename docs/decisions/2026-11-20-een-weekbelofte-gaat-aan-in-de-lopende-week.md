# Een weekbelofte gaat aan in de lopende week — QS8-760

**Datum:** 20-11-2026 · **Issue:** QS8-760 (x.3 van de poort QS8-744) · **Migratie:** 0314 (niet op productie; wacht op
Quintens "backup gedaan", na 0312 en 0313) · **Raakt:** domeinregel 1, 5, 7 en 11, correctheidsregel 7, Beslisbevoegdheid
grens 1

Dit document vult `docs/decisions/2026-11-20-de-belofte-is-een-commitment-met-een-getuige.md` (sectie x.3) aan. Daar
staat het besluit en de splitsing. Hier staat wat de bouw van x.3 erbij moest kiezen, en waar ze bewust afwijkt van de
letter van het issue.

## Wat er gebouwd is

- `grant insert (periode_start)` aan `authenticated`; `periode_einde` blijft zonder grant (42501).
- `belofteperiode_klopt(start, startdag, tz, nu)`: de klokregel. Rekent geen cyclus uit (correctheidsregel 7) maar
  toetst één waarde die de client met `userCycle()` uitrekende: de weekdag is `week_start_day` en `nu` ligt in de zone
  van de eigenaar binnen `[start, start + 7)`. Security invoker, voor niemand uitvoerbaar dan `postgres`, zodat de suite
  hem met een vaste klok voedt en geen client een klok kan meegeven (de vorm van 0294 en `beslis_weekbeloftes()`).
- `bevries_belofteperiode()` (trigger `commitments_zone_belofteperiode`, BEFORE INSERT en BEFORE UPDATE van de
  periodekolommen, definer): zwijgt zonder JWT en voor wie niet de eigenaar is; toetst daarna de klok, zet
  `periode_einde`, weigert een belofte naast een doelstraf en andersom, en het plafond van 3.
- `weekbelofte_begunstigde_bekend(groep, getuige)` in `commitments_insert`: geen automatische groep, en een getuige
  deelt met de eigenaar een niet-automatische groep.
- Client: `isDoelstraf()` in `src/modules/commitments/stand.ts` voor de Straf-kaart en `Herplannen` op het
  doelscherm, en `periode_start` in elke `.select()` via `COMMITMENT_KOLOMMEN`.

## Keuzes

### 1. Het plafond en de uitsluiting staan in de trigger en niet in de policy

Het issue zette ze in `commitments_insert`. De spec-ronde vond twee redenen om ze in de trigger te zetten, en beide
zijn gemeten:

- **Gelijktijdigheid.** Twee sessies van dezelfde eigenaar met twee lopende beloftes, elk een belofte op een ander
  doel: zonder slot staan er daarna **4** op `set`, met het slot op de profielrij (`for no key update`) **3** en krijgt de
  tweede sessie de weigering. 📏 Gemeten op de lokale stack met twee parallelle `psql`-sessies.
- **Bulk.** PostgREST zet meerdere rijen in één statement. Een `volatile` rijtrigger ziet de eerder verwerkte rijen van
  dat statement; vier beloftes in één verzoek geven 23514 en er landt niets (`tests/rls/weekbelofte-aangaan.test.ts`).

Wat het issue met de plaats wilde, blijft gelden: **wie de rij niet mag schrijven, hoort er niets over.** Elke `raise`
staat ná de eigenaarstoets, en B met het `goal_id` van A krijgt in alle gevallen de 42501 van de policy. In de policy
staat alleen wat autorisatie is: de begunstigde.

Het slot op de profielrij serialiseert bovendien met het `for update` van `zet_week_startdag()`, dat sinds 0313 weigert
zolang er een belofte loopt. Zonder slot kon die wijziging tussen deze toets en de commit door.

### 2. "Een begunstigde is verplicht" staat niet in de policy

`bewaak_begunstigde()` (0168) eist het al, vóór de policy en ook voor `service_role`. Een conjunct daarachter is met de
hand niet rood te maken (regel 18 vraag 3). Criterium 5 is daarmee gedekt; de test laat beide weigercodes toe.

### 3. De getuige moet een bekende zijn — [AANNAME]

Het issue sluit een automatische groep als begunstigde uit (onbekenden, QS8-230). Een getuige die je alleen uit zo'n
groep kent, is dezelfde onbekende; anders loopt de regel via één getuige om. Alleen voor beloftes, fail-closed
geschreven. Strenger dan de letter, en dat is de conservatieve kant: het weigert een belofte en legt niemand iets op.

### 4. Een belofte op een doel met een verstreken streefdatum wordt geweigerd

De straftak van `commitments_insert` (`target_date >= mijn_datum()` en `status = 'active'`, 0170 en 0238) geldt ook voor
een belofte. De vraag stond op QS8-760 (reactie uit de security-ronde van x.1). Laten staan is de conservatieve
keuze: het weigert, het belooft niets. Een doel waarvan de streefdatum voorbij is, hoort eerst via het uitstelverzoek
een nieuwe datum te krijgen. Wil Quinten beloftes ook daar toestaan, dan is dat één conjunct.

### 5. De uitsluiting geldt tegen `set` én `due`, zoals het issue schrijft

Gevolg, en dat staat hier zodat niemand het als bijvangst ontdekt: na één gebroken belofte (`due`) kan op dat doel geen
doelstraf meer bij, en na een verschuldigde doelstraf geen belofte meer, want uit `due` kom je niet. Dat is strenger
dan nodig en het is de letter van het issue. Herbevestigen vóór x.4 het aanbod op het scherm zet.

### 6. Wat niet veranderd is, met opzet

- **Het venster na de week blijft open**, besluit van Quinten op QS8-760 (20-11): intrekken tot het verschuldigd wordt.
- **`body` blijft wijzigbaar zolang de belofte op `set` staat**, zoals bij elke straf (0057). Dat is de bedenktijd;
  bevriezen is een eigen besluit onder grens 1.
- **Geen teamgroep-grendel.** Er is nog geen organisatiekolom in de migraties. Dit is *niet toetsbaar tot QS8-649*,
  niet "uit".
- **De trigger zwijgt zonder JWT.** De suites zetten bewust weken in het verleden neer om 0313 te toetsen; de CHECK van
  0312 houdt de vorm voor `service_role`.

## De naad met de klok

De trigger heet `commitments_zone_belofteperiode` zodat hij alfabetisch ná `commitments_zone` vuurt: dan is `new.tz` al
de bevroren zone waarmee 0313 beslist, en meten aangaan en beslissen aan één klok. Staat `new.tz` toch leeg, dan faalt
hij luid. Het issue noemde "Auckland zondag 23:30 lokaal (in UTC nog zaterdag)"; dat klopt niet (NZDT is UTC+13, dus
zondag 10:30 UTC). De suite toetst het letterlijke geval én de twee gevallen waarin de dag wél verschilt, steeds met
`userCycle()` ernaast.

## Wat ongemeten is

- Of 0314 op productie (stand 0302) zonder botsing landt; hij hangt aan 0312 en 0313.
- `fetchCommitments()` heeft geen limiet (regel 10). Met 52 beloftes per doel per jaar groeit die lijst; dat hoort bij
  x.4, dat de lijst op het scherm zet.
