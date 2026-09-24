import { describe, expect, it } from 'vitest';

import {
  beoordeel,
  edgeAanroepen,
  eindstand,
  lostOp,
  migratieFeiten,
  parameters,
} from '../../scripts/handtekening-controle.mjs';

/**
 * QS8-612 — beide helften: de vormen die hij moet vinden én de vormen die hij
 * met rust moet laten. De drie gevallen die vandaag in de repo staan zijn alle
 * drie terecht groen, en moeten dat blijven.
 */

/**
 * ⚠️ **De fixture heet met opzet `slaap_stille_kamers` en niet zoals de echte
 *    job.** `jobbereik:controle` leest de testboom op globale jobs die zonder
 *    grens draaien, en een SQL-fixture met de échte naam erin leest hij — terecht
 *    — als zo'n aanroep. Een registerrij daarvoor zou een uitzondering
 *    vastleggen die er geen is; een naam die niet bestaat, houdt beide controles
 *    scherp. De enige echte naam in dit bestand staat in de toets over de
 *    meerregelige aanroep, want dáár is de naam het onderwerp.
 */
const MIG_DROP_ZONDER_WRAPPER = {
  naam: '0194_grens.sql',
  sql: `
    drop function if exists public.slaap_stille_kamers(integer);
    create or replace function public.slaap_stille_kamers(
      p_dagen integer default 30,
      p_group_ids uuid[] default null
    ) returns integer as $$ begin return 0; end $$ language plpgsql;
  `,
};

const MIG_EERSTE_VORM = {
  naam: '0100_begin.sql',
  sql: `
    create or replace function public.slaap_stille_kamers(p_dagen integer default 30)
    returns integer as $$ begin return 0; end $$ language plpgsql;
  `,
};

const REGISTER = [{ functie: 'slaap_stille_kamers', reden: 'gemeten in de test' }];

const LEEG_REGISTER: { functie: string; reden: string }[] = [];

const EDGE_MET_PDAGEN = {
  naam: 'rollover/index.ts',
  bron: "await db.rpc('slaap_stille_kamers', { p_dagen: 30 });",
};

describe('parameters', () => {
  it('leest naam en default per argument', () => {
    expect(parameters('p_dagen integer default 30, p_group_ids uuid[] default null')).toEqual([
      { naam: 'p_dagen', heeftDefault: true },
      { naam: 'p_group_ids', heeftDefault: true },
    ]);
  });

  /**
   * ⚠️ Een naamloos argument kan een RPC-aanroep niet zetten. Telt hij als
   *    naamloos én zonder default, dan lost geen enkele aanroep erop op — en dat
   *    is precies goed.
   */
  it('telt een naamloos argument als naamloos', () => {
    expect(parameters('uuid, integer')).toEqual([
      { naam: null, heeftDefault: false },
      { naam: null, heeftDefault: false },
    ]);
  });

  it('splitst niet op een komma binnen haakjes', () => {
    expect(parameters('p_a numeric(10, 2), p_b uuid')).toHaveLength(2);
  });
});

describe('migratieFeiten', () => {
  it('vindt drop en create', () => {
    const { drops, creates } = migratieFeiten(MIG_DROP_ZONDER_WRAPPER.sql);
    expect(drops).toEqual([{ functie: 'slaap_stille_kamers', argumenten: 'integer' }]);
    expect(creates[0]?.parameters).toHaveLength(2);
  });

  /**
   * ⚠️⚠️ De koppen van de migraties in dit project dragen hun rollback-pad als
   *    commentaar, en daar staat de `drop` letterlijk in. Zonder knip telt die
   *    mee en meldt de controle een drop die nooit uitgevoerd wordt.
   */
  it('telt een drop in de rollback-kop van een migratie niet mee', () => {
    const { drops } = migratieFeiten(
      '-- Rollback:\n--   drop function if exists public.f(uuid);\nselect 1;',
    );
    expect(drops).toEqual([]);
  });
});

describe('edgeAanroepen', () => {
  it('leest een aanroep zonder argumenten', () => {
    expect(edgeAanroepen("await db.rpc('maak_seizoensrecaps');")).toEqual([
      { functie: 'maak_seizoensrecaps', parameters: [] },
    ]);
  });

  /**
   * ⚠️⚠️ **De vorm die de handmatige meting miste.** De echte aanroep van
   *    `keur_vastgelopen_goedkeuringen_goed` staat over drie regels met de naam
   *    op de tweede; een `grep` per regel ziet hem niet. Zelfde les als QS8-414.
   */
  it('leest een aanroep die over meerdere regels staat', () => {
    const bron = "await db.rpc(\n  'keur_vastgelopen_goedkeuringen_goed',\n  { p_termijn_dagen: 7 },\n);";
    expect(edgeAanroepen(bron)).toEqual([
      { functie: 'keur_vastgelopen_goedkeuringen_goed', parameters: ['p_termijn_dagen'] },
    ]);
  });

  /**
   * ⚠️⚠️ `rollover/index.ts` draagt `.rpc('naam')` als voorbeeld in een comment.
   *    Een lezer zonder knip vindt dus een RPC die niet bestaat en meldt hem als
   *    functie zonder handtekening — een bevinding uit het niets.
   */
  it('trapt niet in een aanroep die in commentaar staat', () => {
    expect(edgeAanroepen("// await db.rpc('naam');\nawait db.rpc('echt');")).toEqual([
      { functie: 'echt', parameters: [] },
    ]);
  });

  it('leest een geneste objectwaarde als één parameter', () => {
    expect(edgeAanroepen("db.rpc('f', { p_a: { x: 1, y: 2 }, p_b: 3 });")[0]?.parameters).toEqual([
      'p_a',
      'p_b',
    ]);
  });
});

describe('lostOp', () => {
  const nieuw = { parameters: parameters('p_dagen integer default 30, p_group_ids uuid[] default null') };

  it('past als de meegegeven naam bestaat en de rest een default heeft', () => {
    expect(lostOp({ parameters: ['p_dagen'] }, nieuw)).toBe(true);
  });

  it('past ook zonder argumenten als alles een default heeft', () => {
    expect(lostOp({ parameters: [] }, nieuw)).toBe(true);
  });

  it('past niet als een meegegeven naam niet bestaat', () => {
    expect(lostOp({ parameters: ['p_dit_bestaat_niet'] }, nieuw)).toBe(false);
  });

  it('past niet als een parameter zonder default niet meegegeven wordt', () => {
    const verplicht = { parameters: parameters('p_user_id uuid, p_goal_id uuid') };
    expect(lostOp({ parameters: ['p_user_id'] }, verplicht)).toBe(false);
  });
});

describe('eindstand', () => {
  it('haalt een gedropte vorm weg en zet de nieuwe ervoor in de plaats', () => {
    const { levend, gedropt } = eindstand([MIG_EERSTE_VORM, MIG_DROP_ZONDER_WRAPPER]);
    expect(levend.get('slaap_stille_kamers')).toHaveLength(1);
    expect(levend.get('slaap_stille_kamers')?.[0]?.parameters).toHaveLength(2);
    expect(gedropt.get('slaap_stille_kamers')).toHaveLength(1);
  });

  /**
   * De wrapper van `0186`: een migratie die de oude vorm terugzet, laat beide
   * handtekeningen bestaan — en dat is precies het recept dat dossierrij 601
   * voorschrijft.
   */
  it('laat een wrapper de oude vorm terugbrengen', () => {
    const wrapper = {
      naam: '0186_wrapper.sql',
      sql: `create or replace function public.slaap_stille_kamers(p_dagen integer)
            returns integer as $$ begin return 0; end $$ language plpgsql;`,
    };
    const { levend } = eindstand([MIG_EERSTE_VORM, MIG_DROP_ZONDER_WRAPPER, wrapper]);
    expect(levend.get('slaap_stille_kamers')).toHaveLength(2);
  });
});

describe('beoordeel', () => {
  it('zwijgt als de oude vorm door een wrapper terugkomt', () => {
    const wrapper = {
      naam: '0186_wrapper.sql',
      sql: `create or replace function public.slaap_stille_kamers(p_dagen integer)
            returns integer as $$ begin return 0; end $$ language plpgsql;`,
    };
    expect(
      beoordeel([MIG_EERSTE_VORM, MIG_DROP_ZONDER_WRAPPER, wrapper], [EDGE_MET_PDAGEN], LEEG_REGISTER),
    ).toEqual([]);
  });

  it('meldt een verdwenen vorm die niet in het register staat', () => {
    const klachten = beoordeel(
      [MIG_EERSTE_VORM, MIG_DROP_ZONDER_WRAPPER],
      [{ naam: 'rollover/index.ts', bron: "db.rpc('slaap_stille_kamers', { p_dagen: 30 });" }],
      REGISTER,
    );
    // `slaap_stille_kamers` staat wél in VERDWENEN_VORM, dus dit geval is stil.
    expect(klachten).toEqual([]);
  });

  /**
   * Het harde geval: geen enkele overgebleven handtekening past op de aanroep.
   * Dat is een `PGRST202` die op de uitrol wacht, en daar is geen register voor.
   */
  it('meldt een aanroep die op geen enkele overgebleven vorm past', () => {
    const klachten = beoordeel(
      [MIG_EERSTE_VORM, MIG_DROP_ZONDER_WRAPPER],
      [{ naam: 'rollover/index.ts', bron: "db.rpc('slaap_stille_kamers', { p_dagen_oud: 30 });" }],
      REGISTER,
    );

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('PGRST202');
  });

  it('meldt een drop zonder wrapper van een functie die niet in het register staat', () => {
    const mig = {
      naam: '0200_iets.sql',
      sql: `drop function if exists public.weekplan_kandidaten(uuid);
            create or replace function public.weekplan_kandidaten(p_a uuid, p_b date default null)
            returns integer as $$ begin return 0; end $$ language plpgsql;`,
    };
    const klachten = beoordeel(
      [mig],
      [{ naam: 'rollover/index.ts', bron: "db.rpc('weekplan_kandidaten', { p_a: x });" }],
      LEEG_REGISTER,
    );

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('VERDWENEN_VORM');
  });

  /**
   * ⚠️⚠️ De twee kanaries. Een lezer die niets vindt ziet er per bron anders
   *    uit: geen aanroepen is stil groen, geen handtekeningen is een storm.
   */
  it('noemt nul gevonden aanroepen een kapotte lezer', () => {
    const klachten = beoordeel([MIG_EERSTE_VORM], [{ naam: 'leeg.ts', bron: 'const x = 1;' }], LEEG_REGISTER);
    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('geen groen');
  });

  it('noemt nul gevonden handtekeningen een kapotte lezer en geen storm', () => {
    const klachten = beoordeel([{ naam: 'leeg.sql', sql: 'select 1;' }], [EDGE_MET_PDAGEN], LEEG_REGISTER);
    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('kapotte lezer');
  });

  /**
   * ⚠️ Een register dat rijen houdt die niets meer dekken, rot stil — dezelfde
   *    tweezijdigheid als `knip:controle` en `regel15:controle`.
   */
  it('meldt een registerrij die niets meer dekt', () => {
    const klachten = beoordeel([MIG_EERSTE_VORM], [EDGE_MET_PDAGEN], REGISTER);
    const verweesd = (klachten as string[]).filter((k) => k.includes('rot stil'));
    expect(verweesd).toHaveLength(1);
  });
});
