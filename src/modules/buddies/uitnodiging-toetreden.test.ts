import { describe, expect, it } from 'vitest';

import { verwerkToetreding, type ToetredenUitvoer } from './uitnodiging-toetreden';

function opstelling(over: Partial<ToetredenUitvoer> = {}) {
  const gebeurd: string[] = [];
  const uit: ToetredenUitvoer = {
    gemount: () => true,
    onboarded: () => true,
    vergeetCode: () => gebeurd.push('vergeet'),
    zetFout: (m) => gebeurd.push(`fout:${m}`),
    zetBinnen: (id) => gebeurd.push(`binnen:${id}`),
    naarGroep: (id) => gebeurd.push(`groep:${id}`),
    ...over,
  };
  return { uit, gebeurd };
}

describe('verwerkToetreding — QS8-712', () => {
  it('een geslaagde toetreding wist de code, zet binnen en gaat naar de groep', () => {
    const { uit, gebeurd } = opstelling();
    verwerkToetreding({ ok: true, waarde: 'g-1' }, uit);
    expect(gebeurd).toEqual(['vergeet', 'binnen:g-1', 'groep:g-1']);
  });

  it('het profiel dat pas na de start binnenkomt telt: onboarded wordt bij de afhandeling gevraagd', () => {
    let profielGeladen = false;
    const { uit, gebeurd } = opstelling({ onboarded: () => profielGeladen });
    profielGeladen = true; // gebeurt terwijl neemDeel liep
    verwerkToetreding({ ok: true, waarde: 'g-1' }, uit);
    expect(gebeurd).toContain('groep:g-1');
  });

  it('zonder profiel blijft het scherm staan, maar wel als lid', () => {
    const { uit, gebeurd } = opstelling({ onboarded: () => false });
    verwerkToetreding({ ok: true, waarde: 'g-1' }, uit);
    expect(gebeurd).toEqual(['vergeet', 'binnen:g-1']);
  });

  it('een mislukking wist de code en toont de melding', () => {
    const { uit, gebeurd } = opstelling();
    verwerkToetreding({ ok: false, melding: 'vol' }, uit);
    expect(gebeurd).toEqual(['vergeet', 'fout:vol']);
  });

  it('een scherm dat is verlaten krijgt niets meer, maar de code wordt wel gewist', () => {
    const { uit, gebeurd } = opstelling({ gemount: () => false });
    verwerkToetreding({ ok: true, waarde: 'g-1' }, uit);
    expect(gebeurd).toEqual(['vergeet']);
  });
});
