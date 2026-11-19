# De nieuwe huisstijl vervangt A55 en "rustig gereedschap" (QS8-722, poort van de epic QS8-721)

**Wie besloot en wanneer.** Quinten, 19-11-2026, in zeven rondes. ⚠️ **De besluiten staan hier zoals ze in Linear (QS8-721 en QS8-722)
en in het bestand fase-1-acceptatiecriteria.md in docs/research (§1, §11, §13 en §14) staan** (dat bestand staat op de tak
`claude/habithuddle-app-ontleding`, niet op `main`). Ik heb ze niet rechtstreeks van Quinten gelezen en niet nagemeten tegen een scherm.
**Afgetekend op 19-11-2026 behalve XP en het delen van prestaties** (de aftekening kwam via de orchestrator-sessie, niet rechtstreeks naar mij); XP is daarna besloten in QS8-734, het delen is OPEN (zie de secties hieronder). QS8-723 (1.1a) is vrij; QS8-729 (1.5a) wacht op een migratie en dus op de nummerketen.

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

## XP en niveau: besloten, in een eigen teller

**Bron en volgorde.** Eerst tekende Quinten dit document af *behalve XP* (Linear QS8-722, reacties van 12:21 en 12:31). Daarna kwam het
XP-besluit: QS8-734, sectie *Besluiten (Quinten, 19-11-2026, vierde ronde)*, en het bestand fase-1-acceptatiecriteria.md in docs/research (§14.2 en §14.5,
op de tak `claude/habithuddle-app-ontleding`). Het epic QS8-721 noemt XP sindsdien niet meer als open. ⚠️ Dat is geen reactie van Quinten op
QS8-722 zelf; de tekst staat in de beschrijving van QS8-734, en die is hier de bron.

**Wat besloten is.**

| Onderdeel | Besluit |
|---|---|
| Wat XP is | Een **aparte teller** naast je persoonlijke punten. Hij **telt alleen op** en daalt nooit. Niet: een hernoeming van je punten (afgeraden: een dalend niveau is bewijs van een gemiste week, domeinregel 7) |
| Wie leest | **Alleen de eigenaar.** Niveau en XP staan alleen op het Prestatiescherm en op je eigen profiel; niet in het menu, niet voor groepsleden |
| Weekbedragen | Plafond gehaald **20**, vloer gehaald **10**, gemiste week **0** (nooit negatief), adempauze **0** |
| Badges | XP naar zeldzaamheid, **10 (gewoon) tot 200 (legendarisch)**. De vijf bestaande: `first_goal`, `first_milestone`, `first_review` = gewoon (10); `streak_4` = ongewoon (25); `streak_12` = zeldzaam (50) |
| Niveaus | **Tien, genummerd, zonder titels** (geen titels of schaal van Habit Huddle, ToS §7). Drempels in totaal-XP: **20, 50, 100, 180, 300, 480, 750, 1150, 1700, 2500**, in één bron |
| Bestaande gebruikers | **Terugwerkend**, met één eenmalige migratie uit `points_ledger` en `badges`: rollback-pad in de kop, `pg_dump` vooraf, idempotent (unieke sleutel per bron; een tweede run voegt niets toe) |

Bedragen en drempels zijn bijstelbaar na gebruik (QS8-734).

**Waarom dit domeinregel 10 niet schendt.** `points_ledger` blijft eigenaar-only en append-only en `cycle_missed` blijft −1; XP raakt dat niet.
De twee grenzen die regel 10 trekt gelden ook hier: geen gedeeld totaal (A42), en score en voortgang nooit in één element. Een XP-tabel krijgt
daarom dezelfde vorm als `badges`: geen UPDATE of DELETE, ook niet voor `service_role`; SELECT alleen voor `user_id = auth.uid()`; een JWT-test
met een groepslid. `security-reviewer` direct. De regels staan nu ook in `CLAUDE.md` onder domeinregel 10; de getallen alleen hier en in QS8-734.

**Niet gebouwd.** Dit document bouwt niets. De migratie wacht op de nummerketen en op Quintens *"backup gedaan"* (QS8-734 criterium 8).

## Overige besluiten uit de vijfde tot zevende ronde

Bron: fase-1-acceptatiecriteria.md in docs/research, §15 en §16 (Quinten, 19-11-2026) en de aanvulling *vijfde en zesde ronde* op QS8-722.

| Onderwerp | Besluit | Bron |
|---|---|---|
| Emoji uitzetten | De gebruiker mag emoji **uitzetten** met een schakelaar in het scherm Uiterlijk (vijfde voorkeur). De twee emoji-uitzonderingen zijn reacties (A24) en prestatiekaarten (QS8-732) | QS8-722 aanvulling punt 3; §15 |
| Statusrood | **Eén statusrood voor de hele app** (niet per uiterlijk). Koraal blijft en het rood schuift mee (QS8-743). Het risico: `red` is het kleinst-gedeelde token en betekent uitsluitend deadline-risico; elke familie moet 10 afstand houden | §16; QS8-722 aanvulling punt 1 |
| Avondgloed-amber | Blijft; het verwarringsrisico met oranje en goud is **geaccepteerd** | QS8-722 aanvulling punt 2; §15 |
| Voorkeur | Eigenaar-only tabel (hierboven). Bij twee apparaten **wint de laatste keuze** | QS8-722 aanvulling punt 4; §15 |
| Helden | Maakt een palet een held onleesbaar, dan staat die op een **eigen neutraal bord**; de uitzondering van QS8-470 blijft | QS8-722 aanvulling punt 5; §15 |

⚠️ **Statusrood: geen Linear-reactie gevonden.** QS8-743 zelf (beschrijving en reacties) noemt *één rood of per uiterlijk* nog als open vraag met mijn
advies *één rood*; het besluit staat alleen in §16 van het onderzoeksbestand en in de opdracht aan deze sessie. Dat is traceerbaar maar niet
rechtstreeks. Wie QS8-743 bouwt, leest de reacties daar eerst.

## Poort QS8-744: de belofte als commitment (besloten, niets gebouwd)

Bron: Linear QS8-744, reactie van Quinten van 12:58 (*Besluiten Quinten 19-11-2026 (vervolg)*) en die van 12:49; §16.

1. **Gevolg:** vrije tekst (`commitments.body`), nooit geld (QS8-86, 22-09-2026), vrijblijvend en zelf gekozen.
2. **Systeem:** het bestaande commitment wordt hergebruikt, geen aparte tabel.
3. **Periode:** de eigen week van de gebruiker (`currentUserCycle`, domeinregel 1).
4. **Wie:** een groep of één getuige, door de gebruiker gekozen. Die krijgen pas leesrecht als het gevolg verschuldigd wordt (domeinregel 11).
5. **Aanbod:** pas als de gebruiker een groep of getuige heeft; niet in de onboarding.
6. **Bevestiging:** een aparte stap waarin de gebruiker gevolg, periode en wie het ziet leest en expliciet bevestigt, vastgelegd in het auditspoor (domeinregel 5).
7. **Terugdraaien:** kan tot het gevolg verschuldigd wordt; daarna blijft het staan.
8. **Accountverwijdering:** dezelfde regel als QS8-335; **geen tweede uitzondering**.

Wat hierna moet: een `spec-planner`-ronde en bouwissues met `security-reviewer` direct. De belofte uit de vragenlijst is een nieuwe route naar een
commitment; de naad tussen vragenlijst en commitment krijgt een eigen test (regel 18).

## Delen van een prestatie (QS8-736): OPEN, niet afgetekend

**Quinten schreef op 19-11-2026 om 12:43 op QS8-722: het delen van een prestatie met de groep en het verwijderen van een gedeeld bericht bij
accountverwijdering zijn *niet* afgetekend**; elk vraagt een eigen besluit met de twee vragen van domeinregel 7 (kan hieruit een gemiste week
worden afgeleid; kan iemand dat met één API-verzoek uitlezen) en, voor het wissen, een afweging tegen de uitzondering van 0221. Tot die
besluiten er zijn: niet bouwen.

Wat in QS8-736 en §14.5 al als keuze staat, is hier **voorstel en geen besluit**, omdat de reactie van 12:43 nieuwer is dan de beschrijving:

- Delen per prestatie, in één groep naar eigen keuze, 5 per dag, alle leden van die groep zien het bericht (QS8-736, vijfde ronde).
- **Voorgestelde uitzondering bij accountverwijdering:** een gedeeld `prestatie_gedeeld`-bericht verdwijnt mee met het account, naast die van QS8-335
  (alleen `commitment_due` en `commitment_unlocked`). Eisen als het besloten wordt: gewist in dezelfde transactie; alleen dit type; een test
  die toont dat andere typen blijven staan; lichaam van de bestaande verwijderfunctie uit `main` en niet uit een oude migratie.
- Delen in teamgroepen blijft uit tot QS8-649 geland is.

⚠️ **`CLAUDE.md` bij domeinregel 7 is daarom niet aangepast** en `docs/decisions/002-domeinregel7-oppervlakken.md` ook niet: een uitzondering die
nog niet besloten is, hoort daar niet als regel te staan. Zodra Quinten besluit, komt ze op beide plekken, met rij en reden.

## Verhouding tot QS8-649 (zakelijk gebruik)

Beide richtingen kunnen naast elkaar: het uiterlijk is een per-gebruiker-voorkeur en raakt de organisatielaag niet. Het enige snijpunt is het
delen van een prestatie in een teamgroep (open, en uit tot QS8-649 geland is). Een teamgroep blijft onder domeinregel 7 zwaarder, niet lichter.

## Wat dit besluit niet doet

Geen app-code, geen migratie, geen token gewijzigd. `CLAUDE.md` (*Stack* en *Emoji*) en de kop van `tokens.ts` zijn bijgewerkt zodat ze het
besluit niet meer tegenspreken. **Niet bijgewerkt:** `docs/WERKVOORRAAD.md` r.1970 (*"Design | Q-Projects navy-stelsel, gedeeld met de Status
Tracker"*) en `docs/PRODUCT-PROPOSAL.md` r.316 — dat zijn de stand en een gedateerd voorstel; wie ze bijwerkt, doet dat bij de eerste landing
van QS8-723. `src/shared/ui/Text.tsx`, `themes.ts` en `scripts/maak-iconen.mjs` noemen het navy-stelsel als beschrijving van wat er **nu** staat en
kloppen tot QS8-723.
