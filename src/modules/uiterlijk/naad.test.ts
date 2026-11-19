import { beforeEach, describe, expect, it, vi } from 'vitest';

import { themeVoorKeuze } from '../../shared/theme/themes';

import { kiesVoorkeur, leesLokaleStart } from './opstarten';
import { LEGACY_THEMASLEUTEL, LOKALE_SLEUTEL } from './verzoenen';
import { STANDAARD_VOORKEUR, type Uiterlijkvoorkeur } from './voorkeur';

const opslag = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (k: string) => Promise.resolve(opslag.get(k) ?? null),
    setItem: (k: string, v: string) => {
      opslag.set(k, v);
      return Promise.resolve();
    },
  },
}));
vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('./api', () => ({
  haalAccountVoorkeur: vi.fn(),
  bewaarAccountVoorkeur: vi.fn(),
}));

/**
 * De naad van QS8-731: een keuze op het scherm, de module en het thema samen. Elk onderdeel heeft zijn eigen
 * toets; deze toetst de belofte dat wat je kiest na een herstart ook het uiterlijk is.
 *
 * IJKING (met de hand, 19-11-2026):
 *   A  `uiterlijkIdVoor` negeert de variant => rood: 'een gekozen variant is na herstart het uiterlijk'
 *   B  de terugval bij een onbekende waarde weg => rood: 'een onbekende opgeslagen waarde'
 */
const palet = (v: Uiterlijkvoorkeur) => themeVoorKeuze(v, 'dark');

beforeEach(async () => {
  opslag.clear();
  const { bewaarAccountVoorkeur } = await import('./api');
  vi.mocked(bewaarAccountVoorkeur).mockReset().mockResolvedValue({ ok: false, reden: 'netwerk' });
});

describe('keuze, herstart en thema', () => {
  it('een gekozen variant is na herstart het uiterlijk, ook als de account niet bereikbaar is', async () => {
    const keuze: Uiterlijkvoorkeur = { ...STANDAARD_VOORKEUR, stijl: 'c', kleurvariant: 'pruim', weergave: 'licht' };
    const uitkomst = await kiesVoorkeur('u1', keuze);
    expect(uitkomst.opgeslagen).toBe(false);
    const start = await leesLokaleStart();
    const th = palet(start.voorkeur);
    expect(th.uiterlijk).toBe('C-pruim');
    expect(th.dark).toBe(false);
  });

  it('wisselen naar A of B laat de variant los en blijft een bestaand uiterlijk', async () => {
    await kiesVoorkeur('u1', { ...STANDAARD_VOORKEUR, stijl: 'c', kleurvariant: 'koraal' });
    await kiesVoorkeur('u1', { ...STANDAARD_VOORKEUR, stijl: 'a', kleurvariant: 'koraal' });
    expect(palet((await leesLokaleStart()).voorkeur).uiterlijk).toBe('A');
  });

  it('een onbekende opgeslagen waarde valt terug op B en donker', async () => {
    opslag.set(LOKALE_SLEUTEL, JSON.stringify({ userId: 'u1', voorkeur: { stijl: 'z' }, basis: null, wacht: false }));
    const th = palet((await leesLokaleStart()).voorkeur);
    expect(th.uiterlijk).toBe('B');
    expect(th.dark).toBe(true);
  });

  it('niets opgeslagen geeft B en donker', async () => {
    const th = palet((await leesLokaleStart()).voorkeur);
    expect([th.uiterlijk, th.dark]).toEqual(['B', true]);
  });

  it('wie de oude themakeuze navy-licht had, houdt licht', async () => {
    opslag.set(LEGACY_THEMASLEUTEL, 'navy-licht');
    const th = palet((await leesLokaleStart()).voorkeur);
    expect(th.dark).toBe(false);
    expect(th.uiterlijk).toBe('B');
  });
});
