import { describe, expect, it } from 'vitest';

import {
  asyncBeloftesIn,
  beloftefunctiesIn,
  lichaamVanaf,
  lokaleFunctiesIn,
  uitkomsttypenIn,
  voidTreffersIn,
  zonderCommentaar,
} from './uitkomsttypen';

/**
 * De zeef van `uitkomst-niet-weggooien.test.ts`, elke vorm los aangeboden.
 *
 * ⚠️ **De helft die het meeste doet is de tweede helft** — CLAUDE.md, regel 18:
 *    de vormen die de zeef met rust moet laten. Een controle die alles meldt,
 *    leer je uitzetten, en dat is bij deze grendel de duurste faalvorm: hij
 *    draait over de hele schermlaag, waar `void lokaleHandler()` het normale
 *    patroon is.
 */

describe('lichaamVanaf', () => {
  it('leest door de puntkomma binnen accolades heen', () => {
    const bron = 'export type X = { ok: true; waarde: number } | { ok: false; melding: string };';
    expect(lichaamVanaf(bron, bron.indexOf('=') + 1)).toContain('ok: false');
  });

  it('stopt bij de puntkomma op diepte nul en pakt de volgende regel niet mee', () => {
    const bron = 'type A = number;\ntype B = { ok: false };';
    expect(lichaamVanaf(bron, bron.indexOf('=') + 1)).not.toContain('ok: false');
  });
});

describe('uitkomsttypenIn', () => {
  it('vindt een unie met een ok:true- en een ok:false-tak', () => {
    const bron = 'export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; melding: string };';
    expect(uitkomsttypenIn(bron)).toEqual(['Resultaat']);
  });

  it('vindt hem ook met readonly ervoor', () => {
    const bron =
      'export type Aanzetresultaat =\n  | { readonly ok: true }\n  | { readonly ok: false; readonly reden: string };';
    expect(uitkomsttypenIn(bron)).toEqual(['Aanzetresultaat']);
  });

  it('vindt hem ongeacht hoe hij heet — de naam is nergens opgeschreven', () => {
    const bron = 'export type ZomaarIets = { ok: true } | { ok: false; melding: string };';
    expect(uitkomsttypenIn(bron)).toEqual(['ZomaarIets']);
  });

  /** ⚠️ Een beslissingsobject is geen uitkomst: er valt niets aan te mislukken. */
  it('laat een interface zonder ok-takken met rust', () => {
    const bron = 'export interface Nudgebesluit {\n  readonly mag: boolean;\n  readonly reden: string | null;\n}';
    expect(uitkomsttypenIn(bron)).toEqual([]);
  });

  it('laat een type met alleen een ok:true met rust', () => {
    expect(uitkomsttypenIn('export type Klaar = { ok: true };')).toEqual([]);
  });

  it('laat een niet-geëxporteerd type met rust', () => {
    expect(uitkomsttypenIn('type Intern = { ok: true } | { ok: false; melding: string };')).toEqual([]);
  });
});

describe('asyncBeloftesIn', () => {
  it('leest naam en beloofd type', () => {
    const bron = 'export async function maakDoel(a: string): Promise<Resultaat<Doel>> {}';
    expect(asyncBeloftesIn(bron)).toEqual([{ naam: 'maakDoel', soort: 'Resultaat' }]);
  });

  it('telt ook een lezer mee — dat is de noemer van de fractie', () => {
    const bron = 'export async function fetchDoelen(): Promise<Pagina<Doel>> {}';
    expect(asyncBeloftesIn(bron)).toEqual([{ naam: 'fetchDoelen', soort: 'Pagina' }]);
  });

  it('laat een niet-geëxporteerde functie met rust', () => {
    expect(asyncBeloftesIn('async function intern(): Promise<Resultaat<true>> {}')).toEqual([]);
  });
});

describe('beloftefunctiesIn', () => {
  const bron = [
    'export async function maakDoel(): Promise<Resultaat<Doel>> {}',
    'export async function signOut(): Promise<Uitkomst> {}',
    'export async function fetchDoelen(): Promise<Pagina<Doel>> {}',
  ].join('\n');

  it('vindt elke functie die een van de soorten belooft', () => {
    expect(beloftefunctiesIn(bron, new Set(['Resultaat', 'Uitkomst']))).toEqual(['maakDoel', 'signOut']);
  });

  /** ⚠️ Precies het geval van QS8-340: één naam in de lijst en de rest onzichtbaar. */
  it('mist alles wat niet in de soorten staat — daarom wordt die lijst afgeleid', () => {
    expect(beloftefunctiesIn(bron, new Set(['Uitkomst']))).toEqual(['signOut']);
  });

  it('laat een lezer met rust', () => {
    expect(beloftefunctiesIn(bron, new Set(['Resultaat', 'Uitkomst']))).not.toContain('fetchDoelen');
  });
});

describe('voidTreffersIn', () => {
  it('meldt een weggegooide uitkomst, met het regelnummer', () => {
    const bron = 'const a = 1;\nvoid maakDoel();';
    expect(voidTreffersIn(bron, ['maakDoel'])).toEqual(['2 — void maakDoel()']);
  });

  it('meldt hem ook binnen een onPress', () => {
    expect(voidTreffersIn('onPress={() => void maakDoel(id)}', ['maakDoel'])).toEqual([
      '1 — void maakDoel()',
    ]);
  });

  /** ⚠️ Het geval waar de eerste versie op stukliep: de uitleg als bevinding. */
  it('laat een naam in commentaar met rust', () => {
    expect(voidTreffersIn('// hier stond void maakDoel()', ['maakDoel'])).toEqual([]);
    expect(voidTreffersIn('/* void maakDoel() */', ['maakDoel'])).toEqual([]);
  });

  it('laat een aanroep zonder void met rust', () => {
    expect(voidTreffersIn('const r = await maakDoel();', ['maakDoel'])).toEqual([]);
  });

  it('laat een langere naam met rust die op dezelfde letters begint', () => {
    expect(voidTreffersIn('void maakDoelStatus();', ['maakDoel'])).toEqual([]);
  });

  it('houdt het regelnummer kloppend nadat blokcommentaar eruit is', () => {
    const bron = '/**\n * uitleg\n * meer uitleg\n */\nvoid maakDoel();';
    expect(voidTreffersIn(bron, ['maakDoel'])).toEqual(['5 — void maakDoel()']);
  });
});

describe('lokaleFunctiesIn', () => {
  it('vindt een functiedeclaratie', () => {
    expect(lokaleFunctiesIn('  async function trekIn() {}')).toEqual(['trekIn']);
  });

  it('vindt een const met een pijlfunctie', () => {
    expect(lokaleFunctiesIn('const bewaar = async () => {};')).toEqual(['bewaar']);
  });

  it('laat een aanroep met rust — alleen declaraties tellen', () => {
    expect(lokaleFunctiesIn('void trekIn(id);')).toEqual([]);
  });

  it('laat een import met rust', () => {
    expect(lokaleFunctiesIn("import { trekIn } from '@/modules/commitments';")).toEqual([]);
  });

  it('laat een functienaam in commentaar met rust', () => {
    expect(lokaleFunctiesIn('// function trekIn() bestond hier ooit')).toEqual([]);
  });
});

describe('zonderCommentaar', () => {
  it('houdt het aantal regels gelijk, want de melding noemt het regelnummer', () => {
    const bron = 'a\n/**\n * uitleg\n */\nb';
    expect(zonderCommentaar(bron).split('\n')).toHaveLength(5);
  });

  it('laat een url met dubbele slash met rust', () => {
    expect(zonderCommentaar("const u = 'https://voorbeeld.nl';")).toContain('https://voorbeeld.nl');
  });
});
