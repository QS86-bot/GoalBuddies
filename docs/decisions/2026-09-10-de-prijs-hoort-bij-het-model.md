# De prijs hoort bij het model dat hem maakte

**Datum:** 10-09-2026 · **Issue:** QS8-187 · **Migratie:** geen

## De vondst

`supabase/functions/doelcoach/index.ts` droeg twee losse constanten:

```
const MODEL = 'claude-sonnet-5';
const PRIJS_PER_MTOK_CENT = { invoer: 300, uitvoer: 1500 };
```

📏 **Gemeten op 10-09-2026** tegen
`platform.claude.com/docs/en/about-claude/models/overview.md`, diezelfde dag
opgehaald: **Claude Sonnet 5 kost $2 per input-MTok en $10 per output-MTok.**
Dat is 200 / 1000 cent. De constante stond op 300 / 1500 — en dát is de prijs
van Claude Sonnet **4.6**.

Elke `cost_cents` sinds 06-09-2026 was dus **vijftig procent te hoog**.

## Waarom het misging, en wat de eigenlijke fout is

Op 06-09 (QS8-296) is de constante *bijgewerkt* omdat het commentaar zei dat een
introductieprijs op 31-08 zou verlopen en 300/1500 zou worden. Die verwachting
klopte niet met de lijstprijs, en niets kon dat zien.

⚠️ **De fout is niet het getal maar de vorm.** `MODEL` klopte. De prijs was een
echte prijs van een echt model. Alleen: niet van hetzelfde model. Dat is
onwrikbare regel 18 in zijn zuiverste vorm — elk onderdeel klopt en het geheel
lekt — en het is de reden dat twee losse constanten hier de verkeerde vorm waren.

De dossierrij van 06-09 schreef bovendien iets op dat te somber was: *"je kúnt
hier niet meten of hij klopt: de prijslijst van Anthropic staat niet in dit
systeem, dus een controle kan hoogstens de vervaldatum bewaken en niet het
bedrag."* Het eerste deel is waar; het tweede leidde af van wat er wél te
bewaken viel. **Of de prijs bij het model hoort, is volledig binnen dit systeem
te toetsen** — en dat was precies het kapotte stuk.

## Wat er nu staat

Twee grendels, want er zijn twee verschillende vragen.

**1. Hoort de prijs bij het model? — het typesysteem.**

```ts
const PRIJS_PER_MTOK_CENT = {
  'claude-sonnet-5': { invoer: 200, uitvoer: 1000 },
} as const;

const MODEL: keyof typeof PRIJS_PER_MTOK_CENT = 'claude-sonnet-5';
const PRIJS = PRIJS_PER_MTOK_CENT[MODEL];
```

Een model omzetten zonder een prijsregel erbij is nu een **typefout**.
📏 Nagemeten door `MODEL` op `claude-opus-5` te zetten: `deno check` wordt rood
op regel 95, en `npm run edge:types:controle` draait mee in de poort.

**2. Klopt het bedrag nog? — een meting met een datum.**

Dat kan geen typesysteem weten; het is een feit van buiten dit project.
`tests/beloftes/doelcoach-prijs.test.ts` legt de gemeten lijstprijs vast **met de
datum en de bron erbij**, zodat er iets te herzien valt in plaats van iets te
geloven. Verzet iemand het bedrag, dan hoort de meting mee te verhuizen.

⚠️ **Dat is geen automatische controle en doet ook niet alsof.** Een script dat
de prijslijst ophaalt zou de poort van een netwerkaanroep afhankelijk maken —
dezelfde reden waarom `migraties:controle` niet fetcht. Wat er wél is: een getal
dat niet meer alleen in commentaar staat, en dat rood wordt zodra iemand het
verzet zonder de meting bij te werken.

## Wat het gekost heeft: niets, en dat is gemeten

📏 Op productie (`wehgocadxehottiiyvsc`, 10-09-2026): **drie jobs in
`ai_jobs`**, alle drie van 30 en 31 augustus, en **alle drie met
`cost_cents = 0`**. Er is dus nooit één bedrag met de verkeerde prijs geboekt.

Twee dingen volgen daaruit, en ze wijzen twee kanten op:

* **Meevaller:** deze reparatie is preventief. Er hoeft geen data hersteld te
  worden.
* **Tegenvaller, en die is ouder dan dit issue:** `cost_cents` is op productie
  nog nooit iets anders dan nul geweest, terwijl er drie echte calls zijn
  geweest. Dat is het gat dat 0182 in zijn kop al beschrijft —
  `data.usage?.input_tokens ?? 0` boekt een gratis job als het usage-blok
  ontbreekt — en het betekent dat het dagbudget in centen tot vandaag nog nooit
  een echt bedrag heeft gezien. **Nul is geen bedrag, het is een ontbrekend
  bedrag.**

## Wat dit issue verder vroeg en wat daarvan open blijft

QS8-187 vroeg drie dingen. Het eerste is hierboven beantwoord. De andere twee
blijven staan, met de reden erbij:

* **Hoe vaak valt het model buiten het schema, en hoe vaak komt `stop_reason` op
  `max_tokens`?** Dat is modelgedrag over veel calls. Met drie calls is dat geen
  meting maar een anekdote; het blijft wachten op volume.
* **Moet er een alarm komen als `cost_cents` per week boven een grens komt?**
  `ai_kosten_per_week()` bestaat en heeft sinds 28-08 een test. Wat ontbreekt is
  een grens, en die is vandaag niet te kiezen: met drie jobs à nul cent is elk
  getal een gok in dezelfde klasse als de vijftien plafonds ervoor. Dit is
  bewust géén nieuwe constante zonder meting erachter — dat is precies de vorm
  die dit issue net heeft opgeruimd.
