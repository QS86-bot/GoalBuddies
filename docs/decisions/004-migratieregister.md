# 004 — Eén nummering voor het migratieregister

**Datum:** 24-08-2026
**Issue:** QS8-122 (blokkeerde QS8-119)
**Status:** doorgevoerd op het echte project

## Het probleem

De migratiegeschiedenis gebruikte twee nummeringen die niet op elkaar aansloten:
38 genummerde versies (`0001` … `0038`) en 36 tijdstempels (`20260819121517`).
De tijdstempels zijn alles wat sinds 19-08 via de MCP-tool is toegepast; die tool
kiest zelf een tijdstempel als versie, ongeacht hoe het bestand heet.

Gevolg: de bestandsnaam `0039_weekpassen.sql` kwam nergens terug in
`schema_migrations`. De repo kon het project niet verifiëren en het project de
repo niet — en daarmee kon de map het schema nergens anders opbouwen.

Dat blokkeerde QS8-119 in zijn geheel: zowel een lokale stack als een tweede
cloudproject werkt door de migraties opnieuw af te spelen op een lege database.

## Het besluit: de bestanden houden hun nummer, het register volgt

De 36 tijdstempels in `supabase_migrations.schema_migrations` zijn omgezet naar
het nummer uit de bestandsnaam. Het register telt nu 75 rijen, allemaal
genummerd, nul tijdstempels.

**Waarom niet andersom** — het issue noemde tijdstempels "de goedkoopste keus,
want dat is de vorm die de tool zelf oplegt. Dat klopt niet bij nameting. De
nummers staan in honderden verwijzingen: in commentaar boven functies ("migratie
0050 verhuisde de kolommen"), in `CLAUDE.md`, in de beslisdocumenten en in de
Linear-issues. `0050` hernoemen naar `20260820200417` maakt al die verwijzingen
onvindbaar. De inhoud verhuist mee met het bestand; de uitleg eromheen niet.

Het register is daarentegen één UPDATE, en niemand verwijst ernaar.

## Wat er blijft wringen

⚠️ **De drift komt terug bij elke migratie via de MCP-tool.** Die kiest opnieuw
een tijdstempel. Er is geen instelling om dat uit te zetten. De werkwijze in
`docs/DEPLOY.md` §2.2 vangt het op met een uitlijnstap, en
`npm run register:controle` wordt rood zodra iemand die stap overslaat.

⚠️ **Drie bestanden dragen een letter:** `0039a`, `0041a` en `0052a`. Dat zijn
migraties die achteraf uit de database zijn teruggehaald en tussen twee nummers
in horen. Ze houden hun letter, want het alternatief is 32 bestanden hernummeren
en dan is de verwijzingsschade er alsnog.

De prijs: sommige versies van de Supabase CLI lezen een bestandsnaam met
`^([0-9]+)_` en zouden die drie stilzwijgend overslaan. Dit project gebruikt de
CLI niet voor het toepassen van migraties, en `register:controle` merkt het
meteen als er drie migraties uit het register verdwijnen. Een stil gat is het dus
niet — een luid gat wel.

## Wat er nu bewezen is, en hoe

**De migraties bouwen op een lege database exact het schema van productie.** Niet
beweerd maar gemeten, op 24-08-2026:

```bash
scripts/schema-opbouwen.sh
psql -d goalbuddies_opbouw -f scripts/schema-vingerafdruk.sql
```

en dezelfde query op het echte project. Alle negen categorieën gelijk:

| soort | aantal |
|---|---|
| kolom | 255 |
| constraint | 155 |
| index | 86 |
| policy | 65 |
| functie | 87 |
| trigger | 31 |
| recht | 3395 |
| publicatie | 3 |
| rls | 29 |

### Twee dingen die de eerste meting nog niet zag

**1. De functies leken 27 keer te verschillen en verschilden nul keer.** De
MCP-tool strippt commentaar uit een functiebody en herschikt de witruimte. De
vergelijking normaliseert daar nu op — anders meldt hij elke keer verschil en
leert hij je om hem te negeren.

⚠️ Dit is óók de reden dat `CLAUDE.md` zegt dat `pg_get_functiondef()` de
waarheid is: wat er in de database staat, is niet letterlijk wat er in het
bestand staat. De logica is gelijk; de tekst niet.

**2. De steiger miste de standaardrechten, en dat ging de gevaarlijke kant op.**
Supabase zet `alter default privileges in schema public grant all` voor `anon`,
`authenticated` en `service_role`. Elke tabel die een migratie aanmaakt, krijgt
daar meteen alle rechten voor alle drie de rollen; het enige dat tussen een
gebruiker en de data staat, is RLS.

Zonder die regels bouwde de lege database 69 rechten waar productie er 3395
heeft. Dat is niet "iets minder compleet" maar **strenger dan productie** — en
een RLS-test die daar bevestigt dat een kolom niet te lezen is, bewijst dan iets
wat op het echte project niet waar is. Precies het faalbeeld dat QS8-116 kwam
opruimen, met een groen vinkje eronder.

Het staat nu in `supabase/shim/0000_supabase_shim.sql`, met die onderbouwing
erboven, want het is de belangrijkste regel van dat bestand en de makkelijkste om
te vergeten.

## Wat er nu bestaat

| Bestand | Wat |
|---|---|
| `supabase/shim/0000_supabase_shim.sql` | wat een Supabase-project vóór de eerste migratie al heeft — bewust minimaal, geteld en niet geraden |
| `scripts/schema-opbouwen.sh` | speelt alle migraties af op een lege database |
| `scripts/schema-vingerafdruk.sql` | de negen vingerafdrukken, om twee databases te vergelijken |
| `scripts/migratieregister-controle.mjs` | repo naast project; slaat zichzelf over zonder credentials |
| `scripts/migratieregister-vergelijk.mjs` | de vergelijking zelf, los zodat hij te tóetsen is |
| `tests/scripts/migratieregister.test.ts` | breekt elk faalgeval met de hand |
| `supabase/migrations/0072_…` | `migratieregister()`, alleen voor `service_role` |

⚠️ De vergelijking staat los van de verbinding omdat de controle alleen tegen het
echte project kan draaien — en een controle die je nooit rood ziet worden, is een
aanname. Zelfde redenering als bij de secret-scan in de deploy.
