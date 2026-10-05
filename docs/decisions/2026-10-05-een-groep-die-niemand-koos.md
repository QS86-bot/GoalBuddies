# Een groep die niemand koos

**Datum:** 05-10-2026 (gebouwd 28-09 t/m 05-10)
**Issue:** QS8-233 — automatisch gekoppeld worden aan buddy's met een gelijkend doel
**Migraties:** `0299`, `0300`
**Raakt:** `groups`, `goal_match_queue`, `mag_melding_als_escalatie()`, `guard_group_update()`, beide zet-RPC's, `app/doel/samen.tsx`

## Wat dit is

Het laatste open deelissue van epic QS8-230. Je vinkt bij je doel aan dat de app
buddy's mag zoeken, je bevestigt wat dat betekent, en je komt in een wachtrij.
Een pas op het uur vormt daaruit groepen van drie tot vijf: dezelfde
doelcategorie, dezelfde periodeband, en **dezelfde week-startdag**.

## De kern: beschermd als constraint en niet als default

CLAUDE.md zegt het in één zin — *een automatisch gevormde groep is beschermd,
altijd, als constraint*. Dit document legt uit waarom dat niet overbodig was.

`groups.zichtbaarheid` was al niet client-schrijfbaar. Maar
`zet_groepszichtbaarheid()` is een **legitieme** route die een beheerder mág
gebruiken: besluit A41 geeft een groep het recht zichzelf open te zetten. Dat
besluit is genomen voor groepen van **vrienden**. Een groep uit deze wachtrij
bestaat per definitie uit mensen die elkaar niet gekozen hebben, en dat verschil
bestond nergens in de database.

`groups.automatisch` maakt het verschil een kolom. Vier grendels, elk apart
gemeten:

| grendel | wat hij weigert | hoe geijkt |
| --- | --- | --- |
| `groups_automatisch_is_beschermd` | `zichtbaarheid = 'open'` | als `service_role` geprobeerd → `23514` |
| `groups_automatisch_niet_ontdekbaar` | `ontdekbaar = true` | idem → `23514` |
| de derde pin in `guard_group_update()` | de kolom zelf op `false` zetten | op een **gewone** groep geprobeerd, want op een automatische vangt RLS het al eerder af |
| een tak in beide zet-RPC's | geeft `reason = 'automatisch'` i.p.v. een kale 23514 | — |

⚠️ **Die derde rij is de belangrijkste en de makkelijkste om te vergeten.** De
twee CHECKs koppelen `automatisch` aan `zichtbaarheid` en `ontdekbaar`. Kon een
beheerder `automatisch` zelf uitzetten, dan vallen ze daarna weg en staat de weg
naar `open` alsnog open — in twee stappen in plaats van één. **Een constraint die
je zelf kunt uitzetten is geen constraint.**

⚠️⚠️ **En de ijking van die pin had bijna niets gemeten.** Op een automatisch
gevormde groep is er geen beheerder, dus de RLS-policy op `groups` matcht nul
rijen en de UPDATE raakt niets — geen fout, geen wijziging. Dat ziet eruit als
"de pin werkt". 📏 Pas op een gewone groep, waar de gebruiker wél beheerder is,
vuurt de pin echt. Dat is CLAUDE.md's eis letterlijk: *breek de grendel die de
ijking nóemt, niet zomaar iets.*

## Het gat dat deze migratie zelf zou slaan

Een automatisch gevormde groep krijgt uitsluitend `member`-rollen: er was niemand
die er eerder was, dus er is niemand die iemand binnenliet. En promoveren kan
niet, want `guard_group_member_update()` eist daar een beheerder voor.

📏 Gemeten vóór de reparatie: `mag_melding_als_beheerder()` is onwaar voor elk
lid, en `mag_melding_als_escalatie()` eist dat het **onderwerp** beheerder is —
ook onwaar. **Een melding over een lid van zo'n groep kwam dus bij niemand aan.**
Dat is precies het gat dat `0296` (QS8-586) een week eerder dichtte, heropend in
de groepssoort waar het het zwaarst weegt: een groep van onbekenden.

De escalatie is verbreed naar *een groep zonder énige actieve beheerder*, en
niet breder. 📏 Vier metingen:

| | |
| --- | --- |
| platformbeheerder ziet de melding uit de beheerdersloze groep | **ja** |
| ziet hij ook een melding uit een groep **mét** beheerder? | **nee** |
| de beheerder van een gewone groep houdt zijn eigen melding | ongewijzigd |
| een gewoon lid van de automatische groep | ziet niets |

⚠️ **De andere uitweg was iemand beheerder maken, en die is duurder.** Dan krijgt
één vreemde de macht om andere vreemden te verwijderen en de groep te
archiveren. Bij vrienden is dat speels, bij onbekenden een wapen. Niemand macht
geven en de melding laten escaleren is de conservatiefste optie die het werk áf
maakt.

⚠️ **Wat daarmee een aanname blijft:** dat een groep zonder beheerder verder
acceptabel is. Niemand kan hem archiveren, niemand kan er iemand uitzetten,
niemand kan hem openstellen. Voor domeinregel 7 is dat winst; of het als product
klopt, is een eigen besluit. Staat als rij in `docs/ENGINEER-REVIEW.md`.

## Wat er niet gematcht wordt, en waarom

**Nooit op de tekst van een doel.** Dat lijkt de voor de hand liggende as en het
is een lek: `goals.title` is persoonlijk, en een matcher die erop zoekt moet
titels ergens vergelijkbaar maken. Categorie plus periodeband plus week-startdag
is grof genoeg om te vullen en verraadt niets over wat iemand wil bereiken.

**De week-startdag is een harde eis en geen voorkeur.** Twee mensen met een
andere week-start hebben nooit dezelfde cyclus — klok 1 van domeinregel 1 — en
dan lopen de weekafsluitingen structureel uit de pas. 📏 Geijkt: drie wachtenden
waarvan één een andere startdag heeft, geven **nul** groepen en blijven alle drie
wachten.

**`category` en `week_start_day` staan niet gekopieerd op de wachtrijrij.** Ze
zouden verouderen: wie zijn week-startdag verzet terwijl hij wacht, zou op een
*harde* eis gematcht worden met een stale waarde. De matcher joint live.

⚠️ **`user_id` staat er wél gedenormaliseerd**, en dat is de omgekeerde afweging.
Zonder die kolom moet `goal_match_queue_select` een subquery op `goals` doen, en
dán erft de policy de RLS van `goals` zonder dat iemand dat besloten heeft — rij
33 in beslisdocument 002 is precies dat geval. Een trigger pint de kopie, ook
voor `service_role`.

## `nog_nodig` is afgekapt, en dat afkappen ís het ontwerp

De stand zegt nooit meer dan *"er zijn nog twee mensen nodig"*, ook als het er
zeven zijn. Een exacte telling van je bak is met één API-verzoek te herhalen
terwijl je je categorie, streefdatum of week-startdag varieert — en dan is het
geen standmelding meer maar een **demografisch meetinstrument op de
gebruikersbasis**. Dat is de tweede vraag van domeinregel 7 in zijn zuiverste
vorm: kan iemand dit buiten de UI om uitlezen, en wat krijgt hij dan.

Het getal wordt op twee plekken afgekapt — in de RPC en in de datalaag. Dat is
geen dubbel werk maar twee grendels.

## De consequentie die de gebruiker vooraf leest

Koppelen zet de beoordeelbaarheidsgrendel om
(`docs/decisions/2026-08-23-de-grendel-op-het-minpunt.md`): je lópende weekdoelen
worden beoordeelbaar en kunnen vanaf dat moment een **minpunt** opleveren. Wie op
donderdag instapt en vrijdag gematcht wordt, kan over díe week een punt
verliezen.

Dat is *"wat een gebruiker als consequentie beloofd is"* — grens 1 van de
Beslisbevoegdheid — en het is op 28-09-2026 aan Quinten voorgelegd. **Besluit:
een bevestigingsstap, met de tekst als concept.** Die staat in
`buddyzoek.bevestig_lopende_week` in beide catalogi en is van Quinten om te
herschrijven.

⚠️ `p_bevestigd` is daarom een argument van de RPC en geen vinkje in het scherm.
De database weigert zonder bevestiging; wie het argument hardcodeert op `true`,
omzeilt een scherm en geen formaliteit.

## Twee dingen die bij het bouwen omvielen

**`for update` en `distinct on` kunnen niet samen in Postgres.** De matcher viel
om bij de eerste run. Vergrendelen en ontdubbelen zijn nu twee stappen: een CTE
neemt het slot op de wachtrijrijen, de laag erboven houdt er één per persoon
over. Andersom — eerst ontdubbelen — zou het slot leggen op rijen die je daarna
weggooit.

**`beginfase()` deed `gekoppeld[0]`.** Dat was onschuldig zolang élke koppeling
een eigen keuze was: dan is de eerste de enige. Deze feature tilt die aanname van
*"er is er precies één"* naar *"er kunnen er meer zijn"* — onwrikbare regel 18,
vraag 6 — en dan opent `app/doel/samen.tsx` op *"gedeeld met een groep die je
nooit koos"*, bepaald door rijvolgorde. Bij twee of meer zonder expliciete
`?groep=` is het antwoord nu `kiezen`. Zelfde redenering als `beslissendeGroep()`
in `deling.ts`, die deze klasse bij QS8-56 al eens opving.

📏 Geijkt: de oude vorm teruggezet maakt **precies die ene nieuwe toets** rood en
laat de dertien andere groen, inclusief de must-allow dat een expliciete
`?groep=` nog werkt.

## Waar de matcher draait, en waarom niet in een trigger

Een Edge Function op een schema (`.github/workflows/koppelen.yml`, elk uur op
minuut 45), niet een trigger op de wachtrij. Drie redenen, alle drie uit de
grondwet:

1. Een trigger op de insert draait in de transactie van de gebruiker die net
   instapte **en onder diens autorisatie**, terwijl de handeling rijen van
   *anderen* aanmaakt.
2. Wie als derde in de bak stapt, zou de groepsvorming van vijf mensen betalen in
   zijn eigen verzoek — onwrikbare regel 8 in zijn algemene vorm.
3. De vorm bestaat al: `rollover` en `notificaties` zijn Edge Functions met een
   rolclaim-toets op `service_role` en een Actions-workflow als klok. Er is geen
   `pg_cron` in dit project, en de reden daarvoor staat in `rollover.yml`.

⚠️ **Minuut 45 is geen willekeur.** `rollover` staat op `:00` en `notificaties`
op `:30`. Drie jobs op hetzelfde moment delen dezelfde
`max_connections` van 60 voor de héle database.

⚠️ **Eén gedeelde peildag voor de hele run**, en dat is het ontwerp en geen
compromis. De periodeband is een vergelijking *tussen* gebruikers; zou elke
gebruiker tegen zijn eigen "vandaag" gebandeerd worden, dan konden twee mensen
met dezelfde streefdatum in verschillende bakken vallen omdat de een net over
middernacht is. Domeinregel 2 eist "vandaag in de tijdzone van de gebruiker" voor
wat over díe gebruiker gaat — zijn cyclus, zijn week, zijn streak. Een
sorteersleutel die mensen onderling vergelijkt hoort één nulpunt te hebben.

## De blokkade zit in de koppelfunctie zelf

0145 §9 schrijft voor dat QS8-233 de **vijfde route** naar een lidmaatschap is en
`blokkade_met_groep()` gebruikt *"en geen eigen variant schrijft"*. Dat kan hier
letterlijk niet: die functie vraagt een bestáánde groep, en de matcher beoordeelt
kandidaten vóórdat er een groep is.

De reparatie is geen tweede variant maar een **uitgetrokken kern**.
`blokkade_tussen()` is de `exists` over `user_blocks` in beide richtingen, één
keer opgeschreven; `blokkade_met_groep()` leunt er voortaan op. De vier bestaande
routes merken niets, en er blijft één definitie van de vraag.

Het alternatief — de groep aanmaken, de blokkades toetsen en hem weggooien — was
korter te schrijven en had een `delete` op `groups` nodig in een pad dat verder
alleen archiveert.

📏 Geijkt: zes kandidaten waarvan twee elkaar blokkeren geven een groep van vijf,
zonder dat paar bij elkaar.

## Wat er bewust niet gebouwd is

| wat | waarom niet |
| --- | --- |
| een systeembericht "de groep is gevormd" | een dertiende waarde op `chat_messages_system_event_bekend` is een migratie plus een kopie in `chat-schemas.ts`. De gebeurtenis is al zichtbaar: de groep verschijnt en het scherm zegt het. Een allowlist die uitdijt voor comfort verliest zijn functie |
| een push- of e-mailmelding | grens 1 — een eerste uitgaande stroom naar echte mensen. Eigen issue, eigen besluit |
| een vierde matching-as (ritme, focusgebieden, voertaal) | ze bestaan en ze verleiden, maar elke extra as maakt de bak leger. Pas een vraag als er wachtrijen zijn die te groot worden |
| een groep laten groeien ná de vorming | maakt van de wachtrij een doorlopend proces met toestemmingsvragen over mensen die er al zitten |
| een poort bij een nieuw gevormde groep | overgenomen uit het epic: er is niemand die er eerder was, dus er is niemand die iemand binnenlaat. De poort blijft gelden voor een aanvraag bij een **bestaande** groep |

## De aannames, uitgeschreven

1. **Groepsgrootte 3–5, minimum 3.** Leftovers blijven wachten.
2. **Periodebanden ≤90 / ≤180 / ≤365 / >365 dagen.**
3. **Tijdslimiet 14 dagen**, daarna `verlopen`.
4. **Dagrem 5** wachtopdrachten per gebruiker per dag; hoogstens **3** gelijktijdig.
5. **Twintig bakken per ronde**, elk uur.
6. **De naam** komt uit een vaste catalogus (`'Buddygroep ' || categorie`), nooit
   uit gebruikerstekst — hij moet door alle zeven naam-CHECKs van `groups` en een
   vast punt van `schone_naam()` zijn, en dit pad komt niet langs
   `create_group()`.
7. **De huddledag** is de gedeelde week-startdag van de leden; die is per
   definitie gelijk, want het is de harde eis.
8. **De tijdzone** is die welke de meeste leden delen, bij gelijkspel
   alfabetisch — zodat de uitkomst niet van rijvolgorde afhangt.
9. **De uitnodigingscode staat dicht** (`invite_revoked = true`) bij aanmaak:
   zonder oprichter is er niemand die hem beheert.

⚠️⚠️ **En de aanname die geen meting kan worden.** 📏 Op productie staan **1
gebruiker en 0 doelen**. De grendels zijn te toetsen — dat een groep beschermd
is, dat geblokkeerde mensen gescheiden blijven, dat een afwijkende week-startdag
de bak breekt. **Of de gevormde groepen góede groepen zijn, is hier niet te
meten**, en dat blijft zo tot er mensen in de rij staan. Het issue zegt dat zelf
met zoveel woorden: *dit werkt pas bij voldoende gelijktijdige gebruikers, en
daarvoor voelt het stuk.* Daarom zitten de drie dempers er vanaf dag één in: een
zichtbare stand, een tijdslimiet, en eruit kunnen stappen zonder gevolgen.

## De uitrol, en een onregelmatigheid daarin

`0299` is op 28-09-2026 op productie toegepast via de Supabase-MCP, op verzoek
van Quinten en **zonder `pg_dump`** — die kan een cloudsessie niet maken. Dat is
een afwijking van de regel bij *Supabase gratis tier*, expliciet zo besloten, en
hij staat hier omdat een afwijking die nergens staat niet bestaat. De migratie
voegt alleen toe en draagt een rollback-pad.

⚠️ **Een MCP-apply nummert op tijdstempel.** `0299` kwam binnen als
`20260928143931`. Rechtgezet met `lijn_migratieregister_uit()` — de functie die
dit project daar zelf voor heeft, met vier grendels. Dat hoort bij de route en
niet bij deze migratie; wie langs de MCP uitrolt, lijnt daarna uit.

⚠️ **Tussen 28-09 en de merge van dit werk stond `0299` op productie en niet op
`main`.** Dat is de omgekeerde richting van de gewone drift en dus het noemen
waard: wie in dat venster het schema uit `main` opbouwde, miste hem. Het venster
sluit met deze PR.

`0300` is bewust **niet** in dezelfde ronde uitgerold. Hij wijzigt vier
*bestaande* functies op productie, en zijn eigen functies worden aangeroepen door
een Edge Function die toen nog niet bestond. Die twee horen in één ronde — en dat
is de ronde die bij deze PR hoort.
