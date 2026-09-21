import { describe, expect, it } from 'vitest';

import { BEKEND, klachten, vondsten } from '../../scripts/triggeruitzetting-controle.mjs';

/**
 * De grendel op `disable trigger` in de testboom — QS8-481.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken.** Daarom krijgt
 *    `vondsten()` hier élke vorm los aangeboden: de vormen die hij moet vinden
 *    én de vormen die hij met rust moet laten. Die tweede helft is even
 *    belangrijk — een controle die alles meldt, leer je negeren.
 */
describe('vondsten', () => {
  it('vindt een echte disable', () => {
    const uit = vondsten('a.ts', 'alter table public.x disable trigger y;');

    expect(uit).toHaveLength(1);
    expect(uit[0]?.regel).toBe(1);
  });

  /**
   * ⚠️ **De drie proza-vormen, en ze staan alle drie écht in de testboom.**
   *    📏 Gemeten: vijf van de twaalf treffers op `disable trigger` zijn een kop
   *    of een comment. Zou de controle die meetellen, dan eist hij een
   *    registerregel voor een zin — en dan leer je het register invullen zonder
   *    te kijken.
   */
  it.each([
    [' * ⚠️ Deze test doet `disable trigger` én een drop', 'jsdoc-regel'],
    ['// ⚠️ `alter table … disable trigger` kost een lock', 'regelcommentaar'],
    ['/* alter table x disable trigger y; */', 'blokcommentaar'],
  ])('laat %s met rust (%s)', (regel) => {
    expect(vondsten('a.ts', regel)).toEqual([]);
  });

  /**
   * ⚠️ **De tegentoets op de knip zelf.** QS8-412 kostte dit project een ijking
   *    doordat een knip die commentaar weghaalde ook een URL opat. Deze knip
   *    kijkt alleen naar het begin van de regel, dus een `//` midden in een
   *    string blijft code — en dat hoort zo.
   */
  it('telt een disable mee als er verderop op de regel een // staat', () => {
    const uit = vondsten('a.ts', "psql('alter table x disable trigger y;'); // let op");

    expect(uit).toHaveLength(1);
  });

  it('vindt niets in een bestand zonder disable', () => {
    expect(vondsten('a.ts', 'alter table x enable trigger y;')).toEqual([]);
  });
});

describe('klachten', () => {
  const register = [{ pad: 'tests/rls/a.test.ts', reden: 'in-transactie' }];

  it('zwijgt over een geregistreerd bestand', () => {
    const uit = klachten([{ pad: 'tests/rls/a.test.ts', regel: 3, tekst: '…' }], register);

    expect(uit).toEqual([]);
  });

  it('meldt een disable in een bestand dat niet in het register staat', () => {
    // ⚠️ Het geregistreerde bestand moet mee in de invoer, anders verloopt zijn
    //    regel en meet dit geval twee dingen tegelijk.
    const uit = klachten(
      [
        { pad: 'tests/rls/a.test.ts', regel: 1, tekst: '…' },
        { pad: 'tests/rls/nieuw.test.ts', regel: 9, tekst: '…' },
      ],
      register,
    );

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('tests/rls/nieuw.test.ts:9');
    expect(uit[0]).toContain('héle database');
  });

  /**
   * ⚠️ **De ratel slaat twee kanten op.** Een registerregel die nergens meer op
   *    slaat, zegt "dit is beoordeeld" over een toestand die niet meer bestaat —
   *    en dekt daarna de vólgende disable in dat bestand stilzwijgend af.
   *    📏 Deze helft vond bij het bouwen meteen een fout van mijzelf:
   *    `remdekking.test.ts` stond in het register terwijl het de term alleen in
   *    zijn ijkingskop noemt.
   */
  it('meldt een registerregel die geen enkele disable meer dekt', () => {
    const uit = klachten([], register);

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('haal de regel weg');
  });
});

describe('het register zelf', () => {
  /** ⚠️ Een rij zonder reden is geen rij — dan is het een TODO met een vinkje. */
  it('draagt bij elke regel een reden van betekenis', () => {
    for (const r of BEKEND) {
      expect(r.reden.length, `${r.pad} heeft een te dunne reden`).toBeGreaterThan(40);
    }
  });
});
