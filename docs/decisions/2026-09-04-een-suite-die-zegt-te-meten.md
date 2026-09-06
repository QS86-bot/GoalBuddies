# Een suite die zegt te meten, meet — of valt om

**Datum:** 04-09-2026
**Aanleiding:** QS8-270. Zusje van
`docs/decisions/2026-09-04-geen-database-was-de-verkeerde-reden.md` (QS8-268), en
gevonden door de security-review op 0155.

## Wat er stond

Drie RLS-testbestanden kozen hun eigen poort:

```ts
PGPORT: process.env.PGPORT ?? '5432',
```

`scripts/lokale-stack.sh` draait op `${PGPORT:-5433}`. Zonder `PGPORT` in de
omgeving verbond geen van die drie ergens mee, sloegen ze zichzelf over, en gaf
vitest **exitcode 0**.

Gemeten op `main`, met de stack op zijn eigen standaardpoort:

| | bestanden | tests | exit |
|---|---|---|---|
| **vóór** | 69 geslaagd, 2 overgeslagen | 870 geslaagd, **31 overgeslagen** | 0 |
| **na** | 71 geslaagd | 900 geslaagd, 1 overgeslagen | 0 |

Dertig tests terug. En de waarschuwing stond er al — in `aanmelding.test.ts`, het
bestand ernaast, met precies de uitleg waarom 5433 en niet 5432. De andere drie
hadden hem niet.

## Het poortnummer was de oorzaak; de skip is het defect

`CLAUDE.md` zegt dat een controle zonder database niet groen is maar
*ongemeten*, en `poort.mjs` houdt die twee uit elkaar. Dat geldt voor de
`*:controle`-scripts. Voor vitest doet niemand dat: een overgeslagen bestand
verdwijnt in de telling en de poort meldt niets.

Een reparatie die alleen het getal rechtzet, laat dus het mechanisme staan
waarmee de vólgende verkeerde instelling weer stil wordt. Daarom:

**`stackBeschikbaarOfFaal()` werpt zodra `RLS_DOEL` gezet is.** Zwijgen mag
alleen als niemand beweerde te meten — een kale `npm test` op een machine zonder
stack. Die regel staat als `stackOordeel()` in `tests/rls/psql-stack.ts`, los van
psql en los van de omgeving, zodat hij te toetsen is zonder database.

⚠️ **Twee foutstanden en niet één.** Geen verbinding is iets anders dan een
database die het gezochte object mist — dat tweede betekent meestal een schema
dat achterloopt op de migraties. Eén melding voor allebei stuurt de helft van de
lezers de verkeerde kant op; dat was de les van QS8-268.

## Een eigen bestand en niet `harness.ts`

Het issue stelde `harness.ts` voor. Dat is 810 regels, het gaat over de
PostgREST-client, en er werkte op dat moment een parallelle sessie in
`tests/rls/`. Een zusterbestand levert dezelfde winst — het getal staat nog op
één plek — met minder kans op een botsing, en het houdt de twee soorten toegang
(PostgREST en psql) uit elkaar. Dat is de conservatiefste optie die het werk áf
maakt.

## En een correctie op de ochtend ervoor

`scripts/psql.mjs` (QS8-268, diezelfde dag) gaf de poort **niet** door, met deze
reden erbij:

> psql leest `PGPORT` zelf; een eigen standaard hier zou stil afwijken van wat de
> rest van de omgeving doet.

**Die reden klopte niet.** psql's eigen standaard is 5432; de rest van dit
project draait op 5433. De controles keken dus naar een poort waar niets staat en
meldden "geen database" op een machine waar de stack gewoon draait — precies de
fout die QS8-268 zou repareren, één dimensie verder. Gemeten met een draaiende
stack en zonder `PGPORT`: **negen** ongemeten controles, waar er vier horen.

`-p ${PGPORT:-5433}` staat er nu bij. Sindsdien meet `npm run poort` zonder
enige `PG*`-variabele in de omgeving.

⚠️ **De les is niet "vergeten vlag".** Het is dat *"de omgeving"* geen bron is:
er zijn twee standaarden — die van psql en die van dit project — en wie zich op
"de omgeving" beroept zonder te zeggen wélke, kiest er stilzwijgend één. Beide
keren was dat de verkeerde.

## Hoe het bewaakt wordt

`tests/beloftes/de-rls-suite-meet-of-valt-om.test.ts`. Vier mutaties op de regel
zelf, elk apart geijkt tegen de échte bestanden:

| Mutatie | Wordt rood |
|---|---|
| overslaan mag óók mét `RLS_DOEL` | ja |
| één foutstand in plaats van twee | ja |
| een leeg `RLS_DOEL` telt als afwezig | ja |
| een testbestand kiest weer zijn eigen poort | ja |

En de ijking die het issue vroeg, end-to-end met een draaiende stack:

- **poort op een dode waarde, mét `RLS_DOEL`** → 4 bestanden rood, **exitcode 1**,
  en de melding noemt het bestand, het adres en de reden. Vóór deze wijziging was
  dezelfde situatie exitcode 0 met negen stil overgeslagen tests.
- **dezelfde mutatie, zónder `RLS_DOEL`** → nog steeds stil, exitcode 0. Dat hóórt:
  daar beweerde niemand iets te meten.

## Wat er open blijft

Een kale `npm test` slaat de hele RLS-groep stil over — 879 tests. Dat is
vandaag correct (geen `RLS_DOEL`, dus geen bewering) en de poort dekt het af met
een eigen stap die `RLS_DOEL` wél zet. Maar het is dezelfde vorm één niveau
hoger, en het staat als rij in `docs/ENGINEER-REVIEW.md` met de voorwaarde
waaronder het zwaarder wordt.
