import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  controleer,
  draagtPatroon,
  OPEN,
  UITGEZONDERD,
} from '../../scripts/netwerkexit-controle.mjs';

/**
 * `netwerkexit:controle` — QS8-704. Elke vorm los aangeboden: wat hij moet
 * vinden én wat hij met rust moet laten (CLAUDE.md, regel 18: een controle die
 * je niet kunt voeden, kun je niet ijken).
 */

const MET_FETCH = 'const r = await fetch(url);\n';

describe('draagtPatroon — de vormen die hij moet vinden', () => {
  it.each([
    ['process.exit(1)', 'process.exit(1);'],
    ['een spatie voor de haak', 'process.exit (1);'],
    ['een spatie rond de punt', 'process . exit(1);'],
    ["process['exit']", "process['exit'](1);"],
    ['process["exit"]', 'process["exit"](1);'],
    ['process[`exit`]', 'process[`exit`](1);'],
    ['de exit vóór de fetch in de tekst', 'process.exit(1);'],
    ['als referentie in .then', 'main().then(process.exit);'],
    ['optionele keten', 'process?.exit(1);'],
    ['via .call', 'process.exit.call(null, 1);'],
  ])('%s', (_naam, exit) => {
    expect(draagtPatroon(MET_FETCH + exit)).toBe(true);
    expect(draagtPatroon(exit + '\n' + MET_FETCH)).toBe(true);
  });

  it('een fetch zonder await, globalThis.fetch en fetch?.() tellen ook', () => {
    expect(draagtPatroon('fetch(url).then(() => process.exit(0));')).toBe(true);
    expect(draagtPatroon('await globalThis.fetch(url);\nprocess.exit(1);')).toBe(true);
    expect(draagtPatroon('await fetch?.(url);\nprocess.exit(1);')).toBe(true);
  });

  it('ziet code achter een string met /** erin', () => {
    // De `*/` verderop is nodig: zonder die sluiting snijdt ook een knip zonder
    // anker niets weg, en dan bewijst deze toets niets (📏 zo geijkt).
    const bron = 'const a = [`${app}/**`];\nawait fetch(a);\nprocess.exit(1);\n/** later commentaar */\n';
    expect(draagtPatroon(bron)).toBe(true);
  });
});

describe('draagtPatroon — wat hij met rust laat', () => {
  it.each([
    ['alleen fetch', MET_FETCH + 'process.exitCode = 1;'],
    ['alleen process.exit', 'process.exit(1);'],
    ['exit alleen in een blokcommentaar', MET_FETCH + '/**\n * process.exit(1) hier niet\n */\n'],
    ['exit alleen in een regelcommentaar', MET_FETCH + '// process.exit(1)\n'],
    ['fetch alleen in commentaar', '// await fetch(url)\nprocess.exit(1);\n'],
    ['een woord dat op fetch eindigt', 'await prefetch(url);\nprocess.exit(1);\n'],
    ['exitCode is geen exit', MET_FETCH + 'process.exitCode = 2;\n'],
  ])('%s', (_naam, bron) => {
    expect(draagtPatroon(bron)).toBe(false);
  });
});

describe('controleer — de registers en de ratel', () => {
  const drager = { naam: 'a.mjs', bron: MET_FETCH + 'process.exit(1);' };
  const rij = (exits: number, fetches: number) => ({ exits, fetches, reden: 'gelezen' });
  const schoon = { naam: 'b.mjs', bron: MET_FETCH + 'process.exitCode = 1;' };

  it('een drager buiten beide registers is rood', () => {
    const { klachten } = controleer([drager, schoon], { open: {}, uitgezonderd: {} });
    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toMatch(/^a\.mjs /);
  });

  it('een drager in OPEN wordt gemeld en is niet rood', () => {
    const r = controleer([drager], { open: { 'a.mjs': 'reden' }, uitgezonderd: {} });
    expect(r.klachten).toEqual([]);
    expect(r.open).toEqual(['a.mjs']);
  });

  it('een drager in UITGEZONDERD is niet rood en niet open', () => {
    const r = controleer([drager], { open: {}, uitgezonderd: { 'a.mjs': rij(1, 1) } });
    expect(r).toEqual({ klachten: [], open: [] });
  });

  it('een exit erbij in een uitgezonderd script is rood (de uitzondering geldt het gelezen aantal)', () => {
    const meer = { naam: 'a.mjs', bron: drager.bron + '\nawait fetch(b);\nprocess.exit(2);' };
    const { klachten } = controleer([meer], { open: {}, uitgezonderd: { 'a.mjs': rij(1, 1) } });
    expect(klachten).toEqual([expect.stringMatching(/UITGEZONDERD a\.mjs: gelezen bij 1 exit.*nu 2 en 2/)]);
  });

  it.each([
    ['destructuring', 'const { exit } = process;\nexit(1);'],
    ['een alias', 'const p = process;\np.exit(1);'],
  ])('%s van process is rood, ook zonder fetch', (_naam, bron) => {
    const { klachten } = controleer([{ naam: 'c.mjs', bron }], { open: {}, uitgezonderd: {} });
    expect(klachten).toEqual([expect.stringMatching(/^c\.mjs haalt exit uit het process-object/)]);
  });

  it('een registerrij voor een script zonder het patroon is rood (de ratel slaat terug)', () => {
    const { klachten } = controleer([schoon], { open: { 'b.mjs': 'r' }, uitgezonderd: {} });
    expect(klachten).toEqual([expect.stringMatching(/OPEN noemt b\.mjs.*niet meer/)]);
  });

  it('een registerrij voor een script dat niet bestaat is rood', () => {
    const { klachten } = controleer([], { open: {}, uitgezonderd: { 'weg.mjs': rij(1, 1) } });
    expect(klachten).toEqual([expect.stringMatching(/UITGEZONDERD noemt weg\.mjs.*bestaat niet/)]);
  });
});

describe('de echte boom (QS8-704, acceptatiecriterium 1)', () => {
  const scripts = readdirSync('scripts')
    .filter((naam) => /\.(?:mjs|js|cjs)$/.test(naam))
    .map((naam) => ({ naam, bron: readFileSync(`scripts/${naam}`, 'utf8') }));

  it('meldt precies de acht open scripts, en niets is rood', () => {
    const r = controleer(scripts);
    expect(r.klachten).toEqual([]);
    expect(r.open).toEqual([
      'edge-gedeployd.mjs',
      'functies-controle.mjs',
      'migratie-hernummer.mjs',
      'migratieregister-controle.mjs',
      'migratieregister-uitlijnen.mjs',
      'rls-dekking.mjs',
      'sentry-proef.mjs',
      'uurjobs-controle.mjs',
    ]);
  });

  it('elke registerrij draagt een reden, en een uitzondering het gelezen aantal', () => {
    // ⚠️ Een lengte toetst de reden niet; het aantal wel — dat bewaakt hierboven
    //    de toets "een exit erbij in een uitgezonderd script is rood".
    const redenen = [...Object.values(OPEN), ...Object.values(UITGEZONDERD).map((r) => r.reden)];
    for (const reden of redenen) expect(reden.trim().length).toBeGreaterThan(10);
    for (const r of Object.values(UITGEZONDERD)) {
      expect(r.exits).toBeGreaterThan(0);
      expect(r.fetches).toBeGreaterThan(0);
    }
  });

  it('de vier scripts van QS8-684 dragen het patroon niet', () => {
    for (const naam of ['realtime-identiteit-controle', 'wachtwoord-controle', 'adviseur-controle', 'auth-urls']) {
      const bron = readFileSync(`scripts/${naam}.mjs`, 'utf8');
      expect(draagtPatroon(bron), naam).toBe(false);
    }
  });
});
