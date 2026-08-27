# Weekstappen laten genereren per mijlpaal — QS8-41

**27-08-2026.** PRD 3.4: *"Als gebruiker tik ik op 'Genereer weekdoelen' bij een
mijlpaal en krijg ik voorgestelde weekstappen."* Twee acceptatiecriteria: elk
voorstel komt mét vloer en plafond, en dezelfde async-, validatie- en
quotumeisen als 3.2.

Vier keuzes hierin zijn niet vanzelfsprekend. Ze staan hier omdat de code ze
niet uitlegt.

---

## 1. Er is geen "alles overnemen"-knop, en dat is geen voorzichtigheid

Dit is de zwaarste keuze in dit issue.

`maakWeekdoel()` zet altijd de **huidige** cyclus. Dat is met opzet en het is
correctheidsregel 7: de client mag "deze week" niet bepalen, want dan klopt de
cyclus niet meer voor iemand met een andere week-startdag. Er bestaat daardoor
geen schrijfpad naar een toekomstige week.

De coach stelt tot zes opeenvolgende weekstappen voor. Zou er een verzamelknop
zijn, dan komen die zes **allemaal in dezelfde week** te staan. En domeinregel 10
zegt dat taken toevoegen het puntenplafond verhoogt: dat zijn vijf weken die
gegarandeerd gemist worden, dus **vijf minpunten voor iets wat de app zelf heeft
voorgesteld**.

Toevoegen gaat daarom per stap, en het scherm zegt waarom
(`weekcoach.een_per_week`). Zonder die zin moet de gebruiker zelf raden waarom
er geen verzamelknop staat.

⚠️ **Wordt zwaarder als:** er ooit een schrijfpad naar een toekomstige cyclus
komt. Dán mag deze keuze opnieuw beoordeeld worden — en niet eerder. Wie de
verzamelknop tóch bouwt zonder dat pad, bouwt een scoregat van dezelfde soort
als het gat dat 0064 openzette en 0066 moest dichten.

---

## 2. Wegfilteren en niet half tonen

Het acceptatiecriterium leest als een eis **per voorstel**: "elk voorgesteld
weekdoel komt mét vloer en plafond — anders is de suggestie half werk". Een rij
zonder vloer valt daarom weg, en de andere blijven staan. Nooit de hele lijst
weggooien om één rij.

`weekdoelenUit()` weigert vijf vormen:

| Vorm | Waarom |
|---|---|
| lege of ontbrekende vloer of plafond | het acceptatiecriterium zelf |
| titel korter dan 3 | `weekdoelSchema` weigert hem verderop toch |
| vloer gelijk aan plafond (hoofdletterongevoelig) | zie hieronder |
| een veld boven de 200 | `weekdoelSchema.max(200)` weigert hem verderop |

**De vloer die het plafond is, is het meest waarschijnlijke faalgeval van het
model** — "drie gesprekken voeren" naast "drie gesprekken gevoerd". Dat is geen
vangnet maar een tweede formulering, en domeinregel 8 zegt dat de vloer "de
versie is die je op je slechtste week nog haalt". Daarom staat het zowel in de
prompt (uitgeschreven, niet alleen gevraagd) als in de zeef.

⚠️ **Meet dit bij de eerste echte proef.** Hoeveel van de zes rijen overleven de
zeef? Blijft dat structureel onder de helft, dan is de prompt het probleem en
niet de zeef — en dan voelt dit voor de gebruiker als "de coach doet niets".

⚠️ **`.length` en niet `telTekens()`, en dat is hier de juiste kant op.**
`weekdoelSchema` gebruikt Zod's `.max(200)` en dat telt UTF-16-eenheden;
`telTekens()` telt codepunten. `.length >= telTekens()` altijd, dus `.length >
200` is de striktere van de twee en laat niets door dat Zod daarna alsnog
weigert. Dit is de val uit QS8-118, maar dan aan de **bovengrens**, waar het
verschil de veilige kant op valt in plaats van de onveilige.

---

## 3. Het schema en de prompt staan in `index.ts` en niet in een eigen bestand

Een eigen `prompts.ts` is de betere structuur, en dat is ook wat de planning
voorstelde: `index.ts` houdt de poort en de boekhouding, `prompts.ts` krijgt
alles wat verandert als het model of de vraag verandert.

**Het is hier tóch niet gedaan, en de reden is coördinatie.** Er werkte op
27-08 een tweede sessie in `supabase/functions/`. Die verhuizing haalt ruim
honderd regels uit `index.ts` en dat conflicteert hard met elke andere wijziging
in dat bestand; wat er nu staat zijn uitsluitend **toevoegingen** plus één
dispatch, en dat merget schoon.

Wat je ervoor opgeeft is niets aan bewaking: de enige eigenschap die aan de
Edge-kant te toetsen valt — welke velden het model verplicht moet leveren — leest
`tests/beloftes/vloer-en-plafond.test.ts` als tekst uit `index.ts`, en dat werkt
uit elk bestand.

⚠️ **Haal die knip alsnog door zodra `supabase/functions/` vrij is.** Dit is
uitstel, geen besluit.

---

## 4. `streefdatum` betekent in een weekdoel-job iets anders

`tijdsbestek()` in de Edge Function rekent uit hoeveel hele weken er tot
`input.streefdatum` zijn en zet dat in de prompt. Dat bestaat omdat het model
slecht rekent met datums: bij de eerste proef op 21-08-2026 gaf de coach een
correcte conclusie met een verzonnen getal ("ongeveer 14 maanden" voor een datum
die twee weken weg lag).

Voor een weekdoel-job vult de client `streefdatum` met de datum van de
**mijlpaal**, en pas als die er niet is met die van het doel. Datzelfde veld
betekent dus iets anders per soort job. Het alternatief was een tweede functie
die precies hetzelfde rekent, en dat is een tweede plek waar dezelfde weken
worden geteld.

---

## En één ding dat hier niet thuishoorde, maar wel gevonden is

`JobStatus` in de app kende `'error'`; de CHECK `ai_jobs_status_valid` kent
`'failed'` en `doelcoach` schrijft dat ook. De tak in het coach-scherm die een
mislukking afhandelde, was daardoor **onbereikbaar**: elke mislukte generatie
liep sinds QS8-38 de volle zestig pollrondes uit en toonde "dit duurt te lang",
terwijl de echte reden keurig in `ai_jobs.error` stond.

Dat is de vorm van 0032/0034: twee kopieën van dezelfde lijst aan weerszijden
van de grens, zonder test die ze op **gelijkheid** legt. Die test staat nu in
`tests/beloftes/jobstatus.test.ts` en leest de CHECK uit het migratiebestand in
plaats van hem over te typen.

⚠️ **Dit hoorde een eigen issue en een eigen PR te zijn** — CLAUDE.md schrijft
één branch per Linear-issue voor. Dat kon niet: Linear weigert nieuwe issues op
de gratis tier van deze workspace ("You've exceeded the free issue limit"). Het
is daarom in deze branch meegegaan, omdat QS8-41 er anders bovenop zou bouwen en
zijn eigen terugvalscherm niet kon waarmaken. **Maak het issue alsnog aan zodra
de limiet opgelost is**, al is het maar om de vondst een plek te geven.

⚠️ **De algemene les is groter dan deze ene bug.** Elke statuslijst die aan
beide kanten van de grens bestaat, hoort zo'n gelijkheidstest te hebben. Er zijn
er meer dan deze twee; ze zijn niet nagelopen.
