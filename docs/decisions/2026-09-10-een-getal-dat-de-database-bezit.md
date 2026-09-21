# Een getal dat de database bezit, mag geen kopie in de app krijgen

**Datum:** 10-09-2026 · **Issue:** QS8-204 · **Migratie:** geen

## Wat dit issue vroeg, en wat er niet aan te beantwoorden viel

De maximale weekpasvoorraad staat op **2**, als `weekpas_maximum()` in migratie
0039, met deze redenering: zes voltooide cycli per pas plus een voorraad van twee
betekent dat je twee weken kunt missen zonder je reeks te verliezen. Hoger maakt
de pas waardeloos; lager maakt hem tot een fooi.

**Er zit geen onderzoek achter en geen gebruikersdata**, en dat verandert vandaag
niet: er zijn geen gebruikers. Het getal is dus niet te valideren, en dat blijft
zo tot er gedrag te meten valt. De rij blijft Laag en blijft staan.

## Wat er wél te doen was

Het issue draagt één zin die het parkeren rechtvaardigt:

> Het is één regel SQL om te veranderen, en er is bewust **géén kopie van dat
> getal in TypeScript**, dus aanpassen kan zonder release.

⚠️ **Dat is precies het soort bewering dat stil verrot.** Hij was waar toen hij
geschreven werd. Niets hield hem waar. En hij is niet vrijblijvend: hij ís de
reden dat dit getal geparkeerd mag worden. Glipt er morgen een
`const WEEKPAS_MAXIMUM = 2` in de app bij, dan kost herzien ineens een release,
en dan is het parkeren achteraf onterecht geweest — zonder dat iemand het merkt.

Zelfde klasse als de prijsconstante van QS8-187, en als de zin over een grant uit
QS8-293: een uitspraak die vanzelf onwaar wordt en waar niets rood van gaat.

## Wat er nu staat

📏 **Eerst gemeten dat de claim nog klopte**, voor alle vier de getallen waar een
migratiekop deze eis met zoveel woorden neerzet: geen constante in `src/`, `app/`
of de Edge Functions die het begrip benoemt.

Toen vastgezet: `npm run afstemgetal:controle`, met vier rijen in het register.

| Functie | Migratie | Wat er stukgaat bij een tweede bron |
|---|---|---|
| `weekpas_maximum()` | 0039 | herzien kost een release in plaats van één regel SQL |
| `bedenktijd()` | 0046 | het scherm biedt een knop aan die de database weigert, of verbergt een recht dat de gebruiker heeft |
| `ai_job_voorschot_cent()` | 0182 | poort en melding lopen uiteen over hoeveel een gebruiker vandaag nog mag |
| `ai_dag_budget_cent()` | 0182 | de afleiding die het getal 10 op één plek houdt, wordt ongedaan gemaakt |

⚠️ **Op de naam en niet op het getal.** Zoeken naar de waarde `2` in `src/` geeft
honderden treffers, en een controle die dat meldt leer je te negeren. De belofte
gaat bovendien niet over een waarde maar over een **begrip**: een constante die
dit begrip benoemt is een tweede bron, ook als hij vandaag toevallig hetzelfde
getal draagt. Juist dán — twee kopieën die gelijk moeten blijven zijn in deze
codebase al een keer geruisloos uit elkaar gelopen (valkuil 18, en 0039 noemt het
zelf).

⚠️ **Tweezijdig**, zoals `zichtbaarheid-controle` en `aansluiting-controle`.
Verdwijnt een functie uit de migraties, dan wordt de controle daar óók rood van:
een register dat een functie noemt die niet bestaat, is een lijst die liegt.

## De ijking

Twee mutaties, één per grendel, met de hand gedraaid op 10-09-2026:

* **A** — `const WEEKPAS_MAXIMUM = 2;` in `src/modules/goals/weekpas.ts`
  → rood, met bestand, regelnummer en de reden uit het register.
* **B** — `weekpas_maximum` in het register hernoemd naar iets dat niet bestaat
  → rood op de andere kant.

`tests/scripts/afstemgetal-controle.test.ts` biedt de lezer bovendien elke vorm
los aan: de vier die hij moet vinden (kaal, geëxporteerd met type, ingesprongen,
met het juiste regelnummer) én de vier die hij met rust moet laten (een zin in
commentaar, een RPC-aanroep, een veldnaam in een type, een constante over iets
anders). **Die tweede helft weegt even zwaar**: een controle die alles meldt,
leert je hem te negeren.

## Wat dit besluit níét is

Geen uitspraak over of **2** het goede getal is. Dat blijft een open vraag voor
de review, en het antwoord komt uit gedrag en niet uit code. Wat hier besloten is,
is dat die vraag **goedkoop te beantwoorden blijft**.
