import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  controleer,
  hoofd,
  naamUitPad,
  oplossen,
  productieRegels,
} from '../../scripts/lockfile-controle.mjs';

/**
 * `npm run lockfile:controle` — QS8-679.
 *
 * ⚠️ **De belofte is niet "elke regel heeft een veld" maar "een lock die `npm audit`
 *    misleidt, wordt rood".** 📏 Drie vervalsingen zijn met echte npm-locks nagemaakt
 *    (npm 10.9.9) en gaven telkens nul advisories terwijl `npm ci` slaagde; elke staat
 *    hieronder als eigen geval. De vormen die hij met rust moet laten staan er even
 *    zwaar bij: een controle die alles meldt, leer je negeren.
 */

type Regel = Record<string, unknown>;
type Lock = { packages: Record<string, Regel> };

const tarball = (naam: string, versie: string) =>
  `https://registry.npmjs.org/${naam}/-/${naam.slice(naam.lastIndexOf('/') + 1)}-${versie}.tgz`;

const regel = (naam: string, versie: string, extra: Regel = {}): Regel => ({
  version: versie,
  resolved: tarball(naam, versie),
  integrity: 'sha512-AAAA',
  ...extra,
});

/** Een kleine, geldige lock: `a` (prod) → `b` (prod, genest `c`), plus `eslint` (dev) → `ouder`. */
function geldig(): Lock {
  return {
    packages: {
      '': {
        name: 'proef',
        dependencies: { a: '^1.0.0', '@sc/b': '^2.0.0' },
        devDependencies: { eslint: '^9.0.0' },
      },
      'node_modules/a': regel('a', '1.0.0', { dependencies: { c: '^3.0.0' } }),
      'node_modules/@sc/b': regel('@sc/b', '2.0.0'),
      'node_modules/c': regel('c', '3.0.0'),
      'node_modules/eslint': regel('eslint', '9.0.0', { dev: true, dependencies: { ouder: '^1' } }),
      'node_modules/ouder': regel('ouder', '1.0.0', { dev: true }),
    },
  };
}

const klachten = (lock: Lock) => controleer(lock).klachten;

describe('een geldige lock', () => {
  it('is groen, ook met een scoped pakket en een dev-keten', () => {
    expect(klachten(geldig())).toEqual([]);
  });

  it('laat een alias met `name` door', () => {
    const lock = geldig();
    lock.packages['node_modules/wacht'] = regel('lodash', '4.17.21', { name: 'lodash' });
    (lock.packages[''] as Regel).dependencies = { a: '^1', wacht: 'npm:lodash@4' };

    expect(klachten(lock)).toEqual([]);
  });

  it('laat een regel zonder register-tarball met rust en telt hem als overgeslagen', () => {
    const lock = geldig();
    lock.packages['node_modules/git'] = {
      version: '1.0.0',
      resolved: 'git+ssh://git@github.com/x/y.git#abc',
    };
    lock.packages['node_modules/bundel'] = { version: '1.0.0', inBundle: true };

    const uit = controleer(lock);

    expect(uit.klachten).toEqual([]);
    expect(uit.geteld.overgeslagen).toBe(1);
  });

  it('laat een dev-vlag op een regel die alleen via dev bereikbaar is met rust', () => {
    expect(klachten(geldig()).filter((k) => k.includes('dev: true'))).toEqual([]);
  });

  it('laat `devOptional` en een niet-geïnstalleerde optionele afhankelijkheid met rust', () => {
    const lock = geldig();
    lock.packages['node_modules/a'] = regel('a', '1.0.0', {
      optionalDependencies: { afwezig: '^1' },
      dependencies: { c: '^3.0.0' },
    });
    lock.packages['node_modules/c'] = regel('c', '3.0.0', { devOptional: true });

    expect(klachten(lock)).toEqual([]);
  });
});

describe('vervalsing 1 — de versie hoort niet bij het tarball', () => {
  it('is rood als `version` iets anders zegt dan `resolved`', () => {
    const lock = geldig();
    lock.packages['node_modules/c'] = regel('c', '3.0.0', { version: '3.1.0' });

    expect(klachten(lock)).toEqual([
      expect.stringContaining("node_modules/c: version '3.1.0' hoort niet bij"),
    ]);
  });

  it('is rood bij een scoped pakket met een afwijkende versie', () => {
    const lock = geldig();
    lock.packages['node_modules/@sc/b'] = regel('@sc/b', '2.0.0', { version: '2.0.1' });

    expect(klachten(lock)).toHaveLength(1);
  });
});

describe('vervalsing 2 — een alias zonder naam', () => {
  it('is rood als het tarball van een ander pakket is dan het pad zegt, zonder `name`', () => {
    const lock = geldig();
    lock.packages['node_modules/wacht'] = regel('lodash', '4.17.20');

    expect(klachten(lock)).toEqual([expect.stringContaining('alias zonder naam')]);
  });

  it('is rood als `name` iets anders zegt dan het tarball', () => {
    const lock = geldig();
    lock.packages['node_modules/wacht'] = regel('lodash', '4.17.20', { name: 'anders' });

    expect(klachten(lock)).toEqual([expect.stringContaining("`name` is 'anders'")]);
  });
});

describe('vervalsing 3 — dev: true op een productieregel', () => {
  it('is rood op een regel die vanuit dependencies bereikbaar is', () => {
    const lock = geldig();
    lock.packages['node_modules/c'] = regel('c', '3.0.0', { dev: true });

    expect(klachten(lock)).toEqual([expect.stringContaining('node_modules/c: staat op `dev: true`')]);
  });

  it('is rood op een regel die via een genest pad bereikbaar is', () => {
    const lock = geldig();
    lock.packages['node_modules/a'] = regel('a', '1.0.0', { dependencies: { c: '^9' } });
    lock.packages['node_modules/a/node_modules/c'] = regel('c', '9.0.0', { dev: true });

    expect(klachten(lock).join('\n')).toContain('node_modules/a/node_modules/c');
  });

  it.each(['optionalDependencies', 'peerDependencies'])(
    'volgt de kant %s ook: een dev-vlag erachter is rood',
    (kant) => {
      const lock = geldig();
      lock.packages['node_modules/a'] = regel('a', '1.0.0', { [kant]: { d: '^4.0.0' } });
      lock.packages['node_modules/d'] = regel('d', '4.0.0', { dev: true });

      expect(klachten(lock).join('\n')).toContain('node_modules/d: staat op `dev: true`');
    },
  );

  it('volgt een link naar zijn bestemming', () => {
    const lock = geldig();
    lock.packages['node_modules/ws'] = { resolved: 'packages/ws', link: true };
    lock.packages['packages/ws'] = { version: '1.0.0', dependencies: { c: '^3' } };
    (lock.packages[''] as Regel).dependencies = { ws: '*' };
    lock.packages['node_modules/c'] = regel('c', '3.0.0', { dev: true });

    expect(klachten(lock).join('\n')).toContain('node_modules/c');
  });
});

describe('integrity', () => {
  it('is rood als een registerregel geen integrity draagt', () => {
    const lock = geldig();
    delete (lock.packages['node_modules/c'] as Regel).integrity;

    expect(klachten(lock)).toEqual([expect.stringContaining('geen bruikbare `integrity`')]);
  });
});

describe('bouwstenen', () => {
  it('leest de naam uit een genest en een scoped pad', () => {
    expect(naamUitPad('node_modules/a/node_modules/@sc/b')).toBe('@sc/b');
    expect(naamUitPad('')).toBeNull();
  });

  it('zoekt een afhankelijkheid zoals Node dat doet, van diep naar ondiep', () => {
    const pakketten = {
      'node_modules/x': {},
      'node_modules/a/node_modules/x': {},
      'node_modules/a': {},
      'node_modules/a/node_modules/b': {},
    };

    expect(oplossen(pakketten, 'node_modules/a/node_modules/b', 'x')).toBe('node_modules/a/node_modules/x');
    expect(oplossen(pakketten, 'node_modules/a', 'x')).toBe('node_modules/a/node_modules/x');
    expect(oplossen(pakketten, 'node_modules/y', 'x')).toBe('node_modules/x');
    expect(oplossen(pakketten, '', 'nergens')).toBeNull();
  });

  it('telt de productieregels zonder de dev-keten', () => {
    const uit = productieRegels(geldig().packages);

    expect([...uit].sort()).toEqual(['', 'node_modules/@sc/b', 'node_modules/a', 'node_modules/c']);
  });
});

describe('hoofd', () => {
  function draai(lees: () => unknown) {
    const fout: string[] = [];
    const uit: string[] = [];
    const [echtFout, echtUit] = [console.error, console.log];
    console.error = (...a: unknown[]) => fout.push(a.map(String).join(' '));
    console.log = (...a: unknown[]) => uit.push(a.map(String).join(' '));
    try {
      return { code: hoofd(lees as never), fout: fout.join('\n'), uit: uit.join('\n') };
    } finally {
      [console.error, console.log] = [echtFout, echtUit];
    }
  }

  it('is groen en zegt hoeveel regels hij toetste', () => {
    const uit = draai(() => geldig());

    expect(uit.code).toBe(0);
    expect(uit.uit).toContain('5 registerregels');
  });

  it('is rood en noemt de regel bij een vervalsing', () => {
    const lock = geldig();
    lock.packages['node_modules/c'] = regel('c', '3.0.0', { version: '3.1.0' });

    const uit = draai(() => lock);

    expect(uit.code).toBe(1);
    expect(uit.fout).toContain('node_modules/c');
    expect(uit.fout).toContain('npm install --package-lock-only');
  });

  it('is rood en niet groen als de lock niet te lezen is', () => {
    const uit = draai(() => {
      throw new Error('ENOENT');
    });

    expect(uit.code).toBe(1);
    expect(uit.fout).toContain('niet te lezen');
  });

  it('is rood op een lock zonder `packages` (lockfileVersion 1)', () => {
    const uit = draai(() => ({ lockfileVersion: 1, dependencies: {} }));

    expect(uit.code).toBe(1);
    expect(uit.fout).toContain('geen `packages`');
  });
});

describe('de echte package-lock.json', () => {
  const echt = () =>
    JSON.parse(readFileSync(join(__dirname, '..', '..', 'package-lock.json'), 'utf8')) as Lock;

  it('is groen', () => {
    expect(klachten(echt())).toEqual([]);
  });

  // ⚠️ De naad: de vervalsingen hieronder staan op de échte lock en niet op een
  //    zelfgebouwde. Dat een nagemaakt geval rood wordt, bewijst niet dat deze lock
  //    vervalst kan worden zonder dat het script het ziet.
  it('wordt rood als een echt productiepakket een andere versie krijgt', () => {
    const lock = echt();
    const pad = Object.keys(lock.packages).find(
      (p) => p.startsWith('node_modules/') && typeof lock.packages[p]?.resolved === 'string' && !lock.packages[p]?.dev,
    ) as string;
    lock.packages[pad] = { ...(lock.packages[pad] as Regel), version: '0.0.0-vervalst' };

    expect(klachten(lock).join('\n')).toContain(pad);
  });

  it('wordt rood als een echt productiepakket `dev: true` krijgt', () => {
    const lock = echt();
    const prod = [...productieRegels(lock.packages)].find((p) => p !== '' && p.startsWith('node_modules/')) as string;
    lock.packages[prod] = { ...(lock.packages[prod] as Regel), dev: true };

    expect(klachten(lock).join('\n')).toContain(`${prod}: staat op`);
  });
});
