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
cyclus (`currentUserCycle(userId)`, domeinregel 1; de week-startdag is persoonlijk). Het einde wordt op de server
afgeleid uit `shared/time`-logica en **bevroren op het moment van bevestigen**, naar het voorbeeld van `tz` in
0280 en de les van 0294: *een klok die de gestrafte zelf later kan verzetten, is geen klok.* De client levert nooit
een datum.

⚠️ **Conservatieve invullingen, als aanname gemarkeerd (Quinten tekent ze af):**

- **Wanneer is een belofte gehouden?** Geen weekdoel van het gekoppelde doel in die cyclus staat op `missed`.
  Een gehaalde **vloer telt als gehouden** (domeinregel 8). Een adempauze, een weekpas of een weekdoel op
  `excused` of `carried` is **niet gebroken**. Waar de bepaling twijfelachtig is, is het antwoord *niet verschuldigd*:
  de fout die dit besluit niet mag maken is een straf die ten onrechte `due` wordt.
- **Geen uitstel.** Een belofte heeft geen streefdatum die een buddy kan opschuiven; het uitstelverzoek (A7) hangt
  aan een doel en niet aan een belofteweek. Eén week verschuiven is bovendien geen uitstel maar een andere belofte.
- **Eén belofte per doel per week**, en het plafond van 0170 blijft voor het doel gelden. Geen herhaling: elke
  week is een nieuwe, nieuw bevestigde belofte. Een automatisch verlengde belofte zou stilzwijgend aan gaan.
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
niets. Een belofte op `set`, `cancelled` of `resolved`-zonder-straf verraadt niets. ⚠️ Eén tweede afleiding
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
  naar echte mensen (grens 1). Niet in deze bouw.

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
2. **De definitie van gehouden** (§2): geen weekdoel op `missed`, vloer telt, adempauze en weekpas niet gebroken.
3. **De lezing van de vragenlijst-reactie** (§3): de vragenlijst maakt nooit een commitment en wijst hoogstens naar de
   aparte bevestigstap.
4. **Eén belofte per doel per week, elke week opnieuw bevestigd** (§2).

Conservatief ingevuld en dus niet meer gevraagd: geen uitstel, geen herhaling, geen punten voor de belofte,
`commitment_due` hergebruikt, de begunstigde pas na `due`, de nullable periodekolom in plaats van een tweede tabel.

## Splitsing in bouwissues (spec-planner-ronde) — voorstel

SPLITSING_PLAATSHOUDER

## ER-rij

`ER-rij:` zie het PR-verslag; dit document raakt `docs/ENGINEER-REVIEW.md` niet.
