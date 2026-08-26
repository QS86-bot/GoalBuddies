import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leest de JSDoc ernaast. Zelfde
//    vorm als `migratieregister-plan.test.ts`, met opzet.
import {
  leesbaar,
  modulesInBundel,
  modulesVoor,
  vergelijk,
  waardeImports,
  werkboomWaarschuwing,
  zonderCommentaar,
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

describe('waardeImports — wat het bundelen overleeft', () => {
  /**
   * ⚠️ **Dit is de false positive van de eerste run, 26-08-2026.** De controle
   *    meldde dat `doelcoach` `_shared/time/types.ts` miste. Dat klopte niet:
   *    doelcoach bereikt die module alleen via `zoned.ts`, en die doet
   *    `import type { … } from './types.ts'`. Een type-only import wordt bij het
   *    bundelen volledig geëlimineerd, dus de deploy was correct en de controle
   *    zat ernaast.
   *
   *    `rollover` en `notificaties` liepen er niet op stuk omdat zij `types.ts`
   *    óók via `cycle.ts` bereiken, en dát bestand doet
   *    `import { GRACE_HOURS } from './types.ts'`.
   */
  it('laat een type-only import vallen', () => {
    expect(waardeImports("import type { IsoDate } from './types.ts';")).toEqual([]);
  });

  it('houdt een gewone waarde-import', () => {
    expect(waardeImports("import { GRACE_HOURS } from './types.ts';")).toEqual(['./types.ts']);
  });

  /** Eén waarde-specifier is genoeg om de module in de bundel te houden. */
  it('houdt een import met een type-specifier ernaast', () => {
    expect(waardeImports("import { meld, type Uitkomst } from './melden.ts';")).toEqual([
      './melden.ts',
    ]);
  });

  it('laat een import vallen waarvan élke specifier type-only is', () => {
    expect(waardeImports("import { type A, type B } from './x.ts';")).toEqual([]);
  });

  /**
   * ⚠️ Een side-effect-import heeft geen specifiers maar blijft wél in de
   *    bundel. Hem overslaan zou een module opleveren die de bundel draagt en de
   *    repo niet lijkt te kennen — een alarm zonder oorzaak.
   */
  it('houdt een side-effect-import', () => {
    expect(waardeImports("import './registreer.ts';")).toEqual(['./registreer.ts']);
  });

  it('houdt een re-export en laat een type-re-export vallen', () => {
    expect(waardeImports("export { GRACE_HOURS } from './types.ts';")).toEqual(['./types.ts']);
    expect(waardeImports("export type { Cycle } from './types.ts';")).toEqual([]);
  });

  it('laat kale specifiers met rust', () => {
    expect(waardeImports("import { createClient } from 'jsr:@supabase/supabase-js@2';")).toEqual([]);
  });

  it('leest over meerdere regels', () => {
    const bron = ['import {', '  berichtVoor,', '  magNudgen,', "} from './regels.ts';'"].join('\n');
    expect(waardeImports(bron)).toEqual(['./regels.ts']);
  });
});

describe('zonderCommentaar', () => {
  /**
   * ⚠️ De bestanden in dit project dragen veel commentaar waarin het woord
   *    `import` gewoon voorkomt. Zonder deze stap telt een zín over een import
   *    mee als import.
   */
  it('telt een import in commentaar niet mee', () => {
    expect(waardeImports("// import { x } from './nep.ts';")).toEqual([]);
    expect(waardeImports("/* import { x } from './nep.ts'; */")).toEqual([]);
  });

  /** ⚠️ `//` zit ook in `https://`. Een regel doormidden knippen mag niet. */
  it('laat een URL midden op een regel heel', () => {
    const bron = "const u = 'https://voorbeeld.nl/pad';";
    expect(zonderCommentaar(bron)).toContain('https://voorbeeld.nl/pad');
  });
});

describe('werkboomWaarschuwing', () => {
  it('zegt niets over een schone werkboom', () => {
    expect(werkboomWaarschuwing('')).toBeNull();
    expect(werkboomWaarschuwing('\n  \n')).toBeNull();
  });

  /**
   * ⚠️ **De belangrijkste waarschuwing van het script.** De controle vergelijkt
   *    de deploy met de bestanden op schijf, niet met een commit. Ligt er
   *    ongecommit werk, dan betekent groen alleen "gelijk aan wat er bij mij op
   *    schijf staat" — en dat is precies hoe de drift van 26-08 kon ontstaan én
   *    hoe hij bij de eerste run groen leek.
   */
  it('waarschuwt bij ongecommit werk en noemt het aantal', () => {
    const uit = werkboomWaarschuwing(
      [' M supabase/functions/doelcoach/index.ts', '?? supabase/functions/_shared/sentry/index.ts'].join(
        '\n',
      ),
    );

    expect(uit).not.toBeNull();
    expect(uit).toContain('2 ongecommitte');
    expect(uit).toContain('deploy nooit vanaf een werkboom');
  });
});

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

  /**
   * ⚠️ **De echte vorm van 26-08-2026, in het klein.** `doelcoach` bereikt
   *    `types.ts` alleen via `zoned.ts`, en die importeert hem type-only — dus
   *    hij hoort er níét bij. `rollover` bereikt hem óók via `cycle.ts`, die
   *    `GRACE_HOURS` als waarde haalt — dus daar hoort hij er wél bij.
   *
   *    Eén graaf, twee antwoorden, en dat is precies waarom deze functie op
   *    waarde-imports moet lopen en niet op tekstuele treffers.
   */
  it('scheidt de twee routes naar dezelfde module', () => {
    const bestanden = {
      'functions/doelcoach/index.ts': "import { daysBetween } from '../_shared/time/zoned.ts';",
      'functions/rollover/index.ts': [
        "import { userCycle } from '../_shared/time/cycle.ts';",
        "import type { Weekday } from '../_shared/time/types.ts';",
      ].join('\n'),
      'functions/_shared/time/zoned.ts': "import type { IsoDate } from './types.ts';",
      'functions/_shared/time/cycle.ts': [
        "import type { Cycle } from './types.ts';",
        "import { GRACE_HOURS } from './types.ts';",
        "import { addDays } from './zoned.ts';",
      ].join('\n'),
      'functions/_shared/time/types.ts': 'export const GRACE_HOURS = 12;',
    };

    expect(modulesVoor(uitMap(bestanden), 'functions/doelcoach/index.ts')).toEqual([
      'functions/_shared/time/zoned.ts',
      'functions/doelcoach/index.ts',
    ]);

    expect(modulesVoor(uitMap(bestanden), 'functions/rollover/index.ts')).toContain(
      'functions/_shared/time/types.ts',
    );
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
