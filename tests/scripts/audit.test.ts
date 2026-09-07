import { describe, expect, it } from 'vitest';

import { NAGEKEKEN, verschil, wortelsUit } from '../../scripts/audit-controle.mjs';

/**
 * `npm run audit:controle` — QS8-191.
 *
 * ⚠️ **De belofte is niet "er zijn geen kwetsbaarheden".** Die is onhaalbaar:
 *    `image-size` en `uuid` hangen onder `expo` en zijn niet weg te krijgen
 *    zonder Expo te downgraden. De belofte is: *de verzameling kwetsbare
 *    wortels is nog steeds die welke iemand met een bóuw heeft nagekeken*.
 *
 * ⚠️⚠️ **Waarom dat nodig was.** De dossierrij sloot af met "opnieuw controleren
 *    bij elke SDK-upgrade", en dat is een handeling die je moet onthouden. 📏 Op
 *    07-09-2026 stonden er **19** meldingen met **vier** wortels waar de rij er
 *    15 met twee noemde — en één van de twee nieuwe, `decode-uri-component`,
 *    zit wél in de gebouwde bundel terwijl de rij concludeerde dat er geen enkele
 *    in zat.
 */
describe('wortelsUit', () => {
  it('houdt alleen de pakketten met een eigen advisory over', () => {
    // ⚠️ `npm audit` meldt ook alles wat er transitief boven hangt — vandaag 19
    //    regels voor 4 echte kwetsbaarheden. Zou het register die 19 dragen, dan
    //    verandert hij bij elke Expo-patch zonder dat er iets nieuws is.
    const rapport = {
      vulnerabilities: {
        'image-size': { severity: 'high', via: [{ title: 'DoS', url: 'https://…' }] },
        metro: { severity: 'high', via: ['image-size'] },
        expo: { severity: 'moderate', via: ['metro'] },
      },
    };
    expect(wortelsUit(rapport)).toEqual({ 'image-size': 'high' });
  });

  it('geeft een lege verzameling bij een schoon rapport', () => {
    expect(wortelsUit({ vulnerabilities: {} })).toEqual({});
    expect(wortelsUit({})).toEqual({});
  });
});

describe('verschil', () => {
  const register = { a: { ernst: 'high', in_bundel: false, marker: 'x', reden: 'r' } };

  it('meldt een wortel die er nieuw bij komt', () => {
    expect(verschil({ a: 'high', b: 'moderate' }, register).nieuw).toEqual([
      { naam: 'b', ernst: 'moderate' },
    ]);
  });

  it('meldt een wortel die van ernst verandert', () => {
    // Dezelfde naam, zwaardere advisory: de bouw-meting is dan net zo goed
    // verlopen, want de vraag "haalt dit de bundel" is opnieuw te stellen.
    expect(verschil({ a: 'critical' }, register).anders).toEqual([
      { naam: 'a', ernst: 'critical', was: 'high' },
    ]);
  });

  it('meldt een register dat achterloopt', () => {
    // De andere kant van de ratel: een reden voor een kwetsbaarheid die er niet
    // meer is, beschrijft een toestand die niet meer bestaat.
    expect(verschil({}, register).verdwenen).toEqual(['a']);
  });

  it('zwijgt als meting en register gelijk zijn', () => {
    expect(verschil({ a: 'high' }, register)).toEqual({ nieuw: [], anders: [], verdwenen: [] });
  });
});

describe('NAGEKEKEN', () => {
  it('draagt bij elke wortel een marker en een reden', () => {
    for (const [naam, v] of Object.entries(NAGEKEKEN)) {
      expect(typeof v.marker, `${naam} hoort een stringmarker te dragen`).toBe('string');
      expect(v.marker.length, `${naam}: de marker mag niet leeg zijn`).toBeGreaterThan(3);
      expect(v.reden.length, `${naam} hoort een reden te dragen`).toBeGreaterThan(30);
      expect(typeof v.in_bundel, `${naam}: in_bundel is gemeten en geen gok`).toBe('boolean');
    }
  });

  it('noemt `decode-uri-component` als de enige die de bundel haalt', () => {
    // 📏 Letterlijk in dist/: `new RegExp("(%[a-f0-9]{2})|([^%]+?)",'gi')`, via
    //    query-string@7.1.3 via expo-router. De rij concludeerde het tegendeel.
    const inBundel = Object.entries(NAGEKEKEN)
      .filter(([, v]) => v.in_bundel)
      .map(([naam]) => naam);
    expect(inBundel).toEqual(['decode-uri-component']);
  });

  it('gebruikt geen pakketnaam als marker', () => {
    // ⚠️ De les van de meting: een pakketnaam staat niet in een bundel en een
    //    identifier wordt geminificeerd. Alleen stringliteralen overleven.
    for (const [naam, v] of Object.entries(NAGEKEKEN)) {
      expect(v.marker, `${naam}: de marker mag niet de pakketnaam zijn`).not.toBe(naam);
    }
  });
});
