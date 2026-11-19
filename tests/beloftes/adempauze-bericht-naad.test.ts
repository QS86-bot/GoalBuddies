/**
 * De belofte van QS8-753: **een adempauze inplannen en je groep laten weten zijn
 * twee losse handelingen, en het bericht is een gewoon chatbericht van jou.**
 *
 * ⚠️ **Waarom een naadtest.** `pauzeMetBericht()` is getest met losse stubs, en
 *    `planAdempauze()` en `stuurBericht()` hebben hun eigen tests. De belofte
 *    zit op de naad: dat de échte twee wrappers, aan elkaar geknoopt zoals het
 *    scherm doet, precies één `plan_adempauze`-RPC en daarna precies één insert op
 *    `chat_messages` geven — mét een gewone body en zonder `system_event`, met de
 *    tekst die de gebruiker overhield en niet met het voorstel. Dat een systeem-
 *    bericht een migratie vraagt (domeinregel 7) is hier het tegenbeeld: dit pad
 *    heeft er geen nodig, en elke kolom die hier bijkomt is dat gesprek weer.
 *
 * ⚠️ Er is geen renderer. De onderste helft leest daarom de bron van het scherm,
 *    op dezelfde manier als `tests/beloftes/een-foto-is-getekend-of-niets.test.ts`.
 */
import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { zonderCommentaar } from './roept-aan';

interface Aanroep {
  readonly soort: 'rpc' | 'insert';
  readonly naam: string;
  readonly rij?: Record<string, unknown>;
}

const log: Aanroep[] = [];
let rpcAntwoord: { data: unknown; error: unknown } = { data: { ok: true, id: 'p1' }, error: null };
let insertAntwoord: { data: { id: string } | null; error: unknown } = {
  data: { id: 'm1' },
  error: null,
};

vi.mock('../../src/lib/supabase', () => ({
  supabase: () => ({
    rpc: async (naam: string) => {
      log.push({ soort: 'rpc', naam });
      // `stuurBericht` vraagt na een weigering `berichten_over` (alleen lezen) om de melding te kiezen.
      return naam === 'plan_adempauze' ? rpcAntwoord : { data: false, error: null };
    },
    from: (tabel: string) => ({
      insert: (rij: Record<string, unknown>) => {
        log.push({ soort: 'insert', naam: tabel, rij });
        return { select: () => ({ single: async () => insertAntwoord }) };
      },
    }),
  }),
}));

vi.mock('../../src/lib/observability', () => ({ reportError: () => undefined }));

// ⚠️ Ná `vi.mock`, want die wordt omhooggehesen en deze imports niet.
const { planAdempauze } = await import('../../src/modules/goals/adempauze');
const { pauzeMetBericht } = await import('../../src/modules/goals/adempauze-bericht');
const { stuurBericht } = await import('../../src/modules/buddies/chat');
const { adempauzeBerichtVoorstel } = await import('../../src/shared/ui/adempauze-bericht');

const START = { startDate: '2026-12-07' } as Parameters<typeof planAdempauze>[1];
const EIND = { startDate: '2026-12-14' } as Parameters<typeof planAdempauze>[2];

/** Zoals `Adempauzes` in `app/doel/[id].tsx` de twee wrappers aan elkaar knoopt. */
function inplannen(bericht: { aan: boolean; groupId: string; tekst: string }) {
  return pauzeMetBericht(
    {
      plan: () => planAdempauze('doel-1', START, EIND),
      stuur: (groupId, tekst) => stuurBericht(groupId, 'gebruiker-1', tekst),
    },
    bericht,
  );
}

beforeEach(() => {
  log.length = 0;
  rpcAntwoord = { data: { ok: true, id: 'p1' }, error: null };
  insertAntwoord = { data: { id: 'm1' }, error: null };
});

describe('adempauze en bericht, met de echte wrappers', () => {
  it('bericht aan: eerst één plan_adempauze, dan één gewone insert met de aangepaste tekst', async () => {
    const aangepast = 'Ik ben twee weken weg, tot snel.';
    expect(aangepast).not.toBe(adempauzeBerichtVoorstel());

    const uitkomst = await inplannen({ aan: true, groupId: 'groep-1', tekst: `  ${aangepast} ` });

    expect(uitkomst.bericht).toBe('verstuurd');
    expect(log.map((a) => `${a.soort}:${a.naam}`)).toEqual([
      'rpc:plan_adempauze',
      'insert:chat_messages',
    ]);

    const rij = log[1]?.rij ?? {};
    expect(rij).toMatchObject({
      group_id: 'groep-1',
      sender_id: 'gebruiker-1',
      body: aangepast,
      type: 'text',
    });
    expect(rij.body).not.toBe(adempauzeBerichtVoorstel());
    expect(Object.keys(rij)).not.toContain('system_event');
    expect(rij.type).not.toBe('system');
  });

  it('bericht uit: wel de pauze, geen insert', async () => {
    const uitkomst = await inplannen({ aan: false, groupId: 'groep-1', tekst: 'Hoi' });

    expect(uitkomst.pauze.ok).toBe(true);
    expect(log.map((a) => a.soort)).toEqual(['rpc']);
  });

  it('plan geweigerd door de database: geen insert', async () => {
    rpcAntwoord = { data: { ok: false, reason: 'overlapt' }, error: null };

    const uitkomst = await inplannen({ aan: true, groupId: 'groep-1', tekst: 'Hoi' });

    expect(uitkomst.pauze.ok).toBe(false);
    expect(log.map((a) => a.soort)).toEqual(['rpc']);
  });

  it('insert faalt: de pauze blijft en er is geen tweede rpc (geen annuleren)', async () => {
    insertAntwoord = { data: null, error: { code: '42501' } };

    const uitkomst = await inplannen({ aan: true, groupId: 'groep-1', tekst: 'Hoi' });

    expect(uitkomst.pauze.ok).toBe(true);
    expect(typeof uitkomst.bericht).toBe('object');
    expect(log.filter((a) => a.naam === 'plan_adempauze')).toHaveLength(1);
    expect(log.filter((a) => a.naam === 'annuleer_adempauze')).toHaveLength(0);
    expect(log.some((a) => a.soort === 'insert' && a.naam !== 'chat_messages')).toBe(false);
  });
});

describe('het scherm knoopt de wrappers zo aan elkaar', () => {
  const bron = zonderCommentaar(readFileSync('app/doel/[id].tsx', 'utf8'));

  it('plant alleen via pauzeMetBericht, en verstuurt alleen via stuurBericht', () => {
    expect(bron.match(/planAdempauze\(/g)).toHaveLength(1);
    expect(bron).toMatch(/pauzeMetBericht\(\s*\{\s*plan:\s*\(\)\s*=>\s*planAdempauze\(/);
    expect(bron).toMatch(/stuurBericht\(groupId,\s*userId,\s*bericht\)/);
  });

  it('herlaadt pas ná de berichtstap, zodat de berichtfout het herladen overleeft', () => {
    const plan = bron.slice(bron.indexOf('async function plan()'));
    const volgorde = ['pauzeMetBericht(', 'bericht.verwerk(', 'onKlaar();'].map((s) => plan.indexOf(s));

    expect(volgorde.every((i) => i >= 0)).toBe(true);
    expect([...volgorde].sort((a, b) => a - b)).toEqual(volgorde);
  });

  it('zet het bericht nooit standaard aan', () => {
    expect(bron).toMatch(/const \[aan, setAan\] = useState\(false\)/);
  });

  it('plant een pauze die helemaal voorbij is nooit met bericht', () => {
    const plan = bron.slice(bron.indexOf('async function plan()'));
    expect(plan).toMatch(/aan:\s*bericht\.keuze\.aan\s*&&\s*berichtMagBij\(periode\.waarde,/);
    // En de stap zelf wordt dan ook niet getoond.
    expect(bron).toMatch(/\{berichtMag\s*&&\s*!bericht\.heeftFout\s*\?\s*\(\s*<AdempauzeBericht/);
  });

  it('laat lege tekst de groepseis vallen en blokkeert Inplannen met een hint', () => {
    expect(bron).toMatch(/wachtOpGroep:\s*aan\s*&&\s*gekozen === ''\s*&&\s*tekst\.trim\(\) !== ''/);
    expect(bron).toMatch(/accessibilityHint=\{[^}]*adempauze\.bericht_kies_eerst/);
  });
});
