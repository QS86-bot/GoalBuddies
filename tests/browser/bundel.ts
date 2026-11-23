/**
 * Bundelt een harnas uit `tests/browser/harnas/` tot één script dat een echte browser kan draaien — QS8-804.
 *
 * ⚠️ **Dezelfde vertaling als de jsdom-renders, maar dan voor een echte browser.** `react-native` wordt
 *    `react-native-web` en `react-native-svg` een lege tekening (zie `tests/render/scherm.ts` voor waarom). Wat
 *    hier gemeten wordt is dus wat react-native-web van een component maakt, niet wat native doet.
 *
 * Gebruikt de `build`-API van vite (via vitest al aanwezig): geen dependency erbij.
 */
import { resolve } from 'node:path';

import { build } from 'vite';

const WORTEL = resolve(import.meta.dirname, '../..');

export async function bundelHarnas(naam: string): Promise<string> {
  const uitkomst = await build({
    configFile: false,
    mode: 'production',
    logLevel: 'silent',
    root: WORTEL,
    define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },
    oxc: { jsx: { runtime: 'automatic', development: false } },
    resolve: {
      extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js', '.mjs', '.json'],
      alias: {
        '@': resolve(WORTEL, 'src'),
        'react-native-svg': resolve(import.meta.dirname, 'harnas/svg-stub.tsx'),
        'react-native': 'react-native-web',
      },
    },
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      modulePreload: false,
      rollupOptions: {
        input: resolve(import.meta.dirname, `harnas/${naam}.tsx`),
        output: { format: 'iife' },
      },
    },
  });
  const uitvoer = Array.isArray(uitkomst) ? uitkomst[0] : uitkomst;
  if (!uitvoer || !('output' in uitvoer)) throw new Error('bundelHarnas: vite gaf geen uitvoer');
  const chunk = uitvoer.output.find((o) => o.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('bundelHarnas: geen chunk in de uitvoer');
  return chunk.code;
}
