# De belofte is een commitment met een getuige — poort QS8-744

**Datum:** 20-11-2026 · **Issue:** QS8-744 (poort, onder epic QS8-721) · **Raakt:** domeinregel 5, 7 en 11,
Beslisbevoegdheid grens 1, `docs/decisions/002-domeinregel7-oppervlakken.md`
**Status:** **besloten door Quinten (19-11-2026) en niet gebouwd.** Dit document legt het besluit vast, geeft de
splitsing in bouwissues als *voorstel* en benoemt wat er nog bevestigd moet worden. De poort sluit pas met Quintens
akkoord (acceptatiecriterium 1 en 4 van het issue); dit document is de voorbereiding daarvan, geen sluiting.

## Wat dit is, en wat niet

Habit Huddle laat een gebruiker na het opslaan een **ondertekende belofte** doen voor 7, 14, 30 of 90+ dagen
(het onderzoeksdocument habit-huddle-app-ontleding, §7 en §9, en fase-1-acceptatiecriteria, §15 en §16, staan op de branch claude/habithuddle-app-ontleding en zijn bewust niet naar `main` gekopieerd). Quinten koos op 19-11-2026 voor
GoalBuddies een **belofte die aan een commitment hangt**, aangeboden **pas wanneer er een groep of een getuige is**.
Een belofte aan jezelf zonder gevolg is een apart, later besluit en valt hier buiten.

Dit document bouwt niets: geen code, geen migratie, geen scherm. Het is een poort in de vorm van
`docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md` (QS8-649): eerst het besluit en wat
er níet besloten is, dan de splitsing, dan pas bouwissues.

⚠️ **Geen geld, en dat is besloten.** Besluit QS8-86 (22-09-2026,
`docs/decisions/2026-09-22-vier-besluiten-en-twee-ervan-zijn-een-regel.md`, domeinregel 5): een straf legt de
gebruiker nooit een geldbedrag op. Geen betaalprovider, geen escrow, geen inzet in euro's, ook niet als de belofte
een "inzet" heet. Wat een gevolg wel mag zijn: trakteren, of iets anders dat de gebruiker zelf koos — en ook dat is
vrijblijvend. De app maakt een afspraak zichtbaar; hij dwingt niets af en houdt geen schuld bij.

## Wat gemeten is

📏 Gemeten op `main` (merge-commit van QS8-755), gelezen uit de migraties en de code, niet uit het geheugen:

- `commitments` bestaat sinds 0001 en draagt al wat een belofte nodig heeft: `body` (vrije tekst, grens in 0063/0123),
  `confirmed_at NOT NULL` (domeinregel 5 als schema-eigenschap), de statussen `set`, `unlocked`, `due`, `resolved`
  en `cancelled`, `beneficiary_group_id`, sinds 0168 een `beneficiary_user_id` (de getuige), en sinds 0280 een
  bevroren `tz`. Het auditspoor is `commitment_events`; de systeemberichten `commitment_unlocked` en `commitment_due`
  staan op de allowlist van `chat_messages_system_event_bekend`.
- ⚠️ **`commitments.goal_id` is `NOT NULL`**, en een straf wordt `due` via `maak_straffen_verschuldigd()` op basis
  van `goals.target_date` (nieuwste vorm 0294, met het wachtvenster van 24 uur en de uitstelverzoek-grendel). Er is
  dus **geen** begrip "de eigen week van een belofte" in het schema. Dat is het hart van dit besluit: hergebruik
  betekent *dezelfde tabel, dezelfde policies, hetzelfde spoor* — niet *geen nieuwe kolom*.
- Een straf op een doel is begrensd (`docs/decisions/2026-09-06-een-plafond-op-straffen.md`, 0170); intrekken
  is vrij en de getuige hoort de terugweg (`docs/decisions/2026-09-19-een-getuige-hoort-de-terugweg.md`).
- 📏 `app/onboarding/` bevat `profiel.tsx`, `uitleg.tsx` en `vragenlijst.tsx`; geen daarvan raakt `commitments`.
  Er is vandaag geen enkele route van de vragenlijst naar een commitment, en dat is een eigenschap die dit besluit
  wil bewaren (zie besluit 3).

## Wat niet gemeten is

⚠️ **Dat gebruikers een belofte zonder groep of getuige niet willen** is Quintens keuze en niet getoetst (zo staat
het ook als aanname in het issue). Idem dat het bestaande object daar zonder verbouwing voor volstaat: de meting
hierboven zegt dat het *bijna* zo is en noemt de uitzondering (de periode, besluit 2).
⚠️ **Hoe vaak een gebruiker na de onboarding een groep of getuige heeft** is niet gemeten; productie telt weinig
gebruikers. Het aanbod kan dus lang onzichtbaar blijven, en dat is bedoeld, maar het maakt de feature in de
praktijk klein.

## De besluiten

Bron: Quintens meerkeuzeantwoorden en zijn twee reacties op QS8-744 van 19-11-2026 (12:49 en 12:58; de nieuwste
tekst wint, en ze spreken elkaar niet tegen). Elke rij is letterlijk wat besloten is; de kolom *Hier uitgewerkt* is
mijn invulling en is aanname tot Quinten tekent.

| # | Vraag uit het issue | Besluit | Hier uitgewerkt |
|---|---|---|---|
| 1 | Wat is het gevolg? | **Vrije tekst**, hergebruik van `commitments.body`; vrijblijvend, door de gebruiker zelf gekozen (bijvoorbeeld trakteren); nooit geld | Geen lijst van keuzes, geen bedragveld, geen categorie "inzet". Wel een voorbeeldtekst als hulp. |
| 2 | Week-eenheid | De belofte heeft **haar eigen week**: de week met de eigen startdag (`currentUserCycle`), geen dagelijkse belofte | Een bevroren periode-einde, op de server afgeleid (zie §2) |
| 3 | Begunstigde of getuige | **De groep, of precies één getuige**; aangeboden pas als die er is; **geen commitment tijdens de onboarding**; leesrecht pas wanneer het commitment verschuldigd wordt (regel 11) | Zie §3 |
| 4 | Bevestiging en terugdraaien | Een **aparte, uitdrukkelijke bevestiging**, nooit een standaardkeuze, nooit stilzwijgend; **intrekbaar tot het verschuldigd wordt**, daarna blijft het staan | Zie §4 |
| 5 | Hetzelfde object? | Het bestaande **`commitments`**; geen tweede object | Zie §1 |
| 6 | Account verwijderen | De regel van QS8-335 geldt ook hier; **geen tweede uitzondering** | Zie §6 |

### 1. Eén object, en wat "hetzelfde" kost

De belofte is een **commitment van het type `penalty`** (een gevolg dat de gebruiker draagt als hij zijn woord niet
houdt), met `body` als het gevolg. Er komt geen tabel `beloftes`, geen tweede auditspoor en geen tweede stel
policies. Alles wat al klopt blijft gelden zonder dat iemand eraan denkt: `confirmed_at NOT NULL`,
`commitments_select` met leesrecht voor de begunstigde pas vanaf het verschuldigd worden, de getuigenroutes uit 0168,
het plafond van 0170, het wisrecht van 0247.

**De prijs van dit besluit** (het issue noemde dit "een tweede schuld" als je het niet doet; dit is de schuld als je
het wél doet): `commitments` is gebouwd rond een *doel met een streefdatum*. Een belofte met een eigen week past
daar niet vanzelf in. Er is dus **één nieuwe, nullable kolom nodig**: het bevroren einde van de belofteperiode
(§2). Dat is een wijziging in het datamodel van een bestaande tabel en dus een afweging die hier verantwoord wordt,
geen stille uitbreiding. Een tweede tabel was de alternatieve reparatie en is verworpen: die dupliceert RLS, spoor
en wisrecht, en dat is precies de kopie-van-een-kopie waar CLAUDE.md voor waarschuwt (*"elke definer-functie is een
kopie van de vorige"*).

⚠️ **De belofte is gekoppeld aan een doel**, want `goal_id` blijft `NOT NULL`. Dat is geen beperking maar de
koppeling die de gebruiker begrijpt: *"deze week houd ik mijn doel X vol; zo niet, dan trakteer ik"*. Een belofte zonder
doel bestaat niet; een gebruiker zonder actief doel krijgt hem niet aangeboden.

### 2. De week van de belofte, en de klok

De belofte duurt **één week van de gebruiker zelf**: van het moment van bevestigen tot het einde van de lopende
cyclus (`currentUserCycle(userId)`, domeinregel 1; de week-startdag is persoonlijk). Het einde is
`periode_start + 7` en wordt **bevroren op het moment van bevestigen**, naar het voorbeeld van `tz` in
0280 en de les van 0294: *een klok die de gestrafte zelf later kan verzetten, is geen klok.* ⚠️ **Correctie op de eerste versie van dit document:** SQL kent geen cyclusberekening (correctheidsregel 7), dus de client rekent de cyclusstart uit met `userCycle()` uit `src/shared/time/cycle.ts` en de database accepteert alleen die ene geldige waarde: de weekdag klopt met `week_start_day` en het is de lopende cyclus. Dat is het precedent van 0198 (`weekdoel_cyclus_klopt`). `periode_einde` levert de client nooit; een trigger zet hem. De trigger moet zwijgen als de invoerder niet de eigenaar is, anders lekt `week_start_day`.

⚠️ **Conservatieve invullingen, als aanname gemarkeerd (Quinten tekent ze af):**

- **Wanneer is een belofte gehouden?** Geen weekdoel van het gekoppelde doel in die cyclus staat op `missed`.
  Een gehaalde **vloer telt als gehouden** (domeinregel 8). Een adempauze, een weekpas of een weekdoel op
  `excused` of `carried` is **niet gebroken**. Waar de bepaling twijfelachtig is, is het antwoord *niet verschuldigd*:
  de fout die dit besluit niet mag maken is een straf die ten onrechte `due` wordt.
- **Geen uitstel.** Een belofte heeft geen streefdatum die een buddy kan opschuiven; het uitstelverzoek (A7) hangt
  aan een doel en niet aan een belofteweek. Eén week verschuiven is bovendien geen uitstel maar een andere belofte.
- **Eén weekbelofte per doel per week**, nooit tegelijk met een doelstraf op hetzelfde doel (de unieke index van 0170 laat per doel één open straf toe, en na één `due` kom je er niet meer uit: de index wordt versmald, zie x.1). Geen herhaling: elke
  week is een nieuwe, nieuw bevestigde belofte. In code heet het `weekbelofte`, want "belofte" is hier al de term voor de testbeloftes. Een automatisch verlengde belofte zou stilzwijgend aan gaan.
- **De weekafsluiting verandert niet** en de belofte heeft geen eigen punten: een gemiste week kost nog steeds
  `−1` en de belofte komt daar niet bij. Dat is de dubbele straf die domeinregel 10 en A43 al afwezen.

#### Waar domeinregel 11 hier tegen schuurt — een benoemde verruiming

Domeinregel 11 zegt: *"Een straf treedt alleen in werking bij een verstreken deadline. Een gemiste week kost een
minpunt, meer niet."* De tweede zin staat haaks op een belofte die aan het einde van haar eigen week `due` wordt als
je een weekdoel miste. Twee lezingen:

1. De belofte heeft een **eigen, door de gebruiker gekozen en bevestigde deadline** (het einde van haar week). Dat is
   een verstreken deadline in de zin van de eerste zin, en dus toegestaan.
2. Maar het *effect* hangt wel aan een gemist weekdoel. De tweede zin was bedoeld als rem op een straf die uit het
   niets aan een mislukte week hangt. Een door de gebruiker vooraf ingestelde en bevestigde straf is wat domeinregel
   7 al de énige uitzondering op *falen is nooit publiek* noemt.

**Voorstel (conservatief):** lees de regel zo dat een gemiste week **zelf** nog steeds alleen een minpunt kost, en dat
een **door de gebruiker vooraf bevestigde belofte** één benoemde verruiming is die aan zijn eigen deadline hangt.
De bouwissue van §Splitsing schrijft die verruiming in CLAUDE.md bij domeinregel 11 (zoals QS8-370 dat deed voor het
uitstelverzoek) — **dat doet dit document niet**, want deze sessie raakt alleen `docs/decisions/`. ⚠️ Is Quinten het
daar niet mee eens, dan valt het besluit niet om maar wordt het smaller: dan is de belofte alleen een afspraak zonder
`due`-pad en dus een belofte zonder gevolg, en dat is het besluit van de "later"-categorie.

### 3. Wie ziet het, en wanneer

- **Begunstigde:** een groep (`beneficiary_group_id`) of precies één getuige (`beneficiary_user_id`, 0168). Nooit
  beide, nooit geen. De bestaande CHECK en trigger dwingen dat af.
- **Aanbod:** alleen als de gebruiker een groep heeft of een getuige kan aanwijzen. **Tijdens de onboarding komt
  er nooit een commitment**, ook niet als de gebruiker net via een uitnodigingscode een groep heeft.
- **Leesrecht:** niet vóór `due`. Een belofte op `set` is voor de begunstigde onzichtbaar, óók de tekst en óók het
  bestaan. De verruiming van QS8-370 (rij 31 in 002) is een uitzondering op die onzichtbaarheid en blijft zoals
  ze is; ze raakt de belofte alleen als de gebruiker zélf om uitstel van het doel vraagt.
- ⚠️ **De naad met de vragenlijst (regel 18).** De reactie van 12:58 noemt "de belofte uit de vragenlijst" een
  nieuwe route naar een commitment. Het issue zelf en de latere reactie zeggen dat er in de onboarding geen
  commitment komt. **Ik lees dat zo: de vragenlijst maakt nooit een commitment en schrijft er geen voorbereidend
  rij-achtig ding voor weg; ze mag hoogstens, ná het opslaan en alleen als het aanbod waar is, naar de aparte
  bevestigstap wijzen.** Dat is een aanname (zie *Wat Quinten nog moet bevestigen*) en ze krijgt een eigen test op de
  naad: de vragenlijst voltooien laat `commitments` onaangeroerd.

### 4. Bevestigen en terugdraaien

- **Bevestigen** is een aparte stap waarin de gebruiker drie dingen leest en uitdrukkelijk bevestigt: **het
  gevolg** (de eigen tekst), **de periode** (van wanneer tot wanneer, in zijn eigen week) en **wie het ziet en
  wanneer** (alleen de begunstigde, alleen als het verschuldigd wordt). Nooit voorgeselecteerd, nooit gebundeld met
  een andere knop (zoals "plan opslaan"), nooit een toestemming die ergens anders al gegeven is. De bevestiging
  schrijft `confirmed_at` en een gebeurtenis in `commitment_events`.
- **Terugdraaien:** de gebruiker kan intrekken zolang de belofte op `set` staat. Dat zet hem op `cancelled`,
  de getuige hoort het (0293), er gaat geen straf naar iemand. Zodra hij verschuldigd is, blijft hij staan.
- **Wat de gebruiker te horen krijgt vóór bevestigen** moet in beide talen staan en zonder emoji (emoji-regel) en
  zonder woorden die iets afdwingen dat de app niet doet. ⚠️ De woorden "straf" en `due` zijn in de app-tekst nog
  steeds geen besloten kwestie (zie CLAUDE.md, domeinregel 5, laatste ⚠️); de bouwissue gebruikt de bestaande
  formuleringen en bedenkt geen nieuwe.

### 5. Wat de groep te zien krijgt, en de twee vragen van CLAUDE.md

Het nieuwe groepszichtbare oppervlak is: *een verschuldigde belofte, zichtbaar voor de begunstigde*. Er komt geen
nieuw systeemtype bij, want het bestaande `commitment_due` en `commitment_unlocked` volstaan en noemen de persoon en
de gebeurtenis, nooit de tekst.

**Kan hieruit iemands gemiste week worden afgeleid?** Ja, en dat is de enige toegestane uitzondering: een
verschuldigde belofte zegt per definitie dat de gebruiker zijn week niet haalde. Dat is geen lek maar het
**doel** van een commitment device, en het is precies de uitzondering die domeinregel 7 al noemt (*een straf die de
gebruiker zelf vooraf heeft ingesteld en bevestigd*). De grens is wat er **vóór** het verschuldigd worden te zien is:
niets. Een belofte op `set` of `cancelled` verraadt niets. ⚠️⚠️ **Een gehouden belofte eindigt op `cancelled` en nooit op `resolved`** (gemeten door de spec-ronde, 0168 r.369): `commitment_zichtbaar_voor_persoon()` en de groepslijst bevatten `resolved`, dus een gehouden belofte op `resolved` werd met haar tekst leesbaar voor de begunstigde. Ook de week (`periode_start`) is na `due` zichtbaar voor de begunstigde; dat is een bewuste keuze. ⚠️ Een tweede afleiding
moet dicht: de *aanwezigheid van de belofte zelf* (iemand heeft er een, en de week loopt) is in een
beschermde groep geen tegenslag maar wel privé; ze mag niet uit de begunstigde-lijsten te lezen zijn.

**Kan iemand dat met één API-verzoek uitlezen buiten de UI om?** Dat is de vraag waar de bouw op staat of valt, en
het antwoord moet de database geven en niet het scherm: `commitments_select` is al de plek, en de bouw toetst **met een
tweede JWT en een direct API-verzoek** dat (a) een groepslid een belofte op `set` niet leest, (b) de tekst van een
belofte pas leesbaar is na `due`, (c) het nieuwe periode-einde geen kolom is die een groepslid of getuige kan lezen
vóór `due` (RLS kan geen kolommen beperken: een kolomgrant of een view met expliciete kolomlijst, zoals 0280 deed voor `tz`).

#### Rij-voorstel voor `docs/decisions/002-domeinregel7-oppervlakken.md`

> Als **tekst** hier. Niet in 002 gezet: dat doet de bouwissue die het oppervlak maakt. Het volgende vrije
> nummer is bij schrijven **60** (rij 59 is de laatste op `main`); tel opnieuw op het moment van landen.

| # | Oppervlak | Waar | Wat de groep ziet | Afgedwongen door |
|---|---|---|---|---|
| 60 | **Een verschuldigde belofte** | `commitments` (type `penalty` met een belofteperiode), `commitment_events`, de bestaande systeemberichten `commitment_due` en `commitment_unlocked`, `beneficiary_group_id` en `beneficiary_user_id` | Aan de **begunstigde** (de groep of de ene getuige), en **pas als de belofte verschuldigd is**: dát de gebruiker zijn belofte niet hield en de eigen tekst van het gevolg. Vóór dat moment niets, ook niet dát er een belofte is. Aan elke andere groep of persoon: niets | ⚠️ Is **de enige toegestane uitzondering op *falen is nooit publiek*** (een straf die de gebruiker zelf vooraf instelde en bevestigde). RLS (`commitments_select`) bepaalt het, niet de UI. De periodekolom staat niet in de kolomgrant van een groepslid. Beschermd en open geven hetzelfde: geen verwijzing naar `groups.zichtbaarheid`. Een teamgroep als begunstigde is uit tot QS8-649 en QS8-750 hun eigen besluit hebben gemaakt. Een verwijderd account neemt zijn berichten en spoor mee (QS8-335) |

Voor de tweede tabel, **wat "open" hier betekent**: niets. Wat dit oppervlak opent hangt aan de handeling van de
gebruiker (hij bevestigt zelf) en niet aan `groups.zichtbaarheid`; een open groep krijgt niet méér dan een
beschermde. Stand: ✅ n.v.t. zodra de bouw landt.

### 6. Accountverwijdering

De regel van QS8-335 (migratie 0247, `docs/decisions/2026-09-08-wat-een-straf-overleeft.md` §4) geldt **ook hier**:
wie zijn account opzegt, neemt de systeemberichten over zijn eigen commitments mee (`commitment_due` en
`commitment_unlocked` waarvan hij het onderwerp is) en het commitment met zijn auditspoor (cascade). Verder niets.
**Geen tweede uitzondering.** Omdat de belofte hetzelfde object en dezelfde systeemtypen hergebruikt, geldt dit
**vanzelf** en kost het geen nieuwe code in `verwijder_mijn_account()`. Dat is de reden dat dit besluit hergebruik
verkiest, en het is meteen de plek waar het mis kan gaan: de bouwissue heeft er een test voor (§Splitsing).

Verleg deze grens niet als bijvangst. De twee benoemde uitzonderingen uit domeinregel 7 (QS8-335 en het gedeelde
prestatiebericht uit QS8-736) blijven zoals ze zijn.

## Wat expliciet níet besloten is

- **Een belofte zonder gevolg.** Een belofte aan jezelf, zonder groep of getuige, is een apart, later besluit
  (het issue zegt het zo). Dit document leidt daar niets uit af.
- **Een dagelijkse of meerweekse belofte** (Habit Huddle: 7 tot 90+ dagen). De eenheid is de week; een langere
  belofte is een reeks nieuwe weken, elk nieuw bevestigd.
- **Of de woorden "straf" en `due` mee moeten veranderen** (domeinregel 5, laatste ⚠️). Eigen besluit, grens 1.
- **De formulering van de bevestigtekst** (toon, lengte). Dat is een `critical-user`-ronde in de bouw, geen besluit.
- **Een teamgroep als begunstigde** van een belofte. Voor teamgroepen weegt domeinregel 7 zwaarder; zolang QS8-649
  en het profiel (QS8-750) hun eigen besluit niet genomen hebben, staat dat uit.
- **Herinneringen en meldingen voor de belofte.** Een pushmelding over een lopende belofte is een uitgaande stroom
  naar echte mensen (grens 1). Niet in deze bouw. ⚠️ Eerlijk erbij: de getuige krijgt bij `due` al automatisch de bestaande `commitment_witness`-push (0293). Dat is hergebruik van een bestaande stroom en geen nieuwe; het blijft daarbij.

## Herbevestigen vóór …

Elk besluit dat aan een toekomstige feature hangt, noemt de voorwaarde en niet een datum:

- **Herbevestigen vóór er een teamgroep (QS8-649) als begunstigde kan worden aangewezen.** Het schaamtemoment in een
  groep die niet vrijwillig gekozen is, weegt zwaarder (domeinregel 7, teamgroepen).
- **Herbevestigen vóór er een tweede belofte-eenheid komt** (meerdere weken, een herhaling). De conservatieve
  invulling "elke week opnieuw bevestigd" is het enige dat de stilzwijgende verlenging uitsluit.
- **Herbevestigen vóór er een pushmelding of herinnering over een belofte komt** (grens 1).
- **Herbevestigen vóór er een betaald niveau komt dat de belofte als kenmerk noemt.** Habit Huddle verkoopt de
  belofte mee in een aanbod voor betaald; geld-commitments zijn uitgesloten (QS8-86) en een betaalde laag eromheen
  is een kostenbesluit voor Quinten.
- **Herbevestigen als de definitie van "gehouden" (§2) verandert**, bijvoorbeeld als er een achteraf-venster
  naast de automatische weekpas komt (QS8-756): dan verschuift wat een gemiste week is, en dus wanneer een belofte
  `due` wordt.

## Wat Quinten nog moet bevestigen

Gescheiden van de conservatieve invullingen, want dit zijn de punten die onder grens 1 vallen:

1. **De verruiming van domeinregel 11** (§2): akkoord dat een door de gebruiker vooraf bevestigde belofte aan zijn eigen
   deadline een benoemde verruiming is op *"een gemiste week kost een minpunt, meer niet"*. Zonder dat akkoord valt de
   belofte terug op de "zonder gevolg"-variant.
2. **De definitie van gehouden** (§2): geen weekdoel op `missed`, vloer telt, adempauze en weekpas niet gebroken. ⚠️ **De spec-ronde vond dat dit meer uitwegen openlaat dan genoemd:** een adempauze met terugwerkende kracht, een weekdoel doorschuiven (`carried`) of zelf afsluiten, een weekdoel verwijderen, of die week geen weekdoel hebben, tellen allemaal als gehouden. Een belofte die je zo kunt ontwijken is in feite geen belofte; elke uitweg dichtzetten maakt de straf strenger dan de gebruiker gewend is. Conservatief gekozen: ze blijven open. Dat is een keuze voor Quinten.
3. **De lezing van de vragenlijst-reactie** (§3): de vragenlijst maakt nooit een commitment en wijst hoogstens naar de
   aparte bevestigstap.
4. **Eén weekbelofte per doel per week, elke week opnieuw bevestigd, en niet naast een doelstraf op hetzelfde doel** (§2).
5. **Welke week:** de lopende cyclus vanaf het moment van bevestigen (ook op de laatste dag), niet de volgende volle cyclus. Aangenomen: de lopende.
6. **Een groep van onbekenden** (`groups.automatisch`, QS8-230) als begunstigde. Aangenomen: niet toegestaan zodra dat afdwingbaar is; vandaag is er alleen `groups.automatisch` om op te toetsen en dat valt in x.3.

Conservatief ingevuld en dus niet meer gevraagd: geen uitstel, geen herhaling, geen punten voor de belofte,
`commitment_due` hergebruikt, de begunstigde pas na `due`, de nullable periodekolom in plaats van een tweede tabel.

## Splitsing in bouwissues (spec-planner-ronde) — voorstel

De spec-planner-ronde (20-11-2026) las migraties en code en draaide niets tegen een database. De nummering x.1 tot
x.5 is een plaatshouder voor de epicnummering; het hoogste migratienummer op `main` is **0310** en elke migratie
krijgt haar nummer via `npm run migratie:nieuw`. De volgorde is zo gekozen dat **een client pas in x.3 een belofte
kan aanmaken**: tot dan bestaan er geen belofterijen, op testrijen na. Elk issue krijgt een eigen tak en PR; geen
bundeling.

### Wat de ronde vond dat het eerste concept van dit document niet wist

📏 Gecontroleerd tegen de bestanden (de vier kernpunten ook door mij nagelezen):

1. **Een gehouden belofte moet op `cancelled` eindigen, nooit op `resolved`** (0168 r.369): beide zichtbaarheidslijsten bevatten `resolved`.
2. **`commitments_een_open_per_soort` (0170 r.124) is uniek op `(goal_id, type)` bij `set`, `unlocked`, `due`, en uit `due` kom je niet meer.** Na één gebroken belofte kan er op dat doel nooit meer een belofte of doelstraf bij. De index wordt versmald (x.1).
3. **Vijf bestaande paden pakken elke `type = 'penalty'`** en zouden de belofte meenemen: `maak_straffen_verschuldigd()` (op `goals.target_date`), `beslis_deadline_verzoek()`, `straffen_bij_uitstelverzoek()` (zou de gevraagde groep laten weten *dát* er een belofte is), `doeldatum()` en de grendel van `zet_streefdatum()`, plus de client-spiegel `wordtZichtbaarBijUitstelverzoek()` in `src/modules/commitments/stand.ts`. Ook `wikkel_commitments_af()` annuleert bij op-tijd afronden elke straf op `set`; of dat als "gehouden" telt, moet uitdrukkelijk besloten en getest worden.
4. **De rollovervolgorde:** `wikkelStraffenAf()` draait vóór `sluitVerstrekenWekenAf()` (`supabase/functions/rollover/index.ts`, r.549 en r.551). In de run waarin de week sluit staan de weekdoelen nog op `todo`; "geen `missed`" zou dan te vroeg beslissen. De belofte beslist dus pas als er geen weekdoel van die week meer op `todo` staat.
5. De `currentUserCycle(userId)` uit de opdracht heet in de code `userCycle(clock, at)`; zie de correctie in §2.
6. De getuige krijgt bij `due` al een push (zie §Wat expliciet níet besloten is).
7. Een teamgroep **kan nog niet worden uitgesloten**: er is geen `team_id` of organisatiekolom in de migraties. De grendel komt met QS8-649; tot dan staat het als *niet toetsbaar*, niet als *uit*.

### x.1 — Een weekbelofte in het datamodel; de strafpaden slaan haar over

- **Doel:** de kolommen en indexen, en de bestaande paden ongevoelig maken vóórdat er ooit een belofterij bestaat.
- **Wijzigt:** `commitments` krijgt nullable `periode_start` en `periode_einde` (allebei of geen van beide; `periode_einde = periode_start + 7`; alleen bij `type = 'penalty'`). **Geen INSERT-grant** op beide. SELECT-kolomgrant wel (de eigenaar leest ze; de begunstigde pas vanaf `due` via RLS). `commitments_een_open_per_soort` versmallen tot `where periode_start is null`; nieuw: uniek op `(goal_id)` voor een belofte op `set`, en op `(goal_id, periode_start)` voor niet-geannuleerde. De vijf functies hierboven krijgen `periode_start is null`, de client-spiegel idem. Raakt `src/lib/database.types.ts` (hergenereren) en `src/modules/commitments/api.ts`.
- **Migratie:** ja. **Blokkeert:** x.2, x.3. **`security-reviewer` direct:** ja. **Review:** zwaar, zwaarste model.
- **Acceptatiecriteria (naad vet):**
  1. **Een belofte op `set` op een doel met een streefdatum van 30 dagen geleden blijft `set` na `maak_straffen_verschuldigd()`** (doelpad ↔ belofte).
  2. Een verschuldigde belofte blijft `due` na een goedgekeurd uitstelverzoek op hetzelfde doel.
  3. **`straffen_bij_uitstelverzoek()` geeft 0 rijen voor een belofte én `wordtZichtbaarBijUitstelverzoek()` geeft `false` op dezelfde invoer** (server ↔ client-spiegel).
  4. Een gewone JWT kan geen `periode_start` of `periode_einde` inserten (42501).
  5. Service_role: een `periode_einde` dat niet `periode_start + 7` is, of een `reward` met periode, wordt door de CHECK geweigerd.
  6. `doeldatum()` verandert niet door een belofte met een afwijkende `tz`.
  7. De bestaande straftests (0170, 0177, 0218, 0288, 0294) blijven groen zonder wijziging.
- **Raakt controles:** `registerdrift` (kopieer het lichaam van `main`), `kolomrechten`, `functiegrants`, `typesdrift`, `migraties`, `idempotent` (indexwissel met `drop … if exists` in de goede volgorde), `handtekening`.
- **Mis te gaan / ongemeten:** git ziet geen conflict als een parallelle tak een van de vijf functies herdefinieert; de uitsluiting valt dan stil weg. Ongemeten: of de partiële indexen op productie (stand 0282) zonder botsing landen.

### x.2 — Een weekbelofte wordt verschuldigd of gehouden aan het einde van haar week

- **Doel:** de beslissing over een lopende belofte, en de benoemde verruiming van domeinregel 11 in `CLAUDE.md` (alleen na Quintens akkoord).
- **Wijzigt:** een tweede tak in `maak_straffen_verschuldigd(uuid)` met **dezelfde handtekening**, zodat de rollover niet opnieuw gedeployd hoeft te worden. Beslist als de dag in de bevroren `tz` ≥ `periode_einde`, de belofte ouder is dan 24 uur, en er geen weekdoel van het doel in die cyclus meer op `todo` staat. Minstens één `missed` geeft `due`; anders `cancelled` met `actor_id null` (= gehouden, geen systeembericht, geen push). `pending` telt niet als gemist. `zet_week_startdag()` weigert (`weekbelofte_loopt`) zolang er een belofte op `set` staat, naar het voorbeeld van 0184: de wijziging verschuift de lopende week en dus de deadline.
- **Migratie:** ja. **Hangt af van:** x.1. **`security-reviewer` direct:** ja. **Review:** zwaar, zwaarste model.
- **Acceptatiecriteria:**
  1. Met `week_start_day` 1 en 0 en `tz` Europe/Amsterdam over de DST-wissel van 25-10-2026 en Pacific/Auckland wordt de belofte `due` bij de eerste aanroep waarin de dag in de eigen `tz` ≥ `periode_einde` is, en niet eerder.
  2. **Een belofte aangegaan in Kiritimati en daarna het profiel naar Honolulu: het moment van `due` verandert niet** (naad met 0294).
  3. Een week op `excused` (adempauze, weekpas) geeft `cancelled`, `actor_id null`, geen systeembericht en geen `commitment_witness`-push.
  4. Een gehaalde vloer telt als gehouden.
  5. **Sluit de week in dezelfde rollover-run waarin de belofte beslist, dan blijft ze `set` tot de volgende run** (rollover ↔ SQL).
  6. Bij `due` staat er precies één `commitment_due` in de begunstigde groep, niets in andere groepen, en **geen extra rij in `points_ledger`** (geen dubbele straf, A43).
  7. `zet_week_startdag()` weigert zolang de belofte op `set` staat en lukt weer na `cancelled`.
  8. **Een eigenaar met een verschuldigde belofte verwijdert zijn account: bericht, commitment en spoor zijn weg en er blijft niets over hem in de groep** (naad met 0247 en 0309; dit is besluit 6).
- **Raakt controles:** `registerdrift` (`maak_straffen_verschuldigd`, `zet_week_startdag`), `klokgrens`, `tijdzones`, `datums`, `keten`, `functiegrants`, `eenrij`.
- **Mis te gaan / ongemeten:** of `pending` ooit op `missed` komt (zo niet, dan blijft een belofte eeuwig `set` en blokkeert ze de volgende); dat een weekpas de status echt op `excused` zet is uit een comment gelezen (0159), niet gemeten; een rollover die een dag niet draait geeft het bericht op een andere dag.

### x.3 — Een weekbelofte aangaan: de insertgrendel, het plafond en de begunstigde

- **Doel:** het enige pad om een belofte aan te maken, dicht in de database.
- **Wijzigt:** `grant insert (periode_start)` (niet `periode_einde`); een trigger `bevries_belofteperiode()` (BEFORE INSERT, definer) die **zwijgt als de invoerder niet de eigenaar is**, eist dat de weekdag klopt met `week_start_day` en dat `periode_start` de lopende cyclus is, en `periode_einde` zet. `commitments_insert` eist een begunstigde, geen doelstraf op `set` of `due` op hetzelfde doel (en omgekeerd), geen groep met `groups.automatisch` als begunstigde (onbekenden), en hoogstens N beloftes op `set` per eigenaar (regel 5, de spamvector van 0170; N = 3 is aangenomen). Voegt rij 60 toe aan `docs/decisions/002-domeinregel7-oppervlakken.md` (de tekst staat in §5 hierboven).
- **Migratie:** ja. **Hangt af van:** x.2 (anders bestaan er aan te maken beloftes zonder beslispad). **`security-reviewer` direct:** ja. **Review:** zwaar, zwaarste model.
- **Acceptatiecriteria:**
  1. Een cyclusstart van de vorige of volgende week, of een verkeerde weekdag, wordt geweigerd; getoetst met `week_start_day` 1 en 0 en met Auckland zondag 23:30 lokaal (in UTC nog zaterdag).
  2. Een gewone JWT kan `periode_einde` niet inserten (42501).
  3. **B met het `goal_id` van A krijgt de 42501 van de policy en nooit de `check_violation` van de trigger** (anders lekt `week_start_day`).
  4. **Een tweede JWT (groepslid en getuige) krijgt via een direct REST-verzoek, ook met `select=periode_start`, 0 rijen bij `set` en 1 na `due`; een lid van een andere groep altijd 0.**
  5. Zonder groep en zonder getuige weigert de database.
  6. De N+1-ste belofte op `set` wordt geweigerd.
  7. Een belofte naast een doelstraf op hetzelfde doel wordt geweigerd, en andersom.
- **Raakt controles:** `rls:dekking`, `functiegrants`, `kolomrechten`, `definers`, `keten`, `review:controle` (een Laag-rij vraagt een "Wordt zwaarder als"). ER-rij gaat als regel in het PR-verslag.
- **Mis te gaan / ongemeten:** de trigger rekent "de lopende cyclus" met de profiel-`tz` van nu terwijl `bevries_commitmentzone()` dezelfde waarde bevriest; in een andere volgorde meten ze aan twee klokken, dus de volgorde krijgt een test. N is aangenomen.

### x.4 — Het beloftescherm: aanbieden, apart bevestigen, intrekken

- **Doel:** de ingang vanaf het doelscherm, de bevestigstap en de stand.
- **Wijzigt:** een dun routebestand onder `app/doel/` plus een schermmap onder `src/schermen/` (nieuw), `src/modules/commitments` (`gaWeekbelofteAan()` haalt `periode_start` uit `userCycle()`), `src/shared/i18n/nl.ts` en `en.ts`, en alleen één knop in `app/doel/[id].tsx`.
- **Migratie:** nee. **Hangt af van:** x.3. **`security-reviewer`:** ja (commitments en bevestiging). **Review:** zwaar voor de bevestigtekst, licht voor de rest; licht model; `critical-user` bij de milestone.
- **Acceptatiecriteria:**
  1. Zonder groep en getuige is er geen knop en toont de route een lege staat zonder verzendknop.
  2. De bevestigstap toont gevolg, periode en wie het ziet en wanneer; niets is voorgeselecteerd; zonder bevestiging gebeurt er geen API-aanroep.
  3. **De vragenlijst voltooien doet geen enkele `from('commitments')`, en geen bestand onder `app/onboarding/` importeert `gaWeekbelofteAan` of `zetStraf`** (naad vragenlijst ↔ commitment).
  4. **`userCycle()` voor `week_start_day` 1 en 0 levert een waarde die de trigger van x.3 accepteert** (naad TypeScript ↔ SQL).
  5. Intrekken op `set` geeft `cancelled`; op `due` volgt de melding `al_afgegaan`.
  6. Laden, fout en leeg bestaan alle drie (regel 16).
  7. `emoji`, `catalogus` (nl en en gelijk), `schermingang` en `exports` zijn groen en het aantal functies boven de 50 in `app/doel/[id].tsx` stijgt niet (`regel15`).
- **Mis te gaan / ongemeten:** of `fetchMogelijkeBegunstigden()` (100 kandidaten) volstaat voor "is er een getuige"; een groep zonder andere leden geeft een lege lijst maar telt wel als groep.

### x.5 — De vragenlijst wijst na afloop naar de belofte (optioneel)

- **Doel:** na het opslaan één verwijzing, alleen als er al een groep of getuige is. **Hangt af van:** QS8-733, x.4 en Quintens akkoord op punt 3 hieronder. **`security-reviewer`:** nee (schrijft niets). Licht model.
- **Acceptatiecriteria:** zonder groep geen verwijzing; tikken opent de route van x.4; **de hele vragenlijst schrijft 0 rijen in `commitments`** (naad).
- **Mis te gaan:** QS8-733 herontwerpt de vragenlijst; verhuist het opslagpad, dan groeit de naadtest niet vanzelf mee.

### Buiten deze splitsing

Een belofte zonder gevolg, een belofte van meerdere weken of een herhaling, herinneringen, een teamgroep als begunstigde, een nieuwe status of een nieuw systeemtype, en een wijziging aan de Edge Function `rollover`.

### Aanvullingen voor 002, voor de bouwissue

Rij 31 krijgt een zin: een belofte valt buiten `straffen_bij_uitstelverzoek()` en buiten de client-spiegel; anders weet de gevraagde groep dat er een belofte loopt. Rij 60 zegt bovendien: een gehouden belofte eindigt op `cancelled`; na `due` ziet de begunstigde ook de week; de getuige krijgt de bestaande push; de trigger zwijgt voor niet-eigenaren; een teamgroep is *niet toetsbaar tot QS8-649*; beschermd en open geven hetzelfde; en het verschuldigd worden is zelf geen handeling van de gebruiker, anders dan het delen in rij 53.

### Aannames in deze splitsing

N = 3 beloftes op `set` per eigenaar; de rollover draait minstens één keer per dag; een weekpas zet de week op `excused` (gelezen, niet gemeten); de nummering x.1 tot x.5 is plaatshouder.

## ER-rij

`ER-rij:` zie het PR-verslag; dit document raakt `docs/ENGINEER-REVIEW.md` niet.
