# Een regeldiff tussen twee generatoren meet de generator — QS8-541

**19-09-2026.** QS8-541 vroeg om een **getal** voor de afstand tussen
`src/lib/database.types.ts` en het schema. Er lag er al een: rij 571 van
`docs/ENGINEER-REVIEW.md` en het issue zelf noemen *771 regels erbij en 343
eraf*. Dit document legt vast waarom dat getal de drift niet meet, en wat er wél
uit komt.

## 📏 Het bestaande getal reproduceert — en zegt niets

Opnieuw gemeten, generatie vanaf productie (`0282`) tegen het bestand in de
repo: **exact 771 erbij en 343 eraf.** Twee dagen later, ongewijzigd.

Maar nagelopen wát er in die 1114 regels zit:

| wat | voorbeeld |
|---|---|
| de versie van de generator | `PostgrestVersion: "14.5"` tegen `"14.17"` |
| blokken die aan **allebei** de kanten staan, in een andere volgorde | `reports` — 📏 `to_regclass('public.reports') is not null` = **true** op productie |
| anders geneste `Relationships`-blokken | `referencedRelation: "mijn_doelvelden"` |

⚠️⚠️ **`reports` is het sluitende geval.** Een regeldiff zet dat hele tabelblok
onder *"staat in de repo en niet op productie"*, terwijl de tabel er gewoon is.
Wie dat getal leest als drift, leest een verschil tussen twee **generatoren** als
een verschil tussen code en schema.

Dat is precies de vorm waar dit project op valt: een meting die een ander ding
meet dan haar naam belooft, en die daarna als vaststaand geciteerd wordt — in
een dossierrij, in een issue, en straks in een beslisdocument.

## Wat er structureel uit komt

Namen per sectie vergeleken in plaats van regels:

| sectie | schema | types | verschil |
|---|---|---|---|
| Tables | 44 | 43 | `dagtellers` ontbreekt |
| Views | 4 | 4 | — |
| Functions | 192 | 145 | **49** ontbreken, **1** staat er te veel |
| Enums | 0 | 0 | — |

Die ene is **`ketting_schakel`**, weg sinds 0133 en nog steeds in het bestand —
precies het voorbeeld dat QS8-541 noemde, nu gemeten in plaats van vermoed.

**Eenenvijftig namen** in plaats van 1114 regels, en elk ervan is een echte
vraag: hoort hij erin of niet.

## ⚠️⚠️ De vorm die het bijna liet mislukken: een overload

De generator schrijft een functie met meer dan één handtekening als een unie:

```
      activeer_weekplanstap:
        | { Args: { … }; Returns: Json }
        | { Args: { … }; Returns: Json }
```

De naamregel draagt dan **geen** `{`. De eerste parser hier zocht op
`^ {6}(\w+): \{` — de regex die je als eerste schrijft — en miste hem dus.
📏 Gevolg: `activeer_weekplanstap` kwam eruit als *"alleen in de repo"*, terwijl
hij op productie **twee** overloads heeft en in béíde bestanden staat. Nagemeten
met `pg_get_function_identity_arguments`:

```
p_goal_id uuid, p_cycle_start_date date
p_goal_id uuid, p_cycle_start_date date, p_cycle_index integer
```

Een controle die élke overloaded functie als drift meldt, leer je uitzetten. De
correctie veranderde het getal bovendien twee kanten op: 47 ontbrekende functies
werden er **49**, want de naïeve regex miste ze aan de schemakant óók.

⚠️ Wat op naamniveau onzichtbaar blijft: de repo kent van
`activeer_weekplanstap` maar één van de twee handtekeningen. Dat ís drift, maar
van een soort die een namenvergelijking per definitie niet ziet. Dat staat
hieronder bij de grenzen.

## Wat dit script niet kan scheiden, en waarom het dat zegt

Een naam die alleen in de types staat is óf rommel (`ketting_schakel`), óf
handwerk dat vooruitloopt op een migratie die nog niet uitgerold is. **Alleen
een generatie vanaf de map scheidt die twee** — vanaf productie meet je de
uitrolachterstand mee, en die is vandaag tien migraties (`0282` tegen `0292`).

Het script drukt die waarschuwing daarom af zodra de bron productie is, en laat
hem weg bij een bron die het wél kan. Dat is criterium 2 in zijn tweede vorm:
*zeggen dat je het niet kunt, en waarom.*

## ⚠️ De blokkade voor een generatie vanaf de map is een andere dan het issue dacht

QS8-541 zegt: *"`supabase gen types` vraagt de CLI, en die staat hier niet op
het PATH (Q-TODO C3)."* 📏 Gemeten: `npx supabase@latest --version` geeft
**2.117.0**. De CLI is dus gewoon op te halen.

Wat er wél in de weg staat is Docker:

```
failed to connect to the docker API at unix:///var/run/docker.sock:
dial unix /var/run/docker.sock: connect: no such file or directory
```

`gen types --db-url` start een container. De blokkade is de **socket**, niet het
PATH — en dat is een ander gesprek, want een PATH-probleem los je op met een
installatie en dit niet.

## De drie richtingen, gewogen

| vorm | gekozen? | waarom |
|---|---|---|
| `/audit`-stap via de MCP | **ja, als bron** | `generate_typescript_types` vraagt geen token en geen Docker; het script leest die uitvoer via `TYPES_GENERATIE` |
| CLI vanaf de map | **ondersteund, niet bruikbaar hier** | scheidt handwerk van drift, maar vraagt de Docker-daemon |
| statisch tegen `supabase/migrations/` | **nee** | dat is de derde richting uit het issue, en het issue waarschuwt er zelf voor: hij dubbelt `rpc:controle` en meet een benadering. Bovendien zou hij precies de fout herhalen die dit document beschrijft — een goedkope meting die iets anders meet |

## Wat de poort ermee doet

`typesdrift:controle` staat in `ZONDER_CI` met zijn reden: CI heeft geen Docker
en geen productiesleutel, dus hij zou daar altijd `OVERGESLAGEN` printen, en een
stap die nooit meet hoort niet in de baan. In de poort telt hij als **ongemeten**
en niet als groen — de vorm die CLAUDE.md voorschrijft.

## Geijkt — vier grendels, en de tweede was er geen

| mutatie | uitslag |
|---|---|
| de overload-tak uit de naamregex | **3** toetsen rood |
| het sectie-einde niet meer herkennen | **0** toetsen rood ⚠️ |
| de inspringing loslaten (`^\s*`) | **5** toetsen rood |
| de productiewaarschuwing uit `rapport()` | **1** toets rood |

⚠️⚠️ **De tweede regel is de leerzame.** De grendel op het einde van een sectie
was niet te ijken: mijn fixture liet elke sectie direct door de volgende volgen,
en dan zet de sectiekop `huidig` toch al opnieuw. 📏 Op de échte bestanden
veranderde hem weghalen ook niets — 51 allebei de keren — want helperregels als
`Row: infer R` dragen tekst ná de dubbele punt en vallen al af op het
**eindanker** van de naamregex.

De grendel beschermde dus tegen het loslaten van een ándere grendel, en was zelf
onbewaakt. Er staat nu een toets onder die hem wél voedt: een kale naam op
inspringing zes, buiten elke sectie. Daarmee gaat mutatie 2 van 0 naar 1 rood.

Dat is dezelfde les als bij QS8-557 eerder vandaag: *breek de grendel die de
ijking noemt, en kijk wélke toets omvalt* — niet dát er een omvalt.

## Wat hier níet mee af is

- **Handtekeningen worden niet vergeleken, alleen namen.** De ontbrekende
  tweede overload van `activeer_weekplanstap` is daar het levende voorbeeld van.
  Een diepere vergelijking vraagt de argumenten en returntypes erbij, en die
  staan in het gegenereerde bestand in een vorm die per generatorversie
  verschilt — precies de instabiliteit waar de regeldiff op strandde.
- **De 49 ontbrekende functies zijn niet gerepareerd.** Dit issue vroeg om een
  meting, niet om een hergeneratie; `npm run types:db` doet dat en vraagt de
  productiesleutel.
