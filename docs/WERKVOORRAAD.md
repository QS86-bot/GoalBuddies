# Werkvoorraad — waar het project staat en hoe je verdergaat

> **Lees dit als eerste in een nieuwe sessie.** Dit bestand is de overdracht:
> wat er staat, wat er nog moet, in welke volgorde, en waar je jezelf pijn doet
> als je het overslaat.
>
> Bijwerken is onderdeel van het werk. Sluit je een issue af, werk dan ook dit
> bestand bij — anders begint de volgende sessie met verouderde informatie.

**Laatst bijgewerkt:** 02-09-2026 (na QS8-231, QS8-232 en QS8-260, en na het
toepassen van `0139` t/m `0146` op productie; daarvóór QS8-215, QS8-144,
QS8-173 en QS8-178)

---

## 0. De stand in tien regels

Lees dit eerst; de rest is naslag. **Tien regels, en dat is de bedoeling** —
staat er iets bij dat uitleg nodig heeft, dan hoort die uitleg in §2, §3b of §7.

1. **⚠️ Op 30-08 is de app voor het eerst door een mens doorlopen, en dát
   verandert de stand.** Tot die dag zeiden deze documenten dat Fase 1 af was en
   op Quintens hand wachtte — een stand die uit de code kwam en uit de
   documenten, niet uit gebruik. De doorloop leverde veertien issues op, vier op
   Urgent. **Begin daar en niet in §4.** Alle epics staan nog steeds en
   `goalbuddies.q-projects.tech` draait (QS8-99/QS8-100); deployen is
   `npm run deploy`. ⚠️ Supabase Auth wijst nog naar het oude adres — zie §0a.
2. **Er zijn nog geen echte gebruikers**, en dat is de aanname onder elke afspraak
   hier. Migraties mogen daarom rechtstreeks op productie. **Dat vervalt op de dag
   dat de eerste gebruiker zich aanmeldt.**
   ✅ **Productie is op 02-09 bijgetrokken tot `0146`** — `0139` t/m `0146` zijn
   die dag toegepast en nagemeten tegen een lokale opbouw uit dezelfde bestanden.
   Zeven catalogi vergeleken, alle zeven gelijk. ⚠️ **`0147` t/m `0149` zijn
   daarna geland en staan er niet op**, en morgen is dat getal weer anders —
   vraag het aan de database en niet aan deze regel. Zie §2.
   ⚠️ **Wat er dan nóg openstaat vraagt Quintens machine:** drie Edge Functions
   deployen (`doelcoach`, `rollover`, `notificaties`) en `password_min_length`
   in het dashboard. Migraties alleen zijn de feature niet.
3. ✅ **Het migratieregister kent nog één nummering** en de map bouwt het schema
   aantoonbaar op. **QS8-122 is af** en QS8-119 is daarmee vrij. De bestanden
   spelen op een lege database precies het schema van productie af — negen
   vingerafdrukken, alle negen gelijk. Uitleg in §2 en in
   `docs/decisions/004-migratieregister.md`.
   ✅ **En sinds 28-08 zijn ze ook een tweede keer af te spelen** — drie regels
   in 0059 en 0094 waren dat niet en zijn gerepareerd. Wat er daarna nog omvalt
   en waarom dat zo hoort, staat in
   `docs/decisions/2026-08-28-idempotent-betekent-niet-altijd-doorlaten.md`.
4. ✅ **De RLS-suite draait sinds 24-08 lokaal** (QS8-119): `npm run rls:stack`
   en `npm run rls:lokaal`, tegen een echte PostgREST op een database uit
   `supabase/migrations/`. Geen credentials, geen productie, vijf seconden.
   **773 geslaagd, 1 overgeslagen** (02-09, na QS8-186, QS8-262 ronde 1 en QS8-264). De
   hele suite geeft met de stack **2724 geslaagd en 1 overgeslagen** over 195
   bestanden — nagemeten op de merge van #154, waar de stand 2716 stond.
   Typecheck, lint en alle 30 controlescripts groen; `npm run poort` meldt
   34 stappen.
   ⚠️ **Vier ervan meten niets zonder de credentials van het échte project**
   (`adviseur`, `functies`, `register`, `wachtwoord`), en de poort noemt dat
   apart: *"niets staat rood, maar 4 controles hebben niets gemeten"*. Dat is
   geen groene poort — draai ze bij het toepassen van een migratie.
   ✅ **En sinds 24-08 draait hij in CI**, in een eigen job zonder secrets.
5. **⚠️ De meldingenketen is compleet en heeft nog nooit iets afgeleverd.**
   `expo-notifications` staat erin (**Q-TODO B4 is af**), de webregistratie sinds
   **QS8-124**, en de PWA eromheen is getoetst (**QS8-117**). **Niemand heeft nog
   een echte melding ontvangen** — dat vraagt een VAPID-sleutelpaar in `.env`, en
   op iOS een fysiek toestel. Maken doe je het met `npm run vapid:genereer`
   (zie `docs/DEPLOY.md` §6).
6. ✅ **De score is niet meer te verzinnen.** Vier routes naar een weggepoetste
   week dicht (0043–0046) en sinds 23-08 ook de vijfde: ontkoppelen maakte missen
   gratis, gegrendeld in 0066. Zie §2.
7. **De duurste les, en hij geldt nog steeds:** zoek álle routes naar een effect,
   niet de route die je net gevonden hebt. Eén gat kostte vier migraties, en 0066
   was dezelfde vorm nog een keer. Zie §7.
8. **Werk landt sinds 23-08 via een PR**, met een merge-commit en niet met een
   squash, en met **één branch per Linear-issue** — de naam die Linear voorstelt,
   anders koppelt hij niets. Vastgelegd in `CLAUDE.md`. Zie §3b.
9. **Wat op Quinten wacht staat sinds 24-08 op het bord, niet meer alleen in
   `docs/Q-TODO.docx`.** Alles met status **Todo** in Linear is van hem:
   QS8-126 (de repo staat publiek), QS8-131 (21 commits buiten `main`, urgent),
   QS8-127 (A37), QS8-128 (A41+A42+A44), QS8-129 (A43), QS8-130 (A46) en
   QS8-122. ⚠️ **B4 staat niet meer in die lijst** — `expo-notifications` staat
   sinds PR #9 op `main`; dat besluit wachtte op een merge en niet op een
   antwoord, en die merge is er. Q-TODO blijft de onderbouwing dragen; de status staat
   in Linear.
10. **⚠️ De volgorde loopt sinds 30-08 langs de doorloopbevindingen en niet meer
    langs §4.** QS8-195 en QS8-211 zijn af (31-08); daarna QS8-200/QS8-201. Wat
    van Fase 1 overblijft vraagt nog steeds Quintens hand en geen code: een
    browser met VAPID-sleutels (QS8-124), een iPhone (QS8-117), het
    Supabase-dashboard (QS8-25, QS8-141) en de twee deploys (QS8-139, QS8-140).
    **Het bord klopt beter dan deze documenten** — kijk dus eerst in Linear en
    dan pas hier.

---

## 1. Waar alles staat

| Wat | Waar |
|---|---|
| Code | GitHub `QS86-bot/GoalBuddies`, hoofdbranch `main` |
| Werkvoorraad | Linear, project **GoalBuddies**, team `QS86-bot Linear`, prefix `QS8` |
| Database | Supabase `goalbuddies`, ref `wehgocadxehottiiyvsc`, regio `eu-west-3`, gratis tier |
| Hosting | Hostinger, account `u349450154`, domein `q-projects.tech` |
| Doeladres | `goalbuddies.q-projects.tech` — live sinds 24-08 (QS8-99/QS8-100), deployen met `npm run deploy` |
| Design-referentie | `tracker.q-projects.tech` — de Status Tracker, zelfde stelsel |

**Linear is de bron van waarheid voor wát er gebouwd moet worden.** Dit bestand
zegt alleen in welke volgorde en waar de valkuilen zitten.

---

## 2. Wat er nu draait

**Database — af, en nu ook getest.** 34 tabellen.

<!-- STAND:BEGIN — gegenereerd door `npm run stand` -->
Migraties `0001` t/m `0149` staan in de map: **152 bestanden**,
waarvan 3 met een letter-achtervoegsel (`0039a`, `0041a`, `0052a`).
De nummering is aaneengesloten.
<!-- STAND:EINDE -->

⚠️ **Dat blok is gegenereerd; met de hand bijwerken heeft geen zin.** Het was tot
28-08 proza, en gaf die dag vier PR's achter elkaar een merge-conflict op dezelfde
regel — twee keer met een verkeerd getal als uitkomst. Draai `npm run stand`;
`stand:controle` wordt rood zodra het achterloopt en draait mee in de poort.

✅ **Productie is op 02-09 bijgetrokken tot `0146`, en liep dezelfde dag weer
achter.** Op het moment van meten telde het register **149 rijen van `0001` tot
`0146`**, gelijk aan de 149 bestanden die er toen lagen, met nul tijdstempels en
geen dubbele versies. `0139` t/m `0146` zijn die dag toegepast, in volgorde, met
`execute_sql` en een handmatige rij in het register — want `apply_migration`
deelt een tijdstempel uit en dat breekt de `0001`-vorm.

⚠️ **`0147` t/m `0149` zijn ná die meting geland en staan er dus níet op** (QS8-186,
QS8-262 en QS8-264). Dat is geen fout maar de normale gang: de map loopt vooruit
zodra er een PR landt. **Noem daarom nooit "de map en productie lopen gelijk" als
stand — vraag het aan de database.** Dit blok zei dat een uur lang, en het was
achterhaald voordat de PR die het schreef geland was.

⚠️ **Er is die dag géén `pg_dump` gemaakt en dat is een afwijking van de regel.**
De cloudcontainer heeft geen `SUPABASE_DB_URL` en geen databasewachtwoord, dus
`npm run db:dump` kán daar niet. Wat er wél ligt is een JSON-uitdraai van de 24
rijen die er stonden, in een scratchpad die met de sessie verdwijnt. Voor déze
acht migraties woog dat licht — het zijn nieuwe kolommen, nieuwe tabellen en
nieuwe functies op een vrijwel lege database, geen enkele `drop` op gevulde data
— maar het is een aanname en geen backup. **Een volgende ronde hoort van
Quintens machine te komen, of de container krijgt een dump-pad.**

✅ **Nagemeten in plaats van aangenomen: zeven catalogi vergeleken** tussen
productie en een lokale database die uit dezelfde bestanden is opgebouwd.
Kolommen, constraints, policies, indexen, grants en views komen byte-voor-byte
overeen. Functies: 164 aan beide kanten (op de twee testshims na), en met
commentaar en witruimte weggenormaliseerd is de sómhash gelijk —
`31bec0e63aac4f1f812bda6cc3318908`. **Ruw** verschillen 38 functies, en dat is
QS8-220: op productie zit het commentaar er in de oudere functies uit, omdat een
eerdere sessie ze met een ingekorte body heeft toegepast. Alle 38 zijn van vóór
`0139`; alles wat op 02-09 is toegepast, komt ruw óók al overeen.

De ronde daarvóór was 28-08. `0119` t/m `0121` van de parallelle sessie
zijn toen alsnog toegepast, in die volgorde, en daarna is de
`chain_links_select` uit `0122` opnieuw afgespeeld — want `0120` schrijft diezelfde
policy met een kale `auth.uid()`. Tussen die twee stappen stond
`initplan_bewaking()` rood op precies één rij; dat is de bewaking die zijn werk
deed.

⚠️ **Wat die volgorde ons leerde staat in
`docs/decisions/2026-08-28-auth-uid-een-keer-per-query.md`:** twee sessies die op
één dag nummers uitdelen, leveren niet alleen een botsend nummer op maar ook een
migratie die het werk van de ander stil terugzet. Een migratienummer behoort aan
`main` en niet aan je branch — óók, of juist, als je hem al hebt toegepast.

✅ **`0121` verandert een handtekening en dat is nagemeten**: `weekafsluiting_reacties`
staat er één keer, met de cursorvorm (`…, integer, timestamptz, uuid`). De
offsetversie is weg en staat er niet naast.

⚠️ **En hier zit de valkuil van vandaag in.** `0122` (de InitPlan-vorm) en `0123`
(de lengtegrenzen) stonden eerst als `0119` en `0120` in de map en waren onder
díé nummers al op productie toegepast, terwijl `main` diezelfde nummers aan ander
werk gaf. Twee migraties, één nummer, twee betekenissen. **De bestanden zijn twee
keer hernummerd en het register is elke keer meeverzet**; nagemeten dat er geen
dubbele versies staan. Zie de werkafspraak: *een migratienummer behoort aan
`main` en niet aan je branch* — en dat geldt óók, of juist, als je hem al hebt
toegepast.

⚠️ **`0111` t/m `0113`** — de goedkeuringsdrempel, de
seizoensrecap en de badges. Ze zijn op 28-08 met de hand toegepast en het
register is meeverzet toen ze van `0107`–`0109` naar `0111`–`0113` opschoven,
omdat een parallelle sessie die nummers eerder claimde. Zie
`docs/decisions/2026-08-28-idempotent-betekent-niet-altijd-doorlaten.md` voor wat
een migratienummer wel en niet vastlegt.

⚠️ **`0115`, `0116` en `0117`** — die groep dicht een lek dat live was: `seizoensrecap_cijfers()` was voor elke ingelogde gebruiker aanroepbaar, het venster van De Ketting stond op acht dagen bij een periode van zeven, en het pushadres van een webabonnement werd niet gecontroleerd. Zie `docs/decisions/2026-08-28-revoke-from-public-is-niet-van-iedereen.md` en
`docs/decisions/2026-08-28-het-kettingvenster.md`.

✅ **`0107` t/m `0110` en `0114`** — de vijf uit deze sessie. Toegepast via de MCP-tool, daarna uitgelijnd
met `lijn_migratieregister_uit()` uit 0081 en nagemeten in plaats van aangenomen.

⚠️ **Vooraf gemeten dat uit-volgorde toepassen veilig was.** Productie had
0111 t/m 0117 al; die raken geen enkel object dat deze vijf herschrijven — 0112
en 0115 noemen `ketting_stand()` alleen in commentaar. Alle negen gewijzigde
functies zijn daarna byte-identiek aan de repo bevonden (`md5(prosrc)`).

✅ **De volgorde waarin `0120` en `0122` moesten landen was niet vrij, en is
aangehouden.** `0122` bevat één policy die `0120` óók schrijft —
`chain_links_select` — en de gegenereerde versie zou de klok van de groep hebben
teruggezet naar `current_date`. Toegepast als `0119`, `0120`, `0121`, en daarna de
`chain_links_select` uit `0122` opnieuw. Nagemeten: die policy draagt nu
`groepsdatum(group_id) - 6` én `( SELECT auth.uid() )`.

⚠️ **Bewaar dit als vorm en niet als geval.** Een migratie die policies
hérschrijft, is gegenereerd uit een moment — en elke migratie die ná dat moment op
`main` landt en dezelfde policy raakt, wordt er stil door teruggezet. De bewaking
ziet dat niet: die kijkt naar de vórm en niet naar de betekenis.

⚠️ **`0125` vervangt `offset` door een cursor in `openstaande_beoordelingen()`.**
Goedkeuren haalde de rij uit de lijst en schoof daarmee de volgende pagina onder
je handen door — gemeten: één van vier beoordelingen werd overgeslagen. De
handtekening is veranderd, dus de gedeployde bundel roept hem tot de volgende
`npm run deploy` verkeerd aan. Zie de rij in `docs/ENGINEER-REVIEW.md`.

⚠️ **`0124` haalt één dode functie weg.** `weekpas_stand(uuid)` was sinds 0041 een
wrapper zonder eigen logica, bewaard voor een aanroeper die niet meer bestaat. De
vier tests eromheen zijn verhuisd naar `weekpas_standen()` — de weg die de app
écht neemt. Zie
`docs/decisions/2026-08-28-de-ketencontrole-ziet-commentaar-en-drops.md`.

⚠️ **`0123` begrenst veertien tekstkolommen en de AI-invoer** en staat ook op
productie. Vóór het toepassen geteld of een bestaande rij zou omvallen: nul, voor
alle veertien én voor `ai_jobs.input`. Zie
`docs/decisions/2026-08-28-tekst-zonder-grens.md`.

⚠️ **`0122` herschrijft 49 policies naar de InitPlan-vorm** en staat ook op
productie. Dat er verder niets veranderde is niet aangenomen maar nagemeten met
een `md5()` over álle 73 policies: productie ná is byte voor byte gelijk aan wat
het migratiebestand lokaal oplevert. Zie
`docs/decisions/2026-08-28-auth-uid-een-keer-per-query.md`.

⚠️ **`0118` is nieuw op productie en vraagt nog één handeling van jou.** Hij trekt
76 schrijfrechten in die geen enkele policy achter zich hebben, en één daarvan
hield de knop "koppel doel aan groep" overeind: de datalaag deed een `upsert`, en
`on conflict do update` eist het UPDATE-tabelrecht al bij het plannen. De
reparatie (`ignoreDuplicates`) zit in de bundel, niet in de database. **Tot `npm
run deploy` gedraaid heeft, geeft koppelen op `goalbuddies.q-projects.tech`
`42501`.** Zie `docs/decisions/2026-08-28-een-grant-die-niets-geeft.md`.

⚠️ **Eén fout onderweg, en die is met meten gevonden.** Bij het overzetten van
0114 werden de `\uXXXX`-reeksen in `tip_bevat_emoji()` als échte tekens
overgenomen — precies de valkuil waar die migratie zelf voor waarschuwt. Het
gedrag klopte op alle zes de controlegevallen, maar `prosrc` week af van de repo.
Hersteld door de body met `chr(92)` op te bouwen; `md5` en lengte komen nu exact
overeen met de lokale stack.

⚠️ **De twee toevoegingen in `src/lib/database.types.ts` zijn geen
hand-toevoegingen meer.** `goals.losgekoppeld_op` en
`vastgelopen_goedkeuringen()` bestaan nu op het project, dus `npm run types:db`
levert ze voortaan zelf op. De volgorde-waarschuwing die hier stond, is
vervallen.

⚠️ **Er staan er wél weer een paar, en dit keer met een bekende houdbaarheid.**
Met de hand in `src/lib/database.types.ts` gezet, want `types:db` leest het
echte project en daar staan deze migraties nog niet op:

| Handtekening | Uit |
| -- | -- |
| `groepsdatum()` | 0120 |
| de nieuwe argumenten van `weekafsluiting_reacties()` | 0121 |
| `eigenaarsdatum(uid uuid)` | 0134 |
| `keur_vastgelopen_goedkeuringen_goed(p_termijn_dagen integer)` | 0135 |

Zodra ze zijn toegepast, levert de generator ze zelf en zijn het geen
toevoegingen meer. **Draai `npm run types:db` na het toepassen** — anders staan
er handmatige regels die niemand meer als handmatig herkent.

⚠️ **En dat is in deze container niet te doen**, wat de reden is dat het hier
staat en niet gedaan is: `types:db` heeft én een productietoken én een draaiende
Docker-daemon nodig, óók met `--db-url`. Dit is dus een regel voor §6.

⚠️ **Wat nog wél moet: de Edge Functions opnieuw deployen.** De
`scrubMessage()`-reparatie van 28-08 zit in `supabase/functions/_shared/`, maar
een gedeployde bundel verandert daar niet van. Doe dat met
`npx supabase functions deploy` vanaf de machine met `SUPABASE_ACCESS_TOKEN` —
niet met de hand overtypen: acht bestanden in die payload dragen backslashes,
`scrub.ts` alleen al zes regels regex, en `edge:gedeployd` vergelijkt de
modulebóóm en niet de inhoud.

✅ **De map en het project lopen weer gelijk, nagemeten op 27-08-2026.** Eerder
die dag stond hier dat `0102` en `0103` wél gemerged maar níét toegepast waren;
dat klopte op het moment van schrijven en klopt niet meer. Opnieuw gemeten met
een objectprobe én tegen het register: `milestone_tips`, `verlaat_groep()` en
`tegenvaller_woorden()` bestaan, `ai_jobs_kind_valid` draagt `milestone_tip`,
`pg_tables` telt 31, en `schema_migrations` kent `0102`, `0103` én `0104`.

⚠️ **Laat zo'n regel niet staan als hij verlopen is.** Wie hem las, ging op zoek
naar een gat dat dicht is — en erger: hij zegt dat de lokale stack een schema
bouwt dat productie niet heeft, en dus dat de RLS-suite iets anders toetst dan er
draait. Dat is precies het soort waarschuwing dat je niet negeert. **Een
tijdelijke afwijking hoort een datum en een meting te dragen, en die meting hoort
herhaald te worden voordat iemand erop handelt.** `npm run register:controle`
zegt dit met credentials in één regel; dat is goedkoper dan het document
geloven.

⚠️ **En de tweede helft van die les: geen enkele controle in CI kón dit zien.**
`migraties:controle` leest alleen de map, en `register:controle` — de énige die
de repo naast het échte project legt — heeft credentials nodig die niet bij een
runner horen. Het kwam boven doordat een PR op een dubbel migratienummer
struikelde, en dat is toeval. **Draai `register:controle` na élke migratie**;
sinds 27-08 doet `npm run db:push` dat zelf, streng.

Het datamodel is vastgesteld in `docs/decisions/001-datamodel.md`; dat document is leidend, niet de losse SQL.
De 24e tabel is `week_review_replies` (EPIC 7, migratie 0026); daarna kwamen
`approval_withdrawals` (0030), `deadline_requests` (0032), `week_pass_events`
(0039), `goal_risk` (0050), `push_tokens` en `notifications_sent` (0053),
`group_events` (0076) en `milestone_tips` (0103) erbij.

⚠️ Hier stond tot 24-08-2026 "26 tabellen", en dat klopte al vier migraties niet
meer — geteld toen `week_review_replies` de laatste was en daarna nooit meer
nagemeten. Een getal in lopende tekst dat niemand hertelt, is dezelfde soort
aanname als een test die nooit rood is geweest. Het echte aantal komt uit
`select count(*) from pg_tables where schemaname = 'public'`.

⚠️ **`supabase/migrations/` is een verslag en geen bron, in béíde richtingen.**
De geschiedenis kent twee onverenigbare nummeringen: 38 genummerd
(`0001`–`0038`) en 28 met een tijdstempel — alles wat sinds 19-08 via de MCP-tool
is toegepast, want die kiest zelf een versie ongeacht hoe het bestand heet. Een
bestandsnaam `0039_….sql` komt dus nooit overeen met een versie in
`schema_migrations`. Daarbovenop ontbreken **`0057` t/m `0061`** als bestand:
`main` springt van `0056` naar `0062`.

Waarom dat meer is dan slordig: zowel een lokale stack als een tweede
cloudproject werkt door de migraties opnieuw af te spelen op een lege database.
Een schema dat daaruit komt is niet gelijk aan productie, en dan toetst de
RLS-suite een verzinsel — groen zonder iets te bewijzen, wat erger is dan tegen
productie draaien.

✅ **Opgelost op 24-08 (QS8-122).** Het register draagt nu één nummering, en
`npm run schema:opbouwen` speelt de map af op een lege database tot exact het
schema van productie. `npm run register:controle` bewaakt dat repo en project
gelijk blijven lopen. Onderbouwing en de twee valkuilen die daarbij boven kwamen
staan in `docs/decisions/004-migratieregister.md`.

### 2a. Wat er van de verdwaalde branch geleerd is — 24-08-2026

Bij het oppakken van de laatste map van QS8-115 bleek `src/shared/i18n/` niet te
bestaan, terwijl dat issue drie afgeronde slices beschrijft. Ze bestonden wel, op
een branch die 21 commits vóór en 44 achter `main` liep en waar geen PR voor open
stond: de hele i18n-infrastructuur, de deploy naar het echte adres,
`expo-notifications` en de migraties `0057` t/m `0061`.

✅ **Geland op 24-08 als PR #9** (QS8-131). Het gat in de migratienummering is
daarmee dicht en `npm run migraties:controle` is groen.

⚠️ **Wat ervan blijft staan is de les.** Dit was QS8-125 een niveau hoger: dat
issue gaat over documenten die uiteenlopen, hier zei het bord Done, had de
database de migraties, en stond de code op een tak. Drie bronnen, drie
antwoorden. **Werk dat niet landt, bestaat voor de volgende sessie niet** — en
het is niet zichtbaar in een document, want het document staat op diezelfde tak.
Kijk bij het beginnen van een sessie naar de branchtabel in
`docs/VOLGENDE-SESSIE.md` en niet alleen naar `main`.

✅ **QS8-115 is daarmee ook af** (In Review, 24-08). Er staat geen Nederlandse
UI-tekst meer hard in `src/` en `app/`; `npm run tekst:controle` meldt nul en
draait mee in `/audit`.

⚠️ **Die nul was op 24-08 een halve waarheid, en dat is dezelfde dag rechtgezet.**
De controle stond groen terwijl er in één scherm zeven onvertaalde zinnen zaten:
een prop met één woord, een prop over meerdere regels, twee tekstsleutels in een
objectliteraal, een zin in `setMelding()` en JSX-tekst met een accolade erin. In
totaal 23 door de hele app, waaronder twee `accessibilityLabel`s die een
schermlezer voorleest. Het probleem was niet de heuristiek maar dat er geen
manier was om te zien wat de controle wél vindt; sinds
`tests/scripts/tekst-controle.test.ts` staat elke vorm apart onder test — acht
die hij moet vinden, zes die hij met rust moet laten.

De taalkeuze op het profielscherm bestaat sinds vandaag — tot dan kon niemand
`profiles.locale` vullen en volgde de app alleen je telefoon. Eén criterium
blijft open en dat vraagt een mens: de app in het Engels doorlopen.

⚠️ **De RLS-suite (QS8-98) vond zeven gaten en die zijn alle zeven gedicht** in
migraties 0005 t/m 0011. Twee waren ernstig: elk groepslid kon zichzelf beheerder
maken, en elk groepslid kon een vals systeembericht plaatsen. De rode draad: RLS
kan geen kolommen beperken — overal waar de eis is "deze kolom mag je niet
veranderen" is een trigger nodig. Zie `docs/ENGINEER-REVIEW.md`.

⚠️ **De reviewronde van EPIC 5 vond het zwaarste gat tot nu toe.**
`weekly_goals_select` gaf elke groepsgenoot de héle rij van een gekoppeld doel,
inclusief de kolom `status` — en die kan letterlijk `'missed'` zijn. Eén `GET`
op `/rest/v1/weekly_goals` leverde de volledige lijst gemiste weken van een
ander op, met datum. Het beslisdocument belooft dat dat niet kan "ook niet door
slim te bevragen"; er was geen slimheid voor nodig. **De schermen deden het
goed, de database niet** — en EPIC 5 bouwt precies de knop die het bereikbaar
maakt. Gedicht in 0019 en 0020; `best_streak` ging in dezelfde ronde mee, want
`best_streak > current_streak` verraadt een verbroken reeks.

⚠️ **EPIC 5 vond er nog een, en dat is de leerzaamste tot nu toe.** De rate
limiting op uitnodigingscodes werkte helemaal niet. `join_group_with_code`
schreef eerst een rij in `invite_events` en zocht daarna pas de code op, juist om
mislukte pogingen te tellen — maar PostgREST draait elke RPC in zijn eigen
transactie, en een `raise exception` rolt die terug inclusief de zojuist
geschreven poging. De teller bleef dus op nul. Gedicht in 0017 door een resultaat
terug te geven in plaats van te gooien. **De regel die eruit volgt: in een
SECURITY DEFINER-RPC overleeft niets een `raise exception`.**

**Edge Functions — alle drie gelijk aan `main`, nagemeten op 27-08-2026.**

| Functie | Versie | Modules | Laatst gewijzigd door |
|---|---|---|---|
| `doelcoach` | 14 | 5 | de `job.kind`-dispatch (QS8-41) en de tip-tak (QS8-137) |
| `rollover` | 17 | 7 | `edge-rapport.ts` |
| `notificaties` | 12 | 10 | `edge-rapport.ts` en twee toevoegingen in `regels.ts` |

`verify_jwt` staat op alle drie aan. De gedéployde bundels zijn byte-voor-byte
tegen de repo gelegd, bestand voor bestand — niet alleen op modulenaam, want dat
is precies de vergelijking die op 27-08 een afwijking van twee commits miste.

⚠️ **Van `rollover` week één van de zeven modules af en van `notificaties` twee
van de tien.** De versienummers zeggen dus meer dan er werkelijk veranderde. Wat
er in beide gevallen bij kwam is de nieuwe `edge-rapport.ts` — en **die doet
vandaag niets**: zonder `SENTRY_DSN` in de Edge-omgeving geeft `meldEdgeFout()`
meteen `'geen-dsn'` terug en gaat er geen enkele netwerkaanroep uit. Het telt pas
op de dag dat die variabele gezet wordt.

⚠️ **Geen van de drie is met een echte aanroep geproefd.** `ACTIVE` met de juiste
bron is iets anders dan een werkende job. Wat daarvoor nodig is en waarom het
niet kon, staat in `docs/VOLGENDE-SESSIE.md` bij punt 0.

**Code — de app staat, met doelen, weekdoelen en groepen.**
- Expo SDK 57, React 19.2, RN 0.86, TypeScript 6 strict (plus extra strengheid)
- `src/shared/time` — de twee klokken plus `now()`
- `src/shared/theme` — navy-stelsel, drie themastanden
- `src/shared/ui` — 17 componenten, met de domeinregels erin gebakken
- `src/modules/auth` — sessie, profiel, Zod-schema's
- `src/modules/goals` — doelen, weekdoelen, cyclus
- `src/modules/buddies` — groepen, uitnodigingen, groepsklok, overzicht
- `src/modules/completions` — afronden, de Dagzet, peer-goedkeuring
- `src/modules/buddies/chat*` en `weekafsluiting*` — de chat en het huddleritueel
- `tests/rls` — de tests die de policies écht uitvoeren, met echte JWT's; de
  harnas tekent ze sinds 23-08 zelf en logt niet meer in
- `npm run typecheck` en `lint` staan groen; het aantal tests staat in §0 en
  niet hier — twee tellers die elkaar tegenspreken zijn precies waarom die regel
  bestaat. `tests/rls` telt 34 bestanden; 32 daarvan slaan zonder credentials
  over (zie §3b)

**Wat werkt in de app:** aanmelden met e-mail, de onboarding, doelen aanmaken en
bijhouden, weekdoelen met vloer en plafond, en sinds EPIC 5 de hele
groepskant — een groep aanmaken met deelbare link, toetreden met een code, het
groepsoverzicht, je doel aan een groep koppelen, de huddledag instellen en de
gastvrije uitnodigingspagina die ook zonder account werkt. Sinds EPIC 7 ook de
groepschat (realtime, met een cache voor een slechte verbinding), automatische
systeemberichten bij positieve gebeurtenissen, en de weekafsluiting: drie vragen
op de huddledag met alle antwoorden op één kaart en reacties eronder. Sinds
EPIC 8 staat **De Ketting** bovenaan het groepsscherm: de gedeelde teller van
hoeveel leden deze periode hun cyclus afsloten.

**Sinds 27-08 daar bovenop, uit de eerste drie Fase 2-issues:**
- **Een groep verlaten** (QS8-57, migratie `0100`) — via `verlaat_groep()` en
  niet via een DELETE, want de laatste-beheerder-eis gaat over de rijen die
  óverblijven en dat kan RLS niet zien. `group_members_delete` staat daarom op
  `using (false)`. Vertrek raakt precies één groep: doelen, weekdoelen en
  voltooiingen in je ándere groepen blijven staan.
- **Weekstappen per mijlpaal laten genereren** (QS8-41) — een tweede
  `ai_jobs.kind` (`weekly_goals`) waarmee de Doelcoach per mijlpaal weekdoelen
  mét vloer en plafond voorstelt. De zeef weigert een voorstel zonder vloer of
  met vloer gelijk aan plafond, want dan is domeinregel 8 een lege huls.
- **Een Doelcoach-tip per mijlpaal** (QS8-137, migratie `0103`) — één tip per
  mijlpaal in `milestone_tips`, alleen leesbaar voor de eigenaar, met vier
  vaste terugvallen als er geen gegenereerde tip is. Een trigger weigert een tip
  die tegenslag benoemt; die woordenlijst staat in
  `tegenvaller_woorden()` én in `src/shared/ui/tips.ts` en wordt door één
  gedeeld ijkcorpus door beide kanten heen getoetst.

✅ **`chain_links` wordt sinds 19-08 gevuld** (QS8-80, migraties 0036 en 0037).
Twee routes leggen een schakel: een weekafsluiting via de trigger
`ketting_uit_weekafsluiting()`, en een goedgekeurd weekdoel via
`ketting_schakel()`. Daarmee gaat ook het bolletje "deze week al afgesloten" op
het groepsoverzicht eindelijk aan — `group_overview()` las die tabel al.

✅ **Het systeembericht bij een ketting-mijlpaal staat er sinds 24-08**
(migratie 0070), en daarmee is QS8-70 compleet: acht van de acht gebeurtenissen.
Een mijlpaal is een **rond cumulatief aantal schakels van de groep** — 10, 25,
50, 100, 250, 500, 1000. Waarom die vorm en niet "voltallig deze week" of "N
weken op rij": die twee zijn conditioneel, dus het uitblijven van het bericht
vertelt de groep dat iemand ontbrak. De onderbouwing staat in de kop van 0070 en
in beslisdocument 002 §2, oppervlak 9.

### Wat er in de rondes van 20 t/m 23 augustus bij is gekomen

Stond eerder allemaal in §0; verplaatst omdat §0 tien regels hoort te zijn.

✅ **De score is niet meer te verzinnen.** Vier routes naar een weggepoetste week
zijn dicht (0043–0046, A35/A36/A39/A40): je eigen weekdoel op `approved` zetten,
een gemiste week verwijderen, hem doorschuiven (`carried` breekt de reeks nu,
tenzij er een weekpas op staat), en de `todo`-rij wissen vóór de rollover —
verwijderen is nu **afsluiten**, de rij blijft als `cancelled` staan en de
rollover veegt hem bij het verstrijken van de cyclus mee naar `missed`.

✅ **En op 23-08 de vijfde: ontkoppelen maakte missen gratis** (migratie 0066).
`kan_beoordeeld_worden()` uit 0064 keek of het doel op het moment van boeken aan
een groep hing — en de eigenaar mag `goal_group_links` onvoorwaardelijk
verwijderen én terugzetten, allebei een knop in de app. Ontkoppel op vrijdag,
laat de rollover langsgaan, koppel maandag terug: geen minpunt, elke slechte
week, en de score kon alleen nog omhoog. 0066 legt het antwoord vast op
`weekly_goals.beoordeelbaar` als grendel die maar één kant op beweegt, plus een
tweede trigger die verlagen door de eigenaar blokkeert — zonder die tweede is de
reparatie een decoratie, want de kolom is voor de eigenaar bij te werken.

**Herkomst, en dat is het leerzame deel:** dezelfde handeling stond sinds 17-08
in `ENGINEER-REVIEW.md`, terecht als *Laag* weggelegd omdat het zelfbedrog was en
geen autorisatiegrens. Vier dagen later stond er een feature bovenop die er wél
een scoregat van maakte. Hoe je dat voortaan ziet aankomen is **QS8-123**.

✅ **De RLS-suite bewijst weer iets** (QS8-116). Hij logde per gebruiker in, liep
tegen een limiet aan, sloeg zichzelf over en was groen zonder iets te bewijzen.
De harnas tekent de tokens nu zelf (HS256) en logt niet meer in. Dat mag omdat de
migraties `auth.uid()` 264 keer gebruiken en `auth.jwt()`, `auth.role()`,
`auth.email()` en `request.jwt.claims` nul keer — nagemeten, niet aangenomen.
`tests/rls/jwt.test.ts` draait daardoor zonder credentials mee in CI.

✅ **Verder afgerond:** QS8-106 (de vier datalaagfuncties zonder scherm),
QS8-112 (een weekdoel aanmaken kon helemaal niet — `maakWeekdoel()` werd door
geen enkel scherm aangeroepen terwijl QS8-43 en QS8-44 op Done stonden), QS8-82
(adempauze), QS8-39 (mijlpalen beheren), QS8-76 (feestelijk moment), QS8-85
(commitments aantoonbaar informeel), QS8-118 (`src/shared/tekst`, codepunten als
eenheid overal — dat is wat `char_length` telt), en QS8-120 en QS8-121
(Zod-schema's los van de Supabase-client).

Bij die laatste twee bleken de CHECK op `commitments.body` volledig te ontbreken
(0063) en `commitments.image_url` server-side ongevalideerd (0068): `z.string()
.url()` laat in zod 4 `javascript:`, `data:` en `file:` gewoon door — nagemeten
met 4.4.3. Een commitment is per domeinregel 11 leesbaar voor de begunstigde
groep zodra de straf verschuldigd wordt.

⚠️ **En 0067 repareerde dat 0062 webregistratie onmogelijk had gemaakt.** 0062
zette een CHECK op `push_tokens` die websleutels verplicht stelt en wijzigde
`registreer_push_token()` niet mee; elke aanroep met `platform = 'web'` liep op
een ongevangen 23514 stuk. De tabel was leeg, dus de migratie slaagde en er ging
niets zichtbaar stuk — web push was dood zodra hij aangezet werd.

## 3. Wat een nieuwe sessie als eerste doet

1. Lees `CLAUDE.md`. Dat is de grondwet en die wint van alles hieronder.
2. Lees dit bestand.
3. Lees `docs/decisions/001-datamodel.md` vóór je iets met de database doet.
4. Haal de openstaande issues op uit Linear, project GoalBuddies.
5. Controleer of `.env` bestaat en gevuld is (zie §6).
6. Draai `npm install && npm run typecheck && npm test` om te zien dat je op een
   werkende basis begint.

---

## 3b. Het merge-ritueel — zes stappen, en de laatste wordt vergeten

**De eenheid is één Linear-issue.** Eén branch per issue, met de naam die Linear
voorstelt, en werk dat meerdere issues raakt wordt meerdere branches en meerdere
PR's. Vastgelegd in `CLAUDE.md` op 23-08-2026; landen gebeurt via een PR met een
merge-commit, niet met een squash.

Vóór élke merge naar `main`:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

En dan de twee stappen die geen enkele machine voor je doet:

5. **Draai de reviewagents die bij deze wijziging horen** — naar risico en niet
   naar schema, sinds 20-08-2026. `security-reviewer` **direct** bij alles wat
   auth, RLS, punten, goedkeuring, commitments of een nieuw groepszichtbaar
   oppervlak raakt; `code-critic` en `critical-user` één keer per milestone,
   samen in één opdracht. Bij een puur UI-issue hoeft er niets te draaien. De
   onderbouwing staat in `CLAUDE.md` bij onwrikbare regel 19.

   ⚠️ En verifieer elke bevinding zelf. Ze hebben het ook mis: op 20-08 was de
   zwaarste bevinding onjuist omdat ze een migratiebestand las waar de gedeployde
   functie strenger was.

6. **Draai de RLS-suite en lees de uitslag.** `npm test` doet dit lokaal mee,
   maar alleen omdat `.env` de sleutels heeft. Controleer dat de teller klopt —
   staat er `skipped` bij `tests/rls/`, dan heb je géén RLS-dekking gedraaid en
   zegt groen niets over autorisatie.

⚠️ **Waarom dit een aparte stap is en niet "CI doet het wel".** De CI-job
"Alles groen" dekt typecheck, lint en de niet-RLS-tests. De RLS-suite slaat
zichzelf daar over, en dat is een bewuste en juiste keuze: een sleutel die RLS
omzeilt geef je niet aan een runner die op elke push van elke branch draait
(zie `.github/workflows/ci.yml`).

Het gevolg moet je scherp hebben: **groen in GitHub bewijst niets over
domeinregel 7, groepslidmaatschap, peer-goedkeuring of het puntengrootboek.**
Elke bevinding die er in dit project toe deed — het lek in `weekly_goals.status`
(EPIC 5), de drie routes terug in een uitgezette groep (A18), de weekafsluiting
die andermans reacties meenam bij accountverwijdering (A3), de aanwezigheids-
matrix in `chain_links` (EPIC 8) — is van een soort die CI per definitie niet
ziet. Ze kwamen alle vier uit de RLS-suite of uit een reviewagent.

**Wanneer deze stap kan vervallen:** de helft ervan is op 24-08 vervallen.
QS8-119 is af: `npm run rls:stack && npm run rls:lokaal` draait de volle suite
zonder credentials en zonder het echte project aan te raken. Dat is handwerk van
tien seconden in plaats van een run tegen productie.

✅ **En sinds 24-08 draait de suite in CI**, in een eigen job met een
`postgres:16`-service en de vastgepinde PostgREST-binary. Geen secrets. Daarmee
vervalt de zin die hier stond: **groen in GitHub zegt nu wél iets over
domeinregel 7.**

⚠️ Wat het níét zegt: of het platform zich gedraagt zoals verwacht. Er draait geen
GoTrue in CI, en het verschil tussen twee eigenaren van standaardrechten
(besluit A46) was lokaal onzichtbaar. Een groene CI vervangt de ronde tegen
productie niet; hij maakt hem alleen zeldzamer.

⚠️ Twee dingen zijn hier sinds 23-08 veranderd. **De aanmeldlimiet is geen reden
meer**: de harnas logt niet meer in maar tekent zijn eigen tokens (QS8-116), dus
dat argument is vervallen. En **de weg naar die aparte stack is sinds 24-08 vrij**:
QS8-122 is af, dus de migratiebestanden bouwen het schema van productie op —
nagemeten en niet aangenomen. Wat die reparatie nog opleverde staat in
`docs/decisions/004-migratieregister.md`, en één ding daaruit hoort hier: zonder
de standaardrechten van Supabase in de steiger bouwt een lege database een schema
op dat *strenger* is dan productie. Een RLS-test bevestigt daar dan iets wat op
het echte project niet waar is.

⚠️ **Branch protection op `main` staat sinds 18-08 aan**, maar smal: force push
en verwijderen zijn geblokkeerd, inclusief voor beheerders. Er is bewust géén
verplichte PR of verplichte status check, want die zouden een poort verplicht
stellen die de bovenstaande klasse fouten niet vangt — en een directe push naar
`main` onmogelijk maken. Het volledige pakket hoort bij de engineer-review in
november, als er een echte tweede lezer is.

---

## 4. Uitvoeringsvolgorde

Er zijn vier milestones in Linear. Deze volgorde is geen suggestie — de
afhankelijkheden zitten er echt in.

### Milestone: Fase 1 — MVP

Werk de epics in deze volgorde af. Binnen een epic: op prioriteit, hoog eerst.

| # | Epic | Waarom hier | Status |
|---|---|---|---|
| 1 | **EPIC 0 — Fundering** (QS8-5) | Blokkeert alles | grotendeels af, zie §5 |
| 2 | **EPIC 10 — Design system** (QS8-15) | Elk scherm heeft componenten nodig | ✅ af |
| 3 | **EPIC 1 — Auth & Onboarding** (QS8-6) | Zonder gebruiker geen data | ✅ af, m.u.v. OAuth. Avatar-upload is op 28-08 gebouwd (QS8-27, migratie `0126`) |
| 4 | **EPIC 2 — Hoofddoelen** (QS8-7) | Het object waar alles aan hangt | ✅ af |
| 5 | **EPIC 4 — Weekdoelen & cyclus** (QS8-9) | De kernlus. Vloer/plafond, Dagzet, rollover | ✅ af, m.u.v. de UI voor doorschuiven |
| 6 | **EPIC 5 — Buddy-groepen** (QS8-10) | Nodig vóór goedkeuring kan bestaan | ✅ af, inclusief de twee `phase:v2`-issues: QS8-57 (een groep verlaten) en QS8-56 (hetzelfde doel in meer dan één groep) zijn allebei op 27-08 gebouwd |
| 7 | **EPIC 6 — Peer-goedkeuring** (QS8-11) | Hangt op groepen én weekdoelen | ✅ **af**, inclusief QS8-65 (`phase:v2`, gebouwd 27-08, migratie `0111` — hij heette bij het bouwen 0107 en is twee keer opgeschoven omdat een parallelle sessie die nummers claimde). Een groep kiest tussen één buddy, een meerderheid en een vast aantal. ⚠️ De drempel wordt als **getal** bevroren bij het indienen, niet als regel gelezen bij het goedkeuren — anders tilt een beheerder (of een nieuw lid) de lat op onder een week die al loopt. Zie `docs/decisions/2026-08-27-de-goedkeuringsdrempel.md` |
| 8 | **EPIC 7 — Chat & weekafsluiting** (QS8-12) | Hangt op groepen | ✅ **af voor de MVP** (24-08), op de twee `phase:v2`-issues na. De ketting-mijlpaal was de laatste schakel; zie §2 |
| 9 | **EPIC 8 — Gamification** (QS8-13) | Ketting, weekpassen, adempauze | ✅ **af voor de MVP**. Beide `phase:v2`-issues zijn op 27-08 gebouwd: QS8-79 (seizoenen met een recap, migratie `0112`) en QS8-78 (badges, migratie `0113`). ⚠️ QS8-78 hád géén acceptatiecriteria — één PRD-zin — dus alle keuzes daarin zijn van de bouwer en staan uitgeschreven in `docs/decisions/2026-08-27-badges-zijn-prive.md`. De zwaarste: **badges zijn privé**, want een badgemuur naast een ledenlijst maakt van de ontbrekende badge het signaal. QS8-80 (De Ketting), QS8-81 (weekpassen), QS8-75 (dashboard), QS8-82 (adempauze), QS8-76 (feestmoment) en QS8-77 (nudge, Done op 21-08) zijn allemaal af |
| 10 | **EPIC 11 — Notificaties** (QS8-16) | Heeft gebeurtenissen nodig om over te melden | ⚠️ **volledig gebouwd, nooit afgeleverd.** `expo-notifications` staat erin (Q-TODO B4, 21-08), de webregistratie sinds QS8-124, en de PWA eromheen is compleet en getoetst (QS8-117). Wat ontbreekt is een VAPID-sleutelpaar in `.env` en — voor iOS — een fysiek toestel. Er is dus nog geen enkele melding aangekomen |
| 11 | **EPIC 3 — De Doelcoach** (QS8-8) | AI. Werkt pas zinvol als doelen en weekdoelen bestaan | ✅ af voor de MVP (21-08). End-to-end gedraaid met een echte sleutel. **QS8-41 (weekstappen per mijlpaal) is op 27-08 gebouwd**; daarbij bleek `doelcoach` nooit op `job.kind` te vertakken en kende de app `'error'` waar de database `'failed'` schrijft — elke mislukte generatie liep sinds QS8-38 dood in een timeout. **QS8-137 (A48 variant 2, de Doelcoach-tip per mijlpaal) dezelfde dag**, migratie `0103`: een eigenaar-only tabel `milestone_tips`, een derde `ai_jobs.kind`, en een zeef die aan beide kanten dezelfde woordenlijst gebruikt |
| 12 | **EPIC 12 — Risico-radar** (QS8-17) | Rekent op cyclusgeschiedenis, dus laat | ✅ af (20-08). `risk_status` is vóór het bouwen naar een eigen eigenaar-only tabel verhuisd |
| 13 | **EPIC 9 — Commitment device** (QS8-14) | Laatste; raakt vertrouwen, dus niet haasten | ✅ **af** (21-08). QS8-83 (beloning vrijgeven), QS8-84 (straf verschuldigd) en QS8-85 (informeel) staan alle drie op Done; migraties 0057 en 0058, en de rollover is gedeployd mét `maak_straffen_verschuldigd` |
| 14 | **EPIC 13 — Open of beschermde groepen** (QS8-132) | Besluit A41, 24-08. Varieert de gevoeligste policies die er zijn per groep, dus na alles wat erop leunt | ✅ **af** (24-08). Migraties 0076 (kolom, `group_events`, `zet_groepszichtbaarheid()`, twee systeemberichten), 0077 (`weekly_goals_select`), 0078 (`best_streak` en `last_cycle_start`) 0079 (De Ketting) en 0080 (de uitnodiging noemt de stand). Alle twintig oppervlakken beoordeeld; zeven staan bewust dicht, óók in een open groep. Beoordeling per oppervlak in beslisdocument 002 §6 |

**Exit:** een groep van drie draait ≥4 opeenvolgende cycli.

#### Waar het nu op vastzit

De epics zijn af; de MVP is dat niet. Drie dingen, en geen ervan is code die
een agent alleen kan afmaken:

| # | Wat | Waarom het blokkeert | Wie |
|---|---|---|---|
| 1 | ✅ **A47 — de RLS-suite** | Opgelost op 24-08 met QS8-119. Er zat één aanwijsbare oorzaak onder: twee aankondigingen uit dezelfde transactie dragen dezelfde `created_at`, en de test sorteerde daarop. 10 van de 10 rondes schoon, elk met een verse database | af |
| 2 | **QS8-114 — web push** | `expo-notifications` staat erin, maar de app draait alleen op het web en web push is een ánder mechanisme (VAPID, service worker, `PushSubscription`). Vandaag komt er dus geen enkele melding aan | besluit over opslag + werk |
| 3 | **Supabase Auth-URL's** | Bevestigingsmail wijst naar het oude adres. Dashboardhandeling van een minuut, §0a | Quinten |

#### ⚠️ De `phase:v2`-voorraad die een agent alleen kan bouwen, is leeg (28-08)

Alle vier de `phase:v2`-issues die zonder overleg te bouwen waren, zijn op 27/28-08
gebouwd en geland: QS8-56, QS8-65, QS8-79 en QS8-78. Wat er in Backlog overblijft,
kan een sessie **niet** zelf oppakken:

| Issue | Waarom niet |
|---|---|
| QS8-71, QS8-72 | Vragen een betaalde tier en een nieuw groepszichtbaar oppervlak. ⚠️ Sinds `0126` is de bucket-helft er wél (voor avatars), maar dat maakt deze twee niet vrij: bijlagen bij voltooiingen en chatberichten zijn iets anders dan een profielfoto. Overleg met Quinten |
| QS8-86 | Betaalprovider — grens 1 uit de beslisbevoegdheid. **En bewust als laatste (28-08): Quinten wil de app eerst met echte mensen testen. Niet nodig voor de MVP** |
| QS8-92 | Zit in `src/modules/notifications/`, en dat was het werkgebied van een parallelle sessie |
| QS8-108 | Vraagt een nieuwe dependency |
| QS8-109 | **Alleen de vórmgeving nog** — die vraagt een illustrator, en Quinten onderzoekt zelf wat hij wil (28-08). Niet oppakken in een `/verder`-ronde; niet nodig voor de MVP. **Het gedrág is wél gebouwd:** de coach moedigt ongevraagd aan bij een tegenvallende stand (variant B, besluit 28-08), met de toon onder test. Zie `docs/GROENE-NOTITIES.md` §3b |

**Wat er wél ligt is de controleronde van 28-08**, en die heeft meer werk
opgeleverd dan de backlog. Zeven agents over ~99.500 regels; de vijf blokkerende
bevindingen zijn gerepareerd (PR #85 t/m #90), de rest staat als rij in
`docs/ENGINEER-REVIEW.md` met per rij de voorwaarde waaronder hij zwaarder wordt.
**Begin daar, niet in Linear.** De zwaarste die nog open staan:

- Elf tabellen dragen schrijfgrants zonder bijbehorende policy. Vandaag inert —
  RLS weigert bij een ontbrekende policy — maar `schrijfrechten_bewaking()` (0101)
  kent een **hardgecodeerde lijst van vier tabelnamen** en ziet de andere zeven
  niet. Dat is precies de vorm die 0101 kwam voorkomen.
- `te_beoordelen_voor()` is een autorisatiegrens zonder inhoudelijke test. De job
  roept hem aan als `service_role`, dus RLS kijkt niet mee; de functie ís de
  grens. De groepsjoin met de hand losknippen liet de hele RLS-suite groen.
- 49 policies over 30 tabellen evalueren `auth.uid()` per rij in plaats van via
  `(select auth.uid())`. Nul van de 58 doet het vandaag goed.
- Zes tekstkolommen zonder lengtegrens en het AI-dagquotum dat jobs telt in
  plaats van tokens — allebei opslag- respectievelijk kostenmisbruik op een
  gratis tier zonder backups.
- Vijf onbereikbare features: een doel en een mijlpaal zijn na aanmaken niet meer
  te wijzigen, het auditspoor van een commitment is nergens te zien, ledenbeheer
  (`group_members.status`) heeft geen knop, en `ai_kosten_per_week()` draait
  nergens.

✅ **De twee blinde vlekken in de controlescripts zijn dicht (28-08).**
`keten:controle` telde een `grant`-regel, SQL-commentaar én geen `drop function`
mee — dertien functies zaten daaronder. `tekst:controle` zag geen kale tekst
tussen de kinderen van een tag; dat waren er vier, verdeeld over zes regels, en
ze staan nu in de catalogus. Beide reparaties zijn geijkt door elke grendel met
de hand te breken. Zie de rijen in `docs/ENGINEER-REVIEW.md`.

#### Wat er van de afgeronde epics nog los ligt

Klein, maar het staat nergens anders opgeschreven:

| Wat | Waar | Waarom blijven liggen |
|---|---|---|
| Apple- en Google-login | QS8-25 | Provider moet aan in het Supabase-dashboard; op native vraagt het `expo-web-browser` — een dependency |
| ~~Avatar uploaden~~ | QS8-27 | ✅ **gebouwd 28-08**, migraties `0126` t/m `0130`, alle vijf **toegepast op productie** — de eerste bucket van dit project. Privé, met het eerste padsegment als autorisatiegrens. ⚠️ Gevolg door de hele app: `avatar_url` draagt sindsdien een **pad** en geen URL, en de datalaag tekent hem. `npm run avatar:controle` wordt rood zodra een ophaalpad dat vergeet. `0127` zet de grens van de bucket ook op de kolom, want `authenticated` mag `avatar_url` schrijven. ⚠️ **`0128` t/m `0130` komen uit de reviewronde en horen erbij:** een uitnodigingslink gaf sinds `0126` gebruikers-id's weg aan wie hem doorgestuurd kreeg, de CHECK van `0127` toetste alleen het begin van het pad, en één gebruiker kon de opslag van het hele project vullen. Zie beslisdocument §7. Zie `docs/decisions/2026-08-28-de-eerste-bucket.md` |
| ~~Doorschuiven van een gemist weekdoel~~ | QS8-47 | ✅ aangesloten in QS8-106: het blok "Nog open van eerdere weken" op *Vandaag* |
| ~~Een weekdoel aanmaken~~ | QS8-112 | ✅ gebouwd op 20-08. QS8-43 en QS8-44 stonden op Done terwijl er geen scherm was — controleer bij een frontend-issue voortaan of een mens er via het scherm bij kan |
| ~~Een voltooiing corrigeren~~ | QS8-46 | ✅ opgelost in EPIC 6: de RPC `dien_opnieuw_in` doet het append-only en in één transactie |
| Rollover automatisch laten draaien | QS8-49 | De functie werkt en is getest, maar wordt door niets aangeroepen. Zie hieronder |
| ~~Een verschuldigd commitment verdween met het doel~~ | ENGINEER-REVIEW 19-08 | ✅ gedicht in 0058: `verwijder_doel()` weigert bij `unlocked`, `due` of `resolved` — dezelfde lijst als `commitments_select` |
| ~~Systeembericht bij een ketting-mijlpaal~~ | QS8-70 | ✅ gebouwd 24-08 in migratie 0070. De ontbrekende definitie is ingevuld: een rond cumulatief aantal schakels van de groep. `chain_milestone` staat op de allowlist én in `SYSTEEM_GEBEURTENISSEN` |
| Foto's en documenten in de chat | QS8-71, QS8-72 | `phase:v2`. Vraagt een Storage-bucket met policies, en die is er niet — Q-TODO A12 |
| ~~Hetzelfde doel aan meerdere groepen koppelen~~ | QS8-56 | ✅ **gebouwd 27-08**, zónder migratie. `goal_group_links` kon dit vanaf dag één en het gróépsscherm kon het ook — `KoppelDoel` filtert alleen tegen de koppelingen van díé groep, dus wie in twee groepen achter elkaar hetzelfde doel koos, hád het al. Wat ontbrak was het overzicht vanaf het doel, en dat is nu het blok **Gedeeld met** op `app/doel/[id].tsx`. ⚠️ **Onderweg bleek het deadlineverzoek stuk te staan wachten:** het scherm nam `groepen[0]` als de groep die erover besliste, en die lijst had geen `order by`. Elk slot eromheen was dicht en gemeten; de gebruiker had de groep alleen nooit aangewezen. Zie `docs/decisions/2026-08-27-een-doel-in-meer-dan-een-groep.md` §2 |
| ~~Een groep verlaten~~ | QS8-57 | ✅ **gebouwd 27-08**, migratie 0102. Vertrekken loopt via `verlaat_groep()`; `group_members_delete` staat op `using (false)`, want de laatste-beheerder-eis gaat over de rijen die óverblijven en dat kan RLS niet zien. Onderweg bleek `shares_group_with_goal()` de eigenaar nooit te toetsen: een oud-lid bleef zijn doel, weekdoelen en voltooiingen aan de verlaten groep uitdelen. Zie de kop van 0102 |
| ~~Rollover opnieuw deployen~~ | Q-TODO A13 | ✅ **gedaan 19-08.** De Supabase CLI blijkt ingelogd (token in de CLI-config, niet in `.env`), dus `supabase functions deploy rollover` kón gewoon. Geverifieerd met een echte aanroep: `401` zonder token, `200` met een service-role-token — de kapotte regex had hier altijd `403` gegeven. Draai `npm run edge:sync` vóór elke deploy; de kopie liep achter |

✅ **De rollover draait sinds 19-08 vanzelf**, elk uur via
`.github/workflows/rollover.yml`. Geverifieerd op GitHub: `HTTP 200` en
`{"ok":true,"gemist":0,"vrijgesteld":0,"profielen":1,"geslapen":0}`.

Handmatig starten kan met `gh workflow run Rollover`, of rechtstreeks met:

```bash
curl -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/rollover" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

⚠️ **Waarom het GitHub Actions werd en geen Supabase Cron.** Supabase Cron *is*
pg_cron met een schermpje eromheen; een Edge Function aanroepen vanuit Postgres
vraagt `pg_net` plus een `Authorization`-header met de service-role-key. Die
sleutel zou daarmee in de database komen te staan — precies wat een
service-role-key hoort te vermijden, en in strijd met `CLAUDE.md`
beveiligingsregel 4. In GitHub Secrets staat hij in een env var, zoals de regel
het vraagt. Besluit van Quinten, 19-08-2026.

⚠️ **Elk uur en niet dagelijks**, omdat een cyclusgrens op middernacht in de
tijdzone van de gebruiker valt en die kan elke zijn. De functie is idempotent,
dus vaker draaien kost alleen rekentijd.

⚠️ **Twee dingen om te weten als hij ooit stilvalt.** Een geplande workflow
draait uitsluitend vanaf de default branch — staat hij op een feature branch,
dan gebeurt er niets. En GitHub schakelt geplande workflows uit in repo's waar
zestig dagen geen activiteit is.

### Milestone: Live op goalbuddies.q-projects.tech

QS8-99 (subdomein) en QS8-100 (deploy). Kan zodra er iets zinnigs te tonen is —
in de praktijk na EPIC 1 en 2. Niet uitstellen tot het eind: uitnodigingslinks
(QS8-59) hebben een publiek adres nodig, en zonder dat kun je geen tweede
gebruiker testen.

### Milestone: Fase 2 en Fase 3

Pas beginnen als Fase 1 zijn exit-criterium haalt. Alles staat al in Linear met
label `phase:v2` of `phase:v3`.

⚠️ **Drie issues zijn op 27-08 met naam vrijgegeven, en dat is een uitzondering
en geen verschuiving van de grens.** Het exit-criterium van Fase 1 (een groep van
drie, ≥4 opeenvolgende cycli) staat onaangeroerd; wat eraan ontbreekt is geen
code maar Quintens hand, en daar kan een sessie niet op wachten. Vrijgegeven
zijn **QS8-57** (een groep verlaten), **QS8-41** (weekstappen per mijlpaal) en
**QS8-137** (A48 variant 2, de Doelcoach-tip per mijlpaal). Alle drie zijn ze
gebouwd; zie de EPIC-tabel hierboven en §2.

**Wat dit niet is:** geen vrijbrief voor de rest van het label. Wie een ander
`phase:v2`-issue wil oppakken, vraagt dat opnieuw. Drie ervan staan sowieso op
slot en dat is ouder dan dit besluit: **QS8-71** en **QS8-72** vragen een
betaalde tier en een nieuw groepszichtbaar oppervlak (de bucket-helft is sinds
`0126` gebouwd, maar alleen voor avatars) en
**QS8-86** vraagt een betaalprovider — dat laatste is grens 1 uit de
beslisbevoegdheid in `CLAUDE.md`.

---

## 5. Wat nog open staat in EPIC 0

| Issue | Wat | Stand |
|---|---|---|
| QS8-98 | RLS-testsuite met echte JWT's | ✅ af, plus zeven gaten gedicht |
| QS8-23 | CI: typecheck, lint, test op elke push | ✅ af — branch protection nog zetten |
| QS8-24 | Sentry | ✅ alle vier de criteria gebouwd en gemerged — open: er is nooit een echte gebeurtenis uít de app aangekomen |
| QS8-22 | Migratie-workflow | ✅ af sinds QS8-119 — dumpscript, docs én een lokale stack. Zie de correctie hieronder |

⚠️ **Achterhaald sinds QS8-119 (24-08-2026), en dat stond hier tot 27-08 nog
fout.** Hier stond drie alinea's lang dat er géén lokale stack was, dat elke
migratie dus rechtstreeks op het echte project ging, en dat `pg_dump` er niet op
stond. Alle drie zijn onjuist:

| Wat | Waar |
|---|---|
| Een lokale stack | `npm run rls:stack` (`scripts/lokale-stack.sh`) — Postgres plus PostgREST, schema opgebouwd uit `supabase/migrations/` |
| De suite ertegenaan | `npm run rls:lokaal` — geen credentials, geen productie, draait mee in CI |
| Een dump vooraf | `npm run db:dump` (`scripts/db-dump.mjs`), en `npm run db:push` doet dump → push → registercontrole in één commando |

⚠️ **Wat de lokale stack níét is, en dat hoort erbij te staan.** Het is geen
volledige Supabase: geen GoTrue, geen Storage, geen Edge-runtime. De RLS-suite
tekent zijn tokens daarom zelf (QS8-116). Wat je lokaal bewijst is het **schema**
en de **policies**; dat een echte sessie de claims draagt die die policies
verwachten, blijft een meting tegen het echte project — `tests/rls/token.test.ts`.

⚠️ **Het besluit van 16-08 staat daarmee niet meer op zichzelf.** Dat zei: elke
migratie mag voorlopig direct op het echte project, omdat er geen gebruikers zijn
tot alle fases geprogrammeerd zijn. Dat mág nog steeds — de database bevat op
27-08 één account, nul doelen en nul groepen — maar het is sinds QS8-119 geen
noodzaak meer, en er is nu een goedkopere volgorde: **eerst lokaal draaien, dan
pushen.** Zo werkt `db:push` ook.

**Het moment waarop het besluit omslaat is nog steeds scherp:** de eerste echte
gebruiker die zich aanmeldt. Vanaf dan geen migratie meer zonder repetitie en
zonder dump. Tot die tijd blijft elke migratie idempotent met een rollback-pad in
de kop.

⚠️ **Waarom deze correctie hier staat en niet stilletjes weggehaald is.** Dit is
QS8-125 in zijn gevaarlijkste vorm: een document dat een sessie als eerste leest,
dat zegt dat gereedschap ontbreekt dat er al drie dagen staat. Een sessie die dit
gelooft, draait zijn migratie rechtstreeks op productie omdat het document zegt
dat er geen alternatief is.

## 6. Wat menselijke actie vereist

Deze dingen kan een sessie niet zelf oplossen.

| Wat | Waarom | Status |
|---|---|---|
| `.env` aanmaken | Staat in `.gitignore`, komt dus niet uit de repo. Kopieer `.env.example` | Quinten heeft hem lokaal gevuld |
| `SUPABASE_SERVICE_ROLE_KEY` | Alleen uit het Supabase-dashboard | ingevuld |
| `SUPABASE_DB_URL` | Bevat het databasewachtwoord | ingevuld |
| `ANTHROPIC_API_KEY` | Nodig vanaf EPIC 3 (Doelcoach) | leeg |
| PostgreSQL client tools | `pg_dump` vóór elke migratie op gevulde data | ✅ geïnstalleerd 18-08-2026 via scoop (PostgreSQL 18.6, géén beheerdersrechten nodig). `npm run db:dump` getest tegen productie: 0,45 MB |
| Docker + WSL2 | Voor een lokale Supabase-stack. Bewust uitgesteld, zie §5 | uitgesteld tot vóór de eerste echte gebruiker |
| Supabase CLI | Voor `db push`, `db diff` en de lokale stack | ✅ geïnstalleerd 18-08-2026 via scoop (v2.115.0), staat op `PATH`. **Nog niet ingelogd en niet gelinkt** (geen `supabase/config.toml`), dus `db push` werkt nog niet — zie Q-TODO C3 |
| ~~GitHub-connector~~ | Voor PR's vanuit een sessie | ✅ **18-08: `gh` 2.97.0 geïnstalleerd en ingelogd als `QS86-bot`**, scopes `repo`, `workflow`, `read:org`, `gist`. Een sessie kan nu PR's openen; roep hem aan via het volledige pad (zie valkuil 19) |
| Branch protection op `main` | Maakt de CI-check "Alles groen" blokkerend | niet gedaan — **kan nu wel**, via `gh api` in plaats van de webinterface |
| Leaked password protection | Staat uit in Supabase Auth. Eén schakelaar in het dashboard | niet gedaan |
| Apple/Google OAuth | Providers aanzetten in het Supabase-dashboard | niet gedaan |
| ~~Storage-bucket~~ | Voor avatars en later bijlagen | ✅ **gedaan 28-08 in migratie `0126`** — voor avatars. Bijlagen bij voltooiingen en chatberichten (QS8-71, QS8-72) blijven open: die vragen een betaalde tier en een nieuw groepszichtbaar oppervlak |
| ~~Rollover inplannen~~ | De Edge Function werd door niets aangeroepen | ✅ **gedaan 19-08.** `.github/workflows/rollover.yml` draait hem elk uur; de sleutel staat in GitHub Secrets en niet in de database. Geverifieerd op GitHub: twee runs geslaagd, log toont `HTTP 200` en `{"ok":true,...}` |
| ~~Rollover opnieuw deployen~~ | Hij roept nu ook `slaap_stille_groepen()` aan (QS8-60), en de repo-versie had een kapotte `Bearer`-regex | ✅ **gedaan 19-08**, geverifieerd met een echte aanroep. De CLI blijkt ingelogd; het access token stond in de CLI-config en niet in `.env`, en dat is de reden dat dit maanden onterecht als geblokkeerd stond |
| `EXPO_PUBLIC_APP_URL` invullen | Voedt de uitnodigingslink. Leeg betekent: terugval op het productieadres, dus een testomgeving deelt links naar productie | niet gedaan — Q-TODO A14 |
| ~~Vier productbeslissingen~~ | A15, A17 en A18 zijn beantwoord op 18-08 en uitgevoerd (0029, 0032). Alleen A16 staat nog open | ✅ op A16 na |
| ~~Twee beslissingen uit EPIC 6~~ | A19 beantwoord en gebouwd (0030); A20 staat in `CLAUDE.md` met een test | ✅ |
| Vier nieuwe vragen | A27 t/m A30 uit de besluitenronde van 18-08: een `ref_id` op `chat_messages`, chat anonimiseren of cascaderen, de puntenvariant bij A7, en wie over een deadline-verzoek beslist | wachten op Quinten |
| `npm run types:db` draaien | Regenereert `src/lib/database.types.ts` uit het echte project. Een sessie in de cloudcontainer kán dit niet: het vraagt én een productietoken én een draaiende Docker-daemon, óók met `--db-url`. Tot dat gebeurt staan er handmatige handtekeningen in het bestand (zie §2), en **een handmatige regel die niemand meer als handmatig herkent, is precies hoe de repo en het project uit elkaar gaan lopen** | open — productie staat sinds 02-09 op `0146`, dus dit loopt achter op álles vanaf `0120` |

---

## 7. Valkuilen — hier gaat het mis

> **Deze lijst is op 20-08-2026 opnieuw ingedeeld.** Hij was 21 losse punten en
> groeide elke sessie; een lijst die alleen maar groeit wordt op een dag niet
> meer gelezen, en dan verlies je ook de punten die wél werken.
>
> **Wat er is veranderd.** Vier dode punten eruit (de `winget`-PATH, het
> `gh`-pad, de lege types-generatie en de CRLF-val — allemaal inmiddels opgelost
> gereedschap). Vier regels die al in `CLAUDE.md` staan naar de voetnoot
> onderaan. Vier nieuwe lessen uit de ronde van 19–20 augustus erbij. En alles
> gesorteerd in vier groepen, met de duurste les bovenaan.
>
> Netto is hij nauwelijks korter — 223 naar 204 regels — maar wel dichter: er
> staat minder in dat je niet hoeft te onthouden, en meer dat je wél moet weten.
>
> ⚠️ **De sorteerregel die daaruit volgt, en die je bij elke nieuwe vondst moet
> toepassen.** Een valkuil werkt als hij een **beslissing** raakt die je bewust
> neemt — "is dit een policyfout of de rate limit?", "wat breek ik met deze
> revoke?". Dan lees je hem op het moment dat je nadenkt. Een valkuil werkt
> **niet** als hij een **reflex** moet onderbreken: die lees je niet op het moment
> dat je het commando intikt. Bewijs daarvoor is de CRLF-regel, die op de lijst
> stond, gelezen was, en op één dag alsnog drie keer misging.
>
> **Reflexvalkuilen horen dus in gereedschap** — een lint-regel, een test, een
> `.gitattributes` — en niet in deze lijst. Schrijf je iets nieuws op, vraag dan
> eerst: kan dit een controle worden in plaats van een zin?

### De duurste les tot nu toe

**Zoek eerst álle routes naar het effect, dan pas dicht je er één.**

Eén gat kostte vier migraties (0043 t/m 0046), en elke ronde bleek de vorige
reparatie te smal. 0023 dichtte `weekly_goals.status` voor *wijzigen* met de
juiste redenering erboven — *"een autorisatiegrens is pas dicht als ook het
gevólg ervan op slot zit"* — en niemand keek naar *aanmaken*, *verwijderen*,
*doorschuiven* en *de rij wissen vóór de rollover*. In `ENGINEER-REVIEW.md` stond
het al die tijd afgevinkt als opgelost.

Bij het volgende slot: schrijf eerst op wélk effect je wilt voorkomen (hier: "een
gemiste week verdwijnt uit de geschiedenis"), en zoek dan élke bewerking die dat
effect kan bereiken. Dicht ze in één migratie. Een dichtgestreepte regel is de
plek waar niemand meer kijkt.

⚠️ **Op 23-08 is dezelfde vorm nog een keer langsgekomen, en dat is het bewijs
dat deze les nog niet zit.** 0064 introduceerde "geen minpunt als niemand je week
kon beoordelen" en beantwoordde die vraag op het moment van boeken. Het effect
dat voorkomen moest worden was hetzelfde als hierboven — een gemiste week die
niets kost — en de route was een handeling die al bekend was: de eigenaar mag
`goal_group_links` verwijderen en terugzetten. Gedicht in 0066.

Het verschil met 0043–0046: daar werd de reparatie elke ronde te smal, hier werd
bij het bouwen van een níéuwe regel niet gekeken welke bestaande handelingen hem
konden omzeilen. **Vraag bij elke nieuwe beslissing die op de stand van de
database leunt: wie kan die stand veranderen, en wanneer?**

### Autorisatie en de database

1. **In een `SECURITY DEFINER`-RPC overleeft niets een `raise exception`.**
   PostgREST draait elke RPC in zijn eigen transactie; gooien rolt die terug,
   inclusief alles wat je net wilde onthouden. Bouw je een rate limiter, een
   auditregel of een blokkade, zet die dan in de happy path en geef een resultaat
   terug. Kostte de uitnodigingslimiet zijn werking (0017) — de teller bleef op
   nul en de limiet gold alleen voor gelúkte toetredingen.

2. **Een vergelijking met een mogelijk lege waarde is geen controle.** `x <> y`
   is in SQL geen bewering over ongelijkheid zodra één kant leeg kan zijn, maar
   een derde antwoord dat zich in een `if` als "niet waar" gedraagt — en dat is
   de verkeerde kant om op te falen. `eigenaar <> auth.uid()` ging zonder sessie
   dus nooit af, waarna een SECURITY DEFINER-functie de weekpasvoorraad van elk
   willekeurig doel teruggaf (0039, gedicht in 0040).

   **Goedkope test die op elke definer-functie past:** roep hem aan als
   `service_role`, want daar is `auth.uid()` leeg. Begin elke definer-functie met
   een expliciete `if auth.uid() is null`-tak, zoals de andere er zes al doen.

3. **RLS kan geen kolommen beperken.** Is de eis "deze kolom mag je niet
   veranderen" of "niet lézen", dan heb je een kolomgrant, een view met een
   expliciete kolomlijst of een rijbeperking nodig. Zeven keer misgegaan (0006,
   0010, 0019, 0023, 0029, 0043, 0046).

4. **Een kolomgrant intrekken breekt de app stil, niet luid.** Typecheck en lint
   blijven groen, want het type klopt nog. Zoek na een revoke elke `.insert(` en
   `.update(` op die kolom in `src/`, `app/` **én** `tests/` — en schrijf meteen
   de tegentest: *"het normale geval werkt nog"*. Zonder die tweede test weet je
   alleen dat je iets hebt dichtgezet, niet dat de app nog werkt.

5. **Een ontbrekende policy weigert stil, niet luid.** Bij INSERT krijg je een
   harde `42501` — er is geen rij om weg te filteren. Bij UPDATE en DELETE niet:
   RLS filtert de rijen weg, en een DELETE die niets raakt is geen fout. De
   client krijgt dus HTTP 204 en een ongewijzigde tabel. **Een test die op
   `42501` rekent wordt daar groen zonder iets te bewijzen.** Toets de úítkomst
   (staat de rij er nog?), of trek het tabelrecht in als je een luide weigering
   wilt.

6. **Een `on delete set null` sneuvelt stil op een onveranderlijkheidstrigger.**
   Een referentiële actie is zélf een UPDATE op de kindtabel. Staat daar een
   BEFORE UPDATE-trigger die de kolom terugzet naar `old`, dan draait die de
   actie in dezelfde bewerking terug. Postgres controleert de sleutel daarna niet
   opnieuw: geen fout, geen waarschuwing, wél een verwijzing naar een rij die
   niet meer bestaat. Kostte 0031 zijn AVG-belofte; gerepareerd in 0033.
   **Bij elke nieuwe `on delete set null`: staat er een trigger op die kolom?**

### Domeinregel 7 — falen is nooit publiek

7. **De regel is pas afgedwongen als de dátabase hem afdwingt.** De schermen van
   EPIC 5 waren zorgvuldig — geen gemiste weken, geen puntentotaal, een leeg
   vakje in plaats van een grijs kruisje — en tóch stond de hele lijst gemiste
   weken van elk groepslid open via één `GET`, omdat `weekly_goals_select` de
   statuskolom meegaf. Bij élke nieuwe policy die groepsgenoten iets laat lezen:
   welke kolommen zitten er in die rij, en zegt een daarvan iets over falen?

8. **Een redenering die klopt zolang een tabel leeg is, is geen bescherming.**
   "Afwezigheid betekent nog niet" hield stand tot `chain_links` gevuld werd, en
   toen was het een aanwezigheidsmatrix. Vraag bij elke tabel die van leeg naar
   gevuld gaat: **wat betekent een ontbrekende rij nu?** `chain_links` en
   `week_pass_events` zijn dit stadium door; **`ai_jobs` is de laatste die nog
   leeg is.**

9. **Domeinregel 7 per component is niet hetzelfde als per scherm.** De Ketting
   toont aantallen zonder namen; de ledenlijst twintig pixels lager toont
   dezelfde weekstatus mét naam. Geen datalek, wel een inconsistentie die geen
   enkele RLS-test kan vangen — er lekt immers niets uit de database. Staat als
   productbeslissing in `ENGINEER-REVIEW.md` (19-08).

10. **Een test kan net naast de bescherming kijken. Drie keer gebeurd.** De
    domeinregel-7-test op `cancelled` draaide op twee gebruikers die helemaal
    niet samen in een groep zaten, dus `shares_group_with_goal()` gaf altijd
    `false`: je kon `'cancelled'` uit de policy slopen en de test bleef groen.
    Eerder ging het zo bij `best_streak` (de test controleerde `total_points` en
    `last_cycle_start` en liet hem er precies langs) en bij de allowlist van
    systeemberichten.

    **Zet bij elke "de groep mag dit niet zien"-test een positieve controle
    ernaast: de groep móét het toegestane wél zien.** Zonder die tegenhanger
    bewijst een lege uitkomst alleen dat er iets anders stuk is.

11. **Twee insluitingen zijn geen gelijkheid.** De allowlist van systeemberichten
    werd twee kanten op getoetst — "de app kent niets dat de database verbiedt" en
    "de lijst in de app is exact deze acht namen" — en liep tóch uit elkaar, want
    de tweede test vergeleek de oude lijst met zichzelf. Bouw je een "twee kopieën
    die gelijk moeten blijven"-slot, toets dan de gelíjkheid
    (`systeembericht_allowlist()`, migratie 0034).

12. **Nooit `REPLICA IDENTITY FULL`** op `completions`, `weekly_goals` of
    `chat_messages`. Die staan in de realtime-publicatie, en Supabase past RLS
    toe op INSERT en UPDATE maar **niet op DELETE**: met `FULL` gaat bij een
    verwijdering de volledige oude rij over de lijn, inclusief `status =
    'missed'`. Staat in `CLAUDE.md` en er is een test op (`realtime_bewaking()`,
    migratie 0027). Abonneer je bovendien nooit op DELETE.

13. **Een nieuw type systeembericht vraagt een migratie, en dat is opzet.** De
    CHECK `chat_messages_system_event_bekend` geldt ook voor `service_role`; de
    kopie in `chat-schemas.ts` staat onder een gelijkheidstest. De drempel dwingt
    de vraag af of de groep het mag zien. En een systeembericht noemt **persoon
    en gebeurtenis, nooit een titel, notitie of niveau** — een bericht is een
    onveranderlijke kopie die de autorisatie overleeft waaronder hij gemaakt is.

### Werken met dit project

13b. **49 rode RLS-tests betekent bijna altijd dat de Postgres gestopt is, niet
    dat er iets kapot is.** Op 27-08-2026 gebeurde dat **vier keer** in één
    sessie: de suite gaf `49 failed | 21 passed`, en `pg_isready` gaf
    `no response`. De container zet zijn database uit; dat is omgeving en geen
    code.

    **Meet het vóór je gaat zoeken** — één regel is genoeg, en anders ga je een
    uur in tests kijken die niets mankeren:

    ```bash
    pg_isready -h 127.0.0.1 -p 5432
    ```

    Staat hij uit, dan is dit de weg terug:

    ```bash
    pg_ctlcluster 16 main start
    su postgres -c "psql -Atc \"alter role postgres password 'postgres'\""
    PGHOST=127.0.0.1 PGPORT=5432 PGPASSWORD=postgres bash scripts/lokale-stack.sh
    ```

    ⚠️ **De stack opnieuw opbouwen en niet één migratie afspelen.** Dat laatste
    lijkt sneller maar draait een oudere versie van een functie terug over een
    nieuwere — op 27-08 zette het afspelen van 0030 de wijzigingen van 0099 in
    `trek_goedkeuring_in()` weer weg, en dat kostte twee rode tests die niets met
    de wijziging te maken hadden.

    ⚠️ **En het blijft een meting.** Een rode suite is niet vanzelf de
    omgeving: kijk eerst of `pg_isready` antwoordt, en pas als dat "no response"
    zegt is het dit. Anders is het je code, en dan is "gewoon opnieuw draaien"
    precies de gewoonte waarmee je een echte regressie wegwuift.

14. **De repo en het echte project lopen uit elkaar, in béíde richtingen.**
    Migraties gaan via een MCP-tool en niet via `supabase db push`, dus
    `supabase/migrations/` is een verslag en geen bron — vergelijk bij twijfel
    `list_migrations` met de map.

    Andersom net zo, en dat is de kant die je niet verwacht: een reviewbevinding
    las een migratiebestand waar de gedéployde functie strenger was, en meldde
    een gat dat niet bestond. **`pg_get_functiondef()` is de waarheid; een
    migratiebestand is een momentopname.** Dat geldt voor reviewbevindingen net
    zo goed als voor je eigen aannames — een uur werk aan een niet-bestaand gat
    is even duur als een uur niet werken aan een echt gat.

    Hetzelfde geldt voor `supabase/functions/`: die vallen buiten typecheck, lint
    én CI, en geen enkele workflow deployt ze. Draai `npm run edge:sync` vóór elke
    deploy en controleer de gedéployde versie, niet de repo-versie.

15. **⚠️ Een aannemelijke diagnose is geen meting.** Hier stond tot 23-08 dat
    Supabase weigert na *ongeveer dertig aanmeldingen per uur*, en dat je de
    RLS-suite daarom niet vaker dan een paar keer per uur kon draaien. **Dat
    klopte niet.** De auth-logs zeggen: alle 429's op `/auth/v1/token` en géén
    enkele op `/auth/v1/admin/users`; 370 accounts aangemaakt in één uur zonder
    één weigering; 262 geslaagde aanmeldingen in het uur dat er 13 weigeringen
    had; 39 in één minuut. Het is een **burstlimiet per IP**, geen uurquotum en
    niets per project.

    Dat verschil was duur: op de verkeerde diagnose is "een tweede
    Supabase-project" de logische oplossing, en die verplaatst een IP-limiet niet.
    De echte oplossing was de limiet helemaal niet meer raken — de harnas tekent
    sinds QS8-116 zijn eigen tokens en logt niet meer in. **De bovengrens op hoe
    vaak je kunt verifiëren bestaat niet meer.**

    **Wat wél blijft staan is het faalbeeld.** Een uitgeputte limiet ziet eruit
    als een kapotte policy — een paar bestanden rood, de rest "skipped" — en dat
    is het vier keer níét geweest. Een tweede gezicht hiervan is **"JWT issued at
    future"**: klokverschil, ook geen policyfout. Zoek bij een opbouwfout dus
    eerst in de melding, niet in de policies.

16. **Een comment die uitlegt waarom iets zo moet, bewijst niet dat het zo is.**
    Het scherm "Vandaag" haalde onophoudelijk gegevens op omdat er objecten in een
    dependency-array stonden die elke render vers gebouwd worden — met de comment
    erboven die precies uitlegde waarom dat niet mocht, en de lijst eronder die
    het tegenovergestelde deed. Onzichtbaar in de app, zichtbaar op een gratis
    tier.

17. **Let op de limieten die je zelf hebt ingebouwd:** 10 groepen per gebruiker
    per dag, 20 toetredingspogingen per dag, 12 leden per groep, 5
    deadline-verzoeken per dag, 2 weekpassen tegelijk, 24 uur bedenktijd. Een
    test die daar overheen gaat lijkt op een policyfout en is het niet.

### Afgedwongen door gereedschap — je hoeft ze niet te onthouden

Deze stonden hier als tekst en zijn nu een controle. Ze staan er alleen nog zodat
je weet wát je tegenkomt als de controle afgaat.

- **Tijd buiten `shared/time`** → lint-regel op `new Date()` en `Date.now()`.
  Kom je hem tegen: breid `shared/time` uit, zet er geen `eslint-disable` op.
- **Kleuren buiten `shared/theme`** → `contrast.test.ts`. Goud is nergens een
  kleur voor lopende tekst, en een goudvlak draagt in de lichte modus geen
  lopende tekst.
- **CRLF en meerregelige zoek-en-vervang** → `.gitattributes` met `eol=lf`. De
  bestanden staan sinds 20-08 als LF op schijf, dus dit kán niet meer misgaan.
  Was drie keer misgegaan op één dag terwijl de waarschuwing op deze lijst stond.
- **Geen Vercel-specifieke API's, geen dependency zonder overleg, niet meer dan
  15 bestanden per keer** → staan in `CLAUDE.md`, niet hier.

---

## 8. Openstaande onzekerheden

Staan in `docs/ENGINEER-REVIEW.md`, met datum, risico en uitleg. Dat bestand is
de agenda voor de engineer-review in november. **Vul het aan tijdens het bouwen**,
niet achteraf — een onzekerheid die je nu niet opschrijft, ben je in november kwijt.

De zwaarste op dit moment:

1. ~~**`goals.risk_status` en `risk_reason` lekken naar groepsgenoten.**~~
   **Afgehandeld, en de aantekening heeft zijn werk gedaan.** Quinten antwoordde
   op 18-08 dat de groep je risicostatus mocht zien (A17), mét de aantekening
   *herbevestigen vóór EPIC 12* — want de Risico-radar leidt `behind` en
   `unreachable` zélf af uit gemiste weken, en daarmee wordt die kolom een
   afgeleide van andermans tegenslag.

   Bij die herbevestiging is het besluit **teruggedraaid**: migratie **0050**
   verhuisde de drie risicokolommen naar `goal_risk`, eigenaar-only. **A17 geldt
   dus niet meer.** Er zijn nog **twee** benoemde verruimingen van domeinregel 7
   — A15 (de groep mag je reeks zien) en A7 (je deadline-verschuiving, die je
   zelf aanvraagt) — niet drie. `CLAUDE.md` en beslisdocument 002 §4a zijn de bron.

   ⚠️ Dit is het gedocumenteerde bewijs dát zo'n aantekening werkt. De keerzijde
   staat in QS8-123: bij een bevinding zónder aantekening ging het op 23-08 wél
   mis.
2. ~~**`inactive` ontneemt niets.**~~ Opgelost in 0029. Er bleken drie routes terug
   naar binnen te zijn in plaats van één; de andere twee herstelden het
   lidmaatschap zelfs (eigen status terugzetten, eigen rij weggooien en opnieuw
   toetreden).
3. ~~**De RLS-suite draait niet in CI**~~ — opgelost met QS8-119. CI bouwt het
   schema uit `supabase/migrations/` op een eigen Postgres met een echte
   PostgREST ervoor, en draait de suite daartegen zonder één secret. Groen in
   GitHub zegt sindsdien wél iets over groepen, rate limiting en domeinregel 7.
4. **Niets bewaakt dat de repo en het echte project hetzelfde bevatten** (§7.15).
5b. ~~**Niets schrijft `week_pass_events`**~~ — opgelost 19-08 in QS8-81, en het
   is dezelfde les nog een keer. De tabel is nu gevuld, dus de vraag "wat
   betekent een ontbrekende rij?" heeft een nieuw antwoord: **"deze gemiste week
   is niet gered"**. Dat is een gevoelig gegeven, en het is de reden dat de tabel
   alleen voor de eigenaar leesbaar is en dat `weekpas_stand()` een eigen
   eigenaarstoets heeft in plaats van op RLS te leunen. Die toets was in 0039
   fout (`eigenaar <> auth.uid()` gaat zonder sessie niet af, want `null` is niet
   `false`) en is gerepareerd in 0040. **Van de drie tabellen uit die les is nu
   alleen `ai_jobs` nog leeg.**

5. ~~**Niets schrijft `chain_links`**~~ — opgelost 19-08 in QS8-80. Twee routes
   vullen de tabel, en het lek dat daardoor ontstond (de aanwezigheidsmatrix per
   persoon per week) is dezelfde dag gedicht in 0037. **Wat de les hiervan is:
   een redenering die klopt zolang een tabel leeg is, is geen bescherming.**
   "Afwezigheid, geen kruisje" hield stand tot het moment dat er rijen kwamen.
6. **Vraag 1 van de weekafsluiting wordt voorgevuld met privé Dagzetten.** De
   bescherming dat je dat merkt vóór je op "Delen met mijn groep" drukt, is één hint
   onder het veld. Zie `docs/ENGINEER-REVIEW.md`, 18-08.

7. ~~**Een doel kan niet meer op `completed` komen.**~~ **Opgelost 21-08 in
   EPIC 9** (QS8-102, A31), en het heeft twee epics stilgelegen zonder dat iemand
   het merkte: `meld_doel_af()` én `meld_commitment()` stonden er allebei
   maandenlang zonder ooit af te gaan. De keuze is `rond_doel_af()` — de eigenaar
   verklaart zijn doel af, en de server weigert zolang er een mijlpaal op `todo`
   staat. Die eis is geen netheid maar de énige rem op het laten vervallen van je
   eigen straf; onderbouwing in `docs/decisions/003-commitments-afwikkelen.md` §1.
   Het kolomrecht blijft ingetrokken (0035 voor UPDATE, 0046 voor INSERT) en er
   staat nu voor allebei een test — die op UPDATE ontbrak nog.

8. **⚠️ Een onveranderlijkheidstrigger sloopt stil een `on delete set null` — en op 21-08 is het voor de derde keer gebeurd.** Migratie 0059 citeerde dit punt in zijn eigen kop, paste het correct toe op `actor_id`, en greep er één regel lager naast voor `subject_id`. Gedicht in 0060, dezelfde dag. **Lees dit punt niet als geschiedenis maar als checklist: bij elke nieuwe kolom met `on delete set null` hoort de vraag of er een BEFORE UPDATE-trigger op die tabel staat.** Origineel: Een
   referentiële actie is zelf een UPDATE op de kindtabel; staat daar een BEFORE
   UPDATE-trigger die de kolom terugzet naar `old`, dan draait die de actie in
   dezelfde bewerking terug. Postgres controleert de sleutel daarna niet opnieuw:
   geen fout, geen waarschuwing, wél een verwijzing naar een rij die niet meer
   bestaat. Kostte 0031 zijn AVG-belofte; gerepareerd in 0033. **Bij elke nieuwe
   `on delete set null`: staat er een trigger op die kolom?**

9. **Twee dode paden zijn weg, en er blijft van allebei een staartje liggen**
   (QS8-215 en QS8-144, migraties 0132 en 0133, 31-08).

   - **`milestone_done` is een puntenreden die niemand boekt.** Exact dezelfde
     vraag als `goal_done`, die met 0132 geschrapt is: telt een mijlpaal apart
     mee, of zit hij al in de som van de weekdoelen eronder (domeinregel 10)?
     Bewust niet meegenomen in 0132 — dat was één besluit, dit is een tweede.
     ⚠️ Let op dat `milestone_done` óók een systeembericht**type** is; die twee
     zijn los van elkaar, en het door elkaar halen ervan is precies wat de
     premisse van QS8-215 fout maakte.
   - **`chain_links.earned_cycle_start` en `chain_links_one_per_cycle` zijn dood
     sinds 0133.** Ze bestonden voor `ketting_schakel()`, en de trigger
     `ketting_uit_weekafsluiting()` die het werk overneemt, vult die kolom niet.
     Droppen kan pas na één meting, want `chain_links` is een tabel die de groep
     leest:

     ```sql
     select count(*) from chain_links where earned_cycle_start is not null;
     ```

     Nul betekent opruimen. Staat er iets in, dan is dat histórie uit de tijd dat
     de functie wél werd aangeroepen, en dan is het geen opruiming maar een
     migratie met een bewaarvraag.

   ⚠️ **Beide zijn opzettelijk blijven staan en dat is geen uitstel.** Een
   migratie die "en meteen dit er ook maar bij" doet, is precies hoe een
   puntenmodel of een groepszichtbare tabel verandert zonder dat iemand het
   besloten heeft.

**Nog één productbeslissing ligt bij Quinten** (`docs/Q-TODO.docx`): mag een
uitnodigingslink de doeltitels van je leden tonen aan iedereen die hem heeft
(A16). Gebouwd zoals de issue het vraagt, en ingeperkt in 0019, maar het blijft
een keuze die anders kan uitvallen.

**Vier nieuwe vragen uit de besluitenronde staan als A27 t/m A30 in Q-TODO.** Drie
daarvan zijn keuzes die ik zelf heb moeten maken omdat het antwoord ze niet
afdekte: chatberichten anonimiseren in plaats van cascaderen (A28), bij A7 de
variant zonder puntenstraf (A29), en één ander groepslid als beslisser in plaats
van unanimiteit (A30). Alle drie zijn goedkoop terug te draaien.

---

## 9. Beslissingen die al genomen zijn

Niet opnieuw ter discussie stellen zonder Quinten. Volledige onderbouwing in
`docs/PRODUCT-PROPOSAL.md` en `docs/decisions/`.

| Besluit | Kort |
|---|---|
| De Dagzet | Dagelijks logje van 10 seconden. **Standaard privé.** Nooit punten, nooit goedkeuring |
| Twee klokken | `currentUserCycle` voor punten, `currentGroupPeriod` voor het groepsritme |
| Vloer & plafond | Optioneel veld, UI moedigt aan. Vloer halen = week telt |
| Bewijs | Instelbaar per groep, standaard notitie verplicht |
| Puntenmodel | Plafond +2, vloer +1, gemiste week −1, adempauze 0. Plafond per doel stijgt bij extra taken |
| Straf | Alleen bij een verstreken deadline, nooit bij een gemiste week |
| Backlog-indeling | Per epic, zoals PRD sectie 7 |
| Design | Q-Projects navy-stelsel, gedeeld met de Status Tracker |
