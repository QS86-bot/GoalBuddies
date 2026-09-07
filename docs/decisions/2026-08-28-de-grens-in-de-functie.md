# `te_beoordelen_voor()` is een autorisatiegrens, en die had geen inhoudelijke test

**Datum:** 28-08-2026
**Raakt:** `tests/rls/beoordelingsgrens.test.ts` (nieuw)
**Geen migratie.** De functie is niet veranderd — er is gemeten dat hij klopt, en
er is een net onder gehangen.

## De aanleiding

Bevinding 2 van de controleronde van 28-08: de meldingenjob roept
`te_beoordelen_voor()` aan als `service_role`, dus RLS kijkt daar niet mee en de
functie **ís** de grens. De enige test die erop stond — *"is niet aanroepbaar door
een gewone gebruiker"* — bewaakt de grant en niet de inhoud. De groepsjoin met de
hand losknippen liet de héle RLS-suite groen: 558 van 558.

Dat is regel 18, vraag 3, met het antwoord ja.

## Waarom de functie de grens is en niet RLS

Dat is een bewuste keuze en staat zo in `supabase/functions/notificaties/index.ts`:
`openstaande_beoordelingen()` is géén `SECURITY DEFINER` en leunt op de RLS van de
aanroeper. Onder de service-rol zou die élke openstaande voltooiing in het hele
project teruggeven, en een melding daarop is iedereen een bericht sturen over de
week van een wildvreemde.

Wat er dan overblijft is dit: elke rij die deze functie teruggeeft, zegt *deze
persoon heeft zijn week nog niet rond*. Dat is domeinregel 7 in zijn kortste vorm.

## Wat er nu onder hangt

Tien tests in `tests/rls/beoordelingsgrens.test.ts`, allemaal via `adminDb()` —
dus als `service_role`, precies de rol waaronder de job hem aanroept. De
grant-toets blijft staan waar hij stond, in `notificaties.test.ts`.

De zeven clausules van de functie zijn stuk voor stuk met de hand losgeknipt op de
lokale stack, en dit is wat er dan rood wordt:

| Clausule | Wat hij belooft | Rood |
|---|---|---|
| `join group_members` | alleen uit een groep waar je zelf in zit | **6** |
| `m.status = 'active'` | een lid dat niet actief is, hoort niets | 1 |
| `g.owner_id <> p_user_id` | nooit je eigen week op je lijstje | 1 |
| `gr.status = 'active'` | een gearchiveerde groep zwijgt | 1 |
| `w.status = 'pending'` | alleen weken die nog open staan | 2 |
| `c.superseded_by is null` | een vervangen voltooiing telt niet mee | 1 |
| `not exists (approvals)` | niet wat jíj al beoordeeld hebt | 6 |

Vóór dit bestand was elk van die zeven nul.

## Drie dingen die het schrijven van deze tests opleverde

**1. De `not exists`-clausule geldt per beoordelaar, en dat is alleen zichtbaar
bij een drempel boven één.** De eerste versie toetste hem op een groep met de
standaardregel `approval_rule = 'any'`. Daar zet de eerste goedkeuring de wéék op
`approved`, en dan valt de rij bij iedereen weg — om een ándere clausule. De test
was rood terwijl de functie klopte. Had ik hem "gerepareerd" door de assertie om
te draaien, dan stond er een test die het tegenovergestelde bewaakte van wat de
quorumregel nodig heeft. Er staan nu twee tests: één op een groep met
`approval_rule = 'quorum'` en `approval_quorum = 2`, en één die vastlegt dat de
standaardregel de week wél voor iedereen sluit.

⚠️ De regel wordt bij het indienen bevroren in `completion_approval_rules` (0111),
dus in de fixture moet hij staan vóór de voltooiing.

**2. De vertrektest dekte `m.status = 'active'` niet, en dat was niet te zien.**
`verlaat_groep()` (0102) **verwijdert** de rij in plaats van hem op `inactive` te
zetten, dus de clausule kwam er niet aan te pas: hem met de hand weghalen liet
alle acht tests groen, de vertrektest incluis. Twee correcte tests naast elkaar,
en de clausule ertussenin van niemand.

⚠️ **En de toestand is wél bereikbaar, dus dit is geen hypothetische toets.**
Nagemeten: `authenticated` heeft een kolomgrant op `group_members.status`, de
policy `group_members_update` laat `is_group_admin(group_id)` door, en
`guard_group_member_update()` (0029) pint voor een beheerder alleen `group_id` en
`user_id` vast — `status` niet. **Een beheerder kan een lid dus vandaag op
`paused` zetten.** De test zet de status daarom rechtstreeks, en dat is dezelfde
weg als die een beheerder in de app zou nemen.

**3. `c.superseded_by is null` was als enige van de zeven ongedekt** nadat de
andere zes stonden. `dien_opnieuw_in()` zet `superseded_by` op de oude rij en maakt
een nieuwe; zonder de clausule staan ze er allebei, en dan krijgt de beoordelaar
twee meldingen over dezelfde week en kan hij de versie bevestigen die de eigenaar
juist introk.

## Wat er bewust níét is gebeurd

De functie is niet aangepast. Alle zeven clausules doen wat ze beloven — dat is nu
gemeten en niet aangenomen.

Er is wél één ding dat opviel en dat een rij in het reviewdossier krijgt in plaats
van een reparatie: **de functie toetst het lidmaatschap van de beoordelaar en
nergens dat van de eigenaar.** Bij vertrek maakt dat niets uit — `verlaat_groep()`
ontkoppelt de doelen van de vertrekker uit déze groep, en dat is nagelezen in de
migratie. Maar een beheerder die een lid op `paused` zet, ontkoppelt niets: de
koppeling blijft staan en de pauzerende eigenaar zijn openstaande week blijft op
het lijstje van de anderen. Of dat fout is, hangt ervan af wat "gepauzeerd"
straks moet betekenen — vandaag is er geen knop die het doet en dus ook geen
belofte om te breken. Dat is een ontwerpvraag en geen defect.

---

# Naschrift 07-09-2026 — een geweigerde update meldt geen succes (QS8-314, migratie 0187)

Dit document ging over een grens die in een functie zit in plaats van in RLS. Er
is een tweede vraag die daaraan vastzit en die hier hoorde: **wat krijgt de
aanroeper te horen als zo'n grens hem tegenhoudt?**

## Wat er stond

`guard_group_member_update()` had twee takken. De beheerderstak pinde `group_id`
en `user_id` terug; de andere tak pinde alle vijf de kolommen terug. Allebei
gaven ze `new` daarna gewoon door. Postgres telt een BEFORE-trigger die `new`
teruggeeft als een geslaagde update, dus PostgREST antwoordde met 200 en de oude
rij. Geweigerd, en dat niet gezegd.

📏 Gemeten op de lokale stack, als gewoon lid met echte claims, via PostgREST:

```
lid zet eigen status=inactive   error: GEEN    rij terug: status=active
lid zet eigen role=admin        error: GEEN    rij terug: role=member
lid zet joined_at               error: 42501   ← kolomgrant, niet de trigger
beheerder zet lid inactive      error: GEEN    status daarna: inactive  ← moet
```

## Het besluit: werpen

Met een `hint`, zoals de `last_admin`-tak van 0102 het al deed. Drie metingen
dragen dat besluit, en de eerste is de belangrijkste omdat hij de enige
verdediging van de stille tak wegneemt.

**1. Er is geen kolom die de stille tak openhield.** QS8-314 hield die
mogelijkheid open: misschien houdt de terugzet de tabel schrijfbaar voor een
kolom die een lid wél mag zetten, zonder daar een policy voor te hoeven
schrijven. 📏 `group_members` heeft vijf kolommen. `authenticated` heeft UPDATE
op vier ervan (`group_id`, `user_id`, `role`, `status`); `joined_at` heeft geen
grant en ketst al op `42501` af. De niet-beheerderstak pinde alle vijf. Elke
kolom die je mocht bijwerken werd dus teruggezet — de tak had precies één
mogelijke uitkomst, en dat was niets doen en succes melden.

**2. Er is geen clientschrijfpad naar deze tabel.** 📏 `grep -rn
"from('group_members')" src/ app/` geeft drie treffers, alle drie `.select()`.
De tabel wordt uitsluitend bijgewerkt door `verlaat_groep()`, `verwijder_lid()`
en `join_group_with_code()`.

**3. Het heeft dit project al één keer geld gekost.** 0102 §"deze toets ontbrak"
beschrijft het: `verlaat_groep()` deed een overdracht-`update` die voor een
gewoon lid stil geneutraliseerd werd, terwijl de `group_events`-rij ernaast wél
geschreven werd en de functie `ok: true` gaf met `overgedragen_aan` erin — een
bewering over iemand anders in de onveranderlijke groepsgeschiedenis, over een
overdracht die nooit gebeurd is. En het kostte een meting: de eerste meting van
QS8-306 las "Bob verliet de groep" uit een `UPDATE 1` die niets gedaan had.

0102 schreef de regel er zelf al bij, en 0187 voert hem alleen uit:

> ⚠️ Nooit vertrouwen op het feit dat een trigger de UPDATE toevallig
> tegenhoudt. Dat is een deur die alleen dichtzit omdat er verderop een `if`
> staat.

## Twee dingen die het besluit scherper maken dan "de tak werpt"

**De belofte is die van het geheel, niet van een tak.** *Geen enkele UPDATE op
`group_members` meldt succes terwijl deze trigger de wijziging heeft weggegooid.*
Daarom werpt óók de beheerderstak, die `group_id` en `user_id` net zo stil
terugzette. Een test op "de niet-beheerderstak werpt" zou een eigenschap van een
tak bewaken, en takken verhuizen.

**De toets hangt aan de wijziging, niet aan de rol.** `is distinct from`, niet
"je bent geen beheerder". Een update die niets verandert is geen geweigerd
verzoek maar een no-op, en `UPDATE 1` is daar een eerlijk antwoord op. Dat is
geen nettigheid: `join_group_with_code()` doet een upsert met `do update set
status = case when paused then 'active' else status end`, en voor elk lid dat
niet `paused` is levert dat dezelfde waarde op. Werpt de trigger op de tak in
plaats van op de wijziging, dan valt toetreden om voor elk bestaand lid. 📏
Gemeten met mutatie 3 hieronder: precies dat gebeurt.

## Wat er onderweg bovenkwam: terugkomen was al kapot

📏 Gemeten vóór 0187: een lid op `paused` dat toetreedt met een geldige code
krijgt `{"ok": true}` en blijft op `paused` staan. De niet-beheerderstak pinde
`status` onvoorwaardelijk terug, dus de `paused`-tak van die upsert deed al
niets. Er was geen kapot onderdeel, dus niets kon er rood van worden — regel 18
vraag 5 in zijn zuiverste vorm.

⚠️ En het is dormant: 📏 `paused` wordt op `group_members` door geen enkele
functie en geen enkele regel client-code geschreven. `verlaat_groep()`
verwijdert de rij, `verwijder_lid()` zet `inactive`. De waarde staat in de CHECK
en verder nergens.

Die overgang krijgt daarom een uitzondering **met een naam** in plaats van dat
hij van een `if` verderop afhangt: `join_group_with_code()` zet
`app.hervat_lidmaatschap` op het groeps-id, en de trigger laat precies die
overgang van precies die rij door. De vorm is die van `archief_blijft_archief()`
(0153).

⚠️ **Dat neemt het bezwaar weg dat `scripts/pinuitzonderingen-controle.mjs`
tegen zo'n vlag had.** Dat script koos bewust een register boven een
sessievlag, met als reden: *"een functie die de vlag vergeet faalt stíl: zijn
wijziging wordt teruggedraaid zonder fout."* Na 0187 faalt zo'n functie
hóórbaar — de trigger werpt. De afweging die dat script voor de volgende
uitzondering aankondigde, is hiermee dus één argument lichter geworden.

## De ijking

Zes grendels, zes losse mutaties, elke keer met een `grep` die bewijst dat de
mutatie in het bestand stond vóórdat de uitslag geloofd werd. De suite is
`tests/rls/stille-weigering.test.ts` (11 tests).

| Mutatie | Wat er stukging | Wat er rood werd |
|---|---|---|
| 1 — niet-beheerderstak pint weer stil | de hoorbare weigering | de 3 lid-tests + de must-deny op de uitzondering |
| 2 — sleutel wordt weer stil teruggezet | `lidmaatschap_verplaatst` | de sleuteltest |
| 3 — weigeren op de tak i.p.v. op de wijziging | `is distinct from` | de no-op-test **en** toetreden |
| 4 — `join_group_with_code()` vergeet de instelling | de uitzondering | terugkomen uit `paused` |
| 5 — de uitzondering toetst de instelling niet | de must-deny eronder | een lid schuift zichzelf niet vrij |
| 6 — ook de beheerder wordt geweigerd | de tegenhanger (valkuil 10) | beheerder zet status + de overdracht |

⚠️ Mutatie 3 is de leerzaamste: hij maakt zichtbaar dat de no-op-test geen
nettigheid bewaakt maar de keten van toetreden overeind houdt.

## Wat er bewust níét is gebeurd

De policies op `group_members` zijn niet aangeraakt. Ze zijn correct; het
probleem zat tussen de trigger en wat de aanroeper terugkreeg.

En de `paused`-toestand zelf is niet gebouwd. Er is nog steeds geen knop die hem
zet. 0187 zorgt er alleen voor dat de weg terug werkt op de dag dat die knop er
komt, in plaats van stil niets te doen.
