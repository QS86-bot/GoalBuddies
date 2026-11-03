# Zakelijk gebruik met organisaties en teamdoelen

**Datum:** 03-11-2026 · **Issue:** nog geen — het Linear-issue volgt op de spec ·
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
  *"unless revisited"*. Dit besluit is die herziening.
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

### Wat de drie afwijkingen kosten

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
  omhoog*. Wat een aandeel aan punten oplevert is **niet besloten**.
- **Domeinregel 1** (twee klokken): een teamdoel en een persoonlijk aandeel lopen
  waarschijnlijk op verschillende klokken. Niet uitgewerkt; spec.
- **Beslisbevoegdheid:** een datamodelwijziging, nieuwe RLS-logica en een werk dat
  meer dan vijftien bestanden raakt zijn gate-naar-afweging. Dit document is die
  verantwoording; de uitwerking volgt in de spec.

## Wat hier niet besloten is

Dit zijn geen aanname-gaten die iemand stilzwijgend moet vullen. Ze staan open tot
Quinten ze beantwoordt, en de spec presenteert ze als vraag met een voorgestelde
standaard:

- **Wat de beheerder wél mag** als hij qua voortgang niets extra ziet: uitnodigen,
  verwijderen, de organisatie opheffen, factureren.
- **Wat er met iemands individuele doelen gebeurt** als hij de organisatie
  verlaat of zijn account verwijdert. Er is een eerder besluit over wat een
  accountverwijdering meeneemt (`docs/decisions/2026-09-08-wat-een-straf-overleeft.md`);
  of dat ook voor werkdoelen geldt is niet gezegd.
- **Wat een aandeel is:** een getal, een percentage of vrije tekst.
- **Of één persoon in meerdere organisaties kan zitten.**
- **Hoe organisatie, buddygroep en bestaande groepen zich tot elkaar verhouden.**
- **Wat een commitment device in een werkcontext betekent.** Domeinregel 5 en 11
  zeggen dat een straf nooit geld is en altijd vrijblijvend; tegenover een
  collega of werkgever is dat een ander gesprek, en het raakt wat een mens
  beloofd wordt — grens 1.
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
