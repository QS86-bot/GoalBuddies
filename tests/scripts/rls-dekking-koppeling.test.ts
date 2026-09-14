/**
 * De belofte: `rls:dekking` meet de database die hij muteert — QS8-497.
 *
 * ⚠️⚠️ **Waarom dit een grendel nodig heeft.** Het script muteert via `psql()`
 *    naar `(host, poort, db)`; de suite praat met PostgREST op
 *    `RLS_LOKAAL_URL`, en dat is wat PostgREST bij het starten in zijn `db-uri`
 *    kreeg. Wijzen die twee naar verschillende databases, dan zet je de ene
 *    wagenwijd open en meet je de andere.
 *
 *    Bij een verkeerde **poort** heet álles "onbewaakt" — dat valt op. Staat er
 *    een tweede `goalbuddies_rls` op een andere poort, dan is het **stil**: elk
 *    gat komt eruit als bewaakt. Dat is de gevaarlijke richting, en precies de
 *    naad van regel 18: beide helften kloppen los en niemand toetst dat ze op
 *    hetzelfde wijzen.
 *
 * ⚠️ **Het oordeel staat los van het meten**, want een controle die je niet kunt
 *    voeden, kun je niet ijken. De IO-kant (een merkteken planten en PostgREST
 *    ernaar vragen) is met de hand gemeten; zie het beslisdocument.
 */
import { describe, expect, it } from 'vitest';

import { beoordeelKoppeling } from '../../scripts/rls-dekking.mjs';

describe('beoordeelKoppeling', () => {
  it('laat de goede stand door: PostgREST kent het merkteken', () => {
    expect(beoordeelKoppeling({ status: 200, merk: 'pgrst_koppeling_abc' })).toEqual({ ok: true });
  });

  /**
   * ⚠️ Dit is het stille geval, en het is de reden dat deze controle bestaat.
   *    De melding moet zeggen dát het twee databases zijn — niet "alles
   *    onbewaakt", want dan zoekt de lezer de fout in de policies.
   */
  it('weigert als PostgREST het merkteken niet kent, en zegt waarom', () => {
    const uit = beoordeelKoppeling({ status: 404, merk: 'pgrst_koppeling_abc' });

    expect(uit.ok).toBe(false);
    expect(uit.reden).toContain('niet dezelfde');
    expect(uit.reden).toContain('pgrst_koppeling_abc');
    // De melding hoort de lezer te waarschuwen voor de gevaarlijke richting.
    expect(uit.reden).toContain('bewaakt');
  });

  it('houdt een onbereikbare PostgREST apart van een andere database', () => {
    const uit = beoordeelKoppeling({ status: null, merk: 'x', fout: 'ECONNREFUSED' });

    expect(uit.ok).toBe(false);
    expect(uit.reden).toContain('antwoordde niet');
    expect(uit.reden).toContain('ECONNREFUSED');
    // ⚠️ Niet dezelfde tekst als het 404-geval: een storing is iets anders dan
    //    twee databases, en één melding voor allebei stuurt de lezer verkeerd.
    expect(uit.reden).not.toContain('niet dezelfde');
  });

  it('meldt een onverwachte status als storing en niet als mismatch', () => {
    const uit = beoordeelKoppeling({ status: 500, merk: 'x' });

    expect(uit.ok).toBe(false);
    expect(uit.reden).toContain('500');
    expect(uit.reden).toContain('onbruikbaar');
  });

  /**
   * ⚠️ De helft die even zwaar telt: de vormen die hij met rust moet laten.
   *    Een controle die ook op 200 iets te melden heeft, leer je uitzetten.
   */
  it('heeft bij 200 geen reden, en dus niets te melden', () => {
    const uit = beoordeelKoppeling({ status: 200, merk: 'x' });

    expect(uit.reden).toBeUndefined();
    expect(Object.keys(uit)).toEqual(['ok']);
  });
});
