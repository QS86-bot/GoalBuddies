/**
 * IJking van `scripts/ci-controles.mjs` — QS8-417.
 *
 * ⚠️ **Wat hier geijkt wordt is de grendel, niet de banen.** De banen kúnnen
 *    niet achterlopen: ze worden uit `package.json` gelezen. Wat wél kan
 *    terugkomen is dat iemand er weer losse stappen naast zet, of dat het
 *    register verrot — en dat zijn precies de twee dingen die `bezwaren()`
 *    meldt.
 */
import { describe, expect, it } from 'vitest';

import {
  bezwaren,
  handmatigGenoemd,
  verdeel,
  ZONDER_CI,
} from '../../scripts/ci-controles.mjs';

const DRIE = ['a:controle', 'b:controle', 'c:controle'];

describe('verdeel', () => {
  it('deelt in drie en laat niets vallen', () => {
    const uit = verdeel(DRIE, new Set(['b:controle']), { 'c:controle': 'omdat' });

    expect(uit.repo).toEqual(['a:controle']);
    expect(uit.database).toEqual(['b:controle']);
    expect(uit.zonder).toEqual(['c:controle']);
  });

  /**
   * ⚠️⚠️ **De verdeling is totaal, en dat is het hele ontwerp.** Er is geen
   *    vierde bak waarin een controle stil kan verdwijnen — dat wás de bug.
   */
  it('plaatst élke controle in precies één baan', () => {
    const uit = verdeel(DRIE, new Set(['b:controle']), { 'c:controle': 'omdat' });

    expect([...uit.repo, ...uit.database, ...uit.zonder].sort()).toEqual(DRIE);
  });

  /** Het register wint van de databasebaan; anders draait een sleutelcontrole tóch. */
  it('laat het register voorgaan op de databasevraag', () => {
    const uit = verdeel(['x:controle'], new Set(['x:controle']), { 'x:controle': 'sleutel' });

    expect(uit.zonder).toEqual(['x:controle']);
    expect(uit.database).toEqual([]);
  });

  it('zet een nieuwe controle vanzelf in de repobaan', () => {
    expect(verdeel(['nieuw:controle'], new Set(), {}).repo).toEqual(['nieuw:controle']);
  });
});

describe('handmatigGenoemd', () => {
  it('vindt een controle die als losse stap in een workflow staat', () => {
    const yml = '      - name: Iets\n        run: npm run a:controle\n';

    expect(handmatigGenoemd(yml, DRIE)).toEqual(['a:controle']);
  });

  /**
   * ⚠️ De lus zelf noemt geen enkele controlenaam — hij leest ze uit
   *    `--baan`. Zou dit patroon dáárop aanslaan, dan is de grendel altijd rood
   *    en leer je hem uitzetten.
   */
  it('laat de gegenereerde lus met rust', () => {
    const yml =
      '        run: |\n' +
      '          for naam in $(node scripts/ci-controles.mjs --baan repo); do\n' +
      '            npm run --silent "$naam"\n' +
      '          done\n';

    expect(handmatigGenoemd(yml, DRIE)).toEqual([]);
  });

  it('en een naam die alleen in een comment staat', () => {
    expect(handmatigGenoemd('      # ⚠️ zie npm run a:controle hieronder\n', DRIE)).toEqual([]);
  });
});

describe('bezwaren', () => {
  const reden = 'Een reden die lang genoeg is om iets uit te leggen en niet alleen een vinkje te zijn.';

  it('zwijgt als er niets aan de hand is', () => {
    expect(bezwaren(DRIE, 'run: npm test\n', { 'c:controle': reden })).toEqual([]);
  });

  it('meldt een handmatige stap', () => {
    const uit = bezwaren(DRIE, '        run: npm run a:controle\n', {});

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('a:controle');
    expect(uit[0]).toContain('met de hand');
  });

  /**
   * ⚠️ De ratel de andere kant op: een register dat een script noemt dat niet
   *    meer bestaat, is dood gewicht dat niemand opmerkt — en het is een
   *    vrijbrief die morgen om een andere reden weer raak kan zijn.
   */
  it('meldt een registerrij die geen script meer noemt', () => {
    const uit = bezwaren(DRIE, '', { 'weg:controle': reden });

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('bestaat niet meer');
  });

  it('meldt een registerrij zonder reden die iets uitlegt', () => {
    const uit = bezwaren(DRIE, '', { 'c:controle': 'sleutel' });

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('zonder een reden');
  });
});

describe('het echte register', () => {
  it('draagt een reden per rij', () => {
    const rijen = Object.entries(ZONDER_CI as Record<string, string>);
    expect(rijen.length).toBeGreaterThan(0);
    for (const [naam, waarom] of rijen) {
      expect(waarom.length, `reden te kort bij ${naam}`).toBeGreaterThan(60);
    }
  });

  /**
   * ⚠️ Zonder deze grens kon iemand de hele lijst in het register zetten en dan
   *    is de grendel groen over een CI die niets draait.
   */
  it('is een uitzondering en geen tweede lijst', () => {
    expect(Object.keys(ZONDER_CI).length).toBeLessThan(12);
  });
});
