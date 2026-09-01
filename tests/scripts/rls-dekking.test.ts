import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `letterversies.test.ts`.
import {
  bestandenVoor,
  herstelSql,
  ontleedPolicies,
  oordeel,
  verzwakSql,
} from '../../scripts/rls-dekking.mjs';

/**
 * IJking van het dekkingsinstrument — QS8-185.
 *
 * ⚠️ **Dit script beweert iets over de kwaliteit van de testsuite, en dus moet
 *    het zelf onder test.** Een meetinstrument dat "alles is bewaakt" zegt omdat
 *    het de policy nooit echt heeft opengezet, is erger dan geen instrument: het
 *    geeft een gerustheid waar niets onder zit.
 *
 * ⚠️ **De gevaarlijke kant is hier `herstelSql`.** Dit script muteert een échte
 *    database. Zet hij een policy verkeerd terug, dan staat er een gat open dat
 *    niemand ziet — en dat gat lijkt op werk dat af is. Vandaar dat de heen- en
 *    terugweg allebei los onder test staan, inclusief een policy die alleen een
 *    `with check` heeft en een naam met een aanhalingsteken erin.
 *
 * IJKING — met de hand gedraaid op 01-09-2026:
 *
 *   A  `verzwakSql` het `with check`-deel laten weglaten   → 4 rood
 *   B  `herstelSql` `using (true)` laten teruggeven        → 4 rood
 *   C  `bestandenVoor` een lege lijst laten teruggeven     → 1 rood
 *   D  `oordeel` groen als bewaakt lezen                   → 2 rood
 *   E  de veldtoets uit `ontleedPolicies`                  → 1 rood
 */

const rij = JSON.stringify([
  {
    tabel: 'goals',
    naam: 'goals_select',
    cmd: 'r',
    // ⚠️ Met een nieuwe regel én een pijp erin: dat is hoe Postgres een policy
    //    opmaakt, en het is precies waar de eerste versie van dit script op
    //    stukliep (`approval_withdrawals_select`).
    qual: '(owner_id = auth.uid())\n  OR is_group_member(group_id)',
    wcheck: '',
  },
]);

describe('ontleedPolicies', () => {
  it('leest een uitdrukking met nieuwe regels en pijpen heel in', () => {
    const p = ontleedPolicies(rij)[0];

    expect(p.qual).toContain('\n');
    expect(p.naam).toBe('goals_select');
  });

  it('valt niet om op een lege lijst', () => {
    expect(ontleedPolicies('[]')).toEqual([]);
  });

  /** ⚠️ Een halve rij is een fout en geen lege policy — zie `kolomrechten`. */
  it.each([
    ['een veld dat mist', '[{"tabel":"goals","naam":"x","cmd":"r"}]'],
    ['geen lijst', '{"tabel":"goals"}'],
  ])('gooit op %s', (_naam, json) => {
    expect(() => ontleedPolicies(json)).toThrow();
  });
});

describe('verzwakSql', () => {
  it('zet een using-policy wagenwijd open', () => {
    expect(verzwakSql({ tabel: 'goals', naam: 'g_select', qual: 'owner_id = x', wcheck: '' })).toBe(
      'alter policy "g_select" on public."goals" using (true);',
    );
  });

  /** ⚠️ Een INSERT-policy heeft alléén een `with check` — die tak is de helft. */
  it('zet een with-check-policy open', () => {
    expect(verzwakSql({ tabel: 'goals', naam: 'g_insert', qual: '', wcheck: 'owner_id = x' })).toBe(
      'alter policy "g_insert" on public."goals" with check (true);',
    );
  });

  it('zet ze allebei open als ze er allebei zijn', () => {
    const sql = verzwakSql({ tabel: 'g', naam: 'p', qual: 'a', wcheck: 'b' });

    expect(sql).toContain('using (true)');
    expect(sql).toContain('with check (true)');
  });

  /** ⚠️ Een policy zonder uitdrukking valt niet te verzwakken — en dat is geen fout. */
  it('geeft null als er niets open te zetten valt', () => {
    expect(verzwakSql({ tabel: 'g', naam: 'p', qual: '', wcheck: '' })).toBeNull();
  });
});

describe('herstelSql', () => {
  it('zet de oorspronkelijke uitdrukking terug', () => {
    expect(herstelSql({ tabel: 'goals', naam: 'g_select', qual: 'owner_id = x', wcheck: '' })).toBe(
      'alter policy "g_select" on public."goals" using (owner_id = x);',
    );
  });

  it('zet beide helften terug', () => {
    const sql = herstelSql({ tabel: 'g', naam: 'p', qual: 'a', wcheck: 'b' });

    expect(sql).toBe('alter policy "p" on public."g" using (a) with check (b);');
  });

  /**
   * ⚠️ **Heen en terug moeten elkaars spiegel zijn**, anders blijft er een gat
   *    open na een meting. Dit is de eigenschap die het instrument veilig maakt.
   */
  it.each([
    ['alleen using', { tabel: 'g', naam: 'p', qual: 'a = 1', wcheck: '' }],
    ['alleen with check', { tabel: 'g', naam: 'p', qual: '', wcheck: 'b = 2' }],
    ['allebei', { tabel: 'g', naam: 'p', qual: 'a = 1', wcheck: 'b = 2' }],
  ])('%s: de terugweg noemt precies dezelfde helften als de heenweg', (_naam, policy) => {
    const open = verzwakSql(policy) ?? '';
    const terug = herstelSql(policy) ?? '';

    expect(open.includes('using')).toBe(terug.includes('using'));
    expect(open.includes('with check')).toBe(terug.includes('with check'));
    expect(terug).not.toContain('(true)');
  });

  it('kwoot een naam met een aanhalingsteken erin', () => {
    expect(herstelSql({ tabel: 'g', naam: 'raar"naam', qual: 'a', wcheck: '' })).toContain(
      '"raar""naam"',
    );
  });
});

describe('bestandenVoor', () => {
  const bestanden = [
    { naam: 'a.test.ts', inhoud: "from('goals')" },
    { naam: 'b.test.ts', inhoud: "from('groups')" },
  ];

  it('kiest de bestanden die de tabel noemen', () => {
    expect(bestandenVoor('goals', bestanden)).toEqual(['a.test.ts']);
  });

  /**
   * ⚠️ **Noemt niemand de tabel, dan draait álles.** Dat is met opzet de dure
   *    kant: zou dit een lege lijst teruggeven, dan draait er geen enkele test,
   *    wordt er niets rood, en meldt het instrument "onbewaakt" over een policy
   *    die misschien prima gedekt is. Een instrument dat bij twijfel de
   *    beschuldigende kant op valt, leer je te negeren.
   */
  it('draait alles als niemand de tabel noemt', () => {
    expect(bestandenVoor('nergens', bestanden)).toEqual(['a.test.ts', 'b.test.ts']);
  });
});

describe('oordeel', () => {
  const policy = { tabel: 'g', naam: 'p', cmd: 'r', qual: 'a', wcheck: '' };

  it('noemt een policy bewaakt als er iets rood werd', () => {
    expect(oordeel(policy, 'rood').status).toBe('bewaakt');
  });

  /** ⚠️ Groen ná het openzetten betekent: niemand mist deze policy. */
  it('noemt een policy onbewaakt als alles groen bleef', () => {
    const uit = oordeel(policy, 'groen');

    expect(uit.status).toBe('onbewaakt');
    expect(uit.melding).toContain('geen enkele test werd rood');
  });

  it('houdt een policy zonder uitdrukking apart', () => {
    expect(oordeel(policy, 'onverzwakbaar').status).toBe('geen-uitdrukking');
  });
});
