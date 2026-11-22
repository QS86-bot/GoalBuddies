# De uitnodigingskaart van het klassement — QS8-666, deel 3b-2

Datum: 22-11-2026. Geen migratie. Tweede deel van de splitsing die Quinten koos (3b-1 het groepsscherm, 3b-2 deze kaart); deze PR bouwt voort op 3b-1.

## Besluiten van Quinten waar dit op leunt
- 20-11-2026, V3, optie B3: een uitnodigingskaart voor beheerders in een groep zonder klassement, naast de schakelaar (B1).
- 22-11-2026: **geen wegklikknop**; wegklikken per beheerder is QS8-784 (eigen issue, met migratie).
- 22-11-2026 ~18:40 UTC, na het zien van de afdrukken: **"Ja, tekst en kaart akkoord"** (via de orchestrator). De kaarttekst, die eerst een voorstel van de bouwer was, is daarmee het besluit van Quinten.

## Wat er gebouwd is
- `KlassementUitnodiging`: een kaart met één knop die naar Groepsbeheer van deze groep wijst. **Hij zet niets aan:** de schakelaar van 3a met zijn
  bevestigingsblad blijft de enige weg. Een tweede bevestigingspad is een tweede plek waar de belofte aan alle leden kan afwijken.
- `toonKlassementUitnodiging(groep, beheerder)` (een weergavehint: beheerder, geen teamgroep, niet automatisch, niet gearchiveerd, klassement uit) en
  `klassementPlek(uitkomst, groep, beheerder)` krijgt de uitkomst `uitnodiging`. **De RPC-uitkomst wint:** rijen betekent altijd lijst, nooit kaart.
- Herladen na terugkeer gebeurt alleen na een bezoek aan Groepsbeheer via deze kaart (ref + `useFocusEffect`), niet bij elke focus (zes RPC's per keer op schaal).
- De poortfuncties staan in `klassement-poort.ts` zonder imports, zodat de RLS-toets ze kan laden (`lib/supabase` trekt `react-native` mee).

## Toetsing
- `tests/rls/klassement-uitnodiging.test.ts`: per soort groep de rij zoals het scherm hem leest (`select('*')`) naast een sondering van
  `zet_groepsklassement(p_bevestigd => false)`, die `not_confirmed` geeft precies als het aanzetten verder zou komen; plus de keten uit -> uitnodiging ->
  aanzetten -> lijst. Op een lokale stack 6/6 groen; met de hand gebroken op twee grendels (`!klassement_aan` weg; `kanKlassementZetten` vervangen door `beheerder`).
- Statische keten (`tests/beloftes/klassement-uitnodiging-keten.test.ts`): de kaart wijst naar `/groep/beheer/<id>`, Groepsbeheer rendert `<KlassementSchakelaar`,
  de kaart doet geen eigen RPC en heeft één knop, `fetchGroep` leest met `select('*')`.
- Securityreview: akkoord, geen kritieke of middelzware bevinding. De sondering controleert bij archief, automatisch en team alleen `not.toBe('not_confirmed')`; dat is voor een hint voldoende maar minder scherp.

## Aannames
- De kaarttekst was een voorstel van de bouwer (op QS8-666 stond geen tekst van Quinten) en is sinds 22-11 zijn besluit (zie boven). Hij belooft alleen "een gemiste week komt er nooit in voor".
- Een slapende groep (`sleeping`) krijgt de kaart wel; `zet_groepsklassement()` weigert alleen `archived`.
- `beheerder` komt uit `fetchMijnLidmaatschap().role === 'admin'`; de database gebruikt `is_group_admin()`. Een inactieve oud-beheerder haalt zo'n scherm vermoedelijk niet; niet gemeten.
- Niet gemeten: `useFocusEffect` met een ref op web en native, en het uiterlijk op een toestel (de schermafdrukken zijn door Quinten gezien en goedgekeurd: https://claude.ai/artifact/67JtZeQTJFqC5i4Hw5MHDv).
