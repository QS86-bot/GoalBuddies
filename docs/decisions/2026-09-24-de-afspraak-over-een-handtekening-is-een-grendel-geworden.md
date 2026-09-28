# De afspraak over een handtekening is een grendel geworden

**24-09-2026 — QS8-612.** Voortgekomen uit dossierrij **601** (07-09-2026).

## Het geval

Migratie `0185` dropte `activeer_weekplanstap(uuid, date, integer)` terwijl de
gedeployde `rollover` die driearguments vorm aanriep. PostgREST gaf `PGRST202`,
en de rollover ving dat zacht af met `continue`: het inschuiven van
weekplanstappen stopte **stil**, elk uur, voor iedereen.

Sindsdien staat de volgorde in de migratiekop, in `docs/DEPLOY.md` §2.3a en in
`docs/WERKVOORRAAD.md`. De rij schrijft er zelf bij wat dat waard is:

> maar dat is een afspraak en geen grendel; `edge:gedeployd` ziet het achteraf en
> alleen met een access token.

En bij de laatste hermeting:

> Dat het deze keer goed ging is een eigenschap van déze batch en niet van een
> grendel.

Beide vervalvoorwaarden van de rij waren al ingetreden: er is een tweede
edge-functie die RPC's aanroept, en migraties en deploys gebeuren niet in
dezelfde handeling.

## Wat de controle vraagt

Twee dingen, en ze zijn met opzet niet even hard.

**1. Elke RPC die een edge-functie aanroept, lost op tegen de map.** Blijft er na
alle drops geen handtekening over waar de meegegeven parameternamen op passen,
dan is dat een `PGRST202` die op de uitrol staat te wachten. Daar is geen
register voor.

**2. Is de oude vorm weg, dan staat de reden in `VERDWENEN_VORM`.** Een drop
waarna de aanroep tóch nog oplost, is niet vanzelf veilig: hij is veilig zolang
de **gedeployde** functie dezelfde aanroepvorm gebruikt als de bron hier, en die
twee lopen aantoonbaar uit elkaar. Zo'n geval is geen fout, maar het hoort een
opgeschreven reden te hebben in plaats van geluk.

⚠️ **Deze controle vervangt `edge:gedeployd:controle` niet.** Die vergelijkt de
gedéployde bundel met de repo en blijft het enige dat de werkelijke scheefstand
ziet. Deze leest twee mappen en ziet de landmijn vóór hij gelegd wordt; de andere
ziet of hij er ligt. Daarom heeft deze geen token nodig en draait hij in CI-baan
`repo`, waar de andere in elke cloudsessie ongemeten is.

## 📏 De meting

| wat | aantal |
| -- | -- |
| RPC-aanroepen in de edge-bronnen | 14 |
| `drop function` in de migratiemap | 48, over 39 functies |
| functies in allebei | **4** |

| functie | staat het goed, en waarom |
| -- | -- |
| `activeer_weekplanstap` | **ja, door ontwerp** — `0186` zet de 3-arg als wrapper terug |
| `maak_seizoensrecaps` | ja, doordat de aanroep géén argumenten meegeeft |
| `slaap_stille_groepen` | ja, doordat `p_dagen` in de nieuwe vorm dezelfde naam hield |
| `keur_vastgelopen_goedkeuringen_goed` | ja, doordat `p_termijn_dagen` dezelfde naam hield |

⚠️ **Drie van de vier staan goed om geluk en niet om ontwerp.** Was zo'n
parameter hernoemd, dan had dezelfde migratie het venster van `0185` geopend. Die
drie redenen staan nu als meting in het register.

## ⚠️⚠️ Het vierde geval kwam niet uit de hand maar uit de controle

Mijn eigen voormeting telde er **drie**. `keur_vastgelopen_goedkeuringen_goed`
ontbrak, en de reden is de vorm van de aanroep:

```ts
const { data, error } = await db.rpc(
  'keur_vastgelopen_goedkeuringen_goed',
  { p_termijn_dagen: 7 },
);
```

De naam staat op de tweede regel. `grep -oE "\.rpc\(\s*'[a-z_]+'"` leest per
regel en ziet die vorm dus niet. **Een regel die je met de hand handhaaft,
handhaaf je op de vorm die je toevallig intypt** — woordelijk de les van QS8-414,
en hij kostte mij hem vandaag opnieuw, in de voormeting van het issue dat die les
toepast.

## De knip is hier geen formaliteit

📏 `rollover/index.ts` draagt `.rpc('naam')` als voorbeeld in een comment, in een
alinea die uitlegt waarom de RPC-naam daar letterlijk moet staan. Een lezer
zonder knip vindt dus een RPC die niet bestaat en meldt hem als functie zonder
handtekening — een bevinding uit het niets.

Hetzelfde aan de SQL-kant: de migratiekoppen in dit project dragen hun
rollback-pad als commentaar, en daar staat de `drop` letterlijk in. Zonder knip
telt die mee als uitgevoerd.

## Twee kanaries, en een register dat twee kanten op werkt

- Nul gevonden `.rpc()`-aanroepen → stil groen. Eigen fout, eigen zin.
- Nul gevonden `create function` → élke aanroep wordt een bevinding. Dat leest als
  een storm terwijl het een kapotte lezer is. Eigen fout, eigen zin.
- Een registerrij die niets meer dekt → ook een bevinding. Zelfde tweezijdigheid
  als `knip:controle` en `regel15:controle`.

⚠️ **Het register is een parameter van `beoordeel()` en geen vaste waarde.**
Anders is de functie niet te voeden: elke kleine fixture zou de drie echte rijen
als verweesd melden, en dan toets je het register in plaats van de regel.

## De ijking

Twee grendels, twee aparte mutaties op de échte bron, met de toestand ervóór
gemeten (exit 0):

| mutatie | wat er rood werd |
| -- | -- |
| de wrapper uit `0186` weghalen | de registerbevinding, met `0185` bij naam |
| `p_termijn_dagen` hernoemen in de edge-aanroep | de harde `PGRST202`-bevinding |

`supabase/` is daarna aantoonbaar ongewijzigd.

📏 En één van de unit-toetsen vond een echt gat in de lezer: `splitsArgumenten()`
telde `(` en `[` maar niet `{`, dus een RPC-aanroep met een genest object viel
uiteen in parameters die niet bestaan. Die splitser dient twee bronnen — een
SQL-argumentlijst en een objectliteraal — en dat verschil was niet doordacht.

## Wat hier niet mee besloten is

De rij gaat niet dicht. Deze controle leest de **bron** van de edge-functie, niet
de gedeployde versie, en dat verschil ís het risico dat rij 601 beschrijft. Wat
eruit gaat is de zin *"een afspraak en geen grendel"*.
