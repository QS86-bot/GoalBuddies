# De correcties stonden in het bestand dat overschreven wordt

**Datum:** 21-09-2026 · **Issue:** QS8-569 · **Status:** gebouwd

## Waar dit over gaat

`src/lib/database.types.ts` is hergenereerd tegen productie (stand `0294`) en
staat daarmee weer gelijk aan het schema. Dat was de opdracht van QS8-569.

Onderweg bleek dat het bestand niet alleen áchterliep maar ook **met de hand was
bijgewerkt**, en dat die twee dingen niet los van elkaar te repareren zijn: een
hergeneratie gooit het handwerk weg. Dit document legt vast wat er gemeten is,
waar het handwerk naartoe gegaan is, en waarom het daar staat en niet in het
gegenereerde bestand.

## 1. De drift zelf — gereproduceerd, niet overgenomen

📏 Gemeten op 21-09-2026, met de Supabase-MCP-tool `generate_typescript_types`
tegen productie en gevoerd aan `TYPES_GENERATIE=<pad> npm run typesdrift:controle`:

```
✗ typesdrift-controle: 57 naam/namen verschillen.
  Tables:
    alleen in het schema (1): dagtellers
  Functions:
    alleen in het schema (55): berichten_plafond, … , zonder_regelovergang
    alleen in de types  (1): ketting_schakel
```

Exact de 57 van QS8-569, twee dagen later opnieuw en op dezelfde stand. Na de
hergeneratie: `src/lib/database.types.ts kent dezelfde namen als het schema`.

⚠️ **Die tweede regel is op zichzelf een tautologie en hoort niet als bewijs
gelezen te worden.** Het bestand in de repo ís sindsdien byte voor byte die
generatie (zelfde `sha256`), dus hij vergelijkt iets met zichzelf. Wat er wél iets
bewijst is de meting hiervóór — de 57 op het óude bestand — en de
catalogusvergelijking hieronder. Dat onderscheid is de reden dat deze alinea er
staat: wie deze uitslag over een maand terugziet, moet weten dat hij pas iets zegt
zodra de generatie *opnieuw* opgehaald wordt.

⚠️ **De generatie is niet alleen tegen de MCP-uitvoer gecontroleerd maar ook
tegen de catalogus**, want "het bestand is wat de tool zei" en "het bestand klopt
met de database" zijn twee uitspraken. 📏 Namen uit het geschreven bestand
geteld met `ontleed()` en naast `pg_proc`/`pg_class` gelegd:

| sectie | bestand | catalogus | verschil |
| -- | -- | -- | -- |
| Tables | 44 | 44 (`pg_class`, `relkind='r'`) | geen |
| Views | 4 | 4 (`relkind='v'`) | geen |
| Functions | 199 | 199 (`prokind='f'`, retour ≠ `trigger`) | geen |

⚠️ **En de bron is deze keer wél te scheiden van vooruitlopend handwerk**, wat
de kop van `typesdrift-controle.mjs` met reden als beperking noemt: een generatie
vanaf productie kan *"nog niet uitgerold"* niet van *"rommel"* onderscheiden.
📏 Vandaag valt dat samen — `list_migrations` eindigt op `0294` en
`supabase/migrations/` eindigt op `0294` — dus er is geen migratie die vooruit
kan lopen. Die gelijkheid is een momentopname en geen eigenschap; wie dit
document later leest en de map verder ziet staan dan productie, heeft de
beperking wél.

## 2. `ketting_schakel` — de enige in de omgekeerde richting

Criterium 3 van het issue: bestond die functie ooit?

📏 Ja, en hij is weggehaald:

- `0036` en `0037` maakten `ketting_schakel(uuid, date, date)` — de weg waarlangs
  je zelf een kettingschakel claimde;
- `0133` (QS8-144) dropte hem: `drop function if exists public.ketting_schakel(uuid, date, date);`,
  omdat de trigger op de weekafsluiting de enige route werd;
- 📏 op productie vandaag: `to_regprocedure('public.ketting_schakel(uuid, date, date)')`
  is `null` en `pg_proc` kent **nul** varianten van die naam;
- 📏 in de repo staat hij alleen nog in migratiecommentaar, in testcommentaar en
  in `docs/` — **geen enkele aanroeper** in `src/`, `app/`, `tests/` of
  `supabase/functions/`.

Hij stond dus vanaf `0133` in de types en nergens anders. Er is nooit een
`PGRST202` van gekomen omdat niemand hem aanriep — dat is geluk en geen grendel,
en precies het verschil dat QS8-569 als "de scherpste richting" benoemt.

## 3. Wat er naast de drift in het bestand bleek te staan

Namen waren maar één laag. 📏 Per naam de **velden** naast elkaar gelegd (het
gereedschap staat niet in de repo; het leest twee gegenereerde bestanden en
vergelijkt `sleutel: type` per blok):

**37 veldverschillen**, in drie hopen:

| hoop | aantal | wat het is |
| -- | -- | -- |
| `Relationships`-metadata | 9 | een andere `referencedRelation` per generatorversie, plus de fkey die `0252` verving |
| `koppelbare_doelen` | 14 | achterstand: de functie geeft `SETOF goal_dashboard`, en het blok beschreef een vorm van die view die niet meer bestaat (`max_points`, `identity_statement`, `available_hours_per_week` staan niet in de 14 kolommen die de view vandaag heeft) |
| **handgeschreven correcties** | **14** | `\| null` dat de generator niet schrijft |

Die veertien, met de functie erbij: `meld` 3, `ontdek_groepen` 2,
`weekafsluiting_reacties` 2, `zichtbare_reeksen_van_groep` 2, `zoek_mensen` 1,
`vraag_lidmaatschap_aan` 1, `verzoekers_eerder_lid` 1, `zet_taakzichtbaarheid` 1,
en de view `mijn_profiel` 1.

⚠️⚠️ **Het opvallende is niet dát ze er stonden maar dat er al sinds `0136` een
regel over is.** `src/modules/ai/jobs.ts` schrijft bij de cast op
`vraag_ai_job(p_goal_id)` met zoveel woorden:

> ⚠️ Niet oplossen door `database.types.ts` met de hand bij te werken: dat
> bestand is gegenereerd en de volgende `npm run types:db` gooit het weer weg.
> De cast hoort hier, met deze reden erbij.

De regel stond er, hij was juist, en er kwamen in hetzelfde bestand veertien
overtredingen bij zonder dat er iets rood van werd. **Een regel die alleen in een
comment staat, is geen grendel** — dezelfde vorm als QS8-412, en de reden dat
deze ronde niet met "voortaan beter opletten" eindigt.

## 4. De drie dingen die de generator niet kán weten

Het handwerk had gelijk. De generator leest de catalogus, en de catalogus zegt
deze drie dingen niet:

1. **Een NOT NULL-kolom zonder DEFAULT die een trigger vult.**
   📏 `commitments.tz` is `is_nullable = NO` met `column_default = null`; de
   trigger `commitments_zone` (BEFORE INSERT, `bevries_commitmentzone()`, `0280`)
   zet hem uit het profiel van de doeleigenaar. De generator maakt hem dus
   **verplicht** in `Insert` — terwijl 📏 de INSERT-kolomgrant van
   `authenticated` `tz` niet bevat en een client die hem meestuurt `42501`
   krijgt. Dit is nieuw sinds `0280` en stond dus nog in geen enkele handedit.
2. **Een functieargument dat NULL aanneemt.** PostgreSQL kent geen nullability op
   een argument; de generator schrijft `string`, ook bij `DEFAULT NULL`.
3. **Een `RETURNS TABLE`-kolom die NULL kan zijn.** Ook daar kent de catalogus
   geen nullability, en de generator kiest niet-nullable.

⚠️⚠️ **Klasse 3 is de gevaarlijke, en dat is niet theoretisch.**
`zichtbare_reeksen_van_groep()` geeft `best_streak` en `last_cycle_start` terug
als `case when <mag je zien> then … end` — **zonder `else`**. Dat is de maskering
van `0078`, dus domeinregel 7 in de functie zelf. Een gegenereerd type dat
`number` zegt, vertelt de schermlaag dat er altijd een reeks is. Klasse 1 en 2
falen luid (de build breekt); klasse 3 faalt stil.

## 5. Het besluit: een correctielaag, niet opnieuw handwerk

**`src/lib/database.types.ts` blijft van de generator — woordelijk, zonder één
handgeschreven regel.** De correcties staan in een eigen bestand,
`src/lib/database.types.correcties.ts`, dat het gegenereerde schema leest en er
drieëntwintig velden overheen legt. `src/lib/supabase.ts` en `tests/rls/harness.ts`
bouwen hun client op dát type.

Waarom zo, en niet anders:

- **Niet opnieuw in het gegenereerde bestand.** Dat is de fout die dit document
  beschrijft, en hij verdwijnt zonder een woord bij de volgende generatie.
- **Niet als cast per aanroepplek**, wat `jobs.ts` deed en wat als regel prima
  was. 📏 Het aantal plekken maakt het onhoudbaar: zonder de correctie op
  `commitments.tz` staan er **62** compileerfouten in **20** bestanden — achttien
  RLS-testbestanden, `src/modules/commitments/api.ts` en de ijkingstest zelf — en
  `tz` meesturen om ze stil te krijgen zou die tests op een echte database
  `42501` geven. Een cast is een goed antwoord op één plek en een slecht antwoord
  op tweeënzestig.
- **Niet "de database aanpassen".** Er is niets stuk: de trigger, de kolomgrant
  en de maskering doen alle drie precies wat ze moeten. Wat niet klopt is het
  afschrift.

⚠️ **De laag corrigeert alleen wat de generator niet kán weten.** Een handtekening
die op een nog niet uitgerolde migratie wacht hoort er níét in: die komt vanzelf
mee zodra er opnieuw gegenereerd wordt. Dat onderscheid is de enige reden dat dit
bestand geen tweede schema wordt.

⚠️ **Eén van de veertien is bewust niet teruggezet:** `mijn_profiel.Insert.vindbaar`
en `.Update.vindbaar`, waar het handwerk `boolean` schreef en de generator
`boolean | null`. `mijn_profiel` is een view waar geen enkele client in schrijft,
dus er is niets te corrigeren. Een rij zonder gemeten aanleiding is precies wat
dit bestand niet mag worden.

Er kwamen er twee bij: `commitments.Insert.tz` (nieuw sinds `0280`) en
`vraag_ai_job.p_goal_id`, dat de cast uit `jobs.ts` vervangt. Eén mechanisme voor
deze klasse en niet twee — twee mechanismen met dezelfde reden is de val waar
CLAUDE.md bij `knip:controle` voor waarschuwt.

De kolomgrant-kant staat níét in de laag maar op de plek waar hij geldt:
`Commitment` in `src/modules/commitments/api.ts` is sinds deze ronde
`Omit<Tables<'commitments'>, 'tz'>`, want de SELECT-grant van `authenticated`
bevat die kolom niet en elke `.select()` daar noemt al de exacte kolomlijst. Dat
is niet iets wat de generator niet kan weten — het is iets wat per client
verschilt, en `service_role` leest die kolom wél.

## 6. De grendel, en hoe hij geijkt is

`tests/beloftes/typecorrecties.test.ts` zet elke correctie **twee kanten op**
onder `satisfies`:

- de **generatorkant** legt vast dat de generator het vandaag nog fout doet. Komt
  er ooit een `DEFAULT` bij of leest de generator triggers, dan wordt die kant
  rood en hoort de rij uit de laag te verdwijnen. Zonder deze kant groeit de laag
  alleen maar.
- de **correctiekant** legt vast dat de laag doet wat hij belooft.

⚠️ De generatorkant is tegelijk de grendel op handwerk: zet iemand een `| null`
met de hand terug in `src/lib/database.types.ts`, dan wordt hij rood. Dat is het
mechanisme dat er de afgelopen vijf maanden niet was.

⚠️ Het is een **tsc**-toets en geen vitest-toets. Types bestaan op runtime niet,
dus `npm run typecheck` is de grendel — die draait in de poort én in CI.

⚠️ De toetsen grijpen naar het **type** en niet naar een regel in een bestand.
Dat is hier geen stijlkeuze: 📏 `avatar_url: string` staat op drie plekken in de
generatie en `p_group_id: string` op meer dan tien, dus een tekstzoektocht zou
sowieso het verkeerde meten (regel 18, vraag 4).

### De ijking — vijf mutaties, één per grendel

📏 **Ervoor gemeten: `npm run typecheck` geeft 0 fouten.** Na elke mutatie
teruggezet en opnieuw op 0 gemeten.

| mutatie | wat er rood werd | fouten |
| -- | -- | -- |
| de `tz`-correctie uit de laag gehaald | `commitments.Insert.tz — de laag maakt hem optioneel` (r71), plus 61 aanroepplekken | 62 |
| `zoek_mensen.avatar_url` met de hand `\| null` in de **generatie** | `zoek_mensen.avatar_url — generator` (r166), en verder niets | 1 |
| `zichtbare_reeksen_van_groep` uit de laag gehaald | `best_streak — laag` (r150) en `last_cycle_start — laag` (r160) | 2 |
| de laag corrigeert stiekem `zoek_mensen.display_name` | `zoek_mensen.display_name blijft niet-nullable` (r183) | 1 |
| `zet_taakzichtbaarheid` uit de laag gehaald | `p_group_id — laag` (r139), plus de twee echte aanroepplekken | 3 |

⚠️⚠️ **De tweede mutatie is de eerste keer misgegaan, en dat hoort hierbij.** De
eerste poging zette het `| null` op regel 3646 — 📏 dat blijkt een `avatar_url`
in het `Returns`-blok van `weekafsluiting_reacties` te zijn, niet dat van
`zoek_mensen` (regel 3761). Uitslag: **nul** fouten. Een groene suite die niets
zei, terwijl de mutatie "geslaagd" leek. Precies de vorm waar CLAUDE.md voor
waarschuwt — *breek de grendel die de ijking nóemt* — en hier veroorzaakt door
dezelfde eigenschap die de tekstzoektocht hierboven al afwees: die naam staat
drie keer in het bestand.

## 7. Wat hiermee níét gesloten is

- **De laag dekt één schema-versie.** Elke volgende hergeneratie kan een veertiende
  klasse opleveren; de grendel meldt dat een correctie overbodig wordt, niet dat
  er een mist. Dat blijft handwerk, en het moment waarop je ernaar kijkt is de
  hergeneratie zelf.
- **`typesdrift:controle` vergelijkt namen en geen velden.** Alle veertien
  handedits zaten in namen die hij groen noemde. Een veldvergelijking is
  denkbaar — het meetgereedschap van §3 is er — maar hij heeft een eigen
  ijkingstest en een eigen register nodig, en dat is een eigen issue.
- **`typesdrift:controle` blijft in een cloudsessie ongemeten**, en dat is nu wél
  opgeschreven: de kop van het script noemt de reden, de 57 van 19-09 en de
  MCP-route die geen token vraagt.

## 8. Wat de security-ronde erbij vond — en waarom die ronde het waard was

Onwrikbare regel 19 stuurt de `security-reviewer` op alles wat commitments of een
groepszichtbaar oppervlak raakt. Deze PR heeft geen migratie en geen policy, dus
"het is maar typing" was een verdedigbare gedachte. Hij vond vier dingen, en het
eerste is het soort fout dat een tweede paar ogen bestaat:

**1. De correctie landde op de functie zónder afnemer.** 📏
`zichtbare_reeksen_van_groep()` heeft **nul** aanroepers in `src/` en `app/`; het
groepsscherm loopt via `group_overview()`, dat diezelfde maskering met een
`left join` binnenhaalt. Die functie stond niet in de laag. En hij draagt de
klasse in zijn scherpste vorm: 📏 `closed_this_period` is
`case when not coalesce(…) then null else exists(…) end`, en `0208` schrijft in
de migratiekop op waaróm die `null` er is — `false` zou een gemiste week van
iemand anders tonen aan de groep. Een type dat `boolean` zegt maakt van *"geen
antwoord"* vanzelf *"nee"* zodra iemand er een ternair op zet. Acht kolommen van
`group_overview` staan nu in de laag, alle acht met hun oorzaak nagemeten op
productie.

⚠️ **Dat is dus precies de fout waar dit document over gaat, één laag hoger:** de
correctie werd aangebracht waar de eigenschap *ontstaat*, niet waar hij
*gelezen* wordt. Vandaag houdt `RpcRij<>` op één aanroepplek het gat dicht — een
gewoonte, geen eigenschap.

**2. "Bouw je client op de correctielaag" stond alleen in een comment.** Woordelijk
de vorm die deze PR repareert. 📏 Er zijn zeven plekken waar een client op dit
schema gebouwd wordt (twee in `src/lib/supabase.ts`, vijf in
`tests/rls/harness.ts`) en ze waren alle zeven goed — maar niets hield een achtste
tegen. `tests/beloftes/typecorrecties.test.ts` leest nu elke
`createClient<…>`/`SupabaseClient<…>` in `src/`, `app/`, `tests/` en `scripts/` en
eist dat het typeargument uit de correctielaag komt.

⚠️ **De voorgestelde goedkopere fix is niet overgenomen**: de export in het
gegenereerde bestand hernoemen zodat de verkeerde import niet meer compileert. Dat
zou een handgeschreven regel in het gegenereerde bestand zijn — exact wat §5
verbiedt — en de volgende `npm run types:db` gooit hem weg.

**3. `Omit` is een uitsluiting waar de grant een opsomming is.** `Commitment` is nu
een `Pick` van de tien kolommen die `authenticated` mag lezen. Komt er een kolom
bij `commitments` die niet in de grant komt, dan krijgt het type hem er met een
`Omit` stilzwijgend bij — niet-optioneel getypeerd en `undefined` op runtime.

**4. Twee mechanismen voor klasse 3 zonder taakverdeling op papier.** `RpcRij<T>`
in `src/shared/api` maakt élke kolom van een RPC-rij nullable, met een ándere
reden: de types kúnnen achterlopen. De kop daar zegt nu wat het verschil is, zodat
niemand `RpcRij` overslaat "want de correctielaag dekt dat".

⚠️ **Eén bevinding is bewust blijven liggen en staat in `docs/ENGINEER-REVIEW.md`:**
de laag is geen volledige doorlichting van de 199 functies. Wat erin staat is wat
een aanroeper vandaag nodig heeft plus wat gemeten gevaarlijk is. 📏 Het voorbeeld
dat dat concreet maakt staat in het bestand zelf: `group_overview.p_na_joined_at`
en `.p_na_user_id` hebben `DEFAULT NULL` en zijn dus net zo nullable als
`weekafsluiting_reacties.p_na_at` — alleen stuurt vandaag niemand er `null` heen.

### De ijking van de drie nieuwe grendels

📏 Opnieuw met "ervoor" gemeten: nul typecheck-fouten en nul rode tests.

| mutatie | wat er rood werd | omvang |
| -- | -- | -- |
| `src/lib/supabase.ts` terug op `./database.types` | de twee cliëntrijen van dat bestand in de zeef, en verder niets | 2 tests |
| de `group_overview`-correctie uit de laag | de acht `— laag`-asserties van `group_overview` | 8 typecheck-fouten |
| een correctie op een functienaam met een typefout (`zoek_mensn`) | `de laag kent dezelfde functienamen als de generatie` | 1 typecheck-fout |

⚠️ De zeef van bevinding 2 slaat één bestand over — zichzelf — omdat zijn eigen
ijkingsvormen als tekenreeks niet van echte code te onderscheiden zijn. Die rij
staat mét reden in `ZONDER_TOETS`, en de eerste run van de zeef meldde hem netjes
voordat dat register er was.
