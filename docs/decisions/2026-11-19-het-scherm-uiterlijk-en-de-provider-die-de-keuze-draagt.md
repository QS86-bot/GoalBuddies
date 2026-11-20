# Het scherm Uiterlijk en de provider die de keuze draagt

QS8-731, 19-11-2026. Bouwt op QS8-722 (besluiten), QS8-723/724/725 (paletten), QS8-729 (datalaag).

## Wat er staat

- Een eigen route met de onderdelen in `src/schermen/uiterlijk/`; Profiel had één kaart
  (`UiterlijkIngang`) die erheen leidde en verving de oude `ThemaKeuze`. *(Sinds 20-11-2026, QS8-754: de route
  is vervallen en het scherm is een onderdeel van Instellingen; de kaart is vervangen door één ingang naar
  Instellingen.)*
- Keuzes: stijl A/B/C, bij C een kleurvariant, weergave, dichtheid en de emoji-schakelaar, met een
  voorvertoning die `useTheme()` leest (dezelfde tokens als de app; het uiterlijk geldt direct).
- `UiterlijkProvider` (`src/modules/uiterlijk/react.tsx`) draagt de keuze en rendert `ThemeProvider`. De
  gedeelde laag mag de datalaag niet importeren (eslint, QS8-423), dus `ThemeProvider` bewaart niets meer en
  krijgt de keuze als prop (`Themakeuze`, een eigen type: `Uiterlijkvoorkeur` is eraan toewijsbaar, een waarde
  erbij in de module is een typefout).
- `Uiterlijkwacht` in `app/_layout.tsx` meldt de gebruiker aan de provider; die verzoent dan met de account.

## Besluiten van de bouwsessie (geen besluit van Quinten nodig)

1. **Eerste render uit de lokale kopie, nooit het netwerk.** Een account die niet bereikbaar is, ook omdat
   migratie 0303 nog niet op productie staat, laat de lokale keuze gelden; het scherm zegt dat rustig.
2. **Een verzoening die na een keuze terugkomt, verliest** (teller), en `verzoenMetAccount` loopt in dezelfde
   rij als `kiesVoorkeur`, zodat hij geen oudere stand lokaal terugzet. Gevonden door de spec-ronde.
3. **De oude sleutel `goalbuddies.thema` wordt alleen nog gelezen** (via `legacyWeergave`), nooit meer
   geschreven. `ThemePreference`, `themeForPreference`, `parsePreference` en `uiterlijkVoorVoorkeur` zijn weg:
   twee waarheden over dezelfde keuze waren erger dan een brug die niemand meer gebruikt.
4. **Dichtheid werkt door in `afstandVoor()`** (compact = driekwart, minimaal 3).

## Aannames (niet gemeten)

- **De factor 0,75 is een aanname**, niet op een toestel gezien.
- **Dichtheid en emoji veranderen in de app vandaag alleen de voorvertoning en de nieuwe schermen.** Bestaande
  schermen en componenten rekenen met `space` en niet met `theme.afstand`; emoji heeft pas een afnemer bij
  QS8-732. Zonder die vervolgstappen is de keuze zichtbaar maar grotendeels stil.
- **Een gebruiker zonder bewaarde keuze en met een licht toestel krijgt donker** (de standaard uit E8/E9; vroeger
  was de standaard "systeem"). Wie "systeem" bewaard had, houdt het.
- **Zonder gebruiker (voor het aanmelden) wordt niets bewaard**; het scherm staat achter auth.
- **De selectie is te zien aan een dikkere rand en tekstkleur, plus `accessibilityState.selected`** (de
  bestaande `Choice`); niet alleen aan kleur, maar niet getoetst met een schermlezer.
- Niet gemeten: het verloop van C op een echt toestel; alleen typecheck en unit-tests.
