# De rollover sluit een week in één transactie af

**Datum:** 17-11-2026 · **Issue:** QS8-687 · **Status:** gebouwd en lokaal getoetst, niet gedeployd, niet op productie gemeten

## Wat er gebouwd is, en wat niet

Het issue noemt drie opties. Er is **één, en die maar deels** gebouwd:

| optie | stand | reden |
| --- | --- | --- |
| 1. één RPC per profiel | **deels**: `sluit_verstreken_weken_af()` doet het afschrijven van alle verstreken weken van een profiel | de straffen (`maak_straffen_verschuldigd`) en het weekplan (`weekplan_kandidaten`, `activeer_weekplanstap`) staan er nog buiten |
| 2. alleen profielen met werk | niet gebouwd | vraagt cyclusrekenwerk voor de voorselectie (correctheidsregel 7) |
| 3. cursor in de database | niet gebouwd | eigen tabel, eigen RLS, en een besluit over wat er gebeurt bij een gemiste run |

Wat het oplevert is geen snelheidswinst die gemeten is, maar de reparatie die de
security-review op QS8-685 vroeg: een week is nu **alles of niets**. Daarvóór waren
het twee tot vier losse verzoeken per week (`update status`, `insert points_ledger`,
`rpc verbruik_weekpas`), en een kill ertussen liet de week voorgoed half verwerkt
achter, want volgende runs zoeken alleen `todo` en `cancelled`.

## Hoe de functie is gebouwd

* Per week een eigen subtransactie (`begin … exception when others`). Faalt één
  stap, dan wordt die week teruggedraaid en blijft hij `todo`; de andere weken van
  dit profiel gaan door. Dat is dezelfde zachtheid als de edge function had.
* Volgorde per week ongewijzigd: adempauze → `excused`; anders `missed`, dan het
  minpunt, dan `verbruik_weekpas()` (domeinregel 10).
* Het minpunt gaat met `on conflict do nothing`: in een transactie zou een dubbele
  boeking anders de hele week terugdraaien. `geen_minpunt_zonder_beoordelaar()`
  (0065) blijft werken en slaat de rij stil over.
* `p_grens` komt van buiten: dezelfde `afsluitbaar.startDate` uit `shared/time` die
  de edge function al gebruikte. De database rekent geen week uit.
* Alleen `service_role`. `pg_default_acl` geeft elke nieuwe functie ook aan
  `authenticated`; de revoke en de test erop staan in 0329.

## Gemeten (lokaal, Postgres 16, 302 migraties, 17-11-2026)

`tests/rls/rollover-week-transactie.test.ts`, zeven tests. Elke grendel is met de
hand gebroken en de bedoelde test viel om (niet een andere):

| mutatie | test die rood werd |
| --- | --- |
| `exception`-blok vervangen door `raise` | "draait één week terug als een stap midden erin mislukt" |
| `status = 'missed'` weggehaald | vier tests, waaronder idempotentie en de weekpas |
| grens `cycle_start_date < p_grens` weggehaald | "laat een week op of na de grens ongemoeid" |
| `grant execute … to authenticated` erbij | "is niet aanroepbaar voor authenticated of anon" |

## Wat niet gemeten is

* **Acceptatiecriterium 1 (looptijd per profiel op productie) en 2 (het aantal
  profielen met `volledig: false`)** zijn niet gemeten: een bouwsessie schrijft en
  deployt niet naar productie, en de gedeployde rollover draait nog de oude vorm.
  Meten na de deploy: `profielen` en looptijd uit de uitvoer en `edge_logs`.
* Dat het verzoeken bespaart is een rekensom, geen meting: per week gaan 2 tot 4
  verzoeken naar 0 extra, per profiel blijft er 1 voor de weken (plus de straffen,
  het weekplan en de herberekening).
* `src/lib/database.types.ts` is niet opnieuw gegenereerd (`npm run types:db` heeft
  het echte project nodig). De edge function roept de RPC ongetypeerd aan.

## ⚠️ Migratienummer

**0329 is voorlopig.** Opnieuw gebouwd op `main` van 21-11-2026 (besluit Quinten 20-11-2026: toch bouwen, op een nieuwe tak; de oude tak is verouderd en dient alleen als bron, tag `archief/qs8-687-oude-tak`). Wie als tweede merget, hernummert met `npm run migratie:hernummer`.

## Volgorde van uitrollen

Migratie eerst, edge function daarna (`docs/DEPLOY.md` §2.3a). De migratie voegt
alleen toe: de gedeployde rollover blijft werken tot de nieuwe versie er staat. De
nieuwe rollover werkt **niet** zonder de migratie, want hij roept de RPC aan.

## Security-review (17-11-2026) en wat ermee gedaan is

Eén ronde `security-reviewer`; elke bevinding is aan de functiedefinitie
nagelopen. Oordeel: geen kritieke bevinding, wel aandacht.

| bevinding | gedaan |
| --- | --- |
| **M1** een week die elke run faalt blijft stil `todo`, zonder minpunt, en de eigenaar kan er nog een voltooiing voor indienen | de RPC geeft `mislukt` terug; de edge function logt en meldt (`rollover_week_niet_afgesloten`). Test: "meldt een week die niet afsluit in `mislukt`" |
| **M2** de updates hebben geen statusvoorwaarde en kunnen een net ingediende voltooiing overschrijven | `and status in ('todo', 'cancelled')` op beide updates, `if found` ervoor. ⚠️ **De race zelf is niet getoetst**: dat vraagt twee gelijktijdige sessies. Alleen de ondergrens staat onder test (een `pending` week blijft `pending`) |
| **L1** `on conflict do nothing` zonder doel | niet gewijzigd. Vandaag slikt hij geen minpunt (geen pad zet een `missed` week terug naar `todo`). Wordt zwaarder als er een pad bijkomt dat dat wel doet |
| **L2** twee runs tegelijk tellen dubbel | niet gewijzigd; alleen de telling, geen boeking |
| **L3** geen test dat het minpunt blijft staan als de pas redt | test erbij, met `beoordeelbaar = true` |

Niet op productie nagelezen: of `verbruik_weekpas` en
`geen_minpunt_zonder_beoordelaar` daar gelijk zijn aan de lokale stack
(`pg_get_functiondef()` is de waarheid).

## Drie bewuste gedragsverschillen met de oude lus (security-review 21-11-2026)

Alle drie zijn verbeteringen, en ze horen hier te staan omdat ze iets veranderen aan wat de rollover doet:

1. **Twee overlappende adempauzes.** `breathers` heeft geen exclusion-constraint. De oude code faalde dan op
   `.maybeSingle()`, de pauze was `null` en de week werd `missed` mét minpunt. Nu telt `exists`: de week wordt `excused`.
2. **Een fout in het minpunt of de weekpas.** Vroeger bleef de week op `missed` staan, soms zonder punt of pas. Nu draait
   de hele week terug naar `todo` en telt hij in `mislukt` (meldt Sentry); de volgende run probeert hem opnieuw.
3. **De status-guard op beide updates** maakt twee rollovers die tegelijk lopen veilig: de tweede ziet `missed`, raakt geen
   rij en boekt dus geen tweede weekpas. Dat is beredeneerd (READ COMMITTED) en niet met twee sessies gemeten.

⚠️ **Uitrolvolgorde:** migratie eerst, de edge function `rollover` daarna. Omgekeerd sluit de rollover elk uur geen week af
(de RPC bestaat dan niet); sinds de review meldt hij dat wel in Sentry (`rollover_weken_rpc_fout`).
