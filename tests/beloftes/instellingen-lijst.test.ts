import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import { en } from '../../src/shared/i18n/en';
import { nl } from '../../src/shared/i18n/nl';
import {
  ONDERDEEL_IDS,
  ONDERDELEN,
  paneelNaastLijst,
  vindOnderdeel,
} from '../../src/schermen/instellingen/onderdelen';
import { BREED_VANAF } from '../../src/shared/ui/tabbladen';

/**
 * Instellingen als lijst met paneel — QS8-754.
 *
 * ⚠️ **De belofte is dat geen bestaande instelling uit zicht raakt.** Een lijst die klopt en een paneel dat klopt
 *    kunnen allebei groen zijn terwijl een kaart uit het paneel is gevallen; daarom legt deze test de
 *    onderdelen naast de bron van het scherm en naast Profiel.
 *
 * IJKING — met de hand, 20-11-2026:
 *   A  `<TijdzoneInstelling … />` uit `VoorkeurenPaneel` in Instellingenscherm.tsx -> rood: 'elke instelling'
 *   B  `BREED_VANAF` in `paneelNaastLijst` door `600` -> rood: 'zelfde breekpunt'
 *   C  `'instellingen.privacy_uitleg'` uit en.ts -> rood: 'beide talen'
 *   D  de `router.push('/instellingen')` uit Profiel -> rood: 'Profiel'
 */
const bron = (pad: string) => zonderCommentaar(readFileSync(join(__dirname, '../..', pad), 'utf8'));

/** Alles wat sinds QS8-754 uit Profiel is verhuisd en vanuit de lijst bereikbaar moet blijven. */
const INSTELLINGEN = [
  'Naamkaart',
  'Avatarkaart',
  'AccountVerwijderen',
  'TaalInstelling',
  'WeekStartInstelling',
  'TijdzoneInstelling',
  'VieringKeuze',
  'Meldingen',
  'HerinneringInstelling',
  'MeldingsoortenInstelling',
  'StilleUrenInstelling',
  'VindbaarInstelling',
  'BuddyBijdrage',
  'Blokkades',
  'Uiterlijkscherm',
];

describe('Instellingen: lijst met paneel', () => {
  it('elke instelling wordt in het scherm getoond', () => {
    const scherm = bron('src/schermen/instellingen/Instellingenscherm.tsx');
    for (const naam of INSTELLINGEN) expect(scherm, naam).toMatch(new RegExp(`<${naam}\\b`));
  });

  it('elk onderdeel staat in de lijst en is bij id te vinden', () => {
    expect(ONDERDELEN.map((o) => o.id)).toEqual([...ONDERDEEL_IDS]);
    // Account verwijderen hoort niet het standaardpaneel te zijn (QS8-245).
    expect(ONDERDELEN[0]?.id).not.toBe('account');
    for (const id of ONDERDEEL_IDS) expect(vindOnderdeel(id)?.id).toBe(id);
    expect(vindOnderdeel('bestaat-niet')).toBeNull();
    expect(vindOnderdeel(undefined)).toBeNull();
  });

  it('beide talen kennen titel en uitleg van elk onderdeel', () => {
    for (const o of ONDERDELEN) {
      for (const sleutel of [o.titel, o.uitleg]) {
        expect(nl[sleutel], sleutel).toBeTruthy();
        expect(en[sleutel], sleutel).toBeTruthy();
      }
    }
  });

  it('gebruikt zelfde breekpunt als het menu', () => {
    expect(paneelNaastLijst(BREED_VANAF)).toBe(true);
    expect(paneelNaastLijst(BREED_VANAF - 1)).toBe(false);
  });

  it('Profiel heeft de ingang en de routes bestaan', () => {
    expect(bron('app/(tabs)/profiel.tsx')).toMatch(/router\.push\('\/instellingen'\)/);
    expect(existsSync(join(__dirname, '../../app/instellingen/index.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, '../../app/instellingen/[onderdeel].tsx'))).toBe(true);
  });

  it('Profiel draagt geen verhuisde instelling meer (één plek per instelling)', () => {
    const profiel = bron('app/(tabs)/profiel.tsx');
    for (const naam of INSTELLINGEN) expect(profiel, naam).not.toMatch(new RegExp(`<${naam}\\b`));
  });
});
