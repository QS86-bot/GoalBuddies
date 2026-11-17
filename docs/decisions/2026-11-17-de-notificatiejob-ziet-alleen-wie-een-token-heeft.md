# De notificatiejob ziet alleen wie een token heeft

**Datum:** 17-11-2026 · **Issue:** QS8-691 · **Status:** gebouwd, nog niet gedeployd ·
**Bouwt voort op:** QS8-688, zie
`docs/decisions/2026-11-17-de-notificatiejob-krijgt-hetzelfde-budget.md`

## Aanleiding

QS8-688 zette een budget op de notificatiejob. Daarmee is de muur weg, maar de lus
deed nog steeds werk voor niemand.

📏 Productie, 17-11-2026 (alleen gelezen):

| meting | waarde |
| --- | --- |
| profielen | **1.332** |
| profielen met minstens één push-token | **16** |
| hoogste aantal tokens van één gebruiker | **6** |
| tokens zonder profiel | **0** |
| foreign keys van `push_tokens` | alleen `push_tokens_user_id_fkey` → `profiles(id)` |

Een profiel zonder token stopte in `meldEenProfiel()` na `apparatenVan()`, en schreef
tot dat moment niets. Die 1.316 profielen kostten elk een verzoek, en leverden niets
op.

## Besluit

**`push_tokens!inner(user_id)` in de select van `profiles`, als filter.** PostgREST
geeft dan alleen profielen terug met minstens één token. De embed is één-op-veel, dus
een gebruiker met zes tokens blijft één rij, en `order('id')` en `range()` werken op
de profielen (onwrikbare regel 10). Er is geen migratie voor nodig.

**De tokens zelf komen niet uit de embed.** `apparatenVan()` leest ze per profiel
vers, vlak voor het versturen, net als voorheen. Dat is een bewuste keuze, en het
alternatief zou één verzoek per profiel besparen:

* Een token kan van account wisselen (`registreer_push_token`, 0055).
* Een pagina van 200 profielen kan tientallen seconden oud zijn als het laatste
  profiel aan de beurt is.
* Komen de tokens uit de pagina, dan groeit het venster waarin een melding naar een
  toestel gaat dat inmiddels van iemand anders is, van milliseconden naar tientallen
  seconden. Een goedkeuringsverzoek draagt de naam van een buddy. De security-review
  op QS8-688 schreef precies dit als "wordt zwaarder als" bij die bevinding.

Met 16 ontvangers kost dat 16 verzoeken. Dat is geen afweging die nu iets kost.

## Wat er in de uitvoer verandert

* **`profielen`** telt nu de profielen met een token, niet alle profielen.
  📏 17-11-2026: 16 in plaats van 1.332. `notificaties.yml` leest alleen `ok` en
  `volledig`; verder leest niets dit veld.
* **`zonderToken`** wordt bijna altijd 0. Hij telt nu alleen wie zijn laatste token
  kwijtraakte tussen het ophalen van de pagina en `apparatenVan()`. Het veld blijft,
  en de controle in `meldEenProfiel()` ook.
* **`overgeslagen`** (onbruikbare tijdzone) telt alleen nog profielen met een token.
  Een tokenloos profiel met een kapotte `tz` meldt de job niet meer aan Sentry. De
  rollover loopt elk profiel af en meldt dezelfde kapotte tijdzone al
  (`cyclus_onbepaalbaar` in `afsluitbareCyclus()`).

## Wat getest is

`tests/beloftes/notificaties-binnen-de-wandklok.test.ts`, op de échte handler. De
nagemaakte `profiles` past `!inner` toe zoals PostgREST dat doet:

* Met de verhouding van productie (1 op 83) komt elk profiel met een token één keer
  langs, en een profiel zonder token niet. Elke openstaande melding gaat één keer
  weg.
* Een token dat na de pagina verhuist, krijgt niets, en telt als `zonderToken`.
* Met de hand gebroken: `!inner` weggehaald, en apart de hele embed weggehaald.
  Allebei werden alleen de bedoelde toets rood.

## Aannames — niet gemeten

* **Dat PostgREST op productie `!inner` op een één-op-veel-embed toepast zoals
  gedocumenteerd.** De SQL-telling (16) is gemeten; de HTTP-aanroep zelf niet, want
  deze sessie schrijft niet naar productie en roept de functie niet aan. Meten:
  de eerste run na de deploy moet `"profielen":16` (of het dan geldende aantal) geven.

## Het pad terug

`, push_tokens!inner(user_id)` uit de select halen. Geen migratie.
