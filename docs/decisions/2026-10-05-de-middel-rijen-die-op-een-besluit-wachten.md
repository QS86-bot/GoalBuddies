# De Middel-rijen die op een besluit wachten

**Datum:** 05-10-2026 · **Issue:** QS8-642 · **Raakt:** `docs/ENGINEER-REVIEW.md`
**Status:** voorstellen. Er is hier **niets besloten**, en niets gebouwd.

## Wat dit is, en wat niet

Quinten vroeg op 05-10-2026 om de Middel-rijen van het dossier op te pakken. 📏
Het dossier telt **46 open Middel-rijen** en 350 open rijen in het geheel
(gemeten op `origin/main` = `ff363031`, eenheid: rijen met een risicokolom die
niet doorgestreept is). Doorgelezen zijn het geen werkvoorraad:

| wat de rij wacht | ruwe indeling | wat ik ermee kan |
|---|---|---|
| een **besluit onder grens 1** — wat een gebruiker beloofd of te horen gegeven wordt | ruwweg een derde | dit document |
| een **productiemeting, een deploy of een platform** dat hier niet draait | ruim een derde | niets, behalve meten wat alleen-lezen kan |
| een **parallelle sessie** — de types-laag zit vast achter QS8-641 | twee rijen | niets: het issue is geclaimd |
| **agenda** — product- of procesvragen die met gebruikers of een afweging beantwoord worden | de rest | niets |

⚠️ **Dat is een indeling op titel en de eerste zevenhonderd tekens van elke rij,
en geen oordeel over alle 46; de verhoudingen zijn schattingen.** De zeven
besluiten hieronder rusten op de volledige tekst van hun rijen. De acht
geld-rijen van de volgende alinea zijn beoordeeld op hun *Wordt zwaarder
als*-tekst en niet volledig gelezen.

Elke bewering over de toestand van productie draagt zijn meetdatum; wat niet
hermeten is, staat er als *niet hermeten* bij.

## De vondst die door meerdere rijen heen loopt: geld is sinds 22-09 uitgesloten

CLAUDE.md zegt bij domeinregel 5 dat een straf de gebruiker **nooit** een
geldbedrag oplegt — besloten op 22-09-2026 (QS8-86), uitleg in
`docs/decisions/2026-09-22-vier-besluiten-en-twee-ervan-zijn-een-regel.md`. Een
consequentie is trakteren of iets dat de gebruiker zelf koos, en dat is
vrijblijvend.

📏 **Acht open rijen noemen geld (of een "externe verplichting") in hun
*Wordt zwaarder als*-tekst**, en geen van de acht is na 22-09 bijgewerkt op die
voorwaarde (gemeten door de tekst achter elke *Wordt zwaarder als* te doorzoeken
op `geld`, `betaling`, `inning` en `euro`; eenheid: open rijen, ook
Hoog en Laag):

| rij (titel) | risico | blijft er een andere voorwaarde over? | voorstel |
|---|---|---|---|
| *Een straf is vrijwillig tot hij `due` is* | **Hoog** | de tweede voorwaarde — de getuige-**persoon** wordt de gebruikelijke vorm — staat er nog | ⚠️ de **kern** van deze rij (*eenzijdig en gratis intrekken*, de knop `trekIn()`) is sinds 22-09 het besluit zelf: domeinregel 5 zegt dat de app niets afdwingt. Wat overblijft is dat een persoon-getuige niets hoort bij intrekken — dat is B1. Laten staan tot B1 beslist, daarna verlagen. |
| *De begunstigde van een straf beslist mee over het respijt* | Middel | ja: zakelijk gebruik | laten staan, tekst bijwerken |
| *Wordt een straf ná de teruggang ingetrokken…* | Middel | alleen *"geld of een externe verplichting"* | herindelen naar Laag, tenzij B1 hieronder anders beslist |
| *`beslis_deadline_verzoek()` neemt genoegen met een tweede eigen account* | Middel | ja: registratie zonder kosten of verificatie (en publieke zichtbaarheid) | laten staan, tekst bijwerken |
| *De poort van `herstel_stuurloze_straf()` …* | Middel | ja: een pad dat een `groups`-rij écht verwijdert | laten staan, tekst bijwerken |
| *`verwijder_mijn_account()` heeft geen poort op een lopend commitment* | Middel | alleen *"geld of een externe verplichting"* | herindelen naar Laag |
| *`bewijsfotos_delete` kent geen status- of tijdgrens* | Laag | ja | laten staan, tekst bijwerken |
| *De bevroren strafklok ligt vast voor de rij en niet voor de afspraak* | Laag | ja: vaker annuleren en opnieuw aangaan, of een derde beslissing aan de bevroren zone | laten staan, tekst bijwerken |

⚠️ **Wat hier níet staat is een oordeel dat die risico's klein zijn.** Domeinregel
5 zegt zelf wat hij **niet** besluit: of *"straf"* en `due` mee moeten
veranderen, omdat die woorden iets hards suggereren. Een straf die vrijblijvend
is, kan nog steeds een schaamtemoment zijn, en dat is het bereik van domeinregel
7. Het vervallen van de geld-voorwaarde maakt de rijen minder zwaar op één as;
het zegt niets over de andere.

⚠️ **De herindeling zelf is een besluit van Quinten** en staat daarom hier als
voorstel: een risico verlagen verandert wat de engineer-review in november als
eerste leest.

## B1 — Wat hoort een getuige te horen als een straf terugkomt of weer afgaat?

*Rijen: *Wordt een straf ná de teruggang ingetrokken…* en *Ná
`commitment_reverted` is een twééde keer verschuldigd worden stil*. Grens 1: dit
is een melding aan een mens over een commitment device.*

📏 Wat de rijen meten (security-ronde van QS8-321, 19-09-2026, tegen een lokaal
opgebouwd schema; **niet hermeten op 05-10**):

- `set → due → (commitment_witness geboekt) → set → cancelled` geeft
  `teruggedraaide_straffen_voor()` **nul rijen**: de laatste melding die de
  getuige heeft blijft *"is verschuldigd geworden"*.
- Met een bestaande `commitment_witness`-rij geeft `getuigenissen_voor()` **nul
  rijen** bij de tweede keer `due`, door de unieke index
  `notifications_sent_per_onderwerp` op `(user_id, kind, ref_id)` — terwijl de
  status wel `due` is.

⚠️ **De richting is het punt.** Vóór migratie `0293` verouderde de kennis van de
getuige de veilige kant op: hij dacht dat er een straf openstond die er niet
meer was. Erna kan hij te horen hebben gekregen dat de straf **niet meer**
verschuldigd is terwijl hij dat wél is. De grond die `0293` opschrijft — dat een
bericht bij intrekken domeinregel 11 zou schenden — geldt voor een getuige die
niets weet, niet voor een die al een `commitment_witness`-melding draagt.

| optie | wat het is | prijs |
|---|---|---|
| **A — de getuige die het al weet, hoort het ook als het terugdraait en opnieuw gebeurt** | het intrekbericht en een tweede verschuldigd-worden worden toegelaten voor wie al een `commitment_witness`-melding draagt, onder dezelfde conjunct als het teruggangbericht van `0293` | een migratie (de unieke sleutel verruimen of een tweede soort melding), en een nieuwe tekst die een mens te lezen krijgt. *Niet gemeten:* of dat de meldingenjob en de index aankan zonder dubbele pushes. |
| **B — laten zoals het is, en de grond in de kop van `0293` rechtzetten** | het besluit blijft, de redenering klopt | geen code. De getuige kan blijven geloven dat een straf voorbij is die dat niet is. |

**Aanbeveling: A voor het tweede geval, B voor het eerste.** Een getuige die te
horen kreeg *"niet meer verschuldigd"* terwijl het wel zo is, is de verkeerde
kant op voor een commitment device. Dat de straf ná de teruggang wordt
ingetrokken en de getuige daar niets van hoort, laat hem hoogstens een straf
denken die er niet meer is — de veilige kant. **Dat is een afweging op
mijn lezing van de twee rijen en geen meting.**

**Volgorde:** geen migratie vóórdat QS8-641 beslist wat er met `0299` en `0300`
op productie gebeurt — een nieuw nummer vanaf `main` botst daar.

## B2 — Wie beslist over een verschuiving van een straf?

*Rijen: *De begunstigde van een straf beslist mee over het respijt* en
*`beslis_deadline_verzoek()` neemt genoegen met een tweede eigen account*.*

📏 Wat de rijen meten: `beslis_deadline_verzoek()` toetst lidmaatschap en dat de
beslisser niet de aanvrager is. Het toetst niet of de beslisser de **begunstigde**
is (`pg_get_functiondef` op productie op 21-09-2026: `beneficiary_user_id` komt er
nul keer in voor — niet hermeten op 05-10), en een tweede eigen account in de
eigen groep keurt een verschuiving goed (hermeten op 18-09-2026 na `0288`).

⚠️ De tweede rij is **breder dan deadline-verzoeken**: ze raakt peer-goedkeuring
als geheel, dus domeinregel 3. Voor een open groep, waar vreemden in kunnen
zitten (QS8-230), weegt dat zwaarder; zie ook de rij over `cycle_start_date` en
het klassement.

| optie | wat het is | prijs |
|---|---|---|
| **A — laten, en opschrijven als besluit** | de begunstigde mag meebeslissen (hij kan het beste beoordelen of uitstel terecht is); een tweede eigen account blijft een bekende grens | geen code. Het respijt kan afgenomen worden door de begunstigde; een sock puppet kan een verschuiving goedkeuren. Beide schaden alleen de eigen afspraak, want de straf is vrijblijvend. |
| **B — de begunstigde mag niet over zijn eigen straf beslissen** | een toets in `beslis_deadline_verzoek()` | migratie. In een groep waar de enige andere beslisser de begunstigde is, kan niemand beslissen; migratie `0175` (*een verzoek dat niemand kan beslissen is geen verzoek*) raakt dat geval en is hier **niet herlezen**. |
| **C — een rem op nieuwe leden of nieuwe accounts als beslisser** | bijvoorbeeld pas na N dagen lidmaatschap | migratie en een getal dat bepaalt wat een buddy beloofd wordt. De grens is een aanname zolang er geen gebruikers zijn. |

**Aanbeveling: A, voor deadline-verzoeken.** Sinds QS8-86 kost een straf niemand
geld en dwingt de app niets af; wie zijn eigen verzoek laat goedkeuren, bedriegt
zijn eigen afspraak. **⚠️ Dat is geen uitspraak over het klassement of
goedkeuringen die punten opleveren in een open groep** — daar is de uitkomst
wél waarde, en dat is een eigen besluit.

## B3 — Mag een getuige weigeren?

*Rij: *`commitments` — de spamvector, na drie security-rondes* (QS8-293). Grens
1: een commitment device.*

📏 De rij houdt open dat een getuige een aanwijzing niet kan weigeren; het aantal
doelen en commitments per gebruiker is sinds `0192` en `0203` begrensd op 200
per dag per tabel (hermeten op 21-09-2026 op productie) — *een tempo en geen
totaal*. ⚠️ Twee keer achter elkaar is de keten **end to end mét een gedeelde
groep** als ongemeten opgeschreven.

⚠️ **De eerste vraag is geen productvraag maar een meting:** geeft de bestaande
blokkade (`user_blocks`, migratie `0145`) een getuige al een uitweg? Dat staat in
geen rij en is hier niet hermeten.

| optie | wat het is | prijs |
|---|---|---|
| **A — nee: de getuige is ontvanger en geen partij** | de huidige toestand, mét het dagplafond | geen code; een geduldige aanvaller betaalt dagen in plaats van seconden |
| **B — de getuige kan een aanwijzing weigeren** | nieuwe toestand op de aanwijzing; de eigenaar moet een andere getuige kiezen | migratie, scherm, tekst, en een nieuwe regel in wat de eigenaar te horen krijgt |
| **C — blokkeren is genoeg** | de bestaande blokkade telt ook voor aanwijzingen | afhankelijk van de meting hierboven; mogelijk geen bouwwerk |

**Aanbeveling: eerst de meting, daarna C of A.** B is de dure en de enige die een
nieuwe belofte aan een gebruiker doet.

## B4 — Breekt stilte een reeks?

*Rij: *Stilte breekt een reeks niet* (QS8-609). Grens 1: wat een gebruiker aan
zijn reeks aflevert.*

📏 Gemeten op 24-09-2026, lokaal opgebouwd schema: twaalf gehaalde cycli,
**zesentwintig zonder één rij**, twaalf gehaalde cycli → `herbereken_reeks()`
geeft **24**. De rij noemt dit zelf *een ongeschreven besluit en geen breuk*; de
toets `tests/rls/tijdhorizon.test.ts` bewaakt het gedrag zonder het goed te
keuren.

| optie | wat het is | prijs |
|---|---|---|
| **A — bevestigen: stilte is geen falen** | domeinregel 8 (*de reeks dient de gebruiker*) en 9 (*een dag overslaan heeft geen gevolg*) als grond, vastgelegd als besluit | geen code. Reeks en puntentotaal beschrijven andere perioden zodra een scherm ze naast elkaar toont. |
| **B — een lege cyclus telt als gemist** | de rollover boekt `missed` voor een cyclus zonder rijen | wijzigt met terugwerkende kracht elke reeks, en een minpunt voor iets dat niemand plande. Botst met 8 en 9. |
| **C — A, plus een aparte telling van actieve weken naast de reeks** | de reeks blijft; een tweede getal toont wat er gedaan is | een oppervlak en een tekst. Pas relevant als zo'n scherm bestaat. |

**Aanbeveling: A**, en C pas als er een oppervlak komt dat de twee naast elkaar
toont.

## B5 — Waar komt een melding over de platformbeheerder terecht?

*Rij: *Een melding over de **platformbeheerder** komt nergens aan* (QS8-586,
`0297`). Grens 1: de rij zegt dit zelf.*

📏 Sinds `0297` kan het onderwerp van een melding die niet lezen of dempen;
daardoor komt een klacht over de platformbeheerder **nergens** aan (route (a) en
(b) vallen allebei af). Niet hermeten op 05-10.

| optie | wat het is | prijs |
|---|---|---|
| **A — een e-mailroute buiten de app** | een adres in de tekst bij de meldknop | belooft dat iemand het leest; er is een proces nodig |
| **B — een tweede platformbeheerder** | een tweede mens met het recht | een tweede persoon |
| **C — expliciet in de tekst bij de meldknop: *"dit kan de app niet oplossen"*** | copy | belooft niets. Wie een klacht heeft over de beheerder, weet dat hij hem niet hier kwijt kan. |

**Aanbeveling: C nu.** De conservatiefste keuze die het werk afmaakt, en A of B
kan er later bij zonder iets terug te nemen. De tekst valt onder de emoji- en
catalogusregels van CLAUDE.md.

## B6 — De Doelcoach boekt 1,5× de lijstprijs: deployen?

*Rij: *De gedeployde Doelcoach boekt elke AI-job op **1,5× de lijstprijs*
(QS8-587). Grens 1: dit raakt wat Quinten aan AI uitgeeft en wat een gebruiker
per dag mag.*

📏 **Hermeten op 05-10-2026**, alleen-lezen via de Supabase-MCP: de gedeployde
`doelcoach` is **v20** (laatste update 09-09-2026) en draagt in zijn bron
`PRIJS_PER_MTOK_CENT = { invoer: 300, uitvoer: 1500 }`. De repo
(`supabase/functions/doelcoach/index.ts`) draagt een tabel op model met
**200/1000**, vastgelegd in `tests/beloftes/doelcoach-prijs.test.ts`. De rij van
24-09 klopt dus nog; het getal 1,5 is 300/200 en 1500/1000.

⚠️ Het is niet alleen een rapportagefout: sinds `0182` leest het dagquotum
`cost_cents`, dus de poort knijpt anderhalf keer harder dan ontworpen (de rij:
een maximale job telt voor 13,2 in plaats van 8,8 cent; bij een dagbudget van 30
cent gaan er 2 door in plaats van 3). Het dagbudget zelf verandert niet.

| optie | wat het is | prijs |
|---|---|---|
| **A — de repo-versie deployen** | de reparatie van QS8-243, en verder niets | een deploy van een edge-functie; `docs/DEPLOY.md` §2.3a noemt de volgorde met migraties. Een gebruiker mag per dag een job meer. |
| **B — wachten** | | de poort knijpt door; een uitgavenplafond op `ai_kosten_per_week()` staat op een getal dat 50% te hoog is |

**Aanbeveling: A**, vóór er een uitgavenplafond op `cost_cents` komt. Analyse in
`docs/decisions/2026-09-24-de-doelcoach-zonder-anthropic.md` §1b.

⚠️ **Wat ik niet kon meten:** of de repo-versie van `doelcoach` nog andere
verschillen met v20 draagt dan de prijs. De deploy neemt alles mee wat sinds
09-09 in die map veranderd is; dat verschil is hier niet doorgerekend.

## B7 — Zijn zeven dagen na het ontkoppelen het goede getal?

*Rij: *Bewijseis te omzeilen met ontkoppelen*. Grens 1: de rij zegt zelf dat dit
bepaalt wat een buddy beloofd wordt.*

📏 De rij legt uit dat de zeven dagen *"de conservatiefste keuze die het werk af
maakt"* zijn en **geen besluit**, en dat hij door Quinten bevestigd hoort te
worden. De rij is op 21-09-2026 hermeten: de klasse waarvoor hij waarschuwt is
gegroeid, want **34** functies in `public` noemen `goal_group_links` (uit
`prosrc`; de zestien van 01-09 zijn niet met dezelfde maat geteld).

| optie | wat het is | prijs |
|---|---|---|
| **A — zeven dagen bevestigen** | het getal staat | geen code; de aanname wordt een besluit |
| **B — korter (bijvoorbeeld drie dagen)** | een buddy ziet sneller een verschuiving zonder akkoord | de wachttijd is korter dan een week; het omzeilen goedkoper |
| **C — langer (bijvoorbeeld veertien dagen)** | | een doel dat een groep verlaat is langer zonder weg naar een nieuwe datum (de dode keten van QS8-113) |

**Aanbeveling: A.** Een kleinere of grotere termijn heeft geen gemeten reden; een
bevestigd getal sluit de aanname die de rij open houdt.

## Wat hier níet in staat

- **De types-laag** (*`src/lib/database.types.correcties.ts` is geen volledige
  doorlichting*, *De "blokkade" op QS8-174 was er geen*): geclaimd door
  QS8-641. 📏 Op 05-10-2026 hermeten dat productie op `0300` staat en de map op
  `0298`; zie de reactie bij dat issue.
- **Rijen die op een deploy of een platform wachten** (de gedeployde
  uurjobs, de storage-dienst, de Apple-aanmelding, de `IDS_PER_VERZOEK`-grens op
  een echt platform): niet te meten vanuit een cloudsessie.
- **Product- en procesvragen** (de heuristiek van de Risico-radar, twee ritmes,
  *geen enkele test laat tijd verstrijken*): die worden met gebruikers
  beantwoord of met een afweging, en een voorstel zou hier verzinsel zijn.
- **De openbare repo** (*De repository staat publiek*, QS8-126): door Quinten
  uitgesteld tot de software af is. 📏 De rij zelf meldt op 21-09 dat geen van de
  drie voorwaarden is ingetreden; niet hermeten op 05-10.

## Hoe te beslissen

Eén regel per besluit is genoeg, bijvoorbeeld *"B1: A voor het tweede geval, B
voor het eerste · B2: A · B3: eerst meten · B4: A · B5: C · B6: A · B7: A · de
herindeling van de twee rijen: ja"*. Daarna maakt de bouwende sessie per besluit
een eigen issue; migraties wachten op QS8-641.
