import { describe, expect, it } from 'vitest';

import {
  gedeeldeIdentiteiten,
  GEEN_GEDEELDE_IDENTITEIT,
  registervormKlachten,
  zonderCommentaar,
} from '../../scripts/gedeelde-identiteit-controle.mjs';

/**
 * `gedeelde-identiteit-controle` los gevoed — QS8-336.
 *
 * ⚠️ **Beide helften staan hieronder, en de tweede is even belangrijk als de
 *    eerste:** de vormen die hij moet vinden én de vormen die hij met rust moet
 *    laten. Een controle die élke uuid-literal meldt, leert je hem te negeren —
 *    en dan is de eerstvolgende échte gedeelde sleutel ook ruis. Zelfde
 *    stelregel als bij `logboek-controle` en `persoon-in-jsonb-controle`.
 */

describe('wat de controle moet vinden', () => {
  it('een vaste uuid in een fixture', () => {
    const bron = "const ALICE = '00000000-0000-4000-8000-00000000a146';";

    expect(gedeeldeIdentiteiten(bron, 'x.ts')).toHaveLength(1);
  });

  it('noemt de regel waar hij staat, en niet alleen dát hij er is', () => {
    // ⚠️ Een melding zonder plek is een melding die je overslaat. Deze test
    //    stond er na een eerste versie die het commentaar wégknipte in plaats
    //    van blank te maken: die meldde regel 1 voor iets dat op regel 4 stond.
    const bron = ['/**', ' * uitleg', ' */', "const A = 'aaaaaaaa-0000-4000-8000-000000000001';"].join(
      '\n',
    );

    expect(gedeeldeIdentiteiten(bron, 'x.ts')[0]?.regel).toBe(4);
  });

  it('meerdere op één regel', () => {
    const bron =
      "insert values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002');";

    expect(gedeeldeIdentiteiten(bron, 'x.ts')).toHaveLength(2);
  });

  it('een uuid die door een lus in elkaar wordt gezet', () => {
    // ⚠️ **Deze test bestaat omdat de eerste versie dit miste, en dat is
    //    gemeten.** `reactiepaginering.test.ts` droeg vier gedeelde id's; de
    //    literalscan vond er één, want de andere drie stonden als template met
    //    een `${i}` erin. Een uuid die in stukjes wordt samengesteld is net zo
    //    goed een gedeelde sleutel — hij ziet er alleen niet zo uit. Toen deze
    //    regel er eenmaal stond, vond hij er meteen nog twee in andere
    //    bestanden.
    const bron = 'const id = `aaaaaaaa-0000-0000-0000-00000000000${i}`;';

    expect(gedeeldeIdentiteiten(bron, 'x.ts')).toHaveLength(1);
  });

  it('ook in hoofdletters, want Postgres maakt daar geen verschil', () => {
    const bron = "const A = 'AAAAAAAA-0000-4000-8000-00000000A146';";

    expect(gedeeldeIdentiteiten(bron, 'x.ts')).toHaveLength(1);
  });
});

describe('wat de controle met rust moet laten', () => {
  it('een uuid in blokcommentaar', () => {
    // ⚠️ Een uuid in commentaar schrijft niets. Zonder deze regel meldt de
    //    controle zijn eigen uitleg: `proefid.ts` citeert de foutmelding waar
    //    dit issue mee begon, met de botsende uuid erin.
    const bron = "/* voorbeeld: '00000000-0000-4000-8000-0000000002a8' */";

    expect(gedeeldeIdentiteiten(bron, 'x.ts')).toHaveLength(0);
  });

  it('een uuid in regelcommentaar', () => {
    const bron = "// voorbeeld: '00000000-0000-4000-8000-0000000002a8'";

    expect(gedeeldeIdentiteiten(bron, 'x.ts')).toHaveLength(0);
  });

  it('een geregistreerde waarde die nooit een rij wordt', () => {
    const bron = "const NERGENS = '00000000-0000-0000-0000-000000000000';";

    expect(gedeeldeIdentiteiten(bron, 'x.ts')).toHaveLength(0);
  });

  it('een `proefId()`-aanroep, want die is per run anders', () => {
    const bron = 'const ALICE = proefId(1);';

    expect(gedeeldeIdentiteiten(bron, 'x.ts')).toHaveLength(0);
  });

  it('een gewone template-string met een variabele erin', () => {
    // De tegenhanger bij de samengestelde uuid: zonder deze test zou elke
    // template-string met een streepje erin gemeld worden.
    const bron = 'const zin = `reactie ${i} van ${totaal}`;';

    expect(gedeeldeIdentiteiten(bron, 'x.ts')).toHaveLength(0);
  });

  it('iets dat op een uuid lijkt maar het niet is', () => {
    const bron = "const kort = '00000000-0000-4000-8000-0000';";

    expect(gedeeldeIdentiteiten(bron, 'x.ts')).toHaveLength(0);
  });
});

describe('het register', () => {
  it('staat er vandaag goed bij', () => {
    expect(registervormKlachten(GEEN_GEDEELDE_IDENTITEIT)).toEqual([]);
  });

  it('klaagt over een uitzondering zonder bruikbare reden', () => {
    // ⚠️ **Een uitzondering zonder reden is een uitzondering die niemand meer
    //    kan wegen.** Zonder deze toets groeit het register vanzelf: het is
    //    altijd sneller om een waarde toe te voegen dan om de fixture te
    //    repareren.
    const klachten = registervormKlachten({
      '00000000-0000-0000-0000-000000000000': 'nvt',
    });

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('geen bruikbare reden');
  });

  it('klaagt over een sleutel die geen uuid in kleine letters is', () => {
    expect(registervormKlachten({ 'niet-een-uuid': 'een reden die lang genoeg is om te tellen' }))
      .toHaveLength(1);
  });
});

describe('zonderCommentaar', () => {
  it('houdt het aantal regels gelijk', () => {
    // De eigenschap waar de regelnummers op leunen, apart getoetst.
    const bron = ['a', '/* twee', '   regels */', 'b'].join('\n');

    expect(zonderCommentaar(bron).split('\n')).toHaveLength(4);
  });
});
