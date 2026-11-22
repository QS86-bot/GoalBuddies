# Alle klassementen in één verzoek — QS8-666, deel 3c-db

Datum: 22-11-2026. Eén migratie met één leesfunctie, `mijn_klassementen()`, en geen scherm: het scherm "Alle klassementen" (variant A van A57b) is 3c-ui en
volgt pas nadat de migratie op productie staat en `types:db` is gedraaid (dezelfde werkwijze als 666 deel 2).

## Besluiten van Quinten (22-11-2026)
1. **Variant A, één RPC met een migratie** (en niet een `groep_klassement()` per groep, en niet een beperkt aantal groepen tegelijk). Reden: regel 12 (geen N+1)
   en het schaaldoel; het scherm toont alle groepen in één blik.
2. **Een groep zonder klassement krijgt geen regel** ("Nee, weglaten"): de functie geeft er geen rij voor, en het scherm zegt niets over wat ontbreekt.

Eerder besloten en hier overgenomen: geen ranglijst over groepen heen (lezing B in `docs/decisions/2026-09-03-een-klassement-in-elke-groep.md` is afgewezen) en
geen delta of datum in het klassement.

## Wat de functie doet
- `mijn_klassementen(p_limit, p_offset)` geeft voor elke groep van de aanroeper die een klassement heeft de bovenste vijf, plus de eigen plek als die niet bij de
  vijf zit. Eén statement, geen N+1: de groepen, de sommen per (groep, lid) en de rangschikking staan in één query.
- **De poort is die van `groep_klassement()`, letterlijk uit 0333:** `lid_van_levende_groep()`, `groups.klassement_aan` en geen teamgroep (`organization_id`). Erbij
  komt een expliciete toets op `automatisch`; `groep_klassement()` leunt daar op de CHECK, deze functie toetst hem zelf. Geen eigen foutcodes: elke weigering is nul rijen,
  zodat een buitenstaander niet ziet of een groep een klassement heeft.
- **Begrensd:** paginering op groepen (hoogstens 20 per aanroep, standaard 10, volgorde `joined_at, group_id`), en de vijf staat vast in de functie en is geen parameter,
  zodat dit geen tweede ongepagineerde ingang op het hele klassement wordt. "Alle N leden" leest daarna `groep_klassement()` met paginering.
- **Geen delta en geen datum:** `joined_at` staat alleen in de `ORDER BY`. De punten komen uit `points_ledger` per (groep, lid); een gemiste week boekt zonder groep (CHECK
  `points_ledger_gemist_is_niet_van_een_groep`) en kan er dus niet in voorkomen.

## Waarom geen `lateral` op `groep_klassement()`
Dat deelt de poort per constructie, maar geeft de eigen plek niet als je onder de vijf staat, en het is dezelfde ledgerscan per groep. De prijs van één query is dat de
rangschikking nu op twee plekken bestaat. Drie grendels dragen dat: `tests/rls/mijn-klassementen.test.ts` legt hem rij voor rij naast `groep_klassement()` en legt de
verzameling groepen in twee richtingen naast die functie, en een statische toets legt de poortvoorwaarden en de `order by` van beide functies naast elkaar (draait zonder database).
Wil de engineer één bron, dan is de nette vorm een interne helper die beide functies aanroepen; dat herdefinieert `groep_klassement()` en is een eigen issue.

## Aannames
- De vijf is vast en de groepenklem is 20/10: een keuze van de bouwer, geen besluit van Quinten.
- `group_name` gaat mee, een icoon niet; een lid kan beide al lezen.
- Niet gemeten: het queryplan op echte datavolumes en de vergelijking met productie (`functies:controle`, `register:controle`, `adviseur:controle`): dat kan pas na de uitrol.
  Een index op `points_ledger (group_id, user_id)` is niet toegevoegd; er staat een ER-rij met de voorwaarde waaronder dat nodig wordt.

## 3c-ui: het scherm (toegevoegd 22-11-2026, nog niet gebouwd tot de uitrol)

Het scherm "Alle klassementen" (variant A van A57b) volgt na de uitrol van 0338 en `npm run types:db`, als één PR met de voorbereiding eronder (de pure vorm,
het filter, de kaart en het raster).

### Besluiten van Quinten (22-11-2026, meerkeuze in de chat van de orchestrator; mijn voorstel was elke keer de gekozen optie)
- **A1: drie kolommen binnen de bestaande inhoudsbreedte van 620 px**, geen bredere schermvariant. Op een smal scherm één kolom; bij minder dan drie kaarten
  evenveel kolommen als kaarten (geen lege kolommen).
- **A4: "Alle N leden" leidt naar `/groep/[id]`**, de bestaande klassementkaart op het groepsscherm. Een eigen gepagineerd klassement per groep is een vervolgissue.
- **A5: de knop "Alle klassementen" staat bovenaan Mijn groepen zodra er minstens één groep is.** Of er klassementen zijn bepaalt de database (de RPC); een leeg scherm
  legt uit waarom het leeg is en het filtert niet op `klassement_aan` in de client.
- Eerder (zelfde dag): variant A, een groep zonder klassement krijgt geen regel, en de twee ingangen (onder de klassementkaart van een groep en bovenaan Mijn groepen).

### Onderbouwing van meer dan 15 bestanden (een afweging, geen poort)
De orchestrator besliste (22-11-2026) om 3c-ui-a (vorm, weergave, componenten, teksten, toetsen) **niet apart te landen** en onder 3c-ui-b te stapelen: apart landen had het
plafond van `BEKENDE_ONBEREIKBAAR` in `dode-exports-controle.mjs` tijdelijk moeten verhogen omdat de vormfuncties pas met het scherm een aanroeper krijgen, en een
ratel verhogen om een tussenstand te landen is wat dat plafond wil voorkomen. Het geheel raakt daarom ongeveer twintig bestanden in één PR. Dat is verantwoord doordat
het twee lagen zijn die elkaar nodig hebben (een vorm zonder scherm heeft geen aanroeper, een scherm zonder vorm heeft niets te tonen), en doordat de voorbereiding al
met eigen toetsen en mutaties is gebouwd en nagelopen voordat het scherm erbij komt.

### Aannames (3c-ui)
- De paginagrootte is tien groepen (de standaard van de RPC), het maximum twintig.
- "Jij" is een tekst en geen kleur; er komen geen nieuwe kleuren (huisstijlregel van 19-11-2026).
- Eén lege staat voor "geen groepen" en "geen klassementen", omdat de RPC die twee niet onderscheidt.
- De schermafdrukken (390 en 1280, navy en navy licht) gaan vóór de merge naar Quinten, via de orchestrator.
