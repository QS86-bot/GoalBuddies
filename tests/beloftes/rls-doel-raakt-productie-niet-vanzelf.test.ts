import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * De belofte van QS8-700: **zonder een uitdrukkelijk `RLS_DOEL` praat geen enkele
 * RLS-test met productie — óók niet met de productiesleutels en
 * `RLS_TEST_ALLOW_PROD=1` in de omgeving.**
 *
 * ⚠️ **Dit toetst het gedrag, niet de bronregel** (onwrikbare regel 18, vragen 2
 *    en 4). Een test die `harness.ts` leest en de ternary herkent, blijft groen
 *    als iemand elders een tweede pad bouwt dat de standaard terugzet. Daarom
 *    laadt deze grendel de harness echt — in een kindproces, zodat de
 *    module-constanten onder een gekozen omgeving berekend worden.
 *
 * ⚠️ **Buiten `tests/rls/` met opzet.** Stond hij in die map, dan droeg hij
 *    `rlsTestsConfigured`/`stackBeschikbaarOfFaal` als gate en sloeg hij zichzelf
 *    over bij een kale `npm test` — precies de stand die hij moet bewaken. Hier
 *    draait hij in de `unit`-groep en dus in élke `npm test` en elke `npm run poort`.
 *
 * ⚠️ **De omgeving is kaal en niet de hele `process.env`.** De vitest-ouder draagt
 *    de échte `.env`-sleutels; alleen een eigen omgeving met nepsleutels bewijst
 *    dat het slot óók met die sleutels present dichtblijft. De URL draagt de
 *    productieref maar eindigt op `.invalid`: een verbinding zou nergens heen
 *    gaan, en de belofte is dat hij niet gelegd wordt.
 */

const DRIVER = fileURLToPath(new URL('./rls-doel-kindproces.mjs', import.meta.url));
const HARNESS = fileURLToPath(new URL('../rls/harness.ts', import.meta.url));

const NEP_SLEUTELS = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://wehgocadxehottiiyvsc.supabase.invalid',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'nep-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'nep-service-role-key',
  SUPABASE_JWT_SECRET: 'nep-jwt-secret',
  RLS_TEST_ALLOW_PROD: '1',
};

// ⚠️ Alleen de OS-essentials erbij, zodat node start en de hook laadt — met opzet
//    niet de Supabase-sleutels of `RLS_DOEL` van de ouder.
const OS_SLEUTELS = ['PATH', 'Path', 'SystemRoot', 'windir', 'TEMP', 'TMP', 'PATHEXT', 'HOME'];

function kaleOmgeving(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const sleutel of OS_SLEUTELS) {
    const waarde = process.env[sleutel];
    if (waarde !== undefined) env[sleutel] = waarde;
  }
  return { ...env, ...NEP_SLEUTELS, ...extra };
}

interface Uitkomst {
  doelsoort: string;
  rlsTestsConfigured: boolean;
  echteSessieBeschikbaar: boolean;
  clientGebouwd: boolean;
  netwerkGeprobeerd: boolean;
}

function laadHarness(extra: Record<string, string>): Uitkomst {
  const uit = execFileSync(
    process.execPath,
    ['--experimental-strip-types', DRIVER, HARNESS],
    { env: kaleOmgeving(extra), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(uit.trim()) as Uitkomst;
}

describe('QS8-700 — zonder RLS_DOEL raakt de suite productie niet', () => {
  it('zonder RLS_DOEL: geen doel, niet geconfigureerd, en geen client naar productie', () => {
    const r = laadHarness({});

    expect(r.doelsoort).toBe('geen');
    expect(r.rlsTestsConfigured).toBe(false);
    // ⚠️ Dít is het bewijs van "geen verbinding geprobeerd": `requireEnv()` werpt
    //    vóór `createClient()`, dus er is geen client om een verzoek mee te doen.
    expect(r.clientGebouwd).toBe(false);
    expect(r.netwerkGeprobeerd).toBe(false);
  });

  it('een onbekende RLS_DOEL telt óók als geen doel', () => {
    const r = laadHarness({ RLS_DOEL: 'staging' });

    expect(r.doelsoort).toBe('geen');
    expect(r.rlsTestsConfigured).toBe(false);
    expect(r.clientGebouwd).toBe(false);
  });

  it('RLS_DOEL=productie blijft de uitdrukkelijke route naar productie', () => {
    // De tegenhelft: de bestaande reden om tegen productie te draaien —
    // `token.test.ts` — moet blijven werken. Met het doel én de guard-sleutel
    // bouwt de harness een client; een verzoek doet deze toets niet.
    const r = laadHarness({ RLS_DOEL: 'productie' });

    expect(r.doelsoort).toBe('productie');
    expect(r.rlsTestsConfigured).toBe(true);
    expect(r.echteSessieBeschikbaar).toBe(true);
    expect(r.clientGebouwd).toBe(true);
  });

  it('RLS_DOEL=lokaal wijst naar de lokale stack, zonder echte sessie', () => {
    const r = laadHarness({ RLS_DOEL: 'lokaal' });

    expect(r.doelsoort).toBe('lokaal');
    expect(r.rlsTestsConfigured).toBe(true);
    expect(r.echteSessieBeschikbaar).toBe(false);
  });
});

/**
 * De tweede helft van QS8-700: **de poort-`tests`-stap draait de RLS-groep niet
 * mee.** Een kaal `vitest run` draait béíde vitest-projecten, dus de RLS-groep
 * liep twee keer — en vóór de harness-fix tegen productie zodra de sleutels er
 * stonden. `npm test` hoort tot de `unit`-groep beperkt te blijven.
 *
 * ⚠️ **Wat dit wél en níet bewaakt.** Dit toetst de vórm van het `test`-script,
 *    en dat is eerlijk op te schrijven: het is de grendel tegen het stíl
 *    terugzetten van het besluit, niet het bewijs dat geen RLS-bestand ooit
 *    productie raakt. Dat laatste draagt de grendel hierboven, die het gedrag van
 *    de harness meet. De twee samen zijn de naad: de één bewaakt de standaard, de
 *    ander het commando dat de standaard aanroept.
 */
const PAKKET = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as { scripts: Record<string, string> };

describe('QS8-700 — `npm test` blijft tot de unit-groep beperkt', () => {
  it('beperkt vitest tot de unit-groep', () => {
    expect(PAKKET.scripts.test).toMatch(/\bvitest run\b/);
    expect(PAKKET.scripts.test).toMatch(/--project[= ]unit\b/);
  });

  it('draait niet de RLS-groep en niet de kale suite mee', () => {
    // Een kaal `vitest run` (beide projecten) of een expliciete `--project rls`
    // haalt de RLS-groep terug in het commando dat vóór elke push draait.
    expect(PAKKET.scripts.test).not.toMatch(/--project[= ]rls\b/);
    expect(PAKKET.scripts.test.trim()).not.toBe('vitest run');
  });
});
