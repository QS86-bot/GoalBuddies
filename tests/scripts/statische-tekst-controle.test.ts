import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BESTANDEN, BEWUST_NEDERLANDS, isNederlandseZin, manifestVelden, treffersIn } from '../../scripts/statische-tekst-controle.mjs';

/**
 * QS8-797 — de controle die Nederlandse resten buiten de catalogus vindt.
 * Beide helften: wat hij moet vinden en wat hij met rust moet laten.
 */
describe('statische-tekst-controle', () => {
  it('vindt een Nederlandse zin in een JSON- en een JS-tekenreeks', () => {
    expect(treffersIn('{ "photosPermission": "GoalBuddies vraagt toegang tot je foto\'s" }')).toHaveLength(1);
    expect(treffersIn("body: 'Er staat iets voor je klaar.',")).toHaveLength(1);
  });

  it('laat Engels, merknamen, sleutels en commentaar met rust', () => {
    expect(treffersIn('"photosPermission": "Lets you pick a profile photo from your library."')).toEqual([]);
    expect(treffersIn('"name": "GoalBuddies", "bundleIdentifier": "nl.qprojects.goalbuddies"')).toEqual([]);
    expect(treffersIn('// Er staat iets voor je klaar\n/* de foto van je */\nconst x = 1;')).toEqual([]);
    expect(isNederlandseZin('GoalBuddies')).toBe(false);
  });

  it('weigert taalgebonden manifestvelden', () => {
    expect(manifestVelden('{"name":"x","description":"y","lang":"nl"}')).toEqual(['description', 'lang']);
    expect(manifestVelden('{"name":"x"}')).toEqual([]);
  });

  it('de echte bestanden zijn schoon, tenzij bewust Nederlands met reden', () => {
    for (const pad of BESTANDEN as string[]) {
      if (pad in (BEWUST_NEDERLANDS as Record<string, string>)) continue;
      expect(treffersIn(readFileSync(pad, 'utf8')), pad).toEqual([]);
    }
    expect(manifestVelden(readFileSync('public/manifest.json', 'utf8'))).toEqual([]);
  });

  it('de Nederlandse fototoestemming staat in de taalmap, naast een Engelse basis', () => {
    const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
    expect(app.locales.nl).toBe('./locales/nl.json');
    const nl = JSON.parse(readFileSync('locales/nl.json', 'utf8'));
    expect(nl.ios.NSPhotoLibraryUsageDescription).toMatch(/foto/);
    expect(isNederlandseZin(nl.ios.NSPhotoLibraryUsageDescription)).toBe(true);
  });
});
