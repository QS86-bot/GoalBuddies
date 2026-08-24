import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings. TypeScript leest de JSDoc ernaast en leidt
//    de vorm daaruit af — vandaar dat hier geen `@ts-expect-error` staat, en dat
//    is met opzet: die zou pas opvallen als hij ooit onnodig wordt.
import { vergelijk } from '../../scripts/migratieregister-vergelijk.mjs';

/**
 * QS8-122 — de controle die repo en project naast elkaar legt.
 *
 * ⚠️ **Deze tests bestaan omdat de controle zelf alleen tegen het échte project
 *    draait.** Zonder credentials slaat hij zichzelf netjes over, en een
 *    controle die je nooit rood ziet worden is een aanname en geen controle
 *    (CLAUDE.md, bij de secret-scan van de deploy). Hier wordt élk faalgeval met
 *    de hand gebroken.
 */

interface Migratie {
  versie: string;
  naam: string;
  bestand?: string;
}

const GOED: Migratie[] = [
  { versie: '0001', naam: 'schema', bestand: '0001_schema.sql' },
  { versie: '0052a', naam: 'triggerfuncties_bewaking', bestand: '0052a_triggerfuncties_bewaking.sql' },
  { versie: '0072', naam: 'migratieregister_uitleesbaar', bestand: '0072_migratieregister_uitleesbaar.sql' },
];

const REGISTER: Migratie[] = GOED.map(({ versie, naam }) => ({ versie, naam }));

describe('migratieregister vergelijken', () => {
  it('zwijgt als repo en project hetzelfde zeggen', () => {
    expect(vergelijk(GOED, REGISTER)).toEqual([]);
  });

  /**
   * ⚠️ Het gevaarlijkste geval, en het is twee keer bij toeval gevonden vóór
   *    QS8-122: `0036`/`0037` en later `0057` t/m `0061` stonden wél op het
   *    project en niet in de repo. Wie daar een lege database uit opbouwt, krijgt
   *    een ánder schema dan productie — en toetst daar dus een verzinsel.
   */
  it('klaagt over een migratie die op het project staat en niet in de repo', () => {
    const klachten = vergelijk(GOED, [...REGISTER, { versie: '0073', naam: 'spookmigratie' }]);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('0073');
    expect(klachten[0]).toContain('geen bestand in de repo');
  });

  it('klaagt over een bestand dat nooit is toegepast', () => {
    const klachten = vergelijk(
      [...GOED, { versie: '0073', naam: 'nooit_gedraaid', bestand: '0073_nooit_gedraaid.sql' }],
      REGISTER,
    );

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('0073_nooit_gedraaid.sql');
    expect(klachten[0]).toContain('niet toegepast');
  });

  /**
   * ⚠️ Twee migraties met hetzelfde nummer en een andere inhoud is de stille
   *    variant: er ontbreekt niets, en toch bouwt de map iets anders op.
   */
  it('klaagt als hetzelfde nummer een andere naam draagt', () => {
    const anders = REGISTER.map((m) => (m.versie === '0052a' ? { ...m, naam: 'iets_anders' } : m));
    const klachten = vergelijk(GOED, anders);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('0052a');
    expect(klachten[0]).toContain('iets_anders');
  });

  /**
   * ⚠️ De kern van QS8-122. De MCP-tool kiest zelf een tijdstempel als versie,
   *    ongeacht hoe het bestand heet — dus zodra iemand die tool gebruikt zonder
   *    de versie uit te lijnen, komt de drift terug. Deze regel is het slot op
   *    de werkwijze in docs/DEPLOY.md.
   */
  it('klaagt over een tijdstempel in plaats van een nummer', () => {
    const klachten = vergelijk(GOED, [
      ...REGISTER,
      { versie: '20260824120000', naam: 'via_de_tool' },
    ]);

    // Twee klachten: geen bestand in de repo, én een tijdstempel.
    expect(klachten).toHaveLength(2);
    expect(klachten.some((k: string) => k.includes('tijdstempel en geen nummer'))).toBe(true);
  });

  /**
   * ⚠️ De lettersuffix is een bestaande vorm in deze map (`0039a`, `0041a`,
   *    `0052a`) en moet geldig blijven. Zou de controle die als tijdstempel
   *    lezen, dan staat hij vanaf dag één rood en leert hij je hem te negeren.
   */
  it('accepteert een nummer met een lettersuffix', () => {
    expect(vergelijk(GOED, REGISTER)).toEqual([]);
  });
});
