# Het register keek de andere kant op — 10-09-2026

**Issue:** QS8-414
**Raakt:** `tests/scripts/psql-verbinding.test.ts`, `tests/rls/psql-stack.ts`, en vijf RLS-testbestanden

---

## 1. Het gat

CLAUDE.md zegt het onomwonden:

> **Een controle die `psql` aanroept, bouwt zijn eigen aanroep niet.** Dat is
> zesmaal dezelfde vergeten vlag geweest. `psqlArgumenten()` is de enige weg;
> een uitzondering hoort in het register in
> `tests/scripts/psql-verbinding.test.ts`, mét reden.

Dat register scande `readdirSync(SCRIPTS)` op `.mjs` — dus **alleen `scripts/`**.
De testboom roept `psql` óók aan, en die aanroepen zag niemand.

## 2. Wat de meting opleverde, en het waren er niet één

Het issue schatte in: *"vandaag staat er precies één argumentenlijst in de
testboom en die klopt"*. 📏 Toen de controle er eenmaal was, meldde hij er
**vijf**:

| Bestand | Vorm |
| -- | -- |
| `tests/rls/aanmelding.test.ts` | eigen lijst plus drie `-v`-variabelen |
| `tests/rls/adempauze-grendels.test.ts` | eigen `psqlArgs()`, zónder `ON_ERROR_STOP` |
| `tests/rls/definer-aanroepertoets.test.ts` | een identieke `inEenSessie()` |
| `tests/rls/goalgebeurtenissen.test.ts` | dezelfde `inEenSessie()`, woordelijk |
| `tests/rls/zoekpadschaduw.test.ts` | dezelfde `inEenSessie()`, woordelijk |

Drie ervan waren **letterlijk hetzelfde blok** — en dat blok was al
`psqlMetInvoer()` uit `psql-stack.ts`, alleen dan overgetypt. Dit is de vorm van
QS8-270 nog een keer, in dezelfde map, drie jaargangen later.

⚠️ **Waarom een `grep` dit miste en de controle niet.** De handmatige zoekopdracht
was `execFileSync('psql'` op één regel; vier van de vijf schrijven het over
meerdere regels:

```ts
return execFileSync(
  'psql',
  ['-U', PSQL_OMGEVING.PGUSER as string, …],
```

De controle staat `\s*` toe tussen de haak en `'psql'`. **Dat verschil is het
hele issue in het klein**: een regel die je met de hand handhaaft, handhaaf je op
de vorm die je toevallig intypt.

## 3. Wat er níet gebeurd is: de twee bomen samenvoegen

`scripts/psql.mjs` zet `-h` en `-p` in de argumenten; `tests/rls/psql-stack.ts`
haalt ze uit `PSQL_OMGEVING`. Dat verschil blijft staan, en met reden: de
testboom heeft **één** omgeving voor de hele suite (5433, `postgres`), en die
staat er sinds QS8-270 op precies één plek. Het samenvoegen zou een
tweede-orde-refactor zijn van iets dat werkt.

**De regel is niet "gebruik `psqlArgumenten()`" maar "bouw je eigen aanroep
niet".** De twee bomen mogen een eigen standaard hebben zolang ze er elk maar
één hebben. Deze controle handhaaft dat per boom.

## 4. De vorm van de controle

`testsMetEigenPsql()` naast het bestaande `scriptsMetEigenPsql()`, in hetzelfde
bestand en met dezelfde vorm:

- een bestand in `tests/` dat `psql` **start** (`execFileSync`, `spawnSync` of
  `spawn`) moet `psqlBasisArgumenten()` noemen;
- doet het dat niet, dan is het rood tenzij het mét reden in het register staat.

`psqlBasisArgumenten()` is nieuw geëxporteerd uit `psql-stack.ts`. Dat was nodig
voor het geval dat `psql()` en `psqlMetInvoer()` níet aankunnen: een sessie die
blíjft staan. De slottest van de adempauze `spawn`t psql met een open stdin om
een advisory lock vast te houden; die kan niet wachten op het einde. **Een reden
om een vlag te variëren is geen reden om de lijst over te typen** — precies wat
de kop van `psqlMetInvoer()` al zei en wat nu afgedwongen wordt.

**Twee registerrijen, met twee soorten reden.** `psql-stack.ts` *is* de gedeelde
aanroep. `psql-verbinding.test.ts` is de ijking en noemt de verboden vorm met
opzet in zijn fixtures — zonder die rij meldt de controle zijn eigen voorbeeld,
dezelfde val die bij `padverwijzing:controle` (QS8-412) een dag eerder gerepareerd
is.

## 5. De ijking

| Grendel | Mutatie | Uitslag |
| -- | -- | -- |
| A — de vorm uit het issue | de oude handgebouwde lijst terug in `goedkeuring-wijst-naar-de-eigenaar.test.ts` | rood, noemt dat bestand |
| B — de gedeelde lijst weghalen | `psqlBasisArgumenten()` vervangen door een letterlijke lijst in `adempauze-grendels.test.ts` | rood |
| C — de registerrij weghalen | `rls/psql-stack.ts` uit `TESTS_EIGEN_REDEN` | rood, twee toetsen |
| D — een controle die niets meet | `START_PSQL` op een naam die nergens voorkomt | rood, drie toetsen |

D verdient een woord. Zonder die vierde toets — *"start psql wél ergens, anders
meet de toets hierboven niets"* — is nul bestanden die psql starten óók groen.
Dat is de vorm waarin een controle stilletjes ophoudt te bestaan, en dit project
heeft er drie keer voor betaald.

📏 **En een waarschuwing uit de ijking zelf:** mutatie B is teruggedraaid met
`git checkout -- <bestand>`, en dat wiste behalve de mutatie ook de reparatie die
er in dezelfde ronde in gezet was. Twee testrondes later stond de controle rood
op een bestand dat al gerepareerd héét te zijn. Bij het ijken van een reparatie
in een bestand dat je zelf net gewijzigd hebt: bewaar een kopie, en herstel uit
die kopie.

## 6. Wat dit niet is

Geen wijziging aan wat de vijf tests méten — alleen aan hoe ze psql starten.
Alle vijf draaien groen tegen dezelfde stack. En geen uitspraak over de
argumentenlijst zélf: de controle eist dat er één is, niet dat hij goed is. Die
tweede vraag hoort bij `psqlArgumenten()` en `PSQL_OMGEVING`, elk met hun eigen
toetsen hierboven in dat bestand.
