# De muur van de rollover is CPU-tijd en niet de wandklok

**Datum:** 18-11-2026 · **Issue:** QS8-697 · **Corrigeert:** `docs/decisions/2026-11-17-de-rollover-krijgt-een-budget-en-geen-muur.md` (QS8-685)

## Wat er gemeten is

📏 Run 556 van `rollover.yml`, 18-11-2026 08:32 UTC, met de hand gestart op `main` @ `7b566d9b`. Het ging om `rollover` **v26**; de bundel is byte-gelijk aan `main`, en de deploy deed Quinten.

| | |
| --- | --- |
| profielen verwerkt | **876** |
| looptijd | **63 s** (08:32:33 → 08:33:36) |
| per profiel, acht tegelijk | **0,072 s**, dus 6,2× sneller dan één tegelijk (0,45 s) |
| einde | `CPU Time exceeded` in `function_logs`, HTTP **546** `WORKER_RESOURCE_LIMIT` |
| werk ná de lus | niet gedraaid |

## Wat er in het vorige document niet klopte

Dat document rekende met de **wandkloklimiet** van 150 s en zette daar een tijdbudget van 100 s tegenover. Dat klopt, maar het was niet de muur die het eerst geraakt werd. De gratis tier begrenst ook de **CPU-tijd per aanroep**. Door de gelijktijdigheid gaat de functie sneller door zijn profielen, en raakt hij die grens nu al na 63 s.

Ook de schaalgrens uit dat document ("≈ 1.780 profielen per run") vervalt. Gemeten is: bij **876** profielen is de CPU op.

⚠️ De afkappingen van 16-11 (405 profielen na 192 s) en 17-11 (368 profielen na 162 s) toonden alleen `shutdown`, zonder reden. Of die ook op CPU vielen, is achteraf niet vast te stellen.

## Besluit

`verwerkBinnenBudget()` krijgt een optioneel **maximum aantal rijen** (`maxRijen`), naast het tijdbudget. De rollover zet het op **390** (`PROFIELEN_PER_RUN`).

* **Waarom een aantal:** CPU-tijd is vanuit de functie niet te meten, en het aantal profielen is wat er aan CPU kost, opgeteld.
* **Waarom 390:** minder dan de helft van de gemeten 876, en geen veelvoud van de paginagrootte (200). De helper leest de rij ná het maximum; bij 400 zou dat altijd een extra `select` zijn die bij een fout de hele run een 500 geeft (security-review).
* **Waarom die marge:** voor profielen met veel gemiste weken (meer verzoeken, dus meer CPU) en voor het werk erna.
* **Wat er met de rest gebeurt:** de willekeurige startplek van QS8-685 zorgt dat de volgende run anderen pakt, en `volledig: false` maakt de workflow rood.
* **De notificatiejob** gebruikt dezelfde helper zonder maximum en verandert niet. Of die dezelfde muur heeft, is niet gemeten. Sinds QS8-691 loopt hij alleen nog langs profielen met een push-token.

## De stand vandaag

Productie telt 1.332 profielen, waarvan 1.330 achtergebleven testaccounts (QS8-693). Tot die weg zijn, is elke run `volledig: false` en dus rood. Dat is eerlijk: er wachten (nep)profielen. Na de opruiming zijn het er 2.

⚠️ **Een willekeurige startplek garandeert geen dekking.** Elke run pakt een aaneengesloten boog van 390 profielen vanaf een willekeurig uuid, dus ≈ 29% per run, en niet gelijk verdeeld: wie na een groot gat in de uuid-ruimte staat, valt vaker in de boog. Na 4 runs is de verwachte dekking ≈ 76%; een profiel kan in zeldzame gevallen meer dan een dag wachten (≈ 0,7²⁴ per profiel). Dat is uitstel en geen verlies, want alles is idempotent en wordt later ingehaald. Alleen een cursor geeft een garantie (QS8-687). Berekend door de security-review, niet gemeten.

## Aannames — niet gemeten

* Dat de CPU per profiel ongeveer gelijk blijft. Een profiel dat veel weken tegelijk afsluit, kost meer. De marge van 390 tegen 876 is voor dat geval.
* Dat 390 profielen plus het werk ná de lus binnen de CPU-limiet blijven. Dat moet de eerste run na de deploy laten zien.

## Wat erop volgt

QS8-687 (één RPC per profiel) verlaagt ook de CPU per profiel: één HTTP-rondgang in plaats van drie, dus minder JSON en minder fetch-overhead in de functie. Dat is de echte schaalreparatie; dit maximum is de rem.

## Het pad terug

`maxRijen` weglaten in `rollover/index.ts` geeft het gedrag van QS8-685 terug. Er is geen migratie bij betrokken.
