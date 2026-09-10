import { describe, expect, it } from 'vitest';

import {
  alleAsyncExportsIn,
  asyncBeloftesIn,
  awaitTreffersIn,
  beloftefunctiesIn,
  lichaamVanaf,
  lokaleFunctiesIn,
  optioneleUitkomstenIn,
  parameterEinde,
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

describe('parameterEinde', () => {
  it('vindt de sluitende haak van een gewone parameterlijst', () => {
    const bron = 'f(a, b) rest';
    expect(bron.slice(parameterEinde(bron, 1))).toBe(' rest');
  });

  /** ⚠️ Het geval waar de eerste versie op stukliep — de security-review op QS8-340. */
  it('leest door de haakjes van een pijltype in een parameter heen', () => {
    const bron = 'f(verwijderRij: () => Promise<void>): Promise<Uitzetresultaat> {}';
    expect(bron.slice(parameterEinde(bron, 1))).toBe(': Promise<Uitzetresultaat> {}');
  });
});

describe('asyncBeloftesIn', () => {
  it('leest naam en beloofd type', () => {
    const bron = 'export async function maakDoel(a: string): Promise<Resultaat<Doel>> {}';
    expect(asyncBeloftesIn(bron)).toEqual([{ naam: 'maakDoel', soort: 'Resultaat', gelezen: true }]);
  });

  it('telt ook een lezer mee — dat is de noemer van de fractie', () => {
    const bron = 'export async function fetchDoelen(): Promise<Pagina<Doel>> {}';
    expect(asyncBeloftesIn(bron)).toEqual([{ naam: 'fetchDoelen', soort: 'Pagina', gelezen: true }]);
  });

  /**
   * ⚠️ 📏 Dit is `zetMeldingenUit()`, en hij viel op 08-09-2026 uit de zeef: de
   *    haakjes van het pijltype beëindigden de parameterlijst te vroeg.
   */
  it('leest een parameter die zelf haakjes draagt', () => {
    const bron =
      'export async function zetMeldingenUit(\n  verwijderRij: () => Promise<void>,\n): Promise<Uitzetresultaat> {}';
    expect(asyncBeloftesIn(bron)).toEqual([{ naam: 'zetMeldingenUit', soort: 'Uitzetresultaat', gelezen: true }]);
  });

  it('leest een generieke functie', () => {
    const bron = 'export async function metAvatars<T, K extends keyof T>(r: T[]): Promise<Resultaat<T>> {}';
    expect(asyncBeloftesIn(bron)).toEqual([{ naam: 'metAvatars', soort: 'Resultaat', gelezen: true }]);
  });

  /**
   * ⚠️ **Twee verschillende dingen die allebei `soort: null` geven, en het verschil
   *    ís de grendel.** `Promise<{ ... }>` is geen benoemd type — dat is een geldige
   *    uitkomst. Een handtekening waar de lezer de draad in kwijtraakt is dat niet,
   *    en die moet luid zijn. 📏 Van het eerste soort staan er twee in
   *    `src/modules/notifications/webpush-crypto.ts`.
   */
  it('leest een Promise<{ ... }> wel, maar noemt het geen benoemd type', () => {
    const bron = 'export async function paar(): Promise<{ a: string }> {}';
    expect(asyncBeloftesIn(bron)).toEqual([{ naam: 'paar', soort: null, gelezen: true }]);
  });

  it('meldt gelezen: false zodra de lezer de draad kwijtraakt', () => {
    const bron = 'export async function los(f: () =>';
    expect(asyncBeloftesIn(bron)).toEqual([{ naam: 'los', soort: null, gelezen: false }]);
  });

  it('geeft soort null bij een functie zonder returnannotatie — geen stille verdwijning', () => {
    expect(asyncBeloftesIn('export async function los(a: string) {}')).toEqual([
      { naam: 'los', soort: null, gelezen: true },
    ]);
  });

  it('laat een niet-geëxporteerde functie met rust', () => {
    expect(asyncBeloftesIn('async function intern(): Promise<Resultaat<true>> {}')).toEqual([]);
  });
});

describe('alleAsyncExportsIn', () => {
  /**
   * ⚠️ **De noemer telt kaal en met opzet met een ándere greep.** Deelden teller
   *    en noemer hun parser, dan viel een ongelezen functie uit allebei weg en
   *    bewoog de fractie niet — de blinde vlek die zichzelf niet kan meten.
   */
  it('telt ook een functie die de signatuurlezer niet zou lezen', () => {
    const bron = 'export async function zetMeldingenUit(f: () => Promise<void>) {}';
    expect(alleAsyncExportsIn(bron)).toEqual(['zetMeldingenUit']);
  });

  it('laat een niet-geëxporteerde functie met rust', () => {
    expect(alleAsyncExportsIn('async function intern() {}')).toEqual([]);
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

  /** ⚠️ 📏 Negen van deze vorm staan er in `app/` — security-review op QS8-340. */
  it('vindt een handler in een useCallback', () => {
    expect(lokaleFunctiesIn('const beoordeel = useCallback(async () => {}, []);')).toEqual([
      'beoordeel',
    ]);
  });

  it('vindt een functie-expressie', () => {
    expect(lokaleFunctiesIn('const blokkeer = async function () {};')).toEqual(['blokkeer']);
  });

  it('laat een gewone const met rust — alleen functies tellen', () => {
    expect(lokaleFunctiesIn("const titel = 'iets';")).toEqual([]);
    expect(lokaleFunctiesIn('const aantal = mensen.length;')).toEqual([]);
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

describe('awaitTreffersIn', () => {
  it('meldt een kaal await-statement, met het regelnummer', () => {
    const bron = 'const a = 1;\nawait maakDoel();';
    expect(awaitTreffersIn(bron, ['maakDoel'])).toEqual(['2 — await maakDoel()']);
  });

  it('meldt hem als eerste statement van een lichaam', () => {
    expect(awaitTreffersIn('async function f() {\n  await maakDoel();\n}', ['maakDoel'])).toEqual([
      '2 — await maakDoel()',
    ]);
  });

  it('meldt hem ook direct na een blok', () => {
    const bron = 'if (x) {\n  g();\n}\nawait maakDoel();';
    expect(awaitTreffersIn(bron, ['maakDoel'])).toEqual(['4 — await maakDoel()']);
  });

  /**
   * ⚠️ **Hier zit de duurste faalvorm van deze zeef, en niet in het vinden.** Elk
   *    geval hieronder vángt de uitkomst op; een melding erover is vals, en een
   *    controle met valse meldingen leer je uitzetten.
   */
  it('laat een opgevangen uitkomst met rust', () => {
    expect(awaitTreffersIn('const r = await maakDoel();', ['maakDoel'])).toEqual([]);
    expect(awaitTreffersIn('return await maakDoel();', ['maakDoel'])).toEqual([]);
    expect(awaitTreffersIn('if ((await maakDoel()).ok) g();', ['maakDoel'])).toEqual([]);
    expect(awaitTreffersIn('const f = async () => await maakDoel();', ['maakDoel'])).toEqual([]);
    expect(awaitTreffersIn('g(await maakDoel(), 2);', ['maakDoel'])).toEqual([]);
    expect(awaitTreffersIn('const [a] = [await maakDoel()];', ['maakDoel'])).toEqual([]);
  });

  /**
   * ⚠️ **Het geval waarvoor de grens op het téken staat en niet op de regel.**
   *    Prettier breekt een lange toewijzing af achter de `=`, en dan begint de
   *    `await` wél een regel maar geen statement.
   */
  it('laat een await met rust die op een eigen regel achter een = staat', () => {
    const bron = 'const uitkomst =\n  await maakDoel(een, twee);';
    expect(awaitTreffersIn(bron, ['maakDoel'])).toEqual([]);
  });

  it('laat een naam in commentaar met rust', () => {
    expect(awaitTreffersIn('// hier stond await maakDoel()', ['maakDoel'])).toEqual([]);
    expect(awaitTreffersIn('/**\n * await maakDoel()\n */', ['maakDoel'])).toEqual([]);
  });

  it('laat een langere naam met rust die op dezelfde letters begint', () => {
    expect(awaitTreffersIn('await maakDoelStatus();', ['maakDoel'])).toEqual([]);
  });

  it('laat een functie met rust die niet in de lijst staat', () => {
    expect(awaitTreffersIn('await werkJobAf(id);', ['maakDoel'])).toEqual([]);
  });

  it('houdt het regelnummer kloppend nadat blokcommentaar eruit is', () => {
    const bron = '/**\n * uitleg\n * meer uitleg\n */\nawait maakDoel();';
    expect(awaitTreffersIn(bron, ['maakDoel'])).toEqual(['5 — await maakDoel()']);
  });
});

describe('optioneleUitkomstenIn', () => {
  it('vindt de functie onder de markering, met de reden erbij', () => {
    const bron = [
      '/**',
      ' * Doet iets.',
      ' *',
      ' * @uitkomst-optioneel De aanroeper leest de stand later zelf uit de job.',
      ' */',
      'export async function werkJobAf(id: string): Promise<Uitkomst<true>> {}',
    ].join('\n');

    expect(optioneleUitkomstenIn(bron)).toEqual([
      { naam: 'werkJobAf', reden: 'De aanroeper leest de stand later zelf uit de job.' },
    ]);
  });

  it('plakt een reden van meerdere regels aan elkaar', () => {
    const bron = [
      '/**',
      ' * @uitkomst-optioneel Eerste regel,',
      ' *    en de tweede.',
      ' */',
      'export async function f(): Promise<Uitkomst<true>> {}',
    ].join('\n');

    expect(optioneleUitkomstenIn(bron)[0]?.reden).toBe('Eerste regel, en de tweede.');
  });

  /**
   * ⚠️ **Een markering zonder reden komt met een lege reden terug en niet als
   *    treffer-loos geval.** De grendel hiernaast weegt die reden; zou deze
   *    functie hem hier al wegfilteren, dan verdween het gat in plaats van dat
   *    het gemeld werd.
   */
  it('geeft een lege reden terug bij een kale markering', () => {
    const bron = '/**\n * @uitkomst-optioneel\n */\nexport async function f() {}';
    expect(optioneleUitkomstenIn(bron)).toEqual([{ naam: 'f', reden: '' }]);
  });

  it('wijst geen functie aan als er geen export-async onder staat', () => {
    const bron = '/**\n * @uitkomst-optioneel Met reden.\n */\nconst x = 1;';
    expect(optioneleUitkomstenIn(bron)[0]?.naam).toBe('');
  });

  it('laat een bron zonder markering met rust', () => {
    expect(optioneleUitkomstenIn('export async function f() {}')).toEqual([]);
  });
});
