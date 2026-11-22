# De schakelaar van het klassement in Groepsbeheer — QS8-666, deel 3a

Datum: 22-11-2026. Geen migratie; de database (0333, 0336) lag er al. Dit is de eerste van drie PR's voor de schermen
(3a schakelaar en L3-tekst, 3b groepsscherm en uitnodigingskaart, 3c "Alle klassementen"), in die volgorde en elk op
een eigen tak, zoals Quinten koos.

## Besluiten van Quinten (22-11-2026, in zijn eigen sessie)

1. **Keuze B1:** de schakelaar staat in Groepsbeheer, voor een beheerder, met een bevestigingsblad.
2. **De aanzettekst belooft alleen de gemiste week** ("Een gemiste week komt er nooit in voor"). Niet "een punt dat je
   verliest komt er ook niet in": een ingetrokken goedkeuring boekt een correctie mét groep, dus de stand kan binnen het
   venster van vijftien minuten dalen. Alleen de gemiste week is een belofte die de database houdt (CHECK
   `points_ledger_gemist_is_niet_van_een_groep`).
3. **De tekst zegt dat de punten "ook die van vóór vandaag" zichtbaar worden.** `points_ledger` bewaart de `group_id`
   altijd, en uitzetten wist niets: de RLS-toets "houdt de punten bewaard" legt dat vast.
4. **Een vindbare groep krijgt één extra zin:** wie er later bij komt, ziet het klassement ook.
5. **L3:** de bevestiging bij "vindbaar maken" noemt dat het klassement uitgaat en door een beheerder apart weer
   aangezet kan worden (`zet_groepsontdekbaarheid()` zet het uit, 0336).
6. **Wegklikken van de uitnodigingskaart per beheerder** is een eigen issue (QS8-784, met migratie) en hoort niet in
   deze reeks; de kaart in 3b krijgt dus geen wegklikknop.

## Wat er gebouwd is

- `Schakelaar` in `src/shared/ui`: een tik roept niets aan, hij opent het blad. Pas "Ja" roept
  `zetGroepsklassement(groepId, !aan, true)` aan. De database weigert zonder `p_bevestigd`; het scherm is de tweede rem.
- `kanKlassementZetten()` is een **weergavehint** (beheerder, geen teamgroep, niet automatisch, niet gearchiveerd) en
  beslist niets; elke weigerreden van de RPC heeft een eigen tekst in `klassementMeldingen()`. De naadtest
  `tests/beloftes/klassement-zet-redenen.test.ts` leest de redenen uit de laatste definitie in de migraties en wordt
  rood als er een reden bijkomt zonder tekst.
- `OntdekKaart` is uit `app/groep/beheer/[id].tsx` gehaald, zonder gedrag te veranderen. Reden: dat scherm is de langste
  functie van de schermlaag (regel 15) en de schakelaar mocht het niet laten groeien. `regel15:controle` zakt daardoor
  van 553 naar **513** en het plafond is meegezakt.
- `useBevestigdeWissel` deelt de vier toestanden van "blad open, bezig, fout, melding" tussen de twee kaarten.
- `zetOntdekbaar()` geeft nu `{ ontdekbaar, klassement }` terug, de stand uit het antwoord van de RPC (`null` als die
  niet meldt: dan laat het scherm zijn eigen stand staan). Een groep die **open** wordt krijgt het klassement erbij
  (besluit 45); het scherm leest die stand terug in plaats van de regel na te bouwen.

## Wat een aanname is

- Gemeten: de RPC-meldingen, de gate, de bewaarde punten en de L3-teksten staan onder test en zijn met de hand
  gebroken. Niet gemeten: het uiterlijk op een echt toestel. De schermfoto's op 390 en 1280 komen bij de oplevering
  van 3c, waar het scherm staat dat Quinten gekozen heeft (regel 4: niets visueels buiten zijn keuze).
- `toonKlassementUitnodiging()` stond in deze PR maar had geen scherm (`exports:controle` werd rood). Hij komt in 3b
  terug samen met de kaart die hem gebruikt, zodat het register niet groeit.
