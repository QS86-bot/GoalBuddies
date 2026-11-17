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
een gebruiker met zes tokens blijft één rij, en `order('id')` en `limit()` met `gt('id', laatste)` werken op
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

**Bladeren op sleutel en niet op offset** (security-review op QS8-691). De lijst is
nu "profielen met een token", en die krimpt tíjdens de run: `stuurWeb()` wist een
verlopen abonnement, een gebruiker logt uit, een token verhuist. Met `range()` op
een vaste offset schuift de volgende pagina dan één plek op en slaat hij precies één
profiel met een token over, terwijl de run `volledig: true` zegt. De gemiste
herinnering komt dan pas een volgende run, en GitHub levert die soms uren later.
Vóór dit issue speelde dat niet: de lijst van álle profielen verandert alleen als er
een account verdwijnt.

`bladerOpSleutel()` vraagt daarom elke volgende pagina op met `gt('id', laatste)`,
binnen de grenzen van het scharnier. Wat er vóór de grens verdwijnt, verschuift dan
niets. `rijen()` uit `_shared/bladeren` (offset) is hier niet meer gebruikt; voor de
rollover blijft hij goed genoeg.

**Een fout bij het lezen van de tokens wordt gemeld** (`pushtokens_ophalen_mislukt`)
in plaats van stil als "geen apparaat" geteld. Nu `zonderToken` bijna altijd 0 hoort
te zijn, zou een storing er anders uitzien als een gewoon getal.

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
* Tokens die tíjdens de run verdwijnen (1.000 profielen, vijf pagina's): elk profiel
  met een token komt toch langs.
* Met de hand gebroken, en bij de review van de batch nagemeten (17-11-2026):
  `!inner` vervangen door een gewone embed maakt **twee** tests rood: "slaat een
  profiel zonder token over…" én "leest de tokens vers: een token dat na de pagina
  verhuisd is, krijgt niets" (die telt het profiel dan als `zonderToken`). De hele
  embed weghalen gaf bij de reviewer eveneens twee rood en terug naar bladeren op
  offset één: "slaat niemand over als tokens tíjdens de run verdwijnen". De
  eerdere regel "elke keer alleen de bedoelde toets" klopte dus niet.

## Aannames — niet gemeten

* **Dat PostgREST op productie `!inner` op een één-op-veel-embed toepast zoals
  gedocumenteerd.** De SQL-telling (16) is gemeten; de HTTP-aanroep zelf niet, want
  deze sessie schrijft niet naar productie en roept de functie niet aan. Meten:
  de eerste run na de deploy moet `"profielen":16` (of het dan geldende aantal) geven.

## Het pad terug

`, push_tokens!inner(user_id)` uit de select halen. Bladeren op sleutel mag blijven;
dat is ook voor de lijst van alle profielen correct. Geen migratie.
