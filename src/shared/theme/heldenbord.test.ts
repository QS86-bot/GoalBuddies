import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { contrastRatio, WCAG } from './contrast';
import { heldVlak, HELDENOPPERVLAKKEN, onbevoegdeGebruikers } from './heldenbord';
import { HELDPALETSLEUTELS, navy, type Heldpalet } from './tokens';
import { allePaletten } from './uiterlijken';

/** Een held die op een palet niet te lezen is: dezelfde tint als zijn achtergrond. */
function onleesbaarOp(grond: string): Heldpalet {
  return Object.fromEntries(
    HELDPALETSLEUTELS.map((s) => [s, { primair: grond, accent: grond }]),
  ) as Heldpalet;
}
const onleesbaar = onleesbaarOp(navy.bg);

describe.each(allePaletten())('het bord op palet %s', (_naam, u) => {
  it('laat elke held op het palet staan zolang hij leesbaar is (vandaag: allemaal)', () => {
    for (const s of HELDPALETSLEUTELS) expect(heldVlak(u.helden, s, u.colors).soort, s).toBe('palet');
  });

  it('geeft een held die hij wel kan tonen, ook als hij niet op het palet past', () => {
    for (const s of HELDPALETSLEUTELS) {
      const v = heldVlak(onleesbaarOp(u.colors.bg), s, u.colors);
      expect(v.soort).toBe('bord');
      if (v.soort === 'bord') expect(v.vlak).toMatch(/\S/);
    }
  });
});

describe('het bord als hook', () => {
  it('kiest een neutraal vlak met meer contrast dan het palet bood', () => {
    const v = heldVlak(onleesbaar, 'strix', navy);
    expect(v.soort).toBe('bord');
    if (v.soort === 'bord') {
      expect(contrastRatio(v.kleuren.accent, v.vlak)).toBeGreaterThan(contrastRatio(v.kleuren.accent, navy.bg));
      expect(Object.values(navy)).toContain(v.vlak);
    }
  });

  it('laat het heldenpalet zelf ongemoeid: het bord wijzigt geen kleur', () => {
    const v = heldVlak(onleesbaar, 'ignis', navy);
    expect(v.kleuren).toBe(onleesbaar.ignis);
  });

  it('meet leesbaarheid met dezelfde lat als heldkleuren.test.ts', () => {
    expect(WCAG.AA_LARGE).toBe(3);
  });
});

describe('het bord is alleen voor heldenoppervlakken', () => {
  it('wordt door geen bestand buiten het register genoemd', () => {
    expect(onbevoegdeGebruikers(bronnenIn(['app', 'src'], /\.(tsx?)$/))).toEqual([]);
  });

  // Ijking: een knop die het bord leent, moet rood worden.
  it('ziet een kaart die geen held draagt maar het bord leent', () => {
    const bronnen = { 'src/shared/ui/Button.tsx': "import { heldVlak } from '@/shared/theme/heldenbord';" };
    expect(onbevoegdeGebruikers(bronnen, {})).toEqual(['src/shared/ui/Button.tsx']);
  });

  it('laat een geregistreerd heldenoppervlak door', () => {
    const bronnen = { 'app/groep/x.tsx': "import { heldVlak } from './heldenbord';" };
    expect(onbevoegdeGebruikers(bronnen, { 'app/groep/x.tsx': 'held' })).toEqual([]);
  });

  it('heeft geen rijen zonder reden in het register', () => {
    for (const reden of Object.values(HELDENOPPERVLAKKEN)) expect(reden).toMatch(/\S/);
  });
});

function bronnenIn(mappen: string[], filter: RegExp): Record<string, string> {
  const uit: Record<string, string> = {};
  const loop = (dir: string) => {
    for (const naam of readdirSync(dir)) {
      const pad = join(dir, naam);
      if (statSync(pad).isDirectory()) loop(pad);
      else if (filter.test(naam) && !/heldenbord(\.test)?\.ts$/.test(pad) && !/theme[/\\]index\.ts$/.test(pad)) {
        uit[pad.replace(/\\/g, '/')] = readFileSync(pad, 'utf8');
      }
    }
  };
  mappen.forEach(loop);
  return uit;
}
