import { describe, expect, it } from 'vitest';

import {
  beoordeel,
  REDENEN,
  vondsten,
  ZONDER_PROEFCODE,
} from '../../scripts/proefcode-controle.mjs';

/**
 * QS8-542 — de grendel die `proefCode()` in gebruik houdt.
 *
 * ⚠️ **De tweede helft telt hier even zwaar als de eerste.** De testboom staat
 *    vol schreeuwende constanten (`'INSERT'`, `'GELUKT'`, `'OVERGESLAGEN'`), en
 *    een controle die die allemaal meldt, leer je uitzetten. Vandaar evenveel
 *    gevallen die hij met rust moet laten als gevallen die hij moet vinden.
 */

describe('wat hij moet vinden', () => {
  it('meldt een letterlijke code op een regel die `invite_code` noemt', () => {
    const uit = vondsten("      invite_code: 'WELKOMWELKOM',", 'tests/rls/x.test.ts');
    expect(uit).toEqual([{ pad: 'tests/rls/x.test.ts', regel: 1, code: 'WELKOMWELKOM' }]);
  });

  it('meldt hem ook in een SQL-regel', () => {
    const sql = "    insert into groups (name, invite_code) select 'Pin', 'PINCODE1' from t;";
    expect(vondsten(sql, 'a.ts').map((v) => v.code)).toEqual(['PINCODE1']);
  });

  it('meldt twee codes op één regel allebei', () => {
    const r = "{ kolom: 'invite_code', nieuw: 'GEKAAPT1', hoortTeBlijven: 'PINCODE1' }";
    expect(vondsten(r, 'a.ts').map((v) => v.code)).toEqual(['GEKAAPT1', 'PINCODE1']);
  });
});

describe('wat hij met rust moet laten', () => {
  it('zwijgt over een regel zonder `invite_code`', () => {
    // ⚠️ Dit is de filter die hem bruikbaar maakt. Zonder deze eis meldt hij elke
    //    hoofdletterconstante in 443 testbestanden.
    expect(vondsten("      const uitslag = 'WELKOMWELKOM';", 'a.ts')).toEqual([]);
  });

  it('zwijgt over `proefCode()` op een invite_code-regel', () => {
    const r = "      invite_code: proefCode('pin', 1),";
    expect(vondsten(r, 'a.ts')).toEqual([]);
  });

  it('zwijgt over een commentaarregel die een oude code noemt', () => {
    // ⚠️ `avatarbucket.test.ts` legt in commentaar uit dát er ooit `'AVTST1'`
    //    stond. Een controle die de uitleg van een reparatie meldt, bewaakt de
    //    verkeerde kant.
    expect(vondsten("    //    reparatie. Hier stond `'AVTST1'` op invite_code", 'a.ts')).toEqual([]);
    expect(vondsten("     * invite_code was 'AVTST1' — zie QS8-336", 'a.ts')).toEqual([]);
  });

  it('zwijgt over schreeuwende constanten die geen code zijn', () => {
    const r = "    verwacht(uitslag, 'GEWEIGERD'); // invite_code";
    expect(vondsten(r, 'a.ts')).toEqual([]);
  });

  it('zwijgt over een korte waarde — een code is minstens zes tekens', () => {
    expect(vondsten("      invite_code: 'AB12',", 'a.ts')).toEqual([]);
  });
});

describe('het register', () => {
  const VONDST = { pad: 'tests/rls/policies.test.ts', regel: 9, code: 'WELKOMWELKOM' };

  it('dekt precies de waarde die erin staat', () => {
    expect(beoordeel([VONDST]).gemeld).toEqual([]);
  });

  it('dekt géén andere code in datzelfde bestand', () => {
    // ⚠️ Anders is één vrijbrief een vrijbrief voor het hele bestand, en dan
    //    glijdt de volgende letterlijke code er ongezien in.
    const andere = { ...VONDST, code: 'ANDERE1' };
    expect(beoordeel([andere]).gemeld).toEqual([andere]);
  });

  it('wordt rood als een registerrij niets meer dekt', () => {
    expect(beoordeel([]).verdwenen).toEqual(['tests/rls/policies.test.ts']);
  });

  it('geeft bij elke vrijbrief een meting en niet alleen een mening', () => {
    for (const pad of Object.keys(ZONDER_PROEFCODE)) {
      expect(REDENEN[pad], `${pad} heeft geen reden`).toBeDefined();
      expect(REDENEN[pad], `${pad} noemt geen meting`).toContain('📏');
    }
  });
});

describe('de testboom zoals hij nu is', () => {
  it('draagt precies één uitzondering', () => {
    expect(Object.keys(ZONDER_PROEFCODE)).toEqual(['tests/rls/policies.test.ts']);
  });
});
