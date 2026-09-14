import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leest de JSDoc ernaast.
import { beoordeel, CENSUS, ontleed } from '../../scripts/groepskolommen-controle.mjs';

/**
 * QS8-457 — een nieuwe kolom op een tabel met een tabelbrede SELECT-grant.
 *
 * ⚠️ **Deze tests bestaan omdat de controle een database nodig heeft.** Zonder
 *    database slaat hij zichzelf over, en een controle die je nooit rood ziet
 *    worden is een aanname. De vier database-kanten zijn met de hand geijkt
 *    tegen de lokale stack; de twee registerkanten staan hier, want die zijn
 *    alleen te voeden.
 *
 * ⚠️⚠️ **Eén ijking liep mis en dat staat hier omdat de les breder is.** 📏 Bij
 *    het ijken van de "nieuwe kolom"-grendel werd de controle rood op een
 *    **andere** bevinding: een `zz_probe_ids`-tabel die een parallel draaiende
 *    review-agent op datzelfde moment in dezelfde database aanmaakte. Had ik
 *    alleen naar de exitcode gekeken, dan had ik een groene grendel voor
 *    geijkt aangezien. CLAUDE.md bij regel 18: kijk wélke bevinding er rood
 *    wordt, en meet "ervoor" ook echt.
 */

const CENSUSRIJ = { groepszichtbaar: true, kolommen: 'id, user_id, status' };

describe('beoordeel — de vier kanten', () => {
  it('meldt niets als de database gelijk is aan de census', () => {
    const uitslag = beoordeel([{ tabel: 'weekly_goals', kolommen: 'id, user_id, status' }], {
      weekly_goals: CENSUSRIJ,
    });

    expect(uitslag.nieuweTabellen).toEqual([]);
    expect(uitslag.verdwenenTabellen).toEqual([]);
    expect(uitslag.kolomverschillen).toEqual([]);
  });

  it('meldt een kolom die erbij is gekomen', () => {
    const uitslag = beoordeel(
      [{ tabel: 'weekly_goals', kolommen: 'id, user_id, status, notitie' }],
      { weekly_goals: CENSUSRIJ },
    );

    expect(uitslag.kolomverschillen).toHaveLength(1);
    expect(uitslag.kolomverschillen[0]).toMatchObject({
      tabel: 'weekly_goals',
      groeps: true,
      erbij: ['notitie'],
      eraf: [],
    });
  });

  it('meldt een kolom die uit de census verdwenen is', () => {
    // ⚠️ De andere kant van de ratel. Een registerrij die naar een kolom wijst
    //    die er niet meer is, dekt ooit stilletjes een nieuwe kolom met
    //    dezelfde naam.
    const uitslag = beoordeel([{ tabel: 'weekly_goals', kolommen: 'id, user_id' }], {
      weekly_goals: CENSUSRIJ,
    });

    expect(uitslag.kolomverschillen[0]).toMatchObject({ erbij: [], eraf: ['status'] });
  });

  it('meldt een tabel die niet in de census staat', () => {
    const uitslag = beoordeel([{ tabel: 'zz_nieuw', kolommen: 'id' }], {});

    expect(uitslag.nieuweTabellen).toEqual(['zz_nieuw']);
  });

  it('meldt een censusrij waarvan de tabel de grant kwijt is', () => {
    const uitslag = beoordeel([], { weekly_goals: CENSUSRIJ });

    expect(uitslag.verdwenenTabellen).toEqual(['weekly_goals']);
  });

  it('draagt de groepszichtbaarheid mee in de melding', () => {
    // De meldtekst verschilt: bij een groepszichtbare tabel komt de verplichte
    // vraag uit CLAUDE.md erbij, bij een andere niet.
    const uitslag = beoordeel([{ tabel: 't', kolommen: 'id, x' }], {
      t: { groepszichtbaar: false, kolommen: 'id' },
    });

    expect(uitslag.kolomverschillen[0]).toMatchObject({ groeps: false, erbij: ['x'] });
  });
});

describe('ontleed', () => {
  it('splitst tabel en kolommen op de eerste streep', () => {
    expect(ontleed('weekly_goals|id, user_id\ngroups|id, name\n')).toEqual([
      { tabel: 'weekly_goals', kolommen: 'id, user_id' },
      { tabel: 'groups', kolommen: 'id, name' },
    ]);
  });

  it('geeft een lege lijst op lege uitvoer', () => {
    expect(ontleed('')).toEqual([]);
  });
});

describe('de census zelf', () => {
  it('draagt de veertig tabellen met een tabelbrede SELECT-grant', () => {
    // 📏 Gemeten op 14-09-2026 tegen een verse opbouw (269 migraties).
    expect(Object.keys(CENSUS)).toHaveLength(40);
  });

  it('merkt er eenentwintig als groepszichtbaar', () => {
    // ⚠️ Exact de lijst uit QS8-457. `groups` hoort erbij en is makkelijk te
    //    missen: `groups_select` is `mag_groep_lezen(id)` en delegeert naar een
    //    functie, dus een regex op `polqual` ziet hem niet.
    const groeps = Object.entries(CENSUS)
      .filter(([, t]) => t.groepszichtbaar)
      .map(([naam]) => naam);

    expect(groeps).toHaveLength(21);
    expect(groeps).toContain('groups');
    expect(groeps).toContain('weekly_goals');
    expect(groeps).not.toContain('points_ledger');
  });

  it('heeft voor elke tabel een niet-lege kolomlijst', () => {
    for (const [naam, t] of Object.entries(CENSUS)) {
      expect(t.kolommen.length, `${naam} heeft een lege kolomlijst`).toBeGreaterThan(0);
    }
  });
});
