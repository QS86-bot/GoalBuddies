# De nieuwe huisstijl vervangt A55 en "rustig gereedschap" (QS8-722, poort van de epic QS8-721)

**Wie besloot en wanneer.** Quinten, 19-11-2026, in vier rondes. ⚠️ **De besluiten staan hier zoals ze in Linear (QS8-721 en QS8-722)
en in het bestand fase-1-acceptatiecriteria.md in docs/research (§1, §11, §13 en §14) staan** (dat bestand staat op de tak
`claude/habithuddle-app-ontleding`, niet op `main`). Ik heb ze niet rechtstreeks van Quinten gelezen en niet nagemeten tegen een scherm.
**Zonder zijn aftekening blijven QS8-723 (1.1a) en QS8-729 (1.5a) geblokkeerd** (acceptatiecriterium 4 van QS8-722).

## Wat het vervangt

| Oud | Waar | Nieuw |
|---|---|---|
| **A55** (QS8-255): kleur alleen waar hij iets codeert, drie categoriekleuren in het navy-stelsel | `docs/decisions/` en `CLAUDE.md` *Stack* | Een stelsel van **zeven uiterlijken** (A, B, C met kleurvarianten; 14 paletten), de gebruiker kiest zelf |
| *"Rustig gereedschap met momenten van vreugde"* | `docs/PRODUCT-PROPOSAL.md` r.316, QS8-252 | Een kleurrijker, ruimer en vriendelijker uiterlijk in de stijl van Habit Huddle (de indeling zo dicht mogelijk, de uitvoering eigen) |
| *"Gebruik Q-Projects-kleurstellingen, verzin nooit een kleur bij"* en *"gedeeld met de Status Tracker"* | kop van `src/shared/theme/tokens.ts`, `CLAUDE.md` *Stack* | **Eigen kleurwaarden.** De Status Tracker en GoalBuddies mogen uit elkaar lopen (E3) |

**Wat niet vervalt:** het heldenpalet (QS8-470) blijft een uitzondering voor heldenoppervlakken; domeinregel 7 (falen is nooit publiek) en de
kleur-regel `red` = alleen deadline-risico, nooit een gemiste week, gelden voor elk uiterlijk.

## De keuze voor eigen waarden naast het ToS-risico

Habit Huddle verbiedt in zijn voorwaarden (§7) het gebruik van *"trademarks and trade dress … in connection with any product or service
without our prior written consent"*. Daarom: **de indeling en de patronen (zijnavigatie, paginakop, kaart met één grote handeling, maat van
radius en afstand) zo dicht mogelijk bij hun werk; kleurwaarden, pictogrammen, mascotte, namen en teksten eigen.** Er zijn geen kleurwaarden
uit hun schermen overgenomen. GoalBuddies had in PRD 10.1 al een groene richting (emerald); een blauwgroen accent op donker (uiterlijk A en
C-Baai) is een eigen keuze. ⚠️ Dit is een inschatting van een ontwikkelaar en geen juridisch advies; "vergelijkbaar genoeg om een probleem
te zijn" is een vraag voor de jurist uit QS8-649 (besluit 33), met dezelfde voorwaarde: **herbevestigen vóór de eerste organisatie live gaat.**

## De Status Tracker (E3)

Het stelsel was gedeeld; dat eindigt. Een kleur in GoalBuddies hoeft niet meer eerst in `tracker.q-projects.tech` te bestaan, en een wijziging
daar dwingt hier niets af. Het `navy`/`navy-licht`-stelsel in `src/shared/theme/tokens.ts` blijft de **huidige stand** tot QS8-723 landt; de
kop van dat bestand zegt dat nu zo.

## Een benoemde uitzondering op de emoji-regel (QS8-111)

**Emoji uitsluitend in het prestatiecomponent** (QS8-732, 1.6b), naast de reacties (A24). **Niet** in knoppen, labels, systeemberichten of
meldingen. Reden: op een prestatiekaart ís de emoji de boodschap, zoals bij een reactie. ⚠️ `npm run emoji:controle` wordt pas aangepast in
QS8-732; tot dan blijft hij rood bij elke emoji in app-tekst, en de uitzondering is een besluit zonder uitvoering.

## Voorkeur op het account, in een aparte tabel

De uiterlijkvoorkeur (stijl, kleurvariant, weergave, dichtheid) staat in een **aparte, eigenaar-only tabel** en niet op `profiles`
(QS8-729). Reden: `profiles_select` laat groepsleden andermans rij lezen en alleen een kolomgrant (0089) beperkt dat tot `id`, `display_name`
en `avatar_url`; **RLS kan geen kolommen beperken.** Een voorkeur hoort bij een gebruiker en niet bij een apparaat (steun: CRE-175).
Het type `ThemePreference` heeft nu de waarden `systeem | navy | navy-licht`; wat daarmee gebeurt bij de komst van zeven uiterlijken is het
werk van QS8-723 en QS8-729, niet van dit besluit.

## Twee nieuwe dependencies

`expo-linear-gradient` (het verloop van uiterlijk C) en `react-native-svg` (meerkleurige pictogrammen). Gemeten: alleen `@expo/vector-icons`
staat nu in `package.json`. Installeren met `npx expo install` zodat de versies bij de Expo-SDK passen, en toetsen dat web-export én native
bouwen. Hostinger-regel: geen Vercel-specifieke packages. **Dit is een afweging onder de Beslisbevoegdheid en geen gate; het is hier verantwoord.**

## Prestaties, XP en niveau: besloten, nog niet gebouwd

Een aparte XP-teller die alleen optelt, privé voor de eigenaar, naast het puntentotaal van domeinregel 10 (QS8-734); zichtbaar in het
Prestatiescherm en het eigen profiel, nergens anders. Een XP-concept naast het privé puntentotaal is **een nieuw feit voor domeinregel 10**; de
regels staan in QS8-734 en horen daar in `CLAUDE.md` te landen op het moment dat die migratie landt, niet nu. Delen van een prestatie in één
groep naar eigen keuze (QS8-736), ook in teamgroepen, is een nieuw groepszichtbaar oppervlak met `security-reviewer`; het staat **uit tot QS8-649
geland is** voor teamgroepen. Een gedeeld prestatiebericht verdwijnt bij accountverwijdering: dat is een **tweede benoemde uitzondering naast
QS8-335** op de regel dat een systeembericht blijft staan.

## Verhouding tot QS8-649 (zakelijk gebruik)

Beide richtingen kunnen naast elkaar: het uiterlijk is een per-gebruiker-voorkeur en raakt de organisatielaag niet. Het enige snijpunt is het
delen van een prestatie in een teamgroep (hierboven: uit tot QS8-649 geland is). Een teamgroep blijft onder domeinregel 7 zwaarder, niet lichter.

## Wat dit besluit niet doet

Geen app-code, geen migratie, geen token gewijzigd. `CLAUDE.md` (*Stack* en *Emoji*) en de kop van `tokens.ts` zijn bijgewerkt zodat ze het
besluit niet meer tegenspreken. **Niet bijgewerkt:** `docs/WERKVOORRAAD.md` r.1970 (*"Design | Q-Projects navy-stelsel, gedeeld met de Status
Tracker"*) en `docs/PRODUCT-PROPOSAL.md` r.316 — dat zijn de stand en een gedateerd voorstel; wie ze bijwerkt, doet dat bij de eerste landing
van QS8-723. `src/shared/ui/Text.tsx`, `themes.ts` en `scripts/maak-iconen.mjs` noemen het navy-stelsel als beschrijving van wat er **nu** staat en
kloppen tot QS8-723.
