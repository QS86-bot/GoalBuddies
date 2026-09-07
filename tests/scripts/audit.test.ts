import { describe, expect, it } from 'vitest';

import {
  NAGEKEKEN,
  hoofd,
  isBruikbaarRapport,
  reparatieSoort,
  verschil,
  wortelsUit,
} from '../../scripts/audit-controle.mjs';

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
    expect(Object.keys(wortelsUit(rapport))).toEqual(['image-size']);
    expect(wortelsUit(rapport)['image-size'].ernst).toBe('high');
  });

  it('geeft een lege verzameling bij een schoon rapport', () => {
    expect(wortelsUit({ vulnerabilities: {} })).toEqual({});
    expect(wortelsUit({})).toEqual({});
  });

  it('draagt de advisorynummers mee, gesorteerd', () => {
    // ⚠️ Dít is wat een naam plus een ernst niet kan: twee van de vier huidige
    //    wortels dragen al twee advisories, dus stapelen is hier het normale
    //    patroon en geen randgeval.
    const rapport = {
      vulnerabilities: {
        'image-size': {
          severity: 'high',
          via: [{ source: 1138809, title: 'b' }, 'metro', { source: 1138808, title: 'a' }],
        },
      },
    };
    expect(wortelsUit(rapport)['image-size'].advisories).toEqual([1138808, 1138809]);
  });

  it('ziet een wortel die `__proto__` heet', () => {
    // 📏 Gemeten op de eerste versie: met een object-literal werd deze wortel
    //    stilzwijgend verzwolgen en bleef de controle groen. De invoer komt van
    //    buiten deze repo, dus dat is niet gratis.
    const vulnerabilities = JSON.parse(
      '{"__proto__":{"severity":"critical","via":[{"source":1}]}}',
    ) as Record<string, unknown>;
    expect(Object.keys(wortelsUit({ vulnerabilities }))).toEqual(['__proto__']);
  });
});

describe('reparatieSoort', () => {
  it('houdt een brekende reparatie uit een gratis reparatie', () => {
    // ⚠️ Een boolean maakt deze vier gelijk, en dan heeft de voorwaarde in de
    //    dossierrij ("dan is de override gratis") opnieuw geen meter: die noemt
    //    de overgang brekend → gratis, niet geen → wel.
    expect(reparatieSoort(false)).toBe('geen');
    expect(reparatieSoort(true)).toBe('gratis');
    expect(reparatieSoort({ name: 'expo-router', isSemVerMajor: true })).toBe('brekend');
    expect(reparatieSoort({ name: 'expo-router', isSemVerMajor: false })).toBe('gratis');
  });
});

describe('isBruikbaarRapport', () => {
  it('weigert een rapport zonder `vulnerabilities`', () => {
    // 📏 Dit is de vorm die een onbereikbaar npm-register teruggeeft — geldige
    //    JSON, geen kwetsbaarheden, en dus niet te onderscheiden van "schoon"
    //    zonder deze toets.
    expect(isBruikbaarRapport({ message: 'connect ECONNREFUSED', error: {} })).toBe(false);
    expect(isBruikbaarRapport(null)).toBe(false);
    expect(isBruikbaarRapport({})).toBe(false);
    expect(isBruikbaarRapport({ vulnerabilities: null })).toBe(false);
  });

  it('laat een leeg maar echt rapport door', () => {
    // ⚠️ Nul kwetsbaarheden is een méting en geen mislukking. Die twee mogen
    //    hier niet op één hoop: het verschil is de hele bevinding.
    expect(isBruikbaarRapport({ vulnerabilities: {} })).toBe(true);
  });
});

describe('hoofd', () => {
  it('slaat zichzelf over in plaats van alles verdwenen te melden', () => {
    // 📏 Op de eerste versie gaf dit vier regels "NAGEKEKEN noemt X, maar npm
    //    audit meldt hem niet meer" — een uitnodiging om het register leeg te
    //    maken. Gemeten met `npm_config_registry=http://127.0.0.1:1/`.
    const regels: string[] = [];
    const echt = console.error;
    console.error = (m: unknown) => regels.push(String(m));
    try {
      expect(hoofd(() => ({ message: 'connect ECONNREFUSED' }))).toBe(1);
    } finally {
      console.error = echt;
    }
    expect(regels.join('\n')).toContain('OVERGESLAGEN');
    expect(regels.join('\n')).not.toContain('meldt hem niet meer');
  });

  it('meldt wél verdwenen wortels bij een écht leeg rapport', () => {
    // De andere kant van diezelfde grendel: een gemeten nul is geen overslaan.
    const regels: string[] = [];
    const echt = console.error;
    console.error = (m: unknown) => regels.push(String(m));
    try {
      expect(hoofd(() => ({ vulnerabilities: {} }))).toBe(1);
    } finally {
      console.error = echt;
    }
    expect(regels.join('\n')).toContain('meldt hem niet meer');
    expect(regels.join('\n')).not.toContain('OVERGESLAGEN');
  });
});

describe('verschil', () => {
  const register = {
    a: {
      ernst: 'high',
      advisories: [100, 200],
      reparatie: 'brekend',
      in_bundel: false,
      marker: 'x',
      reden: 'r',
    },
  };
  const meting = (over = {}) => ({
    a: { ernst: 'high', advisories: [100, 200], reparatie: 'brekend', ...over },
  });

  it('meldt een wortel die er nieuw bij komt', () => {
    const gemeten = {
      ...meting(),
      b: { ernst: 'moderate', advisories: [300], reparatie: 'geen' },
    };
    expect(verschil(gemeten, register).nieuw).toEqual([{ naam: 'b', ernst: 'moderate' }]);
  });

  it('meldt een wortel die van ernst verandert', () => {
    // Dezelfde naam, zwaardere advisory: de bouw-meting is dan net zo goed
    // verlopen, want de vraag "haalt dit de bundel" is opnieuw te stellen.
    expect(verschil(meting({ ernst: 'critical' }), register).anders).toEqual([
      { naam: 'a', redenen: ['ernst high → critical'] },
    ]);
  });

  it('meldt een advisory die erbij komt zonder dat de ernst stijgt', () => {
    // ⚠️⚠️ **Dit is de bevinding waar de tweede versie voor bestaat.** In de
    //    eerste bleef dit groen: naam gelijk, ernst gelijk, dus geen verschil.
    //    Terwijl de `reden` in het register een DoS in build-tooling afweegt en
    //    de nieuwe advisory RCE kan zijn. De motivering blijft dan staan voor
    //    een gebeurtenis die niet meer dezelfde is.
    expect(verschil(meting({ advisories: [100, 200, 999] }), register).anders).toEqual([
      { naam: 'a', redenen: ['advisories 100,200 → 100,200,999'] },
    ]);
  });

  it('meldt een advisory die door een ándere van gelijke ernst vervangen wordt', () => {
    expect(verschil(meting({ advisories: [777] }), register).anders).toEqual([
      { naam: 'a', redenen: ['advisories 100,200 → 777'] },
    ]);
  });

  it('meldt dat een reparatie van brekend naar gratis gaat', () => {
    // Dat moment is precies de voorwaarde die de dossierrij bij
    // `decode-uri-component` noemt, en hij had tot nu toe geen meter.
    expect(verschil(meting({ reparatie: 'gratis' }), register).anders).toEqual([
      { naam: 'a', redenen: ['reparatie brekend → gratis'] },
    ]);
  });

  it('meldt een register dat achterloopt', () => {
    // De andere kant van de ratel: een reden voor een kwetsbaarheid die er niet
    // meer is, beschrijft een toestand die niet meer bestaat.
    expect(verschil({}, register).verdwenen).toEqual(['a']);
  });

  it('noemt een wortel die `toString` heet nieuw en niet bekend', () => {
    // ⚠️ Met `register[naam] === undefined` vindt zo'n naam een geërfde methode
    //    en heet hij bekend. `Object.hasOwn` is de grendel.
    const gemeten = { toString: { ernst: 'critical', advisories: [1], reparatie: 'geen' } };
    expect(verschil(gemeten, register).nieuw).toEqual([{ naam: 'toString', ernst: 'critical' }]);
  });

  it('zwijgt als meting en register gelijk zijn', () => {
    expect(verschil(meting(), register)).toEqual({ nieuw: [], anders: [], verdwenen: [] });
  });
});

describe('NAGEKEKEN', () => {
  it('draagt bij elke wortel een marker en een reden', () => {
    for (const [naam, v] of Object.entries(NAGEKEKEN)) {
      expect(typeof v.marker, `${naam} hoort een stringmarker te dragen`).toBe('string');
      expect(v.marker.length, `${naam}: de marker mag niet leeg zijn`).toBeGreaterThan(3);
      expect(v.reden.length, `${naam} hoort een reden te dragen`).toBeGreaterThan(30);
      expect(typeof v.in_bundel, `${naam}: in_bundel is gemeten en geen gok`).toBe('boolean');
      expect(Array.isArray(v.advisories), `${naam} hoort advisorynummers te dragen`).toBe(true);
      expect(v.advisories.length, `${naam}: minstens één advisory`).toBeGreaterThan(0);
      expect(
        [...v.advisories].sort((a: number, b: number) => a - b),
        `${naam}: advisories horen gesorteerd te staan, anders botst de vergelijking`,
      ).toEqual(v.advisories);
      expect(
        ['geen', 'brekend', 'gratis'],
        `${naam}: reparatie is een van de drie soorten`,
      ).toContain(v.reparatie);
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
