# Backlog-plan — hoe de openstaande Linear-issues afgehandeld worden

> **Dit document bezit de aanpak**: in welke banen de backlog uiteenvalt, in
> welke volgorde die banen gaan, en waarom snelheid hier niet uit méér sessies
> komt. Het bezit **de stand niet** — die staat in Linear. `docs/WERKVOORRAAD.md`
> bezit de volgorde van het productwerk; dit bestand raakt die volgorde niet aan,
> het zegt alleen hoe de voorraad eromheen leegloopt.
>
> 📏 Elk getal hieronder is een **momentopname van 08-09-2026, ±08:15 UTC**,
> gemeten aan Linear, `git ls-remote` en de openstaande PR's. Het is de
> onderbouwing van dit plan en niet een teller om bij te werken. **Vraag de stand
> aan Linear, niet aan dit bestand.**

---

## 0. Wat er gemeten is

| Wat | Meting |
|---|---|
| Issues in **Backlog** | **44** |
| Issues in **Todo** | 14, waarvan 13 met label `wacht-op-Quinten` |
| Issues in **In Progress** | 7 — vier stuks werk (QS8-352, QS8-349, QS8-344, QS8-262) en drie epics |
| Aangemaakt in de laatste 7 dagen | **104** |
| Daarvan al gesloten | **82** |
| Daarvan nog open | **22** |
| Van de 44 backlog-issues aangemaakt in de laatste **48 uur** | **16** |
| Backlog-issues die al een branch op de remote hebben | 3 — QS8-353 (PR #302), QS8-345 (lege claim 03:54 UTC), QS8-335 (lege claim gisteren 18:20 UTC) |

⚠️ **De belangrijkste uitkomst staat in de derde en vierde rij.** In zeven dagen
kwamen er 104 issues bij en gingen er 82 uit. De backlog is geen eindige stapel
van 44 die je leeg kunt werken; het is een stroom waarvan de instroom en de
uitstroom ongeveer even hard lopen. **Sneller afhandelen door harder te werken
raakt alleen de uitstroom, en dat is de helft die het al bijhoudt.**

---

## 1. Waar de nieuwe issues vandaan komen

📏 Dertien branches uit de laatste twee dagen leverden zestien nieuwe
backlog-issues op. Elke rij is een security-ronde op een branch die iets
náást de opdracht vond:

| Gebouwd op | Leverde op | Klasse |
|---|---|---|
| QS8-352 | QS8-354, QS8-355 | een client schrijft een kolom die hij niet hoort te schrijven |
| QS8-349 | QS8-351, QS8-353 | idem |
| QS8-343 | QS8-347 | hoevéél een client in één verzoek mag invoegen |
| QS8-342 | QS8-345 | een lijst zonder bovengrens in een scherm |
| QS8-340 | QS8-350 | een grendel die zijn eigen klasse niet volledig dekt |
| QS8-341 | QS8-346 | een controle die zichzelf overslaat |
| QS8-330 | QS8-338 | dezelfde reparatie op een tweede set aanroepen |
| QS8-317 | QS8-321, QS8-322 | wat een straf overleeft |
| QS8-331 | QS8-335 | idem |
| QS8-312 | QS8-333 | idem |
| QS8-328 | QS8-332 | de weg terug voor een oud-lid |
| QS8-314 | QS8-325 | een toestand in een CHECK zonder schrijver |
| QS8-297 | QS8-305 | dezelfde vormtoets op het tweede platform |

⚠️ **Kijk naar de rechterkolom en niet naar de linker.** Zestien issues, zeven
klassen. Vier issues zeggen hetzelfde over de schrijfkant van kolomrechten, vier
zeggen hetzelfde over wat er met een straf gebeurt. Ze zijn één voor één
aangemaakt omdat ze één voor één gevónden zijn, niet omdat het één voor één
verschillende problemen zijn.

**Daarmee is de snelste route geen planningsvraag maar een vormvraag:** zolang
elke instantie een eigen issue, een eigen branch, een eigen poort van 48 stappen
en een eigen PR krijgt, kost een klasse van vier het viervoudige van een klasse
van één — terwijl de reparatie grotendeels dezelfde is. De overhead per issue is
in dit project de grootste kostenpost, niet het denkwerk.

### Twee hefbomen, en ze zijn allebei goedkoop

1. **Eén veegissue per klasse, en de instanties eronder.** QS8-351 is dat al —
   het issue zegt met zoveel woorden *"dit issue is de klasse zelf, niet de
   controle"*. QS8-353, QS8-354 en QS8-355 zijn instanties van diezelfde klasse.
   Bouw de klasse één keer, met de controle als ratel, en de instanties vallen
   mee om.

2. **Een bevinding die tot dezelfde klasse hoort, landt op de branch waar hij
   gevonden is** — in plaats van als nieuw issue op de stapel. Dit botst *niet*
   met de bundelregel uit `CLAUDE.md`: die verbiedt het samenvoegen van bestaande
   issues, en dit voorkomt dat er een tweede issue ontstaat. Een bevinding van
   een ándere klasse blijft een eigen issue.

   ✅ **Besloten op 08-09-2026 en vastgelegd.** Het staat als regel in
   `CLAUDE.md` bij onwrikbare regel 19, met de redenering in
   `docs/decisions/2026-09-08-een-bevinding-van-dezelfde-klasse.md`. Drie dingen
   blijven gelden en zonder die drie is het een gat: de bevinding wordt met
   zoveel woorden genoemd in de commit én het issue, de poort geldt onverkort
   voor elke instantie erbij, en wordt de PR groter dan in één keer te
   beoordelen is, dan is het alsnog een tweede issue.

---

## 2. De vijf banen

De 44 issues vallen zonder rest uiteen in vijf banen. **De baan bepaalt wie het
doet en waar het op wacht — niet de prioriteit in Linear.**

| Baan | Wat het is | Aantal |
|---|---|---|
| **A** | Bouwen nu, **zonder** migratie | 5 |
| **B** | Bouwen nu, **mét** migratie — serieel, één sessie tegelijk | 7 |
| **C** | Wacht op een antwoord of een handeling van Quinten | 6 |
| **D** | Dossierrijen voor de engineer-review van november — **niet bouwen** | 14 |
| **E** | Epics en Fase 2/3 — geen backlogwerk maar routekaart | 12 |

### Baan A — bouwen nu, zonder migratie (5)

Geen migratienummer, dus onderling parallel te bouwen zonder botsingsrisico.

| Issue | Wat het vraagt |
|---|---|
| QS8-350 | De grendel op een weggegooide uitkomst kent de vorm zonder `void` niet — script + twee aanroepen |
| QS8-346 | `edge:types:controle` slaat zichzelf over met een advies dat hier niet werkt — de derde klasse naast OVERGESLAGEN en rood |
| QS8-338 | 74 aanroepen sturen `code: error.code` mee; dezelfde reparatie als QS8-330 op de tweede set |
| QS8-332 | Beheerder ziet bij een lidmaatschapsverzoek niet dat de aanvrager een oud-lid is — scherm, mogelijk één leesfunctie erbij |
| QS8-345 | De uitsluitlijst van het koppelscherm gaat mee in de URL en die heeft een grens — **claim staat sinds 03:54 UTC leeg** |

### Baan B — bouwen nu, mét migratie (7)

⚠️ **Deze baan is serieel.** Migratienummers zijn in dit project vier keer
gebotst en twee ervan landden acht seconden na elkaar op `main`. Eén sessie
tegelijk in deze baan, `npm run claim` vooraf, en hernummeren als je als tweede
merget.

| Issue | Wat het vraagt |
|---|---|
| QS8-351 | **De veegissue van de klasse**: zeven (van achttien) schrijfrechten open zonder aanroeper |
| QS8-353 | Instantie: een client maakt een `done`-mijlpaal met eigen id — **PR #302 staat open**, laat die eerst landen |
| QS8-354 | Instantie: `cycle_start_date` is de resterende client-knop in een boeking |
| QS8-355 | Instantie: `guard_group_update()` pint `tz` niet — een beheerder verzet de groepsklok |
| QS8-347 | Een geweigerde bulk-POST schrijft eerst; hoort bij QS8-344, dat al In Progress is |
| QS8-325 | `paused` staat in de CHECK en wordt door niemand geschreven |
| QS8-305 | Een native pushtoken heeft geen vormtoets; tweede platform van QS8-297 |

### Baan C — wacht op Quinten (6)

| Issue | Waarop |
|---|---|
| QS8-321 | Een straf intrekken kan met één knop, zonder buddy en zonder bericht |
| QS8-322 | Te laat afronden laat de straf vervallen; de beloning wordt wél op tijdigheid getoetst |
| QS8-333 | Een getuige die zijn account verwijdert laat een verschuldigde straf stuurloos achter |
| QS8-335 | `verwijder_mijn_account()` wist elke straf en zijn auditspoor — **claim staat sinds gisteren 18:20 UTC leeg** |
| QS8-197 | Apple- en Google-knop: de providers staan uit in het Supabase-dashboard |
| QS8-240 | Twee oude branches opruimen; een cloudsessie krijgt 403 op verwijderen |

⚠️ **De eerste vier zijn één vraag en geen vier.** Ze gaan alle vier over
hetzelfde: wat overleeft een straf. Dat is een commitment device, en daarmee
grens 1 uit de beslisbevoegdheid — wat de gebruiker als consequentie beloofd is,
beslist een sessie niet zelf. Zie §5 voor de vraag in één ronde.

### Baan D — dossierrijen voor november (14)

Deze rijen komen uit `docs/ENGINEER-REVIEW.md` en staan in Linear omdat Quinten
ze op het bord wilde kunnen teruglezen (QS8-169). **Zes ervan dragen 🗣 in de
titel en zeggen zelf dat ze een gespreksvraag zijn en geen sprintwerk.**

| Issue | Waarom niet nu |
|---|---|
| QS8-180, QS8-181, QS8-183, QS8-184, QS8-187, QS8-194 | 🗣 gespreksvraag voor november; vier ervan zijn op 25/27-08 beoordeeld als *niet te meten* zonder echt gebruik |
| QS8-182, QS8-188, QS8-189, QS8-204, QS8-209, QS8-179, QS8-220 | Weggelegde bevindingen met een `**Wordt zwaarder als:**`-voorwaarde; de aanname staat er en is nog niet vervallen |
| QS8-169 | De index van deze veertien zelf — sluit als laatste van de baan |

**De snelste afhandeling is hier een besluit en geen branch:** geef de baan een
eigen milestone of status in Linear (`Engineer-review november`), zodat de
Backlog laat zien wat er te bouwen valt. Veertien van de 44 verdwijnen daarmee
uit het zicht zonder dat er iets weggegooid of afgevinkt wordt dat niet af is.

⚠️ **Twee ervan leken goedkoop echt te sluiten; bij het nalezen is dat er één.**
QS8-182 is op 27-08 hermeten en de vrees in de rij ("stilletjes") klopt niet meer
— maar het issue eindigt met *"wat een reviewer moet wegen is of een CHECK op een
gedenormaliseerde kolom hier de juiste vorm is. Dat is een oordeel en geen
meting."* Dat is precies een gespreksvraag, dus hij blijft staan. Bij QS8-220 is
de vraag wél een meting: staat het `--`-commentaar vandaag nog steeds niet in de
gedeployde functies? Meet dat tegen productie en sluit hem als de meting het
draagt.

### Baan E — epics en Fase 2/3 (12)

| Issue | Wat het is |
|---|---|
| QS8-200 (Urgent), QS8-229 | EPIC: van aanmelden naar een plan in tien minuten |
| QS8-230, QS8-233 | EPIC: buddy's vinden die je niet kent |
| QS8-252 | EPIC: ritme, kleur en een dashboard — branch bestaat, besluiten A53 t/m A56 |
| QS8-250, QS8-108 | **Overlappen vrijwel volledig**: spraak naar tekst in tekstvelden. Voeg samen; QS8-250 is de bredere formulering |
| QS8-71, QS8-72 | Foto's en documenten in de chat: betaalde tier + een nieuw groepszichtbaar oppervlak |
| QS8-92 | Notificatietypes zelf aan- en uitzetten |
| QS8-86 | Echte-geld-commitments: juridische toetsing, grens 1 |
| QS8-109 | Mascotte: alleen de vórmgeving nog, vraagt een illustrator |

⚠️ **Een epic is geen backlog-issue.** QS8-200 staat op Urgent en is daarmee het
hoogst geprioriteerde ding op het bord, maar hij is niet "af te handelen" — hij
is op te splitsen. Zolang de drie epics als één regel in de Backlog staan, is
elke telling van de backlog scheef: drie regels dragen weken werk en veertien
regels dragen niets dat vandaag gebouwd wordt.

---

## 3. Volgorde en dagplan

**Dag 0 — een half uur boekhouding, en het is het goedkoopste half uur in dit plan.**

1. QS8-353 op **In Review** — er staat een PR open terwijl het issue Backlog zegt.
2. De twee lege claims aanspreken: QS8-345 (03:54) en QS8-335 (18:20 gisteren).
   Een claim is een afspraak en geen slot; een claim zonder werk houdt een issue
   bezet zonder dat iemand eraan begint.
3. Baan D naar een eigen milestone (14 issues uit de Backlog).
4. QS8-108 samenvoegen met QS8-250 (1 issue uit de Backlog).
5. De epics QS8-200, QS8-230 en QS8-252 uit de Backlog naar hun eigen milestone.

📏 Na dag 0 staat er **26** in de Backlog waarvan er **12** vandaag te bouwen zijn.

✅ **Dag 0 is uitgevoerd op 08-09-2026.** Wat er staat: QS8-353 staat op In
Review, QS8-108 is duplicaat van QS8-250 (het veldenlijstje en de voorkeur voor
herkenning op het apparaat zijn overgezet vóór het sluiten), de veertien rijen
van baan D dragen het nieuwe label **`review:november`**, QS8-252 draagt nu ook
`epic`, en op QS8-335 staat waarom zijn claim leeg is.

⚠️ **Twee dingen die anders liepen dan het plan zei.** De claim op QS8-345 is
van 03:54 UTC vandaag en dus niet oud — die is met rust gelaten; alleen die van
QS8-335 (veertien uur, leeg) is aangesproken. En het team kent geen status
tussen Backlog en Todo in, dus baan D is een **label** geworden en geen status:
de bouwbare voorraad is de Backlog met `-label:review:november -label:epic
-label:phase:v2 -label:phase:v3`.

**Dag 1 — baan A en de kop van baan B, parallel.**

| Baan | Werk |
|---|---|
| Sessie 1 (migraties) | PR #302 landen → QS8-351 als veegissue van de klasse, met QS8-354 en QS8-355 als instanties eronder |
| Sessie 2 (geen migratie) | QS8-350, QS8-346, QS8-338 |
| Quinten | De beslisronde uit §5 — 30 tot 60 minuten |

**Dag 2 — de staart van baan B en de rest van baan A.**

| Baan | Werk |
|---|---|
| Sessie 1 (migraties) | QS8-347 (na QS8-344), QS8-325, QS8-305 |
| Sessie 2 (geen migratie) | QS8-345, QS8-332 |

**Dag 3 — baan C, zodra de antwoorden er zijn.** QS8-321, QS8-322, QS8-333 en
QS8-335 zijn één samenhangende reparatie op wat een straf overleeft; ze horen in
één ronde in de migratiebaan. QS8-197 en QS8-240 zijn dan handelingen van
Quinten, geen sessiewerk.

**Uitkomst na dag 3:** de twaalf bouwbare issues zijn gebouwd, de vier
straf-issues zijn gebouwd of expliciet uitgesteld, en wat er in de Backlog
overblijft is de epic-routekaart en de v2/v3-voorraad. **Dat is de snelst
haalbare afhandeling van de huidige 44 — en niets erin is een gok over
snelheid: de gemeten uitstroom van de afgelopen week is 82 issues in 7 dagen.**

---

## 4. Parallel werken — drie banen en niet meer

Meer sessies is de voor de hand liggende versnelling en het is de duurste. Wat
dit project daarover gemeten heeft:

| Wat er misging | Hoe vaak |
|---|---|
| Hetzelfde issue twee keer gebouwd, allebei helemaal af | 3 keer op één dag (QS8-287, QS8-286, QS8-214) |
| Migratienummer gebotst | 4 keer, de laatste keer mét het gereedschap |
| Twee migraties `0182` op `main`, acht seconden na elkaar | 07-09-2026 |
| Merge-conflict op één regel in `WERKVOORRAAD.md` | 7 van de 7 merges op één dag |

**De regels die daaruit volgen, en die dit plan aanhoudt:**

1. **Drie banen tegelijk, hooguit.** Eén draagt alle migraties en is serieel; twee
   dragen migratievrij werk (scripts, schermen, documenten).
2. **`npm run claim -- <branchnaam van Linear>` vóór de eerste regel code.** Het
   issue op In Progress zetten is geen claim gebleken.
3. **Wie als tweede merget, hernummert.** Het venster tussen de laatste groene CI
   en de merge is er per definitie, en wordt breder naarmate er parallel gewerkt
   wordt.
4. **Eén `npm run poort` per branch, aan het eind — niet per commit.** De poort is
   48 stappen; hem drie keer draaien per issue is de stilste manier om een dag te
   verliezen.
5. **Raak `docs/WERKVOORRAAD.md` in een migratiebranch niet aan** tenzij de stand
   echt verandert. Dat bestand is de conflicthaard.

---

## 5. De beslisronde — gehouden op 08-09-2026

⚠️ **Drie van de vier vragen zijn beantwoord; hieronder staat wat er besloten is
en wat er nog ligt.** De vraagstelling blijft staan omdat de meting eronder de
onderbouwing is van het besluit.

| Vraag | Uitkomst |
| -- | -- |
| Wat overleeft een straf? | **Per geval beslissen.** Alle vier de voorstellen staan er, elk met zijn eigen meting: QS8-321, QS8-322, QS8-333 en QS8-335. Dit is het enige dat nog op Quinten wacht |
| Mag een gewoon lid zien wie er uit de groep gezet is? | **Ja — laten zoals het is, en vastleggen.** Oppervlak 31 in beslisdocument 002 draagt het besluit; de agendarij in `docs/ENGINEER-REVIEW.md` is ermee gesloten |
| Mag een bevinding van dezelfde klasse op de branch landen? | **Ja.** Zie §1 en `docs/decisions/2026-09-08-een-bevinding-van-dezelfde-klasse.md` |
| Welke v2-issues zijn vrij? | **QS8-250, QS8-92, QS8-71 en QS8-72.** QS8-109 (de mascotte) blijft liggen tot Quinten een vormgeving kiest |

## 5a. De vraagstelling, met de metingen

### Vraag 1 — wat overleeft een straf? (QS8-321, QS8-322, QS8-333, QS8-335)

Dit is één vraag met vier gezichten, en het is grens 1 uit de beslisbevoegdheid:
een straf is wat de gebruiker als consequentie beloofd is.

| Gezicht | Vandaag | De vraag |
|---|---|---|
| Te laat afronden | De beloning wordt op tijdigheid getoetst, de straf niet — te laat afronden laat hem vervallen | Moet een straf op tijdigheid getoetst worden, net als de beloning? |
| Intrekken | Kan met één knop, zonder buddy en zonder bericht, zolang hij niet verschuldigd is | Mag intrekken vrij blijven, of hoort er een akkoord of een bericht bij? |
| Getuige verwijdert zijn account | De verschuldigde straf blijft stuurloos en onaanraakbaar achter | Vervalt de straf, of krijgt hij een nieuwe getuige? |
| Eigenaar verwijdert zijn account | Elke straf en zijn auditspoor worden gewist, zonder poort | Mag je jezelf uit een verschuldigde straf verwijderen? |

⚠️ **Er leek een gemeenschappelijk antwoord onder te zitten**: een straf is
vrijwillig tot hij verschuldigd is, en daarna niet meer. Dat stond hier als
hypothese, en het opstellen van de vier voorstellen op 08-09-2026 heeft hem voor
de helft weerlegd — daarom staat hij er nog, met de weerlegging erbij.

Voor de eerste twee gezichten klopt hij. Voor de laatste twee is het al waar
*en juist dáárom het probleem*: bij QS8-333 kan niemand de verschuldigde straf
nog aanraken — 📏 gemeten: de eigenaar mag er **0** rijen van bijwerken — en bij
QS8-335 wist de accountverwijdering hem alsnog, terwijl het systeembericht in de
groep blijft staan. Eén zin bevestigen lost die twee niet op; ze vragen elk een
eigen besluit met een eigen prijs. **Dat is de reden dat "per geval beslissen"
het juiste antwoord op vraag 1 was en niet de dure.**

### Vraag 2 — twee dashboardhandelingen (QS8-197, QS8-240)

Apple- en Google-provider aanzetten in het Supabase-dashboard, en twee oude
branches verwijderen (een cloudsessie krijgt daar 403 op). Allebei minuten werk
op Quintens machine; geen sessie kan ze overnemen.

### Vraag 3 — de v2-voorraad vrijgeven of parkeren (baan E)

QS8-71 en QS8-72 vragen een betaalde tier en een nieuw groepszichtbaar oppervlak,
QS8-250 vraagt een dependency, QS8-109 vraagt een illustrator, QS8-86 vraagt
juridisch advies. **Een "nee, later" is hier evenveel waard als een ja:** het
haalt vijf regels uit de Backlog die er nu bij elke telling in meelopen.

---

## 6. Wat dit plan niet oplost

- ~~**De instroom.**~~ ✅ **Gedraaid op 08-09-2026.** Zonder de tweede hefboom uit
  §1 kwamen er per gebouwd issue ongeveer 1,2 nieuwe bij. Die hefboom is nu een
  regel. ⚠️ **Hij maakt de instroom niet nul:** van de zestien issues die de
  meting telde zouden er met deze regel ongeveer negen niet ontstaan zijn — de
  zeven klassen blijven. Dat is de orde van grootte en geen belofte.
- **De epics.** QS8-200 staat op Urgent en is de enige Urgent in de hele Backlog.
  Hem opsplitsen is echt productwerk en hoort niet in een opruimplan.
- **Wat op productie achterloopt.** De drie Edge Functions en de laatste
  migraties staan in `docs/WERKVOORRAAD.md` en in de Todo-kolom van Linear
  (QS8-320, QS8-243, QS8-139, QS8-140); die kolom valt buiten dit plan omdat hij
  buiten de Backlog valt. **Hij is wél urgenter dan het meeste hierboven.**

---

## 7. Wanneer de backlog "af" is

Niet als hij leeg is — dat is hij bij deze instroom nooit. De afspraak die er wél
haalbaar is:

1. Elk issue in de Backlog is **vandaag bouwbaar** of het staat in een baan die
   zegt waarop het wacht.
2. Geen enkel issue in de Backlog wacht op een antwoord dat niemand gesteld heeft.
3. Geen twee issues in de Backlog beschrijven dezelfde klasse.
4. Er staat geen claim zonder werk, en geen issue met een open PR.

📏 Op 08-09-2026 haalt de Backlog **geen** van deze vier. Na dag 0 haalt hij er
drie, en na dag 3 alle vier.
