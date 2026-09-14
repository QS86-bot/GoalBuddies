# Een bewering die niet te lezen is, is niet getoetst

**Datum:** 14-09-2026
**Issue:** QS8-482
**Raakt:** `scripts/docs-controle.mjs`, onwrikbare regel 18 (vraag 3)

## De meting

📏 `docs/WERKVOORRAAD.md` §0 zei *"Het gat is daarmee **veertig** bestanden"* bij
een werkelijk gat van 37. `npm run docs:controle`:

```
docs-controle: de overdrachtsdocumenten spreken elkaar niet tegen.
```

Groen. En met de **juiste** waarde voluit óók groen — om dezelfde reden, niet om
de goede.

📏 Dezelfde mutatie met het getal in cijfers gaf wél de klacht. Het verschil zat
dus niet in de bewering maar in de vorm waarin ze stond.

📏 Nagemeten op 14-09-2026 tegen de versie van vóór dit issue, met de echte
`WERKVOORRAAD.md` en het **kloppende** getal voluit
(`drieënveertig`, gat 43): exitcode 0, geen klacht. Dat is de bug, niet een
reconstructie ervan.

## De oorzaak

`NUMMERWOORDEN` loopt van `nul` tot en met `twintig`. `telWoord()` geeft voor
alles daarboven `undefined`, en `beoordeelStand()` deed:

```js
if (beweerdGat === undefined || Number.isNaN(productie)) return fouten;
```

Eén `undefined` droeg daarmee twee betekenissen: *er staat niets* en *ik kan het
niet lezen*. De eerste hoort te zwijgen; de tweede is een bevinding.

⚠️ Dit project houdt die twee elders wél uit elkaar. `functies:controle` en
`register:controle` printen OVERGESLAGEN en de poort telt ze als **ongemeten**
in plaats van als groen. Hier viel de tweede stil samen met de eerste.

## Het besluit: de klacht, en één grens

**Staat er een bewering en is haar getal niet te lezen, dan is dát de klacht.**
`leesBewering()` geeft nu drie uitkomsten in plaats van twee — `staatEr: false`,
`waarde`, `onleesbaar` — en `beoordeelStand()` meldt de derde per bewering apart.

En de klacht zegt wat de schrijver moet doen: **tot en met twintig mag voluit,
daarboven hoort een cijfer.** Dat is geen nieuwe huisstijl maar de bestaande,
opgeschreven: 📏 de twee beweringen in §0 staan vandaag allebei in cijfers (270
en 43). De grens stond nergens, dus koos de schrijver hem per keer — en dát is
hoe deze fout ontstond.

### Waarom `NUMMERWOORDEN` niet tot negenennegentig is uitgebreid

Het issue noemt die uitbreiding als tweede net, uitdrukkelijk niet als
vervanging. Ze is afgevallen:

- Ze **verkleint** het stille venster en sluit het niet — `honderdtwaalf`
  ontsnapt er nog steeds aan, en dan is de uitkomst weer groen-zonder-meting.
- Ze voert een **tweede** grens in (honderd) naast de grens die de huisstijl al
  heeft (twintig), en die tweede staat nergens. Een controle met twee
  onuitgesproken grenzen is de vorm die dit issue veroorzaakte.
- Tachtig samenstellingen zijn code die alleen bestaat om dezelfde klacht uit te
  stellen.

De klacht sluit het venster wél, voor élk getal, en zegt meteen wat er moet
gebeuren.

## ⚠️ Wat `PRODUCTIESTAND` hiervan uitzondert

`PRODUCTIESTAND` matcht alleen vier cijfers. Hij levert dus een getal of geen
treffer; de toestand "gematcht maar onleesbaar" kan bij hem niet bestaan. Zijn
stilte is altijd de "er staat niets"-soort, en die blijft stilte — een controle
die proza *eist*, schrijft het document.

## 📏 De ijking

**Tegen het echte document**, via `npm run docs:controle`, "ervoor" en "erna"
allebei gemeten en allebei groen:

| | Mutatie op regel 36 van `WERKVOORRAAD.md` | Wat de controle zei |
|---|---|---|
| D1 | `43` → `41` (fout, in cijfers) | *"zegt dat het gat tot productie (0224) 41 bestanden groot is, maar er staan er 43"* |
| D2 | `43` → `veertien` (fout, voluit, binnen wat hij kent) | *"… 14 bestanden groot is, maar er staan er 43"* |
| D3 | `43` → `drieënveertig` (**juist**, voluit, boven twintig) | *"`drieënveertig` is voor deze controle geen getal — die bewering is dus niet getoetst maar overgeslagen"* |

⚠️ D3 is de scherpste: de bewering is **waar** en de controle is tóch rood. Wat
hij niet kan lezen, kan hij niet nakijken — en morgen klopt het niet meer.

**Tegen de zeef zelf**, één mutatie per grendel, vooraf gemeten op 36 groen:

| Mutatie | Wat er rood werd |
|---|---|
| de gat-klacht eruit | 3 — de twee gat-gevallen en het gecombineerde |
| de maptelling-klacht weer stil | 3 — het maptelling-geval, de grenszin en het gecombineerde |
| de grenszin uit de klacht | **1** — *"zegt in de klacht wat de schrijver moet doen"* |
| `leesBewering()` vouwt `onleesbaar` terug op `staatEr: false` | 7 — de hele klasse |
| de terugval `gevonden[1] ?? gevonden[0]` eruit | 2 — de twee `g`-vlag-toetsen |

⚠️⚠️ **Eén grendel is met opzet niet apart te ijken, en dat is gemeten in
plaats van aangenomen.** `beoordeelStand()` toetst op `staatEr && waarde ===
undefined` en niet op `onleesbaar !== undefined`. 📏 Alléén die helft terugzetten
laat alle 38 toetsen groen: zolang `leesBewering()` met `?? gevonden[0]` garandeert
dat `onleesbaar` tekst is, zijn de twee vormen gelijkwaardig. Ze blijft staan omdat
ze de **belofte** uitdrukt — *"er staat een bewering en ik kon hem niet lezen"* —
waar de andere vorm een eigenschap van de implementatie uitdrukt (regel 18, vraag
2). Dat de suite haar niet kan zien, hoort een instrument op te schrijven in plaats
van te overschreeuwen.

⚠️ De derde is de reden dat die zin een eigen toets heeft: zonder hem zou
acceptatiecriterium 4 (*de grens staat opgeschreven*) alleen in een comment
leven, en dat is precies wat QS8-412 een controle waard vond.

📏 De must-allows bleven in alle vier groen, waaronder de twee die de zin uit
`CLAUDE.md` beschermen — *"Het gat is de belangrijkste: de bestanden zijn…"* —
een zin over waaróm een gat erg is, geen bewering over een aantal.

## ⚠️ De val die deze reparatie bijna opnieuw opende

De eerste versie liet `beoordeelStand()` toetsen op `onleesbaar !== undefined`,
en `leesBewering()` zette daar `gevonden[1]` in. `String.match()` geeft met de
`g`-vlag de hele treffers terug **zonder** groepen, dus `gevonden[1]` is bij één
treffer `undefined` — en dan is `onleesbaar !== undefined` onwaar en zwijgt de
controle. Krijgt `MAPTELLING` of `GATGROOTTE` ooit die vlag, dan staat de bug van
dit issue er weer, gezet door iemand die dacht een patroon te verbeteren.

Gevonden bij het adversarieel teruglezen van de eigen diff, vóór de PR. Beide
kanten staan nu vast: `onleesbaar` is altijd tekst, en de toets vraagt naar de
belofte.

## Wat dit niet repareert

⚠️ `inhoud.match()` leest de **eerste** treffer. Staat er verderop in
`WERKVOORRAAD.md` een tweede, verouderde `het gat is … bestanden`, dan ziet de
controle die niet — ook niet als hij onleesbaar is. 📏 Gemeten op 14-09-2026:
precies één treffer per patroon in dat document, dus vandaag is dat een latent
gat en geen actief. Het staat met zijn voorwaarde in `docs/ENGINEER-REVIEW.md`.
