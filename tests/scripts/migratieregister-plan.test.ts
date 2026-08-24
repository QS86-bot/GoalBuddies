import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leest de JSDoc ernaast. Zelfde
//    vorm als `migratieregister.test.ts`, met opzet.
import { plan } from '../../scripts/migratieregister-plan.mjs';

/**
 * QS8-122 — welke registerrijen uitgelijnd worden, en welke niet.
 *
 * ⚠️ **Waarom deze tests bestaan.** Het uitlijnen praat met het échte project,
 *    dus zonder credentials draait het nooit — en CLAUDE.md is daar stellig
 *    over: een controle die je nooit rood ziet worden is een aanname. Élk geval
 *    hieronder wordt met de hand gebroken.
 *
 * ⚠️ **De gevaarlijkste tests zijn de twee die níéts doen.** Uitlijnen dat te
 *    gretig is, is erger dan uitlijnen dat te weinig doet: het herschrijft
 *    geschiedenis die klopte, en dan is de map niet meer de waarheid over het
 *    project. Zie "raakt een rij met een nummer nooit aan" en "verzint geen
 *    nummer voor een migratie zonder bestand".
 */

interface Migratie {
  versie: string;
  naam: string;
  bestand?: string;
}

// ⚠️ Los benoemd en niet via een index. `noUncheckedIndexedAccess` staat aan,
//    en `REPO[0]` is dan `Migratie | undefined` — een cast eromheen zou de
//    strictheid uitzetten op precies de plek waar de test zijn fixtures bouwt.
const SCHEMA: Migratie = { versie: '0001', naam: 'schema', bestand: '0001_schema.sql' };
const BEWAKING: Migratie = {
  versie: '0052a',
  naam: 'triggerfuncties_bewaking',
  bestand: '0052a_triggerfuncties_bewaking.sql',
};
const UITNODIGING: Migratie = {
  versie: '0080',
  naam: 'de_uitnodiging_noemt_de_zichtbaarheid',
  bestand: '0080_de_uitnodiging_noemt_de_zichtbaarheid.sql',
};

const REPO: Migratie[] = [SCHEMA, BEWAKING, UITNODIGING];

/** Het register zoals het eruitziet als alles goed is gegaan. */
const NETJES: Migratie[] = REPO.map(({ versie, naam }) => ({ versie, naam }));

/** Dezelfde rij, maar zoals het register hem draagt: zonder bestandsnaam. */
function alsRij({ versie, naam }: Migratie): Migratie {
  return { versie, naam };
}

describe('migratieregister uitlijnen — plannen', () => {
  it('doet niets als alles al een nummer draagt', () => {
    expect(plan(REPO, NETJES)).toEqual({ paren: [], waarschuwingen: [] });
  });

  /**
   * Het geval waarvoor dit gebouwd is: de MCP-tool stempelde een tijdstempel.
   * Zo stonden er op 24-08 zes in het register.
   */
  it('lijnt een tijdstempel uit naar het nummer van het bestand', () => {
    const register: Migratie[] = [
      alsRij(SCHEMA),
      alsRij(BEWAKING),
      { versie: '20260824184659', naam: 'de_uitnodiging_noemt_de_zichtbaarheid' },
    ];

    expect(plan(REPO, register)).toEqual({
      paren: [{ naam: 'de_uitnodiging_noemt_de_zichtbaarheid', versie: '0080' }],
      waarschuwingen: [],
    });
  });

  /**
   * ⚠️ Grendel 1, en de belangrijkste. Een rij die al een nummer draagt is
   *    geschiedenis die klopt. Zou het plan die meenemen, dan is één verkeerde
   *    bestandsnaam genoeg om het register te laten afwijken van wat er echt
   *    gedraaid heeft — en dat is niet terug te vinden.
   */
  it('raakt een rij met een nummer nooit aan, ook niet als het bestand anders heet', () => {
    const repoAnders: Migratie[] = [
      { versie: '0002', naam: 'schema', bestand: '0002_schema.sql' },
      BEWAKING,
      UITNODIGING,
    ];

    // `schema` staat in het register op 0001 en in de repo op 0002. Uitlijnen
    // zou hier 0001 naar 0002 schrijven; dat mag niet gebeuren.
    expect(plan(repoAnders, NETJES).paren).toEqual([]);
  });

  /**
   * ⚠️ Dit is 0057 t/m 0061, en 0036/0037 daarvoor. Er is iets toegepast waar
   *    geen bestand van bestaat. Een nummer verzinnen maakt het register netjes
   *    en het gat onzichtbaar — precies de verkeerde kant op.
   */
  it('verzint geen nummer voor een migratie zonder bestand', () => {
    const register: Migratie[] = [...NETJES, { versie: '20260824120000', naam: 'spookmigratie' }];
    const uitkomst = plan(REPO, register);

    expect(uitkomst.paren).toEqual([]);
    expect(uitkomst.waarschuwingen).toHaveLength(1);
    expect(uitkomst.waarschuwingen[0]).toContain('spookmigratie');
    expect(uitkomst.waarschuwingen[0]).toContain('geen bestand in de repo');
  });

  it('weigert te raden als twee bestanden dezelfde naam dragen', () => {
    const repoDubbel: Migratie[] = [
      ...REPO,
      { versie: '0081', naam: 'schema', bestand: '0081_schema.sql' },
    ];
    const register: Migratie[] = [
      alsRij(BEWAKING),
      alsRij(UITNODIGING),
      { versie: '20260824120000', naam: 'schema' },
    ];

    const uitkomst = plan(repoDubbel, register);

    expect(uitkomst.paren).toEqual([]);
    expect(uitkomst.waarschuwingen[0]).toContain('meer dan één bestand');
    expect(uitkomst.waarschuwingen[0]).toContain('0001, 0081');
  });

  /**
   * ⚠️ Twee rijen op hetzelfde nummer is de stille variant: er ontbreekt niets
   *    en toch bouwt de map iets anders op. Die hier zelf veroorzaken zou de
   *    controle uit 0072 omzeilen met zijn eigen gereedschap.
   */
  it('lijnt niet uit naar een nummer dat al bezet is', () => {
    const register: Migratie[] = [...NETJES, { versie: '20260824120000', naam: 'schema' }];
    const uitkomst = plan(REPO, register);

    expect(uitkomst.paren).toEqual([]);
    expect(uitkomst.waarschuwingen[0]).toContain('0001');
    expect(uitkomst.waarschuwingen[0]).toContain('al in gebruik');
  });

  /**
   * ⚠️ Twee tijdstempels die naar hetzelfde bestand wijzen. De tweede mag niet
   *    alsnog door de eerste heen schrijven — de bezetting groeit terwijl het
   *    plan wordt opgebouwd.
   */
  it('laat twee tijdstempels niet naar hetzelfde nummer wijzen', () => {
    const repoDubbel: Migratie[] = [SCHEMA];
    const register: Migratie[] = [
      { versie: '20260824120000', naam: 'schema' },
      { versie: '20260824130000', naam: 'schema' },
    ];

    const uitkomst = plan(repoDubbel, register);

    expect(uitkomst.paren).toEqual([{ naam: 'schema', versie: '0001' }]);
    expect(uitkomst.waarschuwingen).toHaveLength(1);
    expect(uitkomst.waarschuwingen[0]).toContain('al in gebruik');
  });

  /** De lettersuffix is een bestaande vorm (`0039a`, `0041a`, `0052a`). */
  it('ziet een nummer met een lettersuffix als een nummer', () => {
    expect(plan(REPO, NETJES).paren).toEqual([]);
  });
});
