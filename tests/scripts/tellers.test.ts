import { describe, expect, it } from 'vitest';

import {
  BEGIN,
  EINDE,
  blokUit,
  leesVitestUitvoer,
  tellersRegels,
  tellingUitPakket,
  vervangBlok,
} from '../../scripts/tellers.mjs';

/**
 * De testtellers worden gemeten en niet overgetypt — QS8-284.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken.** Daarom staan
 *    de vier stukken los: de telling uit `package.json`, het lezen van de
 *    vitest-uitvoer, de regels die eruit volgen, en het vervangen van het blok.
 *    Elk krijgt hier de vormen die hij moet vinden én de vormen die hij met rust
 *    moet laten.
 */

describe('de telling komt uit de definitie en niet uit de uitvoer', () => {
  it('telt elke `*:controle` uit package.json plus de vier vaste stappen', () => {
    const uit = tellingUitPakket({
      dev: 'expo start',
      typecheck: 'tsc',
      'emoji:controle': 'node x.mjs',
      'docs:controle': 'node y.mjs',
    });

    expect(uit.controles).toBe(2);
    expect(uit.stappen, 'twee controles plus typecheck, lint, tests en de RLS-suite').toBe(6);
  });

  it('telt een script zonder het achtervoegsel niet mee', () => {
    // ⚠️ De vorm die hij met rust moet laten. `tellers` is de generator en geen
    //    controle; wie op "bevat controle" zou filteren, telt hem mee en komt
    //    één te hoog uit — precies de klasse verschil die dit issue veroorzaakte.
    const uit = tellingUitPakket({
      tellers: 'node scripts/tellers.mjs',
      'tellers:controle': 'node scripts/tellers.mjs --controle',
      controlepaneel: 'node z.mjs',
    });

    expect(uit.controles).toBe(1);
    expect(uit.stappen).toBe(5);
  });

  it('komt op nul controles uit als er geen enkele is', () => {
    expect(tellingUitPakket({ dev: 'expo start' })).toEqual({ controles: 0, stappen: 4 });
  });
});

describe('de uitvoer van vitest lezen', () => {
  it('leest bestanden, geslaagd en overgeslagen', () => {
    const uit = leesVitestUitvoer(
      ' Test Files  241 passed (241)\n      Tests  3368 passed | 1 skipped (3369)\n',
    );

    expect(uit).toEqual({ bestanden: 241, geslaagd: 3368, overgeslagen: 1 });
  });

  it('leest een run zonder overgeslagen tests als nul', () => {
    const uit = leesVitestUitvoer(' Test Files  3 passed (3)\n      Tests  17 passed (17)\n');

    expect(uit).toEqual({ bestanden: 3, geslaagd: 17, overgeslagen: 0 });
  });

  it('geeft null bij een uitvoer die hij niet herkent', () => {
    // ⚠️ **Null en geen half getal, en dat is de grendel.** Verandert het
    //    reporterformaat, dan schrijft een generator die hier iets verzint een
    //    getal weg dat nergens vandaan komt — en dat is erger dan het blok dat
    //    er stond, want het oogt gemeten.
    expect(leesVitestUitvoer('alles ging goed hoor')).toBeNull();
    expect(leesVitestUitvoer('')).toBeNull();
    expect(leesVitestUitvoer(null)).toBeNull();
  });

  it('geeft null als alleen de bestandsregel er staat', () => {
    expect(leesVitestUitvoer(' Test Files  241 passed (241)\n')).toBeNull();
  });
});

describe('het blok', () => {
  const regels = tellersRegels({
    geslaagd: 3368,
    overgeslagen: 1,
    bestanden: 241,
    controles: 35,
    stappen: 39,
  });

  it('noemt alle vijf de getallen', () => {
    expect(regels).toContain('3368 geslaagd en 1 overgeslagen');
    expect(regels).toContain('241 bestanden');
    expect(regels).toContain('35 controlescripts');
    expect(regels).toContain('39 stappen');
  });

  it('leest zichzelf terug uit een document', () => {
    const document = `voor\n${BEGIN}\n${regels}\n${EINDE}\nna\n`;
    expect(blokUit(document)).toBe(regels);
  });

  it('geeft null als de markeringen ontbreken', () => {
    expect(blokUit('geen markeringen hier')).toBeNull();
  });

  it('vervangt alleen wat tussen de markeringen staat', () => {
    const document = `voor\n${BEGIN}\noud\n${EINDE}\nna\n`;
    const na = vervangBlok(document, 'nieuw');

    expect(na).toContain('voor');
    expect(na).toContain('na');
    expect(blokUit(na)).toBe('nieuw');
    expect(na, 'de oude inhoud hoort weg te zijn').not.toContain('oud');
  });

  it('gooit als de markeringen ontbreken in plaats van het blok ergens neer te zetten', () => {
    // ⚠️ Een generator die het blok er zelf bij plakt op een plek die hij kiest,
    //    zet de stand een keer middenin een andere paragraaf.
    expect(() => vervangBlok('geen markeringen', 'nieuw')).toThrow(/markeringen/);
  });
});
