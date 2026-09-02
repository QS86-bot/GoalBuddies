// ESLint voor de steiger: de scripts (.mjs) en de tests (.ts).
//
// ⚠️ Twee regels komen rechtstreeks uit CLAUDE.md en zijn daarom een fout en
//    geen waarschuwing: geen `any` (coderegel 13) en geen lege catch
//    (coderegel 14). De rest is de aanbevolen basis.
//
// ⚠️ `web/` is de Bolt-export en krijgt zijn eigen lintconfig zodra hij er is;
//    `supabase/functions/` draait op Deno en `n8n/` is JSON. Die drie horen hier
//    niet onder — zet ze niet stilzwijgend aan zonder hun eigen regels.
import js from '@eslint/js';
import globals from 'globals';
import { configs as tsConfigs } from 'typescript-eslint';

export default [
  { ignores: ['node_modules/*', 'dist/*', 'web/*', 'supabase/*', 'n8n/*', 'coverage/*'] },
  js.configs.recommended,
  ...tsConfigs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
];
