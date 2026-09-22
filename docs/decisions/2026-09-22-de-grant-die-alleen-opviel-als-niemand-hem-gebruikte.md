# De grant die alleen opviel als niemand hem gebruikte

**22-09-2026 · QS8-592 · `scripts/kolomrechten-controle.mjs`**

## Wat er stuk was

`kolomrechten:controle` meldde een **tabelbrede** INSERT- of UPDATE-grant alleen
wanneer niets in `src/` of `app/` naar die tabel schreef. De bevinding zat in
`zonderAanroeperMeldingen()` en dus achter de voorwaarde die bij die functie
hoort:

```js
if (r.breed && geschreven[sleutel] === undefined) {
  zonderAanroeper.push({ tabel, soort, kolommen: [], breed: true });
}
```

📏 Gemeten op 22-09-2026 tegen `origin/main` = `ce546f73`, door
`beoordeelSchrijven()` — geëxporteerd en puur — te voeden met één tabelbrede
INSERT-grant op `points_ledger`:

| geval | ontbrekend | ongeschreven | zonderAanroeper |
| --- | --- | --- | --- |
| tabelbrede grant **mét** een schrijver in `src/` | 0 | 0 | **0** |
| dezelfde grant **zónder** schrijver | 0 | 0 | 1 |
| ter vergelijking: smálle grant, schrijver zonder recht | **1** | 0 | 0 |

De derde rij laat zien dat de kolomvergelijking werkt zodra de grant versmald is.
De eerste is het gat.

## Waarom dat precies verkeerd om is

Een tabelbrede grant op een ongebruikte tabel is dood hout. Een tabelbrede grant
op een tabel waar de client actief naartoe schrijft, geeft die client schrijfrecht
op **élke kolom** — ook de kolommen die de server hoort te zetten, en ook de
kolommen die de tabel later krijgt.

De controle was dus het luidst waar het risico het kleinst was, en stil waar het
grootst was. En er is geen tweede net: direct na deze tak slaat
`beoordeelSchrijven()` de kolomvergelijking voor dat paar over
(`if (r.breed) continue;`), want een tabelbrede grant ís niet per kolom te
beoordelen.

⚠️ Het commentaar bij de `ongemeten`-tak zei dat deze bevinding *"met opzet ook
gemeld wordt als het paar geregistreerd is"*. Dat klopt — over het **register**.
Het zegt niets over het geval hierboven, en daardoor las die alinea
geruststellender dan de code was.

## De toets die er wél stond

⚠️⚠️ **Dit is het interessantste deel, en het kwam boven door de ijking en niet
door nadenken.** Bij het verplaatsen van de bevinding bleef de hele suite van 124
toetsen groen. De eerste conclusie — *er stond geen enkele toets op* — was fout,
en mutatie 3 van de ijking bewees dat: er valt er wel degelijk een om.

Wat er stond is dit:

```js
const oordeel = beoordeelSchrijven({
  acties: [],
  rechten: { reports: { INSERT: { breed: true, kolommen: [] } } },
});
expect(meldingen(oordeel, lijsten)).toHaveLength(1);
```

`acties: []` — geen enkele schrijver. **De toets voedde precies het geval dat
werkte, en het geval dat stuk was is nooit gevoed.** Dat is vraag 3 van
onwrikbare regel 18 in zijn zuiverste vorm: kan deze toets groen blijven terwijl
de belofte breekt? Ja, en dat is hij al die tijd geweest.

Dezelfde vorm als de andere gevallen in dit project waar een suite groen bleef
over een naad: de toets toetste een eigenschap van het **onderdeel** (de melding
komt als er niets schrijft) in plaats van de **belofte** (een tabelbrede grant is
een bevinding).

## Wat er nu staat

Tabelbrede grants gaan in hun eigen lijst en worden onvoorwaardelijk gemeld, met
twee teksten:

| geval | tekst | opdracht |
| --- | --- | --- |
| geen schrijfpad | dood hout | trek hem in, of maak er kolomgrants van |
| wél een schrijfpad | hij verbergt élke kolom voor deze controle, ook die de server hoort te zetten | maak er kolomgrants van |

⚠️ **Twee gevallen, twee teksten, en dat is geen opmaak.** Eén tekst voor allebei
stuurt de helft van de lezers de verkeerde kant op — de klasse van QS8-268, waar
zes scripts jarenlang "start de lokale stack" zeiden terwijl die draaide.

⚠️ Een registerrij kan zo'n bevinding niet afdekken, en dat blijft zo. Een
tabelbrede grant dekt élke kolom die de tabel óóit krijgt, dus er valt per kolom
niets te beoordelen. `tabelbredeMeldingen()` kent daarom geen register.

⚠️ **De bevinding is verhuisd uit `zonderAanroeper` en niet gedupliceerd.** Dat
heeft één zichtbaar neveneffect, en het is het gewenste: een rij in
`GEEN_AANROEPER` voor een tabelbreed paar wordt nu door `verlopenRegels()` als
verlopen gemeld, met de tekst *"maar de grant is tabelbreed — er valt niets meer
te dekken; haal de regel weg"*. Dat is precies wat de doctrine hierboven zegt, nu
ook in de ratel.

## De stand vandaag

📏 Op productie gemeten op 22-09-2026: over élke gewone tabel in `public` met
`has_table_privilege('authenticated', oid, 'INSERT')` en `'UPDATE'` komen er
**nul** terug. Er is geen enkele tabelbrede INSERT- of UPDATE-grant aan
`authenticated`; de omzetting van 0173 staat.

**Dit is dus een grendel voor een gat dat vandaag leeg is.** Dat is wat de
dossierrij van 06-09-2026 voorschrijft: *"Wie deze rij ooit sluit, hoort dat te
doen met die regel in `kolomrechten:controle` en niet met een meting die erbuiten
staat; anders ruimt hij de instanties op en laat hij het mechanisme staan."*

## De ijking

📏 **Ervóór: 131 geslaagd, 0 rood** in `tests/scripts/kolomrechten-controle.test.ts`,
op commit `2e67fbdc`. Eén mutatie per grendel, telkens teruggedraaid, erna weer
131/0.

| # | mutatie | rood |
| --- | --- | --- |
| 1 | terug naar de oude voorwaarde (alleen zonder schrijfpad) | *meldt een tabelbrede grant óók als de app naar die tabel schrijft* + *laat zich niet afdekken door een registerrij* |
| 2 | één tekst voor allebei de gevallen | *zegt bij een grant die in gebruik is iets anders dan bij dood hout* |
| 3 | de meldingen worden niet doorgegeven | vier toetsen, waaronder de bestaande *meldt een tabelbrede grant, ook als het paar geregistreerd is* |

Mutatie 3 is degene die de correctie hierboven afdwong.

## Wat dit niet is

Geen wijziging aan de kolomvergelijking, en geen poging om een tabelbrede grant
alsnog per kolom te beoordelen — dat kán niet, want hij dekt ook de kolommen die
de tabel later krijgt. De uitweg blijft: maak er kolomgrants van, of trek hem in.

En geen belofte dat deze controle een tabelbrede grant *vindt* zonder database.
Hij leest de échte grants, en is in een cloudsessie ongemeten. Wat hier getoetst
is, is het oordeel.
