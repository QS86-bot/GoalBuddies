import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

/**
 * QS8-703, acceptatiecriterium 4 — **de naad van het incident, in vitest zelf.**
 *
 * ⚠️ **Waarom een kindproces met vitest en niet met kaal `node`.** De 1.865
 *    testaccounts op productie (QS8-700) ontstonden via deze keten: vitest laadt
 *    `src/lib/test-env.ts` als `setupFiles`, die laadt `.env`, en daarna laadt
 *    een testbestand de harness. `tests/beloftes/rls-doel-raakt-productie-niet-vanzelf.test.ts`
 *    draait kaal `node` en omzeilt precies die eerste schakel. Hier start de
 *    echte vitest met de echte config, en het enige dat verschilt is wélke
 *    `.env`: via `GOALBUDDIES_DOTENV` een tijdelijk bestand, want een test mag de
 *    `.env` van deze machine nooit aanraken.
 *
 * ⚠️ **Alles is nep en niets kan verbinden.** De adressen eindigen op
 *    `.invalid`, de sleutels betekenen niets, en de kale omgeving draagt geen
 *    sleutel van de ouder mee. Ook met een kapotte grendel gaat er niets naar
 *    het echte project.
 *
 * ⚠️ Traag naar unit-maatstaf (een vitest-start per geval), en dat is de prijs
 *    van de naad: een toets op het onderdeel is gratis en bewijst hem niet.
 */

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));
const VITEST = join(WORTEL, 'node_modules', 'vitest', 'vitest.mjs');
// Twee kleine RLS-bestanden: één laadt de harness (REST), één vraagt psql via
// `stackBeschikbaarOfFaal()` — in de worker, ná `setupFiles` en dus ná `.env`.
// `tests/rls/globaal.ts` draait in het hoofdproces en ziet `.env` niet.
const MET_HARNESS = 'tests/rls/aikosten.test.ts';
const MET_PSQL = 'tests/rls/pushredenen.test.ts';

const NEP_PRODUCTIE = [
  'EXPO_PUBLIC_SUPABASE_URL=https://wehgocadxehottiiyvsc.supabase.invalid',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY=nep-anon-key',
  'SUPABASE_SERVICE_ROLE_KEY=nep-service-role-key',
  'SUPABASE_JWT_SECRET=nep-jwt-secret',
];

const OS_SLEUTELS = ['PATH', 'Path', 'SystemRoot', 'windir', 'TEMP', 'TMP', 'PATHEXT', 'HOME', 'USERPROFILE'];
const map = mkdtempSync(join(tmpdir(), 'goalbuddies-dotenv-'));

afterAll(() => rmSync(map, { recursive: true, force: true }));

function kaleOmgeving(extra: Record<string, string>): NodeJS.ProcessEnv {
  const os = Object.fromEntries(
    Object.entries(process.env).filter(
      (paar): paar is [string, string] => OS_SLEUTELS.includes(paar[0]) && paar[1] !== undefined,
    ),
  );
  return { ...os, NODE_ENV: 'test', CI: '1', ...extra };
}

/** Start vitest op één RLS-bestand met deze `.env`; geeft exitcode en uitvoer. */
function draai(naam: string, regels: string[], proces: Record<string, string> = {}, bestand = MET_HARNESS) {
  const pad = join(map, `${naam}.env`);
  writeFileSync(pad, `${regels.join('\n')}\n`);
  const r = spawnSync(process.execPath, [VITEST, 'run', '--project', 'rls', bestand], {
    cwd: WORTEL,
    env: kaleOmgeving({ GOALBUDDIES_DOTENV: pad, ...proces }),
    encoding: 'utf8',
    timeout: 90_000,
  });
  return { code: r.status, uit: `${r.stdout}\n${r.stderr}` };
}

describe('QS8-703 — vitest met een echte .env opent het productieslot niet', () => {
  it('productiesleutels in .env, geen RLS_DOEL: het laden van de harness faalt, exit 1', () => {
    const r = draai('geen-doel', NEP_PRODUCTIE);
    expect(r.uit).toMatch(/RLS_DOEL is niet gezet/);
    expect(r.code).toBe(1);
  }, 120_000);

  it('het slot in .env (RLS_DOEL=productie, RLS_TEST_ALLOW_PROD=1): de setup weigert, exit 1', () => {
    const r = draai('slot', [...NEP_PRODUCTIE, 'RLS_DOEL=productie', 'RLS_TEST_ALLOW_PROD=1']);
    expect(r.uit).toMatch(/\.env zet het productieslot van de RLS-suite/);
    expect(r.code).toBe(1);
  }, 120_000);

  it('PGHOST in .env naar de pooler, RLS_DOEL=lokaal per run: psql wordt geweigerd, exit 1', () => {
    const r = draai(
      'pghost',
      ['PGHOST=aws-0-eu-west-3.pooler.supabase.invalid', 'PGUSER=postgres.wehgocadxehottiiyvsc'],
      { RLS_DOEL: 'lokaal' },
      MET_PSQL,
    );
    expect(r.uit).toMatch(/weigert psql naar de host "aws-0-eu-west-3\.pooler\.supabase\.invalid"/);
    // ⚠️ En niet onder de kop "geen database": de weigering kwam eerst alleen
    //    achter "psql zei:" terug, met de verkeerde oorzaak erboven — de klasse
    //    van QS8-268. 📏 Zo geijkt: zonder deze regel bleef die mutatie groen.
    expect(r.uit).not.toMatch(/geen database op/);
    expect(r.code).toBe(1);
  }, 120_000);
});
