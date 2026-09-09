import { describe, expect, it } from 'vitest';

import { PUSH_WEIGERGRONDEN, pushWeigerMelding } from './push-redenen';

/**
 * Elke weigergrond levert een zin op — QS8-377.
 *
 * ⚠️⚠️ **`t()` valt bij een ontbrekende sleutel terug op de sleutel zélf**
 *    (`CATALOGI[huidig][sleutel] ?? nl[sleutel] ?? sleutel`). Een vergeten
 *    catalogusregel geeft dus geen lege string en geen fout, maar zet
 *    `push.te_veel_tokens` letterlijk in het scherm. Dát is wat deze test zoekt:
 *    de belofte is "de gebruiker leest een zin", niet "er komt iets terug".
 *
 * ⚠️ De sleutel bestaat als type — `Sleutel` is een unie — dus de compiler vangt
 *    een verzónnen sleutel al. Wat hij niet vangt is een sleutel die uit béide
 *    catalogi verdwijnt, en dat is precies het geval hieronder.
 */
describe('pushWeigerMelding', () => {
  it('geeft voor elke weigergrond een zin en niet de sleutel', () => {
    for (const grond of PUSH_WEIGERGRONDEN) {
      const zin = pushWeigerMelding(grond);

      expect(zin, `${grond} gaf een lege melding`).not.toBe('');
      expect(zin, `${grond} gaf de sleutel terug in plaats van een zin`).not.toMatch(/^push\./);
    }
  });

  it('geeft de drie die iets uitleggen een eigen zin', () => {
    // ⚠️ Zonder dit geval zou een `pushWeigerMelding` die álles op de algemene
    //    zin gooit ook groen zijn bij de test hierboven — en dan is de hele
    //    vertaalslag een dure omweg naar één zin.
    const algemeen = pushWeigerMelding('geen_pushdienst');

    for (const grond of ['geen_websleutels', 'te_veel_tokens', 'not_signed_in'] as const) {
      expect(pushWeigerMelding(grond), `${grond} kreeg de algemene zin`).not.toBe(algemeen);
    }
  });

  it('geeft een onbekende grond de algemene zin, en dat is geen omissie', () => {
    // ⚠️ **De zes overige gronden vallen met opzet op één zin.** `geen_token`,
    //    `onbekend_platform`, `token_te_lang`, `sleutel_te_lang`,
    //    `geen_pushdienst` en `geen_expotoken` verschillen voor een ontwikkelaar
    //    en niet voor de persoon die op de knop drukte: die kan er hetzelfde aan
    //    doen. Een verzonnen oorzaak zou eerlijker klinken en minder waar zijn.
    expect(pushWeigerMelding('iets_wat_nog_niet_bestaat')).toBe(
      pushWeigerMelding('geen_expotoken'),
    );
    expect(pushWeigerMelding(undefined)).toBe(pushWeigerMelding('geen_expotoken'));
  });
});
