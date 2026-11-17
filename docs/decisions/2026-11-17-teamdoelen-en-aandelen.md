# Teamdoelen en aandelen

**Datum:** 17-11-2026 · **Issue:** QS8-654 (epic QS8-650) · **Migratie:** `0301` (voorlopig nummer) ·
**Bouwt voort op:** QS8-653 (`0300`, teamgroepen) en QS8-652 (`0299`, organisaties) ·
**Besluiten:** 5, 10, 11, 17, 20 en 21 in
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`

## Wat er gebouwd is

| onderdeel | vorm |
| --- | --- |
| `team_goals` | lezen via `mag_groep_lezen()`, schrijven alleen via `maak_teamdoel()`; trigger `team_goals_bewaakt` houdt hem bij een teamgroep van dezelfde organisatie |
| `team_goal_shares` | eigenaar-only lezen, schrijven alleen via `neem_aandeel()`; trigger `team_goal_shares_vul` zet `user_id` gelijk aan de eigenaar van het doel |
| de koppelgrendel | trigger `goal_group_links_aandeel_in_teamgroep`: een aandeeldoel hangt aan geen andere groep dan zijn teamgroep, ook voor `service_role` |
| een teamdoel maken | `maak_teamdoel()`, voor elk actief teamlid (besluit 20) |
| een aandeel nemen | `neem_aandeel()`: een nieuw persoonlijk doel met de streefdatum van het teamdoel, in dezelfde transactie gekoppeld aan de teamgroep |

## Keuzes die hier gemaakt zijn

**1. Een aandeel is altijd een nieuw doel.** `neem_aandeel()` maakt het doel zelf, met
de streefdatum van het teamdoel (besluit 20). Een bestaand doel tot aandeel maken kan
niet. Twee redenen:
- `goals.target_date` staat niet in de kolomgrant voor UPDATE. Een streefdatum
  verschuift alleen via A7, met akkoord van een groepsgenoot. Een RPC die hem bij het
  aanhaken overschrijft, is een tweede weg om die rem heen.
- Een bestaand doel kan al aan een vriendengroep hangen, en dan zou het aanhaken
  moeten kiezen wat er met die koppeling gebeurt.

Deze keuze is conservatief. Wil Quinten dat bestaande doelen aandeel kunnen worden, dan
is dat een eigen besluit.

**2. Alleen de eigenaar leest zijn aandeelrij.** De spec stelde "teamgroep lezen én
het doel met je delen" voor. Rij 44 in 002 zegt dat het niet besloten is of een
teamgenoot mag zien dát iemand een aandeel heeft. Beschermd is het antwoord tot iemand
het tegendeel besluit.

**3. De aanmaker van een teamdoel staat niet in de kolomgrant.** Rij 46 belooft een
teambericht zonder persoon. Een leesbare `created_by` zou datzelfde via een omweg
geven. Hetzelfde patroon als `organizations.created_by` in 0299 (security-ronde L3).

**4. De koppelgrendel zwijgt tegenover een niet-eigenaar.** Een `before`-trigger
antwoordt vóór de policy. Met een eigen melding leert een vreemde dat een doel een
aandeel is. Dit volgt `weekdoel_cyclus_klopt()` (0198). De policy weigert de rij daarna
toch.

**5. De streefdatum van een teamdoel leest de groepsklok** (`groepsdatum()`), en die
van een aandeel de klok van de eigenaar (`mijn_datum()`). Er komt geen derde klok
(besluit 17).

**6. Een daglimiet van tien teamdoelen per aanmaker.** Er is geen limiet besloten
(besluit 30 noemt hem als open). Dit is een rem tegen een lus en geen beleid, in
dezelfde orde van grootte als `maak_teamgroep()`.

## Domeinregel 7

De twee vragen per oppervlak staan in rij 43 en 44 van
`docs/decisions/002-domeinregel7-oppervlakken.md`.

⚠️⚠️ **Wat hier níet gebouwd is, en waarom dat een volgorde-eis oplevert.** Een
aandeeldoel is een gewoon gekoppeld doel. Een teamgenoot leest dus vandaag de rij van
het doel, het plan en wat gelukt is, zoals bij elk gekoppeld doel (rij 1, 3 en 34). In
een **open** teamgroep leest hij ook een gemist weekdoel. Besluit 11 en 21 vragen
daar een uitzondering op, en die is QS8-661. **Er mag geen open teamgroep in productie
bestaan voordat QS8-661 geland is.** In een beschermde teamgroep is een gemist
weekdoel van een aandeel al dicht. Criterium 6(a) toetst dat.

## Wat getest is

- **`tests/rls/teamdoelen.test.ts`:** 21 tests via PostgREST, met het JWT van elke
  gebruiker, over het echte teampad: organisatie, `maak_teamgroep()`, de
  uitnodigingscode, `maak_teamdoel()` en `neem_aandeel()`.
  - Criterium 1, 2 en 3, plus een controlemeting dat een teamgenoot wél goedkeurt.
  - Criterium 6(a) en 6(e), met een ijking.
  - Criterium 7: drie leden met verschillende week-starts, onder wie één in
    `America/New_York`, en een teamgroep met huddledag woensdag. De database weigert
    een weekdoel op een aandeel dat op de huddledag begint.
  - Zes mutaties per grendel met de hand. Elke keer werd precies de bedoelde test
    rood. De uitslag staat in de kop van de test.
- **`src/shared/time/teamklok.test.ts`:** dezelfde drie klokken en de teamperiode in
  `shared/time`, op de rand waar New York nog een dag achterloopt.

## Aannames, niet gemeten

- **Afronden en archiveren van een teamdoel** zijn er nog niet. `status` kent de drie
  waarden, maar alleen `active` wordt geschreven. Afronden met goedkeuring is QS8-662.
- **Een aandeel bij vertrek uit de organisatie.** De vertrek-cascade van 0300 haalt de
  koppeling weg. De aandeelrij blijft staan en het doel ook (besluit 14). Wat er
  daarna met de rij gebeurt, is QS8-659.
- **Ontkoppelen van het eigen aandeel** kan, via `goal_group_links_delete`. Daarna
  hangt het aandeel aan geen groep en kan niemand het goedkeuren. Opnieuw koppelen aan
  een andere groep houdt de grendel tegen. Of ontkoppelen mag, is niet besloten. Het
  faalt dicht: er komt geen goedkeuring uit een verkeerde groep.
- **`src/lib/database.types.ts`** kent de nieuwe tabellen en RPC's nog niet.
  Hergenereren gebeurt bij de uitrol, net als bij QS8-652 en QS8-653.

## Het pad terug

Zie de kop van de migratie. Zolang er geen teamdoelen bestaan, is alles terug te
draaien zonder gegevensverlies. De aandeeldoelen blijven bij een rollback staan, want
het zijn persoonlijke doelen.
