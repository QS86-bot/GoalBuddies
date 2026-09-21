# "Geen gat in 0280" is niet "geen gat"

**Datum:** 17-09-2026 · **Issue:** QS8-530, met QS8-531 en QS8-533 als vervolg
**Raakt:** `docs/ENGINEER-REVIEW.md` (de rijen van 17-09 en die van 06-09)

## Waar dit vandaan komt

QS8-529 heeft op 17-09-2026 de aanname onder de strafklok rechtgezet: de
spreiding over álle zones in `pg_timezone_names` is geen twee datums maar 26 uur
spanwijdte, en van 10:00 tot 12:00 UTC bestaan er drie datums tegelijk. De
bovengrens die een zonesprong oplevert is daarmee **twee** dagen en niet één.
Die analyse en de nieuwe toets staan in
`docs/decisions/2026-09-16-de-klok-die-de-gestrafte-zelf-zet.md`; dit document
herhaalt ze niet.

⚠️ **QS8-530 vond hetzelfde, een halfuur later en in een parallelle sessie.** De
claim kan dat niet zien: hij vergelijkt issuenummers en branchnamen, en dit
waren twee nummers voor één bevinding. Wat er van QS8-530 overblijft is niet de
analyse maar de security-ronde eroverheen — en die vond iets dat QS8-529 niet
vond.

## De zin waar het om gaat

Beide analyses eindigden op dezelfde geruststelling:

> Er is geen live gat: 0280 bevriest de klok bij het aangaan en neemt de
> bovengrens weg.

📏 Dat klopt, en het is nagemeten:
`has_column_privilege('authenticated','public.commitments','tz','UPDATE')` is
`false`, `bevries_commitmentzone()` werpt op elke wijziging, geen enkele functie
in `public` schrijft de kolom, en geen Edge Function raakt `commitments` aan.

**Maar het is een uitspraak over 0280, niet over de codebase.** `eigenaarsdatum()`
heeft meer aanroepers dan `wikkel_commitments_af()`, en die lezen de **levende**
`profiles.tz` — een kolom die in de UPDATE-kolomgrant van `authenticated` staat.
Op twee daarvan is de bovengrens wél dragend, en dat is met echte rijen tegen de
gedeployde functies gemeten en niet beredeneerd.

### 1. De verlooppoort van `beslis_deadline_verzoek()` — QS8-531

Straf op `due`, verzoek `open`, `new_date` twee dagen achter de oostelijke klok,
beslist door de goedkeurende buddy. Enige variabele: de zone van de **aanvrager**.

| `profiles.tz` van de aanvrager | uitkomst | straf |
|---|---|---|
| `Pacific/Kiritimati` (+14, eerlijk) | `verzoek_verlopen` | blijft `due` |
| `UTC` | `verzoek_verlopen` | blijft `due` |
| `Etc/GMT+12` (−12) | `ok: true, straffen_teruggezet: 1` | **`due` → `set`** |

⚠️⚠️ **En met een verzoek van één dag terug gaat `UTC` er óók doorheen.** Die
tweede meting is het belangrijkste getal van dit document: **de poort staat
vierentwintig uur per dag open met één dag bereik**, en het venster van twee uur
bepaalt alleen of het bereik één dag wordt of twee. Wie alleen de tweedaagse
variant meet, schrijft dit op als een randgeval van twee uur per dag — en dat is
het niet.

### 2. Het zevendaagse schild in `maak_straffen_verschuldigd()` — QS8-533

`p_vandaag` komt uit de rollover als `localDateIn(profiel.tz, nu)`, dus opnieuw de
levende zone. Straf `set`, `created_at` 30 dagen oud, één open onbeslist verzoek:

| `p_vandaag` | met open verzoek | zonder verzoek |
|---|---|---|
| `target_date + 8` | `verschuldigd=1` | `verschuldigd=1` |
| `target_date + 7` | `verschuldigd=1` | `verschuldigd=1` |
| `target_date + 6` | **`verschuldigd=0`** | `verschuldigd=1` |

⚠️ De rechterkolom is de toerekening, apart gemeten in plaats van aangenomen:
zónder dat open verzoek wordt de straf op `target + 6` gewoon verschuldigd. Het
is dus écht de clausule `g.target_date > p_vandaag - 7`.

## Het besluit

**Geen van beide is in QS8-530 gerepareerd, en dat is een keuze en geen omissie.**
Allebei veranderen ze wanneer een straf verschuldigd wordt, en dat is wat een
gebruiker als consequentie beloofd is: grens 1, besluit van Quinten. Precies de
reden waarom 0280 zelf een besluit van Quinten vroeg.

Wat er wél gebeurd is: ze staan met hun metingen als rij van 17-09-2026 in
`docs/ENGINEER-REVIEW.md`, en als QS8-531 en QS8-533 in Linear, met de drie
richtingen die voorliggen.

⚠️ **En de rij van 06-09-2026 is bijgewerkt, want die beschreef de bevinding als
de oplossing.** Er stond, over precies deze verlooppoort: *"gemeten aan
`eigenaarsdatum(requester_id)` en niet aan de dag van de goedkeurder"* — als het
antwoord. `requester_id` is de doeleigenaar, dus de gestrafte. Die rij stond op
**Laag** met als terugkeervoorwaarde *"zodra er een tweede plek komt die
`goals.target_date` schrijft"*, en de voorwaarde die hem werkelijk zwaarder
maakte stond er niet bij.

## Wat hieruit te leren valt

**Een geruststelling erft de reikwijdte van de meting eronder, niet die van de
zin.** "0280 neemt de bovengrens weg" is gemeten aan één functie; "er is geen
live gat" is een uitspraak over alle functies. Het verschil tussen die twee is
één woord en twee bevindingen.

⚠️ De praktische vorm daarvan is een vraag bij elke afsluitende zin in een
beslisdocument: **hoeveel aanroepers heeft het ding waar ik dit over zeg?**
`eigenaarsdatum()` heeft er meer dan één, en dat was met één `grep` te zien.

⚠️⚠️ **En de tweede les gaat over de meting zelf.** De tweedaagse variant van
bevinding 1 werkt maar twee uur per dag; de eendaagse werkt altijd. Wie na de
eerste meting stopt, schrijft een permanente poort op als een randgeval — dus
meet een geval dat je gevonden hebt ook één maat kleiner.
