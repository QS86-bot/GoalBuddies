# Het schild en de poort eronder — twee clausules, één klok, en één die blijft staan

**Datum:** 18-09-2026
**Issue:** QS8-533 · **Migratie:** `0290` · **Vervolg:** QS8-548
**Status:** besloten en gebouwd

## Wat er mis was

`maak_straffen_verschuldigd()` houdt een straf op `set` zolang er een open,
beslisbaar uitstelverzoek ligt en de streefdatum minder dan zeven dagen achter
ons is. Beide clausules mat hij aan `p_vandaag`:

```sql
and r.new_date    >= p_vandaag
...
and g.target_date >  p_vandaag - 7
```

`p_vandaag` komt van buiten de database — `localDateIn(profiel.tz, nu)` in
`supabase/functions/rollover/index.ts`. Dat is de **levende** `profiles.tz`, en
📏 `has_column_privilege('authenticated','public.profiles','tz','UPDATE')` is
`t`. De gestrafte zette dus zelf de klok waaraan zijn eigen uitstel gemeten
wordt.

📏 Gemeten op 18-09-2026 op de lokale stack, tegen `pg_get_functiondef()` en niet
tegen een migratiebestand. Straf `set`, `created_at` dertig dagen oud, en als
énige variabele de `profiles.tz` ná het aangaan — de zone wordt dus eerlijk
bevroren en het profiel verhuist daarna. `vandaag` telt in de zone bij aangaan:

| streefdatum | zone bij aangaan | zone daarna | met verzoek | zonder verzoek |
| --- | --- | --- | --- | --- |
| `vandaag − 8` | `UTC` | `UTC` | 1 | 1 |
| `vandaag − 8` | Kiritimati | Midway | 1 | 1 |
| `vandaag − 7` | `UTC` | `UTC` | **1** | 1 |
| `vandaag − 7` | Kiritimati | Midway | **0** | 1 |
| `vandaag − 6` | `UTC` | `UTC` | 0 | 1 |
| `vandaag − 6` | Kiritimati | Midway | 0 | 1 |

De twee vetgedrukte rijen zijn het gat: één westwaartse sprong koopt een dag.
De rechterkolom is de toerekening en is zelf gemeten — zonder verzoek wordt
diezelfde straf op `vandaag − 7` gewoon verschuldigd, ook in de
aanvalsopstelling. Het is dus écht de schildclausule en niets anders.

⚠️ **Eén dag met dit paar, twee met een ander — en die nuance stond hier eerst
fout.** Er stond dat Kiritimati↔Midway in het drie-datumsvenster van QS8-530
(10:00–11:59 UTC) twee dagen scheelt. 📏 Uur voor uur nagemeten: dat paar is
alleen van **10:00 tot 10:59** twee dagen uit elkaar. Voor het hele venster heb
je `Etc/GMT+12` als westpool nodig (26 uur in plaats van 25). De bovengrens van
twee dagen klopt dus, de duur was een factor twee overdreven, en een aanvaller
zou `Etc/GMT+12` kiezen en geen Midway. De toetsen leunen hier niet op: die
claimen alleen dat twee zones méér dan 24 uur uit elkaar nooit op dezelfde datum
staan, en dat is waar.

## De tweede helft is een naad die `0288` zelf openliet

`0288` verzette de verlooppoort van `beslis_deadline_verzoek()` naar
`doeldatum()` en liet `r.new_date >= p_vandaag` staan. Die twee stellen dezelfde
vraag — *is dit verzoek nog te beslissen* — en konden vanaf dat moment uit elkaar
lopen.

📏 Gemeten, straf aangegaan in `Pacific/Kiritimati`, profiel daarna naar
`Pacific/Midway`, `new_date` = de levende dag van de aanvrager:

```
bevroren zone Kiritimati -> doeldatum  2026-09-18
levende zone Midway      -> p_vandaag  2026-09-17
new_date 2026-09-17, dus new_date >= p_vandaag
rollover           -> verschuldigd = 0, de straf blijft op `set`
de buddy beslist   -> {"ok": false, "reason": "verzoek_verlopen"}
```

⚠️⚠️ Dat is precies wat `0175` verbiedt. Die migratie heet *"een verzoek dat
niemand kan beslissen is geen verzoek"* en voegde de clausule toe die eist dat er
een buddy ís die erover mag gaan. Een verzoek dat wél een buddy heeft maar dat
die buddy alleen kan afwijzen, schermt een straf af zonder dat er iets te
beslissen valt. De regel bestond; de klok eronder liep weg.

**De les is niet "0288 was onvolledig" maar waar dat soort onvolledigheid
vandaan komt.** `0288` verzette één kant van een vraag die op drie plekken
gesteld wordt, en de twee andere plekken staan in een ándere functie in een
ánder bestand. Wat een naad zichtbaar maakt is niet de zorgvuldigheid van de
schrijver maar dat de vraag één naam heeft. Sinds `0290` heeft ze die:
`doeldatum()`, aangeroepen door alle drie.

## Het besluit

⚠️ **Grens 1 — besluit van Quinten (17-09-2026): bevriezen op `commitments.tz`.**
Hetzelfde besluit als bij `0280` en `0288`, en met dezelfde motivering: het is de
enige van de drie opties die niemands belofte verandert — je houdt precies de
coulance die je had toen je je vastlegde. Quinten koos er tegelijk voor QS8-531
en QS8-533 **apart** te laten landen.

⚠️⚠️ **Hier stond eerst "en je kunt hem achteraf niet meer verschuiven", en die
zin is op 17-09 al twee keer doorgestreept** — in de kop van `0288` en in
`docs/decisions/2026-09-17-de-poort-en-de-klok-eronder.md`. Hij stond hier
opnieuw, in de eerste versie van dít document, en de security-ronde op deze
branch haalde hem er weer uit. **Dat is precies de vorm waar CLAUDE.md voor
waarschuwt: een afwijking die je onderbouwt is duurder dan een die je vergeet.**
Een geruststelling die niet klopt leest de volgende persoon als een reden om er
niet aan te twijfelen — en de volgende persoon kan ik over een maand zelf zijn.

Wat er werkelijk geldt: de bevroren zone van een **bestaande** straf is niet te
verzetten, maar een straf is te **annuleren en opnieuw aan te gaan**, en dan
wordt de zone opnieuw bevroren. Dat is **QS8-536**.

⚠️⚠️ **En `0290` hangt een tweede beslissing aan die bevroren zone.** Tot deze
migratie droeg `commitments.tz` alleen de verlooppoort van
`beslis_deadline_verzoek()`; nu draagt hij óók het zevendaagse schild. Het
oppervlak van QS8-536 is daarmee verdubbeld, en dat staat in zijn rij in
`docs/ENGINEER-REVIEW.md`. 📏 Nagemeten tegen het **nieuwe** schild: de wissel
koopt precies één dag, en op dag acht valt de straf alsnog om.

⚠️ **Geen verruiming, wel een verplaatsing.** Vóór `0290` kocht diezelfde dag met
één `PATCH` op `profiles.tz` — zonder voorbereiding en zonder spoor. Nu kost hij
een annulering, en die staat als `cancelled` plus `confirmed` in
`commitment_events`. `0290` maakt de goedkope route duur en laat de dure staan.
De route staat als toets in
`tests/rls/het-schild-meet-aan-de-bevroren-strafklok.test.ts`, met dezelfde
faalmelding als de QS8-548-toets: wordt hij rood, dan is het issue af en hoort
hij omgedraaid te worden.

Beide clausules gaan daarom naar `doeldatum(g.id, g.owner_id)`.

⚠️ `doeldatum()` geeft hier altijd de bevroren klok en nooit zijn terugval, en
dat is een eigenschap van déze query en niet van die functie: de rij die
bijgewerkt wordt ís een straf met `status = 'set'`, en dat is een van de
statussen waar `doeldatum()` zijn `max()` over neemt. 📏 `commitments.tz` is NOT
NULL. Allebei die aannames staan als toets vast in
`tests/rls/het-schild-meet-aan-de-bevroren-strafklok.test.ts` — ze zijn het soort
aanname dat stil verschuift.

⚠️ **De aanval slaat hierna de andere kant op.** Het schild rekent door op de
zone waarin de straf is aangegaan, en die staat na een westwaartse sprong
oostelijker dan de levende. De straf die op `vandaag − 7` afgaat, gaat daarmee af
op `levende dag − 6`. Dat volgt uit de tabel hierboven en is geen tweede meting.

## Wat deze migratie erbij repareert, en wat ze kost

Allebei de kanten van die ene dag zijn gemeten, en allebei horen ze bij het
besluit — niet alleen de kant die goed uitkomt.

**Erbij gerepareerd: een straf die te vroeg afging.** 📏 Eerlijke verhuizing naar
het **oosten** (straf aangegaan in Midway, profiel nu Kiritimati), streefdatum
zes dagen terug, geldig open uitstelverzoek:

| | `verschuldigd` | straf | `commitment_due` in de groep |
| --- | --- | --- | --- |
| zonder `0290` | 1 | `due` | **1** |
| met `0290` | 0 | `set` | 0 |

Die persoon deed niets fout en kreeg zijn straf verschuldigd terwijl zijn schild
in de bevroren zone nog liep. Dat is *te vroeg*, en dat is volgens
`rollover/index.ts` zelf het enige dat hier niet mag. Het stond niet in de
bevinding en is winst.

**De prijs: hetzelfde bericht, één dag eerder, voor de spiegelbeeldige
verhuizer.** 📏 Eerlijke verhuizing naar het **westen**, streefdatum zeven dagen
terug in de bevroren zone, geldig open verzoek:

| | `verschuldigd` | straf | `commitment_due` | ná goedkeuring door de buddy |
| --- | --- | --- | --- | --- |
| zonder `0290` | 0 | `set` | 0 | straf `set`, 0 berichten |
| met `0290` | 1 | `due` | **1** | straf terug op `set`, **1** bericht |

⚠️⚠️ **Het bericht is de prijs en niet de status.** `meld_commitment()` plaatst
bij `set → due` een `commitment_due` in de begunstigde groep, en dat blijft staan
ook nadat de buddy het verzoek toewijst en de straf terugvalt op `set` — een
onveranderlijke kopie die de autorisatie overleeft waaronder hij gemaakt is
(domeinregel 7 §3). De QS8-531-rij noteerde dat al: *"de teruggang naar `set` is
stil, en dan is de groep het enige dat het verschil zag."*

De ruil is dus niet "één dag coulance" maar "één dag coulance plus een permanent
groepszichtbaar bericht dat er een straf verschuldigd werd". ⚠️ Dat is nog steeds
verdedigbaar — 📏 een eerlijke niet-verhuizer krijgt op dag zeven exact hetzelfde
bericht, gemeten — maar het hoort in de afweging te staan en niet erbuiten, want
het is een groepszichtbaar gevolg van een besluit over een commitment device.

## Wat er bewust blijft staan: QS8-548

De regel erboven meet aan diezelfde levende klok en is níet meeverhuisd:

```sql
and g.target_date < p_vandaag
```

📏 Gemeten in dezelfde reeks, zonder enig uitstelverzoek, streefdatum één dag vóór
de dag van het aangaan:

| zone bij aangaan | zone daarna | `verschuldigd` |
| --- | --- | --- |
| `UTC` | `UTC` | 1 |
| Kiritimati | Midway | **0** |

Een gat van dezelfde klasse, één regel hoger, en het staat als **QS8-548** open.
Drie redenen om het daar te laten:

1. Het is een andere bevinding dan die van QS8-533, en dit project doet één
   branch per Linear-issue.
2. Het verandert **wanneer elke bestaande straf afgaat** en niet alleen hoe lang
   een uitstel standhoudt. Dat is grens 1 van de *Beslisbevoegdheid* — een
   besluit van Quinten, net als `0280` en `0288` dat waren.
3. `rollover/index.ts` draagt een uitgeschreven reden waarom juist díe datum van
   de gebruiker komt: *"te vroeg is precies het enige dat hier niet mag"*. Die
   reden is een argument tégen verhuizen, en hij klopt voor een sprong naar het
   oosten. Hij zwijgt over een sprong naar het westen. Dat is een afweging om te
   maken, geen omissie om en passant te repareren.

⚠️⚠️ **Een bewust opengelaten gat is gevaarlijker dan een onbekend gat, want de
migratie eromheen leest als een reparatie.** Daarom staat het op vier plekken
met zijn meting: in de kop van `0290`, in de comment in `rollover/index.ts`, in
het issue, en — als enige van de vier die rood wordt — als **toets**:

> `stelt het verschuldigd worden zélf nog wél uit — QS8-548, en dat is nog geen belofte`

Die toets legt het gat vast in plaats van de belofte. Hij wordt rood zodra
iemand die regel verzet; dan is QS8-548 af en hoort de toets **omgedraaid** te
worden, niet weggehaald. Dat staat er ook in de faalmelding, want een toets die
je moet omdraaien is precies het soort toets dat iemand weghaalt.

⚠️ Wat `0290` er wél aan doet: de twee clausules tellen niet meer op. Vóór `0290`
verschoof één westwaartse sprong allebei de grenzen dezelfde kant op; erna staat
het schild vast en blijft alleen de bovenste regel over.

## Wat `p_vandaag` hierna nog doet

Hij draagt de bovenste regel en de null-poort, en hij blijft dus een parameter
met werk. Daarom verandert de handtekening niet en hoeft
`supabase/functions/rollover/index.ts` niet mee — er is geen volgorde van
uitrollen waarin de gedeployde rollover en deze functie elkaar mislopen. Dat is
hier niet cosmetisch: 📏 de Edge Functions op productie lopen achter op `main`
(QS8-243), dus een handtekeningwijziging zou een tijdvenster maken waarin de
rollover zijn eigen straffen niet meer kan afwikkelen.

⚠️ Verhuist QS8-548 die regel alsnog, dán heeft `p_vandaag` niets meer te doen en
hoort hij uit de handtekening — mét de volgorde van uitrollen in de kop. Dat
staat als criterium 3 in dat issue.

## De ijking

Elke grendel is met de hand gebroken en levert precies de toets op die hem noemt.
📏 Gemeten op 18-09-2026, telkens één mutatie op de gedeployde functie, suite
erna, en daarna teruggezet:

| mutatie | de toets die rood werd |
| --- | --- |
| `g.target_date > d.vandaag - 7` → `p_vandaag - 7` | *laat het schild vervallen op de zone waarin de straf is aangegaan*, plus *laat het schild staan voor wie eerlijk naar het oosten verhuisd is* en de QS8-536-toets |
| `r.new_date >= d.vandaag` → `p_vandaag` | *laat een verzoek dat de beslisser verlopen noemt geen straf afschermen* |
| `doeldatum()` zonder `'set'` in zijn statuslijst | *neemt `set` mee in de statussen waar `doeldatum()` zijn zone uit haalt* (plus de gedragstoetsen) |
| `doeldatum()` geeft `null` | *houdt `doeldatum()` onvoorwaardelijk niet-null* (plus zes gedragstoetsen — het schild verdwijnt volledig) |
| `doeldatum()` negeert de bevroren zone | *laat het schild vervallen…*, *laat het schild staan voor wie eerlijk naar het oosten verhuisd is* en de QS8-536-toets |
| `commitments.tz` nullable | *houdt `commitments.tz` NOT NULL* |
| het hele schild weggehaald | *houdt de straf tegen zolang het schild loopt* en *schermt de straf wél af zolang de beslisser het verzoek kan toewijzen* |
| `g.target_date < p_vandaag` → `d.vandaag` | *stelt het verschuldigd worden zélf nog wél uit — QS8-548* |

⚠️⚠️ **De vierde rij is de belangrijkste en stond er pas na de security-ronde.**
📏 Geeft `doeldatum()` `null`, dan wordt `r.new_date >= null` niet onwaar maar
**onbekend**, levert de `not exists` geen rij op, wordt `not exists` dus `true` —
en verdwijnt het hele schild. Gemeten: `verschuldigd=1`, de straf op `due`, en
een `commitment_due` in de groep. Dat is **fail-open richting de straf**, de
enige richting die hier niet mag. Wat hem dichthoudt is de `current_date`-staart
van `doeldatum()`, en die staat in het register van `klokgrens:controle`
beschreven als *onbereikbaar* — precies het soort tak dat iemand opruimt.

⚠️ De laatste rij is de ijking van het gat en niet van de reparatie: hij toont dat
de QS8-548-toets werkelijk aan díe clausule hangt en niet toevallig groen is.

⚠️⚠️ **Eén paar toetsen vond zijn eigen fout in de opstelling en niet in de
code.** De eerste versie van de twee naadtoetsen zette de streefdatum één dag
terug in de zone bij aangaan, en dan strandt het geval op
`g.target_date < p_vandaag` — de clausule van QS8-548 — in plaats van op de naad.
Gevolg: de ene toets was **rood om de verkeerde reden** (`verschuldigd=0`, maar
van de verlooppoort) en de spiegel ernaast **groen om de verkeerde reden**
(hetzelfde nulletje, gelezen als "het schild hield tegen"). 📏 Twee dagen terug
meet wat er beloofd wordt; de reden staat bij de opstelling, want dit is het
soort detail dat bij de eerste refactor sneuvelt.

Dat is dezelfde les als bij QS8-412: **kijk wélke toets omvalt en waaróm, niet
dát er een omvalt.** Een suite met twee grendels achter elkaar kan een geval door
de eerste laten afvangen, en dan bewaakt de tweede niets van wat hij belooft.
