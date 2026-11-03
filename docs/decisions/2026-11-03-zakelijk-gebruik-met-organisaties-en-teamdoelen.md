# Zakelijk gebruik met organisaties en teamdoelen

**Datum:** 03-11-2026 · **Issue:** QS8-649 (poort-issue; de vervolgissues volgen daarna) ·
**Raakt:** `PRD-accountability-app.md` §2.4, domeinregel 3, 4, 7 en 10
**Status:** **besloten door Quinten en niet gebouwd.** De spec staat als *voorstel*
in `docs/decisions/2026-11-03-spec-organisaties-en-teamdoelen.md`; daarin wacht een
reeks keuzes nog op Quinten. Dit document legt vast wat er beslist is en wat niet.

## Wat dit is, en wat niet

Quinten wilde GoalBuddies toespitsen op een niche die de gangbare lijsten met
goal-apps niet behandelen: het starten en bereiken van zakelijke doelen. De
besluiten hieronder zijn in dezelfde sessie als aanklikbare keuzes genomen, elk
met een advies van Claude ernaast. Waar Quinten **van dat advies afweek** staat
dat erbij, met wat het kost — een afwijking die je verzwijgt valt niet op, en een
afwijking die je alleen onderbouwt leest de volgende als een reden om er niet aan
te twijfelen.

## Wat gemeten is

- 📏 `PRD-accountability-app.md` §1.6 noemt **de Founder/Freelancer als primaire
  persona**. De niche is dus geen nieuwe richting maar een bestaande die smaller of
  breder wordt gemaakt.
- 📏 PRD §2.4 zet gedeelde teamdoelen **buiten scope**, met de toevoeging
  *"unless revisited"*. Dit besluit is die herziening. **De PRD is op 03-11-2026
bijgewerkt:** teamdoelen staan niet meer in §2.4 en er is een nieuwe §2.5. De fasering
staat daar bewust niet in.
- 📏 Er is al een doelcategorie `business` in `src/shared/categorieen/index.ts`.
- ⚠️ **Een organisatie- of teamlaag in het schema is niet gevonden, maar niet
  volledig nagelopen.** Een grep op `organization`, `organisatie`, `team_goal` en
  `teamdoel` gaf alleen treffers in een handvol migraties over categorieën en
  vindbaarheid; die zijn niet regel voor regel gelezen. De spec toetst dit.

## Wat niet gemeten is

⚠️ **Drie van de vier bronnen kon de sessie niet lezen** (`ENOTFOUND`: buiten de
toegestane domeinen): goalgeniee.com, habi.app en goalsandprogress.com, en later
ook habithuddle.com. Wat hieronder over de markt staat komt uit zoeksamenvattingen
en is **richtinggevend, geen bewijs**:

- Er bestaan al founder-accountabilityproducten: 95, Cohorty, UNUM, Accountable
  HQ, Boss as a Service, Focusmate en, voor OKR's, Tability. De bron is vooral
  blogs van de vendors zelf; prijzen zijn niet geverifieerd. **De niche is dus
  niet onbediend.** De lijst van goalsandprogress.com heet *Personal Goal
  Tracking* — dat hij geen zakelijke doelen behandelt zegt iets over de lijst en
  niet over de markt.
- De positioneringsadviezen (Moore: beachhead, Dunford: niche-first) komen uit
  secundaire samenvattingen, niet uit de bron.
- Retentiecijfers (RevenueCat, Day-30) komen uit zoeksamenvattingen en blogs.

## De besluiten

| # | Besluit (Quinten, 03-11-2026) | Advies van Claude | Afgeweken? |
|---|---|---|---|
| 1 | Doelgroep: solo-founders en zzp'ers, kleine teams én werknemers | solo-founders eerst | **ja, zie 2** |
| 2 | Volgorde: **alles tegelijk** | gefaseerd, solo-founders als eerste niche | **ja** |
| 3 | Teamdoelen bestaan: eigen individuele doelen **en** een gezamenlijk doel met een eigen aandeel per persoon | n.v.t. | — |
| 4 | Datamodel: een **nieuwe entiteit 'organisatie'** boven de buddygroepen | een buddygroep met een teamdoel erbij | **ja** |
| 5 | Goedkeuring van een aandeel: een **teamgenoot, nooit jezelf** | idem | nee |
| 6 | Een leidinggevende of beheerder ziet van de voortgang **hetzelfde als elk lid** | idem | nee |
| 7 | De teamvoortgang telt **alleen wat gehaald is**; een gemist aandeel is alleen voor de eigenaar zichtbaar | idem | nee |
| 8 | Eerst beslisdocument en spec, **nog niet bouwen** | idem | nee |
| 9 | Een team is een **bestaande groep met een organisatie-kolom**, geen aparte teamtabel | idem | nee |
| 10 | Een aandeel is een **gewoon persoonlijk doel** dat aan het teamdoel hangt, geen getal of percentage | idem | nee |
| 11 | Collega's zien **alleen de teambalk en hun eigen aandeel**, niet hoe ver een ander met zijn aandeel is | idem | nee |
| 12 | Een commitment mag in een werkcontext een **teamgroep als begunstigde of getuige** hebben, onder dezelfde regels als nu (nooit geld, vrijblijvend, expliciet bevestigd, auditeerbaar) | geen teamgroep als begunstigde tot er een apart besluit is | **ja** |
| 13 | De beheerder mag **leden uitnodigen, leden uit de organisatie zetten, teams aanmaken en de organisatie archiveren**. Facturering valt buiten dit voorstel | idem | nee |
| 14 | Bij vertrek of accountverwijdering **blijven de doelen van de gebruiker**; alleen de koppeling vervalt en de teamteller blijft staan | idem | nee |
| 15 | Eén persoon **kan in meerdere organisaties** zitten | idem | nee |
| 16 | De teambalk is een **teller van behaalde mijlpalen, zonder noemer** | idem | nee |
| 17 | Een teamdoel volgt de **huddledag van de teamgroep**; er komt geen derde klok. Een aandeel blijft op de persoonlijke cyclus van zijn eigenaar | idem | nee |
| 18 | Een teamgroep **mag open zijn**; de organisatie kiest bij het aanmaken tussen beschermd en open | altijd beschermd, afgedwongen met een CHECK | **ja** |
| 19 | Een organisatie kent **alleen beheerder en lid**, geen rol leidinggevende | idem | nee |
| 20 | **Elk teamlid** mag een teamdoel aanmaken. Een aandeel neemt de datum over en verschuift via A7 met akkoord van een teamgenoot | idem | nee |
| 21 | **Aandeeldoelen blijven in elke teamgroep beschermd**, ook in een open teamgroep: een gemist aandeel en de voortgang per persoon blijven voor collega's onzichtbaar | idem | nee |
| 22 | **Nooit een klassement in een teamgroep**, ook niet in een open | idem | nee |
| 23 | Een teamgroep krijgt een **hoger plafond dan twaalf leden**. Het getal is niet besloten | het plafond van twaalf houden | **ja** |

### Wat de afwijkingen kosten

⚠️ **Besluit 2 (alles tegelijk).** Het advies leunde op niche-first positionering.
De doelgroep wordt hier breder, niet smaller, en tegelijk raakt het werk het
datamodel, RLS, het puntenmodel en de privacyregels. Reken op meer reviewwerk dan
bij een gefaseerde start: regel 19 vraagt `security-reviewer` **direct** voor alles
wat RLS, goedkeuring of een nieuw groepszichtbaar oppervlak raakt, en dat is hier
vrijwel elk issue. "Alles tegelijk" betekent niet één branch: de regel *één branch
per Linear-issue* blijft gelden.

⚠️ **Besluit 4 (organisatie boven groepen).** Het alternatief hergebruikte
groepen, lidmaatschappen, RLS en peer-goedkeuring zonder nieuw niveau. Een
organisatie voegt een entiteit toe, waarschijnlijk een beheerdersrol, en
AVG-verhoudingen tussen organisatie, werknemer en de app. Wat dat in tabellen
betekent hoort in de spec; hier staat alleen dat het een bewuste keuze voor meer
is.

⚠️ **Besluit 12 (commitments met een teamgroep).** Het advies was de teamgroep als
begunstigde of getuige uit te sluiten tot er een apart besluit lag, omdat een
vrijblijvende afspraak tegenover een collega of werkgever een ander gewicht heeft
dan tegenover een vriend. Quinten liet het toe. De regels van domeinregel 5 en 11
blijven gelden: nooit geld, vrijblijvend, expliciet bevestigd, auditeerbaar, en de
begunstigde groep krijgt pas leesrecht op het moment dat de straf verschuldigd
wordt. **Wat de afwijking kost:** het moment waarop een commitment `due` wordt is
dat van een verstreken streefdatum, en bij een teamgroep is de lezer een collega.
Dat past binnen de uitzondering van domeinregel 7 (een straf die de gebruiker zelf
vooraf instelde en bevestigde), maar het is precies het schaamtemoment waar de
regel voor bestaat, in een groep waar je niet vrijwillig bij hoort. Wat die
collega te zien krijgt, en wanneer, is **niet uitgewerkt**; de spec krijgt hier een
eigen issue voor met `security-reviewer` direct, en de spec-standaard "geen
teamgroep als begunstigde" vervalt.

⚠️ **Besluit 18 (open teamgroep).** Het advies was een teamgroep altijd beschermd te
houden en dat met een CHECK af te dwingen: domeinregel 7 weegt bij zakelijk gebruik
zwaarder, en in een team heb je niet iedereen zelf gekozen. CLAUDE.md zegt bij
QS8-230 dat een groep met onbekenden beschermd hoort te zijn en dat dat een
eigenschap van `groups` is en geen schermkeuze. (Die regel gaat over onbekenden; een
team is dat niet per se, maar de redenering is dezelfde.) Quinten liet de
organisatie kiezen. **Wat het kost:** in een open teamgroep zien leden elkaars
tegenslag (A41), en wie die keuze maakt is niet de betrokken collega maar de
organisatie. Besluit 21 en 22 vangen de twee zwaarste gevolgen op, het werkaandeel
en het klassement, maar elk ander doel dat een lid aan een open teamgroep koppelt is
wel open. De CHECK 'altijd beschermd' uit het spec-voorstel vervalt, en de garantie
dat `groep_klassement()` in een teamgroep nul rijen geeft komt niet meer gratis uit
die CHECK: ze moet expliciet gebouwd en getoetst worden.

⚠️ **Besluit 23 (hoger plafond).** Het advies was het bestaande plafond van twaalf
te houden, zodat er geen nieuwe schaalvraag opent. Die is nu open: een groter team
raakt de chat, het groepsoverzicht (N+1-risico, regel 12) en realtime. Er is **geen
getal besloten**; dat komt pas na meting.

## Eerder besloten, en wat dit daarmee doet

Dit stond niet in het eerste voorstel. Het kwam boven bij het aanmaken van het
Linear-issue, door de issues en reacties te lezen die er al lagen.

- **A44 (QS8-128, 24-08-2026): "de PRD blijft leidend, er komt géén koerswijziging
  naar zakelijke doelen."** Dat was een lezing van een opdracht (*"Maak deze zoals
  omschreven in de PDR"*) en geen uitdrukkelijk besluit, en het zegt zelf: *"Lees je
  het anders, zeg het — dan is de eerste stap een herziening van het PRD en niet een
  issue."* Dit besluit is die andere lezing, en de PRD is herzien. ⚠️ **Wat A44
  verder noemde is niet besloten:** het raakt de Doelcoach-prompt, de voorbeelden en de
  copy door de hele app heen, en het noemt dit *een koerswijziging en geen feature*.
  Dit document legt alleen organisaties en teamdoelen vast. Of de rest van de app
  (prompt, voorbeelden, copy, positionering) mee verschuift is een eigen besluit.
- **A57 (QS8-272, 03-09-2026): een klassement in elke groep, ook een beschermde.**
  📏 Het besluit staat op Done, maar **de bouw is er niet**: migratie 0141 is de enige
  definitie van `groep_klassement()` en de poort staat daar nog op
  `lid_van_open_groep()` (r.267), dus vandaag geeft een beschermde groep nul rijen. De
  beschrijving van het issue zegt zelf *"De bouw staat nog open."* Zodra A57 landt,
  botst het met besluit 22 (nooit een klassement in een teamgroep): dan geeft ook een
  **beschermde** teamgroep een klassement, tenzij teamgroepen er expliciet uit worden
  gehouden. Hoe die twee samengaan is niet besloten.

## Wat het raakt

- **Domeinregel 3** (goedkeuring door een groepslid, nooit jezelf): besluit 5 houdt
  hem vast voor een aandeel. Afgedwongen in RLS én met een constraint, niet alleen
  in de UI.
- **Domeinregel 4** (onafhankelijke doelen): een teamdoel is het eerste doel dat
  meer dan één eigenaar heeft. Dat tilt een aanname van *er is er precies één* naar
  *er kunnen er meer zijn* — regel 18, vraag 6, en dus eerst grepen op `[0]`,
  `.find(`, `.single()` en `.maybeSingle()` vóór er iets gebouwd wordt.
- **Domeinregel 7** (falen is nooit publiek): besluit 6 en 7 zijn de vertaling
  ervan. CLAUDE.md zegt zelf dat de regel bij zakelijk gebruik **zwaarder** weegt:
  zit er een leidinggevende in de groep, dan beschermt hij niet tegen schaamte
  maar tegen een beoordelingsgesprek. Elk nieuw oppervlak krijgt de twee vragen:
  kan hieruit iemands gemiste week worden afgeleid, en kan dat met één API-verzoek
  buiten de UI om? De regel is pas afgedwongen als de database hem afdwingt.
- **Domeinregel 10** (puntenmodel): besluit 7 sluit aan op *voortgang loopt alleen
  omhoog*. Een aandeel is een gewoon doel (besluit 10), dus het gewone puntenmodel
  geldt. Of een afgerond teamdoel iets extra oplevert is **niet besloten**; de spec
  stelt voor van niet.
- **Domeinregel 1** (twee klokken): een teamdoel volgt de groepsperiode, een aandeel
  de persoonlijke cyclus van zijn eigenaar (besluit 17). Er komt geen derde klok.
- **A41, A54 en A57** (groepszichtbaarheid en klassement): besluit 18 laat een teamgroep
  open zijn, besluit 21 houdt aandeeldoelen er toch beschermd en besluit 22 sluit het
  klassement uit. Die twee uitzonderingen volgen niet vanzelf uit de regels voor een
  open groep; ze moeten expliciet in de leesregels en in `groep_klassement()` komen,
  en op de naad getoetst worden.
- **Beslisbevoegdheid:** een datamodelwijziging, nieuwe RLS-logica en een werk dat
  meer dan vijftien bestanden raakt zijn gate-naar-afweging. Dit document is die
  verantwoording; de uitwerking volgt in de spec.

## Wat hier niet besloten is

Dit zijn geen aanname-gaten die iemand stilzwijgend moet vullen. Ze staan open tot
Quinten ze beantwoordt, en de spec presenteert ze als vraag met een voorgestelde
standaard:

- **Hoe A57 en besluit 22 samengaan.** A57 geeft elke groep een klassement, besluit
  22 sluit het uit voor een teamgroep. Er moet een poort komen die teamgroepen
  expliciet uitzondert, óók als ze beschermd zijn; of A57 die uitzondering krijgt of
  besluit 22 vervalt, is niet gezegd.
- **Of de rest van de app mee verschuift** (A44): Doelcoach-prompt, voorbeelden, copy
  en positionering.
- **Het getal van het hogere plafond voor teamgroepen** (besluit 23). Besloten is
  alleen dat teamgroepen een hoger plafond dan twaalf krijgen. Welk getal, moet eerst gemeten worden op chat,
  groepsoverzicht en realtime. Tot dan geldt in de code het bestaande plafond; dat is
  de huidige stand en geen besluit.
- **Wie de zichtbaarheid van een teamgroep kiest, en of ze later omgezet mag worden**
  (besluit 18). Besloten is dat de organisatie bij het aanmaken kiest. Of dat de
  beheerder alleen is of dat de leden moeten instemmen, en of een teamgroep later van
  beschermd naar open mag via `zet_groepszichtbaarheid()` (A41: omzetten verandert met
  terugwerkende kracht wat er over anderen zichtbaar wordt), is niet gezegd.
- **Of een afgerond teamdoel iets extra oplevert** aan punten of een melding. De spec
  stelt voor van niet.
- **Wat een collega te zien krijgt van een commitment in een teamgroep.** Besluit
  12 staat de teamgroep als begunstigde of getuige toe; wat er zichtbaar wordt, bij
  welke stand en voor wie, is niet uitgewerkt. Het raakt wat een mens beloofd wordt
  (grens 1).
- **Juridisch.** Een organisatie maakt van GoalBuddies een systeem dat gegevens
  van werknemers verwerkt voor een werkgever. Of daar, in Nederland, een
  instemmingsrecht van een ondernemingsraad of een bepaalde AVG-rolverdeling bij
  hoort, is een **niet-geverifieerde veronderstelling van deze sessie en geen
  vaststelling**. Laat dat door iemand met verstand van arbeids- en privacyrecht
  toetsen voordat het aan organisaties verkocht wordt.

## Herbevestigen vóór

⚠️ **Herbevestigen vóór het eerste issue dat een organisatie-tabel aanmaakt.** De
les van A17 is dat een besluit dat aan een toekomstige feature hangt, met zijn
voorwaarde moet worden opgeschreven. Het besluit hier rust op twee dingen die nog
niet gemeten zijn: dat de markt niet aan de bestaande founder-apps genoeg heeft, en
dat een organisatielaag de kosten waard is boven een buddygroep met een teamdoel.
Wordt een van beide weerlegd, dan is besluit 4 of 2 het eerste dat terug moet.

## Het onderzoek erachter

- Habit Huddle is eerder al ontleed: `docs/research/habit-huddle-teardown.md`
  (15-08-2026, via Firecrawl). Dat is de enige scan die in de repo staat.
- Een technische ontleding met REA (Reverse Engineer Anything) is bij Quinten
  neergelegd voor een **aparte sessie** zonder Supabase- en Linear-koppelingen. Niet
  in deze sessie gedraaid. Het resultaat komt, als het er is, in `docs/research/`.
- Bronnen die richting hebben gegeven: [REA op
  GitHub](https://github.com/morluto/rea) (README en DISCLAIMER gelezen),
  [SAS Institute v World Programming](https://www.scl.org/2436-sas-v-wpl-no-copyright-says-ecj/)
  (functionaliteit van software is niet auteursrechtelijk beschermd),
  [slaafse nabootsing](https://www.dirkzwager.nl/kennis/artikelen/bescherming-tegen-slaafse-nabootsing-hoe-werkt-dat)
  (nabootsen mag in beginsel, tenzij verwarring te vrezen is — niets specifieks
  over software gevonden), en de [founder-accountabilitylijst
  van Tability](https://www.tability.io/odt/articles/10-best-accountability-apps-to-keep-your-goals-on-track).
  ⚠️ **Dit is geen juridisch advies.**
