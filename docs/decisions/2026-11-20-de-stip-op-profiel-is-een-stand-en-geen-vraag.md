# De stip op Profiel is een stand en geen vraag — QS8-777

Besluit Quinten, 20-11-2026 (optie A van het visuele voorstel): een stip op de tab Profiel en de kaart "Er wacht een
melding" bovenaan Profiel, alleen voor een beheerder met een open melding.

## Wat er gebouwd is

- `src/shared/ui/meldingstip.ts`: een kleine stand (`zetMeldingWacht`, `useMeldingWacht`). `Taakbalk` leest hem en kent de
  datalaag niet.
- `Meldingwacht` in `app/_layout.tsx`: één `fetchOpenstaandeMeldingen({ limiet: 1 })` per sessie, uit bij uitloggen.
- `MeldingenIngang` in `app/(tabs)/profiel.tsx`: nu bovenaan, en zet dezelfde stand na een geslaagde lading.
- Beide `Taakbalk`-vormen: de stip staat naast het label Profiel, en op een telefoon ook in de kop van het dichte menu.

## Waarom zo

- **De rol staat nergens in de schermlaag.** De RPC `openstaande_meldingen` geeft alleen een rij aan wie mag beoordelen.
  Een rolcontrole in `Taakbalk` of de wacht was een tweede bron van waarheid naast de database. Geen RLS-wijziging.
- **Een stand en geen vraag per scherm.** Een RPC bij elke navigatie voor elke gebruiker is verkeer dat voor bijna
  iedereen niets oplevert. Eén vraag per sessie plus de vraag die Profiel al stelde.
- **De stip staat ook in de kop van het dichte menu.** Op een telefoon is het menu standaard dicht
  (`MENU_BEGINSTAND_OPEN = false`); een stip alleen op de tab zou dan pas zichtbaar zijn na een tik, en dat is niet wat
  het besluit bedoelt.
- **Een storing zet de stand niet om.** "Het ophalen mislukte" is niet "er wacht niets". De kaart op Profiel zegt de
  storing zelf, zoals QS8-586 al besloot.
- **Domeinregel 7:** de stip en zijn label zeggen alleen dát er een melding wacht, voor de beheerder zelf. Geen naam,
  geen groep, geen gemiste week.

## Wat niet gemeten is

- De stip is in een gerenderde `Taakbalk` getoetst (jsdom, `react-native-web`), niet op een apparaat en niet met een echte
  beheerder; de RPC is hier niet aangeroepen.
- Een nieuwe melding terwijl de app open staat verschijnt pas bij de volgende sessie of een bezoek aan Profiel.
  Verversen op een tijdschema of realtime is een eigen besluit.
