# Twee systeemberichten voor teams

**Datum:** 18-11-2026 · **Issue:** QS8-656 (epic QS8-650) · **Migratie:** `0308` (voorlopig nummer; de batch hernummert bij het landen, besluit van Quinten 18-11-2026) ·
**Bouwt voort op:** QS8-661 (`0307`)

## Wat er gebouwd is

| onderdeel | vorm |
| --- | --- |
| de allowlist | `chat_messages_system_event_bekend` krijgt `team_goal_created` en `team_goal_completed`; ook voor `service_role` |
| de kopie | `SYSTEEM_GEBEURTENISSEN` in `src/modules/buddies/chat-schemas.ts`, met de verwachte lijst in de test |
| de zinnen | `systeembericht.team_goal_created` en `systeembericht.team_goal_completed` in `nl.ts` en `en.ts`, zonder `{naam}` |
| de schrijver | trigger `team_goals_systeembericht`: elk nieuw teamdoel plaatst `team_goal_created` |

## Keuzes die hier gemaakt zijn

**1. Een trigger als schrijver, en niet een regel in `maak_teamdoel()`.** Zo plaatst
elk nieuw teamdoel het bericht, langs welke route het ook ontstaat. De RPC van 0305
blijft onaangeroerd.

**2. Geen persoon en geen titel.** `subject_id` en `actor_id` blijven leeg. Een titel in
een bericht is een onveranderlijke kopie die de autorisatie overleeft (domeinregel 7).
Wie het teamdoel maakte staat ook niet in de kolomgrant van `team_goals`.

**3. `team_goal_completed` heeft nog geen schrijver.** Afronden met goedkeuring is
QS8-662; die plaatst het bericht. ⚠️ `dode-keten:controle` ziet dat niet: de waarde
staat als tekst in `chat-schemas.ts` en in de catalogi, en dat telt hij als schrijver.
Dezelfde blinde vlek als bij `organizations.archived` in QS8-652. Een rij in
`BEWUST_ONGESCHREVEN` zou hij daarom als verlopen melden. **QS8-662 moet dit bericht
plaatsen**, anders is het een dode waarde die geen controle vindt.

## Domeinregel 7

De twee vragen staan in rij 46 van `docs/decisions/002-domeinregel7-oppervlakken.md`.

⚠️ **Een uitblijvend `team_goal_completed` is wel een signaal.** De regel in
`chat-schemas.ts` (QS8-79) is dat een bericht alleen komt als zijn afwezigheid geen
signaal wordt. Een teamdoel dat zijn streefdatum haalt zonder afrondbericht, haalde het
niet. Dat is groepsbrede tegenslag en geen persoonlijke; het noemt niemand. En het
teamdoel toont zijn status toch al aan de leden (rij 43). Het issue en de spec vragen
dit bericht, dus het is gebouwd. Wie die afweging anders maakt, haalt het type uit de
allowlist voordat QS8-662 het schrijft.

## Wat getest is

- **`tests/rls/teamberichten.test.ts`:** 4 tests via PostgREST.
  - Een nieuw teamdoel plaatst één bericht.
  - Het bericht noemt geen titel en geen persoon.
  - Een organisatiebeheerder die geen lid is, leest het niet.
  - Een onbekend type weigert, ook voor `service_role`.
  - Drie mutaties met de hand.
- **`src/modules/buddies/chat-schemas.test.ts`:** de verwachte lijst bevat de twee
  nieuwe typen.

## Het pad terug

Zie de kop van de migratie. Een rij met een van de twee typen laat de oude CHECK niet
meer toe; die rijen moeten dan eerst weg.
