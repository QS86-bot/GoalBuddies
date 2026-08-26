import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leest de JSDoc ernaast. Zelfde
//    vorm als `migratieregister-plan.test.ts`, met opzet.
import {
  leesbaar,
  modulesInBundel,
  modulesVoor,
  vergelijk,
} from '../../scripts/edge-gedeployd.mjs';

/**
 * De controle die op 26-08-2026 ontbrak.
 *
 * ⚠️ **Wat er die dag misging.** Alle drie de Edge Functions waren gedeployd
 *    vanuit een lokale werkmap. De gedeployde `notificaties` importeerde
 *    `_shared/sentry/index.ts` — een module die op `main` niet bestond en op
 *    geen enkele remote branch stond. Er draaide productiecode die niemand kon
 *    uitchecken, en die de schoonmaaklaag miste waar QS8-24 criterium 3 om
 *    draait. Gevonden door de bundel met de hand op te vragen; niets werd rood.
 *
 * ⚠️ **De belangrijkste test hieronder is `vindt het geval van 26-08-2026`.**
 *    Dat is geen bedacht scenario maar de echte modulelijst van die deploy,
 *    naast de echte lijst van `main`. Een controle die dát niet vindt, bewaakt
 *    niets.
 *
 * ⚠️ **En de tweede helft is even belangrijk: de vormen die hij met rust moet
 *    laten.** Een controle die alles meldt, leer je binnen een week te negeren.
 *    Vandaar de gevallen met een `jsr:`-import, met een diamant en met een lus.
 */

/** Een `lees` die uit een gewoon object leest in plaats van van schijf. */
function uitMap(map: Readonly<Record<string, string>>): (pad: string) => string | null {
  return (pad) => map[pad] ?? null;
}

describe('modulesVoor — wat de repo in een functie zou stoppen', () => {
  it('volgt relatieve imports transitief', () => {
    const lees = uitMap({
      'functions/rollover/index.ts': "import { meld } from '../_shared/melden.ts';",
      'functions/_shared/melden.ts': "import { x } from './observability/edge-rapport.ts';",
      'functions/_shared/observability/edge-rapport.ts': "import { y } from './scrub.ts';",
      'functions/_shared/observability/scrub.ts': 'export const REDACTED = 1;',
    });

    expect(modulesVoor(lees, 'functions/rollover/index.ts')).toEqual([
      'functions/_shared/melden.ts',
      'functions/_shared/observability/edge-rapport.ts',
      'functions/_shared/observability/scrub.ts',
      'functions/rollover/index.ts',
    ]);
  });

  /**
   * ⚠️ `jsr:@supabase/supabase-js` komt uit het netwerk. De vraag die deze
   *    controle stelt is of ónze bestanden kloppen, niet of Deno zijn eigen
   *    cache goed vult.
   */
  it('laat kale specifiers met rust', () => {
    const lees = uitMap({
      'functions/doelcoach/index.ts': [
        "import { createClient } from 'jsr:@supabase/supabase-js@2';",
        "import { meld } from '../_shared/melden.ts';",
      ].join('\n'),
      'functions/_shared/melden.ts': 'export const meld = 1;',
    });

    expect(modulesVoor(lees, 'functions/doelcoach/index.ts')).toEqual([
      'functions/_shared/melden.ts',
      'functions/doelcoach/index.ts',
    ]);
  });

  it('telt een module die twee keer geïmporteerd wordt één keer', () => {
    const lees = uitMap({
      'functions/notificaties/index.ts': [
        "import { a } from '../_shared/melden.ts';",
        "import { b } from '../_shared/notificaties/regels.ts';",
      ].join('\n'),
      'functions/_shared/melden.ts': "import { c } from './observability/scrub.ts';",
      'functions/_shared/notificaties/regels.ts': "import { d } from '../observability/scrub.ts';",
      'functions/_shared/observability/scrub.ts': 'export const x = 1;',
    });

    const uit = modulesVoor(lees, 'functions/notificaties/index.ts');
    expect(uit.filter((p: string) => p === 'functions/_shared/observability/scrub.ts')).toHaveLength(
      1,
    );
    expect(uit).toHaveLength(4);
  });

  /** ⚠️ Zonder de `gezien`-set draait dit voor altijd door. */
  it('loopt niet vast op een lus', () => {
    const lees = uitMap({
      'functions/a/index.ts': "import { b } from '../b/index.ts';",
      'functions/b/index.ts': "import { a } from '../a/index.ts';",
    });

    expect(modulesVoor(lees, 'functions/a/index.ts')).toEqual([
      'functions/a/index.ts',
      'functions/b/index.ts',
    ]);
  });

  /**
   * ⚠️ Een import die nergens heen wijst blijft in de lijst staan en verdwijnt
   *    niet stilzwijgend. Zou hij weggelaten worden, dan meldt de controle dat
   *    de deploy klopt terwijl de repo zelf een gat heeft.
   */
  it('houdt een import die nergens heen wijst in de lijst', () => {
    const lees = uitMap({
      'functions/rollover/index.ts': "import { weg } from '../_shared/bestaat-niet.ts';",
    });

    expect(modulesVoor(lees, 'functions/rollover/index.ts')).toContain(
      'functions/_shared/bestaat-niet.ts',
    );
  });
});

describe('modulesInBundel — wat er in de gedeployde bundel zit', () => {
  it('haalt de paden uit de file-URLs van een deploy', () => {
    const bundel = [
      'file:///tmp/user_fn_abc_12/source/supabase/functions/notificaties/index.ts',
      'file:///tmp/user_fn_abc_12/source/supabase/functions/_shared/time/zoned.ts',
    ].join(' ');

    expect(modulesInBundel(bundel)).toEqual([
      'functions/_shared/time/zoned.ts',
      'functions/notificaties/index.ts',
    ]);
  });

  it('telt hetzelfde pad één keer, ook als het vaker voorkomt', () => {
    const bundel = 'functions/a/index.ts x functions/a/index.ts y functions/a/index.ts';
    expect(modulesInBundel(bundel)).toEqual(['functions/a/index.ts']);
  });

  /**
   * ⚠️ Dit onderscheidt "de bundel wijkt overal van af" van "ik begrijp deze
   *    bundel niet". Zie `leesbaar()`.
   */
  it('vindt niets in bytes die geen bundel zijn', () => {
    expect(modulesInBundel('rommel zonder paden')).toEqual([]);
  });
});

describe('vergelijk', () => {
  it('zegt niets als de twee lijsten gelijk zijn', () => {
    const lijst = ['functions/_shared/melden.ts', 'functions/rollover/index.ts'];
    expect(vergelijk(lijst, lijst)).toEqual({ ontbreekt: [], onbekend: [] });
  });

  /**
   * ⚠️ **Het geval van 26-08-2026, met de echte lijsten.** De deploy droeg
   *    `_shared/sentry/index.ts` — die op geen enkele branch stond — en miste
   *    `_shared/melden.ts` en de hele `_shared/observability/`, de laag die de
   *    persoonsgegevens uit een foutmelding haalt.
   */
  it('vindt het geval van 26-08-2026', () => {
    const repo = [
      'functions/_shared/melden.ts',
      'functions/_shared/notificaties/regels.ts',
      'functions/_shared/observability/edge-rapport.ts',
      'functions/_shared/observability/scrub.ts',
      'functions/notificaties/index.ts',
    ];
    const gedeployd = [
      'functions/_shared/notificaties/regels.ts',
      'functions/_shared/sentry/index.ts',
      'functions/notificaties/index.ts',
    ];

    const uit = vergelijk(repo, gedeployd);

    expect(uit.onbekend).toEqual(['functions/_shared/sentry/index.ts']);
    expect(uit.ontbreekt).toEqual([
      'functions/_shared/melden.ts',
      'functions/_shared/observability/edge-rapport.ts',
      'functions/_shared/observability/scrub.ts',
    ]);
  });

  it('meldt een module die de deploy mist', () => {
    const uit = vergelijk(['a.ts', 'b.ts'], ['a.ts']);
    expect(uit).toEqual({ ontbreekt: ['b.ts'], onbekend: [] });
  });

  it('meldt een module die de repo niet kent', () => {
    const uit = vergelijk(['a.ts'], ['a.ts', 'vreemd.ts']);
    expect(uit).toEqual({ ontbreekt: [], onbekend: ['vreemd.ts'] });
  });
});

describe('leesbaar', () => {
  /**
   * ⚠️ Een bundel zonder herkenbare paden is geen bundel die overal van afwijkt
   *    maar een bundel die we niet begrijpen. Die twee moeten verschillende
   *    meldingen geven — anders kost het eerste onbekende ESZip-formaat je het
   *    vertrouwen in de hele controle, en dan staat hij binnen een maand uit.
   */
  it('zegt nee bij een bundel zonder herkenbare paden', () => {
    expect(leesbaar([])).toBe(false);
  });

  it('zegt ja zodra er één pad in zit', () => {
    expect(leesbaar(['functions/a/index.ts'])).toBe(true);
  });
});
