import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import { en } from '../../src/shared/i18n/en';
import { nl } from '../../src/shared/i18n/nl';

/**
 * Een klassementsregel toont plek, naam en punten en verder niets — QS8-666 (A57b), 3c-ui.
 *
 * ⚠️ **De belofte is geen delta, geen datum, geen minteken en geen woord over verlies.** Domeinregel 7 en 10: een klassement dat een afstand of een
 *    daling toont, is een tegenslagmeter. De regel is verhuisd uit het groepsscherm (regel 18: een verhuizing neemt de belofte mee of laat hem
 *    achter), dus staat hij hier op de plek waar hij nu woont, en niet in commentaar.
 *
 * IJKING (met de hand, 22-11-2026): `{rij.positie}` vervangen door `{rij.positie - 1}` of een `delta` toevoegen aan de regel -> 'toont alleen
 * plek, naam en punten' valt om; 'laatste' in een tekst van het scherm zetten -> 'geen verliestaal' valt om.
 */
const lees = (pad: string): string => zonderCommentaar(readFileSync(join(__dirname, '../..', pad), 'utf8'));
const regel = lees('src/schermen/klassementen/KlassementRegel.tsx');
const kaartBron = lees('src/schermen/klassementen/KlassementKaart.tsx');
const SCHERMSLEUTELS = Object.keys(nl).filter((s) => s.startsWith('klassementen.'));

describe('de klassementsregel', () => {
  it('toont alleen plek, naam en punten (en de markering jij)', () => {
    expect(regel).toMatch(/\{rij\.positie\}/);
    expect(regel).toMatch(/\{rij\.naam\}/);
    expect(regel).not.toMatch(/delta|datum|date|created_at|verschil/i);
    expect(regel).not.toMatch(/rij\.positie\s*[-+]/);
  });

  it('rekent de plek niet zelf uit: geen index en geen positie + 1', () => {
    expect(regel).not.toMatch(/index|\bi\s*\+\s*1/);
    expect(kaartBron).not.toMatch(/\.map\(\((?:\w+),\s*(?:i|index)\)/);
  });

  it('de teksten van het scherm bestaan in nl en en en noemen geen verlies', () => {
    expect(SCHERMSLEUTELS.length).toBeGreaterThan(0);
    for (const sleutel of SCHERMSLEUTELS) {
      const alles = `${nl[sleutel as keyof typeof nl]} ${en[sleutel as keyof typeof en]}`;
      expect(en[sleutel as keyof typeof en], sleutel).toBeTruthy();
      expect(alles, sleutel).not.toMatch(/laatste|achterstand|gemist|verloren|verlies|last place|behind|lost|missed/i);
      expect(/\p{Extended_Pictographic}/u.test(alles), sleutel).toBe(false);
    }
  });
});
