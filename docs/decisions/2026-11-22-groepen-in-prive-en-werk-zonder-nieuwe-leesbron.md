# Groepen in Privé en Werk zonder nieuwe leesbron

**Datum:** 22-11-2026 · **Issue:** QS8-775 (epic QS8-650) · **Besluit:** Quinten, 22-11-2026, via de orchestrator
van week 48 (meerkeuze, drie keer optie A)

## Aanleiding

QS8-775 vroeg om twee secties in het tabblad Groepen, Privé en Werk, zoals variant A van de mock-up bij QS8-663
(besluit 24, punt 1). Het issue ging uit van een **migratie**: een nieuwe view of RPC die per groep zegt of het een
teamgroep is en bij welke organisatie. De reden die erbij stond was dat `fetchMijnGroepen()` geen organisatie per
groep leest.

📏 Op `origin/main` b636a3b (22-11-2026) klopte dat niet meer:

- `fetchMijnGroepen()` leest `organization_id` sinds QS8-651 (`src/modules/buddies/api.ts`).
- De naam van een organisatie is al leesbaar: kolomgrant `organizations (id, name, status, created_at)` en
  `organizations_select` (0316). Die policy geeft alleen actieve organisaties waar je zelf actief lid van bent.
- Een lid van een teamgroep is altijd actief lid van de organisatie: de trigger `group_members_teamlid` en de
  vertrek-cascade (0317).

## Besluit

1. **Geen migratie.** De indeling is een join in de client: `groepSecties()` in `src/schermen/groep/secties.ts`,
   geladen door `laadGroepenlijst()` in `src/schermen/groep/laden.ts`. Het nummer 0338 is vrijgegeven.
   *Waarom:* een nieuwe definer-RPC die hetzelfde teruggeeft als twee bestaande bronnen, is een extra oppervlak
   zonder winst. Wat niet gebouwd wordt, kan ook niet lekken.
2. **Alleen koppen.** "Privé", en per organisatie "Werk · naam", op naam gesorteerd. De kaarten blijven zoals ze
   zijn. De teambalk, de tag en de beheerkaart uit de mock-up vallen buiten dit issue.
3. **Koppen alleen als er een teamgroep is.** Zonder teamgroep blijft de lijst precies zoals hij was, en de
   organisaties worden dan ook niet opgehaald (security-ronde, punt 2). Een teamgroep van een organisatie die niet
   actief is, staat onder "Werk" zonder naam.

## Wat hiermee niet besloten is

- **Een storing op de organisaties is een foutstaat.** Hij leidt niet tot een lijst met "Werk" zonder naam: dat
  gedrag hoort bij een niet-actieve organisatie en mag niet ook de stille uitkomst van een storing zijn.
  `src/schermen/groep/laden.test.ts` bewaakt dit.
- **Paginering.** `fetchMijnGroepen()` stopt bij 50 groepen. Dat gold al vóór dit issue, maar de secties maken het
  zichtbaarder: bij meer dan 50 groepen kan een hele Werk-sectie ontbreken.

## Toetsen

- `tests/rls/groepsecties.test.ts`: de naad, met echte JWT's langs PostgREST en door dezelfde `groepSecties()`.
  Met de hand gebroken op vier punten; de metingen staan in de kop van het bestand.
- `src/schermen/groep/secties.test.ts`: de indeling zelf. Een extra toets houdt de kolomlijsten van de RLS-test
  gelijk aan die van de client.
- `src/schermen/groep/laden.test.ts`: geen extra verzoek zonder teamgroep, en een storing blijft een fout.
