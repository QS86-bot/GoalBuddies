# Het getal boven de tabel klopte

**Datum:** 12-09-2026 · **Issue:** QS8-445 · **Migratie:** geen

## Wat er mis was

`docs/WERKVOORRAAD.md` §0 draagt de deploylijst: welke migraties nog niet op
productie staan. Het proza zei **vierendertig bestanden, `0222` t/m `0255`**. De
tabel eronder had **33 rijen** en eindigte op `0254`.

📏 `npm run docs:controle` stond groen. Hij telt de twee proza-beweringen na —
*"de map telt er N"* en *"het gat is N bestanden"* — en die klopten allebei. De
rijen keek hij niet.

## Waarom dat erger is dan een ontbrekende regel

De derde kolom van die tabel is *"DDL op `storage.objects`"*, en `0255` staat op
**ja**: een bouwsessie krijgt daar `42501: must be owner of table objects`, dus
dat bestand moet van Quintens eigen machine komen.

**De ene rij die van de lijst viel, is een rij die een handmatige stap vraagt.**
Wie de lijst afwerkt doet `0222` t/m `0254`, vinkt af, en is klaar. Dan bestaan
de drie fotoemmers op productie mét hun INSERT-policies maar **zonder** de
naampin die `0255` juist kwam aanbrengen — precies de toestand die QS8-416
repareerde, en er is niets dat het meldt.

⚠️ Het is bovendien de klasse die dit project het vaakst betaalt: een controle
die het makkelijke deel van een belofte bewaakt. Zolang het gétal nageteld wordt
en de rijen niet, geeft groen toestemming om te stoppen met kijken — zelfde vorm
als QS8-415.

## De reparatie

Twee dingen, en het tweede is het duurzame.

1. De rij toegevoegd.
2. `gattabelKlachten()` erbij in `scripts/docs-controle.mjs`: elke migratie boven
   het productienummer hoort een rij te hebben, en elke rij hoort een migratie
   boven dat nummer te zijn.

⚠️ **De ratel slaat twee kanten op**, zoals bij `levend:controle` en
`regel15:controle`. Een rij zónder bestand is óók rood: dat is een migratie die
hernummerd of ingetrokken is, en zo'n rij stuurt de lezer naar iets dat er niet
meer is. In dit project is hernummeren geen randgeval — het gebeurde deze week
vier keer.

## Waarom een documentbrede zeef en niet "zoek de tabel"

De zeef is `/^\| \`(\d{4}[a-z]?_[a-z0-9_]+\.sql)\`/gm`: regelbegin, pijp,
backtick, migratienaam.

📏 Gemeten vóór hij gebouwd werd: in `WERKVOORRAAD.md` voldoen **33** regels aan
die vorm, en **alle 33** staan in het gatblok — nul daarbuiten. Een
documentbrede zeef heeft hier dus geen valse treffers, en hij hoeft niet te weten
waar de tabel begint of eindigt. Dat maakt hem bestand tegen een kop die
verschuift, wat bij een blok dat wekelijks groeit geen theoretisch risico is.

⚠️ Het `^|`-anker is de grendel die dat draagt, en niet versiering: zonder hem
leest de zeef élke migratienaam in lopende tekst als tabelrij. 📏 Bij de ijking
is dat precies het geval dat omvalt.

## ⚠️ Waarom het blok met de hand onderhouden blijft

Het issue vroeg te overwegen of dit blok überhaupt met de hand hoort te bestaan —
CLAUDE.md zegt immers over de lijst in de auditkop: *"wie zo'n opsomming met de
hand onderhoudt, onderhoudt hem niet."*

**Nagemeten, en het antwoord is: vandaag niet te genereren.**

| wat | uitkomst |
| -- | --: |
| migraties in het gat | 34 |
| zonder issuenummer in de eerste vijf regels | **20** |
| zonder issuenummer in het héle bestand | **6** |

En wie er wél een noemt, noemt er soms meer dan één — een migratie die naar een
ánder issue verwijst is geen uitzondering. De kolom draagt bovendien meer dan een
nummer: bij `0222` staat `QS8-71 (PR #352)`.

Genereren vraagt dus eerst een **conventie** — elke migratie noemt zijn eigen
issue op een vaste plek — en dat is een eigen wijziging met een eigen grendel,
niet iets om als bijvangst in te voeren. Wat hier overblijft is de goedkope helft
die de gemeten fout wél afvangt: de tabel moet kloppen, en dat wordt nu geteld.

⚠️ Dit staat er zodat de volgende lezer niet hoeft te raden of het overwogen is.
Zodra die conventie er komt, is dit blok een kandidaat om te genereren en vervalt
deze afweging.

## IJking

Twee tegen het echte document, vier tegen de zeef, vooraf 26 groen.

| mutatie | wat er rood werd |
| -- | -- |
| de `0255`-rij weghalen — **de oorspronkelijke fout** | *"de gattabel mist een rij voor `0255_…`"* |
| een rij naar een niet-bestaand bestand erbij | *"de gattabel noemt `0299_…`, maar dat staat niet in het gat"* |
| het `^\|`-anker uit `GATRIJ` | 1 — "laat een migratienaam in lopende tekst met rust" |
| de "ontbrekende rij"-richting eruit | 1 — "meldt een migratie in het gat zonder rij" |
| de "overtollige rij"-richting eruit | 2 — de twee gevallen die een rij te veel melden |
| de productie-grendel eruit | 1 — "zwijgt zonder productienummer" |

De eerste is de meting die telt: hij reproduceert de fout van vanochtend
woordelijk, met de bestandsnaam in de melding. De derde is de belangrijkste van
de vier op de zeef, want die bewijst dat het anker draagt.

⚠️ Bij elke mutatie is met een `grep` vastgesteld dát hij in het bestand stond
vóór de uitslag geloofd werd, en daarna is het bestand teruggezet uit een kopie.
