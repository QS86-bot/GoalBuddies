# Startprompt voor een nieuwe sessie

> Kopieer alles onder de streep in een nieuwe chat. Werk dit bestand bij aan het
> eind van elke sessie — het is de overdracht, niet een archief.
>
> **Laatst bijgewerkt:** 20-08-2026 (tweede sessie), na de groene notities en
> een backlogronde: QS8-106, 112, 82, 39, 76, 85 en A45.

---

Ik bouw verder aan GoalBuddies. De repo staat op
`C:\Users\Quint\.claude\projects\GoalBuddies` — **werk met absolute paden, want de
cwd van de sessie wijst vaak naar een ander project** (DN Projectbegeleiding, de
Status Tracker). Een `git log` in de verkeerde map laat een schone, andere repo
zien en dan lijkt er niets te doen.

Lees eerst `CLAUDE.md`, dan `docs/WERKVOORRAAD.md` (sectie 0 geeft de stand in
tien regels), dan `docs/Q-TODO.docx`. Haal daarna de openstaande issues op uit
het Linear-project GoalBuddies en werk verder volgens de volgorde in
WERKVOORRAAD §4.

## STAND VAN ZAKEN

Fase 1 is grotendeels af. EPIC 0, 1, 2, 4, 5, 6, 7 en 10 staan. Van EPIC 8 zijn
De Ketting (QS8-80), de weekpassen (QS8-81) en het dashboard (QS8-75) af. EPIC 3
is deels gebouwd buiten de volgorde om: poort, Edge Function en datalaag staan op
main, maar er zijn geen schermen en er is nooit een echte AI-call gedaan.

Migraties 0039 t/m 0049 zijn toegepast op het echte project. De rollover draait
elk uur. **476 tests groen over 25 bestanden, geen skips** (de RLS-suite heeft
dus echt gedraaid).

**Er staan ongeveer 46 commits klaar om te pushen. Ik push zelf.**

**EPIC 8 is af voor de MVP.** Alleen QS8-77 (dagelijkse nudge) staat nog open en
die wacht op EPIC 11: er is geen kanaal om een nudge over te versturen.

Deze ronde afgerond: QS8-106 (de vier datalaagfuncties zonder scherm), QS8-112
(een weekdoel aanmaken kon helemaal niet), QS8-82 (adempauze), QS8-39 (mijlpalen
beheren), QS8-76 (feestelijk moment) en QS8-85 (commitments informeel, met een
test die het bewaakt). A45 is gedicht in migratie 0047.

**EPIC 12 is af.** QS8-93 (de haalbaarheidsberekening), QS8-94 (de vier standen
in de UI), QS8-95 ("vraag je groep om hulp") en QS8-96 (herplannen bij een
onhaalbare deadline). Migraties 0050 en 0051, en de rollover is opnieuw
gedeployd zodat hij het risico ook echt herberekent.

⚠️ **`goals.risk_status` is dichtgezet vóórdat de radar hem ging vullen**
(migratie 0050). De drie risicokolommen wonen nu in `goal_risk`, eigenaar-only.
**Daarmee is A17 teruggedraaid**: er zijn nog twee benoemde verruimingen van
domeinregel 7 (A15 en A7), niet drie. Beslisdocument 002 en CLAUDE.md zijn
bijgewerkt.

**Volgende aan de beurt: EPIC 11, notificaties.** QS8-91 is de kern; QS8-77 (de
dagelijkse nudge uit EPIC 8) wacht daarop en kan daarna meteen mee. Let op: dit
raakt waarschijnlijk Expo-pushcredentials, en die heb ik niet — dat kan een
blokkade worden waar jij iets voor moet doen.

Daarna EPIC 3 afmaken. Dat is inmiddels het langst openstaande gat: poort, Edge
Function en datalaag staan sinds augustus op main, er is geen enkel scherm, en
er is nog nooit een echte AI-call gedaan. Dan EPIC 9.

**Er wachten vijf besluiten op Quinten**, en twee ervan hangen aan elkaar:
A41 (mag de groep zien wat er fout gaat?) en A42 (blijven punten privé?) uit de
groene notities raken domeinregel 7 in de kern. Verder A43 (minpunten bij
zelfstandig verschuiven), A44 (is "zakelijke doelen" de koers?) en A46 (TRUNCATE
intrekken). A37 staat er ook nog. Alles staat in `docs/Q-TODO.docx`, secties H, I en J, met de
onderbouwing van de groene notities in `docs/GROENE-NOTITIES.md`.

## WERKAFSPRAKEN — houd deze aan

1. **Eén branch per epic**, niet per issue. Na groene typecheck/lint/test/build
   lokaal met `--no-ff` naar main mergen.
2. `gh` werkt (ingelogd als QS86-bot, scopes repo, workflow, read:org, gist).
   Roep hem aan via het volledige pad: `"C:\Program Files\GitHub CLI\gh.exe"` —
   de PATH van een sessie is ouder dan de installatie. PR's kunnen dus, maar we
   mergen nog steeds lokaal; overleg als je dat wilt veranderen.
3. Migraties mogen direct op het echte project (ref `wehgocadxehottiiyvsc`).
   **Nummer verder vanaf 0047.** Elke migratie idempotent, met een rollback-pad
   in de kop.
4. Vóór elke merge: `npm run typecheck`, `npm run lint`, `npm test`,
   `npm run build` — **én lees de testteller.** Staat er "skipped" bij
   `tests/rls/`, dan heb je géén RLS-dekking gedraaid en zegt groen niets over
   autorisatie. Zie WERKVOORRAAD §3b.
5. **Reviewagents naar risico, niet naar schema** (herzien 20-08-2026, zie
   CLAUDE.md regel 19 voor de onderbouwing):
   - **`security-reviewer` draait direct**, bij elke wijziging die auth, RLS,
     punten, goedkeuring, commitments of een nieuw groepszichtbaar oppervlak
     raakt. Nooit uitstellen: die bevindingen stapelen op wat je erbovenop bouwt,
     fouten worden gekopieerd naar de volgende functie, en de database is nu nog
     leeg — dat is tijdelijk.
   - **`code-critic` en `critical-user` één keer per milestone**, samen in één
     opdracht. Hun vondsten rotten niet: dode code en copy kosten over drie
     maanden evenveel om te repareren. Samen in één opdracht scheelt ongeveer een
     derde, want ze lezen anders dezelfde bestanden koud in.
   - Bij een puur UI-issue hoeft er dus geen enkele agent te draaien.
   - **Verifieer elke bevinding zelf voordat je hem verwerkt.** In de ronde van
     20-08 was de zwaarste bevinding aantoonbaar onjuist — ze las een
     migratiebestand waar de gedeployde functie strenger was — terwijl twee
     andere kritieke bevindingen wél klopten.
   - Wat je uitstelt vang je zelf op met een controlepas: dode code, dubbele
     teksten, ontbrekende loading-/error-/lege staat, een component dat op het
     verkeerde scherm kan belanden, en copy die een regel uitlegt die de
     gebruiker anders moet raden.
6. Werk Linear bij zodra iets af is, niet aan het eind. Gebruik "In Review" niet:
   er is geen reviewer in de solo-fase.
7. Loop je vast op iets dat mijn beslissing of toegang vraagt: zet het in
   `docs/Q-TODO.docx` en ga door met het volgende issue. Niet wachten.

## VALKUILEN die deze codebase al een keer gekost hebben

- **RLS kan geen kolommen beperken.** Is de eis "deze kolom mag je niet
  veranderen" of "niet lézen", dan heb je een kolomgrant, een view met expliciete
  kolomlijst of een rijbeperking nodig. Zeven keer misgegaan.
- **Een autorisatiegrens is pas dicht als ook het gevólg ervan op slot zit** —
  én als je álle routes naar dat gevolg hebt gezocht. Eén gat kostte deze week
  **vier migraties** (0043 t/m 0046): 0023 dichtte `weekly_goals.status` voor
  *wijzigen*, en niemand keek naar *aanmaken*, *verwijderen*, *doorschuiven* en
  *de rij wissen vóór de rollover*. Elke ronde bleek de vorige reparatie te smal,
  en in ENGINEER-REVIEW stond het al die tijd als opgelost afgevinkt.
- **Een vergelijking met een mogelijk lege waarde is in SQL geen controle.**
  `x <> y` is geen bewering over ongelijkheid zodra één kant leeg kan zijn, maar
  een derde antwoord dat zich in een `if` als "niet waar" gedraagt. Zo gaf een
  SECURITY DEFINER-functie de weekpasvoorraad van elk willekeurig doel terug.
  Goedkope test die op elke definer-functie past: roep hem aan als
  `service_role`, want daar is `auth.uid()` leeg.
- **De repo en het project lopen uit elkaar, in béíde richtingen.** Migraties
  gaan via een MCP-tool, dus `supabase/migrations/` is een verslag en geen bron.
  Andersom net zo: een reviewbevinding las een migratiebestand waar de gedeployde
  functie strenger was, en meldde een gat dat niet bestond.
  `pg_get_functiondef()` is de waarheid.
- **In een SECURITY DEFINER-RPC overleeft niets een `raise exception`.**
  PostgREST draait elke RPC in zijn eigen transactie. Elke rate limiter of
  auditregel moet in de happy path staan en een resultaat teruggeven.
- **Een ontbrekende policy weigert stil, niet luid.** Bij UPDATE en DELETE
  filtert RLS de rijen weg en dat is geen fout — de client krijgt HTTP 204 en een
  ongewijzigde tabel. Een test die op `42501` rekent wordt dan groen zonder iets
  te bewijzen. Toets de úítkomst, of trek het tabelrecht in als je een luide
  weigering wilt.
- **Een redenering die klopt zolang een tabel leeg is, is geen bescherming.**
  Vraag bij elke tabel die van leeg naar gevuld gaat: wat betekent een ontbrekende
  rij nu? `chain_links` en `week_pass_events` zijn dit stadium door; **`ai_jobs`
  is de laatste die nog leeg is.**
- **Een test kan net naast de bescherming kijken.** Drie keer gebeurd, laatst
  deze week: de domeinregel-7-test op `cancelled` draaide op twee gebruikers die
  helemaal niet samen in een groep zaten, dus hij bleef groen als je de
  bescherming eruit sloopte. **Zet bij elke "de groep mag dit niet zien"-test een
  positieve controle: de groep móét het toegestane wél zien.**
- **Domeinregel 7 per component is niet hetzelfde als per scherm.** De Ketting
  toont aantallen zonder namen; de ledenlijst eronder toont dezelfde weekstatus
  mét naam. Geen datalek, wel een inconsistentie die geen RLS-test kan vangen.
- **Een "on delete set null" sneuvelt stil op een onveranderlijkheidstrigger.**
  De referentiële actie is zelf een UPDATE; een trigger die de kolom terugzet
  draait hem in dezelfde bewerking terug, zonder fout.
- **Twee insluitingen zijn geen gelijkheid.** Toets gelijkheid, niet twee keer
  een kant.
- **Een kolomgrant intrekken breekt de app stil**; typecheck en lint blijven
  groen. Zoek na een revoke elke `.insert(` en `.update(` op die kolom in `src/`,
  `app/` én `tests/` — en schrijf meteen de tegentest ("het normale geval werkt
  nog").
- **Een comment die uitlegt waarom iets zo moet, bewijst niet dat het zo is.**
  Het scherm "Vandaag" haalde onophoudelijk gegevens op omdat er objecten in een
  dependency-array stonden — met de comment erboven die precies uitlegde waarom
  dat niet mocht.
- **Een reflexvalkuil werkt niet als tekst.** De CRLF-val stond op de lijst, was
  gelezen, en ging op één dag alsnog drie keer mis — je leest een lijst op het
  moment dat je nadenkt, niet op het moment dat je een commando intikt. Hij is
  daarom vervangen door `.gitattributes` met `eol=lf`; de bestanden staan nu als
  LF op schijf. **Schrijf je iets nieuws op, vraag dan eerst of het een controle
  kan worden in plaats van een zin.**
- **Een issue op Done betekent niet dat een mens erbij kan.** QS8-43 en QS8-44
  stonden allebei afgevinkt omdat de datalaag klaar was, terwijl er geen scherm
  was om een weekdoel aan te maken — de kernlus van de app was niet met de hand
  te doorlopen. Dat is het afgevinkte vakje uit CLAUDE.md, maar omgekeerd: geen
  gat dat als opgelost gemeld stond, maar een feature die als af gemeld stond.
  **Vraag bij een frontend-issue: welk scherm roept dit aan?**
- **Een RPC die je in één transactie nodig hebt, kun je niet uit losse
  PATCH-verzoeken opbouwen.** `milestones_goal_order_uniq` staat op DEFERRABLE
  INITIALLY DEFERRED, dus herordenen mag binnen één transactie botsen. PostgREST
  geeft je er per verzoek precies één, dus drie updates achter elkaar lopen
  gegarandeerd stuk — met een halfverschoven lijst en geen bruikbare fout.
  Herkenbaar aan: DEFERRABLE in de constraint-definitie.

- **"Herbevestigen vóór X" in een beslisdocument is goud waard — als iemand het
  leest.** A17 zei "de groep mag je risicostatus zien", met de aantekening dat
  het opnieuw bekeken moest worden vóór EPIC 12, omdat de radar die status uit
  gemiste weken afleidt. Bij het bouwen van EPIC 12 is dat gebeurd en het besluit
  ging om. **Schrijf zo'n aantekening op zodra een besluit aan een toekomstige
  feature hangt** — en lees het beslisdocument voordat je aan die feature begint,
  niet erna.

- **⚠️ `pg_proc` is niet de hele codebase. De rollover is een Edge Function.**
  Ik zocht naar wie `weekly_goals.status = 'excused'` schrijft, vond in alle
  databasefuncties niets, en concludeerde dat het lek pas bij QS8-82 scherp zou
  komen te staan. Fout: `supabase/functions/rollover/index.ts` zette die status
  al, elk uur. Wat ontbrak was invoer (niets schrijft `breathers`), niet code.
  Nul rijen betekende "geen munitie", niet "geen schrijver". **Zoek een schrijver
  altijd in `pg_proc` én in `supabase/functions/`** — die map valt buiten
  typecheck, lint en CI, en dus ook buiten je zoekopdracht. Gedicht in 0047.
- **Een CHECK-constraint die een waarde toestaat, is een belofte dat hij ooit
  voorkomt.** Vraag bij elke statuswaarde twee dingen: wie schrijft hem, en wie
  kan hem lézen. De schermen deden het hier trouwens wél goed — `rangeState()`
  verbergt `excused` netjes voor de groep. Dat is de derde keer dat de UI klopte
  en de database niet.

- **Supabase weigert na ~30 aanmeldingen per uur** met "Request rate limit
  reached". De RLS-suite maakt er tien per run. Zie je een opbouwfout met "rate
  limit" erin: wacht een paar minuten, ga niet in de policies zoeken. Een tweede
  gezicht hiervan is "JWT issued at future" — klokverschil, ook geen policyfout.
- **Let op de limieten die je zelf hebt ingebouwd:** 10 groepen per gebruiker per
  dag, 20 toetredingspogingen per dag, 12 leden per groep, 5 deadline-verzoeken
  per dag, 2 weekpassen tegelijk, 24 uur bedenktijd.
- **`supabase/functions/` valt buiten typecheck, lint én CI**, en geen workflow
  deployt ze. Wie een migratie toepast maar de deploy vergeet, heeft een half
  werkende feature zonder één signaal. Draai `npm run edge:sync` vóór elke deploy.

## TE ONTHOUDEN OVER HET PRODUCT

**Domeinregel 7 (falen is nooit publiek) is de belangrijkste regel.** Bij elk
nieuw ding dat de groep te zien krijgt, drie vragen: kan hieruit iemands gemiste
week worden afgeleid, kan iemand dat met één API-verzoek uitlezen buiten de UI
om, en doet een ander component op hetzelfde scherm dat alsnog?

Er zijn drie benoemde verruimingen, door mij besloten: de groep mag je reeks zien
(A15), je risicostatus zien (A17) en je deadline-verschuiving zien (A7).
Onderbouwing in `docs/decisions/002-domeinregel7-oppervlakken.md` §4a. Ze
verruimen de regel op drie plekken; ze schaffen hem niet af.

**Het puntenmodel:** plafond +2, vloer +1, gemiste week −1, adempauze 0, een
buddy beoordelen +1. Een weekpas beschermt de reeks, niet het punt. Punten zijn
privé. Score en voortgang zijn twee dingen en staan nooit in één balk. Een
leesbaar overzicht van de spelregels en het motivatiemodel staat in
`docs/GoalBuddies — spelregels en motivatie.docx`.

**Vier uitwegen als er iets misgaat, en ze zijn bewust verschillend:**
verwijderen (binnen 24 uur, niets mee gebeurd, gratis), afsluiten (`cancelled`,
telt als gemist zodra de week voorbij is), doorschuiven (het werk verhuist, de
gemiste week blijft gemist) en archiveren (voor een doel met geschiedenis).

**Nooit `REPLICA IDENTITY FULL`** op `completions`, `weekly_goals` of
`chat_messages`: die staan in de realtime-publicatie en Supabase past op
DELETE-events geen RLS toe. Er staat een test op (`realtime_bewaking()`,
migratie 0027).

Begin met EPIC 11 en werk door volgens de volgorde hierboven. Vraag alleen als
doorgaan-onder-aanname echt onveilig zou zijn.
