# De nieuwe huisstijl vervangt A55 en "rustig gereedschap" (QS8-722, poort van de epic QS8-721)

**Wie besloot en wanneer.** Quinten, 19-11-2026, in zeven rondes. ⚠️ **De besluiten staan hier zoals ze in Linear (QS8-721 en QS8-722)
en in het bestand fase-1-acceptatiecriteria.md in docs/research (§1, §11, §13 en §14) staan** (dat bestand staat op de tak
`claude/habithuddle-app-ontleding`, niet op `main`). Ik las de reacties van Quinten op QS8-722 (tot en met 13:37), QS8-743 en QS8-744 op 19-11-2026 zelf in Linear; de rest komt uit de beschrijvingen en het onderzoeksbestand. Niet nagemeten tegen een scherm.
**Afgetekend op 19-11-2026, inclusief XP, het delen van prestaties en de tweede uitzondering bij accountverwijdering.** De eerste aftekening (12:21 en 12:31) liet XP open en de reactie van 12:43 het delen en het wissen; de reactie van Quinten op QS8-722 van **13:37** vervangt die drie en is de nieuwste tekst. Er staat in dit document niets meer open dat Quinten nog moet beslissen. QS8-723 (1.1a) is vrij; QS8-729 (1.5a) wacht op een migratie en dus op de nummerketen.

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

**Bron en volgorde.** Eerst tekende Quinten dit document af *behalve XP* (Linear QS8-722, reacties van 12:21 en 12:31; de reactie van 13:37 vervangt ze). Daarna besloot hij XP, en
bevestigde hij dat **rechtstreeks op QS8-722, reactie van 13:37** (*"onze vragenrondes gelden; dit vervangt de twee reacties van 12:21 en 12:43"*, punt 1; de reactie van 12:31 is daarmee ook achterhaald, want ze zegt hetzelfde als die van 12:21).
De getallen komen uit QS8-734, sectie *Besluiten (Quinten, 19-11-2026, vierde ronde)*, en uit het bestand fase-1-acceptatiecriteria.md in docs/research
(§14.2 en §14.5, op de tak `claude/habithuddle-app-ontleding`).

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

**Statusrood: bron is de reactie van Quinten op QS8-743 van 12:49** (*"Besluit Quinten 19-11-2026: één statusrood voor de hele app"*: geen eigen rood
per uiterlijk; één nieuwe waarde die op alle uiterlijken en paletten, donker en licht, Koraal inbegrepen, de contrast- en kleurenblindheidstoets haalt en
deadline-risico blijft betekenen). De beschrijving van QS8-743 noemt het nog als open vraag; de reactie is nieuwer. QS8-725 (Koraal) blijft geblokkeerd tot QS8-743 af is.

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

## Delen van een prestatie (QS8-736) en wissen bij accountverwijdering: besloten

⚠️ **Correctie na de review van 19-11-2026, en ze raakt de onderbouwing, niet het besluit.** Een eerdere versie van deze sectie (en van `CLAUDE.md`) zei dat een gedeeld bericht de naam "als platte tekst" in andermans chat achterlaat. **Dat is sinds migratie 0213 (QS8-372) niet waar:** geen enkele functie bakt nog een naam in `body`, bestaande bodies zijn herschreven naar *"Een lid …"*, en de persoon zit alleen in `subject_id` en `actor_id`, die bij accountverwijdering door `on delete set null` leeg worden (het scherm toont dan *"Een oud-lid"*). Die premisse stond ook in QS8-736 zelf. Wat overblijft is een product- en privacykeuze van Quinten: wie zijn account opzegt, neemt ook de prestatieberichten mee die hij deelde. **Quinten kan dit besluit herbevestigen met de juiste feiten; tot die tijd geldt zijn besluit van 13:37 zoals het staat.**

**Bron.** Quinten op QS8-722, reactie van 13:37 op 19-11-2026, punt 2 en 3 (die de reactie van 12:43 vervangt), met de uitwerking in QS8-736
(vierde en vijfde ronde) en §14.5 van het onderzoeksbestand. ⚠️ De reactie van 12:43 zei *niet afgetekend*; de reactie van 13:37 is nieuwer en wint.

**Het besluit.**

- Delen is een handeling van de gebruiker, **per prestatie, in één groep naar keuze**; er gaat niets automatisch en er is geen "deel met alle groepen".
- **Limiet:** vijf gedeelde prestaties per gebruiker per dag (QS8-736 schrijft: de dag volgens de tijdzone van de gebruiker). Bijstelbaar. ⚠️ `tel_dagteller()` (0234) telt een glijdend venster vanaf `now()` en geen kalenderdag; welke van de twee de bouw wordt, kiest en meldt QS8-736.
- **Zichtbaarheid:** alle leden van die groep, zoals elk systeembericht.
- **Teamgroepen:** het delen wordt voor elk groepstype geschreven, maar staat voor een teamgroep **uit; aanzetten kan pas nadat QS8-649 geland is én zijn eigen besluit er expliciet ruimte voor maakt** (zo staat het in QS8-736). Dat is dus geen automatische schakelaar. Dit verruimt het besluit van
  QS8-649 (teamgroepen zijn zwaarder beschermd) en is door Quinten bewust gekozen; teamgroepen bestaan nog niet in de code.
- **Een tweede benoemde uitzondering bij accountverwijdering:** het gedeelde prestatiebericht (`prestatie_gedeeld`) verdwijnt mee met het account, naast
  die van QS8-335 (wissing in migratie 0247). Alleen dit type, en alleen de berichten waarvan hij het **onderwerp** (`subject_id`) is; geen ander systeembericht.

**De inhoud van het bericht.** Het noemt de persoon en de prestatie (de badgesleutel), **nooit een titel, notitie, niveau, XP of datum van behalen (`earned_at`).** De payload is de badgesleutel en verder niets. Alleen een prestatie
die de gebruiker echt heeft behaald kan gedeeld worden, afgedwongen in de RPC (`badges` voor `auth.uid()`), niet alleen in de UI.

**De twee vragen van domeinregel 7.** *Kan hieruit een gemiste week worden afgeleid?* Nee: het bericht is positief, noemt geen niveau en geen XP, en een
persoon die niets deelt zegt daarmee niets (delen is vrijwillig; `badges.ts`: *"de badge die er níét staat, is het signaal"* wordt juist door vrijwilligheid
tegengehouden). *Kan iemand het met één API-verzoek buiten de UI om uitlezen?* Alleen de leden van die ene groep, via de bestaande leesregel van
`chat_messages`; de badges zelf blijven eigenaar-only.

⚠️ **Twee voorwaarden waaraan dat "nee" hangt, voor de bouw.** (1) Delen is altijd een uitdrukkelijke handeling: geen voorgeselecteerd vinkje en geen "deel nu"-prompt per verdiende badge, want dan wordt *niet delen* een patroon waaruit iets af te leiden valt. (2) **Alleen een expliciete deelbaar-lijst**: elke nieuwe badge krijgt de twee vragen van domeinregel 7 voordat hij erop komt. Voor de vijf huidige badges is het "nee" gemeten; een toekomstige badge die alleen na tegenslag te verdienen is (een herstart- of vloerbadge), zou het breken via de sleutel zelf. Realtime: geen `REPLICA IDENTITY FULL`, geen abonnement op DELETE.

**De afweging tegen de uitzondering van QS8-335 (0247).**

| | QS8-335 (0247): `commitment_due`, `commitment_unlocked` | Dit besluit: `prestatie_gedeeld` |
|---|---|---|
| Wat bleef er zonder uitzondering staan | Een bewering over een straf, **terwijl de administratie die haar staaft** (commitment en auditspoor) wel gewist werd. (Bij het besluit van 08-09 stond daar ook de naam als platte tekst; sinds 0213 niet meer) | Een bericht *"Een oud-lid heeft een prestatie behaald"* zonder persoonsgegevens: de verwijzing is leeg. Dat is geen privacylek maar een achtergebleven spoor van iemand die weg wil |
| Wat gaat er verloren voor de groep | Een bewering zonder bewijs | Een positief bericht. Er is geen administratie die erachter gewist wordt, en er verdwijnt geen tegenslag. Wel de **onveranderlijkheid** van systeemberichten, voor een tweede type |
| Wissen of anonimiseren | Wissen (anonimiseren laat een zin over een straf staan die niemand kan navragen) | Wissen, zoals Quinten besloot. Anonimiseren is al wat 0213 en `on delete set null` doen; het besluit gaat verder dan dat |
| Reikwijdte | Alleen twee typen, met de vertrekker als onderwerp | **Alleen één type**; `goal_completed` en gewone berichten blijven staan |

**Wat het kost.** Domeinregel 7 zegt dat een systeembericht een onveranderlijke kopie is die de autorisatie overleeft waaronder hij gemaakt is. Dat
krijgt nu een tweede uitzondering, opgeschreven op de plek waar de regel staat (`CLAUDE.md`, domeinregel 7). De prijs: de groepsgeschiedenis
kan achteraf een positief moment kwijt zijn, en een volgend berichttype heeft een precedent om zich op te beroepen. **Dat precedent is geen argument:** de uitzondering rust op Quintens keuze voor dit type en niet op een lek dat er niet is.
**Verleg die grens niet als bijvangst**: elk ander systeembericht blijft onder de regel vallen, en er weer een uit halen is een besluit met dezelfde zwaarte.

**Eisen aan de bouw (QS8-736, niet in dit issue).** Wissen van de berichten waarvan de gebruiker het **onderwerp (`subject_id`)** is, **vóór** `delete from auth.users` (daarna is `subject_id` leeg en is het wissen een no-op, zie 0247) en in dezelfde transactie; een test dat er daarna geen
`prestatie_gedeeld`-bericht van die gebruiker meer bestaat en dat andere typen blijven staan; het lichaam van de bestaande verwijderfunctie komt uit
`main` (`pg_get_functiondef()` is de waarheid, een register in een functielichaam botst zonder conflict); een nieuw type systeembericht vraagt een migratie
(CHECK `chat_messages_system_event_bekend` en `chat-schemas.ts` in dezelfde wijziging); `security-reviewer` direct. **Het bouwen van het delen blijft een
eigen issue (QS8-736); dit document bouwt niets.** Rij 50 in `docs/decisions/002-domeinregel7-oppervlakken.md` is voor dit oppervlak toegevoegd.

## Verhouding tot QS8-649 (zakelijk gebruik)

Beide richtingen kunnen naast elkaar: het uiterlijk is een per-gebruiker-voorkeur en raakt de organisatielaag niet. Het enige snijpunt is het
delen van een prestatie in een teamgroep (besloten, en uit tot QS8-649 geland is). Een teamgroep blijft onder domeinregel 7 zwaarder, niet lichter.

## Wat dit besluit niet doet

Geen app-code, geen migratie, geen token gewijzigd. `CLAUDE.md` (*Stack* en *Emoji*) en de kop van `tokens.ts` zijn bijgewerkt zodat ze het
besluit niet meer tegenspreken. **Niet bijgewerkt:** `docs/WERKVOORRAAD.md` r.1970 (*"Design | Q-Projects navy-stelsel, gedeeld met de Status
Tracker"*) en `docs/PRODUCT-PROPOSAL.md` r.316 — dat zijn de stand en een gedateerd voorstel; wie ze bijwerkt, doet dat bij de eerste landing
van QS8-723. `src/shared/ui/Text.tsx`, `themes.ts` en `scripts/maak-iconen.mjs` noemen het navy-stelsel als beschrijving van wat er **nu** staat en
kloppen tot QS8-723.
