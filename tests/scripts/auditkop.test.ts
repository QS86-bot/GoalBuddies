import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als de andere scriptijkingen.
import {
  auditkopRegels,
  BEGIN,
  blokUit,
  EINDE,
  vervangBlok,
} from '../../scripts/auditkop.mjs';

/**
 * De ijking van `npm run auditkop` — QS8-598.
 *
 * ⚠️⚠️ **Deze generator bestaat omdat de kop van `/audit` drie weken onwaar
 *    stond en een audit een verkeerde bevinding liet rapporteren.** 📏 Gemeten
 *    op 24-09-2026: de tabel zei "23 van de 26" en noemde `stand:controle` als
 *    *"waarschijnlijk een omissie"*; in werkelijkheid draaiden er 64 van de 74
 *    in CI en draait `stand:controle` sinds QS8-417 gewoon mee.
 *
 * ⚠️ De kop voorspelde zijn eigen reparatie: *"dit hoort een gegenereerde regel
 *    te zijn, zoals het stand-blok in WERKVOORRAAD §2"*.
 */
const REGISTER = {
  'een:controle': 'vraagt de productiesleutel',
  'twee:controle': 'vraagt het npm-register',
};

describe('auditkopRegels — wat er in het blok komt', () => {
  const CONTROLES = ['een:controle', 'twee:controle', 'drie:controle', 'vier:controle'];

  it('telt hoeveel er in CI draaien en hoeveel niet', () => {
    const tekst = auditkopRegels(CONTROLES, REGISTER);

    expect(tekst).toContain('**2 van de 4**');
    expect(tekst).toContain('aan de **2** die CI niet kan draaien');
  });

  it('noemt elke uitzondering met de reden uit het register', () => {
    const tekst = auditkopRegels(CONTROLES, REGISTER);

    expect(tekst).toContain('| `een:controle` | vraagt de productiesleutel |');
    expect(tekst).toContain('| `twee:controle` | vraagt het npm-register |');
  });

  // ⚠️ Must-allow, en de reden dat deze toets bestaat: een controle die wél in
  //    CI draait hoort niet in de tabel. Precies dát was de onware regel.
  it('noemt een controle die in CI draait niet', () => {
    const tekst = auditkopRegels(CONTROLES, REGISTER);

    expect(tekst).not.toContain('drie:controle');
    expect(tekst).not.toContain('vier:controle');
  });

  it('zet elke regel in een blockquote, want het blok staat in een citaat', () => {
    for (const regel of auditkopRegels(CONTROLES, REGISTER).split('\n')) {
      expect(regel.startsWith('>')).toBe(true);
    }
  });

  // ⚠️⚠️ **Een `|` in een reden knipt de tabelrij op, en dan valt de laatste
  //    kolom weg** — precies de klasse van QS8-415. De redenen komen uit een
  //    handgeschreven register, dus dit kán voorkomen.
  it('ontsnapt een streep in een reden', () => {
    const tekst = auditkopRegels(['een:controle'], { 'een:controle': 'a | b' });

    expect(tekst).toContain('| `een:controle` | a \\| b |');
  });

  // ⚠️ Geen datum in het blok, om dezelfde reden als bij het stand-blok: anders
  //    verandert hij elke dag zonder dat er iets veranderd is.
  it('draagt geen datum', () => {
    expect(auditkopRegels(CONTROLES, REGISTER)).not.toMatch(/20\d\d/);
  });

  it('sorteert de uitzonderingen, zodat de diff niet schuift', () => {
    const tekst = auditkopRegels(['twee:controle', 'een:controle'], REGISTER);

    expect(tekst.indexOf('`een:controle`')).toBeLessThan(tekst.indexOf('`twee:controle`'));
  });
});

describe('blokUit en vervangBlok', () => {
  const DOC = `kop\n${BEGIN}\noud\n${EINDE}\nstaart\n`;

  it('leest het blok tussen de markeringen', () => {
    expect(blokUit(DOC)).toBe('oud');
  });

  it('geeft null als de markeringen ontbreken', () => {
    expect(blokUit('geen markeringen')).toBeNull();
  });

  it('vervangt alleen het blok en laat kop en staart staan', () => {
    const uit = vervangBlok(DOC, 'nieuw');

    expect(blokUit(uit)).toBe('nieuw');
    expect(uit.startsWith('kop\n')).toBe(true);
    expect(uit.endsWith('staart\n')).toBe(true);
  });

  it('werpt als de markeringen ontbreken — stil niets doen is hier erger', () => {
    expect(() => vervangBlok('geen markeringen', 'nieuw')).toThrow();
  });
});

describe('het echte document', () => {
  it('draagt de markeringen en een blok dat klopt', () => {
    // ⚠️ De eigenlijke bewering, tegen wat er nu op schijf staat.
    const doc = readFileSync(join(process.cwd(), '.claude/commands/audit.md'), 'utf8');
    const scripts = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ).scripts as Record<string, string>;
    const controles = Object.keys(scripts).filter((n) => n.endsWith(':controle'));

    expect(blokUit(doc)).toBe(auditkopRegels(controles));
  });

  // ⚠️ De kanarie. Een leeg blok is ook wat je krijgt als de afleiding stuk is,
  //    en dat is deze week twee keer voorgekomen.
  it('noemt echte controles en niet nul', () => {
    const doc = readFileSync(join(process.cwd(), '.claude/commands/audit.md'), 'utf8');

    expect(blokUit(doc)).toContain('`adviseur:controle`');
    expect(blokUit(doc)).toMatch(/\*\*\d+ van de \d+\*\*/);
  });

  // ⚠️⚠️ **De toets die het geval van dit issue vastlegt.** `stand:controle`
  //    draait sinds QS8-417 in CI; de handgeschreven kop zei van niet, en die
  //    zin heeft een audit een verkeerde bevinding laten rapporteren.
  it('noemt stand:controle niet als uitzondering — die draait in CI', () => {
    const doc = readFileSync(join(process.cwd(), '.claude/commands/audit.md'), 'utf8');

    expect(blokUit(doc)).not.toContain('`stand:controle`');
  });
});
