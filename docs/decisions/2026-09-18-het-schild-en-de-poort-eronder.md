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
enige van de drie opties die niemands belofte verandert. Je houdt precies de
coulance die je had toen je je vastlegde, en je kunt hem achteraf niet meer
verschuiven. Quinten koos er tegelijk voor QS8-531 en QS8-533 **apart** te laten
landen.

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
| `g.target_date > d.vandaag - 7` → `p_vandaag - 7` | *laat het schild vervallen op de zone waarin de straf is aangegaan* |
| `r.new_date >= d.vandaag` → `p_vandaag` | *laat een verzoek dat de beslisser verlopen noemt geen straf afschermen* |
| `doeldatum()` zonder `'set'` in zijn statuslijst | *neemt `set` mee in de statussen waar `doeldatum()` zijn zone uit haalt* (plus de twee gedragstoetsen) |
| `commitments.tz` nullable | *houdt `commitments.tz` NOT NULL* |
| het hele schild weggehaald | *houdt de straf tegen zolang het schild loopt* en *schermt de straf wél af zolang de beslisser het verzoek kan toewijzen* |
| `g.target_date < p_vandaag` → `d.vandaag` | *stelt het verschuldigd worden zélf nog wél uit — QS8-548* |

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
