const expoConfig = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'supabase/*'],
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
    // ⚠️ **De datalaag wijst niet naar de presentatielaag.** `modules/` mag een
    //    tÿpe uit `shared/ui` lenen, maar geen wáárde: dan draait de datalaag op
    //    code uit de schermlaag en is de architectuur uit `CLAUDE.md` omgekeerd.
    //
    // ⚠️ **Dit is de "wordt zwaarder als" van een bevinding van 19-08, en die
    //    gold stil.** Die rij zei: het is vandaag een `import type` en dus geen
    //    runtime-koppeling, maar wordt zwaarder zodra het er wél een wordt. Op
    //    28-08 nagemeten met een echte waarde-import erbij: typecheck én lint
    //    bleven allebei groen. De voorwaarde zou dus intreden zonder dat er iets
    //    rood werd — precies de klasse waar dit project vier keer voor betaald
    //    heeft.
    //
    // ⚠️ **`allowTypeImports` staat aan, en dat is geen halve maatregel.** Vier
    //    plekken lenen vandaag een type (`KettingStand`, `RisicoReden`,
    //    `RisicoStand`, `WeekpasStand`) en `verbatimModuleSyntax` zorgt dat een
    //    `import type` niets in de bundel achterlaat. Of die vier types daar
    //    thuishoren is een conventievraag voor de engineer-review; deze regel
    //    beantwoordt hem niet, hij houdt alleen tegen dat het stilletjes erger
    //    wordt.
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
              allowTypeImports: true,
              message:
                'De datalaag mag uit shared/ui alleen een type lenen (`import type`), geen waarde. Anders wijst modules/ naar de schermlaag. Zie de rij van 19-08 in docs/ENGINEER-REVIEW.md.',
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
    // ⚠️ `scripts/` staat er niet bij, en dat is gemeten en geen vergeetpost:
    //    daar zijn er elf, allemaal in controlescripts die over geneste
    //    datastructuren lopen. Die horen in hun eigen ronde; zie de rij van
    //    05-09 in `docs/ENGINEER-REVIEW.md`.
    files: ['src/**/*.ts', 'src/**/*.tsx', 'app/**/*.ts', 'app/**/*.tsx'],
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
];
