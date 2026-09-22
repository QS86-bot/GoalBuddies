# De namen klopten en de velden niet

**22-09-2026 · QS8-593 · `scripts/typesdrift-controle.mjs`**

## Wat er ontbrak

`typesdrift:controle` telde per sectie welke **namen** het schema en
`src/lib/database.types.ts` van elkaar verschillen. Dat is precies wat de drift
van 57 vond in QS8-569. Maar een handgeschreven `| null` op een bestaand
argument, een kolom die aan een `Returns` ontbreekt, of een blok dat een oudere
vorm van een view beschrijft, zit **binnen** een naam die aan beide kanten staat.

📏 Bij het sluiten van QS8-569 bleven er zo **37** veldverschillen onzichtbaar:
veertien handedits, veertien regels waarmee `koppelbare_doelen` een vorm van
`goal_dashboard` beschreef die niet meer bestond, en negen `Relationships`-ruis.
De veertien handedits verdwenen bij de eerste hergeneratie zonder dat er iets
rood van werd — en de vorige keer duurde dat vijf maanden.

## De stand vandaag

📏 Gemeten op 22-09-2026 tegen `origin/main` = `74f819a9`, met een verse
generatie uit de MCP-tool `generate_typescript_types` (3907 regels, productie
`0294`):

| meting | uitkomst |
| --- | --- |
| namen | gelijk |
| namen met een afwijkend blok | **0** |
| waarvan alleen `Relationships` | **0** |

De hergeneratie van QS8-569 staat. **Dit is dus een grendel voor een gat dat
vandaag leeg is** — dezelfde vorm als QS8-592, en om dezelfde reden.

## De ijking die de reparatie corrigeerde

⚠️⚠️ **De eerste versie van `blokken()` droeg precies het gat dat dit issue moest
dichten, in zijn eigen reparatie.**

Hij liet een blok lopen tot zijn accolades in balans waren. Bij een
overload-unie schrijft de generator de naam **zonder** `{`:

```ts
activeer_weekplanstap:
  | { Args: { … }; Returns: Json }
  | { Args: { … }; Returns: Json }
```

Op die regel is de accoladestand meteen nul, dus het blok werd direct gesloten en
📏 kwam er **leeg** uit. Een handedit binnen een overload was daarmee onzichtbaar
— voor de vergelijking die juist beloofde dat niet meer te zijn. 📏 Er staan er
vandaag **2** in `src/lib/database.types.ts`.

Een blok loopt nu tot de **volgende naam**, en dat is hier de betrouwbaardere
grens: een naam staat altijd op inspringing 6 en een genest veld op 8 of meer.

⚠️ Dezelfde vorm als de val die de náámparser bijna kostte, en die in de kop van
dit script al beschreven stond: *een naamregex op `^ {6}(\w+): \{` — de eerste
die je schrijft — mist hem.* De waarschuwing stond er, en de tweede lezer liep er
alsnog in. Dat is geen slordigheid maar een eigenschap van de vorm: de overload
is de enige constructie in dit bestand die zijn accolade een regel later zet.

## Het register

`GENERATORRUIS` is een register en geen stille filter: per vorm staat er wát er
genegeerd wordt en waaróm, met de meting erbij.

⚠️ **`Relationships` is vandaag niet nodig en staat er toch.** 📏 Nul van de nul
verschillen hadden die vorm. Hij staat er op grond van de meting van 21-09, waar
**9** van de 37 verschillen precies dat waren: per generatorversie anders genest,
over hetzelfde schema. **Dat is een aanname over de toekomst en geen meting van
vandaag**, en zo hoort hij gelezen te worden.

⚠️⚠️ **De scherpste grens eromheen staat als toets.** De ruis mag alléén het stuk
ná `Relationships:` wegnemen; wat eróver staat moet zichtbaar blijven. Een iets
bredere regex maakt de halve tabel onzichtbaar en dan is de controle groen over
precies de kolommen waarvoor hij bestaat — *vindt een blok over meer regels* en
*kijkt wél naar wat vóór Relationships staat* vallen allebei om zodra dat
gebeurt (mutatie 2).

## Twee meldingen en niet één getal

Een naamverschil en een veldverschil vragen iets anders. Bij het eerste
hergenereer je; bij het tweede is de vraag éérst *wie heeft hier met de hand in
geschreven*, want hergenereren laat het verschil verdwijnen zónder dat iemand
gezien heeft wát er weg ging. Ze worden daarom apart gemeld en niet bij elkaar
opgeteld, en de veldmelding wijst naar de correctielaag
(`src/lib/database.types.correcties.ts`) als de plek waar een bewuste afwijking
hoort.

## De ijking

📏 **Ervóór: 30 geslaagd, 0 rood**, op commit `0971102b`. Eén mutatie per
grendel, telkens teruggedraaid, erna weer 30/0.

| # | mutatie | rood |
| --- | --- | --- |
| 1 | `blokken()` sluit weer op accoladestand | *vergelijkt ook de inhoud van een overload-unie* + *kent een overload-unie en loopt er niet op vast* |
| 2 | de ruisregex neemt ook weg wat vóór `Relationships` staat | *vindt een blok over meer regels* + *kijkt wél naar wat vóór Relationships staat* |
| 3 | een naam die maar aan één kant staat telt óók als veldverschil | *laat een naam die maar aan één kant staat met rust* |
| 4 | de ruis wordt niet meer weggeknipt | *laat een verschil in Relationships met rust* |

En de ijking tegen het échte bestand, die laat zien wat de naamvergelijking niet
kan: één `p_goal_id: string` → `string | null` in
`plaats_systeembericht_in_doelgroepen` laat de naamvergelijking op **0** staan en
brengt de veldvergelijking op **1**.

⚠️ De eerste poging tot die meting gaf *beide* op 0, en dat was geen bevinding
maar een kapotte opstelling: de fixture verving een regel met een
`String.replace` die niet landde. **Een ijking die niets rood maakt, is eerst
verdacht over zichzelf** — dat is de vorm van QS8-411.

## Wat dit niet is

Geen poging om handwerk van uitrolachterstand te scheiden. Die twee zijn alleen
te scheiden door tegen de **map** te genereren in plaats van tegen productie, en
dat staat al in de kop van het script; de controle meldt het verschil en zegt
welke bron hij gebruikt heeft.

En geen wijziging aan de correctielaag: die bewaakt de vijftien velden die
bewust afwijken, en blijft de plek waar een correctie hoort.
