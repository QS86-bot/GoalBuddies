# De advisory-database is geen eigenschap van `main` — 19-11-2026 (QS8-707)

**Beslist door:** Quinten, 18-11-2026 (optie A, reactie op QS8-707). Uitgewerkt door een bouwsessie. De vorm is geen commitment device, kost geen geld en is niet onomkeerbaar; ze verzwakt wel een supply-chain-grendel op `main`, en daarom staat hier wat er niet meer gezien wordt.

## Het probleem

`audit:controle` werd op `main` rood zonder dat een commit iets veranderde: 17-11 (nieuwe wortel `picomatch`) en 18-11 (npm meldde `picomatch` niet meer). Een controle die rood wordt door iets dat buiten de repo verandert, is geen eigenschap van de commit; de poort hield dat niet uit elkaar en wie als laatste mergde kreeg de melding. Eerdere gevallen met dezelfde bron: QS8-616, 618, 625, 648, 669, 674.

## De gekozen vorm (optie A)

`audit:controle` kent nu drie modi, afgeleid uit `GITHUB_EVENT_NAME` en `GITHUB_REF`:

| Omgeving | Modus | Oordeel |
| --- | --- | --- |
| `push` naar precies `refs/heads/main` | **`vorm`** | alleen de vorm van `NAGEKEKEN`: ernst, advisory-nummers (getallen, oplopend, niet leeg), reparatiesoort, `in_bundel` boolean, marker (geen pakketnaam, > 3 tekens), reden. **Geen `npm audit`, geen netwerk.** |
| `pull_request`, `push` naar een andere branch | `pr` | ongewijzigd (QS8-674): rood om wat de wijziging toevoegt |
| `schedule`, `workflow_dispatch`, tag, lokaal, onbekend | `strikt` | ongewijzigd (QS8-191): het volledige register-oordeel |

De strikte vraag *"staat er iets kwetsbaars in de productieboom dat niemand met een bouw heeft nagekeken?"* verhuist naar een eigen workflow, `.github/workflows/advisories.yml`: dagelijks (`23 5 * * *`) plus `workflow_dispatch`, één stap (`node scripts/audit-controle.mjs`), geen `npm ci` (`npm audit` leest alleen `package.json` en lock). Het signaal is een **rode geplande run, die GitHub mailt** — dezelfde vorm als `uurjobs.yml`. Geen Sentry en geen automatisch issue: dat is een nieuwe afhankelijkheid en een schrijfrecht (`issues: write`) waar dit besluit niet om vroeg.

Het wekelijkse `schedule:` in `ci.yml` (QS8-191) is **verplaatst**, niet verdubbeld: het draaide de hele suite en de RLS-baan om één advisory-database te lezen. Een test legt vast dat `ci.yml` geen `cron:` meer draagt.

Waarom een nieuwe modus en niet een vierde pad in `strikt`: de acceptatie "een advisory die verschijnt of verdwijnt zonder commit maakt `main` niet rood" gaat over één combinatie (push naar `main`). Elke andere omgeving behoudt zijn oordeel en dus zijn tests.

## Gemeten

Lokaal, `npm audit` bereikbaar: modus `vorm` op het echte register groen (12 rijen, zonder `npm audit`); modus `strikt` op de huidige boom groen (12 wortels, 1 in de bundel). Op `main` is dus pas bij de eerste geplande run echt te zien dat de workflow draait; dat is **ongemeten** (zie onder).

Elke grendel met de hand gebroken in `scripts/audit-controle.mjs`, telkens `tests/scripts/audit.test.ts`, daarna hersteld:

| Mutatie | Wat omvalt |
| --- | --- |
| `main`-tak uit `modusUit()` | `modusUit › geeft vorm voor een push naar main…`; `cli › is op main groen…` |
| `vorm`-tak uit `hoofd()` | `cli › is op main groen…` en de hele reeks `modus vorm` (o.a. de test die npm niet mag aanroepen) |
| `schedule` ook `vorm` | `modusUit › …alleen voor die ene combinatie`, `modusUit › geeft strikt voor het schema…`, `cli › blijft in het schema… strikt` |
| marker=pakketnaam-toets weg | `is rood op een marker die de pakketnaam is` |
| marker-ontbreekt-toets weg | `…zonder marker`, `…te korte marker` |
| sorteertoets op advisories weg | `…ongesorteerde advisories` |
| getal-toets op advisories weg | `…fout advisory-nummer` |
| **strikt:** rij-zonder-melding (`verdwenen`) uit `verschil()` | vijf toetsen, o.a. `meldt een register dat achterloopt`, `…verdwenen wortels bij een écht leeg rapport` |
| **strikt:** advisory-vergelijking uit `verschil()` | `meldt een advisory die erbij komt…`, `…door een ándere… vervangen`, `stuurt een veranderd pakket ook naar de bouw` |
| `run:` van `advisories.yml` vervangen door `echo` | `draait audit-controle zelf, dus in de modus strikt` |
| `cron` van dagelijks naar wekelijks | `draait dagelijks en handmatig…` |

## Wat het niet meer ziet

1. **Een nieuwe advisory valt pas bij de volgende geplande run op**, tot ~24 uur later, niet bij de push. Dat is de prijs die Quinten accepteerde.
2. **`schedule:` is best-effort** (`docs/decisions/2026-10-05-schedule-is-best-effort-en-de-hartslag-is-de-runlijst.md`): een run die niet draait is niet rood. `uurjobs-controle` bewaakt `advisories.yml` **niet**. Dat is een bekende rest (sinds het vervolg van 20-11 gesloten: `advisories.yml` is een uurjob en staat onder `uurjobs:controle`) en een voorgesteld vervolg, geen aanname dat het dicht is.
3. **Het signaal is een mail aan wie GitHub als eigenaar van de geplande workflow aanmerkt**; hoe dat bij Quinten aankomt is een accountinstelling die hier niet te meten is.
4. **Een rij waarvoor npm niets meer meldt blijft op `main` staan** tot de geplande run rood wordt. Daar verandert het *gevolg* van: de reparatie is geen haastklus op een rode `main` meer, maar een gewone PR.
5. **Een PR die het register in `vorm` correct maar inhoudelijk onjuist laat** (verkeerde `in_bundel`) is review-gebied, zoals bij QS8-674 punt 4.
6. **Lokaal blijft de poort strikt**: een verse advisory kan `npm run poort` rood maken. Dat is bewust: lokaal is de enige plek waar iemand het meteen leest, en het raakt `main` niet. Wil Quinten dat ook weg, dan is dat een één-regelwijziging in `modusUit()`.

7. **Een PR die rood gemerged wordt, laat `main` groen.** `Alles groen` is geen verplichte check (PR #583 deed het al eens). Voor QS8-707 werd `main` dan strikt rood en wees de regel "rood op `main` is van wie als laatste merde" iemand aan; nu doet dat alleen de mail van de volgende ochtend. Dit is een gevolg van optie A en door de code-critic gevonden, niet door Quinten afgewogen.
8. **Wie leest de geplande run? Sinds de tweede ronde van QS8-707: `hoofdrun:stand`.** De code-critic vond dat niemand `advisories.yml` las (`hoofdrun:stand`, `uurjobs:controle` en `/audit` keken er niet naar). `npm run hoofdrun:stand` leest nu ook de laatste vijf runs van `advisories.yml` en geeft exitcode 1 bij `rood` (de nieuwste afgeronde run faalde) en bij `verlopen` (geen afgeronde run, of de nieuwste groene is ouder dan 26 uur, sinds het vervolg van 20-11 12 uur: dat dekt ook een `schedule:` dat niet vuurt en een workflow die in de UI uitstaat). Een run die draait of is afgebroken telt niet. **Bijvangst die je moet weten:** op de dag dat dit landt is er nog geen run, dus `hoofdrun:stand` meldt `ONGEMETEN` tot de eerste run; start `advisories.yml` één keer met `workflow_dispatch` (Actions, Advisories, Run workflow) en meet daarmee meteen dat de mail bij Quinten aankomt. Wie een rode advisories-run oppakt: de sessie die hem ziet, met dezelfde afspraak als bij rood op `main`. **Niet gemeten:** de verdrading in het scriptblok onderaan `hoofdrun-stand.mjs` (de GitHub-aanroep zelf en het doorgeven aan `exitcode` en `melding`) staat niet onder een toets, want het blok draait bij import; de pure delen (`advisoriesStand`, `advisoriesRegels`, `exitcode`) wel, per grendel gebroken.
9. **De workflow kan in de GitHub-UI uitgezet worden**, wat in de repo niet te toetsen is. Een geplande workflow wordt bovendien door GitHub na zestig dagen zonder repo-activiteit uitgezet; de repo is actief, maar dat is een aanname.

## Terugdraaien

De `vorm`-regel in `modusUit()` weghalen zet `main` weer strikt. `advisories.yml` verwijderen en het `schedule:` terugzetten in `ci.yml` (te vinden in de git-geschiedenis van QS8-191) herstelt de wekelijkse run. Geen migratie, geen data.

## Vervolg 20-11-2026 — elk uur en niet dagelijks (besloten door Quinten, optie c)

📏 **Gemeten:** het dagelijkse schema van 05:23 UTC (`23 5 * * *`) had op 20-11 om 12:18 UTC niet gevuurd. De planner werkt voor deze repo (in de laatste 40 geplande runs: Uurjobs 14, Rollover 13, Notificaties 12, CI 1), maar throttelt: de uurjobs draaien op ~18,5% van hun ritme (QS8-637). **Afgeleid, niet voor een dagelijkse cron gemeten:** een dagelijkse cron krijgt dan gemiddeld eens in de ~5 dagen een run, en de grens van 26 uur in `hoofdrun:stand` meldt dan structureel ONGEMETEN terwijl niets stuk is. Dat was een ontwerpfout in de eerste ronde van QS8-707: het ritme van QS8-637 was niet meegewogen.

**Gewijzigd:** `advisories.yml` draait op `31 * * * *` (elk uur, niet op het hele uur). Daarmee is hij een uurjob in de zin van `uurjobs-controle`: die leidt de uurjobs af uit `.github/workflows/` en bewaakt hem in `uurjobs.yml` met `GETOLEREERDE_VERTRAGING_UUR` (12). Dat sluit tegelijk het restpunt 8 hierboven: ook `uurjobs.yml` leest nu de runlijst van `advisories.yml`. `ADVISORIES_MAX_UUR` in `hoofdrun-stand.mjs` is geen eigen getal meer maar die constante, onder een toets.

**Prijs en wat open blijft:** een rode run kan nu elk uur mailen tot de oorzaak weg is (afweging, door Quinten geaccepteerd met dit besluit). Een uur-schema blijft best-effort: het grootste gemeten gat van de uurjobs is 9 uur, onder de 12. **Niet gemeten:** dat de nieuwe cron daadwerkelijk vuurt (de eerste runs volgen na de merge; `uurjobs:controle` en `hoofdrun:stand` melden het als ze uitblijven), en dat een rode run bij Quinten in de inbox aankomt.

**Terugdraaien:** de cron terug naar dagelijks en `ADVISORIES_MAX_UUR` naar een eigen getal van 26.
