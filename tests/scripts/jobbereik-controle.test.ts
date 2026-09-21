/**
 * De belofte: **`jobbereik:controle` vindt een aanroep van een globale job
 * zonder zijn grens, en laat een aanroep mét grens — en elke vermelding van de
 * naam — met rust** — QS8-577.
 *
 * ⚠️⚠️ **Die tweede helft is hier niet theoretisch.** 📏 De eerste versie van de
 *    controle meldde `tests/beloftes/recap-mislukking-verlaat-de-job.test.ts`
 *    twee keer, op de zin *"geen enkele migratie definieert
 *    maak_seizoensrecaps(). Hernoemd of verplaatst?"* — een assertie-boodschap
 *    met haakjes erachter, omdat je zo over een functie schrijft. Twee rijen op
 *    acht echte, en precies de soort rij waarvan een lezer leert de controle te
 *    negeren. `tekstposities()` is daarvoor gebouwd en wordt hieronder apart
 *    gevoed.
 *
 * 📏 De ijking staat in
 *    `docs/decisions/2026-09-21-de-job-die-over-de-buren-liep.md`, onder *De
 *    ijking* — dertien mutaties, elk met de stand ervóór ernaast.
 */
import { describe, expect, it } from 'vitest';

import {
  argumenten,
  haakjesInhoud,
  klachten,
  ontleed,
  tekstposities,
  verweesd,
  voorkomens,
} from '../../scripts/jobbereik-controle.mjs';

/** De drie jobs zoals `VRAAG` ze op 21-09-2026 teruggaf. */
const JOBS = [
  { naam: 'maak_seizoensrecaps', grens: 'p_group_ids', positie: 2 },
  { naam: 'slaap_stille_groepen', grens: 'p_group_ids', positie: 2 },
  { naam: 'keur_vastgelopen_goedkeuringen_goed', grens: 'p_owner_ids', positie: 2 },
];

const RECAPS = JOBS[0];

// ---------------------------------------------------------------------------

describe('hij leest de catalogus zoals psql hem teruggeeft', () => {
  it('ontleedt naam, grensparameter en positie', () => {
    const uit = ontleed('maak_seizoensrecaps|p_group_ids|2\nweekpas_standen|p_goal_ids|1\n');

    expect(uit).toEqual([
      { naam: 'maak_seizoensrecaps', grens: 'p_group_ids', positie: 2 },
      { naam: 'weekpas_standen', grens: 'p_goal_ids', positie: 1 },
    ]);
  });

  it('laat lege regels vallen in plaats van een rij zonder naam te maken', () => {
    expect(ontleed('\n\nslaap_stille_groepen|p_group_ids|2\n\n')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

describe('hij knipt de haakjes af waar de aanroep ophoudt', () => {
  it('telt een haakje in een SQL-tekenreeks niet mee', () => {
    const bron = "f('een ) haakje', 2)";

    expect(haakjesInhoud(bron, 1)).toBe("'een ) haakje', 2");
  });

  it('loopt door een geneste array heen', () => {
    const bron = "f('${DAG}'::timestamptz, array[(select a from t), (select b from t)])";

    expect(argumenten(haakjesInhoud(bron, 1) ?? '')).toHaveLength(2);
  });

  it('geeft null als er geen haakje opent', () => {
    expect(haakjesInhoud('f 1, 2', 1)).toBeNull();
  });

  it('telt nul argumenten bij lege haakjes', () => {
    expect(argumenten('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('hij houdt een tekenreeks en een sjabloon uit elkaar', () => {
  it('merkt een naam binnen enkele aanhalingstekens als tekst', () => {
    const bron = "const m = 'maak_seizoensrecaps()';";
    const posities = tekstposities(bron);

    expect(posities[bron.indexOf('maak_seizoensrecaps')]).toBe(1);
  });

  it('merkt een naam binnen een backtick-sjabloon níet als tekst', () => {
    const bron = 'psql(`select maak_seizoensrecaps(now())`);';
    const posities = tekstposities(bron);

    expect(posities[bron.indexOf('maak_seizoensrecaps')]).toBe(0);
  });

  /**
   * ⚠️ **De vorm die een naïeve knip omdraait.** In SQL binnen een sjabloon
   *    staan enkele aanhalingstekens; wie die als JS-tekenreeks leest, verklaart
   *    de halve aanroep tot tekst en mist alles erna.
   */
  it("laat een ' binnen een sjabloon geen tekenreeks openen", () => {
    const bron = "psql(`select maak_seizoensrecaps('2026-11-15'::timestamptz)`);";
    const posities = tekstposities(bron);

    expect(posities[bron.indexOf('maak_seizoensrecaps')]).toBe(0);
  });

  /**
   * ⚠️⚠️ **De vorm die 22 van de 366 testbestanden blind maakte.** Een
   *    regex-literal als `/'/g` draagt een ongepaard aanhalingsteken; zonder
   *    de regelgrens loopt de machine vanaf dáár de rest van het bestand uit
   *    de pas, en alles erna telt als tekst. Tien van die 22 stonden in
   *    `tests/rls/`.
   */
  it('herstelt zich op de volgende regel na een ongepaard aanhalingsteken', () => {
    const bron = [
      'const q = JSON.stringify(x).replace(/\'/g, "\'\'");',
      "await adminDb().rpc('maak_seizoensrecaps', { p_op: nu });",
    ].join('\n');

    expect(voorkomens(bron, RECAPS)).toEqual([
      { vorm: 'rpc', tekst: ".rpc('maak_seizoensrecaps', { p_op: nu })", grens: false },
    ]);
  });
});

// ---------------------------------------------------------------------------

describe('wat hij als aanroep telt en wat niet', () => {
  it('meldt een .rpc-aanroep zonder grens', () => {
    const bron = "await adminDb().rpc('maak_seizoensrecaps', { p_op: nu });";

    expect(voorkomens(bron, RECAPS)).toEqual([
      { vorm: 'rpc', tekst: ".rpc('maak_seizoensrecaps', { p_op: nu })", grens: false },
    ]);
  });

  it('laat een .rpc-aanroep mét grens met rust', () => {
    const bron = "await adminDb().rpc('maak_seizoensrecaps', { p_op: nu, p_group_ids: [g.id] });";

    expect(voorkomens(bron, RECAPS)[0]?.grens).toBe(true);
  });

  it('telt een SQL-aanroep met twee argumenten als begrensd', () => {
    const bron = 'psql(`select maak_seizoensrecaps(${op}::timestamptz, array[${id}])`);';

    expect(voorkomens(bron, RECAPS)[0]).toMatchObject({ vorm: 'sql', grens: true });
  });

  it('meldt een SQL-aanroep met alleen het moment', () => {
    const bron = 'psql(`select maak_seizoensrecaps(now())`);';

    expect(voorkomens(bron, RECAPS)[0]).toMatchObject({ vorm: 'sql', grens: false });
  });

  it('herkent de benoemde notatie', () => {
    const bron = 'psql(`select maak_seizoensrecaps(p_group_ids => array[${id}])`);';

    expect(voorkomens(bron, RECAPS)[0]?.grens).toBe(true);
  });

  /**
   * ⚠️ De drie vormen die geen aanroep zijn. Ze stonden alle drie echt in de
   *    testboom toen deze controle gebouwd werd.
   */
  it('laat een naam in een assertie-boodschap met rust', () => {
    const bron = "expect(x, 'geen migratie definieert maak_seizoensrecaps(). Hernoemd?').toBe(1);";

    expect(voorkomens(bron, RECAPS)).toEqual([
      { vorm: 'vermelding', tekst: 'maak_seizoensrecaps', grens: true },
    ]);
  });

  it('laat een naam in een catalogusvraag met rust', () => {
    const bron = "psql(`select 1 from pg_proc where proname = 'maak_seizoensrecaps'`);";

    expect(voorkomens(bron, RECAPS)[0]?.vorm).toBe('vermelding');
  });

  it('laat een naam in commentaar met rust', () => {
    const bron = [
      '// `maak_seizoensrecaps()` loopt over elke groep.',
      '/* maak_seizoensrecaps(now()) */',
      "await adminDb().rpc('maak_seizoensrecaps', { p_op: nu, p_group_ids: [g.id] });",
    ].join('\n');

    expect(voorkomens(bron, RECAPS)).toHaveLength(1);
  });

  /**
   * ⚠️⚠️ **De vorm die dit bestand zelf is.** Een `.rpc('…')` die als voorbeeld
   *    in een tekenreeks staat, is geen aanroep — en de naam staat bij die vorm
   *    per definitie tússen aanhalingstekens, dus de toets moet op het haakje
   *    van `.rpc(` staan en niet op de naam. 📏 Zonder die regel meldde de
   *    controle dit toetsbestand twaalf keer.
   */
  it('laat een .rpc-aanroep die zelf in een tekenreeks staat met rust', () => {
    const bron = 'const voorbeeld = "await admin.rpc(\'maak_seizoensrecaps\', { p_op: nu });";';

    expect(voorkomens(bron, RECAPS)).toEqual([
      { vorm: 'vermelding', tekst: 'maak_seizoensrecaps', grens: true },
    ]);
  });

  /**
   * ⚠️ De opmaak die prettier maakt zodra de regel te lang wordt. 📏 Hij staat
   *    drie keer in deze testboom en één keer in `rollover/index.ts`; met een
   *    venster van twaalf tekens achter de naam viel hij vanaf zes spaties
   *    inspringing buiten beeld.
   */
  it.each([0, 2, 4, 6, 8])('vindt een meerregelige .rpc bij %i spaties inspringing', (n) => {
    const wit = ' '.repeat(n);
    const bron = `await adminDb().rpc(\n${wit}'maak_seizoensrecaps',\n${wit}{ p_op: nu },\n);`;

    expect(voorkomens(bron, RECAPS)[0]).toMatchObject({ vorm: 'rpc', grens: false });
  });

  /**
   * ⚠️ `p_group_ids: null` is de omweg om de grens heen: alle drie de lichamen
   *    doen `p_x is null or …`, dus dat is bit voor bit gelijk aan hem weglaten.
   *    Een lege `[]` mag wél door — die raakt niets.
   */
  it('telt een expliciete null niet als grens', () => {
    const bron = "await admin.rpc('maak_seizoensrecaps', { p_op: nu, p_group_ids: null });";

    expect(voorkomens(bron, RECAPS)[0]?.grens).toBe(false);
  });

  it('laat een lege array wél door', () => {
    const bron = "await admin.rpc('maak_seizoensrecaps', { p_op: nu, p_group_ids: [] });";

    expect(voorkomens(bron, RECAPS)[0]?.grens).toBe(true);
  });

  it('telt een positionele null in SQL niet als grens', () => {
    const bron = 'psql(`select maak_seizoensrecaps(now(), null)`);';

    expect(voorkomens(bron, RECAPS)[0]?.grens).toBe(false);
  });

  /**
   * ⚠️⚠️ **De vorm die door twee grendels met een `||` ertussen heen glipte.**
   *    De benoemde tak zag terecht een `null`; de positionele tak zag "twee
   *    argumenten, dus begrensd" en overstemde hem. Sinds de waardevraag één
   *    vraag is, kan dat niet meer.
   */
  it.each(['null', 'NULL'])('telt een benoemde %s in SQL niet als grens', (leeg) => {
    const bron = `psql(\`select maak_seizoensrecaps(p_op => now(), p_group_ids => ${leeg})\`);`;

    expect(voorkomens(bron, RECAPS)[0]?.grens).toBe(false);
  });

  it('laat een benoemde grens mét waarde wél door', () => {
    const bron = 'psql(`select maak_seizoensrecaps(p_op => now(), p_group_ids => array[${id}])`);';

    expect(voorkomens(bron, RECAPS)[0]?.grens).toBe(true);
  });

  /**
   * ⚠️ `undefined` doet hetzelfde als `null`: supabase-js stuurt zijn argumenten
   *    door `JSON.stringify()`, die laat de sleutel vallen, en PostgREST valt
   *    terug op `DEFAULT NULL`. `ids ?? undefined` is de vorm die je schrijft
   *    zodra de grens uit een optionele bron komt.
   */
  it.each(['undefined', 'ids ?? undefined'])('telt %s niet als grens', (waarde) => {
    const bron = `await admin.rpc('maak_seizoensrecaps', { p_op: nu, p_group_ids: ${waarde} });`;

    expect(voorkomens(bron, RECAPS)[0]?.grens).toBe(false);
  });

  it('kijkt niet naar een job met een andere naam', () => {
    const bron = "await adminDb().rpc('slaap_stille_groepen', { p_dagen: 30 });";

    expect(voorkomens(bron, RECAPS)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('het oordeel over een bestand', () => {
  it('meldt elke ongescopeerde aanroep met zijn pad ervoor', () => {
    const bron = [
      "await admin.rpc('slaap_stille_groepen', { p_dagen: 30 });",
      "await admin.rpc('keur_vastgelopen_goedkeuringen_goed', { p_termijn_dagen: 7 });",
    ].join('\n');

    expect(klachten(bron, 'tests/rls/x.test.ts', JOBS, {})).toEqual([
      "tests/rls/x.test.ts: .rpc('slaap_stille_groepen', { p_dagen: 30 })",
      "tests/rls/x.test.ts: .rpc('keur_vastgelopen_goedkeuringen_goed', { p_termijn_dagen: 7 })",
    ]);
  });

  it('zwijgt over een aanroep die met zijn reden in het register staat', () => {
    const bron = "await admin.rpc('slaap_stille_groepen', { p_dagen: 30 });";
    const register = {
      "tests/rls/x.test.ts: .rpc('slaap_stille_groepen', { p_dagen: 30 })": 'toetst de ouderdomsgrens',
    };

    expect(klachten(bron, 'tests/rls/x.test.ts', JOBS, register)).toEqual([]);
  });

  /**
   * ⚠️ De ratel de andere kant op. Een reden voor iets dat er niet meer staat,
   *    dekt ooit stilletjes een nieuwe aanroep af — zelfde vorm als
   *    `volatiliteit-controle.mjs`.
   */
  it('meldt een registerrij die nergens meer op slaat', () => {
    const register = { "tests/rls/weg.test.ts: .rpc('slaap_stille_groepen', {})": 'ooit' };

    expect(verweesd([], register)).toEqual([
      "tests/rls/weg.test.ts: .rpc('slaap_stille_groepen', {})",
    ]);
  });

  it('meldt niets als de registerrij nog ergens op slaat', () => {
    const sleutel = "tests/rls/x.test.ts: .rpc('slaap_stille_groepen', { p_dagen: 30 })";

    expect(verweesd([sleutel], { [sleutel]: 'toetst de ouderdomsgrens' })).toEqual([]);
  });
});
