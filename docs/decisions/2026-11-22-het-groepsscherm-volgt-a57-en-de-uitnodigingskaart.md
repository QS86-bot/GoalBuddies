# Het groepsscherm volgt A57, en de uitnodigingskaart wijst naar de schakelaar — QS8-666, deel 3b

Datum: 22-11-2026. Geen migratie. Tweede van drie PR's voor de schermen (3a schakelaar, 3b groepsscherm en uitnodigingskaart,
3c "Alle klassementen"), zoals Quinten koos. Deze PR bouwt voort op #790 en landt daarna.

## Besluiten van Quinten waar dit op leunt
- 20-11-2026, visueel voorstel V3, telkens optie A: een beschermde groep toont de volledige lijst; de heldenlijst verdwijnt
  als een open groep beschermd wordt; aan- en uitzetten gaat met een schakelaar in Groepsbeheer **plus een uitnodigingskaart
  voor beheerders** in een groep zonder klassement (B3).
- 22-11-2026: de uitnodigingskaart krijgt **geen wegklikknop**; wegklikken per beheerder is QS8-784 (met migratie).

## Wat er gebouwd is
- `klassementPlek(uitkomst, groep, beheerder)` beslist wat er op de plek van het klassement staat: `lijst`, `fout`,
  `uitnodiging` of `niets`. **De RPC wint van de vlag**: rijen betekent lijst, ook als de gelezen groep nog `klassement_aan = false`
  zegt. Het scherm kent de regel van A57 niet; `groep_klassement()` is de poort.
- De rij "Op deze pagina" noemt het klassement precies als de kaart er staat (`klassement` hangt aan `klassementPlek() === 'lijst'`),
  en de helden alleen in een open groep die geen teamgroep is. Dat zijn twee beslissingen waar het één was (`open`).
- `KlassementUitnodiging`: een kaart met één knop die naar Groepsbeheer wijst. Geen eigen aanroep, geen eigen bevestiging, geen
  wegklikknop. Na terugkeer via de kaart herlaadt het scherm; niet na elke focus (zes RPC's per keer op schaal).
- `toonKlassementUitnodiging()` en `klassementPlek()` staan in `src/modules/buddies/klassement-poort.ts` zonder enige import, zodat de
  RLS-toets ze naast de database kan leggen (`lib/supabase` trekt `react-native` mee en dat laadt in Node niet).

## Toetsing
- `tests/rls/klassement-uitnodiging.test.ts`: per soort groep de rij zoals het scherm hem leest (`select('*')`) naast een sondering van
  `zet_groepsklassement(p_bevestigd => false)`, die `not_confirmed` geeft precies als het aanzetten verder zou komen; plus de keten
  uit -> uitnodiging -> aanzetten -> lijst. Met de hand gebroken op twee grendels (`!klassement_aan` weg, `kanKlassementZetten` vervangen
  door `beheerder`); beide werden rood op de bedoelde rijen.
- Statische toetsen: de kaart wijst naar `/groep/beheer/<id>`, Groepsbeheer rendert `<KlassementSchakelaar`, de kaart doet zelf geen RPC,
  `fetchGroep` leest met `select('*')`, de inhoudsrij hangt aan de lijst.

## Aannames
- De kaarttekst is een voorstel van mij (geen tekst van Quinten op QS8-666 gevonden); hij belooft alleen "een gemiste week komt er nooit
  in voor" en noemt de punten van vóór vandaag niet: dat staat in het bevestigingsblad van de schakelaar.
- Een slapende groep (`sleeping`) krijgt de kaart wel; `zet_groepsklassement()` weigert alleen `archived`.
- `beheerder` komt uit `fetchMijnLidmaatschap().role === 'admin'`; de database gebruikt `is_group_admin()`. Een inactief lid met die
  rol haalt dit scherm niet; niet apart gemeten.
- `fetchMijnGroepen()` is ongewijzigd: het lijstscherm toont niets over het klassement. 3c voegt `klassement_aan` toe als "Alle klassementen" het nodig heeft.
- Niet gemeten: `useFocusEffect` met een ref op web en native, en het uiterlijk op een toestel. De schermafdrukken van de kaart komen bij 3c.
- Deze PR raakt meer dan 15 bestanden niet; hij bevat wel een verplaatsing (de poortfuncties naar een eigen bestand). Elke verhuizing is
  nagelopen op de belofte erachter: de bestaande toetsen op `kanKlassementZetten` en `toonKlassementUitnodiging` staan nog en zijn rood te maken.
