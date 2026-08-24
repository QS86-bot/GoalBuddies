# Startprompt voor een nieuwe sessie

> Kopieer alles onder de streep in een nieuwe chat. Werk dit bestand bij aan het
> eind van elke sessie — het is de overdracht, niet een archief.
>
> **Laatst bijgewerkt:** 24-08-2026, na de merge van `main` in de
> QS8-83/91-branch: de deploy, EPIC 9 en de i18n-infrastructuur komen erbij.

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

Fase 1 is inhoudelijk af: elke epic staat, 0 t/m 12. EPIC 9 (het commitment
device) is sinds 21-08 af, en EPIC 11 op de aflevering na — zie hieronder.

**De app is live op `goalbuddies.q-projects.tech`** (QS8-99/QS8-100). Deployen is
één commando:

```bash
npm run deploy      # bouwen, .htaccess schrijven, scannen op geheimen, uploaden
npm run deploy:droog  # alleen tonen wat er zóu vertrekken
```

Daarvoor heb je eenmalig `HOSTINGER_API_TOKEN` in `.env` nodig.

⚠️ De secret-scan in die deploy is aantoonbaar werkend: er is met opzet een
service-role-key in `dist/` gezet en de deploy sloeg af met de vindplaats erbij.
**Een controle die nog nooit rood is geweest, is een aanname en geen controle.**

De rollover en de meldingenjob draaien elk uur tegen het echte project.

**QS8-115 is af** (In Review, 24-08): `src/shared/ui`, alle zeven modules én
alle schermen in `app/` lopen via de berichtencatalogus. `npm run tekst:controle`
meldt nul en draait mee in `/audit`. Eén criterium blijft open en dat vraagt een
mens: de app in het Engels doorlopen.

⚠️ **De valkuil die dat opleverde staat in de lijst hieronder** — een
meetinstrument dat groen wordt, is niet klaar met ijken.

⚠️ **Het migratiebereik en de testteller staan in `docs/WERKVOORRAAD.md` §0 en
§2, en bewust alleen daar.** Tot 23-08 stonden ze ook hier, en toen liepen ze
uiteen — vijf keer op één dag. `npm run docs:controle` wordt rood zodra ze weer
op twee plekken staan. Zie QS8-125.

⚠️ **Lees de testteller.** Staat er "skipped" bij `tests/rls/`, dan heb je géén
RLS-dekking gedraaid en zegt groen niets over autorisatie. Zie §3b van de
werkvoorraad.

**Alles staat op `main` en is gepusht.** PR #1 is op 23-08 gemerged als
`bbbd1be`. Dat was de eerste PR van dit project; zie werkafspraak 1, want dat
verandert de werkwijze.

**EPIC 8 is af voor de MVP**, op de twee `phase:v2`-issues na. QS8-77 (de
dagelijkse nudge) is op 21-08 mee afgerond met EPIC 11 en staat op Done; tot
23-08 zeiden beide overdrachtsdocumenten dat hij nog open stond. De nudge-regel
is compleet en getest — wat ontbreekt is nog steeds een bezorgd bericht, en dat
is QS8-124.

In de ronde van 21-08 afgerond: QS8-106 (de vier datalaagfuncties zonder scherm), QS8-112
(een weekdoel aanmaken kon helemaal niet), QS8-82 (adempauze), QS8-39 (mijlpalen
beheren), QS8-76 (feestelijk moment) en QS8-85 (commitments informeel, met een
test die het bewaakt). A45 is gedicht in migratie 0047.

**Begin hier.** Dit is het zwaarste openstaande punt en het is geen feature.

⚠️ **`goals.risk_status` is dichtgezet vóórdat de radar hem ging vullen**
(migratie 0050). De drie risicokolommen wonen nu in `goal_risk`, eigenaar-only.
**Daarmee is A17 teruggedraaid.** Hoeveel verruimingen van domeinregel 7 er nog
zijn en welke, staat in `CLAUDE.md` — daar en nergens anders. Beslisdocument 002
is bijgewerkt.

⚠️ **Wat je ziet is géén melding over rate limiting** maar een fixture die
halverwege omvalt: een paar bestanden rood, de rest "skipped". Dat leest als een
kapotte policy, en je gaat in de verkeerde richting zoeken.

⚠️ **Er zijn twee dingen die hem tegenhouden, één per platform.**

* **Web** — de bibliotheek is niet nodig; web push is op 23-08 van nul gebouwd.
  De registratie is er sinds **QS8-124**; wat ontbreekt is het bewijs dat er
  een melding aankomt.
* **Native** — `expo-notifications` ontbreekt, en dat is een dependency die
  eerst toestemming vraagt (**Q-TODO B4**). Denk daarbij aan een Expo-project
  met FCM- en APNs-sleutels voor een echt toestel.

Zolang geen van beide rond is, blijft `push_tokens` leeg en stuurt de job niets.
De rand eromheen is voor allebei dezelfde vorm als bij Sentry: er is een
`PushBron`-interface met een lege standaard, en aanzetten is één
`zetPushBron(...)` in `_layout` — geen epic opnieuw bouwen.

Die sleutels zitten in de build, niet in de server; de Edge Function heeft er
niets voor nodig.

* **Eén set fixtures voor de hele run** in plaats van per bestand. Goedkoper,
  raakt `tests/rls/harness.ts`, maar de suites delen dan state — en dat is
  precies wat ze nu niet doen. Kijk goed naar `removeTestUsers()`.
* **Een eigen testproject** met een eigen quotum. Schoner, maar het vraagt een
  tweede Supabase-project en dus een besluit van Quinten over kosten.

Staat als **QS8-116** in Linear, met beide richtingen uitgeschreven. Overleg de
keuze; bouw hem niet zomaar.

---

**De ronde van 22–23-08: de RLS-suite bewijst weer iets.** De suite logde per
gebruiker in en liep daarbij tegen een limiet aan; hij sloeg zichzelf dan over
en was groen zonder iets te bewijzen. De harnas **tekent de gebruikerstokens nu
zelf** (HS256, `SUPABASE_JWT_SECRET`) en logt helemaal niet meer in. Winst:
`tests/rls/jwt.test.ts` draait zonder credentials en dus mee in CI.

Afgerond: QS8-116, QS8-118 (`src/shared/tekst`, codepunten als eenheid),
QS8-120 en QS8-121 (Zod-schema's los van de Supabase-client; daarbij bleken de
CHECK op `commitments.body` te ontbreken en `image_url` server-side ongevalideerd).

⚠️ **De zwaarste vondst: ontkoppelen maakte missen gratis.**
`kan_beoordeeld_worden()` uit 0064 keek of het doel op het moment van boeken aan
een groep hing — en de eigenaar mag `goal_group_links` onvoorwaardelijk
verwijderen én terugzetten, allebei een knop in de app. Ontkoppel op vrijdag,
laat de rollover langsgaan, koppel maandag terug: geen minpunt, elke slechte
week. De score kon alleen nog omhoog, precies wat domeinregel 10 verbiedt.
Migratie **0066** legt het antwoord vast op `weekly_goals.beoordeelbaar` als
grendel die maar één kant op beweegt, plus een tweede trigger die verlagen door
de eigenaar blokkeert. Uitleg in
`docs/decisions/2026-08-23-de-grendel-op-het-minpunt.md`.

⚠️ **Twee dingen uit die ronde zijn níét af:**

* **Web push is aangezet, maar nog nooit aangekomen.** QS8-124 heeft de
  registratie gebouwd: `webpush-registratie.ts`, een knop op het profielscherm en
  de `PushBron` voor web. ⚠️ **Niemand heeft nog een echte melding ontvangen** —
  dat vraagt een browser plus de VAPID-sleutels in `.env`, en dat kan een sessie
  in de cloud niet. Zolang dat bewijs er niet is, is EPIC 11 niet af. QS8-117
  (iOS) wacht hierop.
* **De migratiebestanden kunnen het schema niet opbouwen.** Zie de valkuilen —
  dit is nu QS8-122 en het blokkeert QS8-119.

**Volgende aan de beurt: EPIC 9, het commitment device.** QS8-85 is af
(commitments blijven informeel, met een test die het bewaakt). Open zijn QS8-83
(beloning vrijgeven bij het halen van een doel) en QS8-84 (straf verschuldigd
bij een gemiste deadline).

`expo-notifications` staat erin en is ingeplugd; de job draait en selecteert
`profiles.locale`. Maar **de app draait alléén op het web**, en web push is een
ánder mechanisme: VAPID-sleutelpaar, een service worker, en een
`PushSubscription` in plaats van een Expo-token.

**Er wachten vijf besluiten op Quinten**, en twee ervan hangen aan elkaar:
A41 (mag de groep zien wat er fout gaat?) en A42 (blijven punten privé?) uit de
groene notities raken domeinregel 7 in de kern. Verder A43 (minpunten bij
zelfstandig verschuiven), A44 (is "zakelijke doelen" de koers?) en A46 (TRUNCATE
intrekken). A37 staat er ook nog.

**A47 is af** — dat was "de testsuite past niet meer twee keer in een uur", en
dat probleem bestaat niet meer sinds de suite niet meer inlogt (QS8-116).

En **B4** — `expo-notifications` — is geen besluit maar een dependency. Hij
blokkeert nu alleen nog **native** push; de web-kant is gebouwd en heeft die
bibliotheek niet nodig. Alles staat in `docs/Q-TODO.docx`, secties H, I en J,
met de onderbouwing van de groene notities in `docs/GROENE-NOTITIES.md`.

## WERKAFSPRAKEN — houd deze aan

1. **Werk landt sinds 23-08 via een PR op GitHub**, niet meer met een lokale
   `--no-ff` merge. PR #1 is de eerste; hij is via de GitHub-UI gemerged met een
   merge-commit, zodat de losse commits leesbaar blijven (squashen slaat de
   Nederlandse berichten plat). Voorwaarde blijft dezelfde: groene
   typecheck/lint/test/build vóór de PR opengaat.

   **Eén branch per Linear-issue**, met de naam die Linear zelf voorstelt — dan
   koppelt Linear de branch, de PR en het issue vanzelf aan elkaar. Vastgelegd in
   `CLAUDE.md` op 23-08-2026; dit bestand zei tot dan "één branch per epic" en
   dat geldt niet meer.

   ⚠️ Raakt je werk meerdere issues, dan zijn het **meerdere branches en meerdere
   PR's**. PR #1 deed het anders — acht issues op één branch met een zelfbedachte
   naam — en toen koppelde Linear niets, dus zijn alle acht statussen met de hand
   bijgewerkt. Leunt een issue op een ander, gebruik dan de blokkeerrelatie in
   Linear en land ze in volgorde.
2. `gh` werkt (ingelogd als QS86-bot, scopes repo, workflow, read:org, gist).
   Roep hem aan via het volledige pad: `"C:\Program Files\GitHub CLI\gh.exe"` —
   de PATH van een sessie is ouder dan de installatie. PR's kunnen dus, maar we
   mergen nog steeds lokaal; overleg als je dat wilt veranderen.
3. Migraties mogen direct op het echte project (ref `wehgocadxehottiiyvsc`).
   **Nummer verder vanaf 0072.** Elke migratie idempotent, met een rollback-pad
   in de kop.

   ⚠️ **`0057` t/m `0061` bestaan niet als bestand** — ze zijn wel toegepast en
   staan op de werkmachine. `main` springt van `0056` naar `0062`. Zet ze erin
   voordat iemand op het idee komt die nummers opnieuw te gebruiken. Zie QS8-122
   en de valkuil hieronder.
4. Vóór elke merge: `npm run typecheck`, `npm run lint`, `npm test`,
   `npm run build` — **én lees de testteller vóórdat je commit.**

   ⚠️ **Draai de suite en de commit nooit in één commando.** Dat is op 22-08
   misgegaan: ik las de uitslag pas achteraf en had toen al gecommit. De inhoud
   bleek in orde, de volgorde niet.

   ⚠️ **Zolang A47 open staat, is een volle run niet te vertrouwen.** Falen er
   RLS-bestanden, draai ze dan één voor één opnieuw vóór je concludeert dat er
   iets stuk is — de kans is groot dat het de aanmeldlimiet is. Staat er
   "skipped" bij `tests/rls/`, dan heb je géén RLS-dekking gedraaid en zegt groen
   niets over autorisatie. Zie WERKVOORRAAD §3b.
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
6. Werk Linear bij zodra iets af is, niet aan het eind.

   ⚠️ **"In Review" heeft sinds 23-08 wél een betekenis** en de oude regel
   ("gebruik hem niet, er is geen reviewer") is achterhaald door werkafspraak 1.
   Hij betekent nu: *het werk is af en gemeten, maar het zit in een PR die nog
   niet gemerged is.* Dat is precies wat er tussen het openen en het mergen van
   PR #1 gebeurde met QS8-116, 118, 120 en 121; bij de merge zijn ze op Done
   gezet. **Zet niets op Done zolang de code alleen in een open PR staat** — dan
   liegt het bord zodra die PR alsnog dichtgaat.
7. Loop je vast op iets dat mijn beslissing of toegang vraagt: zet het in
   `docs/Q-TODO.docx` en ga door met het volgende issue. Niet wachten.

## VALKUILEN die deze codebase al een keer gekost hebben

- **⚠️ Deze drie documenten beschrijven dezelfde stand en lopen uiteen — QS8-125.**
  `CLAUDE.md`, `docs/WERKVOORRAAD.md` §0 en dit bestand zijn drie handgeschreven
  kopieën van hetzelfde. Werk je er één bij, dan liegen de andere twee. Op 23-08
  zijn er **vier** uiteengelopen paren gevonden, en drie daarvan alleen doordat
  iemand het hele bestand las:

  1. hier stond bovenin "A17 teruggedraaid, twee verruimingen" en onderin "drie
     benoemde verruimingen", terwijl `WERKVOORRAAD.md` §9 A17 nog als goedgekeurd
     opvoerde **met een openstaande herbevestiging die allang gedaan was**;
  2. "EPIC 3 is gebouwd en nooit gedraaid", twintig regels boven "de Doelcoach
     heeft voor het eerst echt gedraaid";
  3. `WERKVOORRAAD.md` noemde twee blokkades voor EPIC 11, hier stond dat
     `expo-notifications` "het enige" was;
  4. `CLAUDE.md` zei één branch per issue, hier stond één branch per epic.

  Plus zes achtergelopen tellers (539/164/383/141 tests, "migraties t/m 0038",
  "nummer vanaf 0047").

  ⚠️ **Geval 1 is het gevaarlijke.** Hier stond, in het bestand dat een nieuwe
  sessie als eerste leest, dat de groep je risicostatus mag zien — precies het
  besluit dat op 20-08 is teruggedraaid omdat `risk_status` een afgeleide van
  andermans gemiste weken werd. Er is niets misgegaan omdat er toevallig niemand
  op verder heeft gebouwd, en dat is geen bescherming.

  ⚠️ **En de fout is besmettelijk:** geval 2 en 3 zijn diezelfde dag ontstaan
  tijdens het bijwerken van deze documenten — één plek bijgewerkt, de andere
  vergeten. **Werk je hier iets bij, grep dan op het feit in alle drie de
  bestanden voordat je klaar bent.** Dat is de handmatige versie; de controle die
  hem overbodig maakt is QS8-125.

- **Een module-constante met vertaalde tekst bevriest de taal op importtijd.**
  Een `const` die `t()` aanroept, wordt één keer opgebouwd bij het importeren van
  de module — vóórdat het profiel geladen is. De tekst klópt, hij staat alleen in
  de verkeerde taal, en er is niets aan te zien. Er waren er zestien in dit
  project. ⚠️ Ik heb er zélf twee geïntroduceerd in dezelfde sessie waarin ik de
  regel opschreef; dit is dus geen kwestie van opletten maar van een lint-regel.
  Zelfde vorm bij Zod: `{ error: t(...) }` moet `{ error: () => t(...) }` zijn.
- **Een meetinstrument dat groen wordt en dus niet meer geijkt wordt.** De
  tekstcontrole van QS8-115 stond op nul en miste toen nog een hele vorm: tekst
  achter een openingstag op dezelfde regel (`<Subheading>Kop</Subheading>`), want
  zijn heuristiek eiste dat de régel met een hoofdletter begon. Eén extra ijking
  ná groen vond zeventien zinnen in mappen die al "af" heetten. **Een controle
  die nul meldt terwijl er tekst staat, geeft toestemming om te stoppen met
  kijken** — ijk hem dus juist op het moment dat hij groen wordt.

- **Een hulpscript dat niet idempotent is en tóch twee keer draait.** Bij QS8-115
  liep een migratiescript opnieuw na een fout halverwege, waardoor het
  catalogusblok dubbel in `nl.ts` kwam te staan. TypeScript ving het, maar het is
  dezelfde categorie als een SQL-migratie zonder rollback-pad — en onwrikbare
  regel 20 bestaat juist omdat "draai hem opnieuw" de standaardreactie is.

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

- **⚠️ Een aannemelijke diagnose is geen meting — de aanmeldlimiet was iets
  anders dan hier stond.** In dit bestand stond tot 23-08 dat de suite tegen een
  limiet van *ongeveer dertig aanmeldingen per uur* aanliep. Dat klopte niet. De
  auth-logs zeggen: alle 429's op `/auth/v1/token` en **geen enkele** op
  `/auth/v1/admin/users`; 370 accounts aangemaakt in één uur zonder één
  weigering; 262 geslaagde aanmeldingen in het uur dat er 13 weigeringen had; 39
  in één minuut. Het is een **burstlimiet per IP**, geen uurquotum en niets per
  project.

  Dat verschil was niet academisch: op de verkeerde diagnose was "een tweede
  Supabase-project" de logische oplossing, en die verplaatst een IP-limiet niet.
  De echte oplossing was de limiet helemaal niet meer raken — de harnas tekent
  zijn tokens nu zelf en logt niet meer in.

  **Het probleem is weg, de les niet:** het faalbeeld van een uitgeputte limiet
  ziet eruit als een kapotte policy (een paar bestanden rood, de rest "skipped"),
  en dat is het vier keer níét geweest. Een tweede gezicht hiervan is "JWT issued
  at future": klokverschil, ook geen policyfout. En let bij het snoeien van
  fixtures op de val in `createTestProfile`: **een fixture die RLS omzeilt om RLS
  te testen, bewijst niets.**

- **⚠️ De migratiebestanden kunnen het schema niet opbouwen.** De geschiedenis
  kent twee onverenigbare nummeringen: 38 genummerd (`0001`–`0038`) en 28 met een
  tijdstempel — alles wat sinds 19-08 via de MCP-tool is toegepast, want die
  kiest zelf een versie ongeacht hoe het bestand heet. Een bestandsnaam
  `0039_….sql` komt dus nooit overeen met een versie in `schema_migrations`.
  Daarbovenop ontbreken `0057` t/m `0061` als bestand.

  **Waarom dat meer is dan slordig:** zowel een lokale stack als een tweede
  cloudproject werkt door de migraties opnieuw af te spelen op een lege database.
  Een schema dat daaruit komt is niet gelijk aan productie, en dan toetst de
  RLS-suite een verzinsel — groen zonder iets te bewijzen, wat erger is dan
  tegen productie draaien. Dit blokkeert QS8-119 en staat als **QS8-122**.

- **Een CHECK toevoegen zonder de functie mee te wijzigen breekt stil.** Migratie
  0062 zette een CHECK op `push_tokens` die websleutels verplicht stelt, maar
  liet `registreer_push_token()` ongemoeid. Elke aanroep met `platform = 'web'`
  liep op een ongevangen 23514 stuk — een ruwe Postgres-fout in plaats van
  `{ok:false, reason}`. De tabel was leeg, dus de migratie slaagde en er ging
  niets zichtbaar stuk; web push was dood zodra hij aangezet werd. Gerepareerd in
  0067. **Zoek bij elke nieuwe CHECK de functies op die in die tabel schrijven.**

- **`z.string().url()` is in zod 4 geen schema-allowlist.** Nagemeten met 4.4.3:
  `javascript:alert(1)`, `data:text/html,…` en `file:///etc/passwd` zijn alle
  drie geldig. `commitments.image_url` had daardoor server-side nul validatie, en
  een commitment is per domeinregel 11 leesbaar voor de begunstigde groep zodra
  de straf verschuldigd wordt. Nu een CHECK én een `.refine()` op `https://`
  (0068). De test die de te ruime regel als correct vastlegde is vervangen — **een
  test die een gat bekrachtigt is erger dan geen test.**

- **⚠️ Een bevinding die je terecht als "Laag" wegzet, kan zwaarder worden door
  wat je er later op bouwt.** Op 17-08 stond in `ENGINEER-REVIEW.md` de rij
  "Bewijseis te omzeilen met ontkoppelen", bewust laag omdat het zelfbedrog was
  en geen autorisatiegrens. Dat oordeel klopte. Vier dagen later maakte dezelfde
  handeling — eigenaar ontkoppelt en koppelt terug — er via 0064 een scoregat
  van, en kostte het migratie 0066 om te dichten.

  Het project heeft dit één keer wél goed gedaan: de A17-aantekening
  ("herbevestigen vóór EPIC 12") werkte precies zo. Bij die rij stond er geen.
  **Vraag bij elke nieuwe beslissing die op een bestaande primitieve handeling
  leunt: staat daar een weggelegde bevinding over?** De werkwijze eromheen is
  **QS8-123**.
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

⚠️ **Hoeveel verruimingen er zijn en welke, staat in `CLAUDE.md` bij
domeinregel 7 — en bewust alleen daar.** Tot 23-08 stond het ook hier, met een
ander getal dan tien regels verderop in ditzelfde bestand. Onderbouwing in
`docs/decisions/002-domeinregel7-oppervlakken.md` §4a. `npm run docs:controle`
wordt rood zodra het getal hier terugkeert.

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

## STAND VAN DE REPO (24-08, na PR #9)

`main` staat op `f1c4859`. Drie branches ernaast:

| branch | commit | |
|---|---|---|
| `main` | `f1c4859` | de hoofdbranch |
| `quintenstrijdonk/qs8-122-…` | `243365c` | de teruggehaalde migraties — ⚠️ **inhoudelijk overbodig**, PR #9 heeft dezelfde bestanden geland. Nalopen en weggooien |
| `claude/linear-bijwerken-docs-t7cko6` | de lopende cloudsessie |
| `fundering-16-08` | `8640f3c` | **archief, laten staan** |

✅ De verdwaalde branch met 21 commits is op 24-08 geland als PR #9. Wat ervan
geleerd is, staat in WERKVOORRAAD §2a — en de kern daarvan geldt nog steeds:
**werk dat niet landt, bestaat voor de volgende sessie niet**, en dat is niet
zichtbaar in een document, want het document staat op diezelfde tak. **Kijk bij
het beginnen van een sessie naar deze tabel en niet alleen naar `main`.**

⚠️ **`fundering-16-08` heeft géén gemeenschappelijke voorouder met `main`.** Het
zijn twee losse wortelhistories; `main` is rond 16-08 opnieuw geworteld. Die
branch bewaart de zeven oorspronkelijke fundering-commits, die nergens anders
meer bereikbaar zijn (de inhoud leeft wél door — `0001` t/m `0004` zijn
byte-identiek). **Zet hem nooit in een PR**: een merge zou twee historieën aan
elkaar knopen en 25 bestanden terugdraaien naar de stand van 16 augustus.

⚠️ Een sessie in de cloud kan **geen tags aanmaken en geen branches verwijderen** —
dat geeft HTTP 403 op `git-receive-pack`. Gewone pushes naar een eigen branch
werken wel. Reken erop dat dit soort opruimwerk bij jou terechtkomt.

## Waar te beginnen

1. **QS8-124 bewijzen.** De code staat (In Review). Zet
   `EXPO_PUBLIC_VAPID_PUBLIC_KEY` en `VAPID_PRIVATE_KEY` in `.env`, draai de app,
   klik op Profiel → Meldingen aanzetten, en controleer of er een rij in
   `push_tokens` staat mét `p256dh` en `auth`. Lukt dat niet, lees dan de
   `reason` uit `registreer_push_token()` — sinds 0067 is dat een nette
   `{ok:false, reason}`.
2. **QS8-122** — de migratiebron repareerbaar maken. Alles wat een tweede
   omgeving nodig heeft (lokale stack, CI met echte RLS, staging) hangt hierachter.
3. **EPIC 9** — het commitment device, volgens de volgorde hierboven.

**Twee procesvragen die niets blokkeren maar wel af horen te zijn vóór november**,
want dan komt er een tweede lezer: **QS8-123** (hoe merk je dat een als *Laag*
weggelegde bevinding zwaarder wordt door wat je erop bouwt) en **QS8-125** (deze
drie documenten die dezelfde stand beschrijven en uiteenlopen). Het is dezelfde
familie — niet *"wat is waar"* maar *"wie merkt het wanneer het niet meer waar
is"* — dus behandel ze in één ronde.

Vraag alleen als doorgaan-onder-aanname echt onveilig zou zijn.
