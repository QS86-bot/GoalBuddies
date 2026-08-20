# Startprompt voor een nieuwe sessie

> Kopieer alles onder de streep in een nieuwe chat. Werk dit bestand bij aan het
> eind van elke sessie — het is de overdracht, niet een archief.
>
> **Laatst bijgewerkt:** 20-08-2026, na EPIC 8 (weekpassen, dashboard) en vier
> migraties die de reeks echt beschermd hebben.

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

Migraties 0039 t/m 0046 zijn toegepast op het echte project. De rollover is
opnieuw gedeployd en geverifieerd. 432 tests groen, geen skips.

**Er staan ongeveer 35 commits klaar om te pushen. Ik push zelf.**

**Volgende aan de beurt:** EPIC 8 afmaken. QS8-82 (adempauze) is het enige dat
zelfstandig te bouwen is — QS8-77 (dagelijkse nudge) hangt aan EPIC 11, want er
is nog geen kanaal om een nudge over te versturen. Daarna EPIC 11, EPIC 3
afmaken, 12, 9.

**⚠️ Het grootste knelpunt is geen issue maar een scheefgroei.** De datalaag
loopt vóór op de schermen. `schuifDoor()`, `sluitWeekdoelAf()`,
`verwijderWeekdoel()` en `verwijderDoel()` zijn gebouwd, getest, met nette
Nederlandse meldingen — en worden door **geen enkel scherm** aangeroepen.
Datzelfde geldt voor de hele Doelcoach-keten. Overweeg vóór EPIC 11 een ronde
langs de doelen- en weekdoelschermen om die achterstand in te lopen; dat is
goedkoper dan er nog een laag bovenop bouwen.

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
5. **Reviewagents** (code-critic, security-reviewer, critical-user) aan het eind
   van elke epic, en meteen bij alles wat auth, RLS, goedkeuring, punten of
   commitments raakt. Draai ze parallel in de achtergrond. Ze vonden in élke
   ronde iets blokkerends — sla ze niet over. **Maar verifieer hun bevindingen
   zelf voordat je ze verwerkt**: in de laatste ronde was de zwaarste bevinding
   aantoonbaar onjuist, terwijl twee andere kritieke bevindingen wél klopten.
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
- **Bestanden hebben CRLF.** Meerregelige zoek-en-vervang met perl/python
  mislukt stil; gebruik de Edit-tool of match op `\r\n`.
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

Begin met EPIC 8 afmaken en werk door. Vraag alleen als doorgaan-onder-aanname
echt onveilig zou zijn.
