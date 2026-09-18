# Een register op DML, en niet de eindtoestand — met de prijs erbij

**18-09-2026 · QS8-528 · `npm run dml:controle`**

## Het gat

`idempotent:controle` (QS8-413) speelt elke migratie direct na zichzelf nog een
keer af en kijkt of het **omvalt**. Dat vangt elke DDL-botsing en elke
uitvoeringsfout — het geval uit QS8-303 (een `update` op een identity-kolom die
bij het plánnen faalt) valt er wél om.

⚠️⚠️ **Wat het niet vangt is de statement die twee keer slaagt en twee keer iets
ánders doet.** `update t set n = n + 1` draait twee keer zonder klacht en laat
een andere eindtoestand achter. *"Valt hij om"* is niet dezelfde vraag als *"is
de eindtoestand gelijk"*.

## 📏 De telling wijkt af van het issue, en dat is nagemeten

Het issue telde **9** bestanden met topniveau-DML. 📏 Gemeten op 18-09-2026 over
294 migraties: **12 bestanden, 23 statements**.

De drie die ontbraken zijn `0033`, `0085` en `0280`, alle drie met een `update`
op kolom 0 — onmiskenbaar topniveau. `0280` is van ná die telling; `0033` en
`0085` niet, en die twee zijn dus gewoon gemist. Alle 23 zijn met de hand
nagelezen en alle 23 zijn idempotent van vorm; de reden per statement staat in
het register.

⚠️ **De eenheid is het statement en niet het woord, en dat scheelt een orde.**
📏 Een woordtelling op `update` geeft over deze map **206** treffers:
`create policy … for update`, `create trigger … after update on` en
`grant update (…)` dragen het woord alle drie en zijn geen van drieën DML. Een
controle die er 206 meldt, leer je uitzetten.

## De keuze: register of eindtoestand

Er zijn twee vormen, en de goedkope is niet de eerlijke.

| | wat hij meet | prijs |
|---|---|---|
| **register** | dat iemand een reden heeft opgeschreven | de reden kan onwaar zijn |
| **eindtoestand** | de belofte zelf: is de database na twee runs gelijk | een ingreep in `schema-opbouwen.sh` |

**Het is het register geworden.** De reden is niet dat het makkelijker is maar
dat de eindtoestandsvergelijking iets kapotmaakt wat er al staat:
`scripts/schema-opbouwen.sh` zet beide passes met opzet in **één** psql-sessie,
en daar dankt `idempotent:controle` zijn 📏 twee seconden aan (23,3 s → 25,3 s
op een gewone opbouw). Met een snapshot en een checksum per tabel tussen de twee
passes is dat weg, en dan betaalt élke run van de poort ervoor.

⚠️ **Dat is een afweging en geen uitspraak dat het register beter is.** De
eindtoestandsvergelijking meet de belofte rechtstreeks; dit register meet de
administratie eromheen. Wie dat ooit wil omdraaien, heeft hier de prijs staan.

## Waarom geen vormtoets

Of een `update` idempotent is, is **niet uit zijn tekst af te leiden**.
`where … is distinct from true` en `set n = n + 1` zien er even onschuldig uit,
en een vormtoets die het eerste goedkeurt en het tweede afkeurt bestaat niet
zonder de query te begrijpen. Wat je wél kunt afdwingen is dat iemand er een
regel over geschreven heeft — dezelfde keuze als bij `definer_bewaking()`.

## Het register rot niet, en dat is de tweede helft

Een register dat alleen groeit, verliest zijn betekenis: een rij blijft staan
nadat het statement eruit is, en dekt morgen een ánder statement dat toevallig
hetzelfde fragment draagt. `beoordeel()` meldt daarom óók de rijen die **niets
meer dekken**. Tak 5 van `definer_bewaking()` doet het om dezelfde reden.

⚠️ Het register herkent op een **fragment** en niet op de volledige statement.
Een register dat de hele tekst kopieert, rot bij de eerste herformattering — en
dan herschrijft iemand het register in plaats van de vraag opnieuw te stellen.

## Geijkt — vijf grendels, en de vijfde is de leerzame

| mutatie | uitslag |
|---|---|
| registerrij van `0204` weg | 1 statement zonder reden |
| registerrij die niets dekt | 1 verweesde rij |
| eenheid van statement naar woord | 257 bevindingen, 3 toetsen rood |
| functielichamen blijven staan | 233 bevindingen, 1 toets rood |
| commentaar blijft staan | 2 bevindingen, **0 toetsen rood** |

⚠️⚠️ **Die laatste regel is waarom je kijkt wélke toets omvalt en niet dát er een
omvalt.** De controle werd rood, de suite bleef groen. Mijn twee
commentaartoetsen beginnen met `--` en `/*`, en die matchen het `^`-anker
sowieso niet — ze waren groen om de verkeerde reden.

Wat de knip écht nodig heeft is een **`;` binnen het commentaar**: dan begint het
fragment erna met de DML-tekst. 📏 Beide vormen staan echt in de map — `0176`
(`insert into t default values` in een kop) en `0265`
(`update groups -- set created_at = …`). Met die toets erbij valt mutatie 5 wél
op de bedoelde grendel.

## Wat deze controle niet is

- Geen bewijs dat de 23 statements idempotent **zijn** — alleen dat er een
  gemotiveerde reden bij staat. De reden kan onwaar zijn; dan is hij wel te
  vinden en te weerleggen, en dat is het verschil met vandaag.
- Geen dekking voor DML **binnen** een functielichaam. Die draait pas als iemand
  de functie aanroept, en dat is een andere vraag.
