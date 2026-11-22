import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leidt ze af via `allowJs`.
//    Zelfde patroon als `rls-dekking.test.ts` — dus zonder `@ts-expect-error`,
//    want die is hier ongebruikt en `tsc` wordt daar zelf rood van.
import {
  beoordeel,
  geldigeDatum,
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
      { citaat: 'productie staat op 0221', nummer: '0221', datum: null },
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

describe('standClaims — de datum van de meting (QS8-786)', () => {
  const datum = (tekst: string) => standClaims(tekst).map((c: { datum: string | null }) => c.datum);

  it('leest "stand van DD-MM-JJJJ" direct na het getal', () => {
    expect(datum('productie staat op 0337 (stand van 22-11-2026)')).toEqual(['22-11-2026']);
  });

  it('leest hem ook na een vet getal', () => {
    expect(datum('productie staat op **0337** (stand van 22-11-2026; zie `supabase/uitgerold.json`)')).toEqual([
      '22-11-2026',
    ]);
  });

  it('leest hem ook na een getal in een codespan', () => {
    expect(datum('productie staat op `0337` (stand van 22-11-2026)')).toEqual(['22-11-2026']);
  });

  it('leest hem zonder haakjes, ook na een komma', () => {
    expect(datum('productie staat op 0337, stand van 22-11-2026')).toEqual(['22-11-2026']);
    expect(datum('productie staat op 0337 stand van 22-11-2026')).toEqual(['22-11-2026']);
  });

  /**
   * ⚠️⚠️ **De grendel die de markering aan de bewering bindt.** Een rij
   *    draagt in zijn eerste kolom een datum en in zijn tekst meestal tien.
   *    Telde elke datum in de rij, dan was elke rij gedateerd.
   */
  it('telt een datum verderop in de rij niet als markering', () => {
    expect(datum('productie staat op 0337 en dat is nagelopen; stand van 22-11-2026 elders')).toEqual([null]);
  });

  it('telt een datum vóór de bewering niet als markering', () => {
    expect(datum('📏 Stand van 22-11-2026: productie staat op **0337**.')).toEqual([null]);
  });

  it('telt een datum die niet bestaat niet als markering', () => {
    expect(datum('productie staat op 0337 (stand van 31-02-2026)')).toEqual([null]);
    expect(datum('productie staat op 0337 (stand van 22-13-2026)')).toEqual([null]);
  });

  it('dateert elke bewering in één rij afzonderlijk', () => {
    const tekst = 'productie staat op **0294** (stand van 19-09-2026) en later productie staat op **0337**.';

    expect(datum(tekst)).toEqual(['19-09-2026', null]);
  });

  /** 📏 Zes open rijen schreven dit, en tot QS8-786 zag de controle ze niet. */
  it('vindt "Productie staat nu op"', () => {
    expect(standClaims('Productie staat nu op **0294** en loopt gelijk').map((c: { nummer: string }) => c.nummer)).toEqual(
      ['0294'],
    );
  });

  it('ziet een verwijzing naar uitgerold.json zonder getal niet als bewering', () => {
    expect(standClaims('productie staat op de stand in `supabase/uitgerold.json`')).toEqual([]);
  });
});

describe('geldigeDatum', () => {
  it('neemt een bestaande datum en weigert een verzonnen', () => {
    expect(geldigeDatum('29', '02', '2028')).toBe('29-02-2028');
    expect(geldigeDatum('29', '02', '2026')).toBeNull();
    expect(geldigeDatum('00', '11', '2026')).toBeNull();
  });
});

describe('beoordeel', () => {
  it('meldt een kaal getal dat afwijkt', () => {
    const rijen = openRijen(rij('📏 productie staat op 0221 en kent alleen avatars'));

    expect(beoordeel(rijen, '0282').kaal).toHaveLength(1);
  });

  /**
   * ⚠️⚠️ **Gelijk aan de stand is óók rood** (besluit Quinten, 22-11-2026). Een
   *    kaal getal dat vandaag klopt, is na de volgende uitrol een tegenspraak —
   *    precies de ronde die QS8-786 weghaalt.
   */
  it('meldt een kaal getal ook als het gelijk is aan de stand', () => {
    const rijen = openRijen(rij('📏 productie staat op 0282'));

    expect(beoordeel(rijen, '0282').kaal).toHaveLength(1);
  });

  it('zwijgt over een gedateerde stand, ook als die afwijkt', () => {
    const rijen = openRijen(rij('📏 productie staat op **0294** (stand van 19-09-2026)'));

    expect(beoordeel(rijen, '0339')).toEqual({ kaal: [], ingehaald: [] });
  });

  /** De proef voor de uitrol: zelfde rij, de stand gaat omhoog, niets wordt rood. */
  it('blijft stil over een gedateerde rij als de stand na een uitrol stijgt', () => {
    const rijen = openRijen(rij('productie staat op **0337** (stand van 22-11-2026)'));

    expect(beoordeel(rijen, '0337').kaal).toEqual([]);
    expect(beoordeel(rijen, '0339').kaal).toEqual([]);
  });

  it('meldt in een rij met twee beweringen alleen de kale', () => {
    const rijen = openRijen(
      rij('productie staat op **0294** (stand van 19-09-2026); productie staat op **0337** zonder datum'),
    );
    const { kaal } = beoordeel(rijen, '0337');

    expect(kaal.map((k: { nummer: string }) => k.nummer)).toEqual(['0337']);
  });

  /**
   * ⚠️ **Een `\|` in een cel** (QS8-415): de rij blijft een open rij, en de
   *    bewering erin wordt nog steeds gelezen.
   */
  it('leest een rij met een ontsnapte streep in een cel', () => {
    const rijen = openRijen(rij('`a \\| b` en productie staat op 0337'));

    expect(rijen).toHaveLength(1);
    expect(beoordeel(rijen, '0337').kaal).toHaveLength(1);
  });

  it('laat een doorgestreepte rij met een kaal getal met rust', () => {
    const rijen = openRijen(rij('productie staat op 0221', '~~Laag~~ opgelost'));

    expect(beoordeel(rijen, '0337')).toEqual({ kaal: [], ingehaald: [] });
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

/**
 * ⚠️⚠️ **Het dossier zelf, met de stand omhoog geschoven.** Dit is de proef van
 *    QS8-786 als toets en niet als handeling: na de uitrol van 24-11 staat
 *    `uitgerold.json` hoger, en het dossier mag daar niet rood van worden.
 */
describe('het echte dossier', () => {
  it('heeft geen kale productiestand, ook niet als productie hoger staat', () => {
    const inhoud = readFileSync(join(__dirname, '../../docs/ENGINEER-REVIEW.md'), 'utf8');

    expect(beoordeel(openRijen(inhoud), '0339').kaal).toEqual([]);
    expect(beoordeel(openRijen(inhoud), '0999').kaal).toEqual([]);
  });
});
