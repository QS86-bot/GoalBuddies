import { beforeEach, describe, expect, it, vi } from 'vitest';

import { freezeNow, unfreezeNow } from '../../shared/time';

import { fetchTaken, maakTaak, verzetTaak, zetAfgevinkt, zetTekst, type Taak } from './api';
import { TAAK_MAX, VOLGORDE_MAX } from './todo-schemas';

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
 *   E  `eq('user_id', userId)` uit `fetchTaken()` halen
 *      -> 1 rood: 'haalt precies de taken van de opgegeven gebruiker op'
 *
 * IJKING — QS8-386, met de hand gedraaid op 10-09-2026:
 *
 *   F  `gevalideerd.data.body ?? tekst.trim()` -> `tekst` in `zetTekst()`
 *      -> 1 rood: 'slaat op wat hij gemeten heeft en niet de rauwe invoer'
 *   G  `taakTekst` in `taakPatchSchema.body` vervangen door `z.string()`
 *      -> **3 rood**: beide MUST-DENY's én de naadtest. ⚠️ Dat waren er meer dan
 *         voorspeld, en de reden is het opschrijven waard: `taakTekst` doet
 *         `.trim()` én de twee grenzen. Een kale `z.string()` haalt ze alle drie
 *         weg, dus de naadtest valt hier mee om — de rauwe invoer *is* dan wat
 *         het schema teruggeeft. Mutatie F beweegt die naad wél los, dus de twee
 *         zijn nog steeds uit elkaar te houden.
 *   H  `telTekens(tekst)` in `taakTekst` -> `tekst.length`
 *      -> 1 rood: 'MUST-ALLOW: 500 emoji zijn 500 tekens en geen 1000'. Alleen
 *         die ene, en dat is de bedoeling: dit is de énige test die meet in
 *         wélke eenheid geteld wordt.
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
/** Elke `.eq(kolom, waarde)` die langskomt, in volgorde. */
const gefilterd: { kolom: unknown; waarde: unknown }[] = [];

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

  for (const naam of ['select', 'order', 'limit', 'range']) {
    schil[naam] = () => schil;
  }
  schil['eq'] = (kolom: unknown, waarde: unknown) => {
    gefilterd.push({ kolom, waarde });
    return schil;
  };
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
  visibility: 'private',
  shared_group_id: null,
};

beforeEach(() => {
  geschreven.length = 0;
  gefilterd.length = 0;
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

describe('een taak hernoemen — QS8-386', () => {
  /**
   * ⚠️ **De naad, en niet de functie.** `taakTekst` doet `.trim()` vóór het
   *    tellen, dus de string die gemeten is en de string die opgeslagen wordt
   *    móeten dezelfde zijn. Schrijft `zetTekst()` de rauwe invoer weg, dan
   *    keurt de client een taak van 500 tekens plus spaties goed en weigert
   *    `char_length(btrim(body))` in 0246 hem — een `23514` waar de gebruiker
   *    niets aan kan doen, op een veld dat groen stond.
   */
  it('slaat op wat hij gemeten heeft en niet de rauwe invoer', async () => {
    await zetTekst('taak-1', '  Bellen met de tandarts  ');

    expect(
      geschreven[0]?.waarde,
      'gemeten en opgeslagen moeten dezelfde string zijn',
    ).toEqual({ body: 'Bellen met de tandarts' });
  });

  it('MUST-DENY: een lege tekst gaat de deur niet uit', async () => {
    const uit = await zetTekst('taak-1', '   ');

    expect(uit.ok).toBe(false);
    expect(geschreven, 'er is een verzoek de deur uit gegaan').toEqual([]);
  });

  /**
   * ⚠️ **De grens telt codepunten en geen UTF-16-eenheden** — CLAUDE.md, Emoji,
   *    en QS8-118. Een emoji kost twee UTF-16-eenheden en één codepunt, dus
   *    `.length` zou hier 1000 zien en weigeren wat `char_length` op 500 telt en
   *    doorlaat. De gebruiker krijgt dan een grens te zien die de database niet
   *    stelt.
   */
  it('MUST-ALLOW: 500 emoji zijn 500 tekens en geen 1000', async () => {
    const emoji = '\u{1F600}'.repeat(TAAK_MAX);

    const uit = await zetTekst('taak-1', emoji);

    expect(uit.ok, 'de client weigert wat de database doorlaat').toBe(true);
    expect(geschreven[0]?.waarde).toEqual({ body: emoji });
  });

  it('MUST-DENY: een codepunt te veel gaat er niet doorheen', async () => {
    const uit = await zetTekst('taak-1', 'a'.repeat(TAAK_MAX + 1));

    expect(uit.ok).toBe(false);
    expect(geschreven).toEqual([]);
  });

  /** ⚠️ Dezelfde stille terugzetting als bij afvinken — zie `naSchrijf()`. */
  it('een hernoeming die nul rijen raakte, meldt geen succes', async () => {
    laatsteSchrijf = { data: null, error: null };

    const uit = await zetTekst('taak-1', 'Iets anders');

    expect(uit.ok).toBe(false);
  });
});

describe('je eigen lijst is je eigen lijst', () => {
  /**
   * ⚠️⚠️ **`eq('user_id', …)` in `fetchTaken()` was er voor de index en is sinds
   *    0248 dragend, en dat verschil stond nergens onder test.** Tot dat moment
   *    was `todo_items` eigenaar-only: de policy gaf je precies je eigen rijen,
   *    dus de filter versnelde alleen. Sinds De Lijst deelbaar is, geeft
   *    `todo_items_select` je óók de gedeelde taken van je groepsgenoten.
   *
   * 📏 Gemeten op de gedeployde stand, als Bob zonder die filter:
   *    `ALICE deelt dit | bob eigen taak`. Haalt iemand hem weg bij een refactor,
   *    dan staan andermans taken tússen je eigen taken, telt `count: 'exact'` ze
   *    mee en mikt `verzetTaak()` op een buurtaak van een ander.
   *
   * ⚠️ **Dit is regel 18 vraag 4 aan de andere kant.** De belofte verhuisde niet
   *    en de tekst eromheen ook niet — de wereld eronder veranderde. Het
   *    commentaar bij `fetchTaken()` zei nog *"verandert de snelheid en niet de
   *    grens"*, en dat is precies de zin die iemand overtuigt hem weg te halen.
   *    Een onjuiste aantekening bij een grendel is gevaarlijker dan geen.
   */
  it('haalt precies de taken van de opgegeven gebruiker op', async () => {
    laatsteSelect = { data: [], error: null, count: 0 };

    await fetchTaken('gebruiker-1');

    expect(
      gefilterd,
      'zonder deze filter komen de gedeelde taken van groepsgenoten in je eigen lijst',
    ).toContainEqual({ kolom: 'user_id', waarde: 'gebruiker-1' });
  });
});
