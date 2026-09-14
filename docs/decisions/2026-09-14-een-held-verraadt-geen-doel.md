# Een held verraadt geen doel, maar wel dat er iets misging

**Datum:** 14-09-2026
**Issue:** QS8-477 (epic QS8-468, besluit 5)
**Migratie:** 0268 — `groep_helden()`
**Raakt:** domeinregel 7, besluit A41, oppervlak 2, 3 en 37 in
`docs/decisions/002-domeinregel7-oppervlakken.md`

---

## 1. Waarom dit een functie is en geen policytak

`hero_appearances` draagt `trigger`, en twee van de zes waarden zijn
tegenslagsignalen: `misser` en `stilte`. Een open groep mag die zien — dat is
besluit A41 en het is de hele keuze die zo'n groep gemaakt heeft. Een beschermde
groep mag dat niet, en dat is domeinregel 7.

De voor de hand liggende vorm is een vierde tak op `hero_appearances_select`. Die
is fout, en niet een beetje: **RLS kan geen kolommen beperken.** Een tak die de
rij vrijgeeft, geeft `shown_at` mee — het exacte tijdstip waarop Ignis langskwam,
en dus de dag waarop iemand iets miste, tot op de seconde.

Dit is letterlijk de fout die 0218 moest vermijden en die 0169 als eerste in deze
vorm oploste: een `security definer`-functie met een expliciete kolomlijst. De
kolommen die er niet uit mogen, bestáán niet in de handtekening. Dan hoeft geen
enkel component de belofte te kennen — en verhuist ze niet mee met dat component.

## 2. Dit oppervlak is grover dan oppervlak 2 en 3, en dat is een verruiming

**Dit is het punt waar dit issue niet netjes in het bestaande model past, en het
hoort hier te staan in plaats van weggeredeneerd te worden.**

Een gemiste week is in een open groep zichtbaar **per doel**, via
`deelt_open_groep_met_doel()`. Deel je een doel alleen met een beschermde groep,
dan houdt die groep die misser — de open groep waar je óók in zit, ziet er niets
van.

Een verschijning draagt geen doel, en kán dat niet dragen. 📏 Nagemeten in
`supabase/functions/notificaties/index.ts`: `laatsteActiviteitDatum()` leest
`daily_moves` én `completions` over álles wat iemand doet, `heeftOpenWeekdoel()`
telt evenmin per doel, en `tegenslagtrigger()` rekent met één datum per persoon.
`stilte` is per definitie een uitspraak over de persoon: "er is drie dagen niets
gebeurd" is geen eigenschap van een doel.

**Gevolg:** een open groep leest dát een lid iets gemist heeft, ook als het enige
gemiste doel alleen met een beschermde groep gedeeld is.

**Aanvaard, om drie redenen die alle drie te controleren zijn:**

1. Wát er gemist is, leert de groep niet — geen doel, geen titel, geen week, geen
   niveau. Het bit is "er stond iets open", niet "dit stond open".
2. A41 is een keuze over de persoon en niet over een doel. De zin die iemand leest
   is *"de groep ziet ook wat er niet lukt"*, en dat is precies wat hier gebeurt.
3. De stand staat vóór de knop. `invite_preview()` (0080) noemt de zichtbaarheid
   ook zonder account, en `zichtbaarheid.open_uitleg` en
   `bevestiging.groep_openzetten.uitleg` noemen sinds dit issue de held.

⚠️ **Wat dit níét is.** Geen argument om oppervlak 2 of 3 van hun doelscoping af
te halen. Die scoping is er omdat een gemiste week op een doel te herleiden is
tot dat doel; deze verschijning is dat niet. Wie ooit een oppervlak bouwt dat
wél per doel te scopen valt en dat tóch per persoon opent, doet iets anders dan
wat hier besloten is.

## 3. De hoofdheld lekt langs een zijpad

`hero_profiles` wordt met opzet níét gejoined: de hoofdheld is de uitslag van een
persoonlijkheidsvragenlijst en geen gebeurtenis, QS8-477 noemt hem in zijn
"wel"-lijst niet, en voor élk nieuw oppervlak is beschermd het antwoord tot
iemand het tegendeel besluit.

**Maar hij komt er deels alsnog uit, en die eerlijkheid is meer waard dan een
nette scheiding.** `heldVoorTrigger()` is een bijectie: `misser` ⇔ ignis,
`stilte` ⇔ lucerna, `mijlpaal` ⇔ strix. Bij vijf van de zes triggers is
`hero_key` dus af te leiden uit `trigger` en andersom, en dan voegt de kolom
niets toe. Bij de zesde wel: `tussendoor` is de trigger die QS8-475 zet als er
géén gebeurtenis is en de **hoofdheld** spreekt. Een rij met
`trigger = 'tussendoor'` geeft daarmee de hoofdheld van dat lid prijs.

Dat is smaller dan `hero_profiles` erbij joinen — het geldt alleen voor leden die
in het venster van zeven dagen daadwerkelijk een hoofdheld-verschijning hadden,
en niet voor iedereen met een rij in die tabel. Wie de hoofdheld ooit bewust wil
tonen, doet dat als eigen besluit en niet als bijvangst van deze functie.

⚠️ `hero_key` blijft desondanks in de handtekening staan, en niet uit gemak: voor
`tussendoor` is hij niet af te leiden, dus een aanroeper die hem zelf uitrekent
uit `trigger` heeft het daar mis. Eén register, één antwoord — zelfde reden als
waarom `HELDEN` in `src/modules/helden/helden.ts` de enige plek is waar een held
ontstaat.

## 4. Het venster van zeven dagen

De functie geeft geen tijdstip. Dat is de hele reden dat ze een functie is (§1) —
en het is ook de reden dat er een venster moest komen.

**Zonder venster is "Ignis is langs geweest" een permanent merkteken.** Een
aanroeper kan vers niet van oud onderscheiden, dus een misser van vijf maanden
geleden staat er even stellig als die van gisteren. Een tegenslagsignaal dat
nooit vervalt is zwaarder dan het signaal zelf, en dat is precies de schade waar
domeinregel 7 tegen beschermt.

**Zeven dagen, afgeleid en niet gekozen.** De week is in deze app de enige eenheid
die telt (domeinregel 9 en 10). Een held spreekt hoogstens twee keer per dag
(`magVerschijnen()`, QS8-475), dus binnen een week zijn er ruim voldoende
gelegenheden: wie actief is, heeft er een recente. Wie er geen heeft, staat niet
in de lijst — en dat is het juiste antwoord, want dan is er niets recents te
melden.

⚠️ **Dit is een leeftijdsfilter en geen dagberekening**, en dat onderscheid houdt
correctheidsregel 7 heel. Die regel gaat over "vandaag" en "deze week": grenzen
die van de tijdzone en de week-startdag van een gebruiker afhangen, en die horen
in `shared/time`. `shown_at > now() - interval '7 days'` hangt van geen van beide
af — het is dezelfde soort rollende grens als het etmaal in
`zet_groepszichtbaarheid()` (0076). Er is hier dus geen tweede plek waar een dag
begint.

⚠️ **Het venster staat niet in een parameter.** Een aanroeper die hem kan
verzetten, kan hem ook op tien jaar zetten, en dan is de grens een suggestie.
Zelfde reden als de harde bovengrens op `p_limit`.

### 4a. En het venster is zélf een klok — gevonden in de security-review

Hier stond *"de functie geeft geen tijdstip, dus een aanroeper kan vers niet van
oud onderscheiden"*. **Dat is waar voor één aanroep en onwaar voor het
oppervlak**, en de omkering is precies het venster dat hierboven als reparatie
staat.

Een groepsgenoot die deze functie herhaald opvraagt, ziet een rij **verdwijnen**.
Met een kale `now() - interval '7 days'` ligt dat moment exact zeven dagen na
`shown_at`, dus hij leest het tijdstip terug tot op zijn polinterval — de kolom
die §1 als de hele reden noemt dat dit een RPC is. Zonder venster bestond die
gebeurtenis niet.

**De reparatie is de rand grover maken en niet het venster weghalen:**
`date_trunc('day', now(), 'UTC') - interval '7 days'`. Alles van één UTC-dag valt
tegelijk weg, dus wat er uit een verdwijning te lezen valt is een **datum** en
geen tijdstip. Dat is geen nul — een open groep ziet via oppervlak 3 al van welke
week iemand een doel miste — maar de tijd van de dág is weg, en dat is het
scherpste deel: wanneer iemands nudge afgaat, zegt iets over zijn ritme en zijn
tijdzone.

⚠️ **De driearguments-`date_trunc` is er met reden.** `date_trunc('day', now())`
volgt de `TimeZone` van de sessie, en dan hangt het antwoord af van een
instelling in plaats van van het schema. De rand staat vást op UTC, voor iedere
gebruiker dezelfde — en dát is wat hem géén dagbepaling maakt in de zin van
correctheidsregel 7.

⚠️⚠️ **Wat dit níet repareert, en dat is de eerlijker versie van de belofte.** Wie
elke dag opvraagt, ziet ook elke níeuwe verschijning binnenkomen en bouwt zo
alsnog een chronologie. Dat is geen eigenschap van dit venster maar van elk
levend groepsoppervlak: `groep_klassement()` geeft op dezelfde manier zijn deltas
prijs aan wie hem twee keer opvraagt, en dat is daar bij besluit A54 aanvaard.

> **De belofte van deze functie is: één antwoord draagt geen tijd, en de rand
> draagt hoogstens een datum.** Niet: een groepsgenoot kan geen tijdlijn
> bijhouden.

Er staat geen leeslimiet voor PostgREST in dit project — `0203` telt alleen
schrijfacties. Dat is een rij in `docs/ENGINEER-REVIEW.md` en geen reparatie hier:
een limiet op leesverkeer is een infrastructuurkeuze en raakt elk oppervlak
tegelijk.

## 5. Eén rij per lid, en niet een log

De functie geeft de **laatste** verschijning per lid en niet een lijst. Een lijst
van verschijningen is een chronologie van tegenslag — "Ignis, Ignis, Lucerna,
Ignis" is vier missers en een stilte — en dat is dezelfde vorm die
`groep_klassement()` weigert met "geen delta en geen datum" (rij 28). A41 opent
dat de groep je tegenslag ziet; het opent geen geschiedenis ervan.

⚠️ **Lees dat als een eigenschap van het antwoord en niet als een garantie over
de aanroeper** — zie §4a. Eén antwoord is een momentopname; wie elke dag opvraagt
bouwt de chronologie zelf. Dat geldt hier net zo hard als bij het klassement, en
geen van beide functies kan het voorkomen.

Om dezelfde reden sorteert de functie **op naam en niet op tijd**. Een sortering
op `shown_at` geeft het tijdstip niet prijs maar wél de volgorde, en dat is "wie
miste het laatst iets" — een kolom die met opzet niet in de handtekening staat,
alsnog afleidbaar uit de rijvolgorde.

⚠️ **`distinct on` heeft een deterministische tiebreaker nodig, en dat is regel 18
vraag 6 in zijn zuiverste vorm.** De meldingenjob mag op één dag twee helden
noteren (hoofdheld plus Strix) en `shown_at` staat op `now()`, dat binnen één
transactie niet opschuift. "Er is er precies één met de hoogste tijd" is dus een
aanname; zonder `a.id desc` erachter kiest Postgres er willekeurig een en geeft
dezelfde groep bij twee aanroepen twee antwoorden.

## 6. Een `join` en geen `left join`

Een lid zonder recente verschijning valt uit de lijst in plaats van er met lege
kolommen in te staan. De handtekening belooft een held en een trigger, en een rij
waarin allebei `null` zijn is geen antwoord maar een vorm.

⚠️⚠️ **Hier stond een tweede reden en die was onwaar.** Er stond dat een lege rij
*"iets verraadt over zijn meldingsinstellingen"* en dat de inner join dat
voorkomt. 📏 Gemeten in de security-review op dit issue: `groep_klassement()`
draagt dezelfde poort (`lid_van_open_groep`) en dezelfde ledenfilter
(`status <> 'inactive'`), dus het complement is één query — de leden uit het
klassement die niet in deze lijst staan, zijn exact de leden zonder recente
verschijning. `group_members` is via `mag_groep_lezen()` sowieso leesbaar.

**De inner join verbergt dus niets.** De keuze zelf blijft staan — hij is niet
slechter dan een left join — maar de reden eronder klopte niet, en dat is in dit
project de duurste vorm van een fout: *"een afwijking die je onderbouwt is duurder
dan een die je vergeet — een uitgeschreven argument leest de volgende persoon als
een reden om er niet aan te twijfelen"* (CLAUDE.md). De volgende bouwer zou §6
gelezen hebben als "afwezigheid is niet waarneembaar" en daarop gebouwd.

Wat de afwezigheid daadwerkelijk verraadt — dat iemand geen meldingen krijgt —
staat als Laag-rij in `docs/ENGINEER-REVIEW.md` en niet als opgelost.

De prijs van de inner join is dat een aanroeper de ledenlijst apart moet ophalen
om "iedereen" te tonen. Dat is één query die er toch al is (`group_overview()`).

## 7. Wat er níet gebouwd is, en waarom dat geen omissie is

Er is geen scherm. `groep_helden()` wordt door niets aangeroepen en staat daarom
in `WACHT_OP_EEN_BESLUIT` in `scripts/dode-keten-controle.mjs` — de agenda en
niet de parkeerplaats.

Dat is een besluit en geen vergeetpost: QS8-468 zet *"een eigen heldenscherm of
heldenkaart op het overzicht"* met zoveel woorden buiten scope voor deze ronde,
en QS8-477 is `area:backend` met zeven acceptatiecriteria die alle zeven over de
functie gaan. De vraag *krijgt dit oppervlak een plek op het groepsscherm, of
hoort de RPC weg?* staat als **QS8-493**.

⚠️ **Dit is de vorm waar regel 18 vraag 5 voor waarschuwt — een keten die
doodloopt terwijl elk schakeltje af is — en hij is hier met open ogen gekozen.**
Wat het ongevaarlijk houdt is dat de functie in geen enkele stand meer teruggeeft
dan de RLS-suite vastlegt. Wat het gevaarlijk zou máken is dat er over een half
jaar een scherm bij komt dat aanneemt dat deze functie "gewoon de helden van de
groep" geeft, zonder de vier grenzen hierboven te kennen. Vandaar dit document en
rij 37.

## 8. Vier ijkingen, en alle vier bijten ze

Regel 18 vraag 3 beantwoord je niet door erover na te denken maar door de belofte
met de hand te breken. 📏 Gemeten op 14-09-2026 tegen de lokale stack, **mutatie
per grendel en niet één mutatie voor de hele controle**:

| IJKING | Gebroken | Wat er omviel (van de 18) |
|---|---|---|
| A | `where lid_van_open_groep(p_group_id)` weggehaald | **6** — élke must-deny, inclusief de niet-lid en het uitgezette lid |
| B | `and m.status <> 'inactive'` weggehaald | 1 — "laat een uitgezet lid ook niet ín de lijst staan" |
| C | de hele venstervoorwaarde weggehaald | **2** — de acht-dagen-toets én de dagrandtoets |
| D | `shown_at` aan de kolomlijst toegevoegd | 1 — "geeft geen tijdstip en geen rij-id terug" |
| E | `order by s.display_name` → `order by s.shown_at desc` | 1 — "sorteert op naam en niet op tijd" |
| F | `least(coalesce(p_limit, 20), 50)` → `coalesce(p_limit, 20)` | 1 — "geeft nooit meer dan vijftig rijen" |
| G | `date_trunc('day', now(), 'UTC')` → `now()` | 1 — "legt de rand op een hele UTC-dag" |
| H | de trigger-allowlist weggehaald | 1 — "geeft alleen de vier triggers die deze groep mag zien" |
| I | de archieftak uit `lid_van_open_groep()` (0102) weggehaald | 1 — "geeft nul rijen in een open groep die gearchiveerd is" |

⚠️ Dat A er zes omgooit en de rest er één (C twee), is geen slordigheid maar de
vorm van de functie: de poort is waar élke must-deny op rust, de andere zijn elk
één eigenschap. C raakt er twee omdat het venster zelf én de vorm van zijn rand
allebei aan die ene voorwaarde hangen; G isoleert de rand.

⚠️⚠️ **E, F, G en H bestaan omdat ze er niet waren, en dat is de scherpste
uitkomst van de security-review op dit issue.** De eerste ronde had A t/m D en
stond op 13 toetsen. De review brak de sorteervolgorde en het plafond van vijftig
met de hand in de draaiende functie, en **de suite bleef 13 van de 13 groen** —
terwijl de migratiekop allebei als grens opschrijft en §5 uitlegt wát de
sorteervolgorde kost. Twee grenzen die alleen in een comment stonden, exact de
klasse van QS8-412.

⚠️ **I breekt niet deze functie maar zijn poort, en dat is met opzet.** De
archieftoets staat in `lid_van_open_groep()` (0102) en `groep_helden()` erft hem.
Een erfenis zonder toets is een aanname: haalt iemand die poort ooit uit elkaar in
twee conjuncten, dan valt de archiefhelft er stil af — precies wat 0102 zelf als
aanleiding noemt (*"zonder die toets bleef een gearchiveerde open groep zijn
schakels uitdelen"*). Dezelfde klasse als rij 33 in beslisdocument 002: een
verruiming die je érft, staat nergens als besluit.

⚠️ **F beet pas nadat de toets zijn eigen gevallen ging máken.** De eerste versie
eiste "hoogstens vijftig" op een groep van acht: groen mét en zonder de klem.
`vulGroep()` zet er vijfenvijftig neer via `psql()` en `leegGroep()` haalt ze in
`finally` weer weg. **Een controle die je niet kunt voeden, kun je niet ijken** —
en een toets die zijn grens nooit raakt, toetst niets.

⚠️ **En de mutatie zat in de gedéployde functie en niet in het migratiebestand.**
`pg_get_functiondef()` is de waarheid; een ijking die een bestand verandert dat
daarna niet wordt afgespeeld, toetst niets.

## 9. En het instrument liet zelf een spoor achter

📏 Na de vier ijkingen stond `npm run poort` rood op twee tests die niets met
deze functie te maken leken te hebben: `tests/rls/definer-aanroepertoets.test.ts`
en `tests/rls/hulpfuncties.test.ts`, allebei met "`groep_helden` is uitvoerbaar
door `anon`".

Dat was echt en het kwam niet uit de migratie. IJking D moest de handtekening
veranderen en dus `drop function` doen, en een `create` daarná krijgt in Supabase
via `alter default privileges` opnieuw `anon` en `authenticated` erbij. Het
herstel speelde alleen het functielichaam terug en niet de `revoke`-regel die
eronder staat. 📏 Na `npm run rls:stack` opnieuw:
`has_function_privilege('anon', …)` is `false`.

⚠️ **Twee lessen, en de tweede is de belangrijkere.** De eerste: herstel een
ijking door de bron opnieuw af te spelen en niet door het stuk terug te zetten
dat je gemuteerd hebt — een `drop` neemt meer mee dan wat er in je diff staat.
De tweede ronde (E t/m H) doet dat: `psql -f` op het hele migratiebestand, en
daarna `has_function_privilege('anon', …)` nagemeten. **f**, elke keer.

De tweede les: de twee grendels die dit vonden, vonden het **buiten** het
testbestand van dit issue om, en ze zijn het waard om te noemen omdat ze precies
de fout vonden die onwrikbare regel 4 beschrijft. Was de `revoke` in de migratie
écht vergeten geweest, dan was het net zo hard rood geworden.

⚠️⚠️ **En toen ging het bij IJKING I nóg een keer mis, één laag hoger.** Die
mutatie zat niet in `groep_helden()` maar in zijn poort `lid_van_open_groep()`,
en het herstel was `psql -f` op **migratie 0102** — het bestand waar die functie
vandaan komt. 📏 Uitkomst: `npm run poort` viel om op **52** testbestanden.

Dat was geen defect in de poort maar in het herstel: 0102 doet meer dan die ene
functie, en hem afspelen op een schema dat al op 0268 staat, draait terug wat
latere migraties aan diezelfde objecten veranderd hebben. Dit is letterlijk de
uitzonderingsklasse die CLAUDE.md beschrijft — *"idempotent betekent: idempotent
tegen de toestand waarvoor de migratie geschreven is"* — alleen dan als
gereedschapsfout in plaats van als migratiefout. `npm run rls:stack` bouwde het
schema opnieuw op en de poort was daarna weer schoon.

**De regel die hieruit volgt is smaller dan "speel de bron opnieuw af":**

> Herstel een ijking door het schema opnieuw óp te bouwen, of door de bron van de
> **laatste** migratie af te spelen. Een oudere migratie terugspelen op een nieuwer
> schema is geen herstel maar een terugzet.

⚠️ En de omgekeerde les is de belangrijkste: **twee keer op rij was het rood van
mijn instrument en niet van mijn wijziging** — en allebei de keren was het
zichtbaar omdat de poort volledig draaide. Had ik na een ijking alleen het
testbestand van dit issue teruggedraaid, dan was de eerste ronde met `anon`-recht
gemerged. Dat is de praktische kant van *"een rood is niet vanzelf jouw rood"*
(QS8-411): het antwoord is niet het rood negeren maar uitzoeken wáár het vandaan
komt, vóórdat je het wegredeneert.

## 10. Een allowlist op `trigger`, en niet een doorgeefluik

📏 Nagemeten over `supabase/functions/`, `src/` en `app/`: de CHECK
`hero_appearances_trigger_geldig` laat zes waarden toe en er worden er **vier**
geschreven — `misser` en `stilte` (nudge), `mijlpaal` (cycle_summary) en
`tussendoor` (de hoofdheld zonder gebeurtenis). Niets schrijft ooit `nieuw_doel`
of `vastlopen`.

Gaf deze functie `trigger` ongefilterd door, dan verbreedde dit oppervlak zichzelf
op de dag dat daar iets aan verandert: de open groep leest dan *dat dit lid een
doel heeft aangemaakt*. Dat is geen tegenslag en dus niet wat A41 opent, en het is
per persoon in plaats van per doel — wat botst met domeinregel 4. Niets zou daar
rood van worden: niet de functie, niet de toetsen, niet `zichtbaarheid:controle`.

CLAUDE.md is hier expliciet: *"Voor élk níeuw oppervlak is beschermd het antwoord
tot iemand het tegendeel besluit. Bouw niets vast open; dat is precies hoe een
standaard verschuift zonder dat iemand het besloten heeft."* De allowlist maakt
van de volgende trigger een besluit met een migratie eronder, dezelfde vorm als
`chat_messages_system_event_bekend`.

⚠️ **De filter staat in de CTE en niet erna**, dus `distinct on` kiest de nieuwste
verschijning **die deze groep mag zien**. Een lid met een verse `nieuw_doel` valt
daardoor niet uit de lijst maar houdt zijn vorige zichtbare held. Dat is de
conservatieve kant: eruit vallen zou een níeuw afwezigheidssignaal maken, en de
belofte is "de laatste held die deze groep mag zien" en niet "de laatste held".

## 11. De uitweg die de toestemmingstekst noemt, werkt hier maar half

`bevestiging.groep_openzetten.uitleg` zegt sinds QS8-254: *"Iedereen krijgt een
bericht in de groepschat, zodat wie dat niet wil zijn doel kan ontkoppelen."*
Voor elk ander oppervlak dat opengaat klopt dat. Voor dit oppervlak niet:
`hero_appearances` heeft geen `goal_id` en `groep_helden()` sleutelt op
`group_members`, dus wie zijn doel ontkoppelt staat de volgende ochtend gewoon
weer in de lijst — met een `misser` die uit een doel komt dat hij alleen met een
**beschermde** groep deelt (§2).

Deze commit maakt de zin waar in plaats van de belofte: er staat nu bij dat de
uitweg werkt voor alles wat aan een doel hangt, en dat de heldenlijst aan je
lidmaatschap hangt. De echte uitwegen blijven de groep verlaten of je meldingen
uitzetten.

⚠️ **Of daar een eigen uitweg voor moet komen — een knop "mijn held blijft
privé" — is een productvraag en valt onder grens 1 van de beslisbevoegdheid: het
gaat over wat er tegen een mens beloofd wordt.** Die staat als rij in
`docs/ENGINEER-REVIEW.md` en is voorgelegd bij de PR; een bouwsessie beslist hem
niet.
