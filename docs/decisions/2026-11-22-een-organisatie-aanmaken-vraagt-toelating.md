# Een organisatie aanmaken vraagt toelating — QS8-776, migratie 0337

**Datum:** 22-11-2026 · **Issue:** QS8-776 (vervolg op QS8-663) · **Migratie:** `supabase/migrations/0337_een_organisatie_aanmaken_vraagt_toelating.sql`

## Aanleiding

QS8-663 verbergt de knop "Organisatie aanmaken" achter `ORGANISATIE_AANMAKEN_ZICHTBAAR`
(`src/modules/organisaties/zichtbaarheid.ts`). Dat volgt op besluit 33 en op het besluit van Quinten van
20-11-2026 (punt 3): zolang de juridische toets niet klaar is, kom je een organisatie alleen binnen met een
uitnodiging of een code.

**Verborgen is niet afgeschermd.** 📏 `maak_organisatie()` uit 0316 heeft `grant execute … to authenticated` en
toetst alleen of je ingelogd bent, de naam, de dagteller en het plafond. Elke ingelogde gebruiker kon dus via
PostgREST een organisatie aanmaken. Gemeten op productie op 22-11-2026, alleen gelezen: 0 organisaties, laatste
migratie 0336.

## Het besluit van Quinten (22-11-2026, via de orchestrator)

Er lagen twee meerkeuzevragen onder grens 1, want wie een organisatie mag aanmaken is wat de app een mens belooft.

1. **Optie A: een allowlist per persoon.** De tabel is `organisatie_aanmakers(user_id, toegevoegd_op, reden)`.
   - RLS staat aan, en `anon` en `authenticated` krijgen geen grant.
   - Alleen Quinten vult de lijst, via SQL of `service_role`.
   - De lijst begint leeg.
   - Een weigering geeft `{ok:false, reason:'niet_toegelaten'}`, met een eigen zin in het Nederlands en het Engels.

   Afgewezen:
   - een globale schakelaar (alles of niets);
   - schakelaar en allowlist samen (twee bronnen);
   - een aanmaakcode (een nieuw raadoppervlak).
2. **"Nee, knop blijft verborgen."** `ORGANISATIE_AANMAKEN_ZICHTBAAR` blijft hard `false`. Voor wie wél is
   toegelaten blijft `/organisatie/nieuw` de enige weg. Er komt geen RPC die de client vertelt of hij mag.

## Wat er gebouwd is

- **`organisatie_aanmakers`:** RLS aan en **geen policy**, dus deny-all voor iedereen buiten de eigenaar. De vorm en
  de reden zijn dezelfde als bij `opslag_dagtellers` (0233). Daarnaast staat er
  `revoke all … from public, anon, authenticated` (regel 4: `authenticated` met zoveel woorden). De primaire sleutel
  is `user_id` en verwijst naar `profiles(id)` met `on delete cascade`. Daarmee is die sleutel ook de index op de
  foreign key (regel 11), en een verwijderd account neemt zijn toelating mee.
- **`maak_organisatie(text)`:** het lichaam is woordelijk dat van 0316, de laatste definitie op `main`, plus één
  blok "Toelating" direct na de inlogtoets.
- **De client:** de reden `niet_toegelaten` wordt `organisatie.niet_toegelaten` in `src/modules/organisaties/api.ts`,
  met een zin in `nl.ts` en `en.ts`.

### Waarom de toets vóór de lock en de dagteller staat

Een weigering verbruikt niets: geen advisory lock en geen telling in `organisaties`. De reden die terugkomt, is
voor wie niet op de lijst staat altijd `niet_toegelaten`, ook bij een lege naam. De weigering zegt dus niets over
naam, plafond of dagteller. De conservatieve kant: wie later wordt toegelaten, begint met een lege teller.

### Wat de RPC wél over jezelf zegt (security-review, laag)

`maak_organisatie('')` geeft `niet_toegelaten` aan wie niet op de lijst staat, en `ongeldige_naam` aan wie er wel
op staat. Die tweede probe maakt niets aan en telt niet. Een gebruiker kan dus aan de RPC zien of hij zelf mag.
Over een ander zegt hij niets. Dat schuurt licht met "geen RPC die de client vertelt of hij mag", maar er is geen
manier om iemand te weigeren zonder het hem te vertellen. Het is niet afgedekt.

**Wordt zwaarder als:** de lijst ooit iets anders gaat betekenen dan "mag een organisatie aanmaken", bijvoorbeeld
een betaalstatus of een rol die je niet over jezelf hoort te weten.

### Waarom geen lezen voor de gebruiker zelf

Een policy "je mag je eigen rij lezen" zou de client laten weten of hij mag. Daarmee bouw je de RPC van optie 2.1,
en die heeft Quinten afgewezen. De enige lezer is `maak_organisatie()`, en die is `security definer`.

## Tests

- **`tests/rls/organisatie-aanmaken.test.ts` toetst de naad**, via PostgREST met echte JWT's:
  - een gewone gebruiker krijgt `niet_toegelaten`, en er landt geen organisatie;
  - vier weigeringen tellen niet mee voor de dagteller;
  - een toegelaten gebruiker slaagt en is daarna beheerder;
  - van de lijst af betekent weer dicht;
  - `authenticated` en `anon` kunnen de lijst niet lezen, er niet op schrijven, hem niet wijzigen en er niets uit
    wissen (`42501`);
  - `anon` kan de RPC niet aanroepen.

  In hetzelfde bestand staat de toets dat de constante `false` is. Zo staan de knop en de databaseregel in één suite,
  zoals het issue vraagt.
- **Met de hand geijkt op een lokale stack** (PG16 en PostgREST 12.2.12, opgebouwd uit `supabase/migrations/`):
  - `maak_organisatie()` lokaal terugzetten naar de vorm van 0316 maakt precies de drie toetsen rood die de
    weigering beloven (`expected 'ok' to be 'niet_toegelaten'`);
  - een `grant all` met een open policy op de tabel maakt precies de twee recht-toetsen rood
    (`expected undefined to be '42501'`);
  - na herstel is alles weer groen.
- **De bestaande suites die een organisatie nodig hebben, laten hun maker eerst toe** met
  `laatOrganisatieAanmaken()` uit `tests/rls/organisatie-toelating.ts`, als `service_role`. Dat is bewust een
  handeling in elke suite en geen eigenschap van `createTestUser()`. Stond elke testgebruiker vanzelf op de lijst,
  dan toetste geen enkele suite meer wat een gewone gebruiker overkomt.

## Afwegingen onder *Beslisbevoegdheid*

- **Meer dan 15 bestanden.** Er zijn veertien bestaande RLS-testbestanden geraakt, elk met één regel en één import.
  Dat is het directe gevolg van "de lijst begint leeg": zonder die regel worden ze rood op `niet_toegelaten`. Er is
  geen inhoudelijke wijziging aan hun beloftes.
- **Productie.** Er staan 0 organisaties, dus er is niemand die na de uitrol een recht verliest dat hij gebruikte.
  Quinten moet zichzelf of een testpartner met de hand toevoegen voordat hij een organisatie kan maken. De SQL
  daarvoor staat in de kop van 0337.

## Pad terug

Zet `maak_organisatie(text)` terug naar het lichaam uit 0316 en `drop table public.organisatie_aanmakers`. Staan er
rijen in die Quinten met de hand gezet heeft, dan is dat grens 2: eerst `pg_dump`. Wil Quinten het aanmaken later
voor iedereen openzetten (de juridische toets is klaar), dan is dat een nieuwe migratie én het omzetten van
`ORGANISATIE_AANMAKEN_ZICHTBAAR`, samen. De toets in `tests/rls/organisatie-aanmaken.test.ts` wordt dan rood, en
dat is de bedoeling.
