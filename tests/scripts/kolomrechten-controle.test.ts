import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `levend-controle.test.ts`.
import {
  beoordeel,
  kolomNaam,
  ontleedRechten,
  selectiesIn,
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
