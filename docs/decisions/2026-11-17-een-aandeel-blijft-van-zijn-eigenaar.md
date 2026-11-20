# Een aandeel blijft van zijn eigenaar

**Datum:** 17-11-2026 · **Issue:** QS8-661 (epic QS8-650) · **Migratie:** `0321` (gebouwd als `0303`, hernummerd op 20-11-2026) ·
**Bouwt voort op:** QS8-655 (`0320`), QS8-654 (`0319`) ·
**Besluiten:** 5, 11, 18, 21, 22 en 25 in
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`

## Wat er gebouwd is

| onderdeel | vorm |
| --- | --- |
| aandelen dicht | `shares_group_with_goal()` en `deelt_open_groep_met_doel()` geven `false` voor een aandeel van een ander, via `is_aandeel_van_een_ander()` |
| het goedkeurvenster | `aandeel_wacht_op_teamgenoot()` als extra tak in `goals_select`, `weekly_goals_select`, `completions_select` en `completion_approval_rules_select` |
| geen klassement | `groep_klassement()` geeft nul rijen voor een groep met een organisatie |
| open mag weer | de tijdelijke CHECK `groups_team_beschermd_tot_qs8_661` van 0319 vervalt |

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

`tests/rls/aandeel-dicht.test.ts`: 10 tests via PostgREST in een **open** teamgroep.
- Controle: een gewoon doel dat aan hetzelfde team hangt, is open, ook de gemiste week.
- Een teamgenoot ziet van het aandeel geen rij, geen mijlpalen, geen
  doelgebeurtenissen, geen gemiste en geen lopende week.
- Hij ziet wél een wachtende voltooiing en keurt hem goed via
  `openstaande_beoordelingen()` en een insert; daarna is het weer dicht.
- `groep_klassement()` geeft nul rijen, terwijl er punten op de groep staan.
- De teamchat (geen bericht over het aandeel, wel over een gewoon doel), de helden,
  de straf bij een uitstelverzoek en het groepsoverzicht.
- Negen mutaties met de hand. De uitslag staat in de kop van de test.

De tests van QS8-653, 654 en 655 draaien groen op de nieuwe regels, waaronder de
goedkeuring door een teamgenoot in een beschermde teamgroep.

## Wat de securityreview vond (blokkerend), en wat ermee gebeurde

- **H1, hersteld:** wie over een uitstelverzoek op een aandeel beslist, zag de straf
  niet meer, omdat `straffen_bij_uitstelverzoek()` `shares_group_with_goal()`
  gebruikte. Een teamgenoot kon zo een straf losser maken zonder te weten dat hij
  bestond (domeinregel 11, QS8-370). De functie toetst nu het lidmaatschap van kijker
  en eigenaar zelf. Getoetst.
- **H2, hersteld:** systeemberichten verrieden per persoon de mijlpalen, de
  ingediende weken en de bevestigde weken van een aandeel. Voor een aandeel komt er
  geen systeembericht meer: `plaats_systeembericht_in_doelgroepen()` slaat het over,
  en `meld_goedkeuring()` ook. Goedkeuren loopt via de wachtrij en niet via de chat.
  Dat sluit ook M1 (het ontbreken van een weekbericht verraadt een gemiste week).
  ⚠️ Voor de gebruiker: een teamgenoot hoort het in de chat niet meer als er een
  aandeel wacht. De wachtrij en de meldingen zijn de weg.
- **H3, hersteld, en een besluit voor Quinten:** `groep_helden()` gaf in een open
  teamgroep per collega `stilte` (drie dagen niets, over álle doelen, ook privédoelen)
  en `mijlpaal`. Een teamgroep krijgt nu geen helden, met dezelfde eigen voorwaarde
  als het klassement. Dat is dicht tot Quinten anders besluit; voor élk nieuw
  oppervlak is beschermd het antwoord.
- **M2, hersteld:** `group_overview()` toonde het aandeel in het goedkeurvenster als
  een doel met 0 van 0 mijlpalen. Het aandeel staat er niet meer in.
- **M3, open:** `ketting_stand()` telt een lid met een adempauze op een aandeel niet
  mee voor De Ketting. Daarmee is de adempauze af te leiden, in een team van twee ook
  van wie. Niet aangepast, omdat het de regels van De Ketting verandert. Wordt zwaarder
  als: teams van twee of drie de gewone vorm worden.
- **M4, open:** de seizoensrecap telt dezelfde groepscijfers als `groep_teller()`,
  aandelen inbegrepen. Zie hieronder.
- **M5, besluit 18:** in een open teamgroep ziet een lid wie de weekafsluiting deed
  (`chain_links`, `group_overview.closed_this_period`). Dat is A41-gedrag, en besluit
  18 noemt die prijs met zoveel woorden. Niet aangepast. Wie het in een teamgroep dicht
  wil, besluit dat.
- **L1, open:** `is_aandeel_van_een_ander()` is uitvoerbaar voor `authenticated`,
  omdat `group_overview()` met de rechten van de aanroeper draait. Met de `goal_id`'s
  uit `goal_group_links` ziet een teamgenoot welke gekoppelde doelen aandelen zijn,
  zonder eigenaar. Wordt zwaarder als: een leesbare rij `goal_id` aan een persoon
  koppelt.
- **L2, open:** `weekly_goals_select` roept per rij twee helpers aan die elk
  `team_goal_shares` raadplegen (primaire sleutel). Wordt zwaarder als: lijstqueries
  op `weekly_goals` zonder filter op `goal_id` gaan draaien.

## Aannames, niet gemeten

- **Andere definer-functies** die `shares_group_with_goal()` aanroepen
  (`straffen_bij_uitstelverzoek()`, `zichtbare_reeksen_van_groep()` en twee
  bewakingsfuncties) volgen de nieuwe voorwaarde automatisch. Hun gedrag voor een
  aandeel is niet apart getoetst.
- **`group_overview()`** draait met de rechten van de aanroeper en volgt dus de
  policies. Voor een aandeel is het niet apart getoetst.

## Besluiten van Quinten (18-11-2026)

Op de drie vragen uit de afleverregel; reactie op QS8-661 van 18-11-2026 08:30
UTC, hier ingebouwd bij het hernummeren op 20-11-2026.

1. **Helden in een teamgroep blijven dicht**, ook in een open teamgroep. Zo
   gebouwd (H3).
2. **De weekafsluiting in een open teamgroep (M5) blijft zoals besluit 18 hem
   geeft**: wie de weekafsluiting deed, is zichtbaar, net als in een gewone open
   groep. Geen wijziging.
3. **Aandelen in een beschermde teamgroep zijn overal dicht, ook voor goed
   nieuws.** Besluit 11 is leidend. Zo gebouwd.

## Bij het hernummeren samengevoegd met 0312 (20-11-2026)

Deze migratie herdefinieert `straffen_bij_uitstelverzoek()` vanuit het lichaam
van 0218. Op `main` kwam in 0312 (QS8-758) de conjunct `and c.periode_start is
null` bij: een weekbelofte valt buiten het oppervlak van rij 31. Git ziet dat
niet als conflict, en `registerdrift:controle` ook niet: die kent alleen
registers in vijf functielichamen en geen voorwaarde in een `where`. 📏 Gemeten
op 20-11-2026: met en zonder de conjunct gaf hij dezelfde groene uitslag. Zoals
de melding van QS8-758 op dit issue vraagt (reactie van 20-11-2026 07:05 UTC),
zijn beide wijzigingen samengevoegd: de zichtbaarheidstoets van dit issue én de
conjunct van 0312. Het vangnet is criterium 3 in `tests/rls/weekbelofte.test.ts`
in de RLS-job.

## Het pad terug

Zie de kop van de migratie. Alleen functie- en policylichamen; er gaan geen gegevens
verloren.
