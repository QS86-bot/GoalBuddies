/**
 * De ijking van `foutsleutel-controle` — QS8-330.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken** (CLAUDE.md bij
 *    regel 18). Daarom biedt dit bestand hem elke vorm los aan: de vormen die hij
 *    moet vinden én de vormen die hij met rust moet laten. Die tweede helft is
 *    even belangrijk — een controle die alles meldt, leer je uit te zetten.
 *
 * ⚠️ **Twee grendels, dus twee families van gevallen.** De controle bewaakt (1)
 *    dat geen aanroeper een eigen codesleutel verzint en (2) dat geen codesleutel
 *    op `ALLOWED_KEYS` zonder vormtoets staat. Een mutatie op de één mag niet
 *    door de ánder afgevangen worden, anders bewijst de ijking niets over de
 *    grendel die hij noemt.
 */
import { describe, expect, it } from 'vitest';

import {
  allowlist,
  beoordeel,
  CODEACHTIG,
  CODESLEUTEL,
  contextsleutels,
  GEEN_FOUTCODE,
  heeftVormtoets,
} from '../../scripts/foutsleutel-controle.mjs';

/** Een `scrub.ts` in het klein: een allowlist en de takken met een vormtoets. */
function scrubBron({
  sleutels,
  getoetst = ['sqlstate', 'code'],
}: {
  sleutels: string[];
  getoetst?: string[];
}): string {
  return [
    `const ALLOWED_KEYS: ReadonlySet<string> = new Set([`,
    ...sleutels.map((s) => `  '${s}',`),
    `]);`,
    ...getoetst.map((s) => `    if (key === '${s}') { out[key] = toets(value); }`),
  ].join('\n');
}

const GEZOND = scrubBron({ sleutels: ['where', 'name', 'status', 'table'] });

function bestand(bron: string) {
  return [{ pad: 'src/modules/x/api.ts', bron }];
}

describe('foutsleutel-controle', () => {
  describe('de vormen die hij moet vinden', () => {
    it.each([
      ['pgcode — de sleutel die dit issue opleverde', 'pgcode'],
      ['errcode', 'errcode'],
      ['error_code', 'error_code'],
      ['sqlcode', 'sqlcode'],
      ['errorCode', 'errorCode'],
      ['pg_state', 'pg_state'],
    ])('meldt een aanroeper die %s meegeeft', (_naam, sleutel) => {
      const bevindingen = beoordeel({
        bestanden: bestand(`reportError(error, 'x.y', { goal_id: id, ${sleutel}: error.code });`),
        scrub: GEZOND,
      });
      expect(bevindingen).toHaveLength(1);
      expect(bevindingen[0]).toContain(sleutel);
    });

    it('meldt een codesleutel op de allowlist zonder vormtoets', () => {
      const bevindingen = beoordeel({
        bestanden: [],
        scrub: scrubBron({ sleutels: ['where', 'code'], getoetst: ['sqlstate'] }),
      });
      expect(bevindingen).toHaveLength(1);
      expect(bevindingen[0]).toContain('ALLOWED_KEYS');
      expect(bevindingen[0]).toContain('code');
    });

    it('meldt het als ALLOWED_KEYS zelf niet meer te vinden is', () => {
      const bevindingen = beoordeel({ bestanden: [], scrub: 'const IETS_ANDERS = [];' });
      expect(bevindingen).toHaveLength(1);
      expect(bevindingen[0]).toContain('ALLOWED_KEYS');
    });

    it('vindt de sleutel ook in een meerregelig context-object', () => {
      const bevindingen = beoordeel({
        bestanden: bestand(
          ['reportError(error, {', "  where: 'x',", '  pgcode: error.code,', '});'].join('\n'),
        ),
        scrub: GEZOND,
      });
      expect(bevindingen).toHaveLength(1);
    });
  });

  describe('de vormen die hij met rust moet laten', () => {
    it('laat sqlstate staan — dat is de sleutel mét vormtoets', () => {
      expect(
        beoordeel({
          bestanden: bestand(`reportError(error, 'x.y', { ${CODESLEUTEL}: error.code });`),
          scrub: GEZOND,
        }),
      ).toEqual([]);
    });

    it('laat `code` staan zolang hij een eigen vormtoets heeft', () => {
      expect(
        beoordeel({
          bestanden: bestand(`reportError(error, 'x.y', { code: error.code });`),
          scrub: GEZOND,
        }),
      ).toEqual([]);
    });

    it('laat gewone contextsleutels staan', () => {
      expect(
        beoordeel({
          bestanden: bestand(
            `reportError(error, 'x.y', { goal_id: id, group_id: g, count: 3, table: 'goals' });`,
          ),
          scrub: GEZOND,
        }),
      ).toEqual([]);
    });

    it('laat de vastgelegde uitzonderingen staan, mét hun reden', () => {
      for (const [sleutel, reden] of Object.entries(GEEN_FOUTCODE)) {
        expect(reden).toMatch(/\S/);
        expect(
          beoordeel({
            bestanden: bestand(`reportError(error, 'x.y', { ${sleutel}: 404 });`),
            scrub: scrubBron({ sleutels: ['where', sleutel] }),
          }),
        ).toEqual([]);
      }
    });

    it('kijkt niet naar een codesleutel buiten een reportError-aanroep', () => {
      expect(
        beoordeel({
          bestanden: bestand('const pgcode = fout.code;\nlogger.debug({ pgcode });'),
          scrub: GEZOND,
        }),
      ).toEqual([]);
    });

    it('laat een aanroep zonder derde argument met rust', () => {
      expect(
        beoordeel({ bestanden: bestand(`reportError(error, 'x.y');`), scrub: GEZOND }),
      ).toEqual([]);
    });
  });

  describe('de onderdelen los', () => {
    it('contextsleutels leest alleen het context-object', () => {
      const sleutels = contextsleutels(
        `reportError(error, 'groups.mine', { group_id: g, pgcode: error.code });`,
      ).map((s) => s.sleutel);
      expect(sleutels).toEqual(['group_id', 'pgcode']);
    });

    it('contextsleutels stopt bij het juiste sluithaakje', () => {
      const sleutels = contextsleutels(
        `reportError(error, 'x', { n: telOp(1, 2) });\nconst weg = { pgcode: 1 };`,
      ).map((s) => s.sleutel);
      expect(sleutels).toEqual(['n']);
    });

    it('allowlist leest de sleutels uit de Set', () => {
      expect(allowlist(scrubBron({ sleutels: ['where', 'name'] }))).toEqual(['where', 'name']);
    });

    it('allowlist geeft null als de vorm veranderd is', () => {
      expect(allowlist('const ALLOWED_KEYS = someOtherShape();')).toBeNull();
    });

    it('heeftVormtoets ziet de tak in scrubContext', () => {
      expect(heeftVormtoets(GEZOND, 'sqlstate')).toBe(true);
      expect(heeftVormtoets(GEZOND, 'pgcode')).toBe(false);
    });

    it('CODEACHTIG dekt de verzinsels en niet de gewone sleutels', () => {
      for (const wel of ['pgcode', 'errcode', 'sqlstate', 'error_code', 'errorCode']) {
        expect(CODEACHTIG.test(wel)).toBe(true);
      }
      for (const niet of ['group_id', 'count', 'table', 'where', 'durationMs', 'name']) {
        expect(CODEACHTIG.test(niet)).toBe(false);
      }
    });
  });
});
