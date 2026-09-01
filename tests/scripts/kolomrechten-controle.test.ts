import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `levend-controle.test.ts`.
import {
  argumentNa,
  bronbestanden,
  GEEN_SCHRIJFPAD,
  NIET_TE_LEZEN,
  bronnaam,
  beoordeel,
  beoordeelSchrijven,
  kolomNaam,
  losSpreadOp,
  meldingen,
  objectSleutels,
  ontleedRechten,
  ontleedSchrijfrechten,
  rechtenVoor,
  schrijfacties,
  schrijfIn,
  selectiesIn,
  velduitLokaal,
  verlopenRegels,
  zodSchemas,
} from '../../scripts/kolomrechten-controle.mjs';

/**
 * De ijking van `npm run kolomrechten:controle`.
 *
 * ⚠️ De controle die dit script bewaakt is zelf ontstaan uit een groene test met
 *    een verkeerde aanname erin. Vandaar dat hier niet alleen staat wát hij moet
 *    vinden, maar ook wat hij met rust moet laten: een controle die alles meldt,
 *    leer je te negeren — en dan is hij net zo blind als geen controle.
 */

const RECHTEN = {
  profiles: { kolommen: ['id', 'display_name', 'avatar_url'], totaal: 14, volledig: false },
  goals: { kolommen: ['id', 'title', 'owner_id'], totaal: 3, volledig: true },
};

describe('lezen wat er in de code staat', () => {
  it('vindt tabel en kolommen in een gewone keten', () => {
    const uit = selectiesIn('a.ts', `supabase().from('goals').select('id, title').eq('x', 1)`);

    expect(uit).toEqual([{ pad: 'a.ts', tabel: 'goals', kolommen: ['id', 'title'], alles: false }]);
  });

  it('herkent een ster', () => {
    const uit = selectiesIn('a.ts', `.from('profiles').select('*')`);

    expect(uit[0]?.alles).toBe(true);
  });

  it('telt een ster naast een ingebedde bron nog steeds als ster', () => {
    // ⚠️ De vorm die bij het bouwen twee valse meldingen gaf. `*` is hier geen
    //    kolomnaam maar "alle kolommen van deze tabel".
    const uit = selectiesIn('a.ts', `.from('goals').select('*, weekly_goals!inner(id)')`);

    expect(uit[0]?.alles).toBe(true);
    expect(uit[0]?.kolommen).toEqual([]);
  });

  it('laat ingebedde bronnen staan — die lopen over de rechten van een andere tabel', () => {
    const uit = selectiesIn('a.ts', `.from('goals').select('id, weekly_goals(title)')`);

    expect(uit[0]?.kolommen).toEqual(['id']);
  });

  it('leest door een alias heen', () => {
    expect(kolomNaam('naam:display_name')).toBe('display_name');
    expect(kolomNaam(' id ')).toBe('id');
  });

  /** ⚠️ Een vorm die de lezer niet kent maakt de hele actie onleesbaar. */
  it('meldt een onbekende vorm als onleesbaar in plaats van als minder kolommen', () => {
    const uit = alsActies(schrijfIn('a.ts', `.from('goals').insert({ [k]: v, id: x })`));

    expect(uit[0]?.kolommen).toBeNull();
    expect(uit[0]?.reden).toContain('niet kent');
  });

  /** ⚠️ `insert([{…},{…}])` — `objectSleutels` leest alleen het eerste object. */
  it('meldt een lijst van objecten als onleesbaar', () => {
    const uit = alsActies(schrijfIn('a.ts', `.from('goals').insert([{ a: 1 }, { b: 2 }])`));

    expect(uit[0]?.kolommen).toBeNull();
    expect(uit[0]?.reden).toContain('lijst van objecten');
  });

  /**
   * ⚠️ **Alleen een tweede argument lezen als er een komma stond.** Anders leest
   *    `argumentNa` door tot de vólgende keten en vindt daar misschien een
   *    `ignoreDuplicates` die bij een heel andere aanroep hoort — waarna het
   *    UPDATE-recht stilzwijgend wegvalt.
   */
  it('pakt geen opties uit tekst die verderop in dezelfde keten staat', () => {
    // ⚠️ Een commentaarregel die `ignoreDuplicates` nóemt staat in deze codebase
    //    bij precies deze aanroepen — zie `koppelDoelAanGroep()`. Zonder de
    //    kommatoets leest `argumentNa` door tot na de sluithaak, vindt hem daar,
    //    en laat het UPDATE-recht stilzwijgend vallen.
    const bron = [
      `.from('week_reviews').upsert({ id: x })`,
      `  // ooit stond hier { ignoreDuplicates: true }, zie migratie 0118`,
      `  .select('id')`,
    ].join('\n');

    expect(schrijfIn('a.ts', bron)[0]?.rechten).toEqual(['INSERT', 'UPDATE']);
  });

  it('kijkt niet verder dan de volgende keten', () => {
    // Zonder die grens plakt de `select` van de tweede keten aan de eerste tabel.
    const uit = selectiesIn('a.ts', `.from('goals').eq('a', 1)\n.from('profiles').select('id')`);

    expect(uit).toHaveLength(1);
    expect(uit[0]?.tabel).toBe('profiles');
  });
});

describe('het oordeel', () => {
  it('meldt een ster op een tabel met een versmalde grant', () => {
    // ⚠️ Precies de storing van 0089: `updateProfiel()` vroeg zijn rij terug met
    //    `select('*')`, en vanaf die migratie gaf PostgREST 42501 op élke
    //    profielopslag — tijdzone, taal, week-startdag, en de onboarding.
    const fouten = beoordeel(selectiesIn('p.ts', `.from('profiles').select('*')`), RECHTEN);

    expect(fouten).toHaveLength(1);
    expect(fouten[0]?.reden).toContain('3 van de 14');
  });

  it('laat een ster staan op een tabel die volledig leesbaar is', () => {
    const fouten = beoordeel(selectiesIn('g.ts', `.from('goals').select('*')`), RECHTEN);

    expect(fouten).toEqual([]);
  });

  it('meldt een kolom die niet in de grant zit', () => {
    const fouten = beoordeel(selectiesIn('p.ts', `.from('profiles').select('id, locale')`), RECHTEN);

    expect(fouten).toHaveLength(1);
    expect(fouten[0]?.reden).toContain('`locale`');
  });

  it('laat kolommen staan die er wél in zitten', () => {
    const fouten = beoordeel(
      selectiesIn('p.ts', `.from('profiles').select('id, display_name')`),
      RECHTEN,
    );

    expect(fouten).toEqual([]);
  });

  it('meldt een tabel waar `authenticated` niets op mag', () => {
    const fouten = beoordeel(selectiesIn('x.ts', `.from('points_ledger').select('id')`), RECHTEN);

    expect(fouten).toHaveLength(1);
    expect(fouten[0]?.reden).toContain('geen enkel leesrecht');
  });
});

interface Recht {
  readonly kolommen: readonly string[];
  readonly totaal: number;
  readonly volledig: boolean;
}

/** `ontleedRechten` komt uit een `.mjs` zonder typings — vandaar deze hulp. */
const alsRechten = (ruw: unknown): Record<string, Recht | undefined> =>
  ruw as Record<string, Recht | undefined>;

describe('de grants inlezen', () => {
  it('houdt alleen tabellen over waar iets op mag', () => {
    const rechten = alsRechten(
      ontleedRechten('profiles|3|14|id,display_name,avatar_url\npoints_ledger|0|9|\n'),
    );

    expect(rechten.profiles?.volledig).toBe(false);
    expect(rechten.profiles?.kolommen).toEqual(['id', 'display_name', 'avatar_url']);
    expect(rechten.points_ledger).toBeUndefined();
  });

  it('ziet een volledige grant als volledig', () => {
    const rechten = alsRechten(ontleedRechten('goals|3|3|id,title,owner_id\n'));

    expect(rechten.goals?.volledig).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// De schrijfkant — QS8-258
// ---------------------------------------------------------------------------

/**
 * IJking van de schrijfkant.
 *
 * ⚠️ **De belofte die hier bewaakt wordt is een náád en geen onderdeel.** Grants
 *    staan in migraties, kolommen in Zod-schema's, en de `insert()` staat weer
 *    ergens anders. Elk van die drie was bij 0140 correct; de combinatie brak
 *    élk doel aanmaken met 42501, en geen enkele test kon dat zien.
 *
 * ⚠️ **De must-allow-helft weegt hier zwaar.** Deze controle draait over élke
 *    `insert()` en `update()` in de codebase, en een kolom die hij verzint of
 *    een grant die hij ten onrechte dood noemt, is een rode poort op werk dat
 *    klopt. Bij het bouwen gebeurde dat twee keer: `note: x ? null : y` leverde
 *    een kolom `null` op, en een `upsert` met `ignoreDuplicates` een gat in
 *    `goal_group_links` dat er niet is. Beide staan hieronder als eigen geval.
 *
 * IJKING — mutatie per grendel, en niet één voor de hele controle. Met de hand
 * gedraaid op 01-09-2026:
 *
 *   A  de `inWaarde`-tak uit `objectSleutels` halen          → 1 rood
 *   B  `argumentNa` op het eerste sluitteken laten stoppen  → 6 rood
 *   C  regelcommentaar niet overslaan                       → 1 rood
 *   D  `velduitLokaal` alleen de toewijzingen laten lezen   → 1 rood
 *   E  `losSpreadOp` altijd `null`                          → 4 rood
 *   F  `rechtenVoor` voor elke upsert INSERT+UPDATE         → 2 rood
 *   G  `breed` niet overslaan in `beoordeelSchrijven`       → 1 rood
 *   H  een onleesbare actie niet meer `volledig: false`     → 1 rood
 *   I  `verlopenRegels` niets laten teruggeven              → 1 rood
 *   J  een sleutel tussen aanhalingstekens als string lezen → 1 rood
 *   K  de toets op een ontbrekend kolomrecht eruit          → 1 rood
 *   L  de toets op een tabel zonder enig recht eruit        → 1 rood
 *   M  de worp op een afgekapte psql-regel eruit             → 1 rood
 *
 * Na de review op PR #140 erbij. N tot en met P zijn stille gaten: de controle
 * gaf mínder kolommen terug in plaats van "dit kan ik niet lezen", en daarmee
 * kwam de 0140-storing er groen doorheen.
 *
 *   N  de ES6-verkorting niet als sleutel lezen              → 2 rood
 *   O  `onbekend` niet luid maken in `schrijfIn`             → 1 rood
 *   P  een schema met een spread tóch registreren            → 2 rood
 *   Q  `ongemeten` uit `verlopenRegels` halen                → 1 rood
 *   R  de normalisatie uit `bronnaam` slopen                 → 1 rood (in `padvormen`)
 *   S  het `schemas`-argument uit `schrijfacties`            → 2 rood
 *   T  opties lezen ook zonder voorafgaande komma            → 1 rood
 *   U  een lijst van objecten niet melden                    → 1 rood
 *   V  een botsende schemanaam stil laten winnen             → 1 rood
 *
 * ⚠️ **R en T waren bij hun eerste meting allebei 0 rood, en dat is het leerzame
 *    deel.** R stond in `padvormen.test.ts` op het wóórd `metSchuineStrepen` —
 *    dat komt in het commentaar van elk normaliserend script voor, dus de
 *    grendel bewaakte commentaar. T had een ijking die zijn geval door een pad
 *    voerde dat een éérdere grendel al afving: de vensterknip op `.from('` haalde
 *    de tweede keten al weg. Beide zijn de val die CLAUDE.md beschrijft — een
 *    ijking die groen blijft als je de grendel uit zijn eigen naam weghaalt.
 *
 * ⚠️ **J stond er niet toen dit geschreven werd, en dat is het punt.** De
 *    ijkingstest voor een sleutel tussen aanhalingstekens was meteen rood: de
 *    aanhalingsmodus sloeg aan vóór de sleutelherkenning, dus `'goal_id':` werd
 *    in zijn geheel als string ingeslikt. Een controle die stilletjes mínder
 *    ziet, en niemand had hem ooit gevoed.
 */

describe('argumentNa', () => {
  it('leest een objectliteraal met haakjes en kommas erin', () => {
    expect(argumentNa(`{ a: 1, b: f(x, y) }, { onConflict: 'x' })`, 0)).toBe('{ a: 1, b: f(x, y) }');
  });

  it('stopt op het eerste argument en niet op het laatste', () => {
    expect(argumentNa(`x, y)`, 0)).toBe('x');
  });

  it('kijkt niet in een string', () => {
    expect(argumentNa(`{ a: 'een ) haakje' })`, 0)).toBe(`{ a: 'een ) haakje' }`);
  });

  it('geeft null als het argument niet afgesloten wordt', () => {
    expect(argumentNa('{ a: 1', 0)).toBeNull();
  });
});

describe('objectSleutels', () => {
  it('leest de sleutels op het bovenste niveau', () => {
    expect(objectSleutels('{ goal_id: x, title: y }').sleutels).toEqual(['goal_id', 'title']);
  });

  it('laat een geneste sleutel staan', () => {
    // `onConflict` is een optie van PostgREST en geen kolom.
    expect(objectSleutels('{ a: { b: 1 } }').sleutels).toEqual(['a']);
  });

  /**
   * ⚠️ **Het geval dat bij het bouwen twee kolommen verzon.** De tweede helft van
   *    een ternaire staat op precies dezelfde diepte als een sleutel, dus
   *    `null :` leest als een sleutelnaam — en dan meldt de controle een kolom
   *    `null` die niet bestaat.
   */
  it('leest de tweede helft van een ternaire niet als sleutel', () => {
    expect(objectSleutels(`{ note: leeg === '' ? null : leeg, id: x }`).sleutels).toEqual([
      'note',
      'id',
    ]);
  });

  /** ⚠️ In dit project staat er een halve alinea uitleg tússen de velden. */
  it('slaat commentaar over, ook met een dubbele punt erin', () => {
    const tekst = ['{', '  // let op: dit is geen sleutel', '  /* en dit: ook niet */', '  a: 1,', '}'].join('\n');
    expect(objectSleutels(tekst).sleutels).toEqual(['a']);
  });

  /**
   * ⚠️ **Het gat dat de security-review vond, en het zwaarste van deze PR.** Een
   *    ES6-verkorting is een doodgewone TS-vorm, en deze lezer sloeg hem stil
   *    over. Nagespeeld met de grants van `693149e`:
   *    `.insert({ owner_id: u, title: t, ritme })` gaf `['owner_id', 'title']` —
   *    de kolom zonder INSERT-recht was weg, de controle zweeg, en PostgREST
   *    geeft daar 42501 op élke rij. Woordelijk de storing waarvoor deze controle
   *    bestaat, en de poort bleef groen.
   */
  it('leest een ES6-verkorting als sleutel', () => {
    expect(objectSleutels('{ owner_id: u, title }').sleutels).toEqual(['owner_id', 'title']);
  });

  it('leest een sleutel tussen dubbele aanhalingstekens', () => {
    expect(objectSleutels('{ "goal_id": x, id: y }').sleutels).toEqual(['goal_id', 'id']);
  });

  /**
   * ⚠️ **Alles wat deze lezer niet kent, gaat luid naar buiten.** Dat is de
   *    reparatie achter alle drie de gevallen hierboven: bij "dit kan ik niet
   *    lezen" word je rood en kijk je zelf, bij "minder kolommen" ben je groen en
   *    denk je dat het nagekeken is. Het verschil is het hele issue.
   */
  it('meldt een berekende sleutel als onbekend in plaats van hem over te slaan', () => {
    const uit = objectSleutels('{ [kolom]: waarde, id: x }');

    expect(uit.sleutels).toEqual(['id']);
    expect(uit.onbekend.length).toBeGreaterThan(0);
  });

  it('meldt een spread apart in plaats van hem te negeren', () => {
    const uit = objectSleutels('{ ...gevalideerd.data, owner_id: u }');

    expect(uit.sleutels).toEqual(['owner_id']);
    expect(uit.spreads).toEqual(['gevalideerd.data']);
  });

  it('leest een sleutel tussen aanhalingstekens', () => {
    expect(objectSleutels(`{ 'goal_id': x }`).sleutels).toEqual(['goal_id']);
  });

  it('valt niet om zonder accolade', () => {
    expect(objectSleutels('rijen')).toEqual({ sleutels: [], spreads: [], onbekend: [] });
  });
});

describe('zodSchemas', () => {
  it('leest de velden van een z.object', () => {
    const bron = `export const doelSchema = z.object({\n  ritme: z.enum(R).default('weekly'),\n  title: z.string(),\n});`;

    expect(zodSchemas(bron)).toEqual({ doelSchema: ['ritme', 'title'] });
  });

  /**
   * ⚠️ **Een half gelezen schema is gevaarlijker dan geen schema.** `losSpreadOp()`
   *    geeft een te korte lijst terug als volledig antwoord, en dan telt
   *    `schrijfIn()` de actie als gelezen terwijl er kolommen ontbreken — de
   *    storing van 0140 opnieuw, en groen. Niet registreren is het luide antwoord.
   */
  it.each([
    ['een spread erin', `export const xSchema = z.object({ ...basis, title: z.string() });`],
    ['een extend erachter', `export const xSchema = z.object({ a: z.string() }).extend({ b: z.string() });`],
  ])('registreert een schema met %s niet', (_naam, bron) => {
    expect(zodSchemas(bron)).toEqual({});
  });

  /**
   * ⚠️ `afrondSchema` bestaat vandaag twee keer — in `weekly-schemas.ts` en in
   *    `completion-schemas.ts`. De laatste in de mapvolgorde zou stil winnen, en
   *    dan lost een spread op naar het verkeerde schema.
   */
  it('laat een botsende schemanaam niet stil winnen', () => {
    const bron = [
      `export const xSchema = z.object({ a: z.string() });`,
      `export const xSchema = z.object({ b: z.string() });`,
    ].join('\n');

    expect((zodSchemas(bron) as Record<string, string[] | null>)['xSchema']).toBeNull();
  });

  /** ⚠️ Een afgeleid schema is bewust geen bron — zie de kop van `zodSchemas`. */
  it('laat een afgeleid schema eruit', () => {
    const bron = `export const doelPatchSchema = doelSchema.omit({ target_date: true }).partial();`;

    expect(zodSchemas(bron)).toEqual({});
  });
});

describe('velduitLokaal', () => {
  /** De vorm van `wijzigDoel()`, `updateProfiel()` en `wijzigGroep()`. */
  it('leest een leeg beginobject plus zijn toewijzingen', () => {
    const bron = [
      `const update: TablesUpdate<'goals'> = {};`,
      `if (v.title !== undefined) update.title = v.title;`,
      `if (v.category !== undefined) update.category = v.category;`,
    ].join('\n');

    expect(velduitLokaal(bron, 'update')?.sort()).toEqual(['category', 'title']);
  });

  /** ⚠️ Zonder de sleutels van het beginobject mist hij een vooraf gezet veld. */
  it('neemt de sleutels van het beginobject mee', () => {
    const bron = [`const update = { id: x };`, `update.title = y;`].join('\n');

    expect(velduitLokaal(bron, 'update')?.sort()).toEqual(['id', 'title']);
  });

  /** De vorm van `maakWeekplan()`. */
  it('leest een map die een objectliteraal teruggeeft', () => {
    const bron = `const rijen = data.map((s, i) => ({ goal_id: g, order_index: i, title: s.title }));`;

    expect(velduitLokaal(bron, 'rijen')).toEqual(['goal_id', 'order_index', 'title']);
  });

  it('houdt een vergelijking uit elkaar met een toewijzing', () => {
    const bron = [`const update = {};`, `if (update.title === 'x') doeIets();`].join('\n');

    expect(velduitLokaal(bron, 'update')).toEqual([]);
  });

  it.each([
    ['een functieaanroep', `const patch = spiegelpatch(antwoorden);`],
    ['een naam die er niet is', `const iets = {};`],
  ])('geeft null bij %s', (_naam, bron) => {
    expect(velduitLokaal(bron, 'patch')).toBeNull();
  });
});

describe('losSpreadOp', () => {
  const bron = `const gevalideerd = doelSchema.safeParse(invoer);`;
  const schemas = { doelSchema: ['ritme', 'title'] };

  it('volgt een spread naar het schema dat hem valideerde', () => {
    expect(losSpreadOp(bron, 'gevalideerd.data', schemas)).toEqual(['ritme', 'title']);
  });

  it.each([
    ['een spread zonder .data', 'gevalideerd'],
    ['een naam die nergens gevalideerd is', 'iets.data'],
    ['een losse variabele uit een map', 'm'],
  ])('geeft null bij %s', (_naam, spread) => {
    expect(losSpreadOp(bron, spread, schemas)).toBeNull();
  });
});

describe('rechtenVoor', () => {
  it.each([
    ['insert', 'insert', undefined, ['INSERT']],
    ['update', 'update', undefined, ['UPDATE']],
    ['een gewone upsert', 'upsert', `{ onConflict: 'a,b' }`, ['INSERT', 'UPDATE']],
  ])('%s', (_naam, soort, opties, verwacht) => {
    expect(rechtenVoor(soort, opties)).toEqual(verwacht);
  });

  /**
   * ⚠️ **De must-allow die bij het bouwen vals alarm gaf.** `do nothing` heeft
   *    het UPDATE-recht niet nodig, en `goal_group_links` heeft het sinds 0118
   *    ook niet meer. Zonder dit onderscheid meldt de controle daar een gat dat
   *    er niet is — en migratie 0118 leunt precies op dat verschil.
   */
  it('vraagt geen UPDATE bij een upsert die duplicaten negeert', () => {
    expect(rechtenVoor('upsert', `{ onConflict: 'a', ignoreDuplicates: true }`)).toEqual(['INSERT']);
  });
});

interface Actie {
  readonly pad: string;
  readonly tabel: string;
  readonly soort: string;
  readonly kolommen: string[] | null;
  readonly reden?: string;
}

/** `schrijfIn` komt uit een `.mjs` zonder typings — vandaar deze hulp. */
const alsActies = (ruw: unknown): Actie[] => ruw as Actie[];

interface Schrijfrecht {
  readonly kolommen: readonly string[];
  readonly totaal: number;
  readonly breed: boolean;
}

/** `ontleedSchrijfrechten` komt uit een `.mjs` zonder typings — vandaar deze hulp. */
const alsSchrijfrechten = (ruw: unknown): Record<string, Record<string, Schrijfrecht | undefined> | undefined> =>
  ruw as Record<string, Record<string, Schrijfrecht | undefined> | undefined>;

describe('schrijfIn', () => {
  it('vindt tabel, soort en kolommen in een gewone keten', () => {
    const uit = schrijfIn('a.ts', `supabase().from('goals').insert({ title: t, owner_id: u })`);

    expect(uit).toEqual([
      { pad: 'a.ts', tabel: 'goals', soort: 'insert', rechten: ['INSERT'], kolommen: ['title', 'owner_id'] },
    ]);
  });

  /** ⚠️ Precies de vorm van 0140: het schema levert de kolom, niet de aanroep. */
  it('volgt een spread naar het schema dat hem valideerde', () => {
    const bron = [
      `const gevalideerd = doelSchema.safeParse(invoer);`,
      `supabase().from('goals').insert({ ...gevalideerd.data, owner_id: u })`,
    ].join('\n');

    expect(schrijfIn('a.ts', bron, { doelSchema: ['ritme', 'title'] })[0]?.kolommen?.sort()).toEqual(
      ['owner_id', 'ritme', 'title'],
    );
  });

  it('leest een kale variabele uit hetzelfde bestand', () => {
    const bron = [
      `const update: TablesUpdate<'goals'> = {};`,
      `update.title = x;`,
      `supabase().from('goals').update(update).eq('id', i)`,
    ].join('\n');

    expect(schrijfIn('a.ts', bron)[0]?.kolommen).toEqual(['title']);
  });

  /** ⚠️ Ongemeten en niet leeg — anders verdwijnt een schrijfpad in stilte. */
  it.each([
    ['een spread die nergens heen wijst', `.from('milestones').insert(rijen.map((m) => ({ ...m, goal_id: g })))`],
    ['een variabele uit een functieaanroep', `const patch = f(x);\n.from('goals').update(patch)`],
  ])('meldt %s als onleesbaar', (_naam, bron) => {
    const uit = alsActies(schrijfIn('a.ts', bron));

    expect(uit[0]?.kolommen).toBeNull();
    expect(uit[0]?.reden).toBeTruthy();
  });

  it('kijkt niet verder dan de volgende keten', () => {
    const bron = `.from('goals').eq('a', 1)\n.from('profiles').update({ tz: z })`;
    const uit = schrijfIn('a.ts', bron);

    expect(uit).toHaveLength(1);
    expect(uit[0]?.tabel).toBe('profiles');
  });

  /** Een keten zonder schrijfactie hoort hier helemaal niet te verschijnen. */
  it('laat een gewone select met rust', () => {
    expect(schrijfIn('a.ts', `.from('goals').select('id').eq('x', 1)`)).toEqual([]);
  });

  it('leest het tweede argument van een upsert mee', () => {
    const bron = `.from('goal_group_links').upsert({ goal_id: g }, { onConflict: 'a', ignoreDuplicates: true })`;

    expect(schrijfIn('a.ts', bron)[0]?.rechten).toEqual(['INSERT']);
  });
});

describe('ontleedSchrijfrechten', () => {
  it('splitst per tabel en per recht', () => {
    const uit = alsSchrijfrechten(
      ontleedSchrijfrechten('goals|INSERT|14|8|owner_id,ritme\ngoals|UPDATE|14|0|\n'),
    );

    expect(uit.goals?.INSERT).toEqual({ kolommen: ['owner_id', 'ritme'], totaal: 14, breed: false });
    expect(uit.goals?.UPDATE?.kolommen).toEqual([]);
  });

  /**
   * ⚠️ **Een halve regel is een fout en geen lege grant**, en dat verschil is hier
   *    het hele punt. Zonder deze worp valt `kolommen.split()` om met een
   *    TypeError, en die werd in `hoofd()` opgevangen door de tak die "geen
   *    database" meldt — waarna de poort een kapotte uitlezing *ongemeten* noemt
   *    in plaats van rood. Een grendel die een fout in stilte omzet in een
   *    overslag is erger dan geen grendel; die zin staat in `poort.mjs`.
   */
  it('gooit op een afgekapte regel in plaats van hem als lege grant te lezen', () => {
    expect(() => ontleedSchrijfrechten('goals|INSERT|14|8')).toThrow(/onleesbare regel/);
  });

  /**
   * ⚠️ **De must-allow ernaast: een tabel waar niets op mag, is géén fout.** Die
   *    heeft een lege kolomlijst en een afsluitende `|`, en die hoort gewoon
   *    ingelezen te worden — anders valt de controle om op de helft van het
   *    schema.
   */
  it('leest een tabel zonder enige grant gewoon in', () => {
    const uit = alsSchrijfrechten(ontleedSchrijfrechten('points_ledger|INSERT|10|0|\n'));

    expect(uit.points_ledger?.INSERT?.kolommen).toEqual([]);
  });

  /** ⚠️ De grens die de controle bruikbaar houdt: breed is geen besluit per kolom. */
  it('herkent een tabelbrede grant', () => {
    const uit = alsSchrijfrechten(ontleedSchrijfrechten('milestones|INSERT|10|10|a,b\n'));

    expect(uit.milestones?.INSERT?.breed).toBe(true);
  });
});

const RECHTEN_SCHRIJF = {
  goals: {
    INSERT: { kolommen: ['owner_id', 'title'], totaal: 14, breed: false },
    UPDATE: { kolommen: [], totaal: 14, breed: false },
  },
  milestones: {
    INSERT: { kolommen: ['id', 'title', 'goal_id'], totaal: 3, breed: true },
    UPDATE: { kolommen: [], totaal: 3, breed: false },
  },
};

describe('beoordeelSchrijven', () => {
  /**
   * ⚠️ **Precies de toestand van commit `693149e`, en de reden dat dit issue
   *    bestaat.** `ritme` staat in het schema en dus in élke insert, en niet in
   *    de grant. Zonder deze grendel is dat een 42501 op iedere gebruiker die een
   *    doel aanmaakt, en blijft de hele poort groen.
   */
  it('meldt een kolom die geschreven wordt zonder recht', () => {
    const acties = schrijfIn('a.ts', `.from('goals').insert({ owner_id: u, title: t, ritme: r })`);
    const uit = beoordeelSchrijven({ acties, rechten: RECHTEN_SCHRIJF });

    expect(uit.ontbrekend).toHaveLength(1);
    expect(uit.ontbrekend[0]?.reden).toContain('`ritme`');
    expect(uit.ontbrekend[0]?.reden).toContain('42501');
  });

  /**
   * ⚠️ **De must-allow-helft, en het tweede acceptatiepunt van dit issue.** Op
   *    een tabelbrede grant is élke nieuwe kolom vanzelf schrijfbaar. Zou de
   *    controle daar ook melden, dan gaat hij over `id`, `created_at` en elke
   *    triggerkolom van elke tabel — en dan leer je hem uitzetten.
   */
  it('zwijgt over een tabel met een tabelbrede grant', () => {
    const acties = schrijfIn('a.ts', `.from('milestones').insert({ wat_dan_ook: x })`);

    expect(beoordeelSchrijven({ acties, rechten: RECHTEN_SCHRIJF }).ontbrekend).toEqual([]);
  });

  it('meldt een schrijfactie op een tabel waar niets mag', () => {
    const acties = schrijfIn('a.ts', `.from('goals').update({ title: t })`);
    const uit = beoordeelSchrijven({ acties, rechten: RECHTEN_SCHRIJF });

    expect(uit.ontbrekend[0]?.reden).toContain('geen enkel UPDATE-recht');
  });

  it('meldt een tabel die niet bestaat', () => {
    const acties = schrijfIn('a.ts', `.from('gaols').insert({ title: t })`);
    const uit = beoordeelSchrijven({ acties, rechten: RECHTEN_SCHRIJF });

    expect(uit.ontbrekend[0]?.reden).toContain('bestaat niet');
  });

  /** ⚠️ Het dode hout van QS8-113: een recht dat niemand ooit gebruikt. */
  it('meldt een grant zonder schrijfpad', () => {
    const acties = schrijfIn('a.ts', `.from('goals').insert({ owner_id: u })`);
    const uit = beoordeelSchrijven({ acties, rechten: RECHTEN_SCHRIJF });

    expect(uit.ongeschreven).toEqual([{ tabel: 'goals', soort: 'INSERT', kolommen: ['title'] }]);
  });

  /**
   * ⚠️ **Ongemeten is niet groen, en hier is dat een stílle val.** Eén onleesbare
   *    insert op een tabel zou anders élke andere kolom van die tabel "dood"
   *    maken — een lijst valse bevindingen, precies de vorm die je leert negeren.
   */
  it('houdt de dode-houtmelding in als één schrijfpad onleesbaar is', () => {
    const bron = [
      `.from('goals').insert({ owner_id: u })`,
      `const patch = f(x);`,
      `supabase().from('goals').insert(patch)`,
    ].join('\n');
    const uit = beoordeelSchrijven({ acties: schrijfIn('a.ts', bron), rechten: RECHTEN_SCHRIJF });

    expect(uit.ongeschreven).toEqual([]);
    expect(uit.onleesbaar).toHaveLength(1);
  });

  it('zwijgt als alles geschreven wordt', () => {
    const acties = schrijfIn('a.ts', `.from('goals').insert({ owner_id: u, title: t })`);
    const uit = beoordeelSchrijven({ acties, rechten: RECHTEN_SCHRIJF });

    expect(uit.ontbrekend).toEqual([]);
    expect(uit.ongeschreven).toEqual([]);
    expect(uit.onleesbaar).toEqual([]);
  });
});


/**
 * ⚠️ **Twee functies die de tegenovergestelde kant op kijken, en daarom apart.**
 *    `meldingen()` zoekt bevindingen die niet op een lijst staan; `verlopenRegels()`
 *    zoekt lijstregels die geen bevinding meer zijn. Samengevoegd zijn ze niet te
 *    voeden: elk verzonnen voorbeeld heeft een lege bevindingenlijst, en dan is
 *    élke uitzondering "verlopen". Dat is de vorm uit QS8-115 — een controle die
 *    je niet kunt voeden, kun je niet ijken.
 */
describe('meldingen', () => {
  const leeg = { ontbrekend: [], ongeschreven: [], onleesbaar: [] };

  /**
   * ⚠️ **Eigen lijsten en niet die van de module.** Lazen deze tests
   *    `GEEN_SCHRIJFPAD` rechtstreeks, dan hangen ze aan productiegegevens:
   *    zodra het groepsinstellingenscherm `icon` gaat schrijven — wat de reden
   *    bij die rij zélf aankondigt — breken ze om iets dat niets met hun
   *    onderwerp te maken heeft, en is de goedkoopste reparatie een andere
   *    willekeurige rij invullen. Dan bewaakt de ijking niets meer.
   */
  const lijsten = {
    geenSchrijfpad: [{ tabel: 'groups', soort: 'UPDATE', kolom: 'icon', reden: 'geen scherm' }],
    nietTeLezen: [
      { pad: 'src/modules/goals/interview.ts', tabel: 'goals', reden: 'een functie, geen literaal' },
    ],
  };

  it('zwijgt als er niets te melden valt', () => {
    expect(meldingen(leeg, lijsten)).toEqual([]);
  });

  /** ⚠️ De must-allow: een beoordeelde uitzondering hoort níet elke dag te piepen. */
  it('laat een bekende uitzondering met rust', () => {
    const uit = meldingen(
      { ...leeg, ongeschreven: [{ tabel: 'groups', soort: 'UPDATE', kolommen: ['icon'] }] },
      lijsten,
    );

    expect(uit).toEqual([]);
  });

  it('meldt een dode kolom die niet op de lijst staat', () => {
    const uit = meldingen(
      { ...leeg, ongeschreven: [{ tabel: 'groups', soort: 'UPDATE', kolommen: ['verzonnen'] }] },
      lijsten,
    );

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('groups.verzonnen');
  });

  it('splitst een dode grant op twee kolommen in twee meldingen', () => {
    const uit = meldingen(
      { ...leeg, ongeschreven: [{ tabel: 'groups', soort: 'UPDATE', kolommen: ['een', 'twee'] }] },
      lijsten,
    );

    expect(uit).toHaveLength(2);
  });

  it('meldt een onleesbaar pad dat niet op de lijst staat', () => {
    const uit = meldingen(
      { ...leeg, onleesbaar: [{ pad: 'src/nieuw.ts', tabel: 'goals', soort: 'insert', reden: 'iets' }] },
      lijsten,
    );

    expect(uit[0]).toContain('ongemeten is niet groen');
  });

  it('laat een bekend onleesbaar pad met rust', () => {
    const uit = meldingen(
      {
        ...leeg,
        onleesbaar: [
          { pad: 'src/modules/goals/interview.ts', tabel: 'goals', soort: 'update', reden: 'x' },
        ],
      },
      lijsten,
    );

    expect(uit).toEqual([]);
  });
});

describe('verlopenRegels', () => {
  /**
   * ⚠️ **Een verlopen uitzondering is een leugen in een grendel.** Hij zegt "dit
   *    is beoordeeld" over een toestand die niet meer bestaat, en dekt daarna de
   *    volgende bevinding op diezelfde plek stilletjes af.
   */
  it('meldt elke regel waarvoor geen bevinding meer bestaat', () => {
    const lijsten = {
      geenSchrijfpad: [{ tabel: 'groups', soort: 'UPDATE', kolom: 'icon', reden: 'x' }],
      nietTeLezen: [{ pad: 'src/a.ts', tabel: 'goals', reden: 'x' }],
    };
    const uit = verlopenRegels({ ongeschreven: [], onleesbaar: [], ongemeten: {} }, lijsten);

    expect(uit).toHaveLength(2);
    expect(uit.some((r: string) => r.includes('GEEN_SCHRIJFPAD'))).toBe(true);
    expect(uit.some((r: string) => r.includes('NIET_TE_LEZEN'))).toBe(true);
  });

  /**
   * ⚠️ **Het gat dat de review vond, en het gevaarlijkste van deze PR.**
   *    `ongeschreven` zwijgt om drie redenen: de grant werd tabelbreed, er is
   *    geen grant, of één schrijfpad is onleesbaar. Zonder onderscheid leest
   *    `verlopenRegels()` alle drie als "wordt geschreven — haal de uitzondering
   *    weg". Nagespeeld: één onleesbare insert op `chat_messages` gaf de opdracht
   *    om de rij voor `system_event` te verwijderen — de kolom die CLAUDE.md met
   *    drie sloten bewaakt, omdat systeemberichten anders te vervalsen zijn.
   *
   *    **Een rode grendel die je vertelt een grendel te slopen, is erger dan geen
   *    grendel**, en een verkeerde instructie in een grendel wordt op een dag
   *    opgevolgd.
   */
  it('zegt "herzie" en niet "haal weg" als de tabel ongemeten is', () => {
    const lijsten = {
      geenSchrijfpad: [{ tabel: 'chat_messages', soort: 'INSERT', kolom: 'system_event', reden: 'x' }],
      nietTeLezen: [],
    };
    const uit = verlopenRegels(
      {
        ongeschreven: [],
        onleesbaar: [],
        ongemeten: { 'chat_messages|INSERT': 'één schrijfpad naar deze tabel is niet te lezen' },
      },
      lijsten,
    );

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('ongemeten');
    expect(uit[0]).not.toMatch(/wórdt geschreven/);
  });

  /** ⚠️ En zonder die reden is het wél gewoon verlopen — beide kanten. */
  it('zegt "haal weg" als er niets ongemeten is', () => {
    const lijsten = {
      geenSchrijfpad: [{ tabel: 'groups', soort: 'UPDATE', kolom: 'icon', reden: 'x' }],
      nietTeLezen: [],
    };
    const uit = verlopenRegels({ ongeschreven: [], onleesbaar: [], ongemeten: {} }, lijsten);

    expect(uit[0]).toMatch(/wórdt geschreven/);
  });

  it('zwijgt over een regel die nog steeds een bevinding is', () => {
    const lijsten = {
      geenSchrijfpad: [{ tabel: 'groups', soort: 'UPDATE', kolom: 'icon', reden: 'x' }],
      nietTeLezen: [],
    };
    const uit = verlopenRegels(
      { ongeschreven: [{ tabel: 'groups', soort: 'UPDATE', kolommen: ['icon'] }], onleesbaar: [], ongemeten: {} },
      lijsten,
    );

    expect(uit).toEqual([]);
  });
});

/**
 * ⚠️ **De ijking tegen het échte project.** Verzonnen voorbeelden zijn groen op
 *    alles wat je bedacht hebt. Deze legt de controle de codebase voor die er
 *    werkelijk ligt — precies het gat dat `tekst:controle` maandenlang had.
 *
 * ⚠️ **Zonder database is dit ongemeten en niet groen**, want de grants staan
 *    niet in de code. Wat hier wél zonder database te toetsen is, is de leeskant
 *    van de schrijfkant: welke kolommen de codebase volgens deze controle
 *    schrijft, en waar ze niet te lezen zijn.
 */
describe('de echte codebase', () => {
  const WORTEL = join(__dirname, '..', '..');

  /**
   * ⚠️ **Via `bronbestanden()` en `schrijfacties()` uit het script zélf**, en niet
   *    via een eigen kopie ervan. Die kopie stond hier tot de review op PR #140,
   *    en toen bleek waarom dat niet werkt: haal je in `schrijfacties()` het
   *    `schemas`-argument weg, dan mist de échte controle `goals.ritme` — de
   *    bevinding waar dit hele issue voor bestaat — en blijft élke test hier
   *    groen, want het blok bouwde zijn eigen schema-map. Regel 18 vraag 3, met
   *    een gemeten antwoord.
   */
  const acties: Actie[] = alsActies(
    schrijfacties(bronbestanden(), (pad: string) => readFileSync(pad, 'utf8')),
  );

  const van = (tabel: string, soort: string): Actie[] =>
    acties.filter((a) => a.tabel === tabel && a.soort === soort);

  /**
   * ⚠️ **Gelijkheid en geen ondergrens, en dat verschil is de hele test.** Hier
   *    stond `toBeGreaterThanOrEqual(27)` met erboven de zin "zakt dit getal, dan
   *    is er een vorm bijgekomen die deze controle niet leest". Dat is precies
   *    wat een ondergrens *niet* meet: een onzichtbare schrijfactie verlaagt de
   *    teller niet, hij verhoogt hem gewoon niet. De test bleef dan groen terwijl
   *    de belofte brak — regel 18 vraag 3, en vraag 4 erbij, want hij greep naar
   *    een aantal in plaats van naar de belofte.
   *
   *    De tweede telling is onafhankelijk: een kale grep over dezelfde bestanden.
   *    Die kent de parser niet en kan dus niet met hem meebewegen.
   */
  it('vindt élke PostgREST-schrijfketen in src en app', () => {
    const geteld = bronbestanden()
      .map((pad: string) => readFileSync(pad, 'utf8').match(/\.(insert|update|upsert)\(/g) ?? [])
      .reduce((n: number, m: RegExpMatchArray | string[]) => n + m.length, 0);

    expect(
      acties.length,
      'een schrijfactie die de parser niet ziet, telt hier niet mee — en dan zwijgt ' +
        'de controle over die tabel in béide richtingen',
    ).toBe(geteld);
  });

  /** ⚠️ Zonder deze regel bewaakt de test hierboven een leeg getal. */
  it('vindt er meer dan een handvol', () => {
    expect(acties.length).toBeGreaterThan(20);
  });

  /**
   * ⚠️ **Het geval van 0140, in het echt.** `ritme` staat nergens in de aanroep:
   *    hij komt uitsluitend uit `doelSchema` via de spread. Leest de controle die
   *    spread niet, dan is dit precies de kolom die hij mist — en dan is dit
   *    issue voor niets gebouwd.
   */
  it('ziet `ritme` in de insert op goals, hoewel het er niet staat', () => {
    expect(van('goals', 'insert')[0]?.kolommen).toContain('ritme');
  });

  /**
   * ⚠️ **De keten van QS8-253 is nog steeds onderbroken, en dat hoort zo te
   *    blijven staan tot QS8-260 hem sluit.** `maakWeekdoel()` schrijft de twee
   *    dagvelden niet, dus de grant erop is dood hout — en dat meldt de controle,
   *    via `GEEN_SCHRIJFPAD`, met de reden erbij.
   *
   *    Een eerdere versie van deze PR zette de kolommen in de insert. Dat maakte
   *    de melding stil zonder dat er ooit een getal in kon komen: geen enkel
   *    scherm geeft ze mee, en `weekdoelSchema` heeft `.default(null)`. **De
   *    dode-houtrichting toetst of een kolomnaam voorkomt, niet of er een pad is
   *    dat er een waarde in stopt** — dus een kolom in een literaal zetten is de
   *    goedkoopste manier om een QS8-113-melding te doven. Deze test houdt dat
   *    tegen.
   */
  it.each(['floor_days', 'ceiling_days'])(
    'schrijft %s (nog) niet naar weekly_goals — zie QS8-260',
    (kolom) => {
      expect(van('weekly_goals', 'insert')[0]?.kolommen).not.toContain(kolom);
    },
  );

  /**
   * ⚠️ De lijst is uitputtend en geen ondergrens: komt er een derde onleesbare
   *    vorm bij, dan hoort die beoordeeld te worden en niet meegeteld.
   */
  it('leest de kolommen van elke schrijfactie op twee na', () => {
    const onleesbaar = acties.filter((a) => a.kolommen === null);

    expect(onleesbaar.map((a) => a.pad).sort()).toEqual([
      'src/modules/ai/plan-toepassen.ts',
      'src/modules/goals/interview.ts',
    ]);
  });

  /**
   * ⚠️ **De vorm van de uitzonderingslijsten, tegen het echte project.** De
   *    unittests hierboven voeden hun eigen lijsten — anders hangen ze aan
   *    productiegegevens en breken ze zodra iemand `groups.icon` gaat schrijven.
   *    Wat dán niemand meer toetst is of de échte lijsten kloppen van vorm, en
   *    dat is wat hier staat.
   */
  it('schrijft elk pad in NIET_TE_LEZEN met schuine strepen', () => {
    for (const regel of NIET_TE_LEZEN) {
      expect(regel.pad, `${regel.pad} — vergelijk met bronnaam(), die normaliseert`).not.toContain(
        '\\',
      );
      expect(regel.reden.length).toBeGreaterThan(20);
    }
  });

  it('geeft elke regel in GEEN_SCHRIJFPAD een reden', () => {
    for (const regel of GEEN_SCHRIJFPAD) {
      expect(regel.reden.length, `${regel.tabel}.${regel.kolom} staat er zonder reden`).toBeGreaterThan(
        20,
      );
    }
  });

  /** ⚠️ Op Windows levert `relative()` backslashes; de lijsten gebruiken `/`. */
  it('normaliseert een pad naar de vorm die de lijsten opschrijven', () => {
    expect(bronnaam(join(WORTEL, 'src', 'modules', 'goals', 'interview.ts'))).toBe(
      'src/modules/goals/interview.ts',
    );
  });
});
