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
  it('draagt de drieënveertig relaties met een tabelbrede SELECT-grant', () => {
    // 📏 Gemeten op 14-09-2026 tegen een verse opbouw (269 migraties): 40
    //    tabellen én 4 views. Die views ontbraken tot de security-ronde —
    //    `relkind in ('r','p')` sloot ze uit terwijl `pg_default_acl` objtype
    //    `r` in Postgres tabellen én views dekt.
    // ⚠️ **43 sinds 0280, en dat was 44.** `commitments` is eruit: die tabel
    //    heeft geen tabelbrede SELECT meer. 0280 voegde er `tz` aan toe — de
    //    bevroren zone onder een straf — en `commitments_select` geeft de
    //    begunstigde groep leesrecht zodra een straf verschuldigd wordt. Met een
    //    tabelbrede grant had die groep de tijdzone van de eigenaar meegelezen,
    //    dus is het recht per kolom teruggegeven zónder `tz`. Een censusrij voor
    //    een tabel zonder tabelbrede grant dekt ooit stilletjes een tabel die hem
    //    wél heeft — de controle wordt daar zelf rood op.
    expect(Object.keys(CENSUS)).toHaveLength(43);
  });

  it('heeft de vier views erin', () => {
    // ⚠️ Drie ervan staan op `security_invoker = false` en draaien als de
    //    eigenaar; daar is de `where` in de view de énige grens.
    for (const v of ['goal_dashboard', 'group_visible_streaks', 'mijn_doelvelden', 'mijn_profiel']) {
      expect(Object.keys(CENSUS), `${v} ontbreekt in de census`).toContain(v);
    }
  });

  it('merkt er vierentwintig als groepszichtbaar', () => {
    // ⚠️ `groups` is makkelijk te missen: `groups_select` is
    //    `mag_groep_lezen(id)` en delegeert naar een functie.
    const groeps = Object.entries(CENSUS)
      .filter(([, t]) => t.groepszichtbaar)
      .map(([naam]) => naam);

    // ⚠️ 24 sinds 0280 en dat was 25 — `commitments` telde als groepszichtbaar
    //    en staat nu niet meer in de census. Hij ís nog steeds groepszichtbaar;
    //    wat verdween is de tabelbrede grant waar deze census over gaat.
    expect(groeps).toHaveLength(24);
    expect(groeps).toContain('groups');
    expect(groeps).toContain('weekly_goals');
    expect(groeps).not.toContain('points_ledger');
  });

  it('merkt completion_approvals en approval_withdrawals als groepszichtbaar', () => {
    // ⚠️⚠️ 📏 Stonden op `false` tot de security-ronde. Hun policy noemt geen
    //    groep maar de persoon — `approver_id = auth.uid() or subject_id =
    //    auth.uid()` — en `CHECK (approver_id <> subject_id)` garandeert dat de
    //    lezer nooit het onderwerp is. De beoordelaar is per INSERT-policy een
    //    groepslid, dus een groepsgenoot leest hier aantoonbaar mee.
    expect(CENSUS.completion_approvals?.groepszichtbaar).toBe(true);
    expect(CENSUS.approval_withdrawals?.groepszichtbaar).toBe(true);
  });

  it('houdt de eigenaar-only views op false', () => {
    // `mijn_profiel` en `mijn_doelvelden` filteren op `auth.uid()`.
    expect(CENSUS.mijn_profiel?.groepszichtbaar).toBe(false);
    expect(CENSUS.mijn_doelvelden?.groepszichtbaar).toBe(false);
  });

  it('heeft voor elke tabel een niet-lege kolomlijst', () => {
    for (const [naam, t] of Object.entries(CENSUS)) {
      expect(t.kolommen.length, `${naam} heeft een lege kolomlijst`).toBeGreaterThan(0);
    }
  });
});
