import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { nl } from '../../src/shared/i18n/nl';
import { zonderCommentaar } from './roept-aan';

/**
 * De statistiekpagina is van jezelf, kent geen gemist en geen percentage — QS8-749.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel** (regel 18): de pagina leest alleen eigen
 *    rijen, staat op geen groepsscherm, en geen tekst of vorm maakt van een rustige week een
 *    tekortkoming (domeinregel 7) of van het aantal weken een percentage (verbeterplan §6).
 */
const ROOT = join(__dirname, '..', '..');

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    return statSync(pad).isDirectory() ? bestanden(pad) : /\.tsx?$/.test(naam) ? [pad] : [];
  });
}

const SCHERM = bestanden(join(ROOT, 'src/schermen/statistiek')).filter((p) => !p.includes('.test.'));
const BRON = SCHERM.map((p) => zonderCommentaar(readFileSync(p, 'utf8')));

describe('de statistiekpagina blijft van jezelf', () => {
  it('staat alleen op eigen routes en nergens in een groepsscherm', () => {
    const gebruikers = bestanden(join(ROOT, 'app'))
      .filter((p) => /schermen\/statistiek|fetchEigenVoltooiingsmomenten/.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(ROOT.length + 1));
    expect(gebruikers).toEqual(['app/statistiek.tsx']);
  });

  it('leest geen groepsgegevens, geen Dagzet, geen punten', () => {
    for (const bron of BRON) {
      expect(bron).not.toMatch(/modules\/buddies|group_id|fetchDagzetten|daily_moves|points_ledger|fetchPunten/);
    }
  });

  it('haalt de gebruiker uit de sessie en neemt geen id uit een route', () => {
    const hook = zonderCommentaar(readFileSync(join(ROOT, 'src/schermen/statistiek/useStatistiek.ts'), 'utf8'));
    expect(hook).toMatch(/useSession\(\)/);
    for (const bron of BRON) expect(bron).not.toMatch(/useLocalSearchParams|useGlobalSearchParams/);
  });

  it('heeft geen woord of getal dat een rustige week tot falen of percentage maakt', () => {
    const teksten = Object.entries(nl)
      .filter(([sleutel]) => sleutel.startsWith('statistiek.'))
      .map(([, tekst]) => String(tekst).toLowerCase());
    expect(teksten.length).toBeGreaterThan(20);
    for (const tekst of teksten) expect(tekst).not.toMatch(/gemist|mislukt(?!\.)|achterstand|gefaald|%|procent|ranglijst|klassement/);
  });

  it('kent in de vorm geen rode of "gemist"-staat en rekent geen percentage', () => {
    for (const bron of BRON) {
      expect(bron).not.toMatch(/gemist|missed|danger|atRisk|%\s*\)|\* 100/);
    }
  });
});
