import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  denoFeiten,
  denoMelding,
  denoOordeel,
  herschrijf,
  naarRepoPad,
  zoekDeno,
} from '../../scripts/edge-typecheck.mjs';

/**
 * De zuivere helft van `edge:types:controle` — QS8-214.
 *
 * ⚠️ **Waarom deze test bestaat en niet alleen het script.** CLAUDE.md, regel 18:
 *    een controle die je niet kunt voeden, kun je niet ijken. `herschrijf()` is
 *    de enige plek waar dit script de bron aanraakt, en of de kopie verbatim
 *    blijft op die ene specifier na, ís de correctheidsvraag. Herschrijft hij
 *    méér, dan typecheckt de controle iets anders dan wat er gepusht wordt en is
 *    groen daar geen uitspraak over.
 *
 * ⚠️ **De helft die hem met rúst moet laten is even belangrijk.** Een
 *    herschrijver die te gulzig is, maakt van een groene controle een bewering
 *    over code die niet bestaat.
 */

describe('herschrijf — de vormen die hij moet raken', () => {
  const RAAK = [
    {
      naam: 'de vorm die er vandaag staat',
      bron: "import { createClient } from 'jsr:@supabase/supabase-js@2';",
      uit: "import { createClient } from 'npm:@supabase/supabase-js@2';",
      treffers: 1,
    },
    {
      naam: 'een volledig versienummer',
      bron: "from 'jsr:@supabase/supabase-js@2.39.0'",
      uit: "from 'npm:@supabase/supabase-js@2.39.0'",
      treffers: 1,
    },
    {
      naam: 'dubbele aanhalingstekens',
      bron: 'from "jsr:@supabase/supabase-js@2"',
      uit: 'from "npm:@supabase/supabase-js@2"',
      treffers: 1,
    },
    {
      naam: 'twee keer in hetzelfde bestand',
      bron: "a 'jsr:@supabase/supabase-js@2' b 'jsr:@supabase/supabase-js@2'",
      uit: "a 'npm:@supabase/supabase-js@2' b 'npm:@supabase/supabase-js@2'",
      treffers: 2,
    },
  ];

  it.each(RAAK)('$naam', ({ bron, uit, treffers }) => {
    const uitkomst = herschrijf(bron);
    expect(uitkomst.tekst).toBe(uit);
    expect(uitkomst.treffers).toBe(treffers);
  });
});

describe('herschrijf — de vormen die hij met rust moet laten', () => {
  const MIJD = [
    {
      naam: 'al een npm-specifier',
      bron: "from 'npm:@supabase/supabase-js@2'",
    },
    {
      naam: 'een ánder jsr-pakket',
      bron: "from 'jsr:@std/assert@1'",
    },
    {
      naam: 'de zin in deno.json die alleen het woord jsr noemt',
      bron: 'juist met een inline `jsr:`-specifier. Dat is de vorm die hun eigen',
    },
    {
      naam: 'zonder versie — dan is de aanname van dit script veranderd',
      // ⚠️ Met opzet géén treffer. De versie ís de gelijkheid tussen het
      //    jsr-pakket en het npm-pakket; zonder haar zou dit script een ander
      //    pakket checken dan wat er draait. Verdwijnt de versie overal, dan
      //    telt het script nul treffers en wordt hij rood — precies de bedoeling.
      bron: "from 'jsr:@supabase/supabase-js'",
    },
    {
      naam: 'een pakketnaam die er alleen op lijkt',
      bron: "from 'jsr:@supabase/supabase-js-helpers@2'",
      // ⚠️ Deze wordt wél deels geraakt door een naïeve regex. Zie de assertie.
      deels: true,
    },
  ];

  it.each(MIJD)('$naam', ({ bron, deels }) => {
    const uitkomst = herschrijf(bron);
    if (deels === true) {
      // Het versiedeel van de langere naam begint niet met een cijfer na `@`,
      // dus de specifier valt hier uiteen — dat is zichtbaar en niet stil.
      expect(uitkomst.tekst).toBe(bron);
      expect(uitkomst.treffers).toBe(0);
      return;
    }
    expect(uitkomst.tekst).toBe(bron);
    expect(uitkomst.treffers).toBe(0);
  });
});

describe('naarRepoPad — een fout wijst naar de repo en niet naar /tmp', () => {
  const WERKMAP = '/tmp/goalbuddies-edge-abc123';

  it('vertaalt een kaal pad', () => {
    expect(naarRepoPad(`    at ${WERKMAP}/rollover/index.ts:699:7`, WERKMAP)).toBe(
      '    at supabase/functions/rollover/index.ts:699:7',
    );
  });

  it('vertaalt ook een file://-URL', () => {
    expect(naarRepoPad(`Check file://${WERKMAP}/_shared/melden.ts`, WERKMAP)).toBe(
      'Check supabase/functions/_shared/melden.ts',
    );
  });

  it('laat een regel zonder de werkmap ongemoeid', () => {
    const regel = "error[no-var]: `var` keyword is not allowed.";
    expect(naarRepoPad(regel, WERKMAP)).toBe(regel);
  });
});

describe('zoekDeno — welke binary er gekozen wordt', () => {
  it('DENO_BIN wint van alles', () => {
    expect(zoekDeno('/bestaat/niet', { DENO_BIN: '/eigen/deno', PATH: '', NODE_ENV: 'test' })).toBe('/eigen/deno');
  });

  it('daarna node_modules/.bin, zodat de versie uit package.json wint', () => {
    // ⚠️ Een controle die per werkplek een andere compiler gebruikt, meet per
    //    werkplek iets anders. Vandaar deze volgorde, en vandaar deze test.
    const wortel = mkdtempSync(join(tmpdir(), 'gb-denozoek-'));
    mkdirSync(join(wortel, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(wortel, 'node_modules', '.bin', 'deno'), '');

    expect(zoekDeno(wortel, { PATH: '', NODE_ENV: 'test' })).toBe(join(wortel, 'node_modules', '.bin', 'deno'));
  });

  it('vindt ook de `deno.cmd` die npm op Windows neerzet', () => {
    // 📏 **Dit was een gat, geen hypothese** (QS8-214, nawerk 07-09). npm zet op
    //    Windows geen extensieloze `deno` in `node_modules/.bin` maar `deno.cmd`
    //    plus een `.ps1`. `existsSync` op alleen `deno` vond daar dus niets, de
    //    zoektocht viel terug op PATH, en de controle meldde zich OVERGESLAGEN
    //    op precies de machine waar hij met de hand gedraaid wordt — een
    //    gereedschap dat bestaat om een vergeten handeling te voorkomen, dat
    //    zelf niets doet.
    const wortel = mkdtempSync(join(tmpdir(), 'gb-denocmd-'));
    mkdirSync(join(wortel, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(wortel, 'node_modules', '.bin', 'deno.cmd'), '');

    expect(zoekDeno(wortel, { PATH: '', NODE_ENV: 'test' })).toBe(
      join(wortel, 'node_modules', '.bin', 'deno.cmd'),
    );
  });

  it('kiest bij drie shims de vorm die dit platform kan uitvoeren', () => {
    // 📏 **Deze test stond er eerst andersom in, en de Windows-job heeft dat
    //    weerlegd.** npm zet daar drie bestanden neer — `deno.cmd`, `deno.ps1`
    //    en een extensieloze `deno` — en die laatste is géén binary maar een
    //    sh-script voor git-bash. `CreateProcess` kan er niets mee: `spawnSync`
    //    gaf een fout zonder uitvoer, en de controle een rood met een lege
    //    melding.
    //
    //    ⚠️ Op Unix is het precies omgekeerd: daar ís de extensieloze de echte
    //    binary. Vandaar een volgorde per platform en niet één lijst.
    const wortel = mkdtempSync(join(tmpdir(), 'gb-denobeide-'));
    mkdirSync(join(wortel, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(wortel, 'node_modules', '.bin', 'deno'), '');
    writeFileSync(join(wortel, 'node_modules', '.bin', 'deno.cmd'), '');

    const verwacht = process.platform === 'win32' ? 'deno.cmd' : 'deno';
    expect(zoekDeno(wortel, { PATH: '', NODE_ENV: 'test' })).toBe(
      join(wortel, 'node_modules', '.bin', verwacht),
    );
  });

  it('geeft null als er geen Deno is — dan is de controle ongemeten en niet groen', () => {
    expect(zoekDeno('/bestaat/niet', { PATH: '/bestaat/niet', NODE_ENV: 'test' })).toBeNull();
  });
});

/**
 * Waaróm er geen Deno is, en welk advies daarbij hoort — QS8-346.
 *
 * ⚠️ **De belofte is niet "er staat een nette melding".** De belofte is: *de stap
 *    die de melding noemt, werkt in de omgeving waar hij gelezen wordt.* De oude
 *    tekst zei `npm ci`, en in de cloudsessie-container was `npm ci` net gedraaid
 *    en stond `node_modules/deno` er niet. 📏 Gevolg, gemeten: in QS8-341 is op
 *    grond van die melding geschreven dat CI de Edge-typecheck wel zou doen, en
 *    CI vond drie fouten in precies het bestand dat gewijzigd was.
 *
 * IJKING — met de hand uitgevoerd op 08-09-2026, en dat is bij dit issue de eis:
 * geijkt door het advies te dráaien, niet door het te lezen.
 *
 *   P  `node_modules/deno/deno` weggehaald, map laten staan → `binary-mist`, en
 *      `npm rebuild deno` haalt hem terug; controle daarna groen
 *   Q  `node_modules/deno` helemaal weggehaald              → `onvolledige-install`,
 *      en `npm install` haalt hem terug (`added 1 package`); controle daarna groen
 *   R  allebei aanwezig                                      → groen, in ~20 seconden
 *   S  de oude tekst (*"`npm ci` haalt hem binnen"*) terug   → 2 rood: de regel
 *      hieronder die `npm ci` als oplossing verbiedt, én het geval dat de
 *      werkende handeling eist. Dat is de regressie zelf, en die is nu luid.
 */
describe('denoOordeel — waarom er geen Deno is', () => {
  it('noemt het een onvolledige install als de map ontbreekt maar package.json hem vraagt', () => {
    expect(denoOordeel({ versie: '2.9.6', pakketmap: false, binary: false })).toBe(
      'onvolledige-install',
    );
  });

  it('noemt het een overgeslagen postinstall als de map er staat maar de binary niet', () => {
    expect(denoOordeel({ versie: '2.9.6', pakketmap: true, binary: false })).toBe('binary-mist');
  });

  it('noemt het niet-gevraagd als package.json geen deno noemt', () => {
    expect(denoOordeel({ versie: null, pakketmap: false, binary: false })).toBe('niet-gevraagd');
  });

  /** Alles staat er en `zoekDeno()` vond hem tóch niet — dan is het pad het probleem. */
  it('houdt onbereikbaar over als map én binary er staan', () => {
    expect(denoOordeel({ versie: '2.9.6', pakketmap: true, binary: true })).toBe('onbereikbaar');
  });
});

describe('denoMelding — het advies moet uitvoerbaar zijn', () => {
  const GEVALLEN = [
    { oordeel: 'onvolledige-install', bevat: 'npm install' },
    { oordeel: 'binary-mist', bevat: 'npm rebuild deno' },
    { oordeel: 'niet-gevraagd', bevat: 'DENO_BIN' },
    { oordeel: 'onbereikbaar', bevat: 'DENO_BIN' },
  ] as const;

  for (const geval of GEVALLEN) {
    it(`noemt bij ${geval.oordeel} de handeling die daar werkt`, () => {
      expect(denoMelding(geval.oordeel, '2.9.6')).toContain(geval.bevat);
    });
  }

  it('zet de gevraagde versie in de melding, zodat je hem niet hoeft op te zoeken', () => {
    expect(denoMelding('onvolledige-install', '2.9.6')).toContain('deno@2.9.6');
  });

  /**
   * ⚠️ **De grendel op de regressie zelf.** `npm ci` mag in de melding staan —
   *    hij stáát erin, als waarschuwing dat hij het juist níét oplost — maar
   *    nooit als de handeling die je moet draaien. Het onderscheid is de zin
   *    eromheen, en die is hier de belofte.
   */
  it('draagt `npm ci` nooit als de oplossing', () => {
    for (const { oordeel } of GEVALLEN) {
      const melding = denoMelding(oordeel, '2.9.6');
      expect(melding, `${oordeel} adviseert npm ci`).not.toMatch(/Draai `npm ci`/);
      expect(melding, `${oordeel} adviseert npm ci`).not.toMatch(/`npm ci` haalt hem binnen/);
    }
  });
});

describe('denoFeiten — leest de drie feiten van schijf', () => {
  function wortelMet(pakket: object | null, mappen: readonly string[]): string {
    const wortel = mkdtempSync(join(tmpdir(), 'goalbuddies-deno-'));
    if (pakket !== null) writeFileSync(join(wortel, 'package.json'), JSON.stringify(pakket));
    for (const map of mappen) mkdirSync(join(wortel, map), { recursive: true });
    return wortel;
  }

  it('leest de versie uit devDependencies', () => {
    const wortel = wortelMet({ devDependencies: { deno: '2.9.6' } }, []);
    expect(denoFeiten(wortel)).toEqual({ versie: '2.9.6', pakketmap: false, binary: false });
  });

  it('ziet de map zonder binary', () => {
    const wortel = wortelMet({ devDependencies: { deno: '2.9.6' } }, ['node_modules/deno']);
    expect(denoFeiten(wortel)).toEqual({ versie: '2.9.6', pakketmap: true, binary: false });
  });

  it('ziet de binary als hij er staat', () => {
    const wortel = wortelMet({ devDependencies: { deno: '2.9.6' } }, ['node_modules/deno']);
    writeFileSync(join(wortel, 'node_modules', 'deno', 'deno'), '');
    expect(denoFeiten(wortel).binary).toBe(true);
  });

  /** ⚠️ Geen `package.json` is geen crash maar een oordeel: `niet-gevraagd`. */
  it('geeft versie null bij een onleesbare package.json', () => {
    const wortel = wortelMet(null, []);
    expect(denoFeiten(wortel).versie).toBeNull();
    expect(denoOordeel(denoFeiten(wortel))).toBe('niet-gevraagd');
  });
});
