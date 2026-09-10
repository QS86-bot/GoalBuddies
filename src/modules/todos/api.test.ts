import { beforeEach, describe, expect, it, vi } from 'vitest';

import { freezeNow, unfreezeNow } from '../../shared/time';

import { maakTaak, verzetTaak, zetAfgevinkt, type Taak } from './api';
import { VOLGORDE_MAX } from './todo-schemas';

/**
 * De datalaag van De Lijst — QS8-380.
 *
 * ⚠️ **De beloftes hier zijn drie naden en geen drie functies.**
 *
 *    1. *Een nieuwe taak komt onderaan.* Dat is een eigenschap van het geheel:
 *       `maakTaak()` leest het hoogste nummer en telt er één bij op. Rekent hij
 *       vanaf nul, dan werkt elke afzonderlijke aanroep en staat de lijst tóch
 *       in de verkeerde volgorde.
 *    2. *Een schrijfactie die nul rijen raakte, is een fout.* RLS filtert een
 *       taak van iemand anders weg **zonder foutcode**, dus `data === null` met
 *       `error === null` is de stand waarin het scherm "opgeslagen" zou melden
 *       bij een wijziging die nergens landde. Dat is QS8-314 in het klein.
 *    3. *Wisselen dat niets kan doen, zegt dat.* Twee taken met hetzelfde
 *       `order_index` zijn niet uit elkaar te halen; stil slagen geeft een knop
 *       die niets doet.
 *
 * ⚠️ **Waarom een stub en niet de lokale stack.** Deze module importeert
 *    `src/lib/supabase`, en die trekt React Native en AsyncStorage mee — dezelfde
 *    reden die boven `tests/rls/harness.ts` staat. Wat er in de échte database
 *    gebeurt, staat in `tests/rls/todo-lijst.test.ts`; wat er in de aanroep
 *    gebeurt, staat hier.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel:
 *
 *   A  `(laatste?.order_index ?? -1) + 1` -> `0`
 *      -> 2 rood: 'een nieuwe taak krijgt het hoogste nummer plus een' en de
 *         klemtest, die op dezelfde berekening leunt. Dat is geen dubbeling: B
 *         hieronder raakt alléén de klem, dus de twee zijn los te bewegen.
 *   B  de klem op `VOLGORDE_MAX` weghalen
 *      -> 1 rood: 'klemt het volgnummer op de CHECK van 0246'
 *   C  de `data === null`-tak uit `naSchrijf()` halen
 *      -> 1 rood: 'een PATCH die nul rijen raakte, meldt geen succes'
 *   D  de gelijkheidstoets uit `verzetTaak()` halen
 *      -> 1 rood: 'wisselen van twee taken op dezelfde plek zegt dat het niets deed'
 */

/** Wat de stub de volgende keer teruggeeft, per soort aanroep. */
interface Antwoord {
  readonly data?: unknown;
  readonly error?: { readonly code?: string } | null;
  readonly count?: number;
}

let laatsteSelect: Antwoord = { data: null, error: null };
let laatsteSchrijf: Antwoord = { data: null, error: null };
const geschreven: { soort: string; waarde: unknown }[] = [];

/**
 * Een PostgREST-schil die de keten nabootst en onthoudt wat er geschreven werd.
 *
 * ⚠️ Elke methode geeft hetzelfde object terug, zodat `.select().eq().order()`
 *    net zo goed werkt als `.update().eq().select()`. De uitkomst hangt aan wát
 *    er is aangeroepen en niet aan de volgorde — dat is precies wat een test op
 *    de aanroep nodig heeft en niet meer dan dat.
 */
function keten(soort: 'select' | 'schrijf') {
  const antwoord = () => (soort === 'select' ? laatsteSelect : laatsteSchrijf);

  const schil: Record<string, unknown> = {
    then: (los: (w: Antwoord) => unknown) => Promise.resolve(antwoord()).then(los),
    maybeSingle: () => Promise.resolve(antwoord()),
    single: () => Promise.resolve(antwoord()),
  };

  for (const naam of ['select', 'eq', 'order', 'limit', 'range']) {
    schil[naam] = () => schil;
  }
  return schil;
}

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({
    from: () => ({
      select: () => keten('select'),
      insert: (waarde: unknown) => {
        geschreven.push({ soort: 'insert', waarde });
        return keten('schrijf');
      },
      update: (waarde: unknown) => {
        geschreven.push({ soort: 'update', waarde });
        return keten('schrijf');
      },
      delete: () => keten('schrijf'),
    }),
  }),
}));

vi.mock('../../lib/observability', () => ({ reportError: () => undefined }));

const TAAK: Taak = {
  id: 'taak-1',
  body: 'Bellen met de tandarts',
  done_at: null,
  order_index: 3,
  created_at: '2026-09-09T08:00:00.000Z',
};

beforeEach(() => {
  geschreven.length = 0;
  laatsteSelect = { data: null, error: null };
  laatsteSchrijf = { data: TAAK, error: null };
});

describe('een nieuwe taak komt onderaan', () => {
  it('een nieuwe taak krijgt het hoogste nummer plus een', async () => {
    laatsteSelect = { data: { order_index: 41 }, error: null };

    await maakTaak('gebruiker-1', { body: 'Nog iets' });

    expect(geschreven[0]?.waarde).toMatchObject({ order_index: 42 });
  });

  it('de eerste taak van een lege lijst staat op nul', async () => {
    laatsteSelect = { data: null, error: null };

    await maakTaak('gebruiker-1', { body: 'De eerste' });

    expect(geschreven[0]?.waarde).toMatchObject({ order_index: 0 });
  });

  /**
   * ⚠️ Zonder deze klem weigert de database de taak van iemand die precies op de
   *    grens staat, met een `23514` waar hij niets aan kan doen. Bovenaan komen
   *    te staan is de zachtere fout van de twee.
   */
  it('klemt het volgnummer op de CHECK van 0246', async () => {
    laatsteSelect = { data: { order_index: VOLGORDE_MAX }, error: null };

    await maakTaak('gebruiker-1', { body: 'De laatste' });

    expect(geschreven[0]?.waarde).toMatchObject({ order_index: VOLGORDE_MAX });
  });

  it('MUST-DENY: een lege taak komt niet langs het schema', async () => {
    const uit = await maakTaak('gebruiker-1', { body: '   ' });

    expect(uit.ok).toBe(false);
    expect(geschreven, 'er is een verzoek de deur uit gegaan').toEqual([]);
  });
});

describe('een schrijfactie die niets raakte, is een fout', () => {
  it('een PATCH die nul rijen raakte, meldt geen succes', async () => {
    laatsteSchrijf = { data: null, error: null };

    const uit = await zetAfgevinkt('taak-1', true);

    expect(uit.ok, 'RLS filtert zonder foutcode; nul rijen mag geen succes heten').toBe(false);
  });

  it('MUST-ALLOW: een geraakte rij komt gewoon terug', async () => {
    const uit = await zetAfgevinkt('taak-1', true);

    expect(uit.ok).toBe(true);
  });

  /** ⚠️ De klok bevroren, want anders hangt deze test aan de machine. */
  it('afvinken zet de tijd en ontvinken zet hem terug op null', async () => {
    const herstel = freezeNow(new Date('2026-09-09T10:00:00.000Z'));

    await zetAfgevinkt('taak-1', true);
    expect(geschreven[0]?.waarde).toEqual({ done_at: '2026-09-09T10:00:00.000Z' });

    await zetAfgevinkt('taak-1', false);
    expect(geschreven[1]?.waarde).toEqual({ done_at: null });

    herstel();
    unfreezeNow();
  });
});

describe('wisselen', () => {
  it('wisselt de twee volgnummers om', async () => {
    const uit = await verzetTaak(TAAK, { ...TAAK, id: 'taak-2', order_index: 7 });

    expect(uit.ok).toBe(true);
    expect(geschreven.map((g) => g.waarde)).toEqual([{ order_index: 7 }, { order_index: 3 }]);
  });

  it('wisselen van twee taken op dezelfde plek zegt dat het niets deed', async () => {
    const uit = await verzetTaak(TAAK, { ...TAAK, id: 'taak-2' });

    expect(uit.ok, 'stil slagen geeft een knop die niets doet').toBe(false);
    expect(geschreven, 'er is toch geschreven').toEqual([]);
  });
});
