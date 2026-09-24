# De allowlist bewoog niet mee

**Datum:** 24-09-2026
**Issue:** QS8-597 (gevonden in de audit van dezelfde dag)
**Status:** gebouwd
**Raakt:** `scripts/adviseurdrift-controle.mjs` (nieuw), `scripts/adviseur-controle.mjs`,
`scripts/knip-controle.mjs`, `tests/scripts/adviseurdrift-controle.test.ts`,
`tests/scripts/adviseur-controle.test.ts`

## 1. Wat er aan de hand was

`adviseur:controle` haalt de Supabase-adviseur op en legt hem naast een
allowlist. Hij is in dit project bijzonder: **de andere controles toetsen alle
iets wat wij zélf bedacht hebben te toetsen; deze is de enige die iets kan
vinden waar niemand hier aan gedacht heeft.**

Hij vraagt een `SUPABASE_ACCESS_TOKEN`, staat daarom met reden in `ZONDER_CI`,
en is in een cloudsessie dus **ongemeten**. 📏 Wat dat kost, gemeten in de audit
van 24-09-2026 door de adviseur via de MCP op te halen en door `beoordeel()` te
halen — de eigen logica van het script, niet met het oog:

| niveau    | bevinding                                                                            | geland               |
| --------- | ------------------------------------------------------------------------------------ | -------------------- |
| **ERROR** | `security_definer_view` → `public.mijn_doelvelden`                                   | 0236, **17-09**      |
| INFO      | `rls_enabled_no_policy` → `public.dagtellers`                                        | 0233/0234, **17-09** |
| RATEL     | `authenticated_security_definer_function_executable`: plafond **47**, gemeten **76** | doorlopend           |

⚠️ **De code was niet fout, en dat is het punt.** 0236 schrijft de afweging
uitgebreid uit — definer kán daar veilig waar het bij `goal_dashboard` niet kon,
want de `where` geeft uitsluitend rijen van de aanroeper terug, dus er is geen
kijker voor wie een telling anders zou uitvallen. En `dagtellers` is deny-all en
staat onder test in drie RLS-suites. **Wat ontbrak was dat de allowlist
meebewoog** — een week lang, en niets kón daar rood van worden.

## 2. Wat hier niet de oplossing is

`adviseur:controle` alsnog in CI zetten. De reden dat hij eruit staat klopt: hij
vraagt een productiesleutel en meet iets dat per definitie over productie gaat.
Een token in CI zetten om een allowlist bij te houden is de verkeerde ruil.

## 3. Wat wel: de repo-kant van dezelfde vraag

Beide klassen volgen uit **DDL**, en DDL staat in `supabase/migrations/`. Een
controle die de map leest heeft geen token nodig en draait dus gewoon in CI.

📏 **Dat de afleiding klopt is gemeten en niet aangenomen.** Beide klassen uit de
map geven exact wat productie zegt:

| klasse                                | uit de map                                                 | productie (`pg_class`, adviseur) |
| ------------------------------------- | ---------------------------------------------------------- | -------------------------------- |
| definer views                         | `group_visible_streaks`, `mijn_doelvelden`, `mijn_profiel` | idem                             |
| RLS zonder policy                     | `dagtellers`, `invite_events`, `invite_preview_limits`     | idem                             |
| invoker view (moet juist níet gemeld) | `goal_dashboard`                                           | idem                             |

`adviseurdrift:controle` is tweezijdig: een object zonder allowlist-regel is
rood, en een allowlist-regel van deze twee klassen die nergens meer naar wijst
ook. Dat tweede is dezelfde vorm als `verouderd` in `adviseur-controle.mjs`
zelf — een uitzondering die niemand meer kan nalezen, is geen uitzondering meer.

## 4. Drie dingen die in de weg zaten, en alle drie zijn gemeten

**Een view is definer _tenzij_ hij `security_invoker = true` zet.** Postgres
draait een view standaard als zijn eigenaar, dus de **default** is de gemelde
vorm. 📏 Vandaag zetten alle vier de views in dit schema de optie expliciet, dus
een regel die naar het wóórd `false` zoekt geeft hier hetzelfde antwoord — en
faalt **open** op de eerste view die de optie weglaat. De regel luidt daarom
"tenzij invoker" en niet "als false".

**Hernoemingen moeten gevolgd worden.** 0233 maakt `opslag_dagtellers`, 0234
hernoemt hem naar `dagtellers`. Zonder dat staat de oude naam in de uitslag en
klopt de vergelijking met productie niet meer.

**Statements gaan op tekstvolgorde, niet per soort.** De eerste versie paste
elke regex over het hele bestand toe en verwerkte ze daarna op soort. 📏 Gevolg
op 0236, dat `drop view if exists public.mijn_doelvelden;` **bóven** zijn
`create view` heeft staan — de gewone vorm in dit project: de drop werd ná de
create toegepast en wiste hem. De controle miste daardoor precies één van de
twee objecten waarvan ik wíst dat ze ontbraken.

⚠️ Die laatste is gevonden doordat ik het antwoord al had. Had ik dat niet
gehad, dan was dit een controle geweest die groen stond omdat hij de helft niet
zag — de vorm die deze week al twee keer betaald is (QS8-589, QS8-595).

## 5. De knip, en de ijking die hem eiste

De controle houdt een eigen `zonderSqlCommentaar()` met een **stringgrens**: de
gedeelde `zonderCommentaar()` is een JS-knip en haalt `--` niet weg. Hij staat
met die meting in het register van `knip:controle`.

⚠️⚠️ **En de ijking wees uit dat de toetsen erop de verkeerde waren.** Met de
knip uit de **pijplijn** gesloopt bleven alle vijf de knip-toetsen groen, én de
echte map ook — 0234 draagt zijn rename-comment toevallig in de onschadelijke
richting. De toetsen voedden de functie _los_; niets toetste dat
`objectenUitDeMap()` hem gebruikt.

De toets die dat wél draagt is er dóór de ijking bij gekomen: een kop met een
rollback-pad dat een view én een hernoeming noemt die er niet zijn. Dat is
dezelfde les als bij QS8-595 een dag eerder — **een mutatie die niets rood maakt
is óók een uitspraak over je toetsen.**

## 6. De ijking

Stand ervóór gemeten: **20 groen, 0 rood** (21 na de toets die de ijking eiste).

| #   | Mutatie                                              | Wat er rood werd                                                                       |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | `mijn_doelvelden` van de allowlist — het echte geval | _is groen op de echte map naast de echte allowlist_, en de controle meldt hem bij naam |
| 2   | de SQL-knip eruit                                    | **niets** — zie §5                                                                     |
| 2b  | idem, ná de pijplijntoets                            | _leest een statement in een commentaarkop niet als een statement_                      |
| 3   | de volgorde terug naar per-soort                     | _geeft exact de drie definer-views_, plus twee                                         |
| 4   | "tenzij invoker" terug naar "zoek het woord false"   | _telt een view zónder with-clausule als definer_                                       |
| 5   | hernoemingen niet meer volgen                        | _geeft exact de drie tabellen met RLS zonder policy_, plus twee                        |
| 6   | de tweede richting eruit                             | _meldt een allowlist-regel die nergens meer naar wijst_                                |

## 7. Wat er níet in zit, en waarom

`auth_leaked_password_protection` staat op de allowlist en wordt door de
adviseur op 24-09 **niet meer gemeld**. `beoordeel()` noemt dat
`verouderd/ongebruikt`, en dat maakt `adviseur:controle` rood.

⚠️ **Dat is hier niet opgelost, en met opzet.** _Niet meer gerapporteerd_ is niet
hetzelfde als _gerepareerd_ — dat is de les van QS8-411, en hier gaat hij de
gevaarlijke kant op: de regel weghalen zou beweren dat de schakelaar aanstaat.
Het verschil is een instelling in het Supabase-dashboard die deze sessie niet
kan lezen (geen token, geen `.env`), en `docs/VOLGENDE-SESSIE.md` zegt nog dat
hij **uit** staat.

**Eén blik in het dashboard beslist het** — zie QS8-141. Staat hij aan, dan mag
die regel van de allowlist af en is de zin in de overdracht ook verouderd.

## 8. Bijvangst

`adviseur-controle.mjs` draagt nu de `process.argv[1] &&`-wacht die 📏 71 andere
scripts al hebben. Zonder die wacht is de module niet importeerbaar buiten een
directe aanroep, en deze controle importeert hem voor de `ALLOWLIST`.

## 9. Stand

- `npm run poort`: niets rood; **25** controles ongemeten (de 24 van deze ronde
  plus `defaultnull:controle`, nieuw uit de andere baan).
- `tests/scripts/adviseurdrift-controle.test.ts`: 21 groen.
- 📏 Met de allowlist bijgewerkt zou `adviseur:controle` nog op precies één punt
  rood staan: de schakelaar uit §7.
