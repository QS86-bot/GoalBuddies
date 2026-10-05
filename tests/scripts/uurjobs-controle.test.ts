import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BEWAKER,
  GETOLEREERDE_VERTRAGING_UUR,
  beoordeelRuns,
  hoofd,
  regelVoor,
  uurjobsUit,
} from '../../scripts/uurjobs-controle.mjs';

/**
 * `npm run uurjobs:controle` — QS8-637.
 *
 * ⚠️ **De belofte is niet "de runlijst is netjes ontleed".** De belofte is: *een
 *    uurjob die niet gelopen heeft, wordt rood — en een controle die niets kon
 *    meten zegt dat, in plaats van groen.* Daarom toetst het merendeel hieronder
 *    `hoofd()` met de echte workflows ernaast, niet de losse onderdelen: dat een
 *    run-ouderdom goed wordt uitgerekend bewijst niet dat de job die het aangaat
 *    ook in de lijst staat.
 */

const WORKFLOWS = join(__dirname, '..', '..', '.github', 'workflows');
const NU = Date.parse('2026-10-05T12:00:00Z');
const uurGeleden = (u: number) => new Date(NU - u * 3_600_000).toISOString();

function echteWorkflows(): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const naam of readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n))) {
    uit[naam] = readFileSync(join(WORKFLOWS, naam), 'utf8');
  }
  return uit;
}

describe('uurjobsUit', () => {
  it('vindt precies de twee uurjobs in de echte map', () => {
    expect(uurjobsUit(echteWorkflows())).toEqual(['notificaties.yml', 'rollover.yml']);
  });

  it('vindt een derde uurjob vanzelf, ook met dubbele aanhalingstekens', () => {
    const bestanden = { 'nieuw.yml': 'on:\n  schedule:\n    - cron: "5 * * * *"\n' };
    expect(uurjobsUit(bestanden)).toEqual(['nieuw.yml']);
  });

  it('laat een dagelijkse job en een workflow zonder schema met rust', () => {
    const bestanden = {
      'dagelijks.yml': "on:\n  schedule:\n    - cron: '0 3 * * *'\n",
      'ci.yml': 'on:\n  push:\n    branches: [main]\n',
    };
    expect(uurjobsUit(bestanden)).toEqual([]);
  });

  it('telt een cron die alleen in een commentaarregel staat niet mee', () => {
    const bestanden = {
      'koppen.yml': "# - cron: '0 * * * *'\non:\n  schedule:\n    - cron: '0 3 * * *'\n",
    };
    expect(uurjobsUit(bestanden)).toEqual([]);
  });

  it('vindt een uurjob met een commentaar achter de cron', () => {
    const bestanden = { 'a.yml': "on:\n  schedule:\n    - cron: '5 * * * *' # elk uur\n" };
    expect(uurjobsUit(bestanden)).toEqual(['a.yml']);
  });

  it('bewaakt de bewaker niet', () => {
    const bestanden = { [BEWAKER]: "on:\n  schedule:\n    - cron: '47 * * * *'\n" };
    expect(uurjobsUit(bestanden)).toEqual([]);
  });
});

describe('beoordeelRuns', () => {
  it('is ok bij een recente geslaagde run', () => {
    const b = beoordeelRuns([{ event: 'schedule', created_at: uurGeleden(3) }], NU);
    expect(b.oordeel).toBe('ok');
    expect(b.leeftijdUur).toBeCloseTo(3);
  });

  it('is te oud zodra de laatste run langer geleden is dan de getolereerde vertraging', () => {
    const b = beoordeelRuns([{ event: 'schedule', created_at: uurGeleden(13) }], NU);
    expect(b.oordeel).toBe('te-oud');
  });

  it('houdt de grens vast: precies de drempel is nog ok, een minuut erover niet', () => {
    const op = beoordeelRuns([{ event: 'schedule', created_at: uurGeleden(GETOLEREERDE_VERTRAGING_UUR) }], NU);
    const erover = beoordeelRuns(
      [{ event: 'schedule', created_at: uurGeleden(GETOLEREERDE_VERTRAGING_UUR + 1 / 60) }],
      NU,
    );
    expect(op.oordeel).toBe('ok');
    expect(erover.oordeel).toBe('te-oud');
  });

  it('geeft "geen" bij een lege lijst en verzint geen leeftijd', () => {
    expect(beoordeelRuns([], NU)).toEqual({ oordeel: 'geen', leeftijdUur: null });
  });

  it('kijkt naar de nieuwste run, ook als de lijst anders gesorteerd is', () => {
    const runs = [
      { event: 'schedule', created_at: uurGeleden(30) },
      { event: 'schedule', created_at: uurGeleden(2) },
      { event: 'schedule', created_at: uurGeleden(15) },
    ];
    expect(beoordeelRuns(runs, NU).leeftijdUur).toBeCloseTo(2);
  });

  it('telt een handmatige run als hartslag maar niet als gepland ritme', () => {
    const runs = [
      { event: 'workflow_dispatch', created_at: uurGeleden(1) },
      { event: 'schedule', created_at: uurGeleden(20) },
    ];
    const b = beoordeelRuns(runs, NU);
    expect(b.oordeel).toBe('ok');
    expect(b.gepland7d).toBe(1);
  });

  it('meet het grootste gat tussen geplande runs binnen zeven dagen', () => {
    const runs = [
      { event: 'schedule', created_at: uurGeleden(1) },
      { event: 'schedule', created_at: uurGeleden(4) },
      { event: 'schedule', created_at: uurGeleden(13) },
      { event: 'schedule', created_at: uurGeleden(24 * 8) },
    ];
    const b = beoordeelRuns(runs, NU);
    expect(b.gepland7d).toBe(3);
    expect(b.grootsteGatUur).toBeCloseTo(9);
  });
});

describe('regelVoor', () => {
  it('noemt de workflow, de leeftijd en de drempel bij een bevinding', () => {
    const b = beoordeelRuns([{ event: 'schedule', created_at: uurGeleden(20) }], NU);
    const regel = regelVoor('rollover.yml', b);
    expect(regel.startsWith('✗')).toBe(true);
    expect(regel).toContain('rollover.yml');
    expect(regel).toContain('20.0 u');
    expect(regel).toContain(`${GETOLEREERDE_VERTRAGING_UUR} u`);
  });

  it('zegt dat de job nooit gelopen heeft bij een lege lijst', () => {
    expect(regelVoor('x.yml', { oordeel: 'geen', leeftijdUur: null })).toContain('nooit gelopen');
  });
});

describe('hoofd — de uitslag voor de echte workflows', () => {
  let uit: string[];
  let fout: string[];

  beforeEach(() => {
    uit = [];
    fout = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void uit.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a) => void fout.push(a.join(' ')));
  });
  afterEach(() => vi.restoreAllMocks());

  const vers = async () => [{ event: 'schedule', created_at: uurGeleden(2) }];

  it('is groen als elke uurjob recent gelopen heeft', async () => {
    const code = await hoofd(echteWorkflows, vers, NU);
    expect(code).toBe(0);
    expect(uit.join('\n')).toContain('2 uurjob(s) hebben binnen');
    expect(fout).toEqual([]);
  });

  it('wordt rood als alleen de rollover uitblijft, en noemt die bij naam', async () => {
    const haal = async (naam: string) =>
      naam === 'rollover.yml' ? [{ event: 'schedule', created_at: uurGeleden(30) }] : vers();
    const code = await hoofd(echteWorkflows, haal, NU);
    expect(code).toBe(1);
    expect(fout.join('\n')).toContain('rollover.yml');
    expect(fout.join('\n')).not.toContain('notificaties.yml');
  });

  it('wordt rood als alleen notificaties uitblijft', async () => {
    const haal = async (naam: string) =>
      naam === 'notificaties.yml' ? [] : vers();
    const code = await hoofd(echteWorkflows, haal, NU);
    expect(code).toBe(1);
    expect(fout.join('\n')).toContain('notificaties.yml');
  });

  it('zegt OVERGESLAGEN en geen groen als de runlijst niet op te halen is', async () => {
    const haal = async () => {
      throw new Error('HTTP 403: API rate limit exceeded');
    };
    const code = await hoofd(echteWorkflows, haal, NU);
    expect(code).toBe(0);
    expect(fout.join('\n')).toContain('OVERGESLAGEN');
    expect(fout.join('\n')).toContain('rate limit');
    expect(uit.join('\n')).not.toContain('hebben binnen');
  });

  it('wordt rood als er geen enkele uurjob meer te vinden is', async () => {
    const code = await hoofd(() => ({ 'ci.yml': 'on:\n  push:\n' }), vers, NU);
    expect(code).toBe(1);
    expect(fout.join('\n')).toContain('geen enkele uurjob');
  });
});

describe('de bewaker zelf', () => {
  it('bestaat, vuurt elk uur en leest alleen actions en contents', () => {
    const tekst = echteWorkflows()[BEWAKER];
    expect(tekst).toBeDefined();
    expect(tekst).toMatch(/cron: '\d+ \* \* \* \*'/);
    expect(tekst).toMatch(/actions: read/);
    expect(tekst).toMatch(/node scripts\/uurjobs-controle\.mjs/);
    expect(tekst).not.toMatch(/secrets\.(?!GITHUB_TOKEN)/);
  });
});
