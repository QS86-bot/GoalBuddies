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
    // ⚠️ CLAUDE.md, correctheidsregel 7: geen tijd- of weekberekening buiten
    //    shared/time. Deze regel is een vangnet, geen bewijs — hij vangt de
    //    voor de hand liggende gevallen, niet alles.
    files: ['src/**/*.ts', 'src/**/*.tsx', 'app/**/*.tsx'],
    ignores: ['src/shared/time/**'],
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
