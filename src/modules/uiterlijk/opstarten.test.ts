import { beforeEach, describe, expect, it, vi } from 'vitest';

import { kiesVoorkeur, verzoenMetAccount } from './opstarten';
import { haalAccountVoorkeur } from './api';
import { parseLokaleKopie, LOKALE_SLEUTEL } from './verzoenen';
import { STANDAARD_VOORKEUR } from './voorkeur';

const opslag = new Map<string, string>();
const aanroepen: { basis: string | null; weergave: string }[] = [];
let serverTijd = 0;

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
  // Een server die de basis controleert zoals `wijzigRij()` dat doet.
  bewaarAccountVoorkeur: vi.fn(
    async (_u: string, voorkeur: { weergave: string }, basis: string | null) => {
      aanroepen.push({ basis, weergave: voorkeur.weergave });
      await new Promise((r) => setTimeout(r, 1));
      const huidig = serverTijd === 0 ? null : `T${serverTijd}`;
      if (basis !== huidig) return { ok: false, reden: 'conflict' };
      serverTijd += 1;
      return { ok: true, voorkeur, bijgewerktOp: `T${serverTijd}` };
    },
  ),
}));

/**
 * De naad die de security-review van QS8-729 vond: twee keuzes in één sessie.
 *
 * IJKING (met de hand, 19-11-2026):
 *   A  `basis` weer als parameter van de aanroeper  => rood: 'de tweede keuze gebruikt de nieuwe basis'
 *   B  de keuzerij weghalen (parallel uitvoeren)    => rood: 'twee snelle keuzes'
 */
const licht = { ...STANDAARD_VOORKEUR, weergave: 'licht' as const };
const systeem = { ...STANDAARD_VOORKEUR, weergave: 'systeem' as const };
const kopie = () => parseLokaleKopie(opslag.get(LOKALE_SLEUTEL) ?? null);

beforeEach(() => {
  opslag.clear();
  aanroepen.length = 0;
  serverTijd = 0;
  vi.mocked(haalAccountVoorkeur).mockReset();
});

describe('kiesVoorkeur', () => {
  it('de tweede keuze gebruikt de basis die de eerste opleverde', async () => {
    await kiesVoorkeur('u1', licht);
    await kiesVoorkeur('u1', systeem);
    expect(aanroepen.map((a) => a.basis)).toEqual([null, 'T1']);
    expect(kopie()).toMatchObject({ voorkeur: systeem, basis: 'T2', wacht: false });
  });

  it('twee snelle keuzes: de laatste staat lokaal en op de server, zonder wachtende rest', async () => {
    await Promise.all([kiesVoorkeur('u1', licht), kiesVoorkeur('u1', systeem)]);
    expect(kopie()).toMatchObject({ voorkeur: systeem, wacht: false });
    expect(aanroepen.at(-1)?.weergave).toBe('systeem');
  });
});

describe('verzoenMetAccount', () => {
  it('negeert de onverzonden keuze van een andere gebruiker op dit toestel', async () => {
    opslag.set(
      LOKALE_SLEUTEL,
      JSON.stringify({ userId: 'ander', voorkeur: licht, basis: null, wacht: true }),
    );
    vi.mocked(haalAccountVoorkeur).mockResolvedValue(null);
    const uit = await verzoenMetAccount('u1');
    expect(uit.voorkeur).toEqual(STANDAARD_VOORKEUR);
    expect(aanroepen).toHaveLength(0);
  });
});
