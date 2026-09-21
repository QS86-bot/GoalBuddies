import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { migratiesInMap } from '../../scripts/migratieregister-vergelijk.mjs';
import { niveauKlachten, niveauMelding, zonderNummer } from '../rls/migratieniveau';

/**
 * QS8-426 — de grendel die de RLS-suite laat weigeren tegen een oud schema.
 *
 * ⚠️ **Waarom deze test buiten `tests/rls/` staat.** De functies hieronder zijn
 *    puur: ze krijgen een register aangeboden en geven klachten terug. Zouden ze
 *    in de rls-groep staan, dan hadden ze een database nodig om getoetst te
 *    worden — en dan is de grendel die een database bewaakt alleen te ijken mét
 *    die database. Dat is precies de vorm die CLAUDE.md afraadt: *een controle
 *    die je niet kunt voeden, kun je niet ijken.*
 *
 * ⚠️ De tweede helft telt even zwaar als de eerste: elke vorm die hij met rust
 *    moet laten staat hier ook.
 */

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));
const MAP = migratiesInMap(WORTEL) as { versie: string; naam: string }[];

/** Het register zoals een correct opgebouwde database het zou teruggeven. */
const GELIJK = MAP.map((m) => ({ versie: m.versie, naam: m.naam }));

describe('zonderNummer', () => {
  // ⚠️ Dit is de vorm die de controle 255 keer rood had gemaakt: de lokale stack
  //    schrijft de héle stam in `name`, productie schrijft hem zonder nummer.
  it.each([
    ['0252_de_goedkeuring_wijst_naar_de_eigenaar', 'de_goedkeuring_wijst_naar_de_eigenaar'],
    ['0039a_weekpas_maximum_niet_voor_anon', 'weekpas_maximum_niet_voor_anon'],
  ])('%s → %s', (in_, uit) => {
    expect(zonderNummer(in_)).toBe(uit);
  });

  it.each([
    ['de_goedkeuring_wijst_naar_de_eigenaar'],
    ['geen_nummer_hier'],
    [''],
    ['123_te_kort'],
    ['02520_te_lang'],
  ])('laat %s met rust', (naam) => {
    expect(zonderNummer(naam)).toBe(naam);
  });
});

describe('niveauKlachten', () => {
  it('een register dat gelijkloopt met de map geeft niets', () => {
    expect(niveauKlachten(GELIJK)).toEqual([]);
  });

  // ⚠️ Onbereikbaar is niet hetzelfde als achterlopend, en heeft een eigen
  //    melding in `stackBeschikbaarOfFaal()`. Hier moet het stil blijven.
  // ⚠️ De naad: een register zoals de **lokale stack** hem teruggeeft, met het
  //    nummer nog vóór de naam. Zonder normalisatie zou dit 255 klachten geven.
  it('een register met de hele stam in de naam loopt gewoon gelijk', () => {
    const ruw = MAP.map((m) => ({ versie: m.versie, naam: `${m.versie}_${m.naam}` }));
    expect(niveauKlachten(ruw)).toEqual([]);
  });

  it('een onbereikbare database geeft niets', () => {
    expect(niveauKlachten(null)).toEqual([]);
  });

  it('een register dat achterloopt meldt elke ontbrekende migratie', () => {
    const achter = GELIJK.slice(0, -3);
    const klachten = niveauKlachten(achter);
    expect(klachten).toHaveLength(3);
    expect(klachten.join('\n')).toContain('niet toegepast');
  });

  // ⚠️ Dít is het geval dat een schema elders onherbouwbaar maakt — zie de kop
  //    van `migratieregister-vergelijk.mjs`.
  it('een migratie zonder bestand in de map meldt dat apart', () => {
    const teveel = [...GELIJK, { versie: '9999', naam: 'nooit_geschreven' }];
    expect(niveauKlachten(teveel).join('\n')).toContain('geen bestand in de repo');
  });

  it('een tijdstempel in plaats van een nummer wordt gemeld', () => {
    const stempel = [...GELIJK, { versie: '20260911120000', naam: 'buiten_de_werkwijze' }];
    expect(niveauKlachten(stempel).join('\n')).toContain('tijdstempel');
  });

  it('dezelfde versie met een andere naam wordt gemeld', () => {
    const anders = GELIJK.map((m, i) => (i === 0 ? { ...m, naam: 'iets_anders' } : m));
    expect(niveauKlachten(anders).join('\n')).toContain('heet hier');
  });
});

describe('niveauMelding', () => {
  it('zwijgt als er niets aan de hand is', () => {
    expect(niveauMelding(GELIJK)).toBeNull();
    expect(niveauMelding(null)).toBeNull();
  });

  // ⚠️ De melding moet béíde standen noemen en het commando dat het repareert.
  //    Een melding die alleen zegt dát er iets scheef staat, laat de lezer zelf
  //    uitzoeken wat — en dat is het moment waarop iemand de controle uitzet.
  it('noemt beide standen en het herstelcommando', () => {
    const melding = niveauMelding(GELIJK.slice(0, -3)) ?? '';
    expect(melding).toContain(`${MAP.length} migraties`);
    expect(melding).toContain(`${MAP.length - 3} migraties`);
    expect(melding).toContain(MAP.at(-1)?.versie ?? '(geen)');
    expect(melding).toContain('npm run rls:stack');
  });
});
