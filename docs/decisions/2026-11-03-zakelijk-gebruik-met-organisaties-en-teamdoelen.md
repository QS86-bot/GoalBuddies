# Zakelijk gebruik met organisaties en teamdoelen

**Datum:** 03-11-2026 · **Issues:** QS8-649 (de poort) en de epic QS8-650 met sub-issues QS8-651 t/m QS8-666 ·
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
| 24 | A44 herzien: **eerst positionering en onboarding zakelijk**; de Doelcoach-prompt en de voorbeelden volgen pas na meting met echte gebruikers, elk als eigen besluit | idem | nee |
| 25 | **A57 krijgt een uitzondering voor teamgroepen**, ook beschermde: het klassement geldt in groepen zonder organisatie. Besluit 22 blijft staan | idem | nee |
| 26 | De zichtbaarheid van een teamgroep wordt omgezet **zoals bij gewone groepen**: de beheerder zet om met één bevestiging, met spoor en systeembericht | alleen strenger maken, nooit alsnog openen | **ja** |
| 27 | Het plafond voor een teamgroep is **voorlopig 25 leden**; niet gemeten, na meting bij te stellen | eerst meten, tot dan twaalf laten gelden | **ja** |
| 28 | Een afgerond teamdoel geeft **iedereen die een aandeel had eenmalig +2**, ook bij een gemist aandeel | alleen een systeembericht en geen extra punten; als er punten komen, +1 en alleen voor wie zijn aandeel haalde | **ja** |
| 29 | Een commitment met een teamgroep als begunstigde of getuige is **pas leesbaar als de straf verschuldigd is**, zoals bij elke begunstigde groep | idem | nee |
| 30 | Een teamdoel is **afgerond** als een lid het afrondt en een **teamgenoot het goedkeurt, nooit jezelf** | idem | nee |
| 31 | Besluit 2 en 4 zijn **herbevestigd, onder één voorwaarde:** de vier tot nu toe geblokkeerde bronnen worden gelezen vóór de eerste organisatie-migratie | idem | nee |
| 32 | Het zakelijke werk krijgt een **nieuwe fase** naast fase 1 t/m 3. De naam is nog niet gekozen | idem | nee |
| 33 | De juridische toets is een **voorwaarde voor verkoop aan organisaties**; er wordt ondertussen gebouwd. De vragenlijst voor de jurist staat in `docs/research/vragen-voor-de-jurist-organisaties-en-teamdoelen.md` | idem | nee |
| 34 | **Elke organisatiebeheerder is automatisch groepsbeheerder van elk team** | idem | nee |
| 35 | De teambonus is **beperkt tot één per persoon per seizoen** | idem | nee |
| 36 | De organisatiebeheerder wordt groepsbeheerder **zonder lid van het team te zijn**, via een uitgebreide `is_group_admin()`, en niet als lid met de rol beheerder | idem | nee |
| 37 | Het label voor de nieuwe fase is **`phase:zakelijk`** | idem | nee |
| 38 | De vervolgissues komen in **één epic met sub-issues en blokkeerrelaties** | idem | nee |
| 39 | **A57 blijft staan** voor groepen zonder organisatie, en de vier vragen uit §7 van het A57-document zijn beantwoord (besluit 39 t/m 44 daar). Alleen nieuwe groepen krijgen het klassement standaard; een bestaande beschermde groep zet het zelf aan | eenmalig een systeembericht aan elke bestaande groep | **ja**, op dat ene punt |

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
regel voor bestaat, in een groep waar je niet vrijwillig bij hoort. **Wanneer** een
collega het ziet is sinds besluit 29 vastgelegd (pas als de straf verschuldigd is);
**wat** er in het scherm komt is niet uitgewerkt. De spec heeft hier een eigen issue
voor met `security-reviewer` direct, en de spec-standaard "geen teamgroep als
begunstigde" vervalt.

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
raakt de chat, het groepsoverzicht (N+1-risico, regel 12) en realtime. Het getal is voorlopig 25
(besluit 27) en niet gemeten.

⚠️ **Besluit 26 (omzetten zoals bij gewone groepen).** Het advies was alleen strenger
maken: van open naar beschermd mag, van beschermd naar open niet. 📏 Het bestaande
mechanisme, `zet_groepszichtbaarheid()` in migratie 0076, laat **één groepsbeheerder
met één bevestiging** omzetten, zonder instemming van de leden. Het legt een rij in
`group_events` vast, roept een systeembericht aan (de inhoud heb ik niet nagelezen) en
laat omzetten naar open maar één keer per dag toe. **Wat het kost:** in een team kan
één persoon met terugwerkende kracht openen wat de anderen als beschermd hebben
aangenomen, in een groep waar je niet vrijwillig bij zit. Besluit 21 beperkt de schade
(aandeeldoelen blijven beschermd), maar elk ander doel dat een lid aan de teamgroep
koppelde wordt zichtbaar. De functie toetst `is_group_admin()` van de groep; of de
beheerder van de organisatie automatisch groepsbeheerder van elk team is, is niet
besloten.

⚠️ **Besluit 27 (voorlopig plafond van 25).** Het advies was eerst meten en tot dan
twaalf laten gelden. Quinten koos een voorlopig getal. 25 is de kleinste van de drie
getallen die ik voorlegde en is **niet gemeten**: het raakt de chat, het
groepsoverzicht (N+1, regel 12) en realtime, en moet getoetst worden voordat het in
productie komt.

⚠️ **Besluit 28 (teambonus).** Het advies was alleen een systeembericht en geen extra
punten; kwamen er toch punten, dan +1 en alleen voor wie zijn eigen aandeel haalde.
Quinten koos +2 voor iedereen die een aandeel had, ook bij een gemist aandeel. **Wat
het kost:** (1) dubbeltelling: migratie 0132 haalde `goal_done` om die reden uit
`points_ledger`, en een aandeel levert al punten per weekdoel; (2) voor dit deel van de
score maakt een gehaald of gemist aandeel geen verschil, en dat is de reden achter
domeinregel 10 dat een weekpas de reeks beschermt en niet het punt; (3) een nieuw
redentype in de CHECK `points_ledger_reason_valid` (0132), dus een migratie, en een
uitbreiding van het puntenmodel die in CLAUDE.md bij domeinregel 10 hoort en daar nog
niet staat; (4) het misbruikgat bij besluit 30. **Wat blijft:** `points_ledger` is
alleen voor de eigenaar leesbaar, dus de bonus lekt niets aan collega's zolang geen
bericht of overzicht laat zien wie hem kreeg. Een eerdere kostenregel van mij,
dat een gemist aandeel uit het puntenverloop af te leiden zou zijn, was daarom
overdreven.

⚠️ **Besluit 31 (herbevestigd onder een voorwaarde).** Besluit 2 (alles tegelijk) en 4
(organisatie boven groepen) rusten op twee dingen die niet gemeten zijn: de markt, en
de kosten van de organisatielaag. Quinten herbevestigde ze, maar wil eerst de vier
bronnen lezen die in de onderzoekssessie geblokkeerd waren (goalgeniee.com, habi.app,
goalsandprogress.com, habithuddle.com). **Dat vraagt dat die vier domeinen in de
netwerkinstellingen van de sessie worden toegestaan.** De kostenvraag van de
organisatielaag blijft een oordeel; de bronnen toetsen alleen de markt.

⚠️ **Besluit 33 (juridisch: bouwen, verkopen later).** Het alternatief was eerst
toetsen. Er zijn nog geen organisaties als klant, dus bouwen raakt geen mensen. **Het
risico is herwerk:** eist de toets iets van het datamodel, dan is dat achteraf duurder.
Daarom staan de vragen die het datamodel raken bovenaan in de vragenlijst. Het is geen
juridisch advies, en de enige externe bron erin (artikel 27 WOR) is een zoeksamenvatting.

⚠️ **Besluit 34 (organisatiebeheerder is groepsbeheerder) en 36 (zonder lid te zijn).**
Besluit 34 volgt het advies. Besluit 36 koos hoe: beheerrechten zonder lid te worden,
zodat hij de chat en het overzicht van teams waar hij geen lid van is niet leest. Dat
houdt besluit 6 intact; als lid van elk team had hij meer gelezen dan een gewoon lid.
**Wat het kost:** de helper `is_group_admin()` moet ook gelden voor een niet-lid met een
organisatierol. 📏 Gemeten (laatste definitie per functie of policy, SQL-commentaar
uitgesloten, 05-11-2026) wordt hij aangeroepen in **negen functies en drie policies**:
`archiveer_groep`, `beslis_lidmaatschapsverzoek`, `rotate_invite_code`,
`set_invite_revoked`, `verwijder_lid`, `verzoekers_eerder_lid`,
`zet_groepsontdekbaarheid`, `zet_groepszichtbaarheid` en `zet_huddledag`, plus de
policies `groups_update`, `group_members_update` en `group_join_requests_select`. Een
fout in die ene helper geeft beheerrechten waar ze niet horen, en kan dat ook doen voor
groepen buiten elke organisatie. **Dat vraagt `security-reviewer` direct en een test die
een groep zonder organisatie expliciet toetst.** Wat elke functie precies doet heb ik
niet nagelezen.

⚠️ **Deze meting is twee keer gecorrigeerd.** De eerste versie noemde ook
meldingsfuncties, omdat mijn teller een treffer toewees aan de laatste functiedefinitie
erboven. De tweede telde `heropen_groep`, `verlaat_groep` en `guard_group_member_update`
mee en kwam op twaalf functies, terwijl die drie `is_group_admin()` alleen in
**commentaar** noemen. De huidige meting is bij benadering: een script las de
migratiebestanden zonder commentaar, niet de database, en een aanroep via een andere
helper telt het niet.

**Ontwerpkeuze (Claude, onder de Beslisbevoegdheid; Quinten kan haar omgooien): de
uitbreiding komt in de bestaande helper en er komt geen tweede.** De commentaren in die
drie functies leggen uit waarom ze rechtstreeks op de tabel werken: `is_group_admin()`
geeft sinds migratie 0092 onwaar voor een gearchiveerde groep, en zij moeten juist dán
werken. De uitbreiding moet dat gedrag behouden. Voor de negen functies en drie policies
is één wijziging precies wat besluit 34 vraagt: het zijn allemaal beheerdersbevoegdheden.
De drie rechtstreekse paden blijven buiten de helper en worden apart beoordeeld;
`heropen_groep` is de enige waarbij een organisatiebeheerder erbij zou willen kunnen. Een
gemist pad faalt dicht (de organisatiebeheerder kan iets niet) en niet open. Het
alternatief, een tweede helper naast de bestaande, vraagt dat elk van de twaalf plekken
bewust wordt omgezet en maakt een vergeten plek tot een stille afwijking tussen twee
soorten beheerders.

⚠️ **Besluit 35 (één teambonus per seizoen).** Het volgt het advies. De limiet stopt
samenspannen niet, maar maakt het een kwartaal waard: hoogstens +2 per persoon per
seizoen. Of `seizoensgrens()` (genoemd in `docs/WERKVOORRAAD.md`) hiervoor geschikt is,
heb ik niet nagelezen; dat hoort bij de bouw. Een tijdsberekening buiten `shared/time`
is verboden (correctheidsregel 7).

⚠️ **Besluit 30 (afronden met goedkeuring).** Zonder noemer (besluit 16) kan het
systeem niet zelf zien dat een teamdoel af is, dus afronden is een handeling. Met
besluit 20 (elk lid maakt een teamdoel aan) en besluit 28 kon één lid anders een
teamdoel aanmaken, afronden en iedereen +2 geven, zichzelf ook. De goedkeuring door een
teamgenoot, nooit jezelf, stopt dat voor één persoon. **Twee leden die samenspannen
kunnen het nog wel**; een limiet op het aantal teamdoelen per periode is niet besloten.

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
  Dit document legt alleen organisaties en teamdoelen vast. **Beantwoord op
  03-11-2026 (besluit 24):** eerst positionering en onboarding zakelijk; de
  Doelcoach-prompt en de voorbeelden volgen pas na meting, als eigen besluit per
  onderdeel. ⚠️ **QS8-128 verwijst voor A44 naar `docs/decisions/006-besluitenronde-24-08.md`,
  maar dat document bevat A44 niet** (de titel noemt A37, A41, A42, A43 en A46). Het
  besluit van 24-08 leefde dus alleen in Linear; dit document legt nu vast wat er
  vandaag over besloten is.
- **A57 (QS8-272, 03-09-2026): een klassement in elke groep, ook een beschermde.**
  📏 Het besluit staat op Done, maar **de bouw is er niet**: migratie 0141 is de enige
  definitie van `groep_klassement()` en de poort staat daar nog op
  `lid_van_open_groep()` (r.267), dus vandaag geeft een beschermde groep nul rijen. De
  beschrijving van het issue zegt zelf *"De bouw staat nog open."* Zodra A57 landt,
  botst het met besluit 22 (nooit een klassement in een teamgroep): dan geeft ook een
  **beschermde** teamgroep een klassement, tenzij teamgroepen er expliciet uit worden
  gehouden. **Beantwoord op 03-11-2026 (besluit 25):** A57 krijgt een uitzondering voor
  teamgroepen, ook beschermde; besluit 22 blijft staan.

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
  geldt. Besluit 28 voegt daar een eenmalige teambonus aan toe (+2 voor iedereen met een
  aandeel, ook bij een gemist aandeel). Dat is een uitbreiding van het puntenmodel
  die in CLAUDE.md bij domeinregel 10 hoort en daar nog niet is bijgewerkt.
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

- **De Doelcoach-prompt en de voorbeelden** (besluit 24). Dat ze later volgen, na
  meting met echte gebruikers, is besloten; wat er dan verandert en wanneer niet. Elk
  onderdeel is een eigen besluit.
- **De tekst van de bevestiging bij het openzetten van een groep**: die moet het
  klassement noemen, want het gaat automatisch aan (besluit 45 in het A57-document). De
  tekst zelf is niet geschreven.
- **De meting achter het voorlopige plafond van 25** (besluit 27): chat,
  groepsoverzicht en realtime bij grotere groepen. Tot er gemeten is, is 25 een keuze
  en geen uitkomst.
- **De drie rechtstreekse paden** (`heropen_groep`, `verlaat_groep`,
  `guard_group_member_update`) en of een organisatiebeheerder een gearchiveerd team mag
  heropenen. De ontwerpkeuze zelf, de uitbreiding in de bestaande helper, staat bij
  besluit 36.
- **Of `seizoensgrens()` geschikt is voor de limiet van besluit 35**, en wie als 'had een
  aandeel' telt als iemand de organisatie verlaat vóór de afronding.
- **Het label `phase:zakelijk`** (besluit 37) bestaat nog niet in Linear en wordt
  aangemaakt bij de epic.
- **De vier bronnen lezen** (besluit 31). Een poging op 04-11-2026 mislukte: de proxy
  antwoordt `403` op de verbinding naar alle vier de hosts, dus het netwerkbeleid van de
  sessie laat ze niet toe, ook niet na de wijziging die Quinten aangaf. Of de instelling
  pas voor een nieuwe sessie geldt, is niet vastgesteld.
- **Hoe het commitment van een teamgroep er in het scherm uitziet.** Besluit 29 zegt
  wanneer een collega het ziet (pas als de straf verschuldigd is); de tekst en vorm in
  het scherm zijn niet uitgewerkt.
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
**Herbevestigd op 04-11-2026 (besluit 31), onder de voorwaarde dat de vier bronnen eerst
gelezen worden.**

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
