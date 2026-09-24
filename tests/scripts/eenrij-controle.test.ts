import { describe, expect, it } from 'vitest';

import {
  ZONDER_GARANTIE,
  beoordeel,
  dekkingVoor,
  garantiesUit,
  ketensIn,
  predicaatUit,
  statementsIn,
  viewBasisUit,
} from '../../scripts/eenrij-controle.mjs';

/**
 * IJking van `scripts/eenrij-controle.mjs` — QS8-605.
 *
 * ⚠️⚠️ **De belofte is niet "er staat overal een sleutel".** Dat is de uitkomst
 *    van vandaag. De belofte is: *elke `.single()` en `.maybeSingle()` draagt een
 *    reden waarom er hoogstens één rij terug kan komen* — en die reden is
 *    structureel, niet "ziet er goed uit".
 *
 * ⚠️⚠️ **Het moeilijke geval is de partiële index, en hij staat er twee keer in.**
 *    `completions_active_uniq` is uniek op `weekly_goal_id` **waar**
 *    `superseded_by is null`. Dezelfde index, dezelfde aanroep, één filter
 *    verschil — en de uitkomst moet omklappen. Een controle die het predicaat
 *    niet leest, keurt precies de aanroep goed die vandaag écht mis kan gaan.
 *
 * ⚠️ **De must-allow-helft is hier de zwaarste.** Een controle die alles meldt,
 *    leer je uitzetten; daarom staat bij elke zeef ook de vorm die hij met rust
 *    moet laten.
 */

const COMPLETIONS_SQL = `
create table if not exists public.completions (
  id uuid primary key default gen_random_uuid(),
  weekly_goal_id uuid not null references public.weekly_goals (id),
  superseded_by uuid
);
create unique index if not exists completions_active_uniq
  on completions (weekly_goal_id) where superseded_by is null;
`;

describe('statementsIn', () => {
  it('splitst op een puntkomma buiten haakjes', () => {
    expect(statementsIn('const a = 1; const b = 2;')).toHaveLength(3);
  });

  it('laat een accolade een statement niet opslokken', () => {
    // ⚠️ Dit was de eerste fout: met `{` en `}` als diepte staat elke `;` in een
    //    functielichaam op diepte 1, en dan is het hele bestand één statement.
    const bron = 'function f() { const a = 1; const b = 2; }';
    expect(statementsIn(bron).length).toBeGreaterThan(2);
  });

  it('splitst niet binnen haakjes', () => {
    expect(statementsIn('for (let i = 0; i < 3; i += 1) {}')).toHaveLength(1);
  });
});

describe('ketensIn', () => {
  it('leest tabel, filters en afsluiter', () => {
    const [keten] = ketensIn(`
      const x = await db.from('goals').select('*').eq('id', goalId).maybeSingle();
    `);
    expect(keten).toMatchObject({ tabel: 'goals', soort: 'maybeSingle', onleesbaar: false });
    expect(keten?.eq).toEqual([{ kolom: 'id', waarde: 'goalId' }]);
  });

  it('herkent limit(1), insert en is-null', () => {
    const [a] = ketensIn(`db.from('t').order('x').limit(1).maybeSingle();`);
    const [b] = ketensIn(`db.from('t').insert({ a: 1 }).select('*').single();`);
    const [c] = ketensIn(`db.from('t').eq('a', 1).is('b', null).maybeSingle();`);
    expect(a?.heeftLimiet1).toBe(true);
    expect(b?.schrijft).toBe(true);
    expect(c?.isNull).toEqual(['b']);
  });

  // MUST-ALLOW: commentaar is geen code.
  it('telt een aanroep in commentaar niet mee', () => {
    // ⚠️ Precies de fout die de ijking van QS8-594 vond en het schrijven niet.
    expect(ketensIn(`// db.from('t').maybeSingle();\nconst a = 1;`)).toHaveLength(0);
    expect(ketensIn(`/* db.from('t').maybeSingle(); */\nconst a = 1;`)).toHaveLength(0);
  });

  // MUST-FIND: wat hij niet kan lezen, meldt hij.
  it('meldt een keten zonder leesbare from() als onleesbaar', () => {
    const [keten] = ketensIn(`const x = await query.maybeSingle();`);
    expect(keten?.onleesbaar).toBe(true);
  });

  it('leest twee ketens in één functielichaam', () => {
    const bron = `
      async function f() {
        const a = await db.from('x').eq('id', 1).maybeSingle();
        const b = await db.from('y').eq('id', 2).maybeSingle();
      }
    `;
    expect(ketensIn(bron).map((k) => k.tabel)).toEqual(['x', 'y']);
  });
});

describe('predicaatUit', () => {
  it('leest de twee vormen die in dit schema voorkomen', () => {
    expect(predicaatUit('where superseded_by is null')).toEqual({
      kolom: 'superseded_by',
      soort: 'is_null',
    });
    expect(predicaatUit("where status = 'open'")).toEqual({
      kolom: 'status',
      soort: 'eq',
      waarde: 'open',
    });
  });

  it('geeft geen predicaat terug als er geen where is', () => {
    expect(predicaatUit(undefined)).toBeNull();
  });

  // MUST-FIND: onbekend is niet hetzelfde als afwezig.
  it('markeert een predicaat dat hij niet snapt als onleesbaar', () => {
    // ⚠️ Zou dit `null` geven, dan telt de index als een volledige garantie en is
    //    de controle op precies dit punt te soepel.
    expect(predicaatUit('where a = b and c > 3')).toMatchObject({ onleesbaar: expect.any(String) });
  });
});

describe('garantiesUit', () => {
  it('leest een sleutel op de kolom én op de tabel', () => {
    const g = garantiesUit([
      `create table if not exists public.goal_risk (
         goal_id uuid primary key references public.goals(id)
       );`,
      `create table if not exists public.group_members (
         group_id uuid not null,
         user_id uuid not null,
         primary key (group_id, user_id)
       );`,
    ]);
    expect(g.get('goal_risk')).toEqual([{ kolommen: ['goal_id'], predicaat: null }]);
    expect(g.get('group_members')).toEqual([
      { kolommen: ['group_id', 'user_id'], predicaat: null },
    ]);
  });

  it('houdt het predicaat van een partiële index vast', () => {
    const g = garantiesUit([COMPLETIONS_SQL]);
    expect(g.get('completions')).toContainEqual({
      kolommen: ['weekly_goal_id'],
      predicaat: { kolom: 'superseded_by', soort: 'is_null' },
    });
  });

  it('laat een view erven van zijn basistabel', () => {
    const g = garantiesUit([
      `create table if not exists public.profiles (id uuid primary key, naam text);`,
      `create or replace view public.mijn_profiel as select id, naam from public.profiles p
         where id = (select auth.uid());`,
    ]);
    expect(g.get('mijn_profiel')).toEqual([{ kolommen: ['id'], predicaat: null }]);
  });

  // MUST-ALLOW omgekeerd: wat hij niet zeker weet, erft niet.
  it('laat een view met een join niets erven', () => {
    const g = garantiesUit([
      `create table if not exists public.profiles (id uuid primary key);`,
      `create or replace view public.samen as
         select p.id from public.profiles p join public.groups x on x.id = p.id;`,
    ]);
    expect(g.get('samen')).toBeUndefined();
  });
});

describe('viewBasisUit', () => {
  it('kijkt door scalaire subquery’s heen naar de buitenste from', () => {
    const view = viewBasisUit(`with (security_invoker = true) as
      select g.id, (select count(*) from milestones m where m.goal_id = g.id) as n
      from goals g`);
    expect(view).toMatchObject({ basis: 'goals' });
    expect(view?.kolommen).toEqual(['id', 'n']);
  });

  it('weigert wat hij niet zeker weet', () => {
    expect(viewBasisUit('select a from x join y on y.a = x.a')).toBeNull();
    expect(viewBasisUit('select count(*) as n from x group by a')).toBeNull();
  });
});

describe('dekkingVoor — de vier structurele vormen', () => {
  const garanties = garantiesUit([COMPLETIONS_SQL]);
  const basis = { tabel: 'completions', soort: 'maybeSingle', onleesbaar: false, eq: [], isNull: [] };

  it('een insert geeft zijn eigen rij terug', () => {
    expect(dekkingVoor({ ...basis, schrijft: true }, garanties)).toContain('insert');
  });

  it('limit(1) maakt precies één de definitie', () => {
    expect(dekkingVoor({ ...basis, heeftLimiet1: true }, garanties)).toContain('limit(1)');
  });

  it('een filter op de primaire sleutel volstaat', () => {
    expect(dekkingVoor({ ...basis, eq: [{ kolom: 'id', waarde: 'x' }] }, garanties)).toContain('id');
  });

  // ⚠️⚠️ Het paar dat dit hele issue draagt — dezelfde index, één filter verschil.
  it('dekt de partiële index MÉT zijn predicaat', () => {
    const keten = { ...basis, eq: [{ kolom: 'weekly_goal_id', waarde: 'w' }], isNull: ['superseded_by'] };
    expect(dekkingVoor(keten, garanties)).toContain('weekly_goal_id');
  });

  it('dekt hem NIET zonder dat predicaat', () => {
    const keten = { ...basis, eq: [{ kolom: 'weekly_goal_id', waarde: 'w' }], isNull: [] };
    expect(dekkingVoor(keten, garanties)).toBeNull();
  });
});

describe('beoordeel', () => {
  const garanties = garantiesUit([COMPLETIONS_SQL]);

  it('meldt een aanroep zonder garantie', () => {
    const uit = beoordeel(
      [{ pad: 'src/a.ts', inhoud: `db.from('completions').eq('weekly_goal_id', w).maybeSingle();` }],
      garanties,
      [],
    );
    expect(uit.ongedekt).toHaveLength(1);
    expect(uit.ongedekt[0]).toMatchObject({ pad: 'src/a.ts', tabel: 'completions' });
  });

  it('laat dezelfde aanroep mét het predicaat met rust', () => {
    const uit = beoordeel(
      [
        {
          pad: 'src/a.ts',
          inhoud: `db.from('completions').eq('weekly_goal_id', w).is('superseded_by', null).maybeSingle();`,
        },
      ],
      garanties,
      [],
    );
    expect(uit.ongedekt).toEqual([]);
  });

  it('meldt een onleesbare keten', () => {
    const uit = beoordeel([{ pad: 'src/a.ts', inhoud: `await q.single();` }], garanties, []);
    expect(uit.onleesbaar).toHaveLength(1);
  });

  // ⚠️ De ratel slaat twee kanten op, zoals bij `levend:controle`.
  it('meldt een registerrij die niets meer dekt', () => {
    const uit = beoordeel([{ pad: 'src/a.ts', inhoud: 'const a = 1;' }], garanties, [
      { pad: 'src/a.ts', tabel: 'completions', reden: 'verzonnen' },
    ]);
    expect(uit.ongebruikt).toHaveLength(1);
  });
});

describe('het register', () => {
  // 📏 De belofte van QS8-605: alle aanroepen zijn structureel gedekt, dus er is
  //    niets weg te schrijven. Een register dat op dag één vol staat is een
  //    inventaris, en die leer je overslaan.
  it('begint leeg', () => {
    expect(ZONDER_GARANTIE).toEqual([]);
  });
});
