import { describe, expect, it } from 'vitest';

import { contrastRatio, WCAG } from './contrast';
import { kleinsteAfstand, kleurafstand, MIN_AFSTAND } from './kleurafstand';
import { navy, navyLight, PALETSLEUTELS, roles } from './tokens';
import { themeForPreference } from './themes';
import {
  allePaletten,
  STANDAARD_MODUS,
  STANDAARD_UITERLIJK,
  UITERLIJK_IDS,
  UITERLIJKEN,
  uiterlijk,
  uiterlijkVoorVoorkeur,
} from './uiterlijken';

/**
 * De belofte van QS8-723: **elk uiterlijk is een volledig palet dat contrast en onderscheid haalt, per palet gemeten.**
 *
 * ⚠️ Dit bestand loopt over `allePaletten()` en niet over een vaste lijst: een uiterlijk dat QS8-724
 *    toevoegt, valt hier vanzelf onder dezelfde toetsen. Een palet dat een toets overslaat omdat niemand
 *    hem in de lijst zette, is de fout die dit bestand wil voorkomen.
 */

const paletten = allePaletten();

describe.each(paletten)('palet %s', (_naam, u) => {
  const p = u.colors;

  it('draagt elke sleutel, en alleen die (criterium 1)', () => {
    expect(afwijkendeSleutels(p)).toEqual({ ontbreekt: [], overbodig: [] });
    for (const sleutel of PALETSLEUTELS) expect(p[sleutel], sleutel).toMatch(/\S/);
  });

  it('haalt 4,5:1 voor tekst op achtergrond en paneel (criterium 5)', () => {
    for (const vlak of [p.bg, p.panel, p.panelDark]) {
      expect(contrastRatio(p.text, vlak)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
      expect(contrastRatio(p.textSecondary, vlak)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    }
  });

  it('haalt 3:1 voor merk- en statuskleuren als bedieningselement (criterium 5)', () => {
    for (const kleur of [p.accent, p.green, p.orange, p.red]) {
      expect(contrastRatio(kleur, p.bg), kleur).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
      expect(contrastRatio(kleur, p.panel), kleur).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
    }
  });

  it('draagt de knoptekst op de knopvulling met 4,5:1 (criterium 5)', () => {
    expect(contrastRatio(p.knopTekst, p.knop)).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
  });

  it('houdt de categoriekleuren uit elkaar en van de statuskleuren en het accent van dit palet (criterium 6)', () => {
    const kleuren = Object.values(u.families);
    expect(kleinsteAfstand(kleuren)).toBeGreaterThanOrEqual(MIN_AFSTAND);
    for (const kleur of kleuren) {
      for (const status of [p.green, p.orange, p.red, p.accent]) {
        expect(kleurafstand(kleur, status), `${kleur} vs ${status}`).toBeGreaterThanOrEqual(MIN_AFSTAND);
      }
    }
  });

  /**
   * Criterium 7 (domeinregel 7): `red` is deadline-risico en niets anders. De rol voor "geen activiteit" is
   * neutraal en dus nooit dezelfde kleur als `red`, in elk palet.
   */
  it('houdt rood uitsluitend voor risico: de neutrale rol is nooit rood (criterium 7)', () => {
    const r = roles(p);
    expect(r.atRisk).toBe(p.red);
    expect(r.neutral).toBe(p.grey);
    expect(r.neutral).not.toBe(r.atRisk);
    expect(kleurafstand(p.grey, p.red)).toBeGreaterThanOrEqual(MIN_AFSTAND);
  });
});

describe('de standaard en de bestaande voorkeur (E8, E9)', () => {
  it('is B en donker voor een nieuwe gebruiker', () => {
    expect([STANDAARD_UITERLIJK, STANDAARD_MODUS]).toEqual(['B', 'donker']);
  });

  it('laat elke bestaande voorkeur hetzelfde thema geven als de brug naar B zegt', () => {
    for (const voorkeur of ['systeem', 'navy', 'navy-licht'] as const) {
      for (const scheme of ['light', 'dark', 'unspecified'] as const) {
        const { id, modus } = uiterlijkVoorVoorkeur(voorkeur, scheme);
        expect(id).toBe('B');
        expect(themeForPreference(voorkeur, scheme).colors, `${voorkeur}/${scheme}`).toBe(
          UITERLIJKEN[id][modus].colors,
        );
      }
    }
  });
});

describe('één statusrood (QS8-743; de waarde en zijn metingen staan in statusrood.test.ts)', () => {
  it('is binnen een modus in elk uiterlijk dezelfde kleur, zodat het rood niet per uiterlijk kan uiteenlopen', () => {
    for (const modus of ['donker', 'licht'] as const) {
      const rood = new Set(UITERLIJK_IDS.map((id) => UITERLIJKEN[id][modus].colors.red));
      expect([...rood], modus).toHaveLength(1);
    }
  });
});

/** Een monster langs het verloop in sRGB (zo interpoleren CSS en React Native), `n + 1` punten. */
function monsters(van: string, naar: string, n = 10): string[] {
  const kanalen = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = kanalen(van);
  const b = kanalen(naar);
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n;
    return '#' + a.map((v, i) => Math.round(v * (1 - t) + b[i]! * t).toString(16).padStart(2, '0')).join('');
  });
}

/** Per tint van het accentverloop van C: de kleinste afstand tot groen, oranje en rood van dat palet. */
function tintAfstanden(): { sleutel: string; afstand: number }[] {
  return paletten
    .filter(([naam]) => naam.startsWith('C-'))
    .flatMap(([naam, u]) =>
      u.verloop!.accent.map((tint) => ({
        sleutel: `${naam.replace(/ \((donker|licht)\)/, ' $1')} ${tint}`,
        afstand: Math.min(...[u.colors.green, u.colors.orange, u.colors.red].map((s) => kleurafstand(tint, s))),
      })),
    );
}

describe('uiterlijk C (QS8-724)', () => {
  // ⚠️ Het traject en niet alleen de uiteinden: de luminantie van een mengsel kan onder beide uiteinden zakken.
  it('houdt tekst leesbaar en de knoptekst 4,5:1 langs het héle verloop, niet alleen op de uiteinden', () => {
    for (const [naam, u] of paletten.filter(([n]) => n.startsWith('C-'))) {
      for (const k of monsters(...u.verloop!.achtergrond)) {
        expect(contrastRatio(u.colors.text, k), `${naam} tekst op ${k}`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
        expect(contrastRatio(u.colors.textSecondary, k), `${naam} tekst2 op ${k}`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
      }
      for (const k of monsters(...u.verloop!.accent)) {
        expect(contrastRatio(u.colors.knopTekst, k), `${naam} knop op ${k}`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
      }
    }
  });

  it('ijkt het monster zelf: rood naar groen heeft een midden dat onder beide uiteinden ligt', () => {
    const m = monsters('#ff0000', '#00ff00');
    expect(m).toHaveLength(11);
    expect(contrastRatio('#000000', m[5]!)).toBeLessThan(contrastRatio('#000000', m[10]!));
    expect(m[0]).toBe('#ff0000');
    expect(m[10]).toBe('#00ff00');
  });

  const cIds = ['C-baai', 'C-avondgloed'] as const;

  it('draagt een verloop; A en B blijven vlak', () => {
    for (const modus of ['donker', 'licht'] as const) {
      for (const id of cIds) expect(UITERLIJKEN[id][modus].verloop, `${id} ${modus}`).not.toBeNull();
      expect(UITERLIJKEN.A[modus].verloop).toBeNull();
      expect(UITERLIJKEN.B[modus].verloop).toBeNull();
    }
  });

  it('begint de achtergrond op de eigen `bg` en laat de tweede tint niet op de tekst vallen', () => {
    for (const [naam, u] of paletten.filter(([n]) => n.startsWith('C-'))) {
      const v = u.verloop!;
      expect(v.achtergrond[0], naam).toBe(u.colors.bg);
      expect(contrastRatio(u.colors.text, v.achtergrond[1]), naam).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
      expect(contrastRatio(u.colors.textSecondary, v.achtergrond[1]), naam).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
    }
  });

  it('eindigt het accentverloop op het accent van het palet en draagt de knoptekst op beide uiteinden', () => {
    for (const [naam, u] of paletten.filter(([n]) => n.startsWith('C-'))) {
      const [van, naar] = u.verloop!.accent;
      expect(naar, naam).toBe(u.colors.accent);
      for (const kleur of [van, naar]) {
        expect(contrastRatio(u.colors.knopTekst, kleur), `${naam} ${kleur}`).toBeGreaterThanOrEqual(WCAG.AA_TEXT);
        expect(contrastRatio(kleur, u.colors.bg), `${naam} ${kleur}`).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
      }
    }
  });

  /**
   * ⚠️ Beide tinten van het accentverloop tegen de statuskleuren (QS8-724, review). Een knop of streep die in
   *    het groen of oranje begint, leest als "gehaald" of "dreigt mis te gaan". Avondgloed-amber is door Quinten
   *    geaccepteerd (19-11-2026, vijfde ronde); die twee tinten staan hier met hun gemeten bodem en mogen niet slechter.
   */
  const AMBER_GEACCEPTEERD: Readonly<Record<string, number>> = {
    'C-avondgloed donker #f59e0b': 8,
    'C-avondgloed licht #9a3412': 6.5,
  };

  it('houdt de tinten van het accentverloop op afstand van groen, oranje en rood, behalve het geaccepteerde amber', () => {
    const gebruikt = new Set<string>();
    for (const { sleutel, afstand } of tintAfstanden()) {
      if (!(sleutel in AMBER_GEACCEPTEERD)) {
        expect(afstand, sleutel).toBeGreaterThanOrEqual(MIN_AFSTAND);
        continue;
      }
      gebruikt.add(sleutel);
      expect(afstand, sleutel).toBeLessThan(MIN_AFSTAND); // een uitzondering die niets uitzondert is dood
      expect(afstand, sleutel).toBeGreaterThanOrEqual(AMBER_GEACCEPTEERD[sleutel]!);
    }
    expect([...gebruikt].sort()).toEqual(Object.keys(AMBER_GEACCEPTEERD).sort());
  });

  it('haalt 3:1 voor de tinten van het accentverloop ook op de tweede achtergrondtint', () => {
    for (const [naam, u] of paletten.filter(([n]) => n.startsWith('C-'))) {
      for (const tint of u.verloop!.accent) {
        expect(contrastRatio(tint, u.verloop!.achtergrond[1]), `${naam} ${tint}`).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
      }
    }
  });

  it('gebruikt in C het statusrood van navy: één rood voor de hele app (QS8-743)', () => {
    for (const modus of ['donker', 'licht'] as const) {
      for (const id of cIds) expect(UITERLIJKEN[id][modus].colors.red).toBe(UITERLIJKEN.B[modus].colors.red);
    }
  });

  it('heeft Avondgloed-roze niet op #f472b6 (8,5 van softskills) en Baai niet op emerald als accent', () => {
    expect(UITERLIJKEN['C-avondgloed'].donker.colors.accent.toLowerCase()).not.toBe('#f472b6');
    expect(UITERLIJKEN['C-baai'].donker.colors.accent.toLowerCase()).not.toBe('#10b981');
  });

  it('houdt het accent van elke variant op afstand van het statusgroen', () => {
    for (const modus of ['donker', 'licht'] as const) {
      for (const id of cIds) {
        const c = UITERLIJKEN[id][modus].colors;
        expect(kleurafstand(c.accent, c.green), `${id} ${modus}`).toBeGreaterThanOrEqual(MIN_AFSTAND);
      }
    }
  });
});

describe('de uiterlijken', () => {
  it('heeft B als het huidige stelsel, ongewijzigd (criterium 2)', () => {
    expect(UITERLIJKEN.B.donker.colors).toBe(navy);
    expect(UITERLIJKEN.B.licht.colors).toBe(navyLight);
  });

  it('heeft A met een blauwgroen accent en niet emerald (criterium 2)', () => {
    for (const modus of ['donker', 'licht'] as const) {
      const a = uiterlijk('A', modus).colors;
      expect(a.accent.toLowerCase()).not.toBe('#10b981');
      // Gewone afstand tot het statusgroen: 'gehaald' en 'merk' vallen niet samen.
      expect(kleurafstand(a.accent, a.green), modus).toBeGreaterThanOrEqual(MIN_AFSTAND);
    }
  });

  it('kent vier uiterlijken in twee modi: acht paletten', () => {
    expect([...UITERLIJK_IDS].sort()).toEqual(['A', 'B', 'C-avondgloed', 'C-baai']);
    expect(paletten).toHaveLength(8);
  });

  it('heeft in elk uiterlijk dezelfde helden en categoriekleuren per modus (A en B delen ze)', () => {
    for (const modus of ['donker', 'licht'] as const) {
      expect(UITERLIJKEN.A[modus].helden).toBe(UITERLIJKEN.B[modus].helden);
      expect(UITERLIJKEN.A[modus].families).toBe(UITERLIJKEN.B[modus].families);
    }
  });
});

/** Welke sleutels mist of heeft een palet te veel? De toets hierboven en de ijking hieronder gebruiken dezelfde functie. */
function afwijkendeSleutels(p: object): { ontbreekt: string[]; overbodig: string[] } {
  const heeft = Object.keys(p);
  return {
    ontbreekt: PALETSLEUTELS.filter((s) => !heeft.includes(s)),
    overbodig: heeft.filter((s) => !(PALETSLEUTELS as readonly string[]).includes(s)),
  };
}

/** Een controle die je niet kunt voeden, kun je niet ijken: dezelfde functie krijgt hier een kapot palet. */
describe('de volledigheidstoets ziet een kapot palet', () => {
  it('ziet een ontbrekende sleutel', () => {
    const { knop: _weg, ...zonder } = navy;
    expect(afwijkendeSleutels(zonder)).toEqual({ ontbreekt: ['knop'], overbodig: [] });
  });

  it('ziet een extra sleutel', () => {
    expect(afwijkendeSleutels({ ...navy, extra: '#000000' })).toEqual({
      ontbreekt: [],
      overbodig: ['extra'],
    });
  });

  it('laat een volledig palet door', () => {
    expect(afwijkendeSleutels(navyLight)).toEqual({ ontbreekt: [], overbodig: [] });
  });
});
