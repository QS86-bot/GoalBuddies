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
| 7 — derde functie zet `app.hervat_lidmaatschap` | de teller onder de nieuwe sleutel | `sleutelzetters()` is niet leeg |
| 8 — derde functie leest `app.heropent_groep` | de teller onder de óude sleutel | idem — de belofte van 0153 staat nog |
| 9 — functie met een ongeregistreerde `app.`-sleutel | de derde tak van de teller | idem |
| 10 — sleuteltoets weer ná `auth.uid() is null` | de sleutel geldt voor élke rol | `service_role` verplaatst een lidmaatschap |

⚠️ Mutatie 3 is de leerzaamste: hij maakt zichtbaar dat de no-op-test geen
nettigheid bewaakt maar de keten van toetreden overeind houdt.

## Wat de security-ronde eraan toevoegde

Twee dingen die deze migratie zonder die ronde fout had gedaan, en allebei zijn
ze nagemeten voordat ze verwerkt werden.

**1. De tweede sleutel had geen teller — mutaties 7 t/m 9.** 0153 bouwde voor
`app.heropent_groep` `sleutelzetters()`, met deze reden erbij: *"Een nieuw
bypass-mechanisme zonder eigen teller zou de uitzondering zijn."* 0187 máákte
zo'n mechanisme en liet die teller weg. 📏 Gemeten door een derde functie te
planten die `app.hervat_lidmaatschap` zet en élke projectregel volgt: de
volledige suite bleef groen. Precies de deur die alleen dichtzit omdat er
verderop een `if` staat — de zin die in deze codebase al twee keer eerder is
opgeschreven.

⚠️ **Uitgebreid en niet gekloond, en met een derde tak erbij.** Twee losse
tellers zijn twee lijsten die uit elkaar lopen (de fout van 0032/0034), en een
teller per sleutel dekt alleen de sleutels die iemand erin heeft gezet — de
dérde sleutel die ooit bedacht wordt, zou door beide heen glippen. De teller
meldt daarom ook elke functie die een `app.`-instelling noemt die nergens
geregistreerd staat. 📏 Vandaag twee sleutels en vijf functies, gemeten aan
`pg_proc`, dus die derde tak meldt niets en is geen ruis.

**2. "Voor niemand" gold alleen voor ingelogde aanroepers — mutatie 10.** De
sleuteltoets stond ná de vroege uitgang bij `auth.uid() is null`. 📏 Gemeten:
`service_role` verplaatste een lidmaatschap naar een andere groep, HTTP 200 met
de verplaatste rij terug. Geen gat — `service_role` is vertrouwd — maar wel een
belofte die zichzelf niet waarmaakte, en 0153 koos bij `archief_blijft_archief()`
bewust de andere kant: élke rol, juist omdat definer-functies langs een rolfilter
komen. De toets staat nu vooraan.

⚠️ **En één bevinding is bewust níét verwerkt maar doorgeschoven:**
`beslis_lidmaatschapsverzoek()` doet `insert … on conflict do nothing` en schrijft
de `group_events`-rij en het `ok: true` onvoorwaardelijk. Bestaat de rij al als
`inactive`, dan staat er een acceptatie in de onveranderlijke groepsgeschiedenis
die niet gebeurd is — dezelfde klasse, andere functie, en een INSERT waar deze
trigger niet op vuurt. Dat is QS8-328, en het is uit de bron gelezen en niet
gemeten; dat laatste hoort er eerst te gebeuren.

## Wat er bewust níét is gebeurd

De policies op `group_members` zijn niet aangeraakt. Ze zijn correct; het
probleem zat tussen de trigger en wat de aanroeper terugkreeg.

En de `paused`-toestand zelf is niet gebouwd. Er is nog steeds geen knop die hem
zet. 0187 zorgt er alleen voor dat de weg terug werkt op de dag dat die knop er
komt, in plaats van stil niets te doen.

## Naschrift 07-09-2026 — dezelfde klasse op `chat_messages` (QS8-326, migratie 0188)

Het zoeken naar de **klasse** in plaats van het geval leverde
`stamp_chat_message()` op, acht terugzettingen. 📏 Gevraagd aan `pg_trigger` en
`pg_get_functiondef()`, niet aan de migratiebestanden.

⚠️⚠️ **Hier stond "één andere", en dat was onwaar.** Dezelfde vraag aan dezelfde
catalogus geeft er drie:

| tabel | trigger | pins | werpt |
|---|---|---|---|
| `chat_messages` | `stamp_chat_message` | 8 | ja, sinds 0188 |
| `groups` | `guard_group_update` | 9 | **nee** |
| `groups` | `archief_blijft_archief` | 1 | **nee** |

De twee op `groups` zijn vandaag onschadelijk, en dát is gemeten en niet
geredeneerd: `authenticated` heeft op `groups` geen UPDATE-kolomgrant op `id`,
`created_at`, `invite_code`, `invite_revoked`, `status`, `last_activity_at`,
`zichtbaarheid` of `created_by`, dus de stille tak is voor een client niet te
bereiken. **Wordt zwaarder als:** er een kolomgrant bij komt op een van die
kolommen — dan is het dezelfde bug als deze, op een tabel die de groep draagt.

Dat de eerste versie van dit naschrift "één andere" zei, is zelf de les: een
bewering met 📏 ervoor is een meting en geen indruk, en deze was met dezelfde
query in tien seconden te weerleggen.

### Het besluit: werpen

📏 Gemeten als `authenticated` afzender binnen het bewerkvenster, vóór de
wijziging:

```
alleen `body`               body verandert                      (bedoeld)
`body` + `type = 'system'`  body verandert, type blijft `text`  (half stil)
alleen `payload`            succes, en er verandert niets       (volledig stil)
```

Die derde is de zuivere vorm van QS8-314. De keuze is dus dezelfde: melden in
plaats van stil terugzetten, met de toets aan `is distinct from` per kolom zodat
een verzoek dat alleen de tekst wijzigt een gewone update blijft.

### Waarom het hier tóch anders lag dan bij `group_members`

Bij `group_members` waren álle kolommen gepind en had de niet-beheerderstak
precies één mogelijke uitkomst. Hier niet: `body` en `attachment_url` zijn
bedoeld bewerkbaar, en `chat_messages_update` staat dat toe binnen vijftien
minuten na plaatsing. De pin houdt de rij dus schrijfbaar voor wat mag.

⚠️⚠️ **En er is een uitzondering die bij `group_members` niet bestond.**
`chat_messages` heeft drie foreign keys naar `profiles` met `on delete set null`
(`sender_id`, `actor_id`, `subject_id`). Een verwijderd account laat Postgres
zélf een UPDATE doen dwars door deze trigger. 📏 Nagemeten: `delete from profiles`
zet alle drie op NULL en het bericht blijft staan — precies wat 0033 belooft.

**Een kale `is distinct from` zou daarop afgaan en het verwijderen van een account
breken.** Dat is de naad van dit issue: de trigger is correct, de foreign key is
correct, en ze raken elkaar op precies één overgang — gevuld naar NULL op die
drie kolommen. Die gaat door; élke andere verandering werpt.

De ijking staat per grendel, en dat is een correctie op de eerste versie: die
ijkte er drie van de acht en noemde dat compleet.

| Mutatie | Wat er rood werd |
|---|---|
| de hele `raise` eruit | 6 |
| `id` uit toets en pin | 1 — de identiteitstest |
| `group_id` | 1 — de groepstest |
| `type` | 1 — de halve-vorm-test |
| `system_event` | 1 — de systeemgebeurtenistest |
| `created_at` | 1 — de tijdstiptest |
| `payload` | 1 — de belofte-test |
| de FK-uitzondering eruit (kale `is distinct from`) | 1 — **de test op het verwijderde account** |
| `body` meepakken in de toets | 1 — de must-allow |

⚠️⚠️ **Twee dingen uit die ronde zijn de moeite van het opschrijven waard.**

**Een test kan groen zijn omdat een éérdere grendel hem afvangt.** De eerste versie
toetste `type` door `'system'` te sturen en `system_event` door er een waarde in te
zetten. Allebei worden al door de `with check` van `chat_messages_update` geweigerd
(`type <> 'system'`, `system_event is null`), dus die twee tests bereikten deze
trigger nooit en waren groen om de verkeerde reden. 📏 Gevonden doordat `type` uit
de toets halen niets rood maakte. `photo` staat de policy toe, en `system_event` is
voor een client sowieso onbereikbaar — die grendel is alleen langs `service_role`
te ijken.

**En een bewerking die niet landt, geeft een uitslag die niets betekent.** Eén
bewerking van het testbestand brak halverwege af op een assertie en schreef daardoor
niets weg; de bijbehorende toelichting was wél al blijven staan, zodat het bestand
een keuze beschreef die er niet in stond. Vandaar dat elke mutatie hier met een
`grep` op het bestand **en** een `pg_get_functiondef`-controle op de database
bevestigd is voordat de uitslag geteld werd.

### Wat de weging lichter maakte dan gedacht

📏 Er is **geen enkele client-update op `chat_messages`**: `chat.ts` doet een
insert en een delete en verder niets, en geen functie in het schema werkt de tabel
bij. Het bewerkvenster van vijftien minuten heeft dus vandaag geen aanroeper, en
de stille weg was alleen met een rechtstreeks PostgREST-verzoek te bereiken.
Werpen kan hier dus geen bestaande stroom breken — gemeten, niet aangenomen.

⚠️ Dat het venster geen aanroeper heeft is zelf een halve toestand, van dezelfde
soort als QS8-325. Het staat als eigen issue en is hier bewust niet meegenomen.

### De realtime-afweging

`chat_messages` staat in `supabase_realtime`. Dat was een reden om te meten en
niet om over te slaan: een `raise` in een BEFORE-trigger breekt het statement af,
dus er is geen rijwijziging en dus ook geen realtime-gebeurtenis. Zwijgen liet
juist een rij door die de client anders dacht te hebben.
