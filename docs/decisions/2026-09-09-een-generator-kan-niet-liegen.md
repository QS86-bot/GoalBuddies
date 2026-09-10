# Een generator kan niet liegen — en daarom bewees hij niets

**09-09-2026 — QS8-404.** Aanleiding: `docs/WERKVOORRAAD.md` sprak zichzelf tegen
binnen één bestand, en `npm run docs:controle` was er groen op.

## De meting

📏 `main` op `d44de56`, 21:45 UTC:

| regel | wat er stond | wat het was |
| -- | -- | -- |
| 16–17 | "De map telt er **229**" | 237 |
| 19 | "**Het gat is daarmee vijf bestanden**" | dertien (`0222` t/m `0234`) |
| 262 | "Migraties `0001` t/m `0234` … **237 bestanden**" | klopte |

De onderste regel klopte omdat `npm run stand` hem genereert. De bovenste liep
acht migraties achter, want die schrijft een mens.

## Waarom de controle dat niet zag

`controleerMigratiebereik()` zocht per document de **eerste** treffer van
`migraties 0001 t/m NNNN`. In `WERKVOORRAAD.md` is dat het `STAND`-blok.

⚠️ **De enige meetbare tak van deze controle wees dus op een blok dat een
generator per definitie waar houdt.** Hij kon niet rood worden zolang
`npm run stand` liep — en hij zei niets over de rest van het document.

Dat is onwrikbare regel 18 in twee van zijn zes vragen tegelijk:

* **vraag 2** — *toetst deze test de belofte, of een eigenschap van het
  onderdeel?* De belofte is "de overdrachtsdocumenten kloppen". Wat er getoetst
  werd, is "de generator heeft gedraaid".
* **vraag 3** — *kan deze test groen blijven terwijl de belofte breekt?* Ja, en
  op 09-09 deed hij dat aantoonbaar.

⚠️⚠️ **Een controle die op een gegenereerd blok landt, is een controle die zijn
eigen fixture toetst.** Dat is een klasse en niet één geval: overal waar naast
elkaar een gegenereerd en een geschreven exemplaar van hetzelfde feit staat,
kiest een regex die "de eerste treffer" pakt vrijwel altijd het gegenereerde —
dat staat meestal in een vast blok en dus op een voorspelbare plek.

## Wat er nu gemeten wordt

Twee proza-beweringen, allebei tegen `supabase/migrations/` en allebei **zonder
database** — deze controle draait in de poort en in CI, waar een netwerkaanroep
de uitslag afhankelijk zou maken van bereikbaarheid:

| bewering | waartegen |
| -- | -- |
| "De map telt er **N**" | het aantal `.sql`-bestanden |
| "Productie staat op `NNNN`" + "het gat is **N** bestanden" | het aantal bestanden bóven dat nummer |

De documenten schrijven kleine aantallen voluit, dus `telWoord()` leest zowel
`13` als `dertien`. Zonder dat leest de controle de helft van de beweringen niet.

## Vier keuzes die niet vanzelf spreken

### 1. De proza-tak draait alleen op het document dat de stand bezit

`CLAUDE.md` en `VOLGENDE-SESSIE.md` **citeren verouderde getallen met opzet**, als
waarschuwend voorbeeld van precies deze fout:

> Hier stond "productie staat op `0186`, de map op 0216" […] **Dit document bezit
> die stand niet.**

Die citaten rood maken zou de les wissen die ze dragen. De eigenaarstabel in
`CLAUDE.md` wijst `WERKVOORRAAD.md` aan; tak B bewaakt dat dezelfde zinnen niet
élders opduiken. Meten waar het feit hoort, bewaken dat het nergens anders staat.

### 2. `controleerMigratiebereik()` blijft op de eerste treffer staan

De voor de hand liggende reparatie — álle treffers toetsen — is hier de
verkeerde. `WERKVOORRAAD.md` legt bewust geschiedenis vast ("hier stond een uur
eerder `0219`, en dat klopte toen"). Elke historische zin zou dan rood worden, en
een controle die de geschiedenis van een document bestrijdt, leer je uitzetten.
De nieuwe takken mikken daarom op zinnen die de **huidige** stand beweren, niet
op elk getal in het bestand.

### 3. Een ontbrekende zin blijft stil

Verdwijnt de alinea, dan zwijgt de controle — dezelfde keuze als de bestaande
`continue` op een ontbrekende bewering. **Een controle die proza eist, schrijft
het document.** Dit is een bewuste opening en geen omissie; hij staat hier zodat
de volgende lezer hem niet als vondst hoeft te herontdekken.

### 4. Het getal moet vlák voor "bestanden" staan

⚠️ Zonder die eis raakt `GATGROOTTE` ook deze zin uit `CLAUDE.md`:

> Het gat is de belangrijkste: **de bestanden** zijn de enige manier om dit schema
> ergens anders op te bouwen

Dat is een zin over waaróm een gat erg is, geen bewering over een aantal.

📏 **En de schade zit niet waar je hem zoekt.** `beoordeelStand()` zou er niets
van maken — `telWoord('de')` is `undefined`, dus er valt niets te vergelijken.
Maar `GATGROOTTE` staat óók in `FEITEN`, en dáár betekent een treffer *"dit feit
staat ook in CLAUDE.md"*. Gemeten met de losse variant:

```
- de grootte van het gat tot productie hoort alleen in docs/WERKVOORRAAD.md
  te staan, maar staat ook in CLAUDE.md.
```

De hele poort rood om een zin die klopt.

## De eerste die hij ving was zijn eigen auteur

📏 De valkuil die ik hierover in `docs/VOLGENDE-SESSIE.md` schreef, citeerde de
twee foute getallen om de les te dragen. Tak B werd meteen rood:

```
- de grootte van het gat tot productie hoort alleen in docs/WERKVOORRAAD.md
  te staan, maar staat ook in docs/VOLGENDE-SESSIE.md.
```

Terecht. Een geciteerd getal is niet van een beweerd getal te onderscheiden zodra
het er staat — dat is precies waarom `VOLGENDE-SESSIE.md` twee keer eerder een
verouderde productiestand heeft overgeschreven. De reparatie is de reparatie die
`CLAUDE.md` zelf voorschrijft: **verwijs in plaats van te herhalen.** De valkuil
noemt nu de vórm van de fout en niet de getallen.

Dat de controle dat binnen een paar minuten op zijn eigen auteur toepaste, is de
bruikbaarste meting in dit document.

## De ijking

`scripts/docs-controle.mjs` exporteerde niets en had geen test — terwijl hij
QS8-125 bewaakt en meedraait in `/audit` en in de poort. Dat is waarom niemand
kon zien dat zijn enige meetbare tak op een generator wees. Nu:
`tests/scripts/docs-controle.test.ts`, 19 gevallen, met de vormen die hij moet
vinden **en** de vormen die hij met rust moet laten.

⚠️ **Mutatie per grendel, niet één voor de hele controle:**

| mutatie | wat er rood werd |
| -- | -- |
| A — de maptelling-tak vuurt nooit | 3 tests |
| B — de gat-tak vuurt nooit | 2 tests |
| C — `telWoord` geeft `0` voor een niet-getal | 1 test |
| D — de adjacency-eis uit `GATGROOTTE` | 1 test |

⚠️⚠️ **Eén ijking is onderweg gesneuveld, en dat is de leerzaamste.** De test die
de zin uit `CLAUDE.md` met rust laat, voerde zijn geval eerst langs een pad dat
een éérdere grendel al afving: er stond geen productiestand in de invoer, dus hij
stopte op *"niets te vergelijken"* en bereikte de regex nooit. Hij was groen om
een reden die niets met zijn naam te maken had.

📏 Nagemeten: mutatie C en mutatie D laten die test **allebei apart** groen — twee
onafhankelijke eigenschappen dekken hem af. Hij is dus een regressievanger op een
echte zin en geen ijking van één grendel, en dat staat nu zo in de test. De
adjacency-eis heeft daarom een eigen test gekregen op de laag waar hij wél draagt:
`GATGROOTTE` mag de echte tekst van `CLAUDE.md` niet raken.

Dat is de eigen regel uit `CLAUDE.md`, en hij kostte hier een tweede poging:
**breek de grendel die de ijking nóemt, niet zomaar iets — anders is de ijking
zelf de aanname.**
