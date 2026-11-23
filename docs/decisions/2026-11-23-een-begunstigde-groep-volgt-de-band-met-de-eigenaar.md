# Een begunstigde groep volgt de band met de eigenaar

**Datum:** 23-11-2026 · **Issue:** QS8-820 (meting QS8-818) · **Migratie:** 0343
**Besluit van:** Quinten (grens 1). Optie C plus drie meerkeuzevragen, 23-11.

## Wat er gemeten was

Alice zet een straf met groep X als begunstigde en verlaat X, of wordt eruit gezet.
Gemeten in QS8-818, lokaal op alle migraties van `main`:

- De straf blijft `set` met X als begunstigde.
- Alice kan hem niet meer intrekken. De WITH CHECK van `commitments_update` eist
  `is_group_member(beneficiary_group_id)`. Na een uitzetting kan ze ook niet terug.
- Wordt de straf `due`, dan lezen alle actieve leden van X de tekst, de foto en de
  stand. Dat geldt ook voor een lid dat pas ná haar vertrek toetrad, en dat kan
  sinds QS8-230 een onbekende zijn.
- `meld_commitment()` plaatst `commitment_due` in X.

Bij de getuige (QS8-306) en de teamstraf (M1, 0325) hangt het leesrecht al aan de
band tussen de eigenaar en de lezer. Bij de begunstigde groep hing het daar niet aan.

## Wat er besloten is

| Vraag | Besluit | Waarom dit advies |
|---|---|---|
| Optie A/B/C | **C: gelijktrekken.** Een straf die nog niet verschuldigd is, blijft bij vertrek staan; er komt geen automatische intrekking | Quinten, 23-11 |
| (a) Een straf die al verschuldigd was | **Ook verbergen.** X leest hem niet meer, welke stand hij ook heeft. Keert de eigenaar terug, dan leest X weer | Dit is de vorm van de getuige en de teamstraf, en het enige ontwerp waarin een later toegetreden lid niets leest. Bevriezen vraagt een vergelijking van tijdstippen die nergens anders bestaat |
| (b) X is gearchiveerd | **De band blijft.** X leest zoals nu (een archief is leesbaar, 0153). Wel kan de eigenaar intrekken, en in een archief komt geen nieuw `commitment_due` | Een archief verandert het lidmaatschap niet. Het intrekken liep op dezelfde `is_group_member` vast als bij vertrek |
| (c) Vertrek ná `due` | **Stuurloos.** De eigenaar kan de straf zelf afwikkelen (met bevestiging) of een nieuwe persoonlijke getuige kiezen, net als bij een verdwenen getuige (0244) | Zonder deze uitweg houdt de eigenaar een verschuldigde straf die niemand ziet en die hij niet kan afronden |

## Hoe het gebouwd is

- **`straf_groepsband_klopt(goal, groep)`**: de eigenaar van het doel is lid van
  de groep (`status <> 'inactive'`, een archief telt mee). Er is geen grant voor
  `authenticated`, want dan had iedereen een orakel op lidmaatschap.
  `straf_groepsband_klopt_voor_mij()` is de variant voor de policy. Die geeft
  alleen `true` aan een vrager die zelf lid van die groep is.
- **`commitments_select` tak 2** eist die band. Verder is de policy woordelijk
  die van 0325.
- **`commitments_update`**: de stand `cancelled` hoeft geen lidmaatschap meer.
  Een straf die op `set` blijft, met een nieuwe tekst, eist dat nog wel.
  Clients kunnen de begunstigde niet verzetten, want de kolomgrant laat alleen
  `body`, `image_url` en `status` toe. Blok 5b in `bewaak_begunstigde()` weigert
  het ook voor `service_role`.
- **`meld_commitment()`**: geen `commitment_due` in een groep zonder de eigenaar,
  en niet in een archief.
- **`herstel_stuurloze_straf()`**: een begunstigde groep zonder de eigenaar telt
  als stuurloos. Een nieuwe getuige vervangt de groep, want een straf draagt er
  maar één (0168). Daarvoor laat blok 5a in `bewaak_begunstigde()` precies dat ene
  geval toe: `due → due`, een persoon in de plaats, en de band echt weg.
  Afwikkelen laat de groep op de rij staan.
- **App**: de strafkaart zegt *"Getuige: een groep waar je geen lid meer van bent.
  Zolang dat zo is, krijgt die groep je straf niet te zien."* De stuurloze kaart
  verschijnt ook bij een groep die de eigenaar niet meer leest
  (`stuurlozeReden()`), met een eigen kop en uitleg.

## Wat een aanname is

- **Productie is niet gemeten.** Alles hierboven is lokaal gemeten, op Postgres 16
  met PostgREST v12.2.12 en echte JWT's.
- **Een teamaandeel met een stuurloze teamgroep:** kiest de eigenaar een nieuwe
  getuige buiten het team, dan weigert `bewaak_teamstraf()` en krijgt de app een
  fout in plaats van een reden. Afwikkelen werkt wel. Dit is niet apart gemeten.
- **Dat de naam van de groep voor de eigenaar onleesbaar is precies wanneer de
  band weg is.** `groups_select` is `mag_groep_lezen()`, en die grens is gelijk aan
  `straf_groepsband_klopt()`. Komt er een tweede leestak op `groups`, dan kan de
  kaart afwijken van de server. De server blijft dan de grendel.

## Wat dit níet is

- Geen verruiming: alle wijzigingen versmallen een leesroute of openen alleen een
  handeling voor de eigenaar zelf (intrekken of afwikkelen van zijn eigen straf).
- Een `commitment_due` dat al geplaatst is, verdwijnt niet. Een systeembericht is
  een onveranderlijke kopie (domeinregel 7, §3 van 002).
- Geen wijziging voor de persoonlijke getuige. Die volgt de band al sinds QS8-306.
