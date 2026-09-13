/**
 * De belofte: **een bijlage kiezen valt nooit stil.** Hij komt terug met bytes of
 * met een melding, hij komt altijd terug, en zolang hij bezig is ziet de gebruiker
 * dat — QS8-444.
 *
 * ⚠️⚠️ **Dit is de naad en niet het onderdeel.** Drie stukken die elk los juist
 *    zijn: `leesBestand()` haalt bytes op, `useChatbijlage()` vertaalt de uitkomst
 *    naar een zin, en `Bijlageknoppen` tekent de knop. Wat kapot kan gaan is het
 *    gehéél, en het is elke keer dezelfde vorm — **er komt geen antwoord**:
 *
 *    - de `fetch` heeft geen tijdgrens, dus een `content:`-URI die uit de cloud
 *      moet komen hangt tot de app weggegooid wordt;
 *    - de afbreking wordt `afgebroken` in plaats van `fout`, en dán is er een
 *      tijdgrens maar leest de gebruiker nog steeds niets — afbreken is met opzet
 *      stil (*"wie de kiezer wegklikt, wil geen melding"*);
 *    - de vlag wordt gezet en op één uitgang niet vrijgegeven, en dan is de knop
 *      voor de rest van het gesprek dood;
 *    - de vlag klopt en bereikt de knop niet.
 *
 *    De tweede is de gevaarlijkste, want daar is élk onderdeel af: de timeout
 *    bestáát, hij vuurt, en de belofte breekt alsnog.
 *
 * ⚠️⚠️ **Waarom de tijdgrens niet uitgewacht wordt maar `AbortSignal.timeout`
 *    zelf bespied.** 📏 Gemeten op 13-09-2026: `vi.useFakeTimers()` drijft
 *    `AbortSignal.timeout()` **niet** — na `advanceTimersByTimeAsync(31_000)` bleef
 *    `signal.aborted` op `false`, want Node hangt die aan een eigen timer en niet
 *    aan `setTimeout`. Dertig seconden echt wachten kan niet in een suite.
 *
 *    De spion lost allebei de helften op: hij legt vast dát de code
 *    `AbortSignal.timeout()` aanroept — een `new AbortController().signal` zou hier
 *    dus opvallen, en dát is de vorm die er als een timeout uitziet en nooit vuurt —
 *    en hij geeft een signaal van vijf milliseconden terug, zodat het afbreekpad er
 *    in échte tijd doorheen loopt.
 *
 * ⚠️ **Wat hier bewust níet getoetst wordt: dat de grens precies 30.000 is.** Die
 *    assertie zou zijn verwachting uit dezelfde module halen die hij controleert en
 *    kan dus nooit iets vinden. Wat wél getoetst wordt zijn de eigenschappen die een
 *    tijdgrens tot een tijdgrens maken: eindig, en groter dan nul. `Infinity`, `0`,
 *    `NaN` en een ontbrekend argument zijn alle vier manieren waarop "er staat een
 *    timeout" in de praktijk "er staat geen timeout" betekent.
 *
 * 📏 **De ijking — één mutatie per grendel, alle acht met de hand rood gezien op
 *    13-09-2026, met vooraf gemeten 9 groen in dit bestand.**
 *
 *    | Mutatie | Wat er brak | Wat er rood werd |
 *    |---|---|---|
 *    | A | het `signal` weg uit de `fetch` | 2 — de grensvraag, en de hangtest liep in de runnerlimiet |
 *    | B | `LEES_TIMEOUT_MS` naar `Infinity` | 1 — alleen de grensvraag |
 *    | C | de afbreking geeft `afgebroken` terug | 2 — waaronder de bijna-treffer |
 *    | D | de `finally` eruit in `bezetTijdens()` | **1 — alleen de worptest** |
 *    | E | de vlag pas ná het werk gezet | 1 — de volgordetest |
 *    | F | de `busy` weg bij de documentknop | 1 — de schermzeef |
 *    | G | `new AbortController().signal` in plaats van de tijdgrens | 2 — als bij A |
 *    | H | `kies()` leest rechtstreeks, buiten `bezetTijdens()` om | 1 — de hookzeef |
 *
 *    ⚠️ **A, D en H zijn ná het splitsen van `useChatbijlage()` opnieuw gedraaid**,
 *       want de code verhuisde nadat de eerste ijking al gedaan was — en bij een
 *       verhuizing blijven tests groen op wat er in het bestand staat in plaats van
 *       op wat het bestand beloofde.
 *
 *    ⚠️ **G is de mutatie die ertoe doet.** Dat is de vorm die je in het echt
 *       krijgt: er stáát een `signal`, de code leest als bewaakt, en hij vuurt
 *       nooit. Een assertie op "`signal` is niet `undefined`" had hem doorgelaten;
 *       de spion op `AbortSignal.timeout` niet. A en G samen zijn de reden dat deze
 *       suite de aanroep bespiedt in plaats van het argument te bekijken.
 *
 *    Uitleg in
 *    `docs/decisions/2026-09-13-een-belofte-die-stilvalt-is-erger-dan-een-die-dichtslaat.md`.
 */
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { zonderCommentaar } from './roept-aan';

const kiezer = vi.hoisted(() => ({ resultaat: null as unknown }));

vi.mock('expo-document-picker', () => ({
  getDocumentAsync: async () => kiezer.resultaat,
}));

/**
 * ⚠️⚠️ **Ook de fotokiezer, en dat is geen overdaad.** `useChatbijlage.ts`
 *    importeert de barrel `shared/kiezers`, en die trekt `kiesFoto.ts` mee — dus
 *    `expo-image-picker`. 📏 Zonder deze schil valt de hele suite om op
 *    `ReferenceError: __DEV__ is not defined`, precies het geval dat in de kop van
 *    `kiesDocument.ts` staat. Deze suite raakt de fotokant niet aan; hij moet hem
 *    alleen kunnen importeren.
 */
vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: async () => ({ canceled: true, assets: null }),
  requestMediaLibraryPermissionsAsync: async () => ({ granted: false }),
}));

// `useChatbijlage.ts` trekt via `chatdoc.ts` de datalaag mee; die hoort hier niets
// te doen. Zelfde schil en zelfde reden als in de suite van QS8-431.
vi.mock('../../src/lib/supabase', () => ({
  supabase: () => {
    throw new Error('deze suite praat niet met de database');
  },
}));

const { kiesDocument } = await import('../../src/shared/kiezers/kiesDocument');
const { bezetTijdens } = await import('../../src/modules/buddies/useChatbijlage');

function gekozen() {
  return {
    canceled: false,
    assets: [
      {
        uri: 'file:///tmp/verslag.pdf',
        name: 'verslag.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        lastModified: 0,
      },
    ],
  };
}

/**
 * Wat `kiesDocument()` aan `AbortSignal.timeout()` vroeg, en een signaal dat in
 * vijf milliseconden echt afbreekt zodat het pad erdoorheen loopt.
 */
function spiedDeTijdgrens(): { gevraagd: number[] } {
  const gevraagd: number[] = [];

  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    gevraagd.push(ms);
    const beheerder = new AbortController();
    setTimeout(() => beheerder.abort(new DOMException('afgebroken', 'TimeoutError')), 5);
    return beheerder.signal;
  });

  return { gevraagd };
}

beforeEach(() => {
  kiezer.resultaat = gekozen();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('het lezen heeft een tijdgrens en die is er een', () => {
  it('vraagt er een aan `AbortSignal.timeout`, eindig en groter dan nul', async () => {
    const { gevraagd } = spiedDeTijdgrens();
    vi.stubGlobal('fetch', async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));

    await kiesDocument(5_242_880);

    expect(gevraagd, 'het lezen vroeg geen tijdgrens aan — dan is er geen').toHaveLength(1);
    const grens = gevraagd[0] as number;
    expect(Number.isFinite(grens), `een grens van ${grens} is geen grens`).toBe(true);
    expect(grens).toBeGreaterThan(0);
  });

  /**
   * ⚠️⚠️ **De kern.** Een `fetch` die nooit antwoordt — precies de
   *    iCloud-placeholder uit het issue. Zonder de tijdgrens zou deze test niet
   *    falen maar hángen, en dát is de uitkomst voor de gebruiker.
   */
  it('een lezing die nooit antwoordt eindigt tóch, en als een melding', async () => {
    spiedDeTijdgrens();
    vi.stubGlobal('fetch', (_uri: string, opties?: { signal?: AbortSignal }) => {
      return new Promise((_vervul, verwerp) => {
        opties?.signal?.addEventListener('abort', () => verwerp(opties.signal?.reason));
      });
    });

    const keuze = await kiesDocument(5_242_880);

    expect(keuze).toEqual({ soort: 'fout', sleutel: 'chatdoc.kiezen_mislukt' });
  });

  /**
   * ⚠️⚠️ **De gevaarlijke bijna-treffer.** `afgebroken` is met opzet stil, dus een
   *    afbreking die daarin belandt geeft de gebruiker nog steeds niets te lezen —
   *    mét een werkende timeout. Daarom staat dit er los van de assertie hierboven.
   */
  it('en die uitkomst is nooit `afgebroken`, want dat toont niets', async () => {
    spiedDeTijdgrens();
    vi.stubGlobal('fetch', async () => {
      throw new DOMException('afgebroken', 'TimeoutError');
    });

    const keuze = await kiesDocument(5_242_880);

    expect(keuze.soort, 'een afbreking die stil blijft is precies het gat').not.toBe('afgebroken');
    expect(keuze.soort).toBe('fout');
  });
});

// ---------------------------------------------------------------------------

/**
 * ⚠️⚠️ **`bezetTijdens()` en niet de hook, en dat is een gemeten beperking.** Deze
 *    repo heeft geen renderer in de testrunner — geen `@testing-library/react`, geen
 *    `react-test-renderer` — dus een `useState` binnen `useChatbijlage()` is niet
 *    aan te roepen. Wat er van de belofte overblijft is precies de eigenschap die
 *    kapot kan: dat de vlag hoe dan ook weer vrijkomt. Die staat in een gewone
 *    functie en is dus wél te voeden.
 */
describe('de knop komt altijd weer vrij', () => {
  it('na werk dat normaal eindigt', async () => {
    const zetten: (string | null)[] = [];
    await bezetTijdens<string>((w) => zetten.push(w), 'doc', async () => {});

    expect(zetten).toEqual(['doc', null]);
  });

  /**
   * ⚠️ De vorm uit de hook zelf: vier uitgangen, elk een `return` halverwege.
   *    Zonder `finally` mist er één en blijft de knop staan.
   */
  it('na werk dat halverwege terugkeert', async () => {
    const zetten: (string | null)[] = [];
    await bezetTijdens<string>(
      (w) => zetten.push(w),
      'foto',
      async () => {
        return;
      },
    );

    expect(zetten).toEqual(['foto', null]);
  });

  it('en ook als het werk een fout werpt', async () => {
    const zetten: (string | null)[] = [];
    await expect(
      bezetTijdens<string>((w) => zetten.push(w), 'doc', async () => {
        throw new Error('de kiezer viel om');
      }),
    ).rejects.toThrow('de kiezer viel om');

    expect(zetten, 'een worp laat de knop bezet achter').toEqual(['doc', null]);
  });

  it('zet hem vóór het werk en niet erna', async () => {
    const volgorde: string[] = [];
    await bezetTijdens<string>(
      (w) => volgorde.push(w === null ? 'vrij' : 'bezet'),
      'doc',
      async () => {
        volgorde.push('werk');
      },
    );

    expect(volgorde).toEqual(['bezet', 'werk', 'vrij']);
  });
});

// ---------------------------------------------------------------------------

/**
 * ⚠️⚠️ **De laatste schakel, en hij heeft geen runtime-oppervlak.** Een `bezig` die
 *    klopt en geen enkele knop bereikt, is regel 18 vraag 5 in het klein: elk
 *    schakeltje af, de keten onderbroken. Zonder renderer is een bronzeef de enige
 *    vorm — en de concessie van vraag 4 geldt: verhuist `Bijlageknoppen`, dan wijst
 *    dit pad nergens heen. Daarom faalt de zeef hard als het bestand er niet is, in
 *    plaats van groen te blijven op nul gevallen.
 */
const SCHERM = 'app/groep/chat/[id].tsx';
const HOOK = 'src/modules/buddies/useChatbijlage.ts';

describe('de laadstand bereikt allebei de knoppen', () => {
  it('elke kiesknop draagt een `busy` die van `keuze.bezig` komt', () => {
    const bron = zonderCommentaar(readFileSync(SCHERM, 'utf8'));

    for (const [knop, soort] of [
      ['kiesEenFoto', 'foto'],
      ['kiesEenDocument', 'doc'],
    ] as const) {
      expect(bron, `${SCHERM} roept ${knop} niet meer aan`).toContain(`keuze.${knop}()`);
      expect(bron, `de knop van ${knop} heeft geen laadstand`).toContain(
        `busy={keuze.bezig === '${soort}'}`,
      );
    }
  });

  /**
   * ⚠️⚠️ **De schakel in het midden, en die is er bij het splitsen bij gekomen.**
   *    `bezetTijdens()` is hierboven los getoetst en de knop leest `keuze.bezig` —
   *    maar dat de hook die twee daadwerkelijk aan elkaar knoopt, raakt geen van
   *    beide. Zou `kies()` zijn werk rechtstreeks doen in plaats van via
   *    `bezetTijdens()`, dan blijven alle elf andere gevallen groen en gebeurt er
   *    op het scherm weer niets zichtbaars. Regel 18 vraag 5 in het klein: elk
   *    schakeltje af, de keten onderbroken.
   */
  it('en de hook knoopt de vlag aan het lezen', () => {
    const bron = zonderCommentaar(readFileSync(HOOK, 'utf8'));

    expect(bron, 'het lezen loopt niet meer via `bezetTijdens()`').toMatch(
      /bezetTijdens\(\s*setBezig\s*,/,
    );
    expect(bron, 'de hook geeft `bezig` niet terug').toMatch(/^\s*bezig,$/m);
  });
});
