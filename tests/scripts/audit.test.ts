import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  basisBestanden,
  bijgekomen,
  cli,
  exemplarenUit,
  leesBasisEnPr,
  modusUit,
  prOordeel,
  registerSchade,
  slotwoord,
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

/**
 * De naad `hoofd()` → `slotwoord()` — QS8-622.
 *
 * ⚠️⚠️ **`slotwoord()` is los geijkt, en dat bewees niet dat `hoofd()` hem de
 *    juiste richting meegeeft.** 📏 Op `c17b4f9d` bleef deze suite 24/24 groen
 *    met `verdwenen: false` of `meetbaar: false` vast in `hoofd()`, terwijl de
 *    CLI het advies dan kwijt was en tóch exitcode 1 gaf. Dat is precies de fout
 *    van QS8-616: de uitslag klopt en de handeling die hij voorschrijft is weg.
 *
 * ⚠️ **Het rapport is een afschrift van `NAGEKEKEN`, en één toets bewijst dat.**
 *    Zonder die tegenproef kan "er is iets verdwenen" groen worden op een
 *    rapport waarin álles verschilt, en dan toetst de richting niets.
 */
describe('hoofd — het advies per richting', () => {
  type Rij = { ernst: string; advisories: number[]; reparatie: string };

  function rapportUit(rijen: Record<string, Rij>) {
    const fix = { geen: false, gratis: true, brekend: { isSemVerMajor: true } } as const;
    const vulnerabilities: Record<string, unknown> = {};
    for (const [naam, v] of Object.entries(rijen)) {
      vulnerabilities[naam] = {
        severity: v.ernst,
        via: v.advisories.map((source) => ({ source, title: 't' })),
        fixAvailable: fix[v.reparatie as keyof typeof fix],
      };
    }
    return { vulnerabilities };
  }

  function draai(rijen: Record<string, Rij>): { code: number; fout: string; uit: string } {
    const fout: string[] = [];
    const uit: string[] = [];
    const [echtFout, echtUit] = [console.error, console.log];
    console.error = (...a: unknown[]) => fout.push(a.map(String).join(' '));
    console.log = (...a: unknown[]) => uit.push(a.map(String).join(' '));
    try {
      const code = hoofd(() => rapportUit(rijen));
      return { code, fout: fout.join('\n'), uit: uit.join('\n') };
    } finally {
      [console.error, console.log] = [echtFout, echtUit];
    }
  }

  const register = (): Record<string, Rij> => structuredClone(NAGEKEKEN);

  it('is groen en zwijgt over advies bij een rapport gelijk aan het register', () => {
    const { code, fout, uit } = draai(register());

    expect(code).toBe(0);
    expect(fout).toBe('');
    expect(uit).toContain('allemaal nagekeken');
  });

  it('stuurt een verdwenen pakket naar het opruimen en níet naar de bouw', () => {
    const rijen = register();
    delete rijen.uuid;
    const { code, fout } = draai(rijen);

    expect(code).toBe(1);
    expect(fout).toContain("NAGEKEKEN noemt 'uuid'");
    expect(fout, 'het advies voor een verdwenen pakket ontbrak').toContain('niets te bouwen');
    expect(fout, 'stuurde een verdwenen pakket naar `npm run build`').not.toContain(
      'npm run build',
    );
  });

  it('stuurt een nieuw pakket naar de bouw en níet naar het opruimen', () => {
    const rijen = register();
    rijen['nieuw-pakket'] = { ernst: 'high', advisories: [1], reparatie: 'geen' };
    const { code, fout } = draai(rijen);

    expect(code).toBe(1);
    expect(fout).toContain("'nieuw-pakket' (high) is nieuw");
    expect(fout, 'het advies voor een nieuw pakket ontbrak').toContain('npm run build');
    expect(fout, 'noemde het opruimen terwijl er niets wegviel').not.toContain('mag eruit');
  });

  it('stuurt een veranderd pakket ook naar de bouw', () => {
    // ⚠️ `anders` telt mee voor `meetbaar`: een nieuwe advisory onder een bekende
    //    naam maakt de bundel-meting net zo goed ongeldig als een nieuw pakket.
    const rijen = register();
    const uuid = rijen.uuid!;
    uuid.advisories = [...uuid.advisories, 9999999];
    const { code, fout } = draai(rijen);

    expect(code).toBe(1);
    expect(fout).toContain("'uuid' is veranderd");
    expect(fout, 'het advies voor een veranderd pakket ontbrak').toContain('npm run build');
    expect(fout).not.toContain('mag eruit');
  });

  it('geeft bij een pakket erbij én een eruit allebei de instructies', () => {
    const rijen = register();
    delete rijen.uuid;
    rijen['nieuw-pakket'] = { ernst: 'high', advisories: [1], reparatie: 'geen' };
    const { fout } = draai(rijen);

    expect(fout).toContain('npm run build');
    expect(fout).toContain('niets te bouwen');
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
    //    `zod` was sinds QS8-669 de tweede en is met QS8-670 weer weg: de directe
    //    dependency is bijgewerkt, de kopie onder `@expo/cli` is tooling. Een tweede
    //    erbij is een besluit en geen bijvangst — vandaar dat de lijst hier staat.
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

/**
 * QS8-616 — het slotwoord moet bij de richting passen.
 *
 * ⚠️⚠️ **Eén tekst voor beide richtingen stuurde je naar de verkeerde handeling.**
 *    De oude zin zei bij élke verandering: ga bouwen en grep in `dist/`. Voor een
 *    pakket dat wégvalt klopt dat niet — er is geen kwetsbaarheid meer om een
 *    bundel-meting over te doen, dus je bouwt tien minuten en concludeert daarna
 *    dat de controle onzin gaf. Een grendel die je naar de verkeerde handeling
 *    stuurt, verliest zijn gezag.
 */
describe('slotwoord', () => {
  function vang(opties: { meetbaar: boolean; verdwenen: boolean }): string {
    const regels: string[] = [];
    const echt = console.error;
    console.error = (...a: unknown[]) => regels.push(a.map(String).join(' '));
    try {
      slotwoord(opties);
    } finally {
      console.error = echt;
    }
    return regels.join('\n');
  }

  it('stuurt bij een nieuw pakket naar de bouw-meting', () => {
    const uit = vang({ meetbaar: true, verdwenen: false });

    expect(uit).toContain('npm run build');
    expect(uit, 'noemde de opruim-instructie terwijl er niets wegviel').not.toContain(
      'mag eruit',
    );
  });

  it('stuurt bij een verdwenen pakket juist níet naar de bouw-meting', () => {
    const uit = vang({ meetbaar: false, verdwenen: true });

    expect(uit).toContain('niets te bouwen');
    expect(uit, 'stuurde alsnog naar `npm run build`').not.toContain('npm run build');
  });

  /**
   * ⚠️ Allebei tegelijk kan: één pakket erbij en één eruit in dezelfde ronde.
   *    Dan horen beide instructies er te staan, want er zijn twee handelingen.
   */
  it('geeft bij allebei de richtingen allebei de instructies', () => {
    const uit = vang({ meetbaar: true, verdwenen: true });

    expect(uit).toContain('npm run build');
    expect(uit).toContain('niets te bouwen');
  });

  it('zwijgt als er niets veranderde', () => {
    expect(vang({ meetbaar: false, verdwenen: false })).toBe('');
  });
});

/**
 * De PR-modus — QS8-674.
 *
 * ⚠️ **De belofte is niet "het verschil klopt" maar "een PR wordt alleen rood om
 *    wat hij zelf toevoegt, en een meting die mislukt is nooit groen".** Dat zijn
 *    drie grendels achter elkaar en elke heeft zijn eigen test:
 *    *PR voegt toe* (`bijgekomen`), *wereld verandert* (zelfde advisory aan beide
 *    kanten) en *basis niet te lezen* (terugval, hardop). 📏 Elke is apart met de
 *    hand gebroken; welke test omviel staat in het beslisdocument.
 *
 * ⚠️ **De modus komt uit de omgeving en niet uit `hoofd()`'s standaard.** Anders
 *    draaien deze tests in CI onder `GITHUB_EVENT_NAME=pull_request` in een andere
 *    modus dan lokaal, en dan toetst dezelfde suite twee dingen.
 */
describe('PR-modus', () => {
  type Rij = {
    ernst: string;
    advisories: number[];
    nodes?: number;
    reparatie?: string;
  };

  function rapportUit(rijen: Record<string, Rij>) {
    const vulnerabilities: Record<string, unknown> = {};
    for (const [naam, v] of Object.entries(rijen)) {
      vulnerabilities[naam] = {
        severity: v.ernst,
        via: v.advisories.map((source) => ({ source, title: 't' })),
        nodes: Array.from({ length: v.nodes ?? 1 }, (_, i) => `node_modules/${naam}/${i}`),
        fixAvailable: v.reparatie === 'brekend' ? { isSemVerMajor: true } : true,
      };
    }
    return { vulnerabilities };
  }

  /** Het register zoals het nu is, als rapport: wat `main` meldt als er niets te klagen valt. */
  const alsRapport = (extra: Record<string, Rij> = {}) =>
    rapportUit({
      ...Object.fromEntries(
        Object.entries(NAGEKEKEN).map(([n, v]) => [
          n,
          { ernst: v.ernst, advisories: v.advisories, reparatie: v.reparatie },
        ]),
      ),
      ...extra,
    });

  function draai(modus: 'pr' | 'strikt', paar: unknown, rapport: unknown = alsRapport()) {
    const fout: string[] = [];
    const uit: string[] = [];
    const [echtFout, echtUit] = [console.error, console.log];
    console.error = (...a: unknown[]) => fout.push(a.map(String).join(' '));
    console.log = (...a: unknown[]) => uit.push(a.map(String).join(' '));
    try {
      const code = hoofd(() => rapport, {
        modus,
        leesBasis: () => paar as never,
      });
      return { code, fout: fout.join('\n'), uit: uit.join('\n') };
    } finally {
      [console.error, console.log] = [echtFout, echtUit];
    }
  }

  const paar = (basis: unknown, pr: unknown) => ({
    ok: true,
    ref: 'abcdef0123',
    notitie: null,
    basis,
    pr,
  });
  // Een advisory die er aan beide kanten staat en niet in NAGEKEKEN: de wereld die verandert.
  const WERELD = { 'nieuw-pakket': { ernst: 'high', advisories: [9000001] } };

  describe('modusUit', () => {
    it('geeft pr voor een pull_request en voor een push naar een andere branch', () => {
      expect(modusUit({ GITHUB_EVENT_NAME: 'pull_request' })).toBe('pr');
      expect(
        modusUit({
          GITHUB_EVENT_NAME: 'push',
          GITHUB_REF: 'refs/heads/claude/iets',
        }),
      ).toBe('pr');
    });

    it('geeft strikt voor main, het schema, een tag, een lege omgeving en iets onbekends', () => {
      expect(modusUit({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' })).toBe('strikt');
      expect(
        modusUit({
          GITHUB_EVENT_NAME: 'schedule',
          GITHUB_REF: 'refs/heads/main',
        }),
      ).toBe('strikt');
      expect(modusUit({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/tags/v1' })).toBe('strikt');
      expect(modusUit({ GITHUB_EVENT_NAME: 'push' })).toBe('strikt');
      expect(modusUit({})).toBe('strikt');
      expect(
        modusUit({
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_REF: 'refs/heads/x',
        }),
      ).toBe('strikt');
    });

    it('laat hoofd() zonder opties strikt, wat de omgeving ook zegt', () => {
      const oud = process.env.GITHUB_EVENT_NAME;
      process.env.GITHUB_EVENT_NAME = 'pull_request';
      try {
        const [echtFout, echtUit] = [console.error, console.log];
        console.error = () => undefined;
        console.log = () => undefined;
        try {
          expect(hoofd(() => alsRapport(WERELD))).toBe(1);
        } finally {
          [console.error, console.log] = [echtFout, echtUit];
        }
      } finally {
        if (oud === undefined) delete process.env.GITHUB_EVENT_NAME;
        else process.env.GITHUB_EVENT_NAME = oud;
      }
    });
  });

  describe('grendel 1 — de PR voegt toe', () => {
    it('is rood om een advisory die de PR zelf toevoegt en het register niet kent', () => {
      const uit = draai(
        'pr',
        paar(alsRapport(), alsRapport({ 'ander-pakket': { ernst: 'high', advisories: [42] } })),
      );

      expect(uit.code).toBe(1);
      expect(uit.fout).toContain("'ander-pakket': de PR voegt advisory 42 toe");
      expect(uit.fout).toContain('npm run build'); // de bouw-meting is de weg verder
    });

    it('is rood om een nieuwe advisory op een pakket dat de basis al kende', () => {
      const basis = alsRapport({
        'ander-pakket': { ernst: 'high', advisories: [42] },
      });
      const pr = alsRapport({
        'ander-pakket': { ernst: 'high', advisories: [42, 43] },
      });

      const uit = draai('pr', paar(basis, pr));

      expect(uit.code).toBe(1);
      expect(uit.fout).toContain('advisory 43');
      expect(uit.fout).not.toContain('advisory 42 ');
    });

    it('ziet dezelfde advisory onder een andere pakketnaam als nieuw', () => {
      const basis = alsRapport({
        'oud-pakket': { ernst: 'high', advisories: [42] },
      });
      const pr = alsRapport({
        'nieuw-pakket': { ernst: 'high', advisories: [42] },
      });

      expect(bijgekomen(basis, pr)).toEqual([{ naam: 'nieuw-pakket', advisory: 42 }]);
    });

    it('ziet een extra exemplaar van een bekende, niet-nagekeken advisory', () => {
      const basis = alsRapport({
        'ander-pakket': { ernst: 'high', advisories: [42], nodes: 1 },
      });
      const pr = alsRapport({
        'ander-pakket': { ernst: 'high', advisories: [42], nodes: 2 },
      });

      expect(bijgekomen(basis, pr)).toEqual([{ naam: 'ander-pakket', exemplaren: [1, 2] }]);
      expect(draai('pr', paar(basis, pr)).fout).toContain(
        'extra kwetsbaar exemplaar binnen (1 → 2)',
      );
    });

    it('laat een PR groen worden die de advisory mét een register-rij toevoegt', () => {
      // Een PR die een dependency met een advisory toevoegt hoort groen te kunnen
      // worden zodra de bouw-meting in NAGEKEKEN staat — zoals in strikte modus.
      const register = { 'ander-pakket': { advisories: [42] } };
      const pr = alsRapport({
        'ander-pakket': { ernst: 'high', advisories: [42] },
      });

      expect(bijgekomen(alsRapport(), pr, register as never)).toEqual([]);
    });
  });

  describe('grendel 2 — de wereld verandert', () => {
    it('is groen als dezelfde advisory aan beide kanten staat, ook zonder register-rij', () => {
      const uit = draai('pr', paar(alsRapport(WERELD), alsRapport(WERELD)), alsRapport(WERELD));

      expect(uit.code).toBe(0);
      expect(uit.uit).toContain('de PR voegt geen advisory toe');
      expect(uit.uit).toContain('1 afwijking(en)'); // wat er speelt wordt wel gezegd
    });

    it('blijft op main (strikt) rood op precies dezelfde situatie', () => {
      // De tegenproef: zonder deze toets kan "pr is groen" ook betekenen dat de
      // modus nooit rood meer wordt.
      const uit = draai('strikt', paar(alsRapport(WERELD), alsRapport(WERELD)), alsRapport(WERELD));

      expect(uit.code).toBe(1);
      expect(uit.fout).toContain("'nieuw-pakket'");
    });

    it('is groen als de PR een advisory juist weghaalt', () => {
      expect(draai('pr', paar(alsRapport(WERELD), alsRapport())).code).toBe(0);
    });

    it('blameert een PR niet voor wat de basis ervoor bijgekregen heeft', () => {
      expect(bijgekomen(alsRapport(WERELD), alsRapport())).toEqual([]);
    });
  });

  describe('grendel 3 — de basis is niet te lezen, of een meting mislukt', () => {
    const onleesbaar = {
      ok: false,
      reden: 'origin/main is niet te lezen en niet op te halen (test)',
    };

    it('valt terug op het strikte oordeel en zegt dat hardop', () => {
      const uit = draai('pr', onleesbaar);

      expect(uit.code).toBe(0); // het register klopt, dus strikt is hier groen
      expect(uit.fout).toContain('PR-modus niet mogelijk');
      expect(uit.fout).toContain('origin/main is niet te lezen');
    });

    it('is bij die terugval nog steeds rood op een afwijking van het register', () => {
      const uit = draai('pr', onleesbaar, alsRapport(WERELD));

      expect(uit.code).toBe(1);
      expect(uit.fout).toContain('PR-modus niet mogelijk');
      expect(uit.fout).toContain("'nieuw-pakket'");
    });

    it('is ongemeten en niet groen als de meting van de PR geen rapport geeft', () => {
      const uit = draai('pr', paar(alsRapport(), { message: 'ECONNREFUSED' }));

      expect(uit.code).toBe(1);
      expect(uit.fout).toContain('OVERGESLAGEN');
      expect(uit.fout).toContain('de meting van de PR');
    });

    it('is ongemeten en niet groen als de meting van de basis geen rapport geeft', () => {
      const uit = draai('pr', paar({ message: 'ECONNREFUSED' }, alsRapport()));

      expect(uit.code).toBe(1);
      expect(uit.fout).toContain('OVERGESLAGEN');
      expect(uit.fout).toContain('de meting van de basis');
    });

    it('noemt een ondiepe basis hardop maar blijft meten', () => {
      const [echtFout, echtUit] = [console.error, console.log];
      const fout: string[] = [];
      console.error = (...a: unknown[]) => fout.push(a.map(String).join(' '));
      console.log = () => undefined;
      try {
        const code = prOordeel({
          ...paar(alsRapport(), alsRapport()),
          notitie: 'ondiepe checkout',
        } as never);
        expect(code).toBe(0);
      } finally {
        [console.error, console.log] = [echtFout, echtUit];
      }
      expect(fout.join('\n')).toContain('ondiepe checkout');
    });
  });

  describe('de PR maakt het register onjuist', () => {
    // ⚠️ Zonder deze grendel is een PR die `npm audit fix` draait groen en wordt `main` er rood van.
    const zonder = (naam: string) => {
      const r = alsRapport() as { vulnerabilities: Record<string, unknown> };
      delete r.vulnerabilities[naam];
      return r;
    };

    it('is rood als de PR een kwetsbaar pakket weghaalt terwijl zijn rij blijft staan', () => {
      const uit = draai('pr', paar(alsRapport(), zonder('brace-expansion')));

      expect(uit.code).toBe(1);
      expect(uit.fout).toContain('verdwenen brace-expansion');
      expect(uit.fout).toContain('Er staat een rij in NAGEKEKEN'); // het advies voor een verdwenen rij
      expect(uit.fout).not.toContain('ga bouwen');
    });

    it('is rood als de PR de ernst of de reparatie van een bekend pakket laat verschuiven', () => {
      const r = alsRapport() as {
        vulnerabilities: Record<string, { severity: string }>;
      };
      (r.vulnerabilities.zod as { severity: string }).severity = 'critical';

      expect(registerSchade(alsRapport(), r)).toEqual([
        expect.stringContaining('veranderd zod: ernst'),
      ]);
    });

    it('rekent een afwijking die ook op de basis staat niet de PR aan', () => {
      expect(registerSchade(alsRapport(WERELD), alsRapport(WERELD))).toEqual([]);
    });

    it('zegt in de groene melding het aantal van de basis en niet dat van de PR', () => {
      const uit = draai('pr', paar(alsRapport(), alsRapport()));

      expect(uit.uit).toContain('0 afwijking(en)');
    });
  });

  describe('cli — de modus komt uit de omgeving', () => {
    const basis = () => paar(alsRapport(WERELD), alsRapport(WERELD));
    const draaiCli = (omgeving: Record<string, string>) => {
      const [echtFout, echtUit] = [console.error, console.log];
      console.error = () => undefined;
      console.log = () => undefined;
      try {
        return cli(
          omgeving,
          () => alsRapport(WERELD),
          () => basis() as never,
        );
      } finally {
        [console.error, console.log] = [echtFout, echtUit];
      }
    };

    it('blijft op main en in het schema strikt: een wereldverandering is daar rood', () => {
      expect(draaiCli({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' })).toBe(1);
      expect(
        draaiCli({
          GITHUB_EVENT_NAME: 'schedule',
          GITHUB_REF: 'refs/heads/main',
        }),
      ).toBe(1);
      expect(draaiCli({})).toBe(1);
    });

    it('is op een pull_request groen op dezelfde situatie', () => {
      expect(draaiCli({ GITHUB_EVENT_NAME: 'pull_request' })).toBe(0);
    });
  });

  describe('leesBasisEnPr', () => {
    const bestanden = {
      ok: true,
      ref: 'abc1234',
      notitie: null,
      pakket: '{"name":"b"}',
      lock: '{}',
    };

    it('meet de PR en de basis elk in een eigen tijdelijke map, PR eerst, en ruimt op', () => {
      const mappen: string[] = [];
      const uit = leesBasisEnPr(bestanden as never, (map?: string) => {
        mappen.push(map as string);
        return { vulnerabilities: {} };
      });

      expect(uit.ok).toBe(true);
      expect(mappen).toHaveLength(2);
      expect(new Set(mappen).size).toBe(2);
      for (const m of mappen) expect(m).not.toBe(process.cwd());
      expect(mappen[0]).toContain('audit-pr-'); // eerst de PR, dan de basis
      expect(mappen[1]).toContain('audit-basis-');
      for (const m of mappen) expect(existsSync(m)).toBe(false);
    });

    it('valt terug op strikt, hardop, als de basis workspaces draagt', () => {
      const uit = leesBasisEnPr(
        { ...bestanden, pakket: '{"workspaces":["packages/*"]}' } as never,
        () => ({}),
      );

      expect(uit.ok).toBe(false);
      expect((uit as { reden?: string }).reden).toContain('workspaces');
    });
  });

  describe('exemplarenUit', () => {
    it('telt alleen de wortels, en nul zonder nodes', () => {
      const rapport = {
        vulnerabilities: {
          a: { via: [{ source: 1 }], nodes: ['x', 'y'] },
          b: { via: ['a'], nodes: ['z'] },
          c: { via: [{ source: 2 }] },
        },
      };
      expect({ ...exemplarenUit(rapport) }).toEqual({ a: 2, c: 0 });
    });
  });

  describe('basisBestanden — met een echte git-repo op schijf', () => {
    const mappen: string[] = [];
    afterEach(() => {
      while (mappen.length) rmSync(mappen.pop() as string, { recursive: true, force: true });
    });

    function repo(): string {
      const map = mkdtempSync(join(tmpdir(), 'audit-test-'));
      mappen.push(map);
      const g = (...a: string[]) =>
        execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], {
          cwd: map,
          stdio: 'pipe',
        });
      g('init', '-q', '-b', 'main');
      writeFileSync(join(map, 'package.json'), '{"name":"basis"}');
      writeFileSync(join(map, 'package-lock.json'), '{"lockfileVersion":3}');
      g('add', '.');
      g('commit', '-q', '-m', 'basis');
      return map;
    }

    const git = (map: string, ...a: string[]) =>
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], {
        cwd: map,
        encoding: 'utf8',
      }).trim();

    it('leest de bestanden op het splitspunt, niet de punt van origin/main', () => {
      const map = repo();
      const splits = git(map, 'rev-parse', 'HEAD');
      git(map, 'checkout', '-q', '-b', 'tak');
      writeFileSync(join(map, 'package.json'), '{"name":"tak"}');
      git(map, 'commit', '-q', '-am', 'tak');
      git(map, 'checkout', '-q', 'main');
      writeFileSync(join(map, 'package.json'), '{"name":"main-verder"}');
      git(map, 'commit', '-q', '-am', 'main verder');
      git(map, 'update-ref', 'refs/remotes/origin/main', 'main');
      git(map, 'checkout', '-q', 'tak');

      const uit = basisBestanden(map);

      expect(uit).toMatchObject({
        ok: true,
        ref: splits,
        pakket: '{"name":"basis"}',
      });
    });

    it('meldt een mislukking als origin/main ontbreekt en er niets op te halen valt', () => {
      const uit = basisBestanden(repo());

      expect(uit.ok).toBe(false);
      expect(uit.reden).toContain('origin/main is niet te lezen');
    });

    it('meldt een mislukking als de basis geen package-lock.json draagt', () => {
      const map = repo();
      git(map, 'rm', '-q', 'package-lock.json');
      git(map, 'commit', '-q', '-m', 'zonder lock');
      git(map, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

      const uit = basisBestanden(map);

      expect(uit.ok).toBe(false);
      expect(uit.reden).toContain('ontbreekt');
    });
  });
});
