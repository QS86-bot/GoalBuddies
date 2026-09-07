import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { herschrijf, naarRepoPad, zoekDeno } from '../../scripts/edge-typecheck.mjs';

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

  it('kiest de extensieloze `deno` boven de `.cmd` als beide er staan', () => {
    // ⚠️ De volgorde is niet willekeurig: op een Unix-machine met allebei is de
    //    extensieloze de echte binary en de `.cmd` hooguit een restant.
    const wortel = mkdtempSync(join(tmpdir(), 'gb-denobeide-'));
    mkdirSync(join(wortel, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(wortel, 'node_modules', '.bin', 'deno'), '');
    writeFileSync(join(wortel, 'node_modules', '.bin', 'deno.cmd'), '');

    expect(zoekDeno(wortel, { PATH: '', NODE_ENV: 'test' })).toBe(
      join(wortel, 'node_modules', '.bin', 'deno'),
    );
  });

  it('geeft null als er geen Deno is — dan is de controle ongemeten en niet groen', () => {
    expect(zoekDeno('/bestaat/niet', { PATH: '/bestaat/niet', NODE_ENV: 'test' })).toBeNull();
  });
});
