import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * De naad tussen "wat de claim weet" en "wat de claim doet" — QS8-449.
 *
 * ⚠️ **Waarom dit een integratietest is en geen unit-test.** `gelandVoor()` en
 *    `isGelandeVorm()` staan los getoetst in `tests/scripts/claim.test.ts`, elke
 *    vorm apart. Die tests blijven allemaal groen als iemand de aanroep uit
 *    `hoofd()` haalt — dan is er een functie die het juiste antwoord geeft aan
 *    niemand. Dat is CLAUDE.md regel 18 vraag 5: de keten die op wáárdeniveau
 *    doodloopt terwijl elk schakeltje af is.
 *
 * ⚠️ **En de schade zit niet in het antwoord maar in de volgorde.** De fout van
 *    13-09-2026 was niet dat de claim het verkeerde dacht — de sessie las
 *    daarna netjes de reacties en stopte. De schade was dat de branch er toen
 *    al stond, en een cloudsessie krijgt die niet meer weg (QS8-240). Deze test
 *    telt daarom de branches op de "remote" vóór en ná, en dát is de belofte:
 *    *een claim die tegengehouden wordt, laat niets achter.*
 *
 * ⚠️ **Er komt geen netwerk aan te pas.** De remote is een bare repo op schijf.
 *    Zelfde vorm en dezelfde reden als `tests/scripts/migratie-fetch.test.ts`:
 *    voed je het script je eigen object, dan is "klopt dat object" niet meer te
 *    stellen.
 *
 * IJKING — met de hand gedraaid op 13-09-2026, één mutatie per grendel:
 *
 *   A  de `gelandVoor()`-tak uit `hoofd()` halen        → 3 rood hier, 0 in claim.test
 *   B  `meldGeland()` melden maar niet `process.exit`   → 3 rood hier, 0 in claim.test
 *   C  `--vervolg` altijd waar laten zijn               → 3 rood hier, 0 in claim.test
 *   D  `isGelandeVorm()` altijd `true`                  → 2 rood hier, 8 in claim.test
 *
 * ⚠️ **A, B en C zijn in `claim.test.ts` alle drie onzichtbaar** — daar blijven
 *    alle 23 tests groen terwijl de claim precies de fout van 13-09 weer maakt.
 *    Dat is waarom dit bestand bestaat. Alleen D, die aan de regex zit, wordt
 *    daar wél gezien.
 *
 * ⚠️ **De getallen zijn gemeten en niet voorspeld.** Ik had er voor A, B en C
 *    één per stuk opgeschreven; het zijn er drie, omdat `--vervolg` zijn
 *    aantekening in de claim-commit verliest zodra `gelande` leeg blijft. Een
 *    ijking die zijn eigen verwachting overschrijft in plaats van zijn meting,
 *    is geen ijking — zie CLAUDE.md bij regel 18.
 */

const HULPSCRIPTS = ['claim.mjs', 'migratiebranches.mjs'];

let werkmap = '';
let afstand = '';
let kloon = '';

function git(cwd: string, ...argumenten: string[]) {
  return execFileSync('git', argumenten, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'IJking',
      GIT_AUTHOR_EMAIL: 'ijking@example.invalid',
      GIT_COMMITTER_NAME: 'IJking',
      GIT_COMMITTER_EMAIL: 'ijking@example.invalid',
      GIT_CONFIG_GLOBAL: join(tmpdir(), 'gb-geen-git-config'),
      GIT_CONFIG_SYSTEM: join(tmpdir(), 'gb-geen-git-config'),
    },
  });
}

/** `node claim.mjs …` met de kloon als wortel — het script leidt die zelf af. */
function claim(...argumenten: string[]): { uit: string; code: number } {
  try {
    const uit = execFileSync('node', [join(kloon, 'scripts', 'claim.mjs'), ...argumenten], {
      cwd: kloon,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { uit, code: 0 };
  } catch (fout) {
    const f = fout as { stdout?: string; stderr?: string; status?: number };
    return { uit: `${f.stdout ?? ''}${f.stderr ?? ''}`, code: f.status ?? 1 };
  }
}

/** Hoeveel branches de "remote" draagt — de meter voor de schade. */
function branchesOpAfstand(): string[] {
  return git(kloon, 'ls-remote', '--heads', 'origin')
    .split('\n')
    .map((r) => r.split('refs/heads/')[1])
    .filter((n): n is string => typeof n === 'string' && n !== '');
}

beforeAll(() => {
  werkmap = mkdtempSync(join(tmpdir(), 'gb-claim-'));
  afstand = join(werkmap, 'afstand.git');
  kloon = join(werkmap, 'kloon');

  const bron = join(werkmap, 'bron');
  mkdirSync(bron);
  git(bron, 'init', '-q', '-b', 'main');
  git(bron, 'commit', '-q', '--allow-empty', '-m', 'Eerste commit');

  // ⚠️ De twee vormen waarin werk op main belandt, en één die dat níet is.
  git(bron, 'commit', '-q', '--allow-empty', '-m', 'Merge pull request #900 — iets moois (QS8-777)');
  git(bron, 'commit', '-q', '--allow-empty', '-m', 'Nog iets moois (QS8-779) (#901)');
  git(bron, 'commit', '-q', '--allow-empty', '-m', 'main erin gehaald om QS8-778 te kunnen landen');

  git(bron, 'clone', '-q', '--bare', bron, afstand);
  git(werkmap, 'clone', '-q', afstand, kloon);
  git(kloon, 'config', 'user.name', 'IJking');
  git(kloon, 'config', 'user.email', 'ijking@example.invalid');

  mkdirSync(join(kloon, 'scripts'), { recursive: true });
  for (const naam of HULPSCRIPTS) {
    cpSync(join(process.cwd(), 'scripts', naam), join(kloon, 'scripts', naam));
  }
});

afterAll(() => {
  if (werkmap !== '') rmSync(werkmap, { recursive: true, force: true });
});

describe('een claim op een issue waarvoor al werk geland is', () => {
  it('wordt tegengehouden en laat niets op de remote achter', () => {
    const voor = branchesOpAfstand();
    const { uit, code } = claim('quintenstrijdonk/qs8-777-iets-moois');

    expect(code).toBe(1);
    expect(uit).toContain('al werk voor QS8-777 op main geland');
    expect(uit).toContain('Merge pull request #900');
    // ⚠️ **Dit is de belofte.** De melding is het onderdeel; dat er niets
    //    achterblijft is het geheel — en dat was op 13-09 de schade.
    expect(branchesOpAfstand()).toEqual(voor);
  });

  it('vindt ook een squash-landing', () => {
    const { uit, code } = claim('quintenstrijdonk/qs8-779-nog-iets');
    expect(code).toBe(1);
    expect(uit).toContain('al werk voor QS8-779 op main geland');
  });

  it('gaat wél door met --vervolg, en zet dat in de claim-commit', () => {
    const { code } = claim('quintenstrijdonk/qs8-777-een-echt-vervolg', '--vervolg');
    expect(code).toBe(0);
    expect(branchesOpAfstand()).toContain('quintenstrijdonk/qs8-777-een-echt-vervolg');

    const bericht = git(kloon, 'log', '-1', '--format=%B');
    expect(bericht).toContain('Met --vervolg gezet');
  });
});

describe('wat de claim met rúst moet laten', () => {
  /**
   * ⚠️ De andere helft. Slaat deze melding aan op een issue waar niets voor
   *    geland is, dan is `--vervolg` binnen een week een gewoonte — en dan is
   *    de grendel weg zonder dat iemand hem heeft weggehaald.
   */
  it('een issue dat alleen in een merge-van-main voorkomt, is gewoon vrij', () => {
    const { uit, code } = claim('quintenstrijdonk/qs8-778-nog-niet-gebouwd');
    expect(code).toBe(0);
    expect(uit).toContain('QS8-778 bezet');
    expect(branchesOpAfstand()).toContain('quintenstrijdonk/qs8-778-nog-niet-gebouwd');
  });

  it('een branch die er nog staat weigert nog steeds hard, en op de oude tekst', () => {
    // ⚠️ QS8-778 is hierboven geclaimd. De bezettingsmelding hoort te winnen
    //    van de landingsmelding: die zegt "hier zit iemand nú".
    const { uit, code } = claim('QS8-778');
    expect(code).toBe(1);
    expect(uit).toContain('QS8-778 is al bezet');
  });
});
