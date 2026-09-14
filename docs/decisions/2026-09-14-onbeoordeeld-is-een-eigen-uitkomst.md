# Onbeoordeeld is een eigen uitkomst, geen soort dood hout

**14-09-2026 — QS8-483.** Gevonden bij het hermeten van de agendarijen (QS8-479).

## Wat er stuk was

`kolomrechten:controle` legt de kolomgrants van `authenticated` naast wat
`src/` en `app/` werkelijk schrijven, in beide richtingen. Eén tak deed dat niet:

```js
if (!g.volledig) {
  ongemeten[sleutel] = 'één schrijfpad naar deze tabel is niet te lezen';
  continue;
}
```

Is één schrijfpad naar een tabel niet als objectliteraal te lezen, dan zweeg de
controle over **álle** kolommen van dat `tabel|recht`-paar — ook over kolommen
die geen enkel léésbaar pad aanraakt.

📏 Gemeten, en de meting is de reden dat dit klein bleef. Van de 70 paren in
`ongemeten` vallen er 55 onder *"er is geen kolomgrant"* (niets verleend, niets
te melden) en 13 onder *"niets schrijft naar deze tabel"* — die laatste worden
wél gemeld, via `zonderAanroeper`. Het gat is **twee paren**: `goals|UPDATE` en
`milestones|INSERT`.

⚠️ **De agendarij zei "66 paren".** Dat getal telde alles wat in `ongemeten`
belandt, en dat is niet hetzelfde als wat nooit gemeld wordt. Een getal dat te
groot is, is net zo goed een verkeerd getal: het maakt een bevinding van twee
paren onleesbaar door hem tussen achtenzestig andere te zetten.

## De meting die de reparatie gratis maakte

📏 Per paar nagemeten wat de leesbare paden dekken:

```
goals|UPDATE       grant = de vijf velden van wijzigDoel()      → niet gedekt: (niets)
milestones|INSERT  grant = de zes velden van bruikbareMijlpalen() → niet gedekt: (niets)
```

De tak opengooien levert dus **nul** nieuwe meldingen op. Geen opruimwerk, geen
register, geen uitzonderingenlijst — alleen een grendel die vanaf nu bindt.

⚠️ **En dat is meteen het argument om het nú te doen.** Zolang het niets kost is
het een regelwijziging; bij de eerste grant die geen leesbaar pad schrijft is het
een opruimactie mét een bevinding eronder die niemand gemeld heeft.

## De ijking, en waarom de "ervóór"-helft erbij hoort

📏 Een echte kolomgrant op de lokale stack —
`grant update (max_points) on public.goals to authenticated` — die geen enkel
schrijfpad zet:

| code | uitslag |
| -- | -- |
| vóór deze branch | **groen**, geen enkele melding |
| ná deze branch | **rood**, met het blinde pad erbij |

Zonder die eerste regel was "de tak zweeg" een bewering over code die ik zelf net
veranderd had. Dezelfde les als in
`docs/decisions/2026-09-10-een-rood-is-niet-vanzelf-jouw-rood.md`: een meting die
op "er werd iets rood" leunt, moet weten wat er vóór de mutatie stond.

## ⚠️ Het besluit: er komt geen register tegenover

Elke andere klasse in deze controle heeft er een — `GEEN_SCHRIJFPAD`,
`GEEN_AANROEPER`, `NIET_TE_LEZEN` — met per rij een reden. Deze niet, en dat is
een keuze en geen omissie.

Een registerrij zegt *"dit is beoordeeld en het mag"*. Over een kolom achter een
blind pad is dat per definitie onwaar: als het pad leesbaar was, was er niets te
registreren. Een rij zou dus een bewering vastleggen die niemand gemeten heeft —
dezelfde leugen-in-een-grendel als een verlopen uitzondering, en de vorm waar
`verlopenRegels()` juist voor bestaat.

De twee uitwegen die wél kloppen staan daarom in de melding zelf: **maak het pad
leesbaar** (een objectliteraal), of **trek de grant in**. Allebei maken de
melding waar in plaats van stil.

⚠️ De prijs is dat er geen knop is om deze bevinding weg te zetten. Dat is
aanvaard: de klasse is vandaag leeg, en een bevinding die je niet kunt wegzetten
maar wel kunt oplossen, is precies wat een grendel hoort te zijn.

## ⚠️ Wat níet verandert, en dat is de val van PR #140

`ongemeten[sleutel]` blijft gezet voor dit paar. `verlopenRegels()` leest hem:
een uitzondering op een paar met een blind pad is **niet verlopen** maar
ongemeten, en de opdracht blijft *"herzie hem"* in plaats van *"haal hem weg"*.
Zonder dat onderscheid gaf één onleesbare insert op `chat_messages` ooit de
opdracht om de rij voor `system_event` te verwijderen — de kolom die CLAUDE.md
met drie sloten bewaakt.

⚠️ **De verleiding is nu groter dan hij was.** De tak levert vanaf nu óók een
bevinding op, en dan leest `ongemeten[sleutel]` als een restant.
`tests/scripts/kolomrechten-controle.test.ts` heeft daarom een test die de héle
keten voedt —
`beoordeelSchrijven()` erin, `verlopenRegels()` eruit — en niet de twee kanten
apart. De handgevoede test blijft groen als die regel sneuvelt; deze valt om.

## De toon van de melding is de belofte

`ongeschreven` mag zeggen *"die grant gebruikt niets"*, want dat is gemeten.
Hier mag dat niet. De melding beweert één ding — **dit is niet beoordeeld** — en
noemt het pad dat dat veroorzaakt, zodat de lezer naar het pad loopt en niet naar
de grant. Een test toetst dat expliciet, inclusief de tegentoets dat de zin de
taal van een dode grant *niet* draagt: zonder die helft slaagt elke formulering.
