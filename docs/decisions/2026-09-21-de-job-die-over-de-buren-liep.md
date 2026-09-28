# De job die over de buren liep — QS8-577

**21-09-2026.** Drie databasefuncties in dit schema doen hun werk over de héle
database als je ze niet afbakent. In `tests/` werden ze op acht plaatsen zo
aangeroepen. Dit document draagt wat er gemeten is, waarom de controle eruitziet
zoals hij eruitziet, en wat hij met opzet niet ziet.

## De rij schreef zijn eigen voorwaarde op, en die trad in

De dossierrij van **08-09-2026** in `docs/ENGINEER-REVIEW.md` (QS8-348):

> **Wordt zwaarder als:** er een derde bestand bijkomt dat een globale job
> aanroept — er is geen controle die een ongescopeerde aanroep van
> `maak_seizoensrecaps`, `slaap_stille_groepen` of
> `keur_vastgelopen_goedkeuringen_goed` in een testbestand meldt.

📏 Dertien dagen later waren het **vijf bestanden en acht aanroepen**, en er is
in die dertien dagen niets rood geworden. QS8-339 en QS8-348 ruimden allebei de
instanties op en lieten het mechanisme staan — CLAUDE.md noemt die vorm met
zoveel woorden: *een reparatie die de instanties opruimt en het mechanisme laat
staan, groeit terug.*

⚠️ **En de rij wees het verkeerde bestand aan.** Hij noemde
`seizoensrecap-per-groep.test.ts`; 📏 dat bestand roept `maak_seizoensrecaps()`
vandaag juist alléén nog mét zijn grens aan. De ene instantie die de rij kende
was opgelost, de klasse was gegroeid, en de rij stond er nog precies zoals hij
geschreven was. **Een rij die een voorbeeld noemt in plaats van een eigenschap,
veroudert op het voorbeeld.**

## Wat een globale job is — drie eisen, en twee ervan zijn er pas na een meting

Acceptatiecriterium 2 vroeg om de **handtekening** als bron in plaats van een
handgeschreven lijst. Dat is gedaan, en het was twee keer niet genoeg.

Een globale job is een functie in `public` die (1) een parameter
`<naam> uuid DEFAULT NULL` of `<naam> uuid[] DEFAULT NULL` draagt, (2) **zonder
enig argument** aanroepbaar is, en (3) níet door `authenticated` uitgevoerd mag
worden. 📏 Dat geeft er vandaag vijf:

| functie | grens | in de testboom |
| --- | --- | --- |
| `maak_seizoensrecaps` | `p_group_ids` | 3 aanroepen ongescopeerd, 1 gescopeerd |
| `slaap_stille_groepen` | `p_group_ids` | 2, waarvan 1 gescopeerd |
| `keur_vastgelopen_goedkeuringen_goed` | `p_owner_ids` | 3, waarvan 2 gescopeerd |
| `herstel_weekdoelstatus` | `p_goal_id` | 5, allemaal al gescopeerd |
| `weekdoelstatus_afwijkingen` | `p_goal_id` | allemaal al gescopeerd |

⚠️⚠️ **Eis 3 houdt twee functies buiten die de vorm wél dragen.** 📏 Zonder de
grantclausule geeft de vraag er zeven: `weekpas_standen(p_goal_ids uuid[]
DEFAULT NULL)` en `openstaande_beoordelingen(p_na_id uuid DEFAULT NULL)` komen
erbij, en allebei filteren op `auth.uid()` — `NULL` betekent daar *"al mijn eigen
rijen"*. De controle meldt dan **10** aanroepen die niets mis hebben.

⚠️⚠️ **Eis 2 houdt de spiegelzijde buiten.** 📏 Zonder de clausule
`pronargs = pronargdefaults` komen `plaats_systeembericht` en
`plaats_systeembericht_in_doelgroepen` erbij, op `p_subject_id` en `p_actor_id`.
Dat zijn geen grenzen maar optionele velden ín een bericht; die functies vragen
verplichte argumenten en zijn nooit kaal aan te roepen. **Aanroepbaar zonder
enig argument** is precies wat een job een job maakt.

⚠️⚠️ **En eis 1 was eerst te smal.** Hij eiste `uuid[]`, en dan vallen
`herstel_weekdoelstatus(p_goal_id uuid DEFAULT NULL)` en
`weekdoelstatus_afwijkingen()` erbuiten — terwijl de kop van
`tests/rls/nevenschade.test.ts` met precies die eerste begint: *"raakte 4 rijen
aan … die vier rijen waren van een ánder bestand"*. **De functie die deze hele
klasse geopend heeft, viel buiten de definitie die hem moest vangen.** Al hun
aanroepen zijn vandaag gescopeerd; er was geen instantie, en er was ook geen
grendel die een terugval zou melden.

**Een detector op vorm vindt de vorm en niet de betekenis.** Alle drie de eisen
zijn meetbaar en geen ervan is een lijst.

⚠️ Wat eis 3 niet toetst: of een functie die `authenticated` wél mag draaien echt
op `auth.uid()` filtert. Zou er zo eentje zonder filter bestaan, dan is dat een
veel zwaarder gat dan kruisbesmetting tussen twee testruns — en dat is het
terrein van `definer_bewaking()` en `definers:controle`.

## Wat de controle in de bron herkent

Twee vormen: `.rpc('<naam>', { … })` en `<naam>( … )` in SQL. Elk ánder voorkomen
van de naam is een **vermelding** en wordt niet beoordeeld.

⚠️⚠️ **Dat onderscheid is de helft van het werk geweest, en het is twee keer
gemeten.**

📏 *Eerste versie.* Zonder onderscheid tussen code en tekenreeks meldde hij
`tests/beloftes/recap-mislukking-verlaat-de-job.test.ts` twee keer, op de zin
*"geen enkele migratie definieert maak_seizoensrecaps(). Hernoemd of
verplaatst?"* — een assertie-boodschap met haakjes erachter, omdat je zo over een
functie schrijft. Twee onterechte rijen op acht echte.

📏 *Tweede versie.* Mét dat onderscheid meldde hij zijn **eigen toetsbestand
twaalf keer**: de voorbeelden daarin zijn `.rpc('…')`-aanroepen in een
tekenreeks. De naam staat bij die vorm per definitie tússen aanhalingstekens —
dat is wat PostgREST vraagt — dus de toets op "staat dit in tekst" moet op het
**haakje van `.rpc(`** staan en niet op de naam. Wat een echte aanroep
onderscheidt van een voorbeeld, is of de aanroep**syntaxis** code is.

⚠️ **Een backtick-sjabloon telt niet als tekenreeks**, en dat is de reden dat dit
een toestandsmachine is en geen regex. SQL leeft hier in sjabloonliteralen, en
dáárbinnen staan weer enkele aanhalingstekens (`'${datum}'::timestamptz`). Wie
`'` blind als opener leest, verklaart de halve SQL tot tekst en mist elke aanroep
erna — dezelfde klasse als de knip van QS8-412.

### ⚠️⚠️ Twee blinde vlekken die de security-review boven kreeg

Beide gemeten, beide gedicht, en beide staan hier omdat ze dezelfde les dragen.

📏 **22 van de 366 testbestanden waren dood voor de controle**, waaronder tien in
`tests/rls/`. Gemeten door aan élk `.ts`-bestand in `tests/` één ongescopeerde
aanroep toe te voegen en te vragen wat de detector ervan vindt. Oorzaak: een
regex-literal als `/'/g` draagt een ongepaard aanhalingsteken, en de
toestandsmachine liep vanaf die regel de rest van het bestand uit de pas. Een
`'`- of `"`-tekenreeks kán in JS niet over een regeleinde lopen, dus de
regelgrens is de herstelpoort; een sjabloon mag dat wél en wordt niet gesloten.
📏 Na de reparatie: **0 van de 366**.

📏 **Een meerregelige `.rpc(` was onzichtbaar vanaf zes spaties inspringing** —
de opmaak die prettier maakt zodra de regel te lang wordt. De herkenning keek
twaalf tekens terug vanaf de naam, en dan valt de punt buiten beeld. Die vorm
staat drie keer in deze testboom en één keer in
`supabase/functions/rollover/index.ts`. Nu zoekt hij terug naar het haakje.
📏 Na de reparatie gevonden bij 0, 2, 4, 6 en 8 spaties.

⚠️⚠️ **De les is dezelfde als bij `rls:dekking`:** de eerste versie was gemeten
op de acht aanroepen die er stonden, en die acht werden alle acht gevonden. **Een
detector die je alleen op de bestaande gevallen meet, meet dat de bestaande
gevallen bestaan.** Wat hem boven kreeg was hem élk bestand los voeren — precies
wat CLAUDE.md eist van een controle die je wilt kunnen ijken.

⚠️ **En een derde, kleiner maar van dezelfde soort:** `{ p_group_ids: null }`
telde als grens. 📏 Alle vijf de lichamen doen `p_x is null or …`, dus dat is bit
voor bit gelijk aan hem weglaten — en het is de goedkoopste manier om deze
controle het zwijgen op te leggen zonder iets op te lossen. Een lege `[]` mag wél
door: die raakt niets.

### Wat hij niet ziet, opgeschreven in plaats van weggelaten

- Een grens die pas binnen een `${…}` ontstaat.
- Een aanroep via een variabele (`const job = 'maak_seizoensrecaps'; db.rpc(job)`).
- **Twee identieke aanroepen in hetzelfde bestand zijn één registersleutel.** De
  sleutel is `pad: aanroep`, dus een uitzondering voor de ene stelt ook de andere
  vrij. Dat is vandaag onschadelijk — er staat geen enkel paar in het register —
  en het is de prijs voor een sleutel die niet meedrijft met elke ingevoegde
  regel. Een regelnummer zou dat wél doen, en QS8-561 heeft net zeven van die
  verwijzingen opgeruimd.

## De ijking — dertien mutaties, elk apart

De stand vóór elke mutatie, elke keer opnieuw gemeten: **controle groen (0
rijen), 37 toetsen groen.**

| # | mutatie | controle | toetsen |
| --- | --- | --- | --- |
| 1 | `p_owner_ids` uit `vastgelopen.test.ts` | 1 rij | — |
| 2 | de grantclausule uit `VRAAG` | 11 rijen | — |
| 3 | `pronargs = pronargdefaults` uit `VRAAG` | 0 rijen | — |
| 4 | `tekstposities()` geeft alles vrij | 24 rijen | 3 |
| 5 | de regelgrens uit `tekstposities()` | 0 rijen | 1 |
| 6 | de haakjestoets op `.rpc(` weg | 15 rijen | 1 |
| 7 | het venster van twaalf tekens terug | 0 rijen | 2 (6 en 8 spaties) |
| 8 | `isLeeg()` kent `null` en `undefined` niet meer | 0 rijen | 6 |
| 9 | `grensWaarde()` valt terug op de positie | 16 rijen | 3 |
| 10 | `haakjesInhoud()` slaat SQL-tekst niet meer over | 0 rijen | 1 |
| 11 | `argumenten()` telt geen diepte meer | 0 rijen | 1 |
| 12 | één registerrij weg | 1 rij | — |
| 13 | een registerrij die nergens op slaat | 1 rij | — |

⚠️ **Mutatie per grendel en niet één voor de controle.** Bij 4 t/m 11 viel
telkens precies de toets om die de mutatie noemt en geen andere.

⚠️⚠️ **Mutatie 3 maakt niets rood, en dat staat hier in plaats van dat de rij
weggelaten is.** Zonder die clausule zou de controle vier extra "grenzen" gaan
bewaken (`p_subject_id` en `p_actor_id` van de twee systeembericht-functies), en
📏 vandaag geeft élke aanroep daarvan die er staat die velden mee — dus er
verschijnt geen rij. De clausule dekt een *toekomstige* bron van ruis en geen
huidig geval; zijn ijking is de meting op de catalogus (5 rijen mét, 9 zonder) en
niet een rode toets. **Een grendel zonder rode ijking hoort dat van zichzelf te
zeggen.**

⚠️⚠️ **En de eerste versie van deze tabel klopte niet.** Er stond *"3 →
6 rijen"* waar het er 24 zijn: die meting kwam uit een `head -8` op de uitvoer,
en acht regels min de kop zijn er zes. Dezelfde fout als een afgekapte `grep` die
als volledig gelezen wordt. De tabel hierboven komt uit een script dat élke
mutatie zet, de controle en de toetsen draait, en het bestand daarna uit een
kopie terugzet.

⚠️⚠️ **Wat dat script eerst mat, was zichzelf.** 📏 De eerste versie draaide
vitest met `--reporter=basic`; die reporter bestaat niet in vitest 4, de run brak
af, en de teller las *nul gefaalde toetsen* voor élke mutatie — inclusief de twee
die ik een uur eerder met de hand rood had gezien. **Een instrument dat "niets
werd rood" meldt terwijl er niets gedraaid heeft, is niet te onderscheiden van
een groene meting**, en dat is dezelfde klasse als de OVERGESLAGEN-poort uit
CLAUDE.md.

### ⚠️⚠️ Twee grendels op één vraag met een `or` ertussen zijn samen zwakker

Mutatie 9 bestaat omdat de vraag *"draagt deze aanroep een grens"* eerst met twee
losse toetsen beantwoord werd: een benoemde (`p_group_ids => …`) en een
positionele (genoeg argumenten), met een `||` ertussen. 📏 Gemeten:
`maak_seizoensrecaps(p_op => now(), p_group_ids => null)` kwam er zo doorheen —
de benoemde tak zag terecht een `null`, en de positionele tak zag *twee
argumenten, dus begrensd* en overstemde hem.

Nu is het één vraag: `grensWaarde()` haalt de waarde op (benoemd als die er is,
anders op de positie) en `isLeeg()` beoordeelt hém. 📏 Daarmee vallen ook
`undefined` en `ids ?? undefined` om: supabase-js stuurt zijn argumenten door
`JSON.stringify()`, die laat een `undefined`-waarde vallen, PostgREST krijgt de
parameter nooit en valt terug op `DEFAULT NULL` — bit voor bit hetzelfde
*"alles"*. Twaalf vormen staan los in de toets, de zes die moeten vallen en de
zes die door moeten.

## Wat er gescopeerd is en wat er met reden niet is

Vier aanroepen kregen hun grens:

| bestand | job | grens |
| --- | --- | --- |
| `tests/rls/policies.test.ts` | `slaap_stille_groepen` | `[stille.id]` |
| `tests/rls/tijdzone.test.ts` | `maak_seizoensrecaps` | `[groupId]` |
| `tests/rls/vastgelopen.test.ts` (2x, via 2 helpers) | `keur_vastgelopen_goedkeuringen_goed` | `eigenGebruikers()` |

`eigenGebruikers()` is nieuw in `tests/rls/harness.ts` en leest dezelfde
boekhouding als het opruimen. ⚠️ **Dat is geen gemak maar een keuze:** de vraag
*"wat is van ons"* is precies de vraag die `removeTestUsers()` al stelt, en twee
antwoorden op één vraag lopen uit elkaar. Een lege `uuid[]` is bovendien níet
`null`, dus wie de grens meegeeft vóórdat zijn fixture bestaat, raakt niets en
ziet zijn toets omvallen — de goede kant om op te falen.

📏 `tests/rls/vastgelopen.test.ts` was het zuiverste geval: **vijftien**
aanroepen via twee helpers (tien via `draaiTermijn()`, vijf via `keurGoed()`), en
📏 het bestand draait **niet** in een transactie — nul treffers op `begin` of
`rollback`. Dit is dus niet de vorm van QS8-348 (een transactie die niet
beschermt) maar de kalere variant eronder: geen transactie én geen grens.
(Het beslisdocument zei eerst *tien*; dat was alleen de eerste helper.)

### En vier staan met hun reden in het register

- **`nevenschade.test.ts`, drie aanroepen: de NULL-tak.** 📏 De rollover roept
  alle drie de jobs zónder grens aan — `supabase/functions/rollover/index.ts`
  regel 456, 486 en 587 — en dat is de enige vorm die in productie draait. Scoop
  je deze drie ook, dan toetst niets meer dat *"geen grens"* écht *"alles"*
  betekent. Bij de derde komt er nog iets bij: de kop van die toets zegt *niet
  "hij doet nooit iets" maar "hij doet niets voor een groep waar de aanroeper
  niet op wees"* — de vreemde groep noemen zou die bewering omdraaien.
- **`seizoensrecap.test.ts`, één aanroep.** Die komt van een gewone ingelogde
  gebruiker en de toets eist juist dat hij een fout terugkrijgt. Er valt niets te
  begrenzen aan een aanroep die niet draait.

⚠️⚠️ **De reden die hier eerst stond, klopte niet — en dat is het duurste soort
fout.** Er stond bij alle drie de `nevenschade`-rijen dat hun ijking zou
vervallen als je ze begrensde: de mutatie die hun eigen grendel weghaalt, zou ze
dan niet meer raken. 📏 Nagemeten in `pg_get_functiondef()`: de bereikclausule is
bij alle drie een **pure rijfilter** vóór de rest van het lichaam
(`where … and (p_group_ids is null or id = any (p_group_ids))`), dus voor een rij
die in de array staat is het gedrag bit voor bit gelijk aan `NULL` — en de
mutatie had ze gewoon rood gemaakt. De échte reden bestaat wél; hij stond er
alleen niet. CLAUDE.md: *een afwijking die je onderbouwt is duurder dan een die
je vergeet* — een uitgeschreven argument leest de volgende persoon als een reden
om er niet aan te twijfelen.

⚠️ Het register staat op de **aanroep** en niet op het bestand. Een uitzondering
per bestand zou ook de aanroep vrijstellen die er morgen bijkomt — dezelfde
overweging als in `tellerbereik-controle.mjs`.

⚠️⚠️ **Die vier rijen kosten iets, en dat staat op de agenda in plaats van in
een voetnoot.** De drie `nevenschade`-aanroepen raken bij twee gelijktijdige
runs de rijen van de buren: `keur_vastgelopen_goedkeuringen_goed()` keurt dan de
weken van een andere run goed en boekt er punten bij. Dat is precies de schade
waar QS8-348 over ging, en hij blijft staan onder een rij die op *opgelost* gaat.
Daarom is er een eigen dossierrij van 21-09-2026 mét een **wordt zwaarder als**
— zonder die rij zou dit het patroon zijn dat CLAUDE.md beschrijft: *een
reparatie die de instanties opruimt en het mechanisme laat staan, groeit terug —
en hij doet dat onder een rij die "opgelost" zegt.*

## Wat dit niet oplost

Dit is een controle op `tests/`. Een aanroep zonder grens in `supabase/functions/`
of in `scripts/` valt er niet onder, en dat is met opzet: daar ís "alles" het
bereik — de rollover hoort élke groep te bedienen. De schade die deze controle
adresseert is kruisbesmetting tussen twee suite-runs, en die bestaat alleen in de
testboom.
