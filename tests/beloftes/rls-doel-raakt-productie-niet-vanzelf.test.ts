import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * De belofte van QS8-702, gemeten als gedrag: **zonder een uitdrukkelijk
 * `RLS_DOEL` gaat er geen verzoek naar productie — óók niet met de
 * productiesleutels en `RLS_TEST_ALLOW_PROD=1` in de omgeving.**
 *
 * ⚠️ **Waarom naast `rls-doel.test.ts`.** Die laadt de harness in-proces met
 *    `vi.stubEnv`, in een vitest-ouder die de `.env` van de machine al geladen
 *    heeft; hij toetst wat de harness *werpt*. Deze laadt hem in een
 *    **kindproces** met een kale omgeving en toetst waar de harness *heen
 *    praat*: de driver vervangt `fetch` door een spion die elk adres vastlegt en
 *    nooit verbindt. "Er is geen verzoek naar de productieref gedaan" is de
 *    belofte; "er is een fout geworpen" is een eigenschap van het onderdeel
 *    (regel 18, vraag 2).
 *
 * ⚠️ **Buiten `tests/rls/` met opzet.** Daar zou hij achter
 *    `rlsTestsConfigured` hangen en zichzelf overslaan in precies de stand die
 *    hij bewaakt. In `tests/beloftes/` draait hij in de `unit`-groep, dus in elke
 *    `npm test`, elke `npm run poort` en in CI.
 *
 * ⚠️ **De omgeving is nep.** De URL draagt de productieref maar eindigt op
 *    `.invalid`, de sleutels zijn strings zonder betekenis, en de spion laat
 *    niets door. Ook met een kapotte grendel gaat er niets de deur uit.
 */

const DRIVER = fileURLToPath(new URL('./rls-doel-kindproces.mjs', import.meta.url));
const HARNESS = fileURLToPath(new URL('../rls/harness.ts', import.meta.url));
const PRODUCTIE_REF = 'wehgocadxehottiiyvsc';

const NEP_PRODUCTIE = {
  EXPO_PUBLIC_SUPABASE_URL: `https://${PRODUCTIE_REF}.supabase.invalid`,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'nep-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'nep-service-role-key',
  SUPABASE_JWT_SECRET: 'nep-jwt-secret',
};

// Alleen wat node nodig heeft om te starten — met opzet niets van de
// Supabase-sleutels, `RLS_DOEL` of `RLS_TEST_ALLOW_PROD` van de ouder.
const OS_SLEUTELS = ['PATH', 'Path', 'SystemRoot', 'windir', 'TEMP', 'TMP', 'PATHEXT', 'HOME'];

function kaleOmgeving(extra: Record<string, string>): NodeJS.ProcessEnv {
  // Over de entries en niet `process.env[sleutel]`: dynamische toegang tot
  // `process.env` is in dit project een lintfout (expo/no-dynamic-env-var).
  const os = Object.fromEntries(
    Object.entries(process.env).filter(
      (paar): paar is [string, string] => OS_SLEUTELS.includes(paar[0]) && paar[1] !== undefined,
    ),
  );
  return { ...os, NODE_ENV: 'test', ...NEP_PRODUCTIE, ...extra };
}

interface Uitkomst {
  geladen: boolean;
  laadfout?: string;
  doelsoort?: string;
  rlsTestsConfigured?: boolean;
  clientGebouwd: boolean;
  clientFout?: string | null;
  verzoeken: string[];
}

function laadHarness(extra: Record<string, string>): Uitkomst {
  const uit = execFileSync(
    process.execPath,
    ['--no-warnings', '--experimental-strip-types', DRIVER, HARNESS],
    { env: kaleOmgeving(extra), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 },
  );
  return JSON.parse(uit.trim()) as Uitkomst;
}

const naarProductie = (r: Uitkomst) =>
  r.verzoeken.filter((host) => host.toLowerCase().includes(PRODUCTIE_REF));

describe('QS8-702 — de harness praat alleen met productie als je het zegt (kindproces)', () => {
  it('zonder RLS_DOEL, mét sleutels en RLS_TEST_ALLOW_PROD=1: laden faalt luid, geen verzoek', () => {
    const r = laadHarness({ RLS_TEST_ALLOW_PROD: '1' });

    // De belofte eerst: geen enkel verzoek naar de productieref.
    expect(naarProductie(r)).toEqual([]);

    expect(r.geladen).toBe(false);
    expect(r.laadfout).toMatch(/RLS_DOEL is niet gezet/);
    expect(r.clientGebouwd).toBe(false);
  });

  it('RLS_DOEL=productie zonder RLS_TEST_ALLOW_PROD: geblokkeerd vóór de client, geen verzoek', () => {
    const r = laadHarness({ RLS_DOEL: 'productie' });

    // De belofte eerst: geen enkel verzoek naar de productieref.
    expect(naarProductie(r)).toEqual([]);

    expect(r.geladen).toBe(true);
    expect(r.doelsoort).toBe('productie');
    expect(r.clientGebouwd).toBe(false);
    expect(r.clientFout).toMatch(/geblokkeerd/);
  });

  it('RLS_DOEL=lokaal, mét sleutels en RLS_TEST_ALLOW_PROD=1: alle verzoeken naar de lokale stack', () => {
    const r = laadHarness({ RLS_DOEL: 'lokaal', RLS_TEST_ALLOW_PROD: '1' });

    // De belofte eerst: geen enkel verzoek naar de productieref.
    expect(naarProductie(r)).toEqual([]);

    expect(r.doelsoort).toBe('lokaal');
    expect(r.clientGebouwd).toBe(true);
    expect(r.verzoeken.length).toBeGreaterThan(0);
    expect(r.verzoeken.every((host) => host.startsWith('127.0.0.1'))).toBe(true);
  });

  it.each([
    ['de productieref in hoofdletters', `https://${PRODUCTIE_REF.toUpperCase()}.supabase.invalid`],
    ['een eigen domein zonder projectref', 'https://api.voorbeeld.invalid'],
  ])('RLS_DOEL=productie zonder vlag, %s: geblokkeerd, geen verzoek', (_naam, adres) => {
    const r = laadHarness({ RLS_DOEL: 'productie', EXPO_PUBLIC_SUPABASE_URL: adres });

    // Elk verzoek telt hier: met dit adres herkent `naarProductie` het niet.
    expect(r.verzoeken).toEqual([]);

    expect(r.clientGebouwd).toBe(false);
    expect(r.clientFout).toMatch(/geblokkeerd/);
  });

  it('RLS_DOEL=lokaal met RLS_LOKAAL_URL naar productie in hoofdletters, zonder vlag: geblokkeerd, geen verzoek', () => {
    const adres = `https://${PRODUCTIE_REF.toUpperCase()}.supabase.invalid`;
    const r = laadHarness({ RLS_DOEL: 'lokaal', RLS_LOKAAL_URL: adres });

    expect(naarProductie(r)).toEqual([]);

    expect(r.clientGebouwd).toBe(false);
    expect(r.clientFout).toMatch(/geblokkeerd/);
  });

  it.each([
    ['een IP-adres buiten loopback', 'http://10.0.0.5:3010'],
    ['een eigen domein', 'https://api.voorbeeld.invalid'],
  ])('RLS_DOEL=lokaal met RLS_LOKAAL_URL naar %s, óók met de vlag: geblokkeerd, geen enkel verzoek (QS8-715)', (_naam, adres) => {
    const r = laadHarness({ RLS_DOEL: 'lokaal', RLS_LOKAAL_URL: adres, RLS_TEST_ALLOW_PROD: '1' });

    // Elk verzoek telt: dit adres draagt de projectref niet.
    expect(r.verzoeken).toEqual([]);

    expect(r.clientGebouwd).toBe(false);
    expect(r.clientFout).toMatch(/geen loopback-adres/);
  });

  it('RLS_DOEL=lokaal met RLS_LOKAAL_URL op [::1] mag', () => {
    const r = laadHarness({ RLS_DOEL: 'lokaal', RLS_LOKAAL_URL: 'http://[::1]:3010' });

    expect(r.clientGebouwd).toBe(true);
    expect(r.verzoeken.every((host) => host.startsWith('[::1]'))).toBe(true);
  });

  it('ijkpunt: RLS_DOEL=productie mét RLS_TEST_ALLOW_PROD=1 wordt wél gezien als verzoek naar productie', () => {
    // ⚠️ De tegenhelft, en de reden dat de drie toetsen hierboven iets zeggen:
    //    als de spion een verzoek naar de productieref níet zou zien, waren
    //    "geen verzoek" hierboven altijd groen. De uitdrukkelijke route blijft
    //    bovendien bestaan — `token.test.ts` heeft hem nodig.
    const r = laadHarness({ RLS_DOEL: 'productie', RLS_TEST_ALLOW_PROD: '1' });

    expect(r.clientGebouwd).toBe(true);
    expect(naarProductie(r).length).toBeGreaterThan(0);
  });
});

/**
 * De tweede schakel: **wat vóór elke push draait, start de RLS-groep niet.** Een
 * kaal `vitest run` draait béíde vitest-projecten; zo bereikte een
 * `npm run poort` productie. De keten is `poort.mjs` stap `tests` →
 * `npm run test` → `vitest run --project unit`. De eerste schakel legt
 * `tests/scripts/poort.test.ts` al vast ('de opstelling zelf'); hier staan de
 * twee scripts in `package.json`.
 *
 * ⚠️ **Eerlijk opgeschreven: dit toetst de vórm van twee commando's, niet het
 *    gedrag.** Het is de grendel tegen het stil terugzetten van het besluit. Dat
 *    de harness zonder doel niets naar productie stuurt, draagt het blok
 *    hierboven — ook als iemand de RLS-groep tóch weer in `npm test` haalt.
 */
const PAKKET = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as { scripts: Record<string, string> };

describe('QS8-702 — `npm test` draait alleen de unit-groep, de RLS-suite alleen met een doel', () => {
  it('`npm run test` is beperkt tot de unit-groep', () => {
    const test = PAKKET.scripts.test ?? '';
    expect(test).toMatch(/\bvitest run\b/);
    expect(test).toMatch(/--project[= ]unit\b/);
    expect(test).not.toMatch(/--project[= ]rls\b/);
  });

  it('`npm run rls:lokaal` zet het doel zelf', () => {
    expect(PAKKET.scripts['rls:lokaal']).toMatch(/\bRLS_DOEL=lokaal\b/);
  });
});
