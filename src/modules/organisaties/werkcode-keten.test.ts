import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * De keten van de tweede ingang (QS8-663) heeft drie schakels in drie bestanden:
 * het aanmeldscherm onthoudt, de wacht opent, het scherm vult in en vergeet.
 * Elke schakel is afzonderlijk af; deze toets bewaakt dat ze aan elkaar zitten
 * (regel 18, vraag 5), en dat niets de code stilzwijgend verzilvert.
 */
const lees = (p: string) => readFileSync(p, 'utf8');

describe('de werkcode-keten', () => {
  it('het aanmeldscherm onthoudt de code', () => {
    expect(lees('app/aanmelden.tsx')).toContain('bewaarWerkcode(');
  });

  it('de wacht in de layout opent het scherm met de code', () => {
    const bron = lees('app/_layout.tsx');
    expect(bron).toContain('openstaandeWerkcode()');
    expect(bron).toContain('/organisatie/deelnemen?code=');
  });

  it('het scherm vergeet de code pas na gelukt lid worden', () => {
    const bron = lees('app/organisatie/deelnemen.tsx');
    expect(bron.indexOf('vergeetWerkcode()')).toBeGreaterThan(bron.indexOf('uitkomst.ok'));
  });

  it('niets buiten het scherm roept word_organisatielid aan: lid worden blijft een druk op de knop', () => {
    expect(lees('app/_layout.tsx')).not.toContain('wordOrganisatielid');
    expect(lees('src/modules/organisaties/pending.ts')).not.toContain('wordOrganisatielid');
  });
});
