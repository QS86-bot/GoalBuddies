const expoConfig = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');

// Eén tekst voor twee grendels — zie het blok voor `src/shared/**` verderop.
// Twee regels moeten dezelfde grens in twee vormen afdwingen (een statische en
// een dynamische import); de uitleg die de lezer krijgt hoort dan niet per vorm
// te verschillen, en al helemaal niet uit elkaar te groeien.
const GEDEELDE_LAAG_GEEN_DATALAAG =
  'De gedeelde laag importeert niets uit de datalaag. Een platformvermogen (een kiezer, een opener) hoort in shared/kiezers; een hook die zo\'n vermogen aan een domein knoopt hoort in modules/<naam>/react.ts. Zie QS8-423.';

const DATALAAG_GEEN_SHARED_UI =
  'De datalaag importeert niets uit shared/ui — ook geen type. De standen die de database teruggeeft staan in shared/standen; labels en toon blijven in shared/ui. Zie QS8-207.';

module.exports = [
  ...expoConfig,
  {
    // ⚠️ **`supabase/functions` staat er sinds 11-09-2026 níét meer bij**
    //    (QS8-422). `supabase/*` sloot de hele map uit, en dat is ~6.700 regels
    //    TypeScript waar coderegel 15 nergens gold — precies de map die elk uur
    //    met `service_role` tegen productie draait en dus langs elke
    //    RLS-policy heen gaat. `deno lint` draait er wel overheen maar kent
    //    geen complexiteitsregels.
    //
    //    `migrations/` en `shim/` blijven uitgesloten en staan er bij naam:
    //    die dragen SQL. Bewust niet als `supabase/*` met een uitzondering
    //    erop — dan valt een map die er ooit bij komt stilzwijgend buiten de
    //    linter, en dat is precies de bevinding die dit blok repareert.
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/migrations/*', 'supabase/shim/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // CLAUDE.md, coderegel 13: geen any.
      '@typescript-eslint/no-explicit-any': 'error',
      // CLAUDE.md, coderegel 14: geen lege catch.
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  {
    // ⚠️ De service-role-key omzeilt RLS volledig. Alles onder src/ en app/ komt
    //    in de Expo-bundle terecht die de browser downloadt. Metro vult alleen
    //    EXPO_PUBLIC_*-variabelen in, dus de wáárde lekt vandaag niet — maar de
    //    code die de key verwacht reist wel mee, en op de dag dat iemand dotenv
    //    of app.config.js `extra` aan de app hangt, lekt hij alsnog.
    //
    //    src/lib/env.ts is de enige uitzondering: dat is het gedocumenteerde
    //    toegangspunt voor Edge Functions en scripts, en het gooit als de key
    //    ontbreekt in plaats van stilletjes door te gaan.
    files: ['src/**/*.ts', 'src/**/*.tsx', 'app/**/*.ts', 'app/**/*.tsx'],
    //    src/shared/time/clock.ts leest alleen NODE_ENV, om freezeNow() in
    //    productie te weigeren. Geen secret, wel process.env.
    ignores: ['src/lib/env.ts', 'src/shared/time/clock.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Lees env vars via src/lib/env.ts. Rechtstreeks process.env in de bundle is hoe SUPABASE_SERVICE_ROLE_KEY ooit meelift.',
        },
      ],
    },
  },
  {
    // ⚠️ **De datalaag wijst niet naar de presentatielaag.** `modules/`
    //    importeert niets uit `shared/ui` — sinds QS8-207 ook geen type meer.
    //
    // ⚠️ **Dit is de "wordt zwaarder als" van een bevinding van 19-08, en die
    //    gold stil.** Die rij zei: het is vandaag een `import type` en dus geen
    //    runtime-koppeling, maar wordt zwaarder zodra het er wél een wordt. Op
    //    28-08 nagemeten met een echte waarde-import erbij: typecheck én lint
    //    bleven allebei groen. De voorwaarde zou dus intreden zonder dat er iets
    //    rood werd — precies de klasse waar dit project vier keer voor betaald
    //    heeft.
    //
    // ⚠️ **`allowTypeImports` stond aan tot 06-09-2026, en dat is nu dicht —
    //    QS8-207.** Die uitzondering bestond omdat de conventievraag openstond:
    //    vier plekken leenden een type uit `shared/ui` en niemand had besloten
    //    of dat mocht. De regel hield toen alleen tegen dat het erger werd.
    //
    //    Het wérd erger: het waren er twee bij de bevinding (19-08), vier bij
    //    het nameten (28-08) en vijf bij het bouwen (06-09, `Beoordeelstand`).
    //    De voorwaarde onder die dossierrij — *"wordt zwaarder als er een vijfde
    //    type bijkomt"* — was dus vervuld voordat iemand hem opsloeg.
    //
    //    De vijf standen wonen sinds QS8-207 in `shared/standen`, een map zonder
    //    één import. Beide lagen wijzen daar omláág naar, precies zoals
    //    `shared/api` dat sinds 25-08 voor `Resultaat` en `Pagina` doet. Er is
    //    daarmee geen reden meer om een type uit de schermlaag te lenen, en dus
    //    ook geen uitzondering meer.
    //
    // ⚠️ **Dit is de grendel van dit issue en niet de verhuizing.** Een
    //    verhuizing zonder deze regel is een opruimactie die over drie maanden
    //    terug is; met deze regel wordt de zesde rood op de regel waar hij
    //    geschreven wordt.
    //
    // ⚠️ **Dit patroon is de helft van de grens.** Het dekt de statische vormen;
    //    `await import()` glipt er onderdoor en wordt gevangen door de zone in
    //    het `import/no-restricted-paths`-blok verderop. Haal je hier iets weg,
    //    kijk dan dáár ook.
    files: ['src/modules/**/*.ts', 'src/modules/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/shared/ui', '**/shared/ui/*'],
              message: DATALAAG_GEEN_SHARED_UI,
            },
          ],
        },
      ],
    },
  },
  {
    // ⚠️⚠️ **En de andere kant op, sinds 11-09-2026 (QS8-423).** De regel
    //    hierboven was asymmetrisch: de datalaag mocht niets uit `shared/ui`
    //    halen, maar `shared/ui` mocht alles uit de datalaag halen. 📏 Gemeten
    //    in de weekaudit van 10-09: drie bestanden deden dat, alle drie in
    //    dezelfde week gebouwd, alle drie met een **waarde**-import — en alle
    //    drie geëxporteerd uit `shared/ui/index.ts`, dus
    //    `import { Button } from '@/shared/ui'` trok de barrel van
    //    `modules/buddies` mee.
    //
    // ⚠️ **De reden die er in de koppen stond, was geen laagargument.** Er
    //    stond dat `expo-image-picker` react-native meesleept en dat een
    //    module-barrel door tests wordt geïmporteerd die geen RN-omgeving
    //    hebben. Dat klopt — 📏 opnieuw nagemeten op 11-09 door `kiesFoto`
    //    tijdelijk in `modules/buddies/index.ts` te exporteren: `doorloop.test.ts`
    //    viel om met `ReferenceError: __DEV__ is not defined`. Maar het is een
    //    **testomgevingsprobleem** en geen domeingrens, en de prijs was dat een
    //    componentenbibliotheek het chatdomein ging kennen (`keurChatfoto`,
    //    `tekenChatdoc`).
    //
    // ⚠️ **De knoop is opgelost door de derde laag te benoemen die er al was:**
    //    een kiezer is geen UI. `shared/kiezers` draagt de platformvermogens,
    //    de hooks die ze aan een domein knopen wonen in
    //    `modules/<naam>/react.ts`, en `shared/ui` houdt componenten, labels en
    //    toon. Zie `docs/decisions/2026-09-11-een-kiezer-is-geen-ui.md`.
    //
    // ⚠️ **Dit is de grendel van dit issue en niet de verhuizing** — dezelfde
    //    zin als bij de regel hierboven, en om dezelfde reden: zonder deze
    //    regel is het opruimen over drie maanden terug.
    //
    // ⚠️ **Dit patroon is de helft van de grens.** Het dekt de statische vormen;
    //    `await import()` glipt er onderdoor en wordt gevangen door de zone in
    //    het `import/no-restricted-paths`-blok verderop. Haal je hier iets weg,
    //    kijk dan dáár ook.
    files: ['src/shared/**/*.ts', 'src/shared/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/**'],
              message: GEDEELDE_LAAG_GEEN_DATALAAG,
            },
          ],
        },
      ],
    },
  },
  {
    // ⚠️⚠️ **Eén blok voor beide laaggrenzen, en dat is sinds 11-09-2026
    //    (QS8-425) een besluit en geen indeling.** `no-restricted-paths` scoopt
    //    zichzelf al per richting via `target`; het blok ook nog eens op `files`
    //    scopen voegt niets toe en kost precies het risico dat QS8-423 een ronde
    //    kostte — twee blokken die dezelfde regelnaam zetten zijn niet allebei
    //    van kracht zodra hun `files` gaan overlappen, en de laatste wint
    //    volledig en zwijgend. Eén regelnaam, één plek, geen volgorde die ertoe
    //    doet.
    //
    // ⚠️ **Waarom deze regel naast `no-restricted-imports` staat en die niet
    //    vervangt.** 📏 `no-restricted-imports` hangt aan `ImportDeclaration` en
    //    ziet `await import()` niet; deze kijkt naar het opgelóste pad en dekt
    //    de statische én de dynamische vorm, relatief én via `@/`. Dat gat is
    //    niet theoretisch — `src/modules/ai/plan-toepassen.ts` gebruikt
    //    `await import()` op twee plekken in productiecode om een cykel te
    //    breken, en er staan er veertien in de repo. De patroonregels blijven
    //    staan als tweede net op de statische vormen: hun melding valt op de
    //    importregel zelf, wat korter uit te leggen is dan een opgelost pad.
    //
    // ⚠️ **Wat geen van beide vangt:** een `import()` met een variabele bron.
    //    Allebei lezen ze de bronstring, en een variabele heeft er geen. Dat is
    //    een grens van het gereedschap; hij staat als eigen geval in
    //    `tests/scripts/laaggrenzen.test.ts` zodat hij opvalt als hij verschuift.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/shared',
              from: './src/modules',
              message: GEDEELDE_LAAG_GEEN_DATALAAG,
            },
            {
              // ⚠️ **`lib/supabase` is de datalaag één deur verder.** De zone
              //    hierboven dekt `src/modules`, en een `shared`-bestand dat de
              //    client rechtstreeks pakt legt dezelfde knoop zonder er ooit
              //    langs te komen. 📏 Vandaag nul treffers in `src/shared`.
              //
              //    Met opzet het bestand en niet de map: `lib/observability` en
              //    `lib/env` zijn dwarsdoorsnijdend en geen datalaag, en die
              //    hier meenemen zou een grens trekken die niemand besloten
              //    heeft.
              target: './src/shared',
              from: './src/lib/supabase.ts',
              message: GEDEELDE_LAAG_GEEN_DATALAAG,
            },
            {
              // ⚠️⚠️ **De andere richting, en die had het gat nog tot QS8-425.**
              //    De patroonregel van QS8-207 hierboven ving de statische vorm
              //    en de type-import, maar 📏 `await import('../../shared/ui')`
              //    in `src/modules/**` was groen. Zelfde oorzaak, zelfde fix,
              //    en nu dus ook zelfde regel.
              target: './src/modules',
              from: './src/shared/ui',
              message: DATALAAG_GEEN_SHARED_UI,
            },
          ],
        },
      ],
    },
  },
  {
    // ⚠️ CLAUDE.md, correctheidsregel 7: geen tijd- of weekberekening buiten
    //    shared/time. Deze regel is een vangnet, geen bewijs — hij vangt de
    //    voor de hand liggende gevallen, niet alles.
    files: ['src/**/*.ts', 'src/**/*.tsx', 'app/**/*.tsx'],
    //    Tests mogen wél een Date bouwen: een suite die een moment vastpint,
    //    heeft er per definitie een nodig. Zonder deze uitzondering zijn de
    //    DST-overgang en de coulanceperiode niet te testen — precies de twee
    //    plekken waar het misgaat.
    ignores: ['src/shared/time/**', 'src/shared/api/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'Geen datumberekening buiten src/shared/time. Gebruik currentUserCycle() of currentGroupPeriod().',
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message:
            'Geen Date.now() buiten src/shared/time. Gebruik de klok uit shared/time.',
        },
        {
          // ⚠️ Toegevoegd 24-08-2026 (QS8-27, criterium 3). De tijdzone van het
          //    toestel werd op twee plekken zelf bepaald, en ze verschilden: de
          //    ene had een terugval, de andere niet. Die tweede zette `groups.tz`
          //    — de groepsklok van domeinregel 1, die voor iedereen in de groep
          //    de huddledag bepaalt.
          //    ⚠️ Alleen `.timeZone`, en dat is een correctie op de eerste versie
          //    van deze regel. Die sloeg op elke `resolvedOptions()` en viel
          //    daarmee over `apparaatVoorkeuren()` in `shared/i18n`, die
          //    `.locale` leest — de táál van het toestel, en dat is geen
          //    tijdberekening. Een regel die te breed is, wordt uitgezet.
          selector:
            "MemberExpression[property.name='timeZone'][object.callee.property.name='resolvedOptions']",
          message:
            'Bepaal de tijdzone niet zelf. Gebruik apparaatTijdzone() uit shared/time — daar zit de terugval en de geldigheidstoets.',
        },
        {
          // ⚠️ Toegevoegd 25-08-2026, bij het opruimen van de bevinding van
          //    16-08. `Resultaat<T>` stond op dat moment zéven keer woordelijk
          //    in de codebase en `Pagina<T>` twee keer — de bevinding had er
          //    vier voorspeld. Omdat modules elkaars binnenkant niet mogen
          //    importeren, worden dat evenzoveel verschillende nominale types
          //    met dezelfde naam; ze vergelijken structureel, dus het wérkt, en
          //    daarom groeide het aan zonder dat iets rood werd.
          //
          //    ⚠️ Deze regel bewaakt de belofte "er is één definitie" en niet de
          //    plek waar hij toevallig staat. Wie hier kopie acht neerzet, krijgt
          //    de lintfout — ook in een module die vandaag nog niet bestaat.
          //    `shared/api` zelf is uitgezonderd; zie de `ignores` hieronder.
          //
          //    ⚠️ `RpcRij<T>` staat er sinds 25-08-2026 bij. Die stond vijf keer
          //    woordelijk als `{ readonly [K in keyof RpcX]: RpcX[K] | null }`
          //    — `ChatRij`, `AntwoordRij`, `ReactieRij`, `OverzichtRij` en
          //    `WachtrijRij`. Dat de regel op de náám selecteert en niet op de
          //    vorm is een bewuste beperking: een zesde kopie onder een andere
          //    naam glipt erdoor. Wat hij wél doet is de plek vastzetten waar
          //    iemand hem zóékt, en dat is waar deze vijf uiteen zouden lopen.
          selector:
            "TSTypeAliasDeclaration[id.name=/^(Resultaat|Pagina|RpcRij)$/], TSInterfaceDeclaration[id.name=/^(Resultaat|Pagina|RpcRij)$/]",
          message:
            'Resultaat<T>, Pagina<T> en RpcRij<T> staan in src/shared/api. Importeer ze daar, definieer ze niet opnieuw — zo ontstonden er zeven kopieën.',
        },
      ],
    },
  },
  {
    // ⚠️ **Onwrikbare regel 15, en dan het deel dat overal geldt** — QS8-190.
    //    `nesting <3 diep` stond sinds 16-08 als bevinding open met de opmerking
    //    dat de regel alléén op papier bestond. 📏 Gemeten toen hij hier
    //    aangezet werd: **nul** overtredingen in `app/`, één in `src/`
    //    (`kleurafstand.ts`, in deze ronde ontnest). De regel was dus al waar en
    //    werd alleen door niets bewaakt — het goedkoopste soort grendel dat er
    //    is, en precies daarom stond hij er niet.
    //
    // ⚠️ **`scripts/` staat er sinds 06-09-2026 wél bij** (QS8-291). De elf
    //    overtredingen die de rij van 05-09 noemde, zijn in die ronde gesplitst;
    //    het waren allemaal controlescripts die over geneste datastructuren
    //    lopen, en de reparatie was elke keer dezelfde: de binnenste lus naar een
    //    functie met een naam.
    // ⚠️ **`supabase/functions/` staat er sinds 11-09-2026 bij** (QS8-422).
    //    📏 Gemeten toen die map voor het eerst gelint werd: **22**
    //    overtredingen, en **achttien** ervan kwamen niet uit de logica maar
    //    uit één vorm — `for await (const pagina of paginas(…))` met
    //    `for (const rij of pagina)` erin, in de twee jobs die elk uur draaien.
    //    Het lichaam was bij het invoeren van de paginering nooit herschreven,
    //    dus de extra laag stond er zonder dat iemand hem gezien had. `rijen()`
    //    in `src/shared/bladeren` haalt hem weg; de vier die overbleven zijn
    //    met guards vlak getrokken, zónder een functie op te splitsen.
    files: [
      'src/**/*.ts',
      'src/**/*.tsx',
      'app/**/*.ts',
      'app/**/*.tsx',
      'scripts/**/*.mjs',
      'supabase/functions/**/*.ts',
    ],
    rules: { 'max-depth': ['error', 3] },
  },
  {
    // ⚠️ **En dan het deel dat níét overal kan gelden: <50 regels.**
    //
    // 📏 Gemeten op 05-09-2026, testbestanden niet meegeteld: **66 functies in
    //    `app/` boven de vijftig, en elf in `src/`** — waarvan er negen in
    //    `src/shared/ui` staan. De twee daarbuiten
    //    (`useAvatarKeuze`, `verstuurWebPush`) zijn in deze ronde gesplitst.
    //
    // **Daarom geldt de vijftig hier en alleen hier: logica.** Een functie die
    // beslist, rekent of praat met de server hoort in één oogopslag te lezen
    // zijn, en dat is precies wat regel 15 bedoelt.
    //
    // ⚠️ **Een component is iets anders, en dat is geen uitvlucht.** Het lichaam
    //    van een React-component is grotendeels JSX: één `return` met opmaak
    //    erin. Zestig regels opmaak zijn niet het probleem waar regel 15 voor
    //    bestaat; vertakking is dat wel, en daar gaat `max-depth` hierboven over.
    //    Wat de omvang van de schermlaag in toom houdt is de rátel in
    //    `scripts/regel15-controle.mjs` — die telt hoevéél functies er boven de
    //    vijftig zitten en laat dat getal alleen dalen.
    //
    // ⚠️ **Testbestanden zijn uitgezonderd** omdat `describe(() => …)` er als
    //    functie in telt. Een suite van tweehonderd regels is één blok met
    //    gevallen erin, geen functie die iemand moet kunnen overzien — en een
    //    regel die dat wél zo telt, leer je uitzetten.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/shared/ui/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // ⚠️ **`src/shared/ui` is de componentenlaag van `src/`** en volgt daarom de
    //    schermlaag en niet de logicalaag. 📏 De langste staat er op 73 regels
    //    (`Weekplanblok`), dus vijfenzeventig is een plafond dat vandaag bindt
    //    en niet een dat niemand kan raken. Zakt de langste, dan hoort dit getal
    //    mee te zakken — dezelfde afspraak als bij de ratel.
    files: ['src/shared/ui/**/*.ts', 'src/shared/ui/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 75, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // ⚠️ **`supabase/functions/` viel tot 11-09-2026 buiten élke coderegel**
    //    (QS8-422). `deno lint` draait er sinds 25-08 overheen, maar dat kent
    //    geen complexiteitsregels — dus ~6.700 regels TypeScript zonder
    //    coderegel 15, in precies de map die elk uur met `service_role` tegen
    //    productie draait en dus langs elke RLS-policy heen gaat.
    //
    //    Wat hier wél al goed was: 📏 `no-explicit-any` en `no-empty` apart
    //    tegen deze map losgelaten gaven **nul** treffers. Dit ging over
    //    vertakking en lengte, niet over typeveiligheid.
    //
    // ⚠️ **De vijftig staat hier bewust níét als lintregel**, om dezelfde reden
    //    als in `app/` en `scripts/`: er zitten er zes boven en de langste telt
    //    280 regels. Wat hier bindt is de rátel in
    //    `scripts/regel15-controle.mjs`. `max-depth` kán wél hard — de
    //    tweeëntwintig overtredingen zijn in deze ronde weg.
    files: ['supabase/functions/**/*.ts'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // ⚠️⚠️ **Geen schaduw, en dat is een grendel uit de security-review op
      //    QS8-422.** `rijen` werd daar als import binnengehaald terwijl er in
      //    hetzelfde bestand al twee lokale `const rijen` stonden. Vandaag
      //    onschadelijk — die helpers roepen de generator niet aan — maar niets
      //    ving het: `deno lint` zwijgt hier ook over. Wie er later paginering
      //    in zo'n helper zet, krijgt de lokale array te pakken en de uurjob
      //    valt om met een TypeError, in de énige map zonder testruntime.
      //    📏 Nul treffers nadat die twee hernoemd zijn, dus dit kan hard.
      '@typescript-eslint/no-shadow': 'error',
      // ⚠️ **Deno en niet Node, en dat is de enige uitzondering die deze map
      //    krijgt.** `jsr:@supabase/supabase-js@2` is de specifier die Supabase
      //    voorschrijft en die de runtime verwacht; ESLint's resolver kent
      //    alleen Node-paden en meldt hem als onvindbaar. Dat de import klópt,
      //    toetst `deno check` in `npm run edge:types:controle` — dus hier is
      //    niets onbewaakt, alleen elders bewaakt.
      'import/no-unresolved': 'off',
    },
  },
  {
    // ⚠️ **`scripts/` viel structureel buiten de linter** (QS8-291, dossierrij
    //    01-09). `eslint.config.js` dekte alleen `**/*.ts(x)`, en deze map is
    //    `.mjs` — dus 57 bestanden en 14.170 regels zagen geen enkele coderegel.
    //
    //    📏 Gemeten vóór deze ronde: `npx eslint scripts/` gaf geen enkele regel
    //    uitvoer. **En dat is precies de map waar de grendels van dit project
    //    wonen**: elke `*:controle` staat hier, dus de regels die de rest van de
    //    codebase moet volgen golden niet voor de code die ze afdwingt.
    //
    // ⚠️ **De vijftig staat hier bewust níét als lintregel.** 📏 Vijftien
    //    functies zitten erboven, en een regel die vijftien keer rood staat leer
    //    je uitzetten — dezelfde afweging die hierboven voor `app/` gemaakt is.
    //    Wat hier bindt is de rátel in `scripts/regel15-controle.mjs`, die telt
    //    hoevéél functies erboven zitten en dat getal alleen laat dalen.
    //
    //    `max-depth` kan wél hard, want vertakking is waar regel 15 echt over
    //    gaat en die elf zijn gesplitst — zie het blok hierboven.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', TextDecoder: 'readonly' },
    },
    rules: {
      // CLAUDE.md, coderegel 14: geen lege catch.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
