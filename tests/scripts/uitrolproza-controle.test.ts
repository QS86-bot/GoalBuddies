import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leidt ze af via `allowJs`.
//    Zelfde patroon als `rls-dekking.test.ts` — dus zonder `@ts-expect-error`,
//    want die is hier ongebruikt en `tsc` wordt daar zelf rood van.
import {
  beoordeel,
  openRijen,
  standClaims,
  wachtOpUitrol,
} from '../../scripts/uitrolproza-controle.mjs';

/**
 * De grendel van QS8-560: de productiestand staat in dossierproza én in
 * `supabase/uitgerold.json`, en niets hield ze gelijk.
 *
 * ⚠️ **Beide helften staan hieronder**, en de tweede is even belangrijk als de
 *    eerste: een controle die alles meldt, leer je te negeren. Een dossierrij
 *    noemt voortdurend migratienummers — van de lokale stack, van de map, van
 *    de reparatie — en alleen een nummer dat aan *productie* wordt opgehangen
 *    is een bewering over de uitrolstand.
 */

const rij = (tekst: string, risico = 'Laag') => `| 2026-09-19 | Titel | ${tekst} | ${risico} |`;

describe('standClaims — wat een bewering over de productiestand is', () => {
  it('vindt "productie staat op 0221"', () => {
    expect(standClaims('📏 productie staat op 0221 en kent alleen avatars')).toEqual([
      { citaat: 'productie staat op 0221', nummer: '0221' },
    ]);
  });

  it('vindt hem ook vet en tussen backticks', () => {
    expect(standClaims('productie staat op **0282**').map((c: { nummer: string }) => c.nummer)).toEqual(['0282']);
    expect(standClaims('productie staat op `0146`').map((c: { nummer: string }) => c.nummer)).toEqual(['0146']);
  });

  it('vindt de vorm met "stand"', () => {
    expect(standClaims('op productie — stand **0282** — nagerekend').map((c: { nummer: string }) => c.nummer)).toEqual([
      '0282',
    ]);
  });

  /**
   * ⚠️⚠️ **De helft die hij met rust moet laten.** Een dossierrij die een
   *    migratienummer noemt doet meestal géén uitspraak over de uitrolstand.
   *    Zonder deze grens meldt de controle elke rij die ooit een nummer noemt,
   *    en dat zijn er honderden.
   */
  it('laat een migratienummer zonder productie-claim met rust', () => {
    expect(standClaims('gerepareerd in migratie 0286, met rollback-pad')).toEqual([]);
  });

  it('laat de lokale stack met rust', () => {
    expect(standClaims('📏 Lokale stack, stand 0288: de CHECK staat er')).toEqual([]);
  });

  /** ⚠️ `productie` ver weg van het nummer is geen claim over dát nummer. */
  it('koppelt niet over een halve zin heen', () => {
    const ver = 'productie is een ander verhaal, en dat staat los van wat er in de map gebeurde rond 0230';

    expect(standClaims(ver)).toEqual([]);
  });
});

describe('wachtOpUitrol — zegt deze rij dat hijzelf wacht?', () => {
  it('herkent "nog open tot de uitrol"', () => {
    expect(wachtOpUitrol('Nog open tot de uitrol. Zie 0286.')).toEqual({ wacht: true, hoogste: '0286' });
  });

  it('herkent "niet uitgerold" en neemt het hóógste nummer', () => {
    expect(wachtOpUitrol('0283 t/m 0289 zijn niet uitgerold')).toEqual({ wacht: true, hoogste: '0289' });
  });

  /**
   * ⚠️⚠️ **`terecht openstaat` hoort hier níet bij, en dat is met een geval
   *    gemeten.** 📏 In rij 752 slaat die zin op een *ándere* rij die daar als
   *    voorbeeld besproken wordt — de controle zou dan een bevinding opleveren
   *    over een bewering die de rij zelf niet doet.
   */
  it('gaat niet af op een zin die over een ándere rij gaat', () => {
    const r752 = 'de rij van 07-09 waar de reparatie (0238) boven de productielijn ligt en de rij dus terecht openstaat';

    expect(wachtOpUitrol(r752)).toEqual({ wacht: false, hoogste: null });
  });

  it('gaat niet af op een rij zonder wachtzin', () => {
    expect(wachtOpUitrol('gerepareerd in 0286 en gemerged')).toEqual({ wacht: false, hoogste: null });
  });
});

describe('openRijen', () => {
  it('leest alleen tabelrijen met een risiconiveau', () => {
    const inhoud = ['# kop', '| datum | wat | hoe | Laag |', 'gewone zin', '| a | b | c | ~~Laag~~ opgelost |'].join(
      '\n',
    );

    expect(openRijen(inhoud).map((r: { regel: number }) => r.regel)).toEqual([2]);
  });
});

describe('beoordeel', () => {
  it('meldt een rij die een andere stand noemt', () => {
    const rijen = openRijen(rij('📏 productie staat op 0221 en kent alleen avatars'));

    expect(beoordeel(rijen, '0282').afwijkend).toHaveLength(1);
  });

  it('zwijgt over een rij die dezelfde stand noemt', () => {
    const rijen = openRijen(rij('📏 productie staat op 0282'));

    expect(beoordeel(rijen, '0282')).toEqual({ afwijkend: [], ingehaald: [] });
  });

  /** ⚠️ Wachten op iets dat nog bóven de lijn ligt, is de normale toestand. */
  it('zwijgt over een rij die op een uitrol wacht die er nog niet is', () => {
    const rijen = openRijen(rij('0289 is niet uitgerold, dus dit blijft open'));

    expect(beoordeel(rijen, '0282').ingehaald).toEqual([]);
  });

  it('meldt een rij die wacht op een uitrol die geland is', () => {
    const rijen = openRijen(rij('0238 is niet uitgerold, dus dit blijft open'));
    const { ingehaald } = beoordeel(rijen, '0282');

    expect(ingehaald).toHaveLength(1);
    expect(ingehaald[0].hoogste).toBe('0238');
  });

  /** ⚠️ Precies op de lijn telt als geland: `0282` ís uitgerold. */
  it('telt de stand zelf als geland', () => {
    const rijen = openRijen(rij('0282 is niet uitgerold'));

    expect(beoordeel(rijen, '0282').ingehaald).toHaveLength(1);
  });
});
