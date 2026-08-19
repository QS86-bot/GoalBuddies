# Startprompt voor een nieuwe sessie

> Kopieer alles onder de streep in een nieuwe chat. Werk dit bestand bij aan het
> eind van elke sessie — het is de overdracht, niet een archief.
>
> **Laatst bijgewerkt:** 19-08-2026, na QS8-80 (De Ketting).

---

Ik bouw verder aan GoalBuddies. Lees eerst `CLAUDE.md`, dan
`docs/WERKVOORRAAD.md` (sectie 0 geeft de stand in tien regels), dan
`docs/Q-TODO.docx`. Haal daarna de openstaande issues op uit het Linear-project
GoalBuddies en werk verder volgens de volgorde in WERKVOORRAAD §4.

## STAND VAN ZAKEN

**Fase 1 is grotendeels af.** EPIC 0, 1, 2, 4, 5, 6, 7 en 10 staan. EPIC 8 is
begonnen: QS8-80 (De Ketting) is af en gemerged. EPIC 3 is deels gebouwd buiten
de volgorde om.

**Er staan 13 commits klaar om te pushen.** Ik push zelf; vraag het als je denkt
dat het moet.

**Volgende aan de beurt: EPIC 8 afmaken.** QS8-75 (reeks en punten op het
dashboard) of QS8-81 (weekpassen). QS8-81 is inhoudelijk het interessantst: het
weekpas-pad bestáát al in `herbereken_reeks()` maar wordt nooit doorlopen, want
niets schrijft `week_pass_events`. Sinds de rollover elk uur draait, wordt dat
pad echt gebruikt zodra het gevuld wordt.

Daarna: EPIC 11, 3 afmaken, 12, 9.

## WERKAFSPRAKEN — houd deze aan

1. **Eén branch per epic**, niet per issue. Na groene typecheck/lint/test/build
   lokaal met `--no-ff` naar `main` mergen.
2. **`gh` werkt sinds 18-08** (ingelogd als `QS86-bot`, scopes `repo`,
   `workflow`, `read:org`, `gist`). Roep hem aan via het volledige pad:
   `& "C:\Program Files\GitHub CLI\gh.exe"` — de `PATH` van een sessie is ouder
   dan de installatie (valkuil 19). PR's kunnen dus, maar we mergen nog steeds
   lokaal; overleg als je dat wilt veranderen.
3. **Migraties mogen direct op het echte project** (ref `wehgocadxehottiiyvsc`).
   Nummer verder vanaf **0039**. Elke migratie idempotent, met een rollback-pad
   in de kop.
4. **Vóór elke merge:** `npm run typecheck`, `npm run lint`, `npm test`,
   `npm run build` — én lees de testteller. Staat er `skipped` bij `tests/rls/`,
   dan heb je géén RLS-dekking gedraaid. Zie WERKVOORRAAD §3b.
5. **Reviewagents** (`code-critic`, `security-reviewer`, `critical-user`) aan het
   eind van elke epic, en meteen bij alles wat auth, RLS, goedkeuring, punten of
   commitments raakt. Draai ze parallel in de achtergrond. Ze vonden deze week
   in elke ronde iets blokkerends — sla ze niet over.
6. **Werk Linear bij zodra iets af is**, niet aan het eind. En gebruik "In
   Review" niet: er is geen reviewer in de solo-fase.
7. **Loop je vast op iets dat Quintens beslissing of toegang vraagt:** zet het in
   `docs/Q-TODO.docx` en ga door met het volgende issue. Niet wachten.

## VALKUILEN die deze codebase al een keer gekost hebben

- **RLS kan geen kolommen beperken.** Is de eis "deze kolom mag je niet
  veranderen" of "niet lézen", dan heb je een kolomgrant, een view met expliciete
  kolomlijst of een rijbeperking nodig. Een policy alleen is altijd te weinig.
  Vijf keer misgegaan (0006, 0010, 0019, 0023, 0029).
- **Een autorisatiegrens is pas dicht als ook het gevólg ervan op slot zit.**
  `completion_approvals` was drievoudig beveiligd en volstrekt omzeilbaar, omdat
  `weekly_goals.status` client-schrijfbaar was.
- **In een SECURITY DEFINER-RPC overleeft niets een `raise exception`.**
  PostgREST draait elke RPC in zijn eigen transactie. Elke rate limiter of
  auditregel moet in de happy path staan en een resultaat teruggeven.
- **⚠️ Een redenering die klopt zolang een tabel leeg is, is geen bescherming.**
  "Afwezigheid betekent nog niet" hield stand tot `chain_links` gevuld werd, en
  toen was het een aanwezigheidsmatrix. **Vraag bij elke tabel die van leeg naar
  gevuld gaat: wat betekent een ontbrekende rij nu?** Dit geldt nú voor
  `week_pass_events` en `ai_jobs`.
- **⚠️ Domeinregel 7 per component is niet hetzelfde als per scherm.** De Ketting
  toont aantallen zonder namen; de ledenlijst eronder toont dezelfde weekstatus
  mét naam. Geen datalek, wel een inconsistentie die geen RLS-test kan vangen.
  Staat als productbeslissing in `ENGINEER-REVIEW.md` (19-08).
- **Een `on delete set null` sneuvelt stil op een onveranderlijkheidstrigger.**
  De referentiële actie is zelf een UPDATE; een trigger die de kolom terugzet
  draait hem in dezelfde bewerking terug, zonder fout. Kostte 0031 zijn
  AVG-belofte (gerepareerd in 0033).
- **Twee insluitingen zijn geen gelijkheid.** De allowlist van systeemberichten
  werd twee kanten op getoetst en liep tóch uit elkaar. Toets gelijkheid.
- **Een kolomgrant intrekken breekt de app stil.** Typecheck en lint blijven
  groen. Zoek na een `revoke` elke `.update(` op die kolom in `src/`, `app/` én
  `tests/`.
- **Een testbestand kan niets importeren dat react-native meetrekt.** Zet pure
  logica in een eigen module (`shared/ui/metrics.ts`, `modules/buddies/schemas.ts`).
- **Postgres past de SELECT-policy ook toe op de RETURNING-rij van een INSERT.**
- **Viewkolommen zijn in de gegenereerde types altijd nullable.** Leid het rijtype
  af van `Database['public']['Functions'][...]['Returns'][number]` en voeg zelf
  nullability toe. Geeft een RPC `jsonb` terug, dan is er géén bruikbaar type en
  hoort er een handmatige controle op de velden te staan.
- **Bestanden hebben CRLF.** Meerregelige zoek-en-vervang met perl/python mislukt
  stil. Gebruik de Edit-tool. Zo is een backslash uit `/^Bearer\s+/` verdwenen.
- **Supabase weigert na ~30 aanmeldingen per uur** met "Request rate limit
  reached". De RLS-suite maakt er tien per run. Zie je een opbouwfout met "rate
  limit" erin: wacht een paar minuten, ga niet in de policies zoeken.
- **Let op je eigen limieten:** 10 groepen per gebruiker per dag, 20
  toetredingspogingen per dag, 12 leden per groep, 5 deadline-verzoeken per dag.
- **`winget install` is niet zichtbaar in een draaiend proces.** Een nieuw
  tabblad erft de oude `PATH`. Controleer eerst óf iets echt ontbreekt voordat je
  het als blokkade opschrijft — A13 stond maanden onterecht geblokkeerd.

## TE ONTHOUDEN OVER HET PRODUCT

**Domeinregel 7 (falen is nooit publiek) is de belangrijkste regel.** Bij elk
nieuw ding dat de groep te zien krijgt, drie vragen:

1. Kan hieruit iemands gemiste week worden afgeleid?
2. Kan iemand dat met één API-verzoek uitlezen, buiten de UI om?
3. **Doet een ander component op hetzelfde scherm dat alsnog?**

Er zijn drie benoemde verruimingen, besloten door Quinten: de groep mag je reeks
zien (A15), je risicostatus zien (A17) en je deadline-verschuiving zien (A7).
Onderbouwing in `docs/decisions/002-domeinregel7-oppervlakken.md` §4a. Ze
verruimen de regel op drie plekken; ze schaffen hem niet af.

⚠️ **Nooit `REPLICA IDENTITY FULL`** op `completions`, `weekly_goals` of
`chat_messages`: die staan in de realtime-publicatie en Supabase past op
DELETE-events geen RLS toe. Er staat een test op (`realtime_bewaking()`, 0027).

Begin met EPIC 8 en werk door. Vraag alleen als doorgaan-onder-aanname echt
onveilig zou zijn.
