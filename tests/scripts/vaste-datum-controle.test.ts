import { describe, expect, it } from 'vitest';

import {
  VENSTER_DAGEN,
  ZONDER_VERLOOP,
  hoofd,
  vindVerlopende,
  wezen,
} from '../../scripts/vaste-datum-controle.mjs';
import { datumOver } from '../rls/datums';

/**
 * `npm run datums:controle` — QS8-675.
 *
 * ⚠️ **De belofte is niet "er staat geen vaste datum" maar "geen RLS-toets valt om
 *    op een kalenderdag zonder dat iemand het zag aankomen".** Daarom toetst dit
 *    bestand wat de controle vindt én wat hij met rust laat: een controle die
 *    alles meldt, leer je negeren.
 */

const VANDAAG = '2026-11-09';
const bestand = (inhoud: string, pad = 'tests/rls/x.test.ts') => [{ pad, inhoud }];

describe('vindVerlopende', () => {
  it('vindt een streefdatum in het verleden', () => {
    const uit = vindVerlopende(bestand(".insert({ target_date: '2026-11-07' })"), VANDAAG);

    expect(uit).toEqual([
      { pad: 'tests/rls/x.test.ts', regel: 1, sleutel: 'target_date', datum: '2026-11-07', dagen: -2 },
    ]);
  });

  it('vindt p_new_date en p_date, niet alleen target_date', () => {
    const uit = vindVerlopende(
      bestand("p_new_date: '2026-12-01',\np_date: \"2026-12-02\","),
      VANDAAG,
    );

    expect(uit.map((u) => u.sleutel)).toEqual(['p_new_date', 'p_date']);
  });

  it('laat de grens van het venster zelf door en meldt één dag eronder', () => {
    const op = datumPlus(VANDAAG, VENSTER_DAGEN);
    const eronder = datumPlus(VANDAAG, VENSTER_DAGEN - 1);

    expect(vindVerlopende(bestand(`target_date: '${op}'`), VANDAAG)).toEqual([]);
    expect(vindVerlopende(bestand(`target_date: '${eronder}'`), VANDAAG)).toHaveLength(1);
  });

  it('laat een datum ver weg met rust', () => {
    expect(vindVerlopende(bestand("target_date: '2030-01-01'"), VANDAAG)).toEqual([]);
  });

  it('laat commentaar met een datum met rust', () => {
    const inhoud = "// target_date: '2026-11-07' stond hier eerst\n * target_date: '2026-11-07'";

    expect(vindVerlopende(bestand(inhoud), VANDAAG)).toEqual([]);
  });

  it('laat andere sleutels met rust, ook als hun datum verleden is', () => {
    const inhoud = "cycle_start_date: '2026-01-05',\nlocal_date: '2026-02-02',";

    expect(vindVerlopende(bestand(inhoud), VANDAAG)).toEqual([]);
  });

  it('laat een waarde uit datumOver() met rust', () => {
    expect(vindVerlopende(bestand('target_date: datumOver(30)'), VANDAAG)).toEqual([]);
  });

  it('laat een geregistreerde uitzondering door, en alleen die plek', () => {
    const uitzondering = { 'tests/rls/x.test.ts:2026-01-01': 'reden' };

    const uit = vindVerlopende(
      bestand("old_value: { target_date: '2026-01-01' },\ntarget_date: '2026-02-02'"),
      VANDAAG,
      VENSTER_DAGEN,
      uitzondering,
    );

    expect(uit.map((u) => u.datum)).toEqual(['2026-02-02']);
  });
});

describe('wezen', () => {
  it('noemt een uitzondering waarvan de plek verdwenen is', () => {
    const register = { 'tests/rls/x.test.ts:2026-01-01': 'reden' };

    expect(wezen(bestand("target_date: '2030-01-01'"), register)).toEqual([
      'tests/rls/x.test.ts:2026-01-01',
    ]);
    expect(wezen(bestand("target_date: '2026-01-01'"), register)).toEqual([]);
  });

  it('kent elke uitzondering van het echte register een reden', () => {
    for (const reden of Object.values(ZONDER_VERLOOP)) expect(reden.length).toBeGreaterThan(20);
  });
});

describe('hoofd', () => {
  function draai(inhoud: string) {
    const fout: string[] = [];
    const [echtFout, echtUit] = [console.error, console.log];
    console.error = (...a: unknown[]) => fout.push(a.map(String).join(' '));
    console.log = () => undefined;
    try {
      return { code: hoofd(bestand(inhoud), VANDAAG), fout: fout.join('\n') };
    } finally {
      [console.error, console.log] = [echtFout, echtUit];
    }
  }

  it('geeft rood met bestand, regel en de weg eruit', () => {
    const uit = draai("x\n.insert({ target_date: '2026-11-07' })");

    expect(uit.code).toBe(1);
    expect(uit.fout).toContain('tests/rls/x.test.ts:2');
    expect(uit.fout).toContain('datumOver()');
  });

  it('laat een uitzondering die nergens meer naar wijst de controle rood maken', () => {
    // Het echte register wijst naar policies.test.ts; een bestand zonder die plekken
    // laat beide rijen wees worden.
    expect(draai("target_date: datumOver(30)").code).toBe(1);
  });
});

describe('datumOver', () => {
  it('geeft een ISO-datum die ten minste het gevraagde aantal dagen vooruit ligt', () => {
    const vandaag = new Date().toISOString().slice(0, 10);
    const dagen = Math.round((Date.parse(datumOver(30)) - Date.parse(vandaag)) / 86_400_000);

    expect(datumOver(30)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dagen).toBe(30);
  });

  it('weigert een marge die een tijdzone de ondergrens van 0170 laat raken', () => {
    expect(() => datumOver(1)).toThrow(/minstens 2/);
    expect(() => datumOver(0)).toThrow();
    expect(() => datumOver(2.5)).toThrow();
  });
});

function datumPlus(iso: string, dagen: number): string {
  return new Date(Date.parse(iso) + dagen * 86_400_000).toISOString().slice(0, 10);
}
