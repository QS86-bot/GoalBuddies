# Een teamstraf blijft in het team

**Datum:** 18-11-2026 · **Issue:** QS8-660 (epic QS8-650), het scherm in QS8-698 ·
**Migratie:** `0305` (voorlopig nummer; de batch hernummert bij het landen) ·
**Bouwt voort op:** QS8-656 (`0304`) ·
**Besluiten:** 12 en 29 in
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`, en de
ontwerpronde met Quinten van 18-11-2026 (grens 1)

## De ontwerpronde

Het issue vroeg eerst een korte ontwerpronde, omdat het raakt wat een mens beloofd
wordt. Quinten koos op 18-11-2026 (vastgelegd als reactie op QS8-660):

1. **Bij verschuldigd zien collega's de naam en de straftekst**, zoals bij elke
   begunstigde groep.
2. **De bevestiging krijgt een eigen zin voor teams.**
3. **Een teamgroep is alleen begunstigde of getuige van een aandeel**, en een
   afspraak op een aandeel heeft alleen het eigen team of een teamgenoot als getuige.
4. **Een teamgenoot mag persoonlijk getuige zijn.**

## Wat er gebouwd is

| onderdeel | vorm |
| --- | --- |
| de grens | trigger `commitments_teamstraf` (`bewaak_teamstraf()`), op insert en op een wijziging van doel of begunstigde, ook voor `service_role` |
| de melding | weigering met `hint = 'teamstraf'`; `zetStraf()` herkent die via `TEAMSTRAF_HINT` en toont `commitment.fout.teamstraf` |
| zichtbaarheid | ongewijzigd: `commitment_zichtbaar_voor_groep()` blijft `unlocked`, `due`, `resolved` |

## Keuzes die hier gemaakt zijn

**1. Een eigen trigger naast `bewaak_begunstigde()`.** Twee herdefinities van één
functielichaam verliezen stil elkaars register (QS8-358).

**2. Een niet-eigenaar krijgt de melding van de policy, woordelijk.** Zo leert een
vreemde niet dat een doel een aandeel is. Zwijgen kan niet: dat opent de grendel voor
een definer-context (securityreview QS8-654, M1).

**3. Herkend aan de `hint` en niet aan de zin.** Een andere formulering in de database
breekt de uitleg in de app dan niet stil. De RLS-test legt de constante uit de app naast
wat de database teruggeeft.

**4. Het scherm wacht op de types.** `src/lib/database.types.ts` komt uit productie en
kent `team_goal_shares` en `groups.organization_id` pas na de uitrol. Handmatig
bijwerken mag niet, en een cast in de app-code staat nergens in dit project. De eigen
bevestigingszin en het filteren van de keuzelijst zijn daarom QS8-698. Tot die er is
weigert de database een verkeerde keuze, en legt de app uit waarom. Dat faalt dicht:
er komt nooit een straf bij de verkeerde getuige terecht.

## Domeinregel 7

Rij 48 in `docs/decisions/002-domeinregel7-oppervlakken.md`. Dit is de bewuste
uitzondering: een straf die de gebruiker zelf vooraf instelde en bevestigde, gelezen
door collega's zodra hij verschuldigd is. Wat níet lekt:
- het aandeel zelf (0303);
- de straftekst in de chat;
- de inhoud via `straffen_bij_uitstelverzoek()` (alleen `goal_id`).

## Wat getest is

`tests/rls/teamstraf.test.ts`: 8 tests via PostgREST.
- **Geweigerd:** een vriendengroep of vriend op een aandeel, het team op een gewoon
  doel, en dezelfde fout via `service_role`.
- **Geen orakel:** een vreemde krijgt hetzelfde antwoord als bij een gewoon doel.
- **Toegestaan, ter controle:** het team en een teamgenoot op een aandeel, en een
  vriendengroep op een gewoon doel.
- **Leesbaarheid:** de straf is pas leesbaar bij verschuldigd, met tekst. Het aandeel
  blijft dicht, en de chat noemt de tekst niet.
- Vier mutaties met de hand.

## Het pad terug

Zie de kop van de migratie: alleen een weigering, geen gegevens.
