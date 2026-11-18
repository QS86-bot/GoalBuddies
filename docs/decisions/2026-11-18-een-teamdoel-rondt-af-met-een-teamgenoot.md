# Een teamdoel rondt af met een teamgenoot

**Datum:** 18-11-2026 · **Issue:** QS8-662 (epic QS8-650) · **Migratie:** `0306` (voorlopig nummer; de batch hernummert bij het landen) ·
**Bouwt voort op:** QS8-660 (`0305`), en de teamketen daaronder ·
**Besluiten:** 28, 30 en 35 in
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`,
domeinregel 10 in CLAUDE.md, en de besluiten van Quinten van 18-11-2026 als reacties
op QS8-662

## Wat er gebouwd is

| onderdeel | vorm |
| --- | --- |
| de aanvraag | `vraag_teamdoel_afronding()`: elk actief lid van de teamgroep |
| de goedkeuring | `keur_teamdoel_goed()`: een ander actief lid; zet het teamdoel op `completed` en plaatst `team_goal_completed` (0304) |
| nooit jezelf | de RPC, de CHECK `team_goals_niet_zelf_goedgekeurd`, en de trigger `team_goals_afronding` die de overgang naar `completed` alleen met twee verschillende personen toelaat; ook voor `service_role` |
| definitief | dezelfde trigger weigert `completed` terug naar iets anders |
| de bonus | `points_ledger.reason = 'team_goal_bonus'`, `delta = 2`, `ref_type = 'team_goal'` |

## De besluiten van Quinten (18-11-2026)

1. **Een seizoen is een vast kwartaal** in de tijdzone van de teamgroep, via
   `seizoensgrens()`. Niet `groups.season_cadence`: een beheerder zou die op maandelijks
   kunnen zetten, en dan wordt het plafond drie keer zo hoog.
2. **Een goedgekeurde afronding is definitief.** Er is geen intrekvenster en geen
   correctieboeking.
3. **Wie het plafond al bereikte, ziet niets.** Geen rij, geen melding; het teamdoel
   rondt gewoon af.
4. **De stand op het moment van goedkeuren telt.** Wie dan een gekoppeld aandeel heeft
   en actief lid is van team en organisatie, krijgt de +2, ook bij een laat aandeel.

## Keuzes die hier gemaakt zijn

**1. Het lopende kwartaal is `season_end + 1` van `seizoensgrens()`.** De functie geeft
het vórige seizoen terug; ze is gebouwd voor de recap. De dag na zijn einde is het begin
van het lopende kwartaal. Dat is "via de bestaande seizoensfunctie", zonder eigen
datumberekening.

**2. Eenmalig per persoon per teamdoel via de bestaande dedupe-index.**
`points_ledger_dedupe_idx` op (user_id, reason, ref_type, ref_id, ronde) dekt dit, met
`ref_type = 'team_goal'` en `ref_id` het teamdoel. Er is geen nieuwe index bij gekomen.

**3. Een advisory lock per persoon** tijdens het boeken. Zonder die lock kunnen twee
teamdoelen die tegelijk worden goedgekeurd allebei "nog geen bonus dit seizoen" zien.

**4. Twee lidmaatschapstoetsen die elkaar dekken.** De bonus eist actief lid van de
teamgroep én actief lid van de organisatie. Wie de organisatie verlaat, wordt door de
cascade van 0300 ook in de teamgroep inactief, en verliest zijn koppeling. Apart weghalen
is daarom niet meetbaar (📏 gemeten: groen); beide samen wel. Ze staan er allebei,
omdat jouw besluit het organisatielidmaatschap noemt.

**5. Wie afrondde staat niet in de kolomgrant.** `afronding_gevraagd_door` en
`afronding_goedgekeurd_door` zijn voor een client niet leesbaar. Rij 46 belooft een
afronding zonder persoon.

## Wat het kost (besluit 28)

Dit is een tweede beloning voor werk dat al punten opleverde: de dubbeltelling die 0132
voor `goal_done` wegnam. En voor dit deel van de score maakt een gehaald of gemist aandeel
geen verschil. Domeinregel 10 noemt het als bewuste uitzondering. Twee leden die
samenspannen, kunnen elkaar nog steeds een teambonus bezorgen; het plafond maakt dat
hoogstens +2 per persoon per kwartaal.

## Wat getest is

`tests/rls/teambonus.test.ts`: 7 tests via PostgREST.
- Criterium 13 (a) tot en met (d): nooit jezelf, via de RPC en via `service_role` (de
  trigger en de CHECK apart); eenmalig; alleen in het eigen puntenboek; zonder
  goedkeuring niets.
- Criterium 14: twee leden die elkaars afronding goedkeuren.
- Besluit 2 (definitief), besluit 4 (een laat aandeel telt), een vertrokken
  organisatielid krijgt niets, en een bonus uit een vorig kwartaal telt niet mee.
- Zeven mutaties met de hand; de uitslag staat in de kop van de test.

## Het pad terug

Zie de kop van de migratie. Met teambonussen in het puntenboek is dat grens 2: die rijen
zijn score die gebruikers gezien hebben.
