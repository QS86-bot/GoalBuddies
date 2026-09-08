# Een recht zonder aanroeper gaat weg

**08-09-2026.** QS8-351. Migratie `0197`.

## De klasse

`kolomrechten:controle` (QS8-349) wees achttien `tabel|soort`-paren aan met een
kolomgrant voor `authenticated` terwijl **niets** in `src/` of `app/` naar die
tabel schrijft. Elf zijn inert (`using false` / `with check false`). De overige
zeven staan open voor een rechtstreeks PostgREST-verzoek.

Dat is dezelfde klasse als `chat_messages_update` (QS8-327) en als
`points_ceiling` (QS8-352): **een recht zonder knop.** Het is nooit besloten;
het is overgebleven.

## Wat er vandaag kon

📏 Gemeten met echte JWT's tegen de lokale stack, als gewone eigenaar, in
`tests/rls/rechten-zonder-aanroeper.test.ts`. Vier PATCH-verzoeken, vier keer
**géén foutcode** (`expected undefined to be '42501'`):

| Verzoek | Wat het deed |
|---|---|
| `daily_moves.body` | een dagboekregel herschrijven |
| `daily_moves.visibility` | een privéregel achteraf naar de groep tillen |
| `daily_moves.local_date` | een Dagzet dertig dagen terugdateren |
| `goal_interviews.answers` | een interviewantwoord herschrijven |

⚠️ **De zichtbaarheid is de zwaarste van die vier.** Domeinregel 9 zegt dat de
Dagzet standaard privé is. Dat je hem achteraf naar `group` mag tillen — of
terug, nádat de groep hem gezien heeft — is nooit besloten. Het volgde uit een
grant die niemand had ingetrokken.

⚠️ **En `group_members` UPDATE liet een beheerder een uitgezet lid terugzetten.**
Aangewezen in de review op QS8-349, hier nagemeten: `guard_group_member_update()`
(0187) doet voor een **actieve beheerder** een vroege `return new` en toetst
daarna niets meer. Een beheerder zet daarmee een uitgezet lid met één PATCH terug
op `active`.

⚠️⚠️ **En dat is niet het enige, wat de security-review op deze branch aanwees en
ik daarna zelf nagemeten heb.** Ná die vroege `return new` toetst de guard
níéts meer. 📏 Als beheerder, elk in een teruggedraaide transactie:

| Handeling | Uitkomst | Spoor |
|---|---|---|
| een ánder lid tot `admin` promoveren | `admin` | **geen** |
| een mede-beheerder — óók de oprichter — naar `member` degraderen | `member` | **geen** |
| iemand anders op `paused` zetten | `paused` | **geen** |
| een uitgezet lid terug op `active` | `active` | `member_removed` (van de úitzetting) |

De `last_admin`-grendel in de guard toetst `old.user_id = auth.uid()` — alléén
jezelf. En er is geen weg terug: 📏 één treffer op `set role` in alle
functiedefinities, en die zit in de overdracht van `verlaat_groep()`. Er is geen
RPC en geen scherm dat rollen zet.

⚠️ **Wat er bij dat terugzetten níét gebeurt, en dat had ik verkeerd
opgeschreven.** Hier stond dat het lid terugkomt *"mét zijn eerder gedeelde
doel"*. 📏 Nagemeten: `verwijder_lid()` verwijdert `goal_group_links` (regel 66
van de gedeployde functie), dus na de RPC staat de teller op nul en een PATCH
terug brengt niets mee. De koppelingen overleven **alléén** als óók de uitzetting
een rechtstreekse PATCH was — en dan zijn ze nog slapend zolang het lid uit
staat, want `shares_group_with_goal()` eist `status <> 'inactive'`.

Dat verschil telt: de zin stond in het register dat de volgende lezer als gemeten
feit leest.

⚠️⚠️ **Dat gat is hier níét gedicht, en dat is de belangrijkste beslissing van dit
issue.** Zie "De meting die het besluit omkeerde" hieronder.

## Het besluit per paar

Het issue vroeg om drie mogelijke uitkomsten per rij. Vijf van de zeven zijn
ingetrokken; twee blijven, elk met een reden die een grendel noemt en geen
gewoonte.

| Paar | Aanroepers vandaag | Besluit |
|---|---|---|
| `daily_moves` UPDATE | 📏 **nul** — client doet alleen `insert`/`select`, geen enkele functie in het schema raakt de tabel aan | **intrekken** |
| `goal_interviews` UPDATE | 📏 **nul**, idem | **intrekken** |
| `group_members` INSERT | alleen definer-RPC's | **intrekken** |
| `group_members` UPDATE | in de app geen; in de dátabase drie grendels | **blijft** — QS8-356 |
| `user_blocks` INSERT | alleen `blokkeer()` | **intrekken** |
| `profiles` INSERT | alleen de trigger `handle_new_user()` | **intrekken** |
| `weekly_goals` UPDATE | alleen definer-RPC's | **blijft** — zie hieronder |

Vijf ingetrokken, twee blijven.

📏 **Elke schrijver van deze tabellen is `SECURITY DEFINER`** — gemeten met
`pg_get_functiondef()` en niet uit de migratiebestanden gelezen: `create_group`,
`join_group_with_code`, `beslis_lidmaatschapsverzoek`, `verlaat_groep`,
`verwijder_lid`, `blokkeer`, `handle_new_user`. Een `revoke` op `authenticated`
raakt geen van zeven.

## De meting die het besluit omkeerde

De eerste opzet van 0197 trok **zes** grants in, `group_members` UPDATE erbij.
De poort zei iets anders.

📏 Met die revoke erbij vielen **21 bestaande tests in zeven bestanden** om:

```
stille-weigering.test.ts       heel QS8-314
lidmaatschapsgrens.test.ts     3
vertrek.test.ts                2
veiligheid.test.ts             3
vastgelopen.test.ts            2
lidmaatschapsbesluit.test.ts   het hele bestand
```

📏 Alleen díe ene grant teruggeven maakte alle zes bestanden weer groen: **100
tests**.

⚠️⚠️ **Dat is het antwoord op de vraag en niet een lastige testsuite.** Dit recht
heeft wél een doel. 0102 en 0187 zijn er juist voor gebouwd:
`guard_group_member_update()` bestaat om precies dit pad te politiëren, en de
audittrigger schrijft een spoor *"ook bij een uitzetting buiten de RPC om"*.
Intrekken maakt die guard onbereikbaar vanaf een client en heel QS8-314
inhoudsloos — een testbestand dat groen blijft omdat het niets meer kan bereiken.

⚠️⚠️ **En hier zit de les van dit issue.** De meting die deze klasse aanwees —
"niets in `src/` of `app/` schrijft naar die tabel" — keek naar de verkeerde
helft van dit systeem. De client roept het niet aan; de **database** heeft er
drie grendels voor.

> **Een recht zonder aanroeper in de app is iets anders dan een recht zonder
> doel.**

Dat onderscheid stond in geen enkele van de achttien regels, en het is precies
het onderscheid dat je nodig hebt om deze lijst af te werken. Vijf van de zeven
hadden werkelijk geen doel; één had er drie.

Het gat dat de review aanwees is daarmee niet weg. Het is een **gat in de guard**
en niet een losse grant, en het staat als **QS8-356** met de reparatie die er wél
bij past: de vroege `return new` moet `inactive → active` weigeren, want
`beslis_lidmaatschapsverzoek()` is de weg terug die wél toestemming vraagt.

⚠️ De huidige toestand ligt vast in een test die slaagt zolang het gat er is en
rood wordt zodra het dicht gaat — met dat in zijn eigen assertiebericht.

### Waarom `weekly_goals` UPDATE blijft

De grant draagt vier kolommen — `ceiling_text`, `floor_text`, `milestone_id`,
`title` — en die zijn **inhoud en geen besluit**. 📏 `status` zit er níét in: een
client die `status: 'approved'` PATCHt krijgt `42501`, dus de puntenlogica van
`sluit_weekdoel_af()` is er niet mee te omzeilen. Dat is acceptatiecriterium 4,
en het staat als test en niet als zin.

De policy staat alleen de eigenaar toe, dus het ergste geval is dat je je eigen
week hernoemt. Een bewerkscherm is bovendien aannemelijk — `app/doel/bewerk/`
bestaat al voor doelen.

⚠️ **Dit is niet "vandaag onschadelijk" zonder grendel**, en dat verschil is
precies wat QS8-352 duur maakte. De grendel is de kolomlijst zelf, en die staat
sinds QS8-349 onder bewaking: `kolomrechten:controle` meldt het zodra er een
kolom bij een geregistreerd paar bij komt. Krijgt deze grant er ooit een kolom
bij die wél een besluit draagt, dan wordt de controle rood.

### Waarom "onbereikbaar" niet genoeg was om te laten staan

Twee van de zes waren vandaag al onbereikbaar, en allebei door iets dat geen
slot is:

* **`group_members` INSERT** — `groups_select` filtert de
  `EXISTS (select 1 from groups …)` ín de policy. Ben je nog lid, dan botst de
  primaire sleutel; ben je vertrokken, dan zie je de groep niet meer.
* **`profiles` INSERT** — 📏 een POST gaf `409 23505`, want `handle_new_user()`
  had de enige rij al gemaakt.

⚠️⚠️ **Dat zijn gevolgen en geen grendels.** Een gevolg houdt op te werken als er
elders iets verandert, en bij `group_members` is dat "elders" al benoemd:
`groups.ontdekbaar` bestaat al als kolom, en een verbrede `groups_select` laat
een vertrokken oprichter zichzelf met één POST terugzetten als `role: admin`.
Een reden die een gevolg beschrijft, is dezelfde vorm als *"dat de client ze mág
overschrijven is een oud recht en geen pad"* — de zin die QS8-352 vier weken
overeind hield.

## De ijking — vijf grendels, vijf mutaties

📏 Elk recht apart teruggegeven, de suite gedraaid, en weer ingetrokken. Vóór en
na alle mutaties 14 groen.

| Mutatie | Uitslag |
|---|---|
| `grant insert … user_blocks` | 📏 1 rood |
| `grant insert … group_members` | 📏 1 rood |
| `grant insert … profiles` | 📏 1 rood |
| `grant update … daily_moves` | 📏 3 rood |
| `grant update … goal_interviews` | 📏 1 rood |

⚠️⚠️ **De eerste ronde gaf zes keer "0 rood", en dat was geen meting.** Het
ijkscript draaide vanuit de scratchpad-map, waar het testpad niet bestaat; de
grep op `N failed` vond dan niets en het script drukte `0 failed` af. **Een lege
grep leest identiek aan een groene run.** De tweede versie drukt de hele
`Tests …`-regel af en meldt `GEEN RUN` als die ontbreekt — sindsdien is te zien
dát er gedraaid is.

## De ijking die anders van vorm leek te moeten — en dat niet hoefde

📏 In die tweede ronde bleek `group_members` INSERT als énige van de vijf **geen
enkele test rood te maken**. Mijn conclusie was dat het pad langs een tweede weg
al dicht zat en dat een clienttest daardoor niet kan zien wélk slot weigert. Die
test las het recht daarom rechtstreeks met `psql`.

⚠️⚠️ **Dat was onjuist, aangewezen door de security-review en zelf nagemeten.**
Dezelfde POST, oprichter nog lid, alleen de grant verschilt:

```
mét grant:     23505  duplicate key value violates unique constraint "group_members_pkey"
zónder grant:  42501  permission denied for table group_members
```

Twee verschillende SQLSTATE's, dus twee verschillende `error.code`'s bij
PostgREST. Een gewone clienttest discrimineert hier prima — en de kop van deze
migratie gebruikt datzelfde onderscheid al voor `profiles` (*"📏 een POST geeft
`409 23505`"*). De test is een gewone clienttest geworden.

⚠️ **De les is de vorm van de fout en niet het gemis.** *Een grendel die je niet
kunt onderscheiden en een grendel die je niet hebt gemeten, zien er identiek
uit.* Ik had het tweede en schreef het eerste op — mét een uitzonderingsregel en
een dossierrij erbij, wat de fout duurzamer maakte dan een gewone vergissing.

## Wat de security-review hierop vond

Vijf dingen, alle vijf zelf nagemeten voordat ze verwerkt zijn. Drie ervan waren
**onjuiste beweringen van mij**, en dat is de rode draad.

**1. Het migratienummer botste.** QS8-353 landde tijdens het bouwen en nam 0196.
📏 Productie staat op `0186`, dus 0196 was nergens toegepast en hernummeren is
veilig. `migratie:hernummer` deed het en noemde de veertien kale verwijzingen;
die zijn stuk voor stuk nagelopen. Precies het venster dat CLAUDE.md beschrijft:
het nummer wás vrij toen het uitgedeeld werd.

**2. De UPDATE-revoke sloot de uitkomst niet.** Zie de sectie hierboven — er lag
een tabelbrede DELETE naast, en DELETE + INSERT is dezelfde uitkomst. Dat is
regel 18 vraag 2 op deze branch zelf: de tests toetsten de PATCH-vórm terwijl de
kop de uitkomst beloofde. Twee DELETE-revokes erbij, twee tests die de rij
achteraf nákijken, en de kop zegt nu wat er open blijft.

**3. Een must-deny in `schrijfgrenzen.test.ts` wisselde ongemerkt van grendel.**
📏 Hetzelfde verzoek: `permission denied for table profiles` na de revoke,
`new row violates row-level security policy` met de grant terug — **allebei
`42501`**, allebei in `WEIGERCODES`. De test bleef dus groen terwijl hij van
slot wisselde, inclusief het `adminDb()`-dansje eromheen dat er juist was om de
pólicy te laten weigeren.

⚠️⚠️ **Dit is de derde keer op één dag dat een intrekking een bestaande test van
betekenis veranderde** — na de CHECK uit 0007 bij QS8-352 en de vloertest daar.
Het patroon is inmiddels scherp genoeg om op te schrijven als regel: **een
`revoke` verandert wélke grendel als eerste weigert, dus loop élke bestaande
must-deny op die tabel na, ook als hij groen blijft.** Groen blijven is hier het
symptoom en niet het bewijs.

**4. "Mét zijn eerder gedeelde doel" klopte niet.** Zie de correctie hierboven.
De zin stond in `GEEN_AANROEPER`, het register dat de volgende lezer als gemeten
feit leest.

**5. "Een clienttest kan hier niet discrimineren" klopte ook niet.** Zie de
sectie hierboven. Van de drie onjuiste beweringen is deze de leerzaamste, want
hij had een uitzonderingsregel en een dossierrij gekregen — de fout was
duurzamer gemaakt dan een gewone vergissing.

⚠️ En de review vond het gat achter `group_members` UPDATE **breder** dan ik het
had opgeschreven: niet alleen een uitgezet lid dat terugkomt, maar een beheerder
die een mede-beheerder degradeert, zonder spoor en zonder weg terug. QS8-356 is
daarop herschreven en van High naar Urgent gegaan, met de waarschuwing erbij om
niet de smalle versie te bouwen.

## Wat de intrekking kostte, en dat is niet gratis

⚠️⚠️ **Twee policies zijn vanaf nu niet meer vanaf een client te bereiken.**
`user_blocks_insert` (`blocker_id = auth.uid()`) en de `with check` op
`profiles`: het ontbrekende INSERT-recht weigert eerder, dus die policies zijn
dode grendels achter een dichte deur.

Dat is dezelfde vorm als de CHECK uit 0007 bij QS8-352, en om dezelfde reden hier
genoteerd in plaats van weggelaten: **een intrekking verandert wélke grendel als
eerste weigert**, en daarmee wat elke bestaande must-deny op die tabel nog
toetst. In `blokkades.test.ts` meten de twee weigertoetsen sinds 0197 het récht
en niet meer de policy. Ze staan er nog omdat de belofte ("een blokkade is van de
blokkeerder") blijft gelden; wat ze bewíjzen is smaller geworden, en dat staat er
nu bij.

⚠️ **Twee must-allows zijn daarom herschreven naar de weg die de app echt
loopt.** `blokkades.test.ts` toetste *"laat een gebruiker zijn eigen blokkade
zetten"* met een rechtstreekse INSERT, terwijl de knop `blokkeer()` aanroept — de
test bewaakte een grant die niemand gebruikte. `schrijfgrenzen.test.ts` moest
zijn eigen profiel eerst met `adminDb()` wéghalen om iets te kunnen invoegen:
**een must-allow die een toestand met beheerdersrechten moet fabriceren om te
slagen, bewaakt geen pad dat een gebruiker kan lopen.**

## Drie dingen die onderweg fout gemeten waren

* 📏 `verwijder_lid()` heeft een derde argument, `p_bevestigd`. Zonder dat geeft
  de RPC geen fout maar `ok: false` — de test liep door en mat daarna niets.
* 📏 De statusvocabulaire van `group_members` is `active | inactive | paused`.
  "Uitgezet" heet `inactive` en niet `removed`; dat stond in
  `group_members_status_valid` en niet in mijn hoofd.
* 📏 `blokkeer()` heet `blokkeer(p_user uuid)` en niet `p_user_id`. Dat gaf
  `PGRST202` — de fout die `rpc:controle` in de poort vangt en de typecheck niet.

Alle drie waren fouten in de **test** en niet in de code, en alle drie zouden ze
zonder assertie een groene test hebben opgeleverd die niets meet.

## Wat hier niet in zit

`weekly_goals` UPDATE en `group_members` UPDATE blijven, met de redenen
hierboven. Het guardgat achter die tweede staat als **QS8-356**. `groups.tz` —
waar een beheerder met één PATCH de groepsklok van domeinregel 1 verzet — staat
als **QS8-355**: dat is een `GEEN_SCHRIJFPAD`-rij en vraagt bovendien een
productbeslissing.
