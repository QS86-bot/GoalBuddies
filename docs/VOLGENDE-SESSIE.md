# Startprompt voor een nieuwe sessie

> Kopieer alles onder de streep in een nieuwe chat. Werk dit bestand bij aan het
> eind van elke sessie — het is de overdracht, niet een archief.
>
> **Laatst bijgewerkt:** 28-08-2026, na de merge van PR #71 t/m #78 (QS8-56,
> QS8-65, QS8-79, QS8-78 en de idempotentie-reparatie) en PR #85 t/m #90 (de vijf
> blokkerende bevindingen uit de controleronde).
>
> **Twee dingen die de stand van dit project veranderen:**
>
> 1. **De `phase:v2`-voorraad die een sessie alleen kan bouwen, is leeg.** Alle
>    vier de issues die zonder overleg te bouwen waren, staan op `main`. Wat er in
>    Linear overblijft vraagt Storage, een betaalprovider, een dependency, een
>    illustrator of een module waar een andere sessie in werkt. **Begin dus niet
>    in Linear** — begin in `docs/ENGINEER-REVIEW.md`; zie "Waar te beginnen".
> 2. **Er is op 28-08 een volledige controleronde gedraaid** met zeven agents over
>    ~99.500 regels. De vijf blokkerende bevindingen zijn gerepareerd, inclusief
>    twee lekken die op productie live stonden. De rest staat als rij in het
>    reviewdossier.

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

⚠️ **En sinds 27-08 is Fase 2 begonnen, met Quintens goedkeuring, terwijl Fase 1
nog openstaat.** Dat mag omdat wat er van Fase 1 rest zíjn hand vraagt en geen
code. **Op 28-08 is die opening ook weer dicht:** alle vier de `phase:v2`-issues
die een sessie zelfstandig kon bouwen staan op `main` (QS8-56, QS8-65, QS8-79,
QS8-78). Wat er in de backlog overblijft vraagt Quinten of een dependency.
**Lees "Waar te beginnen" punt 0 vóór je iets doet.**

**De app is live op `goalbuddies.q-projects.tech`** (QS8-99/QS8-100). Deployen is
één commando:

```bash
npm run deploy      # bouwen, .htaccess, secret-scan, source maps naar Sentry, uploaden
npm run deploy:droog  # alleen tonen wat er zóu vertrekken
```

Daarvoor heb je eenmalig `HOSTINGER_API_TOKEN` in `.env` nodig.

⚠️ De secret-scan in die deploy is aantoonbaar werkend: er is met opzet een
service-role-key in `dist/` gezet en de deploy sloeg af met de vindplaats erbij.
**Een controle die nog nooit rood is geweest, is een aanname en geen controle.**

⚠️ **De source maps gaan naar Sentry en nooit naar Hostinger.** Het script haalt
ze na het uploaden uit de bundel en controleert dat er geen enkele achterblijft;
blijft er toch één staan, dan stópt de deploy. Een `.map` naast een publieke
bundel geeft iedereen je volledige broncode. Zonder `SENTRY_AUTH_TOKEN` slaat de
upload zichzelf over en gebeurt er niets ergs — de maps verdwijnen alsnog.

**De hele Sentry-keten staat sinds 26/27-08** (QS8-24, PR #16 t/m #25): de app,
de drie Edge Functions, de PII-schoonmaak en de source maps. ⚠️ **Wat er nog
ontbreekt is de meting** — er is nooit een gebeurtenis uít de app aangekomen.
Zie "Waar te beginnen", punt 1.

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

**EPIC 8 is af**, inclusief de twee `phase:v2`-issues (QS8-79 en QS8-78, 27/28-08). QS8-77 (de
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
* ✅ **De migratiebestanden bouwen het schema wél op** — QS8-122 is op 24-08 af.
  `npm run schema:opbouwen` speelt ze af op een lege database; de negen
  vingerafdrukken waren alle negen gelijk aan productie.
* ✅ **De RLS-suite draait lokaal** — QS8-119, ook 24-08. `npm run rls:stack` en
  `npm run rls:lokaal`: een echte PostgREST op dat schema, geen credentials, vijf
  seconden voor 304 tests. Het echte project wordt niet meer aangeraakt.

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

   ⚠️ **Sinds QS8-122 hoort er een stap bij:** de MCP-tool zet een tijdstempel
   als versie neer, ongeacht hoe je het bestand noemt. Lijn hem daarna uit — één
   UPDATE, beschreven in `docs/DEPLOY.md` §2.2 — en draai
   `npm run register:controle`. Die wordt rood als je het vergeet.
4. Vóór elke merge: `npm run typecheck`, `npm run lint`, `npm test`,
   `npm run build` — **én lees de testteller vóórdat je commit.**

   ⚠️ **Draai de suite en de commit nooit in één commando.** Dat is op 22-08
   misgegaan: ik las de uitslag pas achteraf en had toen al gecommit. De inhoud
   bleek in orde, de volgorde niet.

   ✅ **A47 is op 24-08 opgelost** (QS8-119). Er zat één aanwijsbare oorzaak
   onder: het inhalen van een gemiste ketting-mijlpaal plaatst beide berichten in
   één transactie, dus met dezelfde `created_at`, en de test sorteerde daarop.
   10 van de 10 rondes schoon met een verse database.

   ⚠️ Staat er "skipped" bij `tests/rls/`, dan heb je géén RLS-dekking gedraaid
   en zegt groen niets over autorisatie. Draai `npm run rls:stack` en
   `npm run rls:lokaal` — dat kost tien seconden en vraagt geen credentials.
   Zie WERKVOORRAAD §3b.
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

- **⚠️ `revoke ... from public` is in Supabase niet "van iedereen" — 28-08.**
  `alter default privileges` deelt élke nieuwe functie en tabel in `public` uit
  aan `anon`, `authenticated` én `service_role`. Wie er `public` en `anon` afhaalt,
  houdt precies de rol over waaronder iedere ingelogde gebruiker draait. Migratie
  0112 deed dat bij `seizoensrecap_cijfers()` — een `SECURITY DEFINER`-functie
  zonder lidmaatschapstoets — en die stond dus **live op productie open voor elke
  gebruiker**. Honderdtwintig regels verderop in datzelfde bestand stond het wél
  goed. **De vorm is `from public, anon, authenticated`**, en sinds 0115 bewaakt
  `tests/rls/functiegrants.test.ts` het generiek: een functie die `authenticated`
  kan uitvoeren zonder dat enige migratie dat gunt, is een geërfd recht dat
  niemand besloten heeft.

- **⚠️ Een bevinding kan als opgelost worden afgevinkt op het verkeerde bewijs —
  28-08.** Het venster van De Ketting stond op acht dagen bij een periode van
  zeven, dus twee van elke zeven dagen was de afgesloten week uitleesbaar in een
  beschermde groep. Dat is in augustus **twee keer** gesloten verklaard, met *"er
  staat een venster op `p_period_start`"* en *"gedicht in 0037"*. Beide keren is
  gemeten **dát** er een venster stond, nooit **hoe breed**. De test deed hetzelfde:
  hij legt een schakel zestig dagen terug en is groen bij een venster van 8, 80 of
  800 dagen. **Een grens toets je op de grens** — en dat is een vorm van regel 18
  vraag 3 die de tabel in `CLAUDE.md` nog niet kende: de test bewaakt de belofte
  op een plek waar hij niet kán breken.

- **⚠️ Breek je grendel echt, want nadenken vindt dit niet — 28-08, twee keer.**
  Bij de pushadres-allowlist bleef de test groen terwijl de `https`-eis was
  weggehaald: elk `http`-adres erin viel al af op zijn hóst, dus de protocoltoets
  werd nergens geraakt. Er moest een geval bij dat álleen daardoor wordt
  tegengehouden. En bij QS8-78 bleef de badge-test groen bij het breken van
  `best_streak`, omdat verwijderen structureel onmogelijk is. **Beide keren was
  de test aannemelijk en bewaakte hij niets**, en beide keren bleek dat pas door
  hem daadwerkelijk stuk te maken.

- **⚠️ Een grep is geen meting, ook niet in je eigen bevinding — 28-08.**
  De rij "26 migratiebestanden zijn niet idempotent" kwam uit twee greps en
  klopte niet; het waren drie regels in twee bestanden. Eén van die greps
  (`^create table [a-z"]`) matchte `create table if not exists`, want de `i` van
  `if` valt binnen `[a-z]`. En bij een tweede controle die dag meldde een
  regel-voor-regel-toets een vals alarm op een `grant` die over twee regels loopt.
  **Plat je tekst en knip je commentaar weg voordat je een patroon telt** — een
  rollback-kop noemt `grant execute ...` ook.

- **⚠️ Twee sessies die tegelijk migraties schrijven, botsen — en het kost jullie
  allebei tijd (28-08).** Mijn drie migraties moesten twee keer opschuiven omdat
  een parallelle sessie 0107 t/m 0110 landde; hún PR schoof drie keer op om
  dezelfde reden. `migraties:controle` ving elke botsing, en dat is de reden dat
  het bij tijdverlies bleef. **Haal `main` op vlak vóór je een migratienummer
  kiest, en nog een keer vlak vóór je landt** — en vergeet niet dat het
  productieregister meeschuift als je hernummert.

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
- **`engines` dat iets belooft wat de code niet houdt.** `package.json` zei
  `node >=20`; de realtime-client van supabase-js vraagt een native `WebSocket`
  en die bestaat pas vanaf Node 22. Op 20 valt élke `createClient()` om. Lokaal
  draaide alles op 22, dus dit was hier nooit te zien — **de eerste run van de
  RLS-job op een schone runner vond het binnen een minuut.** Dat is precies waar
  een tweede omgeving voor is: niet om hetzelfde nog eens te bevestigen, maar om
  te laten zien wat je machine stilzwijgend voor je oploste.

- **Een gereedheidscontrole die niet vraagt of het jóuw proces is.**
  `lokale-stack.sh` wachtte tot er íéts antwoordde op poort 3010. Draaide er nog
  een PostgREST uit een vorige ronde, dan viel de nieuwe om met "Address in use"
  en antwoordde de oude keurig met 200 — naar een database die net weggegooid was.
  De suite meldde daarna **29 fouten die geen policyfout waren**. Meten of er iets
  antwoordt is niet hetzelfde als meten of het klopt; hij vraagt nu vóór het
  starten of de poort vrij is, want dat is deterministisch.

- **Een opruimstap die stil mislukt, en een suite die daarna groen is op oude
  data.** Bij QS8-119 stopte het stackscript PostgREST pas ná het herbouwen van
  de database. `drop database` weigert op open verbindingen, dus de herbouw sloeg
  over — en de RLS-suite draaide zeventien keer tegen dezelfde database zonder
  dat er iets rood werd. **Zeventien schone runs bewezen niets.** Een mislukte
  opruiming hoort hard te zijn, niet een regel die langsglijdt; en als je
  "opnieuw opgebouwd" beweert, laat er dan een merkteken achter en zoek het daarna.

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
  tegen productie draaien.

  ✅ Opgelost op 24-08 (QS8-122). ⚠️ **Wat ervan blijft staan als valkuil:** de
  steiger waarmee je zo'n lege database opbouwt, miste eerst de standaardrechten
  die Supabase op `public` zet (`grant all` voor `anon`, `authenticated` en
  `service_role`). Daardoor bouwde hij 69 rechten waar productie er 3395 heeft —
  *strenger* dan productie, dus een RLS-test die daar bevestigt dat iets níét
  gelezen kan worden, bewijst iets wat op het echte project niet waar is. Dat is
  hetzelfde faalbeeld, met een groen vinkje eronder.

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

  ⚠️ **En op 27-08 is die machinerie voor het eerst in de andere richting
  afgegaan, op een rij van mijzelf.** De rij over de wisselende reeks stond op
  **Laag** met de voorwaarde "wordt zwaarder als hij nog één keer omvalt". Dat
  gebeurde dezelfde dag vier keer, dus ging hij naar **Middel**. Dat is geen
  formaliteit: laat je hem staan terwijl zijn eigen aanname vervallen is, dan is
  die voorwaarde decoratie en leert de volgende dat hij hem mag negeren.

- **⚠️ Een reparatie die in het dossier stáát, is geen gemeten reparatie.** Dit
  is de duurste les van de reviewronde van 27-08, en hij ging over mijn eigen
  aantekening. Bij de rij over de wisselende reeks schreef ik als oplossing
  "fixtures per bestand een eigen naamruimte". Bij het bouwen bleek dat het
  verkeerde doel: het opruimen was al id-gescoped en de e-mailadressen waren al
  uniek per bestand. **Een naamruimte zou niets hebben toegevoegd — hij zou het
  probleem hebben hernoemd.**

  Wie die rij had gelezen en meteen was gaan bouwen, had een dag besteed aan
  isolatie die er al was. **Lees een voorgestelde reparatie als een hypothese van
  degene die hem opschreef, en meet hem voordat je hem bouwt** — ook (juist) als
  hij van jezelf is.

- **⚠️ Zonder reproductie kun je geen reparatie verifiëren, en dan bouw je
  bewijsmateriaal in plaats van een fix.** Dezelfde ronde: het faalbeeld was na
  de herstructurering van PR #54 niet meer terug te krijgen, tientallen runs
  lang, ook met het parallellisme bewust weer aan. Daarmee vervalt de enige
  manier om een fix goed te verklaren — regel 18 zegt dat je een controle pas
  vertrouwt als je hem met de hand rood hebt gekregen.

  Wat er dan wél kan: de vólgende waarneming bruikbaar maken. `reeks.test.ts`
  zegt sinds PR #55 "de fixture is onder de test uit verdwenen: 0 van de 3
  schone weken over" in plaats van een onverklaarbaar rijtje getallen. **Dat
  lost niets op en dat hoort het ook niet te doen** — het verkort de volgende
  diagnose van een halve dag naar één regel. Een onreproduceerbaar probleem
  verdient een betere meting, geen gegokte reparatie.

  ⚠️ En let op de vorm van het invariant dat zo'n vangrail bewaakt. Mijn eerste
  versie controleerde álle vijf de weekdoelen van de fixture en brak daarmee de
  test die er met opzet één van maakt. **Bewaak wat geen enkele test aanraakt**,
  niet wat de fixture bij het opzetten toevallig had.
- **⚠️ Een lokale datum ligt altijd in `[current_date - 1, current_date + 1]`.**
  `current_date` is de serverdatum in UTC; geen enkele tijdzone loopt meer dan een
  dag voor of achter. Een bovengrens op een datum die de client aanlevert moet die
  dag dus meenemen — dat is de `+ 1` uit 0037 — en een ondergrens met weken
  speling niet. Dit is het middernachtprobleem uit domeinregel 2 in een
  grénscontrole in plaats van in een berekening, en dat is precies waar niemand
  het zoekt. `npm run klokgrens:controle` houdt sinds 25-08 een register bij van
  elk voorkomen van `current_date` in het schema met de reden waarom het daar mag
  staan; `tests/rls/klokgrens.test.ts` toetst het gedrag.

  ⚠️ **En de meting van 25-08 zei twee keer iets anders dan de code deed.** Ze
  greep op `current_date` en zag de `+ 1` er niet naast staan, en concludeerde dat
  de reparatie ontbrak. Een grep is geen meting: `pg_get_functiondef()` is de
  waarheid, en je moet de héle regel lezen.

- **Let op de limieten die je zelf hebt ingebouwd:** 10 groepen per gebruiker per
  dag, 20 toetredingspogingen per dag, 12 leden per groep, 5 deadline-verzoeken
  per dag, 2 weekpassen tegelijk, 24 uur bedenktijd.
- **`supabase/functions/` valt buiten typecheck, lint én CI**, en geen workflow
  deployt ze. Wie een migratie toepast maar de deploy vergeet, heeft een half
  werkende feature zonder één signaal. Draai `npm run edge:sync` vóór elke deploy.

  ⚠️ **En op 26-08 bleek dat niet theoretisch: er draaide in productie code die
  op géén enkele branch stond.** Een functie was ooit gedeployd vanuit een
  ongecommitte werkboom, en die versie stuurde `fout.message` en `fout.stack`
  ongeschoond naar buiten. Niets in de repo kon dat zien — de repo is niet de
  waarheid over wat er draait.

  Twee commando's dekken dat sinds PR #17 en #19 af, en allebei draaien ze mee in
  `/audit`:

  ```bash
  npm run edge:gedeployd     # haalt de gedéployde bundel op en vergelijkt de modules
  npm run edge:sync:controle # de gedeelde kopieën in _shared/ tegen het origineel
  ```

  **Deploy nooit vanuit een werkboom met ongecommitte wijzigingen.** `edge:gedeployd`
  waarschuwt daar ook expliciet voor.

  ⚠️ **Zonder `SUPABASE_ACCESS_TOKEN` kan een sessie niet fatsoenlijk deployen,
  en dat is op 27-08 duur gebleken.** De Supabase-CLI is ingelogd op Quintens
  eigen machine (token in de CLI-config), maar niet in een verse omgeving. Dan
  blijft alleen de Supabase-MCP over, en die neemt de bestandsinhoud **inline**
  mee — de hele bundel moet met de hand overgetikt worden, tot 100 kB per
  functie.

  Dat ging bij `notificaties` de eerste keer mis: vijf tekens verkeerd, allemaal
  hetzelfde soort fout (het tweede accent weggevallen in `jóú`, `níét`, `híér`).
  Alleen commentaar, geen code — maar `edge:gedeployd` was er rood op gegaan, en
  dan zoekt iemand een half uur naar vijf accenten.

  **Zet die variabele dus in de omgeving vóór je aan een deploy begint**, en
  gebruik `supabase functions deploy <naam>`: die leest van schijf en kan per
  definitie niet verkeerd overtikken. Kan het niet anders, **haal de bundel dan
  ná de deploy op en leg hem byte-voor-byte tegen de repo** — de deploy zelf
  valideert alleen dat hij kán bundelen, niet dat je goed hebt overgeschreven.

- **⚠️ `fetch()` verwerpt alleen bij een netwerkfout — een 403 is een geslaagde
  belofte.** Dat kostte op 26-08 een halve dag: de Sentry-melding rapporteerde
  netjes `'verstuurd'` terwijl de ingest de envelope wéigerde, want de `Response`
  werd weggegooid zonder naar `status` te kijken. Elke transportlaag in dit
  project geeft daarom de statuscode terug en niet alleen "het is gelukt".

  ⚠️ En dat is alleen gevonden door er één echte envelope doorheen te sturen
  (`npm run sentry:proef`). Een test die je eigen aanname over het protocol
  bevestigt, bewijst niets over het protocol.

- **⚠️ Een gerepareerd predicaat kan door een tweede functie overschreven worden,
  en dan repareer je niets.** Op 27-08 kreeg `shares_group_with_goal()` de
  ontbrekende eigenaarstoets, en de migratiekop verklaarde daarmee drie routes
  dicht. Dat klopte voor `goals_select` en **niet** voor `weekly_goals_select`:
  die heeft sinds 0077 een dérde tak, `deelt_open_groep_met_doel()`, die dezelfde
  vraag zélf beantwoordt met het oude predicaat. In een open groep bleef een
  uitgezet lid daardoor zijn `status = 'missed'` uitdelen — de gevoeligste kolom
  die er is.

  **Zoek bij een predicaat niet alleen de aanroepers maar ook de functies die het
  overschrijven.** `grep` op de tabelnaam, niet op de functienaam. Gevonden door
  de security-reviewer, niet door de suite — zie de valkuil hieronder waaróm.

- **⚠️ Een fixture kan een hele tak per constructie ongetest laten.** Diezelfde
  ronde: de vertreksuite las `goals` en al haar groepen kwamen uit
  `create_group(group_name)`, en dat maakt een **beschermde** groep. De
  open-groepstak kon dus nooit rood worden, hoe grondig de rest ook was. Groen
  betekende hier "de helft is getoetst", en niets in de uitslag zei dat.

  **Bij elke policy die per stand varieert: heeft de suite van élke stand een
  fixture?** Dat is regel 18 vraag 3 in zijn goedkoopste vorm — kan deze test
  groen blijven terwijl de belofte breekt, ja, want hij komt er niet eens langs.

- **⚠️ Een DELETE-policy op `using (false)` breekt bestaande tests stil.** Toen
  `group_members_delete` dichtging, bleef een test in `policies.test.ts` groen
  terwijl zijn premisse verdampt was: hij liet iemand "de groep verlaten" met een
  kale DELETE, die weigert sindsdien zonder fout (valkuil: RLS filtert de rij weg
  bij DELETE, dus 204 en geen `42501`), en de vertrekker was daarna gewoon nog
  lid. `mustOk` was tevreden.

  **Zoek na het dichtzetten van een werkwoord elke test die dat werkwoord
  gebruikte als ópbouw** — niet alleen de tests die het als bewering gebruikten.
  Die eerste groep wordt niet rood; hij bewijst alleen iets anders dan zijn naam
  zegt.

- **⚠️ Een migratienummer is niet van je branch maar van `main`, en dat heeft op
  27-08 vijf keer gecorrigeerd moeten worden.** Eén bestand kreeg er drie:
  `0098` → `0100` → `0101` → `0103`, elke keer omdat de parallelle sessie er
  eerder mee landde. Het hernummeren zelf is triviaal — het bestand plus elke
  verwijzing erin, in de tests en in de documenten — maar het móét gebeuren:
  `migraties:controle` gaat rood op een gat, en dat is de ernstigste van de drie
  dingen die dat script vangt.

  **De les is niet "hernummer sneller" maar: reserveer nooit een nummer
  vooruit.** Kies het pas op het moment dat je merget, en haal `main` op vlak
  vóór dat moment. Elke kop die opschrijft *waarom* dit bestand nummer N heeft
  in plaats van N−1, veroudert bij de volgende merge — de kop van `0103` zegt
  daarom alleen nog de regel.

  ⚠️ **En een hernummering naar bóven maakt tijdelijk zelf een gat.** Schuif je
  op naar `0103` terwijl `0102` op een andere branch staat, dan is jouw branch
  rood tot die ander landt — ook in CI. Dat is te accepteren (met de volgorde in
  de PR) of op te lossen door die branch erin te mergen; allebei is goed, maar
  kies bewust en schrijf op wat je koos.

- **⚠️ Stop PostgREST vóór je de lokale stack herbouwt, of je test tegen de vorige
  database.** `scripts/lokale-stack.sh` doet dat zelf via zijn pidbestand, maar
  dat kent alleen zijn eigen instantie: draait er een uit een andere ronde, dan
  weigert `drop database` en **gaat het script door op de oude database**. Wat je
  dan ziet is een uitslag die niets betekent — op 27-08 negentien rode tests die
  binnen een minuut allemaal groen waren na een schone herbouw.

  Het faalbeeld is één regel die makkelijk voorbijglijdt: `✗ goalbuddies_rls kon
  niet weg.` **Lees die regel voordat je de tests leest.** Zie ook WERKVOORRAAD
  valkuil 15: een uitgeputte limiet, een klokverschil en dit geval zien er alle
  drie uit als een kapotte policy.

  ⚠️ **En grijp dan niet naar `pkill -f postgrest`.** Dat is precies wat de kop
  van `scripts/lokale-stack.sh` afraadt, en op 27-08 nam het in één keer de
  Postgres-server mee: exit 144, waarna niets meer verbond en het faalbeeld
  verschoof van "de drop lukt niet" naar "er is geen database". Terug met
  `pg_ctlcluster 16 main start`. De nette weg is `npm run rls:stack -- --stop`,
  en als de drop dan nog weigert: `psql -c "drop database if exists
  goalbuddies_rls;"` met de hand.

  ⚠️ **`schema-opbouwen.sh` gaat uit van Postgres op poort 5433 en gebruiker
  `postgres`.** Draait jouw cluster op 5432, of ben je als een andere gebruiker
  ingelogd, dan falen zowel `rls:stack` als de drie controlescripts die
  `pg_proc` lezen (`pin`, `klokgrens`, `kolomrechten`) — met een psql-fout die
  naar de database wijst terwijl de vérbinding fout staat. `PGPORT` en `PGUSER`
  zetten lost het op; ze zijn niet in het script gehardcodeerd omdat ze per
  machine verschillen.

  ⚠️ **En draai de suite nooit met `--no-isolate`.** Op 27-08 als proef
  gebruikt om te zien of testbestanden moduletoestand delen: 28 van de 30
  RLS-bestanden vielen om én de Postgres-server ging eronder onderuit, waarna
  de volgende run 438 tests overslaat omdat de stack er niet meer is. Het
  faalbeeld daarvan lijkt op een kapotte suite en is er geen. Herstellen is
  `pg_ctlcluster 16 main start` gevolgd door `npm run rls:stack`.

- **⚠️ Linear kan geen nieuwe issues meer aanmaken.** "You've exceeded the free
  issue limit for this workspace." Dat raakt de werkwijze: een bevinding die je
  onderweg doet en die een eigen issue verdient, kán er geen krijgen. Op 27-08
  gebeurde dat met de `'error'`/`'failed'`-statusbug; die is toen meegegaan in de
  PR die erop stuitte, met de reden in het beslisdocument.

  **Bundel in dat geval, maar schrijf op dat je gebundeld hebt en waarom** — één
  branch per issue is de regel, en een stilzwijgende uitzondering is hoe die
  regel verwatert.

- **⚠️ Een fout kan al gebouwd zijn en wachten op de feature die hem zichtbaar
  maakt — QS8-56, 27-08-2026.** Het doelscherm koos met `groepen[0]` welke groep
  over je deadlineverzoek besliste, uit een lijst zónder `order by`. Elk slot
  eromheen was dicht en gemeten: `vraag_deadline_verschuiving()` toetst
  lidmaatschap én koppeling, `beslis_deadline_verzoek()` toetst `r.group_id`,
  `deadline_requests_select` laat alleen de aangeschreven groep meelezen. Wat
  niemand toetste was of de gebruiker die groep ooit had **aangewezen**.

  ⚠️ **En dat kón niemand toetsen.** Zolang er geen scherm was dat een doel aan
  twéé groepen hing, was de toestand onbereikbaar. Er was niet "een test die
  groen bleef terwijl de belofte brak" — er was geen test die de belofte kón
  raken. Dat is een variant van onwrikbare regel 18 die de lijst in `CLAUDE.md`
  nog niet had.

  **Wat je ermee doet:** bij élke feature die een bestaande aanname van "er is er
  altijd precies één" naar "er kunnen er meer zijn" tilt, grep je eerst op `[0]`,
  `.find(`, `first`, `single()` en `maybeSingle()` in alles wat die zaak
  aanraakt. Dat kostte hier vijf minuten en leverde één echte vondst op —
  `HulpVragen` en `Straf` hádden allebei al een keuzelijst; dat `DeadlineVerzetten`
  hem niet had, was toeval en geen ontwerp.

  ⚠️ **En zet de keuze als functie neer, niet als regel in het component.** Een
  regel in een component is alleen te toetsen door te renderen of door in de
  broncode naar een letterlijke regel te grijpen, en dat tweede is precies de
  testvorm die bij QS8-85 stilletjes ophield iets te bewaken.

- **⚠️ Een nieuwe migratie op een dráaiende lokale stack vraagt een schema-reload.**
  PostgREST cachet de functielijst bij het starten. Voer je een migratie met een
  nieuwe RPC uit tegen een stack die al loopt, dan geeft die RPC `PGRST202` —
  *"Could not find the function … in the schema cache"* — en valt de bijbehorende
  test om alsof de migratie stuk is. Dat is hij niet:

  ```bash
  psql -d goalbuddies_rls -c "notify pgrst, 'reload schema';"
  ```

  Gebeurde op 27-08 met `definer_bewaking()` uit 0106. `npm run rls:stack` bouwt
  alles opnieuw op en heeft het probleem niet; dit treft alleen de snelle weg.

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

## STAND VAN DE REPO (28-08, na PR #90)

⚠️ **Alles wat deze sessie opleverde staat op `main`.** Twee stapels, allebei in
volgorde geland: #71 t/m #78 (QS8-56, QS8-65, QS8-79, QS8-78 en de
idempotentie-reparatie) en #85 t/m #90 (de vijf blokkerende bevindingen uit de
controleronde). Er staat van deze sessie **niets meer open**.

⚠️ **Er werkt een parallelle sessie in dezelfde repo**, en die landt regelmatig
eigen migraties en controlescripts. Op 28-08 waren dat #76, #77, #79 t/m #84 en
#89. Dat is de reden dat migratienummers deze dag twee keer moesten opschuiven —
zie de valkuil daarover. Blijf uit `scripts/`, `.github/workflows/` en
`src/modules/notifications/` tenzij je wijziging het echt vraagt; raak je er toch
iets aan (zoals het register van `klokgrens-controle`), zeg dat dan in de
commit-tekst.

⚠️ **In deze tabel staat met opzet geen commit-hash van `main` meer.** In de
vorige versie stond hij er twee keer en op twee verschillende waarden, en tijdens
het schrijven van déze versie liep hij binnen het uur alweer achter. Een
handgeschreven hash rot; de vraag "wat staat er nu" hoort een commando te zijn:

```bash
git fetch --prune origin
git branch -r --format='%(refname:short)'
git rev-list --left-right --count origin/main...origin/<branch>   # achter / voor
```

Wat de tabel wél bewaart is het enige dat een commando níet kan zeggen: **waarom
een branch er nog is en wat je ermee moet.**

⚠️ **En dat is geen theorie: deze tabel is op één ochtend vier keer achterhaald.**
Eerst noemde hij `main` op twee verschillende commits. Toen landde PR #26
terwijl de correctie in review stond. Toen landde PR #23 en verdween de rij
`chore/gitignore-gstack` tussen het mergen en het lezen. En binnen een minuut na
die merge was er weer een sessiebranch bij. **Elke rij hier is een aanname over
iets dat buiten dit bestand verandert** — draai de commando's hierboven voordat
je erop vertrouwt.

⚠️ **Daarom noemt de tabel alleen langlevende branches, en met opzet geen
sessiebranches.** Een `claude/…`-branch bestaat zolang een sessie eraan werkt en
is daarna weg; die in een handgeschreven tabel zetten is een rij die per definitie
veroudert, en dat is vanochtend twee keer gebeurd. Wélke er nu zijn, zegt het
`git branch -r` hierboven — dat antwoord is altijd goed. Wat hieronder staat is
het tegenovergestelde geval: branches die er al dagen liggen zonder dat iemand
nog weet waaróm, en dat is precies wat geen enkel commando kan vertellen.

| branch | wat het is |
|---|---|
| `wip/werkboom-26-08` | het vangnet van 26-08. ⚠️ **Lees de alinea hieronder vóór je hem weggooit** |
| `quintenstrijdonk/qs8-122-…` | ⚠️ **verwijdert alleen.** Ten opzichte van `main` 29 bestanden en 5213 regels mínder; de migraties die hij terughaalde staan sinds PR #9 op `main`. Weggooien |
| `fundering-16-08` | **archief, laten staan** — zie de waarschuwing hieronder |

⚠️ **`wip/werkboom-26-08` draagt zes bestanden die op `main` niet bestaan, en
tóch mag hij weg.** Ze zijn allemaal vervángen, niet vergeten — onder een andere
naam, want ze zijn op 26-08 twee keer gebouwd door twee sessies tegelijk:

| alleen op `wip` | wat het op `main` geworden is |
|---|---|
| `_shared/sentry/index.ts` | `_shared/melden.ts` + `_shared/observability/` |
| `webpush-bron.ts`, `webpush-stand.ts` | `webpush-registratie.ts` |
| `2026-08-26-sentry-in-edge-functions.md` | `…-sentry-in-de-edge-functions.md` |
| `2026-08-26-web-push-toestemming.md` | `…-toestemming-achter-een-gebaar.md` |

**Controleer dit zelf voordat je hem verwijdert**, want dit is de enige plek waar
het staat:

```bash
comm -13 <(git ls-tree -r --name-only origin/main | sort) \
         <(git ls-tree -r --name-only origin/wip/werkboom-26-08 | sort)
```

⚠️ **Vier dingen zijn op 26-08 twee keer gebouwd** — Sentry in de Edge Functions,
de web-push-client, een beslisdocument en dezelfde Windows-fix — doordat twee
sessies tegelijk begonnen zonder eerst `main` op te halen. **Haal `main` op vóór
je begint, niet vóór je pusht.** Kijk ook naar de tabel hierboven en niet alleen
naar `main`: werk dat niet landt, bestaat voor de volgende sessie niet, en dat is
niet zichtbaar in een document — want het document staat op diezelfde tak. Zie
WERKVOORRAAD §2a.

⚠️ **`fundering-16-08` heeft géén gemeenschappelijke voorouder met `main`.** Het
zijn twee losse wortelhistories; `main` is rond 16-08 opnieuw geworteld. Die
branch bewaart de zeven oorspronkelijke fundering-commits, die nergens anders
meer bereikbaar zijn (de inhoud leeft wél door — `0001` t/m `0004` zijn
byte-identiek). **Zet hem nooit in een PR**: een merge zou twee historieën aan
elkaar knopen en 25 bestanden terugdraaien naar de stand van 16 augustus.

⚠️ **Kijk bij het beginnen van een sessie naar deze tabel en niet alleen naar
`main`.** Werk dat niet landt, bestaat voor de volgende sessie niet — en dat is
niet zichtbaar in een document, want het document staat op diezelfde tak. Wat
daarvan geleerd is, staat in WERKVOORRAAD §2a.

⚠️ **En dat is op 26-08 in de andere richting misgegaan ook.** Vier dingen zijn
die dag twee keer gebouwd — Sentry in de Edge Functions, de web-push-client, een
beslisdocument en dezelfde Windows-fix — doordat twee sessies tegelijk begonnen
zonder eerst `main` op te halen. **Haal `main` op vóór je begint, niet vóór je
pusht.**

⚠️ Een sessie in de cloud kan **geen tags aanmaken en geen branches verwijderen** —
dat geeft HTTP 403 op `git-receive-pack`. Gewone pushes naar een eigen branch
werken wel. Reken erop dat dit soort opruimwerk bij jou terechtkomt.

## Waar te beginnen

### 0. Er is geen Linear-issue om op te pakken — begin in het reviewdossier

⚠️ **Dit is anders dan bij elke vorige sessie, dus lees het vóór je `/verder`
draait.** Alle vier de `phase:v2`-issues die een sessie zelfstandig kon bouwen
zijn op 27/28-08 gebouwd en geland. Wat er in Linear Backlog overblijft — QS8-71,
QS8-72, QS8-86, QS8-92, QS8-108 en QS8-109 — vraagt Storage, een betaalprovider,
een dependency, een illustrator of een module waar een parallelle sessie in werkt.
De volledige tabel met redenen staat in `docs/WERKVOORRAAD.md` §4.

⚠️ **En Linear neemt geen nieuwe issues meer aan.** `save_issue` geeft *"You've
exceeded the free issue limit for this workspace"*. Dat is al sinds 27-08 zo. Het
gevolg voor jou: de conventie "één branch per Linear-issue" kan niet, dus werk op
een `fix/…`- of `chore/…`-branch en zet de onderbouwing in de PR-tekst en in een
beslisdocument. Upgraden kost geld en is dus grens 1 — vraag het aan Quinten,
beslis het niet zelf.

**Waar het werk wél ligt:** `docs/ENGINEER-REVIEW.md`. Daar staan de bevindingen
van de controleronde van 28-08, elk met de meting waarmee ze zijn vastgesteld en —
bij een Laag-rij — de voorwaarde waaronder ze zwaarder worden. Dat is meer werk
dan de backlog, en het is beter onderbouwd.

### 0a. Wat de controleronde van 28-08 heeft achtergelaten

Zeven agents over ~99.500 regels: twee security-reviewers (database en
applicatie), twee code-critics (`src/` en `app/`+functions), een critical-user,
een test-engineer op de dekking, en een zoektocht naar onderbroken ketens.

**Vijf blokkerende bevindingen zijn gerepareerd** (PR #85 t/m #90), twee daarvan
lekken die live op productie stonden. Wat blijft liggen staat als rij in het
dossier; dit zijn de zwaarste, en ze staan hier omdat je er anders overheen leest:

1. **Elf tabellen dragen schrijfgrants zonder bijbehorende policy.** Vandaag
   inert — RLS weigert bij een ontbrekende policy — maar `schrijfrechten_bewaking()`
   uit 0101 kent een **hardgecodeerde lijst van vier tabelnamen** en ziet de
   andere zeven niet. Dat is exact de klasse die 0101 kwam voorkomen. De
   generieke query staat in de rij.
2. **`te_beoordelen_voor()` is een autorisatiegrens zonder inhoudelijke test.**
   De meldingenjob roept hem aan als `service_role`, dus RLS kijkt daar niet mee
   en de functie ís de grens. De enige test toetst dát een gewone gebruiker hem
   niet mag aanroepen. De groepsjoin met de hand losknippen liet de héle RLS-suite
   groen — 558 van 558.
3. **49 policies over 30 tabellen evalueren `auth.uid()` per rij**, terwijl
   `(select auth.uid())` er een InitPlan van maakt. Nul van de 58 doet het goed.
   Lokaal met `explain` aangetoond; bij een schaaldoel van 100k raakt dit elke
   lijstquery.
4. **Zes tekstkolommen zonder lengtegrens** (`goals.description`,
   `identity_statement`, `milestones.title`/`description`, `weekly_goals.floor_text`/
   `ceiling_text`) terwijl `goals.title` er wél één heeft, en **het AI-dagquotum
   telt jobs in plaats van tokens** — een invoer van 450.000 tekens werd
   geaccepteerd. Opslag- en kostenmisbruik op een gratis tier zonder backups.
5. **Vijf onbereikbare features.** `wijzigDoel()`, `wijzigMijlpaal()` en
   `fetchCommitmentSpoor()` hebben nul aanroepers; `group_members.status` heeft
   elf leesplekken en geen enkele knop; `ai_kosten_per_week()` draait nergens.
   Een doel is dus na aanmaken niet meer te wijzigen, en het auditspoor dat
   domeinregel 5 eist is nergens te zien.

⚠️ **Twee controlescripts hebben een blinde vlek, en hun groen zegt daarom niets
over die klasse.** `tekst:controle` ziet geen JSX-tekst die over meerdere regels
loopt met een expressie erin — er staan er drie in de app terwijl hij "nul" meldt.
En `keten:controle` telt een `grant`-regel als aanroeper (`revoke all on function
f(...)` matcht zijn patroon), waardoor bijna elke functie per definitie "levend"
is. Repareer die twee vóór je op hun uitkomst vertrouwt.

⚠️ **Wat de controleronde níét kon vaststellen** en wat dus jouw machine vraagt:
of `verify_jwt` echt aanstaat op `rollover` en `notificaties` (er is geen
`supabase/config.toml`, dus het staat alleen in een zin in WERKVOORRAAD), of
e-mailbevestiging aanstaat in Supabase Auth, en of er een uitgavenplafond op de
Anthropic-sleutel staat. Dat laatste is vandaag de enige bodem onder punt 4.

⚠️ **`auth_leaked_password_protection` staat uit.** Eén schakelaar in het
Supabase-dashboard, en Supabase' eigen adviseur noemt hem.


### 0b. Eén ding dat je zelf moet deployen, en het merkt zichzelf niet

⚠️ **De `rollover`-functie op productie kent `maak_seizoensrecaps()` niet.**
Gemeten op 28-08 tegen de gedeployde bron: `verbruik_weekpas`,
`maak_straffen_verschuldigd` en `slaap_stille_groepen` staan erin,
`maak_seizoensrecaps` **nul keer**. De migratie (0112) staat wél op productie en
de RPC bestaat, maar niets roept hem aan.

**Gevolg: de seizoensrecap van QS8-79 draait vandaag niet, en dat merk je pas bij
de volgende kwartaalgrens** — en dan weet niemand meer dat het aan de deploy lag.
Eén `supabase functions deploy rollover` lost het op.

⚠️ **Wat wél goed staat, en dat was een openstaande vraag uit de review:**
`verify_jwt` is `true` op alle drie de functies (`rollover`, `doelcoach`,
`notificaties`), gemeten via de Management API. De securityreview kon dat niet
vaststellen omdat er geen `supabase/config.toml` in de repo staat — de instelling
klopt dus, maar hij staat nergens in code. Zolang dat zo blijft, is het een
momentopname en geen grendel.

### 0c. Wat er al openstond en nog steeds openstaat

Deze punten stonden vóór 28-08 al in dit bestand en zijn niet opgelost. Ze zijn
hier bewust bewaard, want ze verdwijnen anders bij het herschrijven van de
bovenliggende secties — en dat is precies hoe een openstaand punt stil sterft.

- ⚠️ **Er is nooit een echte aanroep naar een Edge Function gedaan.** De proxy van
  de bouwomgeving weigert `supabase.co/functions/v1/*` met een 403 op de
  CONNECT-tunnel. Alle drie staan op `ACTIVE` met aantoonbaar de juiste bron;
  **dát een echte job er goed doorheen komt, moet vanaf jouw machine.**
- ⚠️ **Draai `npm run edge:gedeployd` een keer zelf.** Dat script vraagt
  `SUPABASE_ACCESS_TOKEN` uit `.env` en kon in de bouwomgeving niet draaien. De
  vergelijkingen hierboven zijn met de hand gedaan langs dezelfde bron — hetzelfde
  werk, niet dezelfde weg, en de weg die in `/audit` zit is die van het script.
- ⚠️ **Meet bij de eerste echte proef hoeveel van de zes weekstapvoorstellen de
  zeef overleven.** Blijft dat structureel onder de helft, dan is de prompt het
  probleem en niet de zeef — en dan voelt dit voor de gebruiker als "de coach doet
  niets".
- ⚠️ **Eén open vraag die geld raakt (grens 1).** De tip-generatie put uit
  hetzelfde dagquotum van tien als het opsplitsen van een doel en de weekstappen.
  Twee gescheiden potten zijn beter voor de gebruiker maar brengen het plafond naar
  dertien calls per dag. Onderbouwing in
  `docs/decisions/2026-08-27-de-doelcoachtip-per-mijlpaal.md` §5.
  ⚠️ **En sinds 28-08 weegt die vraag zwaarder:** het dagquotum telt jobs en niet
  tokens, en een invoer van 450.000 tekens werd geaccepteerd. Wie het plafond
  verhoogt zonder eerst de invoer te begrenzen, vermenigvuldigt een gat.
- ⚠️ **De wisselende reeks in `tests/rls/reeks.test.ts` is nog steeds niet
  verklaard.** De suite draait sinds PR #54 sequentieel over `tests/rls/`, wat de
  kans erop wegneemt maar niet de oorzaak. PR #60 heeft er twee plausibele
  verklaringen áfgehaald — gedeelde module-state en een globale veegfunctie,
  allebei gemeten en allebei uitgesloten — maar wélk bestand het doet is niet
  aangewezen, en sinds de herstructurering is het niet meer te reproduceren.
  **Ga hier niet op gokken**; zie de valkuilen over reproductie en over
  reparaties-uit-het-dossier.

- ⚠️ **De statusbug uit QS8-41** (`'error'` in de app tegenover `'failed'` in de
  database) hoort een eigen issue te zijn en is meegegaan in een andere PR, omdat
  Linear geen nieuwe issues aanneemt. Maak hem alsnog aan zodra dat kan.

### En daarna: de metingen die er al lagen


⚠️ **Twee dingen staan In Review en wachten alleen op een meting op jouw eigen
machine.** Ze zijn allebei code-compleet en gemerged; wat ontbreekt is het bewijs
dat het in het echt werkt. Dat is precies het soort openstaande punt dat stil
maanden blijft liggen, dus het staat bovenaan.

1. **QS8-24 bewijzen — er is nog nooit een gebeurtenis uít de app in Sentry
   aangekomen.** Uit een Edge Function wél (HTTP 200, gemeten op 26-08), en het is
   dezelfde envelope-bouwer — maar dat is een afgeleide en geen meting. Zet
   `EXPO_PUBLIC_SENTRY_DSN` in `.env`, draai `npm run deploy`, forceer een fout op
   `goalbuddies.q-projects.tech`, en kijk of hij in Sentry staat met
   `server_name: app` en `runtime: web`.

   Optioneel in dezelfde ronde: een token met scopes `project:releases` en
   `org:read` plus `SENTRY_ORG`/`SENTRY_PROJECT` in `.env`, dan zijn de stacks
   leesbaar in plaats van `bundle.js:1:284213`. Zonder die drie slaat de stap
   zichzelf over en gebeurt er niets ergs. ⚠️ Dat token is **wél geheim**, anders
   dan de DSN — die staat in elke clientbundel en hoort daar.

2. **QS8-124 bewijzen.** Draai `npm run vapid:genereer`, zet
   `EXPO_PUBLIC_VAPID_PUBLIC_KEY` in `.env` en alle drie de waarden met
   `npx supabase secrets set` (de privésleutel hoort níét in `.env` van de
   webbuild), draai de app, klik op Profiel → Meldingen aanzetten, en controleer
   of er een rij in `push_tokens` staat mét `p256dh` en `auth`. Lukt dat niet,
   lees dan de `reason` uit `registreer_push_token()` — sinds 0067 is dat een
   nette `{ok:false, reason}`.

3. **De schermen van EPIC 13 zijn nooit door een mens gelopen.** De epic zelf is
   af (QS8-132, Done sinds 25-08, migraties 0076 t/m 0080), maar er bestáát geen
   open groep: wat een lid daarvan te zien krijgt, is uitsluitend door de
   RLS-suite bewezen. Maak er één aan en loop hem door.

⚠️ **En dan houdt het op: in Fase 1 staat geen bouwwerk meer open.** Op 27-08
nagemeten in Linear en in de code, en dat is een stand die je makkelijk verkeerd
leest — vier issues stáán op In Progress, maar geen ervan wacht op code:

| Issue | Wat er nog ontbreekt | Van wie |
|---|---|---|
| QS8-24 | een echte gebeurtenis uit de app in Sentry | jij, punt 1 |
| QS8-124 | een rij in `push_tokens` met `p256dh` en `auth` | jij, punt 2 |
| QS8-117 | één melding op een échte iPhone met de app op het beginscherm | jij — manifest, iconen, content-type en de iOS-uitleg staan er allemaal |
| QS8-91 | ⚠️ **niets meer.** Het enige open criterium was "web push ontbreekt"; dat is sinds QS8-124 onwaar — `notificaties/index.ts` leest `p256dh`/`auth` en roept `verstuurWebPush()` aan | het bord loopt achter |
| QS8-25 | OAuth-providers aanzetten (Apple Developer-account, Google Cloud-project) en twee dashboardvinkjes | jij — grens 1 |

En de backlog is uitsluitend `phase:v2` en `phase:v3`. De regel was dat die pas
begint als Fase 1 zijn exit haalt — **een groep van drie draait ≥4 opeenvolgende
cycli** (WERKVOORRAAD §4) — en dat is zelf geen bouwwerk maar gebruik. Op 27-08
heeft Quinten daar een benoemde uitzondering op gemaakt; zie hieronder.

⚠️ **En sinds 28-08 is die uitzondering opgebruikt.** De vier `phase:v2`-issues
die zonder overleg te bouwen waren, zijn gebouwd. De zes die overblijven vragen
Storage, een betaalprovider, een dependency, een illustrator of een module waar
een parallelle sessie in werkt — de tabel met redenen staat in WERKVOORRAAD §4.
**Het werk ligt nu in `docs/ENGINEER-REVIEW.md`, niet in Linear.**

⚠️ **Dus was "wat bouwen we nu" de verkeerde vraag geworden** — en op 27-08 is
daar een antwoord op gekomen dat je moet kennen voordat je deze alinea leest als
een verbod.

**Quinten heeft Fase 2 bewust vrijgegeven terwijl Fase 1 nog openstaat.** Dat is
geen verwatering van de exit-eis: wat er van Fase 1 rest, vraagt zijn hand en
geen code — de vijf metingen hierboven. Er lag dus werk stil dat niet op code
wachtte, en werk dat wél op code wachtte lag ernaast te wachten op iets waar geen
enkele sessie iets aan kan doen.

⚠️ **Wat dat níét is: een sein om de v2-backlog af te gaan.** Er zijn vier issues
vrijgegeven, met naam, en die staan sinds 28-08 alle vier op `main`. De exit-eis
staat onverkort — **een groep van drie draait ≥4 opeenvolgende cycli** — en die
haal je niet met meer features. Wie een sessie begint met "ga verder met de
volgende epic" doet nog steeds precies wat deze alinea verbiedt; dat de backlog
nu leeg is aan bouwbare issues, maakt dat alleen makkelijker.

**De juiste vraag blijft welke van de vijf metingen als eerste gedaan wordt.**

**Twee procesvragen die niets blokkeren maar wel af horen te zijn vóór november**,
want dan komt er een tweede lezer: **QS8-123** (hoe merk je dat een als *Laag*
weggelegde bevinding zwaarder wordt door wat je erop bouwt) en **QS8-125** (deze
drie documenten die dezelfde stand beschrijven en uiteenlopen). Het is dezelfde
familie — niet *"wat is waar"* maar *"wie merkt het wanneer het niet meer waar
is"* — dus behandel ze in één ronde.

Vraag alleen als doorgaan-onder-aanname echt onveilig zou zijn.
