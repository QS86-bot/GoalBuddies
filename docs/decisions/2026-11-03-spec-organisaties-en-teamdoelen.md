# Spec-voorstel: organisaties en teamdoelen

**Datum:** 03-11-2026 · **Issues:** epic QS8-650 met sub-issues QS8-651 t/m QS8-666 (zie "Linear" onder de knip); QS8-649 is de poort · **Raakt:** het schema, RLS en de schermlaag
**Status:** **voorstel van de spec-planner.** Niets hiervan is besloten behalve wat
in `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`
staat. Elke "voorgestelde standaard" hieronder wacht op een antwoord van Quinten.

## Wie heeft wat gemeten

Dit voorstel is geschreven door de `spec-planner` (alleen lezen) en niet door mij.
Hij gaf bij elke bevinding bestand en regel; alle migraties staan in
`supabase/migrations`.

**Door mij nagelopen (03-11-2026):**
- 📏 De trigger op `completion_approvals` in migratie 0275 (r.177-199) toetst
  alleen of de goedkeurder lid is van `new.group_id` en of het doel aan **díe**
  groep hangt. Een goedkeuring uit **elke** gekoppelde groep volstaat dus. Dit is
  bevinding E1 hieronder en de zwaarste.
- 📏 `groepen[0]` staat op vier plekken: `app/(tabs)/lijst.tsx` r.555 en r.576, en
  `app/doel/[id].tsx` r.1061 en r.1558. **De regelnummers kloppen; wat elke plek
  met de gekozen groep doet heb ik niet nagelezen.**
- 📏 Geen `team_goal` of `teamdoel` in `supabase`, `src` of `app`. Het woord
  *organisatie* staat alleen in migratie 0142, 0143, 0144 en 0164. 0144 stond niet
  in het rapport en is niet gelezen.
- 📏 `userCycle` en `groupPeriod` bestaan in `src/shared/time/cycle.ts`. Een
  definitie onder de namen `currentUserCycle` of `currentGroupPeriod`, zoals
  CLAUDE.md ze noemt, vond ik niet. Dat is een afwijking tussen de grondwet en de
  code; ik heb haar niet gerepareerd.

**Niet nagelopen:** de rest van de tabel "Bestaande stand" en alle regelnummers
in de overige migraties. Lees ze als *door de spec-planner gelezen*, niet als door
mij bevestigd. De volledige lichamen van `group_overview()`,
`award_points_on_approval()`, `verwijder_mijn_account()` en `join_group` zijn ook
door hem niet gelezen; de spec moet ze met `pg_get_functiondef()` nalezen, want de
gedeployde functie is de waarheid.

## Beslissingen die nog nodig zijn (onomkeerbaar)

De voorgestelde standaard staat tussen haakjes.

**Bijgewerkt na de antwoorden van Quinten (03-11-2026):** beslissing 1, 2 en 5 en
open vraag 3, 8 en 9 zijn beantwoord; zie besluit 9 tot en met 12 in het
beslisdocument. Bij 1, 2 en 9 koos Quinten de voorgestelde standaard. **Bij 5 en 8
(commitments) wees hij de standaard af:** een teamgroep mag begunstigde of getuige
zijn, onder dezelfde regels als nu.

**Tweede ronde (03-11-2026):** ook beslissing 3 (teambalk: teller zonder noemer) en
4 (geen derde klok) en open vraag 1, 2, 4, 5, 7, 10, 11 en 12 zijn beantwoord; zie
besluit 13 tot en met 23. Open vraag 6 volgt uit besluit 9. **Afwijkend van de
standaard: vraag 7 (een open teamgroep is toegestaan) en vraag 12 (een hoger plafond,
het getal is niet besloten).** Wat daarvan hieronder nog als standaard staat, is bij
die twee vervallen.

**Derde ronde (04-11-2026):** besluit 26 tot en met 30 zijn genomen (omzetten van de
zichtbaarheid, voorlopig plafond van 25, een teambonus, een commitment met een
teamgroep, afronden met goedkeuring). **Afwijkend van de standaard: 26, 27 en 28.**
Vooral de punten hieronder zijn daardoor veranderd: er is nu wél een bonus bij een
afgerond teamdoel.

**Vierde ronde (04-11-2026):** besluit 31 tot en met 35. Voor dit voorstel zijn er twee
gevolgen. **Besluit 34** (elke organisatiebeheerder is groepsbeheerder van elk team)
vraagt een ontwerpkeuze die nog niet gemaakt is: als lid met de rol beheerder, of via
een uitgebreide `is_group_admin()` voor een niet-lid. **Besluit 35** beperkt de
teambonus tot één per persoon per seizoen, wat in issue 11 en in criterium 14 landt.

**Vijfde ronde (04-11-2026):** besluit 36 tot en met 38. Voor dit voorstel: **besluit 36**
laat de organisatiebeheerder groepsbeheerder worden zonder lid te zijn, dus de helper
`is_group_admin()` wordt uitgebreid, in de bestaande helper (ontwerpkeuze, zie het
beslisdocument). Gemeten wordt hij aangeroepen in negen functies en drie policies, dus dat
zit in issue 3 en vraagt `security-reviewer` direct, met criterium 15. **Besluit 38**: de
twaalf issues komen als sub-issues in één epic, met blokkeerrelaties.

1. **De vorm van een team (besloten: bestaande groep met organisatie-kolom).** Een bestaande groep met een kolom `organization_id`, of
   een nieuwe tabel? (Hergebruik groepen: lidmaatschap, peer-goedkeuring, chat en
   RLS blijven ongewijzigd, en de organisatie is de laag erboven.)
2. **Wat een aandeel is (besloten: een gewoon persoonlijk doel).** (Een gewoon persoonlijk doel van de werknemer, gekoppeld
   aan het teamdoel. Geen getal en geen percentage.)
3. **Waarop de teambalk telt** en of er een noemer is.
4. **Een derde klok of niet.** (Geen organisatieklok; het teamdoel volgt de
   huddledag van de teamgroep.)
5. **Commitments in een werkcontext** (grens 1). **Besloten, anders dan de
   standaard:** een teamgroep mag begunstigde of getuige zijn. (De standaard was: tot
   er een besluit is mag een straf geen teamgroep als begunstigde hebben; die vervalt.)
6. **Herbevestiging van besluit 2 en 4** uit het beslisdocument.

## Bestaande stand (door de spec-planner gelezen)

| Wat | Waar |
|---|---|
| Persoonlijke weekstart ("Klok 1") | 0001_schema.sql r.24,38 |
| Huddledag en rol admin/member op groepen ("Klok 2") | 0001_schema.sql r.52,70,76-82 |
| Eén doel aan meerdere groepen (`goal_group_links`) | 0001_schema.sql r.163-172 |
| Weekdoelen volgen de persoonlijke cyclus | 0001_schema.sql r.217; trigger in 0198 r.178 |
| Voltooiingen append-only | 0001_schema.sql r.243-263 |
| Niet jezelf goedkeuren en één stem | 0001_schema.sql r.275-280 |
| Insert-policy op goedkeuringen, vier clausules | 0153 r.326-348 |
| Trigger op goedkeuringen | 0275 r.140-218 |
| Puntenboekhouding, alleen voor de eigenaar | 0001_schema.sql r.349-378; 0132 r.86-96 |
| Gemist boekt zonder groep | 0141 r.117-123 |
| `groep_klassement()` | 0141 r.219 |
| Allowlist systeemberichten, nieuwste | 0208 r.93-103 |
| Lidmaatschapshelpers | 0092 r.107-135 |
| Leesrecht op groepen en lidmaatschappen | 0153 r.136-159, 196-214 |
| Delen van een doel met een groep | 0102 r.140-163, 211-233 |
| Zichtbaarheid van weekdoelen | 0122 r.448-454 |
| Zichtbaarheid van een groep, niet schrijfbaar | 0076 r.66-114 |
| `group_overview()`, nieuwste | 0208 r.458 |
| Groep verlaten ruimt koppelingen op | 0102 r.409, 624 |
| Accountverwijdering, nieuwste | 0247 r.86 |
| Risico-radar, alleen voor de eigenaar | 0050 r.61 |
| Realtime-publicatie en bewaking | 0021 r.378-385; 0024 r.58; 0027 r.26 |
| Ledenplafond van twaalf per groep | 0189 r.209 |

**Niet gevonden:** een tabel, kolom of functie voor een organisatie, team of
teamdoel (zie hierboven).

## Datamodel op papier

**Ontwerpprincipe (afgeleid, niet gemeten):** het teamdoel is het enige gedeelde
object. Elk aandeel blijft een gewoon persoonlijk doel van de werknemer. Daardoor
blijven domeinregel 4, de append-only regel, het puntenmodel en de goedkeuringsketen
ongewijzigd van toepassing, zonder tweede pad.

### Tabellen

1. **organizations:** id, naam (1-80 codepunten, met de spoofing-grendels van
   0283/0284), aanmaker, status (actief/gearchiveerd, nooit een delete), een
   unieke uitnodigcode, ingetrokken-vlag, aanmaakdatum. Index op aanmaker.
   SELECT alleen voor leden; INSERT, UPDATE en DELETE zonder policy en met `revoke`,
   alles via RPC. **De uitnodigcode is voor `authenticated` niet leesbaar** (een
   kolomgrant, want RLS kan geen kolom afschermen) en komt alleen terug uit een
   RPC voor de beheerder.
2. **organization_members:** organisatie, gebruiker, rol (beheerder/lid), status,
   toetredingsdatum. Sleutel op (organisatie, gebruiker), index op gebruiker.
   De rol komt **nooit** in een SELECT-policy van voortgangsdata (besluit 6).
3. **groups.organization_id** (nullable). Partiële index. Niet schrijfbaar voor
   clients (revoke plus trigger, patroon 0019/0076). CHECK: een groep met een
   organisatie is niet vindbaar (0144). De zichtbaarheid (beschermd of open) kiest de
   organisatie bij het aanmaken (besluit 18); de eerdere CHECK 'altijd beschermd'
   vervalt. Trigger: wie lid wordt van
   zo'n groep moet actief lid van de organisatie zijn.
4. **team_goals:** id, organisatie, teamgroep (NOT NULL), titel, beschrijving,
   streefdatum, status, aanmaker. Indexen op groep en organisatie. Trigger: de
   groep hoort bij de organisatie. SELECT via de bestaande groepsleesregel,
   schrijven via RPC. **De periode van een teamdoel is de groepsperiode; er komt
   geen derde klok.**
5. **team_goal_shares:** teamdoel, doel (UNIQUE: een doel is hoogstens één
   aandeel), gebruiker (gelijkgehouden aan de eigenaar van het doel door een
   trigger), aanmaakdatum. UNIQUE op (teamdoel, gebruiker). SELECT alleen als je
   de teamgroep mag lezen **en** het doel met je deelt (volgt 0102). Schrijven via
   RPC, alleen door de eigenaar. **Grendel:** een trigger op `goal_group_links`
   verbiedt dat een aandeeldoel aan een andere groep dan de teamgroep hangt.
   De weekdoelen van het aandeel volgen de persoonlijke cyclus.
6. **team_progress_events** (append-only teller): teamdoel, mijlpaal (set null),
   aanmaakdatum. UNIQUE op (teamdoel, mijlpaal). **Geen gebruikerskolom**, zodat de
   teller per persoon niet terug te rekenen is en er bij accountverwijdering niets
   uit hoeft. Gevuld door een trigger bij de eerste overgang van een mijlpaal naar
   gedaan. Geen UPDATE of DELETE, ook niet voor `service_role` (patroon 0101).
   Geen directe SELECT, alleen een RPC. Niet in de realtime-publicatie.

### RPC's

Alle `security definer`, met vaste `search_path` en `revoke ... from public, anon,
authenticated` gevolgd door een expliciete `grant`.

- **Helpers:** is-lid en is-beheerder van een organisatie. De tweede alleen voor
  schrijf-RPC's.
- **Organisatie:** aanmaken, lid worden met code (met dagteller, regel 5; patroon
  0203), verlaten, en een lid uitzetten (beheerder). Vertrek en uitzetting zetten
  iemand in elke teamgroep van die organisatie op inactief via de bestaande
  vertreklogica, waardoor ook de koppelingen vervallen.
- **Team:** teamgroep aanmaken, teamdoel aanmaken, aandeel koppelen (in dezelfde
  transactie als de groepskoppeling).
- **Teambalk:** één getal, het aantal behaalde mijlpalen. Geen datum, geen delta,
  geen rij per persoon. Een niet-lid krijgt `null`, net als bij een onbekende id,
  zodat de RPC geen orakel is.
- **Ledenlijst:** gepagineerd met een cursor (patroon 0152).

### Punten (domeinregel 10)

Een aandeel is een gewoon doel: plus twee, plus een, min een of nul voor de
eigenaar, privé. De groep op de goedkeuringsboeking wordt de teamgroep. **Besluit 28
wijkt hier af van de spec-standaard:** er komt een eenmalige teambonus van +2 voor
iedereen met een aandeel bij een afgerond teamdoel, ook bij een gemist aandeel. Dat
vraagt een nieuwe reden in de CHECK `points_ledger_reason_valid` (0132), dus een
migratie, en het is de dubbeltelling die 0132 r.93 voor `goal_done` juist heeft
weggehaald. De spec-standaard (geen bonus) vervalt. De bonus staat in
`points_ledger`, dus alleen de eigenaar ziet hem. Besluit 22: nooit een
klassement in een teamgroep. Omdat een teamgroep open mag zijn (besluit 18), komt die
garantie niet meer gratis uit een beschermd-CHECK: `groep_klassement()` moet
teamgroepen expliciet uitsluiten, met een test. Dat geldt ook voor een beschermde
teamgroep: A57 (QS8-272, besloten maar nog niet gebouwd) krijgt een uitzondering voor
teamgroepen (besluit 25), dus de nieuwe poort die A57 invoert moet groepen van een
organisatie uitsluiten.

### Systeemberichten (domeinregel 7)

Eén migratie met twee nieuwe typen in de allowlist (een kopie van de lijst uit 0208):
`team_goal_created` en `team_goal_completed`. Ze gaan over de groep en noemen geen
titel. De kopie in `src/modules/buddies/chat-schemas.ts` moet mee, anders wordt de
bestaande test rood. **Geen** type dat een achterstand op een aandeel meldt.

### Schermlaag

Drie nieuwe schermen: een organisatie aanmaken, een organisatie bekijken (gepagineerde
leden, teams, uitnodigen; beheerdersknoppen alleen voor schrijfacties), en een
teamdoel met teambalk en eigen aandeel. Elk scherm heeft een ingang, anders wordt
`schermingang:controle` rood, en elke async view heeft loading-, error- en
lege staat. **Geen optimistic update op de teambalk:** een balk die na een refresh
terugzakt is precies het signaal dat besluit 7 verbiedt. Een nieuwe module
`organisaties` met `index.ts`, API en Zod-schema's.

## Knip in Linear-issues (elk één branch en één PR)

| # | Issue | Blokkeert | Risico en review |
|---|---|---|---|
| 0 | Herbevestiging en antwoorden op de open vragen in het beslisdocument | 1-8 | Grens 1, besluit van Quinten |
| 1 | **Expliciete groepskeuze in plaats van `groepen[0]`** bij hulpvraag, straf-begunstigde, getuige en taak delen | 6, 7 | Raakt de tegenslagroutes van domeinregel 7: `security-reviewer` direct |
| 2 | Organisaties en lidmaatschappen met RLS, RPC's en RLS-tests | 3 | Datamodel en auth: zwaarste model, `security-reviewer` direct |
| 3 | Organisatiekolom op groepen, CHECKs, lidmaatschapstrigger, vertrek-cascade, **en de uitgebreide `is_group_admin()` voor organisatiebeheerders (9 functies en 3 policies hangen eraan)** | 4 | RLS en lidmaatschap: direct |
| 4 | Teamdoelen en aandelen, koppelgrendel op groepskoppelingen, RLS-tests | 5 | Goedkeuring en groepsoppervlak: direct |
| 5 | Voortgangsteller en teambalk-RPC, RLS-tests | 7 | Nieuw groepsoppervlak: direct |
| 6 | Twee systeembericht-typen | 7 | Allowlist: direct |
| 7a | Organisatieschermen, module en i18n | 7b | UI: licht; de RLS-tests uit 2 dekken de ledenlijst |
| 7b | Teamdoelscherm en teambalk | | UI: licht |
| 8 | Accountverwijdering en verlaten met aandelen | | Wisrecht: direct, mogelijk grens 2 |
| 9 | **Commitments met een teamgroep als begunstigde of getuige** (nieuw na besluit 12): wat een collega ziet bij `unlocked`, `due` en `resolved`, en dat het niets lekt dat een aandeel op `missed` staat | | Geld, straffen en groepsdata: volledige kritische review, `security-reviewer` direct, grens 1 |
| 10 | **Open teamgroep** (nieuw na besluit 18, 21 en 22): leesregels met een uitzondering die aandeeldoelen in elke teamgroep beschermd houdt, geen klassement in een teamgroep, en per open leesroute een toets op de naad die een gemist aandeel of de voortgang per persoon zou kunnen tonen | | Zichtbaarheid tussen leden van een groep: volledige kritische review, `security-reviewer` direct |
| 11 | **Afronden en teambonus** (nieuw na besluit 28 en 30): een lid rondt een teamdoel af, een teamgenoot keurt goed (nooit jezelf), en pas dan wordt de bonus geboekt: een nieuwe reden in `points_ledger_reason_valid`, eenmalig per persoon per teamdoel | | Punten en goedkeuring: volledige kritische review, `security-reviewer` direct. Raakt domeinregel 10, dus CLAUDE.md moet mee |

Volgorde: 0, dan 1 (kan parallel met 2), 2, 3, 4, 5, 6, 7a, 7b, en 8 na 4. Issue 9, 10
en 11 komen na 4.

**Linear (aangemaakt 04-11-2026).** Dit zijn twaalf sub-issues, niet elf: nummer 7 is in
twee gesplitst. De epic is QS8-650.

| Knip | Linear | | Knip | Linear |
|---|---|---|---|---|
| 0 (poort) | QS8-649 | | 7b | QS8-658 |
| 1 | QS8-651 | | 8 | QS8-659 |
| 2 | QS8-652 | | 9 | QS8-660 |
| 3 | QS8-653 | | 10 | QS8-661 |
| 4 | QS8-654 | | 11 | QS8-662 |
| 5 | QS8-655 | | extra: positionering | QS8-663 |
| 6 | QS8-656 | | extra: CLAUDE.md domeinregel 10 | QS8-664 |
| 7a | QS8-657 | | extra: plafond meten | QS8-665 |
| | | | extra: A57 bouwen | QS8-666 |

De eerste organisatie-migratie (QS8-652) is geblokkeerd door QS8-649. QS8-662 is ook
geblokkeerd door QS8-664, en QS8-666 door QS8-653 en door de eigen vragen van A57. Elk issue
werkt `docs/decisions/002-domeinregel7-oppervlakken.md` bij voor zijn eigen nieuwe
oppervlak. `src/lib/database.types.ts` wordt alleen met `npm run types:db`
hergenereerd, nooit met de hand.

## Acceptatiecriteria

Een criterium met **(N)** staat op een naad en hoort een test te krijgen die de
belofte toetst en niet een onderdeel (regel 18).

1. **Zelf-goedkeuring (N).** A dient een voltooiing in op een weekdoel van zijn
   aandeel en voegt een goedkeuring met zichzelf als beoordelaar in: geweigerd. Via
   `service_role` faalt het op de trigger of de CHECK. De naad is de keten aandeel,
   groepskoppeling, teamgroep, trigger, getoetst op het echte teampad.
2. **Beheerder buiten het team (N).** Een beheerder die geen lid van de teamgroep
   is, kan niet goedkeuren.
3. **Vriendengroep (N).** De eigenaar kan een aandeeldoel niet aan een privé-
   buddygroep koppelen. Een vriend kan zo geen werkaandeel goedkeuren.
4. **Andere organisatie (N).** Een lid van organisatie Y leest met id's van X nul
   rijen of `null`, identiek aan wat een verzonnen id oplevert, ook via directe
   PostgREST-aanroepen.
5. **Beheerder ziet niet meer (N, structureel).** Voor elke tabel en RPC die
   voortgang toont is de resultaatset van een beheerder gelijk aan die van een
   gewoon lid, in beide richtingen. Daarnaast een catalogustest dat geen SELECT-
   policy en geen leesfunctie naar de rol verwijst. IJking: een tak
   "of beheerder" toevoegen moet de test rood maken.
6. **Gemist aandeel lekt niet (N).** (a) Een teamgenoot ziet het niet via de
   weekdoelen. (b) `realtime_bewaking()` toont geen `REPLICA IDENTITY FULL` en de
   nieuwe tabellen staan niet in de publicatie. (c) De teambalk is vóór en na de
   gemiste week gelijk, en ook nadat een mijlpaal van gedaan terug naar te doen
   gaat. (d) `groep_klassement()` geeft nul rijen, ook voor een open teamgroep
   (besluit 22) en ook voor een beschermde teamgroep: A57 (QS8-272) krijgt een
   uitzondering voor teamgroepen (besluit 25). (e) Er is geen view over de nieuwe tabellen zonder expliciete
   kolomlijst. (f) In een open teamgroep ziet een teamgenoot een gemist aandeel niet
   en niet hoe ver een ander met zijn aandeel is (besluit 21).
7. **Twee week-starts (N).** Gebruiker A op maandag, B op zondag, een derde in
   `America/New_York`, teamgroep met huddledag woensdag. De cyclusstart van elk
   aandeelweekdoel is de persoonlijke cyclus van de eigenaar; een "deze
   teamperiode"-weergave gebruikt de groepsperiode. Getoetst in `shared/time` én in
   SQL.
8. **Lid van een team vereist lid van de organisatie,** ook met de uitnodigingscode.
9. **Vertrek uit de organisatie (N).** De gebruiker is inactief in alle teamgroepen,
   ziet niets meer, niemand ziet zijn aandeeldoel, en de teambalk daalt niet.
10. **Uitnodigcode** is niet leesbaar via de tabel; de RPC geeft hem alleen aan een
    beheerder.
11. **Allowlist.** Een onbekend systeembericht-type wordt geweigerd, ook voor
    `service_role`; een teambericht bevat geen titel.
12. **Dagteller** op uitnodigen en lid worden.
13. **Teambonus (N).** (a) Een lid kan zijn eigen afronding van een teamdoel niet
    goedkeuren: geweigerd in RLS, en via `service_role` op de constraint. (b) De bonus
    boekt eenmalig per persoon per teamdoel, ook bij een tweede afronding of een
    herhaalde goedkeuring. (c) De boeking staat alleen in `points_ledger` van de
    eigenaar; geen bericht, overzicht of RPC laat een teamgenoot zien wie hem kreeg.
    (d) Een teamdoel dat nooit wordt goedgekeurd boekt niets. IJking: de eigen-
    goedkeuringscheck weghalen moet (a) rood maken.
14. **Limiet op de teambonus (N).** Een tweede teambonus voor dezelfde persoon in
    hetzelfde seizoen boekt niet (besluit 35), ook niet via een ander teamdoel of
    een andere teamgroep van dezelfde persoon. Getoetst met twee leden die elkaars
    afronding goedkeuren. De seizoensgrens komt uit `shared/time`, nooit uit een eigen
    berekening.
15. **Organisatiebeheerder zonder lidmaatschap (N).** (a) Een organisatiebeheerder die
    geen lid van een team is, kan dat team beheren (verzoeken beslissen, de uitnodigcode
    roteren, de zichtbaarheid zetten) maar leest er geen chat, geen overzicht en geen
    teambalk. (b) Een beheerder van een andere organisatie heeft in dit team geen enkel
    recht. (c) Voor een groep zonder organisatie verandert er niets aan wie beheerder is.
    IJking: de uitbreiding van `is_group_admin()` weghalen moet (a) rood maken, en een
    te brede uitbreiding moet (b) of (c) rood maken.

## Aannames die breken (regel 18, vraag 6)

1. 📏 **SQL, de belangrijkste (door mij nagelopen, zie boven).** Goedkeuring uit
   elke gekoppelde groep volstaat. Daarom de koppelgrendel en criterium 3.
2. **Hulpvraag gaat standaard naar de eerste groep** (`app/doel/[id].tsx` r.1558).
   Met een teamgroep in de lijst kan tegenslag stil bij het werkteam belanden.
3. **Straf-begunstigde en getuige staan standaard op de eerste groep of persoon**
   (r.1061 en r.1005, r.1072 in hetzelfde bestand).
4. **Taak delen** deelt direct bij één groep en kiest anders de eerste
   (`app/(tabs)/lijst.tsx` r.555 en r.576).
5. Cosmetisch: `src/modules/buddies/samen.ts` r.81.
6. **Al veilig:** `src/modules/buddies/deling.ts` r.107-109 (de exact-één-regel uit
   QS8-56) en de `.maybeSingle()` op een primaire sleutel of unieke index.
7. `points_ledger.group_id`, `commitments.beneficiary_group_id` en
   `completion_approvals.group_id` zijn enkelvoudig: in orde zolang een aandeel
   maar één groep heeft.
8. Het ledenplafond van twaalf beperkt vandaag de teamgrootte; besluit 23 verhoogt
   het voor teamgroepen, zonder getal.
9. **Niet gemeten:** `limit 1` in SQL-functies over lidmaatschappen en
   groepskoppelingen. `eenrij:controle` dekt alleen `.single()` en `.maybeSingle()`
   aan de clientkant.

## Openstaande vragen met voorgestelde standaard

1. **Wat mag de beheerder?** Uitnodigen, iemand uit de organisatie zetten, teams
   aanmaken en de organisatie archiveren. Geen voortgangsinzicht, geen facturering
   (buiten scope, grens 1).
2. **Vertrek of accountverwijdering.** Persoonlijke doelen en aandeeldoelen blijven
   van de gebruiker; alleen de koppeling vervalt en de teller blijft staan. De teller
   bevat geen gebruiker, dus er hoeft niets uit. Of een anonieme telling na
   verwijdering mag blijven staan is juridisch.
3. **Wat is een aandeel? (Besloten: een persoonlijk doel.)** Een persoonlijk doel per persoon per teamdoel. Een getal
   of percentage maakt een gemist aandeel eerder afleidbaar.
4. **De teambalk.** Een teller van behaalde mijlpalen die alleen optelt, zonder
   noemer. Een groeiende noemer laat de balk dalen en botst met besluit 7. Een
   percentage vraagt een vastliggend doel, en verhogen is dan een eigen besluit.
5. **Meerdere organisaties per persoon?** Ja: een zzp'er werkt voor meer
   opdrachtgevers. Dat maakt de aannames 2 tot en met 4 hierboven verplicht om op te
   lossen vóór de schermen.
6. **Verhouding organisatie, team en bestaande groepen.** Een team is een groep met
   een organisatie; bestaande groepen blijven zonder en worden nooit stil omgezet;
   een groep kan niet later aan een organisatie worden gehangen, want dat verandert
   met terugwerkende kracht wat er zichtbaar is (zoals bij A41).
7. **Kan een teamgroep `open` zijn? (Besloten, anders dan de standaard: ja.)** De
   standaard was nee, met een CHECK. De organisatie kiest bij het aanmaken (besluit
   18); aandeeldoelen blijven in elke teamgroep beschermd (besluit 21) en er is nooit
   een klassement (besluit 22).
8. **Commitments in een werkcontext. (Besloten, anders dan de standaard.)** De
   standaard was geen teamgroep als begunstigde en geen getuige via een teamgroep.
   Quinten staat het toe onder dezelfde regels als nu; zie besluit 12 en issue 9
   hierboven. Grens 1.
9. **Zichtbaarheid van het aandeel per persoon. (Besloten: niet zichtbaar.)** Een
   gekoppeld doel toont in `group_overview()` de mijlpaalvoortgang per persoon (002,
   rij 1). Collega's zien alleen de teambalk en hun eigen aandeel. **Gevolg:** een
   aandeeldoel moet in het groepsoverzicht anders getoond worden dan een gewoon
   gekoppeld doel, en dat hoort in issue 4 of 5 met een eigen toets op de naad.
10. **Leidinggevende als rol?** Niet modelleren: een rol die geen extra zicht geeft
    heeft geen functie, en minder gegevens is beter.
11. **Wie maakt een teamdoel, en wat met de streefdatum van een aandeel?** Elk
    teamlid. Het aandeel neemt bij het koppelen de datum over en verschuift daarna
    via A7 met akkoord van een teamgenoot.
12. **Teams groter dan twaalf? (Besloten, anders dan de standaard: een hoger
    plafond.)** De standaard was het plafond houden. Het getal is niet besloten en
    moet eerst gemeten worden (besluit 23).

## Juridisch en privacy

- 📏 **Uit de repo:** regio `eu-west-3`; wisrecht in `verwijder_mijn_account()`
  (0031, 0102 r.807, 0247 r.86) en het besluit
  `docs/decisions/2026-09-08-wat-een-straf-overleeft.md`; bewaartermijnen voor
  bijlagen (0251); geen automatische backups op de gratis tier; Sentry krijgt
  `group_id` als context mee (`src/modules/buddies/api.ts` r.277), en een
  organisatie-id zou er op dezelfde manier heen gaan.
- **Hoort in de spec:** een AVG-rolverdeling, een bewaartermijn voor organisatie- en
  lidmaatschapsdata en een DPIA-afweging.
- ⚠️ **Niet geverifieerd:** of de werkgever verwerkingsverantwoordelijke is, of er
  een instemmingsrecht van de ondernemingsraad geldt, en of een DPIA verplicht is.
  Dit zijn veronderstellingen en geen vaststellingen. Laat een jurist ze toetsen vóór
  verkoop aan organisaties.

## Risico's

- **Kosten van de organisatielaag tegenover het alternatief** (een buddygroep met een
  teamdoel erbij): twee extra tabellen en een rollaag; een tweede lidmaatschapsgrens
  die met de groepsleden in sync moet blijven; een extra autorisatiehelper die
  iemand ooit in een SELECT-policy zet (criterium 5 bewaakt dat); een AVG-verhouding
  met een derde partij; ruim negen issues waar het alternatief er ongeveer vier had.
  Dit is de afweging van besluit 4 in het beslisdocument.
- De aanname uit "Aannames die breken", punt 1, is een bestaand lek dat pas met
  teamdoelen zwaar wordt.
- **Schaal:** de teambalk is een telling op een geïndexeerde sleutel; boven ongeveer
  10.000 events is een cachekolom het overwegen waard. De ledenlijst moet gepagineerd
  zijn, het teamoverzicht moet één RPC zijn en geen ophaalactie per aandeel (N+1), en
  elke helper moet `(select auth.uid())` gebruiken (0122).

## Voor de engineer in november

Een aandeel is bewust geen nieuw soort doel. Zo blijven de goedkeuringsketen van
0153 en 0275, de privé-punten en de RLS van de weekdoelen ongewijzigd van toepassing.
De nieuwe risico's zitten in twee dingen: de koppelgrendel, die voorkomt dat een
vriend een werkaandeel goedkeurt, en de catalogustest die bewaakt dat de rol nooit
leesrecht geeft.

## Volgende afgebakende stap

Issue 0: Quinten beantwoordt de beslissingen en vragen hierboven, en het beslisdocument
wordt aangevuld. Issue 1 (de standaard op de eerste groep weghalen) kan daarnaast al
los landen, want het is los van de organisaties nodig.
