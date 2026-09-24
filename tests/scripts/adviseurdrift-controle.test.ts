import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als de andere scriptijkingen.
import { ALLOWLIST } from '../../scripts/adviseur-controle.mjs';
import {
  beoordeelDrift,
  objectenUitDeMap,
  sleutelVoor,
  zonderSqlCommentaar,
} from '../../scripts/adviseurdrift-controle.mjs';

/**
 * De ijking van `npm run adviseurdrift:controle` — QS8-597.
 *
 * ⚠️⚠️ **Deze controle bestaat omdat de allowlist een week achterliep en er
 *    niets rood van kón worden.** `adviseur:controle` haalt de échte adviseur
 *    op, vraagt daarom een token, staat met reden in `ZONDER_CI` en is in een
 *    cloudsessie ongemeten. 📏 Gemeten in de audit van 24-09-2026:
 *    `public.mijn_doelvelden` (0236) en `public.dagtellers` (0233/0234) landden
 *    op 17-09 en stonden er een week later nog niet op.
 *
 * 📏 **De afleiding is tegen productie geijkt** (24-09-2026): beide klassen uit
 *    de migratiemap geven exact wat `pg_class` en de adviseur zeggen — drie
 *    definer-views, drie tabellen met RLS zonder policy, en `goal_dashboard`
 *    als enige invoker-view die juist **niet** gemeld mag worden.
 */
describe('zonderSqlCommentaar — de eigen knip', () => {
  // ⚠️ Must-find. Dit is het gemeten geval: het rollback-pad in de kop van 0234.
  it('haalt een regelcommentaar met een statement erin weg', () => {
    const sql = '-- alter table dagtellers rename to opslag_dagtellers;\nselect 1;';

    expect(zonderSqlCommentaar(sql)).not.toContain('rename to');
    expect(zonderSqlCommentaar(sql)).toContain('select 1;');
  });

  it('haalt een blokcommentaar weg', () => {
    expect(zonderSqlCommentaar('/* create view x */ select 1;')).not.toContain('create view');
  });

  it('haalt een staartcommentaar weg en laat de regel ervóór staan', () => {
    expect(zonderSqlCommentaar('select 1; -- uitleg\nselect 2;')).toBe('select 1; \nselect 2;');
  });

  // ⚠️⚠️ **De scherpste van dit blok.** Een `--` binnen een stringliteral is
  //    tekst en geen commentaar. Zonder die grens knipt de knip een deel van een
  //    `insert` weg en verschuift het beeld van de map stil — dezelfde richting
  //    als de URL-vorm die QS8-412 een halve ijking kostte.
  it('laat een streepjespaar binnen een stringliteral met rust', () => {
    const sql = "insert into t values ('a--b'); select 1;";

    expect(zonderSqlCommentaar(sql)).toBe(sql);
  });

  it('knipt commentaar binnen een dollar-quoted lichaam juist wél', () => {
    // ⚠️ Must-allow van de andere soort: dáár is `--` echt commentaar.
    const sql = '$$ begin -- uitleg\n  return 1;\nend $$';

    expect(zonderSqlCommentaar(sql)).not.toContain('uitleg');
    expect(zonderSqlCommentaar(sql)).toContain('return 1;');
  });
});

describe('objectenUitDeMap — de afleiding tegen de echte map', () => {
  // ⚠️ De kanarie, en die staat er om de les die deze week twee keer betaald is:
  //    een lege uitkomst is ook wat je krijgt als de lezer nooit iets vond.
  it('leest alle migraties en vindt in beide klassen iets', () => {
    const o = objectenUitDeMap();

    expect(o.bestanden).toBeGreaterThan(250);
    expect(o.definerViews.length).toBeGreaterThan(0);
    expect(o.rlsZonderPolicy.length).toBeGreaterThan(0);
  });

  // ⚠️⚠️ **Dit is de ijking tegen productie, met de hand gemeten op 24-09-2026
  //    via `pg_class` en de adviseur.** Hij pint de eigenschap vast en niet het
  //    getal van vandaag: wijkt de map ooit af van wat productie meldt, dan is
  //    dat hier zichtbaar.
  it('geeft exact de drie definer-views die productie ook meldt', () => {
    expect(objectenUitDeMap().definerViews).toEqual([
      'group_visible_streaks',
      'mijn_doelvelden',
      'mijn_profiel',
    ]);
  });

  it('geeft exact de drie tabellen met RLS zonder policy die productie meldt', () => {
    expect(objectenUitDeMap().rlsZonderPolicy).toEqual([
      'dagtellers',
      'invite_events',
      'invite_preview_limits',
    ]);
  });

  // ⚠️ Must-allow, en de reden dat de regel "definer tenzij invoker" heet.
  //    `goal_dashboard` zet `security_invoker = true` en hoort er dus níet in.
  it('laat de invoker-view met rust', () => {
    expect(objectenUitDeMap().definerViews).not.toContain('goal_dashboard');
  });

  // ⚠️⚠️ **De hernoeming, en die is gemeten.** 0233 maakt `opslag_dagtellers`,
  //    0234 hernoemt hem naar `dagtellers`. Zonder dat volgen staat de oude naam
  //    in de uitslag en klopt de vergelijking met productie niet meer.
  it('volgt een hernoeming en houdt de oude naam niet vast', () => {
    const o = objectenUitDeMap();

    expect(o.rlsZonderPolicy).not.toContain('opslag_dagtellers');
  });
});

describe('objectenUitDeMap — op een eigen map', () => {
  it('leest statements op tekstvolgorde, dus een drop bóven een create wist niet', () => {
    // 📏 Precies de vorm van 0236, en de fout die de eerste versie maakte: die
    //    paste elke regex over het hele bestand toe en verwerkte ze per soort,
    //    waardoor de drop ná de create landde en de view verdween.
    const sql =
      'drop view if exists public.mijn_doelvelden;\n' +
      'create view public.mijn_doelvelden with (security_invoker = false) as select 1;\n';

    expect(uitBron(sql).definerViews).toEqual(['mijn_doelvelden']);
  });

  // ⚠️⚠️ **Deze toets is er dóór de ijking gekomen, en dat staat hier omdat de
  //    eerste opzet het niet dekte.** De knip-toetsen hierboven voeden
  //    `zonderSqlCommentaar()` los; met de knip uit de **pijplijn** gesloopt
  //    bleven ze alle vijf groen, en de echte map ook — 0234 draagt zijn
  //    rename-comment toevallig in de onschadelijke richting. Wat de knip
  //    draagt is dít: een kop die een statement noemt dat er niet staat.
  it('leest een statement in een commentaarkop niet als een statement', () => {
    const sql =
      '-- Rollback:\n' +
      '--   create view public.spook with (security_invoker = false) as select 1;\n' +
      '--   alter table public.echt rename to public.spooktabel;\n' +
      'alter table public.echt enable row level security;\n';
    const uitslag = uitBron(sql);

    expect(uitslag.definerViews).toEqual([]);
    expect(uitslag.rlsZonderPolicy).toEqual(['echt']);
  });

  it('telt een view zónder with-clausule als definer — dat is de default van Postgres', () => {
    // ⚠️ Deze richting is de hele reden dat de regel "tenzij invoker" luidt.
    //    Een regel die naar het wóórd `false` zoekt, faalt hier open.
    expect(uitBron('create view public.kaal as select 1;').definerViews).toEqual(['kaal']);
  });

  it('laat een view met security_invoker = true met rust', () => {
    const sql = 'create view public.veilig with (security_invoker = true) as select 1;';

    expect(uitBron(sql).definerViews).toEqual([]);
  });

  it('meldt een tabel met RLS pas als er geen enkele policy op staat', () => {
    const metPolicy =
      'alter table public.t enable row level security;\n' +
      'create policy t_select on t for select to authenticated using (true);\n';

    expect(uitBron(metPolicy).rlsZonderPolicy).toEqual([]);
    expect(uitBron('alter table public.t enable row level security;').rlsZonderPolicy).toEqual([
      't',
    ]);
  });

  it('leest een policynaam tussen aanhalingstekens', () => {
    const sql =
      'alter table public.t enable row level security;\n' +
      'create policy "t select" on public.t for select to authenticated using (true);\n';

    expect(uitBron(sql).rlsZonderPolicy).toEqual([]);
  });
});

describe('beoordeelDrift — tweezijdig', () => {
  const LIJST = [{ sleutel: 'security_definer_view_public_bekend', reden: 'bekend' }];

  it('meldt een object dat niet op de allowlist staat', () => {
    const uitslag = beoordeelDrift(
      { definerViews: ['bekend', 'nieuw'], rlsZonderPolicy: [] },
      LIJST,
    );

    expect(uitslag.ontbreekt).toEqual(['security_definer_view_public_nieuw']);
    expect(uitslag.overbodig).toEqual([]);
  });

  // ⚠️ De andere kant van de ratel: een uitzondering die nergens meer naar wijst,
  //    houdt een oordeel in leven dat niemand meer kan nalezen.
  it('meldt een allowlist-regel die nergens meer naar wijst', () => {
    const uitslag = beoordeelDrift({ definerViews: [], rlsZonderPolicy: [] }, LIJST);

    expect(uitslag.overbodig).toEqual(['security_definer_view_public_bekend']);
  });

  // ⚠️ Must-allow. Regels van een ándere adviesregel gaan deze controle niet aan
  //    en mogen hier nooit als "overbodig" gelden — die beoordeelt
  //    `adviseur-controle.mjs` zelf.
  it('laat allowlist-regels van andere adviesregels met rust', () => {
    const anders = [
      { sleutel: 'auth_leaked_password_protection', reden: 'dashboard' },
      { regel: 'authenticated_security_definer_function_executable', hoogstens: 76, reden: 'x' },
    ];
    const uitslag = beoordeelDrift({ definerViews: [], rlsZonderPolicy: [] }, anders);

    expect(uitslag).toEqual({ ontbreekt: [], overbodig: [] });
  });

  it('is groen op de echte map naast de echte allowlist', () => {
    // ⚠️ De eigenlijke bewering van deze controle, tegen wat er nu op schijf staat.
    expect(beoordeelDrift(objectenUitDeMap(), ALLOWLIST)).toEqual({
      ontbreekt: [],
      overbodig: [],
    });
  });

  it('bouwt de sleutel zoals de adviseur hem noemt', () => {
    expect(sleutelVoor('security_definer_view', 'mijn_profiel')).toBe(
      'security_definer_view_public_mijn_profiel',
    );
  });
});

/** Schrijft één migratie naar een eigen map en leest hem terug. */
function uitBron(sql: string): { definerViews: string[]; rlsZonderPolicy: string[] } {
  const map = mkdtempSync(join(tmpdir(), 'adviseurdrift-'));
  writeFileSync(join(map, '0001_proef.sql'), sql);
  return objectenUitDeMap(map);
}
