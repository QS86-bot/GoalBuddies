# Een aandeel blijft van zijn eigenaar

**Datum:** 17-11-2026 · **Issue:** QS8-661 (epic QS8-650) · **Migratie:** `0303` (voorlopig nummer, botst met productie) ·
**Bouwt voort op:** QS8-655 (`0302`), QS8-654 (`0301`) ·
**Besluiten:** 5, 11, 18, 21, 22 en 25 in
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`

## Wat er gebouwd is

| onderdeel | vorm |
| --- | --- |
| aandelen dicht | `shares_group_with_goal()` en `deelt_open_groep_met_doel()` geven `false` voor een aandeel van een ander, via `is_aandeel_van_een_ander()` |
| het goedkeurvenster | `aandeel_wacht_op_teamgenoot()` als extra tak in `goals_select`, `weekly_goals_select`, `completions_select` en `completion_approval_rules_select` |
| geen klassement | `groep_klassement()` geeft nul rijen voor een groep met een organisatie |
| open mag weer | de tijdelijke CHECK `groups_team_beschermd_tot_qs8_661` van 0301 vervalt |

## Keuzes die hier gemaakt zijn

**1. In de twee helpers en niet per policy.** Bijna elke leesroute op een doel loopt via
`shares_group_with_goal()`: `goals`, `milestones`, `goal_events`, `breathers`,
`daily_moves`, `completions`, `completion_approval_rules` en de beschermde tak van
`weekly_goals`. De open tak van `weekly_goals` loopt via `deelt_open_groep_met_doel()`.
Eén voorwaarde in elk van die twee dekt ze allemaal, en een nieuwe policy die een van de
helpers gebruikt, erft hem.

**2. Dicht in een beschermde én een open teamgroep.** Het issue noemt de open
teamgroep, maar besluit 11 zegt zonder voorbehoud dat collega's niet zien hoe ver een
ander met zijn aandeel is. In een beschermde groep is positieve voortgang (mijlpalen,
gehaalde weken) voor groepsgenoten zichtbaar, dus ook daar moest het aandeel dicht. Dat
is de strengere lezing. Wie de lossere wil, zegt dat in een besluit.

**3. Het goedkeurvenster.** Dit is de spanning tussen besluit 5 en besluit 11. Een
teamgenoot moet een aandeel goedkeuren, en daarvoor moet hij de voltooiing zien:
`completion_approvals_insert` leest `completions`, `weekly_goals` en `goal_group_links`
met zijn rechten, en `openstaande_beoordelingen()` leest ook `goals` (voor de titel).
De smalste opening die besluit 5 laat werken:
- het weekdoel dat op `pending` staat;
- zijn voltooiing;
- de rij van het doel;
- en dat alleen zolang er een weekdoel wacht.

Na de goedkeuring is het weer dicht. De goedkeurder houdt zijn eigen goedkeuringsrij
(`completion_approvals_select`).

**4. Het venster zit in een definer-helper.** Een `goals`-policy die via RLS naar
`weekly_goals` kijkt, waarvan de policy weer naar `goals` kijkt, is oneindige recursie.
`aandeel_wacht_op_teamgenoot()` leest het wachtende weekdoel zonder RLS en toetst zelf
het lidmaatschap van de kijker en de eigenaar.

**5. Het klassement krijgt een eigen voorwaarde.** Niet via `lid_van_open_groep()`:
A57 (QS8-666) gaat juist die poort veranderen, en dan zou de uitzondering voor
teamgroepen stil meeverdwijnen (besluit 25). Het lichaam is gekopieerd uit de huidige
definitie (QS8-358).

## Domeinregel 7

De twee vragen per oppervlak staan in rij 44 en 49 van
`docs/decisions/002-domeinregel7-oppervlakken.md`.

⚠️ **Wat nog af te leiden is, en waarom het blijft:**
- **`goal_group_links`** blijft leesbaar voor groepsleden, omdat de insert-policy op
  goedkeuringen hem met de rechten van de goedkeurder leest. Een rij heeft alleen
  `goal_id`; zonder leesbaar doel is hij niet aan een persoon te koppelen.
- **`groep_teller()`** telt goedgekeurde weken en gedane mijlpalen van alle gekoppelde
  doelen van de groep, aandelen inbegrepen. Het is een groepstotaal, maar in een team
  van twee is het dezelfde aftreksom als bij de teambalk (rij 45). Niet aangepast; dat
  is een besluit over wat De Ketting en het groepstotaal in een teamgroep tellen.
- **Het goedkeurvenster** zegt dat iemand een aandeel heeft en deze week iets
  afrondde. Dat is positief, en het minimum dat besluit 5 vraagt.

## Wat getest is

`tests/rls/aandeel-dicht.test.ts`: 7 tests via PostgREST in een **open** teamgroep.
- Controle: een gewoon doel dat aan hetzelfde team hangt, is open, ook de gemiste week.
- Een teamgenoot ziet van het aandeel geen rij, geen mijlpalen, geen
  doelgebeurtenissen, geen gemiste en geen lopende week.
- Hij ziet wél een wachtende voltooiing en keurt hem goed via
  `openstaande_beoordelingen()` en een insert; daarna is het weer dicht.
- `groep_klassement()` geeft nul rijen, terwijl er punten op de groep staan.
- Vier mutaties met de hand. De uitslag staat in de kop van de test.

De tests van QS8-653, 654 en 655 draaien groen op de nieuwe regels, waaronder de
goedkeuring door een teamgenoot in een beschermde teamgroep.

## Aannames, niet gemeten

- **Andere definer-functies** die `shares_group_with_goal()` aanroepen
  (`straffen_bij_uitstelverzoek()`, `zichtbare_reeksen_van_groep()` en twee
  bewakingsfuncties) volgen de nieuwe voorwaarde automatisch. Hun gedrag voor een
  aandeel is niet apart getoetst.
- **`group_overview()`** draait met de rechten van de aanroeper en volgt dus de
  policies. Voor een aandeel is het niet apart getoetst.

## Het pad terug

Zie de kop van de migratie. Alleen functie- en policylichamen; er gaan geen gegevens
verloren.
