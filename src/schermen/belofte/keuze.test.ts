import { describe, expect, it, vi } from 'vitest';

import type { TimeZone } from '@/shared/time';

// `keuze.ts` haalt de pure functies via de rand van de module, en die trekt de
// client mee; die raakt deze test niet.
vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }));
vi.mock('@/lib/observability', () => ({ reportError: () => undefined }));

const { BEGIN, gekozenGetuige, naarBevestigen, soortVan } = await import('./keuze');
const { commitmentSchema } = await import('@/modules/commitments');

/**
 * Niets voorgeselecteerd, en zonder bevestigstap geen verzending — QS8-761, criterium 2.
 *
 * Er is geen React-testbibliotheek in dit project; de toestand van het
 * formulier is daarom puur (`keuze.ts`), en `tests/beloftes/belofte-bevestigen.test.ts`
 * legt vast dat het scherm `gaWeekbelofteAan()` alleen vanuit de bevestigstap
 * aanroept.
 *
 * Ijking: `BEGIN` met `groepId: 'g1'` maakt de eerste toets rood; de
 * enige-kandidaat-regel van `Straf` (`enigeOfGekozen`) in `gekozenGetuige()`
 * maakt de tweede rood.
 */

const KLOK = { weekStartDay: 1 as const, tz: 'Europe/Amsterdam' as TimeZone };
const NU = new Date('2026-11-18T12:00:00Z');
const EEN_GROEP = { groepen: [{ id: 'g1', naam: 'Vrienden' }], getuigen: [] };
const BEIDE = { groepen: [{ id: 'g1', naam: 'Vrienden' }], getuigen: [{ id: 'p1', naam: 'Bob' }] };

describe('de keuze op het beloftescherm', () => {
  it('begint leeg: geen tekst, geen soort, geen groep, geen persoon', () => {
    expect(BEGIN).toEqual({ tekst: '', soort: null, groepId: null, persoonId: null });
  });

  it('kiest bij precies één kandidaat níet vanzelf die ene', () => {
    expect(gekozenGetuige({ ...BEGIN, tekst: 'Koffie voor iedereen' }, EEN_GROEP)).toBeNull();
    expect(naarBevestigen({ ...BEGIN, tekst: 'Koffie voor iedereen' }, EEN_GROEP, KLOK, NU)).toBeNull();
  });

  it('leidt alleen de soort af als er maar één soort is, en nooit bij twee', () => {
    expect(soortVan(BEGIN, EEN_GROEP)).toBe('groep');
    expect(soortVan(BEGIN, BEIDE)).toBeNull();
    expect(soortVan(BEGIN, { groepen: [], getuigen: [] })).toBeNull();
  });

  it('een groep als getuige heet "iedereen in" die groep, zodat de bevestigtekst zegt wie het leest', () => {
    expect(gekozenGetuige({ ...BEGIN, groepId: 'g1' }, EEN_GROEP)?.naam).toBe('iedereen in Vrienden');
  });

  it('geen bevestigstap zonder tekst, zonder getuige, of met een getuige die niet in de lijst staat', () => {
    expect(naarBevestigen({ ...BEGIN, soort: 'groep', groepId: 'g1' }, BEIDE, KLOK, NU)).toBeNull();
    expect(naarBevestigen({ ...BEGIN, tekst: 'Koffie', soort: 'groep' }, BEIDE, KLOK, NU)).toBeNull();
    expect(naarBevestigen({ ...BEGIN, tekst: 'Koffie', soort: 'persoon', persoonId: 'x' }, BEIDE, KLOK, NU)).toBeNull();
    expect(naarBevestigen({ ...BEGIN, tekst: 'Koffie', groepId: 'g1' }, BEIDE, KLOK, NU)).toBeNull();
  });

  it('de bevestigstap draagt de getuige met naam en de week van dát moment', () => {
    const stap = naarBevestigen(
      { tekst: '  Koffie voor iedereen ', soort: 'persoon', groepId: null, persoonId: 'p1' },
      BEIDE,
      KLOK,
      NU,
    );
    expect(stap).toEqual({
      tekst: 'Koffie voor iedereen',
      begunstigde: { soort: 'persoon', id: 'p1' },
      naam: 'Bob',
      periode: { start: '2026-11-16', laatsteDag: '2026-11-22' },
      korteWeek: false,
    });
  });

  it('wat de bevestigstap toont is wat het schema opslaat (QS8-507)', () => {
    const rauw = '  Koffie   voor\niedereen\u200b ';
    const stap = naarBevestigen({ ...BEGIN, tekst: rauw, soort: 'persoon', persoonId: 'p1' }, BEIDE, KLOK, NU);
    expect(stap?.tekst).toBe(commitmentSchema.parse({ body: rauw, image_url: null }).body);
  });
});
