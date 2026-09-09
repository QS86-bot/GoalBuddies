# Werkvoorraad — waar het project staat en hoe je verdergaat

> **Lees dit als eerste in een nieuwe sessie.** Dit bestand is de overdracht:
> wat er staat, wat er nog moet, in welke volgorde, en waar je jezelf pijn doet
> als je het overslaat.
>
> Bijwerken is onderdeel van het werk. Sluit je een issue af, werk dan ook dit
> bestand bij — anders begint de volgende sessie met verouderde informatie.

**Laatst bijgewerkt:** 09-09-2026 (na QS8-243 en QS8-220; daarvóór QS8-314; daarvóór QS8-147, QS8-174, QS8-191, QS8-297, QS8-298, QS8-299, QS8-303 en QS8-304; daarvóór QS8-287, QS8-288, QS8-289 en QS8-291;
daarvóór QS8-266, QS8-202 en QS8-196, en het toepassen van `0139` t/m `0149` op
productie in twee rondes)

⚠️ **Productie staat op `0221`.** 📏 Hermeten op 09-09 om 16:10 UTC met
`migratieregister()` tegen `wehgocadxehottiiyvsc`: **224 registerrijen**, `0001`
t/m `0221` aaneengesloten, inclusief de drie letterversies. De map telt er
**229**.

**Het gat is daarmee vijf bestanden**, alle vijf van 09-09 en alle vijf uit
QS8-71 (PR #352):

| | |
| -- | -- |
| `0222_een_foto_hoort_bij_een_groep.sql` | QS8-71 |
| `0223_een_bijlage_wijst_naar_deze_groep.sql` | QS8-71 |
| `0224_een_chatfoto_overleeft_zijn_eigenaar_niet.sql` | QS8-71 |
| `0225_een_pad_heeft_een_canonieke_vorm.sql` | QS8-71 |
| `0226_een_plafond_per_lid_naast_dat_van_de_groep.sql` | QS8-71 |

⚠️ **Hier stond een uur eerder `0219` met twee bestanden gat, en dat klopte
toen.** `0220` en `0221` zijn erna toegepast en `0222` t/m `0226` landden
intussen op `main`. Dat is de vorm van QS8-318 nog een keer: **een regel over de
achterstand veroudert terwijl je hem opschrijft**, en de enige stand die klopt is
de gemeten stand.

⚠️⚠️ **Dit gat is niet vanuit een bouwsessie te dichten, en dat is op 09-09
gemeten in plaats van aangenomen.** `0222` valt om op
`ERROR: 42501: must be owner of table objects`: `storage.objects` is eigendom van
`supabase_storage_admin`, de MCP draait als `postgres`, en die is **geen lid** van
die rol — `set role` geeft *permission denied*. `0222` en `0225` maken policies
en een trigger op die tabel; `0223`, `0224` en `0226` zouden op zichzelf wél
gaan, maar `0222` is de eerste van de vijf, **dus stopt de reeks daar**. Ze
alsnog toepassen slaat een gat in het register, en dat is de duurdere kant
(`docs/decisions/2026-09-08-het-gat-is-erger-dan-de-botsing.md`).

⚠️ **Dat corrigeert een regel die sinds 02-09 in QS8-243 stond:** *"een
bouwsessie kan de drift wel meten maar niet opheffen"* was toen weerlegd omdat de
MCP `execute_sql` heeft. De grens ligt scherper dan beide beweringen: **alles in
`public` gaat, alles wat `storage.objects` bezit niet.** De regel staat nu in
`docs/DEPLOY.md` §2.2, want dit komt terug bij elke volgende opslagmigratie.

⚠️⚠️ **Hier stond tot 09-09 `0185`, en dat was 34 migraties naast de
werkelijkheid.** De ronde die `0187` t/m `0219` toepaste is verderop in dit
document wél opgeschreven (zie de vingerafdruktabel), maar deze regel — de eerste
die een nieuwe sessie leest — bleef staan. **Dat is QS8-125 binnen één bestand:
dezelfde stand op twee plekken, en de bovenste liep achter.** `docs:controle`
ving het niet, want hij vergelijkt de drie documenten met elkáár en niet met de
database.

De les die eronder staat, staat er niet voor niets: **vraag het aan de database.**

✅ **De edge-functies zijn op 09-09 om 18:19 UTC gedeployd — het gat is dicht.**
📏 Nagemeten met `list_edge_functions` en niet overgenomen uit de deploy-uitvoer:
alle drie staan op `updated_at = 2026-09-09T18:19:06Z`, 81 uur na de vorige, en
alle drie hebben een nieuwe `ezbr_sha256`. De versies gingen rollover 20 → 24,
doelcoach 17 → 19 en notificaties 15 → 19.

Daarmee is **de getuigemelding van QS8-298 voor het eerst aangesloten**: `0178`
stond al op productie, de code die `getuigenissen_voor()` aanroept stond in de
map, en de gedeployde `notificaties` wist er niets van. Er was geen kapot
onderdeel, dus niets werd er rood van — regel 18 vraag 5 in zijn zuiverste vorm.

⚠️ **Dat het gat dicht is, is niet hetzelfde als dat het gesignaleerd wordt.**
`edge:gedeployd` ziet dit achteráf en alleen als iemand hem draait; hij vraagt
een `SUPABASE_ACCESS_TOKEN` en draait daarom nergens automatisch. Dat is
criterium 2 van QS8-320 en het staat nog open.

⚠️ **De rollover is een apart geval, en `0186` staat er inmiddels op.** `0185`
dropte `activeer_weekplanstap(uuid, date, integer)`, en de gedeployde rollover
roept die vorm nog aan. 📏 Vandaag inert — `weekly_plan_steps` is leeg, dus de
RPC wordt nooit bereikt — maar het scherpt zichzelf zodra er een weekplan komt.
`0186` zet de oude handtekening terug als afgeschreven wrapper, zodat de deploy
een gewone deploy is in plaats van een race (QS8-324).

⚠️ **Die deploy is op 09-09 gedraaid, dus de wrapper mag nu weg.** Dat is geen
opruimwerk maar een grendel die anders verwatert: zolang de driearguments vorm
bestaat, blijft een aanroeper die hem gebruikt onzichtbaar. Vraag vóór het
droppen wél opnieuw of de gedéployde rollover de tweearguments vorm aanroept —
`pg_get_functiondef()` en de gedeployde code, niet de map.

Vraag de database welke migraties er staan, niet dit document.

⚠️ ~~**`0187` staat sinds 07-09 in de map en nog niet op productie**~~ —
✅ **toegepast in de ronde van 09-09** (QS8-314).
`guard_group_member_update()` werpt daar nu in plaats van gewijzigde kolommen
stil terug te zetten.

⚠️ **De uitzondering die 0187 daarnaast invoerde is met `0204` weer weg**
(QS8-325, 08-09): `group_members.status` kent alleen nog `active` en `inactive`.
`paused` had geen schrijver en vier lezers, en de adempauze die het product
bedoelt zit per doel in `breathers`. Waarom hij weggaat en niet een schrijver
krijgt, staat in
`docs/decisions/2026-09-08-paused-was-de-adempauze-op-de-verkeerde-plek.md`.

⚠️ **QS8-261 haalde een instelling weg die niets deed**, en de reden staat in
`docs/decisions/2026-09-02-een-instelling-die-niets-deed.md`. Het patroon is er
een om te kennen: *"Notitie én bijlage"* bestond op zes plekken en werd op nul
plekken afgedwongen. Niets was kapot, dus niets werd rood.

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
   ✅ **Op 02-09 is productie bijgetrokken, in twee rondes: `0139` t/m `0146` en
   daarna `0147` t/m `0149`.** Allebei toegepast met `execute_sql` en nagemeten
   tegen een lokale opbouw uit dezelfde bestanden — zeven catalogi per ronde.
   ⚠️ **Er staat hier met opzet geen getal:** dat verschoof die dag drie keer,
   en de map loopt vooruit zodra er een PR landt. Vraag het aan de database en
   niet aan deze regel. Zie §2.
   ⚠️ **Wat er dan nóg openstaat vraagt Quintens machine:** drie Edge Functions
   deployen (`doelcoach`, `rollover`, `notificaties`) en `password_min_length`
   in het dashboard. Migraties alleen zijn de feature niet.
   ⚠️ **`notificaties` is er sinds QS8-298 een met een naam erbij:** die deploy
   ís de vijfde meldingsoort. Migratie `0178` verruimt de CHECK en `regels.ts`
   draagt de tekst, maar zolang de oude functie draait stelt niemand de vraag
   `getuigenissen_voor()` — dan staat er een feature die niets doet. Zelfde vorm
   als QS8-292 en QS8-124.
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
   **Ruim duizend tests** in de RLS-suite en **ruim drieduizend** in de hele
   suite, over zo'n 250 bestanden.
   ✅ **En dat geldt sinds QS8-270 zonder dat je `PGPORT` hoeft te zetten.**
   Drie bestanden stonden op de verkeerde poort en sloegen zichzelf stil over:
   870 geslaagd en 31 overgeslagen, met exitcode 0. Dertig tests terug.
   ⚠️⚠️ **Hier stond tot 06-09-2026 het exacte getal, en dat is er met QS8-302
   uitgehaald.** 📏 Die regel is op één dag **bij zeven van de zeven merges** een
   conflict geweest. De oorzaak is niet dat hij met de hand bijgewerkt werd —
   QS8-284 had gelijk dat een generator dat niet oplost, want een gegenereerd
   blok botst net zo hard en het getal is pas juist ná een volledige run. De
   oorzaak is dat een **exact** getal verandert bij elke test die erbij komt, en
   dus bij vrijwel elke merge. Een orde van grootte verandert zelden, en voor de
   overdracht is dat genoeg: §2 is de stand en niet het archief.
   **Wil je het exacte getal, draai dan `npm run tellers`** — dan heb je het
   bovendien van nú in plaats van van de laatste keer dat iemand het opschreef.
   **Meet ze dus, tel ze niet op:** bij het samengaan met `main` is het antwoord
   `npm run poort` of `npm run tellers`, nooit het hoogste van twee getallen.
<!-- POORTSTAND:BEGIN — gegenereerd door `npm run poortstand` -->
Typecheck, lint en alle 49 controlescripts groen;
`npm run poort` meldt 53 stappen.
<!-- POORTSTAND:EINDE -->
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
    langs §4.** QS8-195 en QS8-211 zijn af (31-08), en QS8-213 op 03-09: de
    profiel-onboarding vraagt nog twee dingen in plaats van zeven, en de tijdzone
    staat er als regel tekst met een correctiepad ernaast. QS8-208 volgde: de drie
    schermen die op de Doelcoach wachten laten nu zien dat ze wachten, met een
    uitweg die de job laat doorlopen. QS8-221 haalde de ISO-datums van het scherm:
    datums en tijden volgen nu de notatie van het toestel, met de opmaak op één
    plek in `shared/time`. QS8-218 haalde de gedachtestreepjes uit beide catalogi
    en zette er `npm run streepje:controle` op, en QS8-219 bracht de
    `levend`-ratel van 27 naar 21. QS8-202 laat het weekoverzicht zeggen dat een
    weekpas je reeks gered heeft, en verschoof dat overzicht naar ná de
    coulanceperiode: daarvóór is die vraag per definitie nee. Daarna
    QS8-200/QS8-201. Wat
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
Migraties `0001` t/m `0231` staan in de map: **234 bestanden**,
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

✅ **`0147` t/m `0149` zijn er later diezelfde dag achteraan gegaan** (QS8-186,
QS8-262 en QS8-264). Het register stond bij die meting op **152 rijen tot `0149`**.
Zelfde werkwijze, en opnieuw zeven catalogi nagemeten: zes byte-voor-byte gelijk,
en de acht functies uit die drie migraties komen **ruw** overeen — commentaar en
al. Genormaliseerd over alle 168 functies is de sómhash aan beide kanten
`0cba586b0747e69cc2c305912bac7d36`.

✅ **`0150` t/m `0172` zijn op 06-09 toegepast — drieëntwintig in één ronde, met
een `pg_dump` van Quintens machine vooraf.** Zelfde werkwijze als de twee rondes
hiervoor: `execute_sql` per migratie, in volgorde, met een handmatige registerrij
erbij. Het register staat op **175 rijen van `0001` tot `0172`**, nul
tijdstempels, nul dubbele versies — gelijk aan de 175 bestanden die er voor dat
bereik liggen.

⚠️ **De transcriptie is de zwakke plek van deze route en die is deze keer
gemeten in plaats van aangenomen.** De SQL gaat door een sessie heen en niet
door een pipe; QS8-220 bestaat omdat een eerdere ronde functies met een
ingekorte body toepaste. Daarom na élke migratie `md5(pg_get_functiondef())`
naast de lokale stack gelegd, die uit dezelfde bestanden is opgebouwd. **Alle
vierentwintig functies uit deze ronde komen byte voor byte overeen.**

📏 En de catalogi ernaast, over het hele schema:

| Wat | Lokaal | Productie |
|---|---|---|
| kolommen | 360 | 360 |
| constraints | 240 | 240 |
| indexen | 140 | 140 |
| policies | 92 | 92 |
| triggers | 47 | 47 |
| tabellen met RLS | 40 | 40 |
| **sómhash over alle policy-expressies** | `5fb73f48…` | `5fb73f48…` |

Wat er die ronde afweek, was verklaard door migratie `0182` (toen `0175`), die
op dat moment nog niet was toegepast: de foreign key `ai_jobs_goal_id_fkey` —
productie `on delete cascade` uit `0001`, lokaal `set null` — en het
functieaantal (179 op productie, 184 lokaal = 179 + drie nieuwe + de twee shims
die alleen in de teststack bestaan).

✅ **De vijf bewakingsfuncties geven op productie nul bezwaren**:
`archiefleesgat()`, `barrierelezers()`, `sleutelzetters()`, `definer_bewaking()`
en `realtime_bewaking()` (geen enkele tabel op `REPLICA IDENTITY FULL`).

✅ **Productie staat op 07-09 op `0183`.** Elf migraties in één ronde — `0173`
t/m `0183` — met dezelfde werkwijze en dezelfde verificatie als de ronde
ervoor: `execute_sql` per migratie, handmatige registerrij, en na afloop
`md5(pg_get_functiondef())` naast de lokale stack.

📏 **Alle twintig functies uit deze ronde komen byte voor byte overeen.** En de
catalogi:

| Wat | Lokaal | Productie |
|---|---|---|
| kolommen | 361 | 361 |
| constraints | 242 | 242 |
| indexen | 142 | 142 |
| policies | 92 | 92 |
| triggers | 47 | 47 |
| tabellen met RLS | 40 | 40 |
| **sómhash over alle policy-expressies** | `609fcd17…` | `609fcd17…` |
| **sómhash over alle constraintdefinities** | `f720824c…` | `f720824c…` |

Het register telt **186 rijen tot `0183`**, gelijk aan de 186 bestanden in de
map. Nul tijdstempels, nul dubbele nummers, geen gat.

⚠️ **De sómhash over álle functies wijkt nog steeds af, en dat is de oude
QS8-220-drift** — functies van vóór `0139` die een eerdere sessie met een
ingekorte body heeft toegepast. Niets uit deze ronde zit erin; dat is per functie
nagemeten en niet afgeleid uit het totaal.

✅ **Acht bewakingsfuncties geven nul bezwaren op productie**: `archiefleesgat()`,
`barrierelezers()`, `sleutelzetters()`, `definer_bewaking()`,
`tijdstempel_bewaking()`, `volgorde_bewaking()`, `goal_events_bewaking()` en
`realtime_bewaking()` (geen enkele tabel op `REPLICA IDENTITY FULL`).
`ai_dag_budget_cent()` geeft 30.

✅ **Productie staat op 09-09 op `0219`, en voor het eerst is de vingerafdruk
op álle negen regels gelijk.** `0187` t/m `0219` zijn in één ronde toegepast —
drieëndertig migraties — met dezelfde werkwijze als de rondes ervoor:
`execute_sql` per migratie, vanaf het eerste uitvoerbare teken en verder
woordelijk, met een handmatige registerrij als eindmarkering. Die markering doet
dubbel werk: hij registreert de migratie én hij valt om zodra de tekst onderweg
is afgekapt.

📏 De vergelijking is deze keer niet per functie gedaan maar met
`scripts/schema-vingerafdruk.sql`, aan beide kanten, tegen een lokale stack die
uit dezelfde bestanden is opgebouwd:

| Soort | Aantal | Vingerafdruk (lokaal = productie) |
|---|---|---|
| kolommen | 360 | `b057390c…` |
| constraints | 245 | `169a939d…` |
| indexen | 154 | `e8b1c5aa…` |
| policies | 91 | `a7690d7b…` |
| functies | 249 | `88a0c43b…` |
| triggers | 83 | `85b8ab10…` |
| rechten | 3207 | `b8bd0f34…` |
| publicatie | 3 | `e3bf02a0…` |
| tabellen met RLS | 40 | `f2457330…` |

Het register telt **222 rijen van `0001` tot `0219`**, gelijk aan de 222
bestanden in de map: nul tijdstempels, nul dubbele nummers, geen gat.

⚠️⚠️ **De QS8-220-drift is hiermee weg, en dat is de vondst van deze ronde.** De
twee rondes hiervoor noteerden allebei dat de sómhash over álle functies bleef
afwijken — functies van vóór `0139` die een eerdere sessie met een ingekorte body
had toegepast. Die regel klopt niet meer: de functieregel van de vingerafdruk is
aan beide kanten `88a0c43b…` over alle 249. Omdat die hash commentaar en witruimte
wegnormaliseert, is dit precies de bewering die telt — een ingekorte body
overleeft die normalisatie niet.

✅ **En dat laatste is op 09-09 alsnog bewezen én rechtgezet — QS8-220 is
daarmee af.** De regel hierboven zei nog: *"wat er níet mee bewezen is, is dat
het commentaar ín de functielichamen aan beide kanten identiek is"*, want de
vingerafdruk strípt dat met opzet. Nagemeten met `functie_vingerafdrukken()` aan
beide kanten — de RPC die `functies:controle` zelf gebruikt, en die naast de
genormaliseerde `kaal` ook een rúwe `md5(prosrc)` geeft — tegen een lokale stack
uit `0001` t/m `0221`, precies het niveau waar productie op staat.

**Vijfentwintig functies zijn hersteld en de twee vingerafdrukken zijn nu aan
beide kanten over alle 249 gelijk**, per beginletter vergeleken: 23 emmers,
telling én hash gelijk op `kaal` én op `ruw`. `vergelijkFuncties()` geeft daarmee
op alle vier zijn lijsten leeg — geen logicaverschil, geen commentaarverschil,
niets dat maar aan één kant bestaat.

📏 De vijfentwintig vielen in drie klassen, en alleen de eerste is de klasse die
QS8-220 zelf beschreef:

| Klasse | Aantal | Hoe gevonden |
|---|---|---|
| álle `--`-regels kwijt | 18 | het aantal functies mét commentaar: 96 op productie, 114 lokaal |
| een déél van de regels kwijt | 3 | `badge_na_gebeurtenis` 9↔13, `invite_preview` 16↔20, `meld_ketting_mijlpaal` 2↔19 |
| ruw anders, commentaar even lang | 4 | drie puur witruimte, en `verdien_badges` met een verouderde formulering |

⚠️⚠️ **De middelste klasse is de vondst.** QS8-220 telde functies zónder
commentaar, en dat is een controle die functies mist die er wát van kwijt zijn —
precies de vorm van onwrikbare regel 18. Drie zaten er zo verstopt, en
`meld_ketting_mijlpaal` hield er 2 van de 19 over. De scherpere meting is het
áántal `--`-markeringen per functie naast elkaar leggen, niet de vraag of het er
nul zijn.

⚠️ En de vierde klasse leert iets over `verdien_badges`: `kaal` was gelijk en
`ruw` niet, terwijl er aan beide kanten acht `--`-regels stonden. Productie droeg
de óude formulering van de `best_streak`-notitie. Een teller vindt dat nooit;
alleen een vergelijking van de tekst zelf.

⚠️ **`npm run functies:controle` is niet als script gedraaid** — deze container
heeft geen `SUPABASE_SERVICE_ROLE_KEY`, dus hij meldt `OVERGESLAGEN`. Wat er
gedraaid is, is zijn vergelijking: dezelfde RPC aan beide kanten, en een emmer
per beginletter is voor `vergelijkFuncties()` een volledige rijvergelijking —
gelijke telling én gelijke hash over `naam|kaal|ruw` laat geen verschil over.

⚠️ **Opnieuw geen `pg_dump` vooraf** — de container heeft geen `SUPABASE_DB_URL`.
Dat is dezelfde afwijking van onwrikbare regel 20 die de ronde van 02-09 ook
noteerde, en geen detail. Wat het risico deze keer klein hield is gemeten en niet
aangenomen: één gebruiker, nul punten-, voltooiings-, chat-, lidmaatschaps- en
pushtokenrijen, en de drie migraties met DML op tabelniveau (`0204`, `0211`,
`0213`) raakten alle drie een lege tabel.

⚠️ **`0219` landde op `main` terwijl deze ronde liep** (PR #344) en is er meteen
achteraan gegaan. Dat is de vorm van QS8-318 in een andere gedaante: een ronde
die "de achterstand inhaalt" heeft geen eindpunt zolang `main` doorloopt. De
enige stand die klopt is de gemeten stand, niet het getal dat je aan het begin
opschreef.

**De drie Edge Functions lopen nog achter, en dat is de rest van QS8-243.**
📏 Per bestand gemeten tegen `main` met `get_edge_function`:

| Functie | Gedeployde bestanden | Anders dan de repo |
|---|---|---|
| `rollover` | 8 | 6 — en `_shared/bladeren/index.ts` ontbreekt er helemaal |
| `doelcoach` | 6 | 4 |
| `notificaties` | 11 | 7 |

`_shared/melden.ts` en `_shared/time/types.ts` zijn de enige die overal gelijk
liepen. `npm run edge:sync:controle` is groen, dus de veertien gedeelde kopieën
in `supabase/functions/` lopen wél gelijk met `src/` — de achterstand zit
uitsluitend tussen de repo en het project.

⚠️ **Dit deel vraagt Quintens hand en er is bewust géén omweg voor gebouwd.**
`npm run edge:gedeployd` en `npx supabase functions deploy` vragen allebei een
`SUPABASE_ACCESS_TOKEN`, en dat is een personal access token en niet de
service-role-key. De MCP heeft wél een `deploy_edge_function`, maar die vraagt
elk bestand van de importsluiting inline: 108 KB voor `rollover`, 104 KB voor
`doelcoach` en 164 KB voor `notificaties`. Dat met de hand overtypen is precies
de transcriptieroute die QS8-220 heeft opgeleverd, en dan op de job die beslist
of iemands week telt.

⚠️ En het is alles of niets: `rollover` en `notificaties` delen
`_shared/time/cycle.ts`. Eén van de twee bijwerken zet twee jobs op verschillende
weekgrenzen, en dat is precies wat domeinregel 1 verbiedt.

⚠️ **De landingsvolgorde van 06-09 is achterhaald en dat is leerzaam.** Er stond
hier: QS8-295 → QS8-176 → QS8-296, met `0173` t/m `0175` als de drie die nog
moesten. 📏 Nagemeten op 07-09:

* **QS8-295 is ingehaald** door QS8-299 — het bredere vervolgissue dat er zelf
  uit voortkwam. Main's `0173` dekt alle vier tabellen met identieke
  kolomlijsten, en `tijdstempel_bewaking()` bewaakt de klasse in plaats van de
  vier gevallen. Die branch is niet geland; het issue staat op Done met de
  meting eronder.
* **QS8-176 is geland** als `0181`, na een tweede hernummering.
* **QS8-296 is `0182`** geworden, na dezelfde behandeling.

⚠️ **Main liep er in één nacht tweemaal overheen.** Dat is geen slordigheid van
één sessie maar de vorm: een branch die een nummer draagt en blijft liggen,
botst met alles wat er daarna landt. `npm run claim` dekt het issue, niet het
migratienummer — QS8-310 gaat daar overheen.

⚠️ **En schrijf hier geen getal op als stand.** Dit blok zei een uur lang "de map
en productie lopen gelijk", en dat was achterhaald voordat de PR die het schreef
geland was. Drie keer op één dag verschoof het getal. De map loopt per definitie
vooruit zodra er een PR landt: **vraag het aan de database, niet aan deze regel.**

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
`scrubMessage()`-reparatie van 28-08 zit in `supabase/functions/_shared/`, en
sinds 07-09 (QS8-319) ook `beschrijfFout()` — de plek waar besloten wordt dat de
melding van een serverfout níét meegaat. Een gedeployde bundel verandert daar
niet van. Doe dat met
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

✅ **De grondwet is op 02-09 opgeschoond — QS8-265, PR #156 en #158.** `CLAUDE.md` ging van 13.348
naar 10.187 tokens — een kwart eruit, en geen enkele regel. Wat eruit ging was de
uitgeschreven geschiedenis: de zeven gevallen bij regel 18, de drie redenen waarom
de security-reviewer nooit wacht, de meting van 109 migraties op idempotentie, het
geval `seizoensrecap_cijfers()`, de vier botsende migratienummers, PR #1 en
PR #100. Die 28 blokken staan **verbatim** in
`docs/decisions/2026-09-02-de-geschiedenis-achter-de-grondwet.md`.

Dat is de eigen eigendomsregel op zichzelf toegepast: `CLAUDE.md` bezit de regels,
dit document bezit de stand, en geen van beide bezit het verhaal.

⚠️ **Waarom dit in de werkvoorraad staat en niet alleen in een beslisdocument:**
het bestand wordt bij élke turn als cache-read betaald en bij élke subagent-start
koud ingelezen, dus de omvang is een eigenschap van hoe dit project werkt. Drie
dingen die daaruit volgen en die je merkt:

- **Subagents lezen `CLAUDE.md` niet meer in** — ze krijgen de volledige
  hiërarchie automatisch. De instructie stond bij backend-, frontend-engineer en
  spec-planner en haalde hem een tweede keer binnen.
- **Zeven ongebruikte MCP-servers zijn geblokkeerd** in `.claude/settings.json`
  (Gmail, Agenda, Drive, Plaud, Zoom, n8n, Firecrawl): 269 tool-namen werden er
  162. `github`, `Linear` en `Supabase` blijven.
- **De gstack-sectie is weg.** Die beloofde 38 skills waarvan er geen één
  geïnstalleerd was.

⚠️ **Eén tegenspraak kwam daarbij boven en is rechtgezet:** `/verder` voerde een
architectuurkeuze op als stopvoorwaarde en citeerde de lijst *"Wat je NOOIT doet
zonder te vragen"*, een sectie die `CLAUDE.md` op 22-08 heeft vervangen door
Beslisbevoegdheid. Het commando stuurde dus aan op stoppen waar de grondwet zegt
doorbouwen. **Gevolg om te weten:** "een migratie op iets anders dan lokaal
draaien" is daarmee geen stopvoorwaarde meer — conform de grondwet, maar het
vergroot de bewegingsruimte. Staat als Laag-rij in `docs/ENGINEER-REVIEW.md`.

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

### 2b. Tien branches zonder PR — 09-09-2026, en dit is de derde keer

📏 Gemeten op 09-09 om 10:35 UTC, met `main` op `fc78e1f`: **tien issues staan op
`In Review`, hebben een gepushte branch met afgerond werk, en er is nooit een pull
request voor geopend** — niet open, niet gesloten, niet gemerged. Zes ervan dragen
een migratienummer dat `main` intussen aan iets anders vergeven heeft.

De volledige tabel — leeftijd, commits buiten `main`, migraties, en het besluit
per branch met de nummers waarheen ze hernummerd moeten worden — staat bij
**QS8-384**. Hier staat alleen de stand, want die tabel verandert bij elke merge.

⚠️ **Twee stapels, en de volgorde ligt vast:** QS8-322 → QS8-333 → QS8-335, en
QS8-332 → QS8-361 → QS8-364. Elke branch bevat de vorige, dus hernummeren van de
onderste laag trekt de bovenliggende mee. De vier zonder migratie (QS8-338,
QS8-346, QS8-350, QS8-358) kunnen los en zonder hernummeren.

⚠️ **`In Review` liegt hier twee kanten op**, en dat is de scherpste les van deze
ronde. Tien issues stonden erop zónder PR; QS8-353 stond erop terwijl PR #302
gewoon gemerged was en het werk in `main` stond. De status volgt de werkelijkheid
in geen van beide richtingen vanzelf. Op 09-09 rechtgezet: de acht inactieve naar
`In Progress`, QS8-353 naar `Done`, en QS8-333 en QS8-335 met opzet ongemoeid —
die zijn 4,7 uur oud en mogelijk in de lucht.

⚠️ **Dit is dezelfde vorm als §2a hierboven** (QS8-131, 24-08) en als QS8-237.
Drie keer dezelfde klasse, en hij keert terug omdat er geen signaal op staat maar
alleen een gewoonte. Het signaal wordt gebouwd in **QS8-385**; dat issue is
afgesplitst omdat de meting en het gereedschap twee dingen zijn.

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
   ✅ **Sinds QS8-270 hoef je dat niet meer met de hand te zien voor de vier
   bestanden die psql gebruiken:** die vállen om zodra `RLS_DOEL` gezet is en de
   database onbereikbaar is. Voor de rest van de groep blijft het aflezen jouw
   werk — zie de rij van 04-09 in `docs/ENGINEER-REVIEW.md`.

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
**Begin daar, niet in Linear.**

⚠️ **Deze lijst stond tot 06-09-2026 vijf bevindingen te noemen die grotendeels
al af waren.** Dat is de gevaarlijkste vorm die een overdrachtsdocument kan
hebben: een sessie die hem gehoorzaam volgt, begint aan werk dat er niet meer is,
en de rest van het bestand verliest daarmee zijn geloofwaardigheid. Elke regel
hieronder is op 06-09 opnieuw **gemeten** — tegen de draaiende database en de
bestanden, niet tegen dit document.

✅ **Drie zijn helemaal dicht:**

- ~~Elf tabellen dragen schrijfgrants zonder bijbehorende policy en
  `schrijfrechten_bewaking()` kent een hardgecodeerde lijst van vier.~~
  📏 `schrijfrechten_bewaking()` geeft **nul rijen** en is generiek sinds `0118`
  (QS8-151).
- ~~`te_beoordelen_voor()` is een autorisatiegrens zonder inhoudelijke test.~~
  Die test staat er: `tests/rls/beoordelingsgrens.test.ts`.
- ~~49 policies evalueren `auth.uid()` per rij in plaats van via
  `(select auth.uid())`.~~ 📏 **Nul van de 61** doet het vandaag per rij; alle 61
  gaan via een InitPlan sinds `0122` (QS8-153).

  ⚠️ **Bij die laatste heb ik mezelf eerst voor de gek gehouden**, en dat hoort
  hier omdat het een meetfout is die iedereen hier kan maken: mijn eerste query
  gebruikte `~` in plaats van `~*` terwijl `pg_get_expr()` `SELECT` in kapitalen
  teruggeeft. Uitkomst: "61 van de 61 fout" waar het "61 van de 61 goed" is.
  **Een regex over catalogusuitvoer is hoofdlettergevoelig tenzij je het
  tegendeel schrijft.**

✅ **De laatste is op 06-09-2026 gesloten (QS8-296, migratie 0182):**

- ~~**Het AI-dagquotum telt nog steeds jobs en geen tokens** — `ai_verbruik()`
  doet `count(*)`.~~ De poort weegt sinds 0182 **dollarcent** en telt geen rijen:
  `ai_dag_budget_cent()` = `ai_dag_limiet()` × `ai_job_voorschot_cent()`, en elke
  job kost `greatest(coalesce(cost_cents, 0), voorschot)`. De bodem is de helft
  die de invoerkant dekt — een job zonder bedrag (queued, running, failed, of een
  meting die op nul uitkwam) eet meteen budget, dus een burst komt er niet langs.
  📏 Plafond per gebruiker per dag: van ≈88 cent naar 30 cent plus hoogstens één
  job overschot. Tien gewone jobs passen nog steeds; tien máximale worden er drie.
  Zie `docs/decisions/2026-09-06-een-quotum-dat-telt-weegt-niets.md`.
  📏 De tekstkolommen daarentegen zijn wél begrensd sinds QS8-118: `commitments.body`,
  `week_review_replies.body`, `milestone_tips.body` en `deadline_requests.reason`
  dragen allemaal een `char_length`-CHECK. Twee `text`-kolommen hebben er geen —
  `ai_jobs.error` (door de server geschreven) en **`push_tokens.token`**. ⚠️ Dat laatste heb ik
  eerst verkeerd samengevat als *"een client schrijft hem zelf"*; dat klopt niet
  — `authenticated` heeft geen INSERT of UPDATE op die tabel, en de enige
  schrijver is `registreer_push_token()`. Wat de client wél doet is de wáárde
  meegeven, en dáár ontbreekt de bovengrens. Opgepakt als **QS8-297**.
- **Van de vijf "onbereikbare features" zijn ze inmiddels alle vijf beantwoord.**
  📏 Gemeten: een doel bewerken kan via `app/doel/bewerk/[id].tsx`, een mijlpaal
  via `/doel/weekdoelen/[id]?mijlpaal=`, ledenbeheer heeft `app/groep/leden` en
  `app/groep/beheer`, en `commitment_events` wordt gelezen in `app/doel/[id].tsx`.
  ⚠️ **En de vijfde was helemaal geen bevinding — die correctie is van 06-09.**
  Ik schreef hier eerst dat `ai_kosten_per_week()` overbleef omdat hij geen
  aanroeper heeft. 📏 Nagemeten: hij bestáát wél (`ai_kosten_per_week(p_weken
  integer default 8)`), en hij is `service_role=true`, `authenticated=false`.
  Dat is geen dode code maar een **ops-functie**, en `keten:controle` draagt de
  reden woordelijk: *"wat de Doelcoach kost, over álle gebruikers samen — bewust
  niet voor `authenticated`: het totaal verraadt hoeveel anderen de coach
  gebruiken."* Een functie met een register-verdict is beantwoord, niet
  vergeten.

⚠️ **De les die blijft.** Deze vijf regels zijn niet verouderd doordat iemand
slordig was, maar doordat een reparatie werd geland zonder dat dit blok
meebewoog — de rij in `docs/ENGINEER-REVIEW.md` werd wél doorgestreept. **Sluit
je een dossierrij, grep dan op dat feit in dit bestand voordat je klaar bent**;
dat is dezelfde afspraak die bovenaan `CLAUDE.md` staat, en hier is hij vijf keer
overgeslagen.

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
| `npm run types:db` draaien | Regenereert `src/lib/database.types.ts` uit het echte project. Een sessie in de cloudcontainer kán dit niet: het vraagt én een productietoken én een draaiende Docker-daemon, óók met `--db-url`. Tot dat gebeurt staan er handmatige handtekeningen in het bestand (zie §2), en **een handmatige regel die niemand meer als handmatig herkent, is precies hoe de repo en het project uit elkaar gaan lopen** | open — productie is sinds 09-09 bij (zie §2), dus dit loopt achter op álles vanaf `0120` |

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

    ⚠️ **Dezelfde fout draagt in een rapport een ander gezicht, en die staat als
    valkuil in `docs/VOLGENDE-SESSIE.md`** — *een getal leest als gemeten, ook als
    het geraden is* (QS8-265, 02-09). Bij een diagnose voelt het gokken nog als
    gokken; bij een bevinding met een zwaartekolom ernaast niet meer.

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
