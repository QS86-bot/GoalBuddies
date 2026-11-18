# Een teamstraf blijft in het team

**Datum:** 18-11-2026 · **Issue:** QS8-660 (epic QS8-650), het scherm in QS8-698 ·
**Migratie:** `0309` (voorlopig nummer; de batch hernummert bij het landen) ·
**Bouwt voort op:** QS8-656 (`0308`) ·
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
- het aandeel zelf (0307);
- de straftekst in de chat;
- de inhoud via `straffen_bij_uitstelverzoek()` (alleen `goal_id`).

## Wat de securityreview vond, en wat Quinten besloot

- **M1, hersteld (besluit van Quinten):** de grens gold alleen bij het schrijven. Een
  getuige die het team verliet maar nog een vriendengroep met de eigenaar deelde, las
  de straf toch. Voor een aandeel eisen nu alle vier de leesroutes dat lezer én
  eigenaar actief in het team zitten, via `straf_teamband_klopt()`:
  `commitments_select`, `getuigenissen()`, `getuigenissen_voor()` en
  `teruggedraaide_straffen_voor()`. Dat geldt ook andersom: vertrekt de eigenaar, dan
  leest het team zijn straf op het aandeel niet meer.
- **M2, hersteld (besluit van Quinten):** de persoonlijke getuige van een privédoel
  moet een groep zonder organisatie met de eigenaar delen.
- **M3 (besluit van Quinten):** de eigen bevestigingszin wacht op QS8-698. Tot dan
  noemt de algemene zin het team bij naam.
- **L1, hersteld:** de eigenaar kon aftasten of een vreemde groeps-uuid een teamgroep
  is. Wie geen lid is van de gekozen groep, krijgt nu de melding van de policy.
- **L2, hersteld:** `herstel_stuurloze_straf()` met een getuige buiten het team gaf een
  ruwe fout. `herstel()` herkent nu de hint.
- **L3, open:** een nieuw teamlid leest verschuldigde straffen van vóór zijn
  lidmaatschap, net als in elke groep. Wordt zwaarder als: teamgroepen vaak van
  samenstelling wisselen.
- **Vóór de uitrol:** de migratie toetst geen bestaande rijen. In productie bestaan
  nog geen aandelen of teamgroepen, dus er kan geen rij zijn die 0309 zou weigeren.
  Controleer dat bij het landen met een `select` op `commitments` join
  `team_goal_shares`, en op een teamgroep als begunstigde van een gewoon doel.

## Wat getest is

`tests/rls/teamstraf.test.ts`: 11 tests via PostgREST.
- **Geweigerd:** een vriendengroep of vriend op een aandeel, het team op een gewoon
  doel, en dezelfde fout via `service_role`.
- **Geen orakel:** een vreemde krijgt hetzelfde antwoord als bij een gewoon doel.
- **Toegestaan, ter controle:** het team en een teamgenoot op een aandeel, en een
  vriendengroep op een gewoon doel.
- **Leesbaarheid:** de straf is pas leesbaar bij verschuldigd, met tekst. Het aandeel
  blijft dicht, en de chat noemt de tekst niet.
- M1 op drie leesroutes (direct, `getuigenissen()`, `getuigenissen_voor()`), M2 en L1.
- Negen mutaties met de hand.

## Het pad terug

Zie de kop van de migratie: alleen een weigering, geen gegevens.
