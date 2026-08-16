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
    // ⚠️ CLAUDE.md, correctheidsregel 7: geen tijd- of weekberekening buiten
    //    shared/time. Deze regel is een vangnet, geen bewijs — hij vangt de
    //    voor de hand liggende gevallen, niet alles.
    files: ['src/**/*.ts', 'src/**/*.tsx', 'app/**/*.tsx'],
    //    Tests mogen wél een Date bouwen: een suite die een moment vastpint,
    //    heeft er per definitie een nodig. Zonder deze uitzondering zijn de
    //    DST-overgang en de coulanceperiode niet te testen — precies de twee
    //    plekken waar het misgaat.
    ignores: ['src/shared/time/**', '**/*.test.ts', '**/*.test.tsx'],
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
      ],
    },
  },
];
