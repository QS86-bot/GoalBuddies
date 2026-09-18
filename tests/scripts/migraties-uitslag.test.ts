/**
 * Een branchbevinding is een afspraak en geen fout — QS8-552.
 *
 * ⚠️⚠️ **Waarom deze toets bestaat.** `migraties:controle` telde `fouten` en
 *    `branchfouten` bij het afsluiten bij elkaar op, dus een branch die een
 *    migratie draagt die deze map niet heeft, maakte de build rood. Dat werkte
 *    jarenlang niet omdát CI maar één branch zag — tot QS8-452 `fetch-depth: 0`
 *    op de checkout zette voor `dossierdrift:controle`. Die vlag haalt óók alle
 *    remote branches op.
 *
 *    📏 Gevolg op 18-09-2026: `main` stond rood omdat `origin/…qs8-533`
 *    migratie `0290` droeg terwijl `main` op `0289` stond — de normale toestand
 *    van werk dat nog niet geland is. Het zou bij élke migratiebranch opnieuw
 *    gebeuren, en een rood dat altijd aan staat betekent niets meer.
 *
 * ⚠️ **De weging staat in CLAUDE.md en is niet hier bedacht:** van de drie
 *    signalen die deze controle geeft is *"de branches die datzelfde nummer
 *    dragen"* met zoveel woorden **een afspraak, geen fout**, en is alleen
 *    `origin/main` die vóórloopt de echte fout.
 *
 * ⚠️ **De helft die het zwaarst weegt is dat rood rood blijft.** Een fix die
 *    alles op groen zet, haalt de eerste toets hieronder ook. Vandaar dat de
 *    vier fatale klassen hier elk hun eigen geval hebben.
 *
 * IJKING — end-to-end met de hand gedraaid op 18-09-2026, één geval per klasse,
 * telkens op de echte migratiemap en daarna opgeruimd:
 *
 *   P  een gat (0292 neergezet zonder 0291)          -> exitcode 1
 *   Q  een duplicaat (tweede bestand met 0289)       -> exitcode 1
 *   R  een migratie zonder ROLLBACK-PAD in zijn kop  -> exitcode 1
 *   T  een CLI-tegenspraak (`db:push` in package.json) -> exitcode 1
 *   S  alleen een branchbevinding (de echte stand)   -> exitcode **0**
 *
 * En op de functie zelf, één mutatie per grendel:
 *
 *   U  de `rood`-tak eruit (alles wordt een waarschuwing)
 *      -> 2 rood: 'een echte fout is rood' + 'een echte fout naast een
 *         branchbevinding blijft rood'
 *   V  de `waarschuwing`-tak terug op `rood`
 *      -> 1 rood: 'alleen een branchbevinding is een waarschuwing en geen rood'
 *
 * ⚠️ P, Q, R en T draaiden allemaal terwijl er óók een branchbevinding stond,
 *    dus ze tonen tegelijk dat een echte fout naast een branchmelding nog steeds
 *    rood geeft. Dat is geen toeval maar de stand van de repo op die dag.
 */
import { describe, expect, it } from 'vitest';

import { uitslag } from '../../scripts/migratiebranches.mjs';

const geen: string[] = [];
const iets = ['er is iets mis'];

describe('uitslag weegt een branchbevinding anders dan een fout', () => {
  it('niets aan de hand is groen', () => {
    expect(uitslag({ fouten: geen, branchfouten: geen })).toBe('groen');
  });

  it('alleen een branchbevinding is een waarschuwing en geen rood', () => {
    expect(
      uitslag({ fouten: geen, branchfouten: iets }),
      'een onafgemaakte branch met een migratie maakte de build rood',
    ).toBe('waarschuwing');
  });

  it('een echte fout is rood', () => {
    expect(uitslag({ fouten: iets, branchfouten: geen })).toBe('rood');
  });

  /**
   * ⚠️ De gevaarlijke richting: een echte fout die wegvalt omdat er toevallig
   *    ook een branchmelding is. Zonder dit geval zou "alles met een
   *    branchbevinding is een waarschuwing" er ook doorheen komen.
   */
  it('een echte fout naast een branchbevinding blijft rood', () => {
    expect(
      uitslag({ fouten: iets, branchfouten: iets }),
      'een gat of duplicaat werd weggemoffeld door een branchmelding',
    ).toBe('rood');
  });
});
