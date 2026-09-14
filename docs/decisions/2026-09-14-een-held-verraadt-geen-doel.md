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

## 5. Eén rij per lid, en niet een log

De functie geeft de **laatste** verschijning per lid en niet een lijst. Een lijst
van verschijningen is een chronologie van tegenslag — "Ignis, Ignis, Lucerna,
Ignis" is vier missers en een stilte — en dat is dezelfde vorm die
`groep_klassement()` weigert met "geen delta en geen datum" (rij 28). A41 opent
dat de groep je tegenslag ziet; het opent geen geschiedenis ervan.

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
kolommen in te staan. Een lege rij zou zeggen *"bij deze persoon is in geen zeven
dagen een held langs geweest"*, en dat is een uitspraak over iemand die de
"wel"-lijst van QS8-477 niet noemt — en die bovendien iets verraadt over zijn
meldingsinstellingen.

De prijs is dat een aanroeper de ledenlijst apart moet ophalen om "iedereen" te
tonen. Dat is één query die er toch al is (`group_overview()`), en de veilige
kant wint.

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

| IJKING | Gebroken | Wat er omviel |
|---|---|---|
| A | `where lid_van_open_groep(p_group_id)` weggehaald | 6 van de 13 — élke must-deny, inclusief de niet-lid en het uitgezette lid |
| B | `and m.status <> 'inactive'` weggehaald | 1 — "laat een uitgezet lid ook niet ín de lijst staan" |
| C | `and a.shown_at > now() - interval '7 days'` weggehaald | 1 — "laat een verschijning van acht dagen oud eruit vallen" |
| D | `shown_at` aan de kolomlijst toegevoegd | 1 — "geeft geen tijdstip en geen rij-id terug" |

⚠️ Dat A er zes omgooit en de andere drie er één, is geen slordigheid maar de
vorm van de functie: de poort is waar élke must-deny op rust, de andere drie zijn
elk één eigenschap. Een ijking die alle vier op dezelfde toets was uitgekomen,
had betekend dat drie van de vier toetsen niets eigens bewaakten.

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
De tweede: de twee grendels die dit vonden, vonden het **buiten** het testbestand
van dit issue om, en ze zijn het waard om te noemen omdat ze precies de fout
vonden die onwrikbare regel 4 beschrijft. Was de `revoke` in de migratie écht
vergeten geweest, dan was het net zo hard rood geworden.
