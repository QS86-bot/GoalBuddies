/**
 * De belofte: **een document boven de grens wordt geweigerd zonder dat de bytes
 * gelezen worden, en de gebruiker leest dezelfde zin als altijd** — QS8-431.
 *
 * ⚠️⚠️ **Dit is de naad en niet het onderdeel.** Er zijn twee poorten voor
 *    dezelfde grens: `teGroot()` in de kiezer, vóór het lezen, en
 *    `keurChatdoc()` in de datalaag, ná het lezen. Elk van de twee is los
 *    triviaal juist. Wat kapot kan gaan is het gehéél:
 *
 *    - ze klappen om op een ánder getal (dan is er een bestand dat de ene
 *      weigert en de andere doorlaat);
 *    - ze geven een ándere melding (dan ziet de gebruiker twee teksten voor
 *      dezelfde zaak — precies wat criterium 3 van het issue verbiedt);
 *    - de poort staat ná het lezen in plaats van ervóór (dan is hij er wel en
 *      doet hij niets, want de 500 MB is dan al binnen).
 *
 *    De derde is de reden dat deze suite `fetch` telt in plaats van alleen de
 *    uitkomst te lezen. **Een test die alleen op `soort: 'fout'` toetst, blijft
 *    groen als iemand de poort onder `leesBestand()` schuift** — en dan bewaakt
 *    hij niets van wat dit issue beloofde.
 *
 * 📏 **De ijking — één mutatie per grendel, alle vijf met de hand rood gezien
 *    op 12-09-2026, met vooraf gemeten 9 groen.**
 *
 *    | Mutatie | Wat er brak | Wat er rood werd |
 *    |---|---|---|
 *    | A | de poort weg uit `kiesDocument()` | 3 — de twee leestellingen en de zin |
 *    | B | de poort ná `leesBestand()` gezet | **2 — alleen de leestellingen**; de uitkomst bleef juist |
 *    | C | `>` naar `>=` in `teGroot()` | 2 — "precies op de grens" en de naadtest |
 *    | D | de sleutel naar `chatdoc.kiezen_mislukt` | 3 — waaronder "dezelfde zin als de keuring erachter" |
 *    | E | de aanroeper typt `5_242_880` in plaats van de constante | **1 — alleen de bronzeef** |
 *
 *    ⚠️ **B is de mutatie die ertoe doet.** Dat is de vorm die je in het echt
 *       krijgt: de poort bestáát, de uitkomst klopt, en hij komt te laat. A en B
 *       samen zijn de reden dat deze suite de leesactie telt en niet alleen het
 *       antwoord leest.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { CHATDOC_MAX_BYTES, keurChatdoc } from '../../src/modules/buddies/chatdoc';
import { t } from '../../src/shared/i18n';

/**
 * ⚠️ De kiezer is per test te sturen, en dat moet via `vi.hoisted()`: `vi.mock`
 *    wordt naar boven getild, dus een gewone `let` hierboven bestaat nog niet
 *    wanneer de fabriek draait.
 */
const kiezer = vi.hoisted(() => ({ resultaat: null as unknown }));

vi.mock('expo-document-picker', () => ({
  getDocumentAsync: async () => kiezer.resultaat,
}));

// `chatdoc.ts` trekt de datalaag mee; die hoort hier niets te doen.
vi.mock('../../src/lib/supabase', () => ({
  supabase: () => {
    throw new Error('deze suite praat niet met de database');
  },
}));

const { kiesDocument, teGroot } = await import('../../src/shared/kiezers/kiesDocument');

/** Hoe vaak de bytes daadwerkelijk van schijf gehaald zijn. */
let gelezen = 0;

/** Eén gekozen bestand, met of zonder `size`. */
function gekozen(size: number | undefined) {
  return {
    canceled: false,
    assets: [{ uri: 'file:///tmp/verslag.pdf', name: 'verslag.pdf', mimeType: 'application/pdf', size, lastModified: 0 }],
  };
}

beforeEach(() => {
  gelezen = 0;
  vi.stubGlobal('fetch', async () => {
    gelezen += 1;
    return { arrayBuffer: async () => new ArrayBuffer(8) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe('de poort staat vóór het lezen', () => {
  it('weigert zonder de bytes te lezen', async () => {
    kiezer.resultaat = gekozen(CHATDOC_MAX_BYTES + 1);
    const keuze = await kiesDocument(CHATDOC_MAX_BYTES);

    expect(keuze).toEqual({ soort: 'fout', sleutel: 'chatdoc.te_groot' });
    expect(gelezen, 'de bytes zijn tóch gelezen — dan doet de poort niets').toBe(0);
  });

  /**
   * ⚠️ 500 MB is het geval uit het issue, en het is niet hetzelfde geval als
   *    "één byte te groot": een grens die met een `number` werkt kan op een
   *    grote waarde anders uitpakken dan op een kleine.
   */
  it('ook bij een bestand van een halve gigabyte', async () => {
    kiezer.resultaat = gekozen(500 * 1024 * 1024);
    const keuze = await kiesDocument(CHATDOC_MAX_BYTES);

    expect(keuze).toEqual({ soort: 'fout', sleutel: 'chatdoc.te_groot' });
    expect(gelezen).toBe(0);
  });

  it('precies op de grens mag door, en wordt dus gelezen', async () => {
    kiezer.resultaat = gekozen(CHATDOC_MAX_BYTES);
    const keuze = await kiesDocument(CHATDOC_MAX_BYTES);

    expect(keuze.soort).toBe('gekozen');
    expect(gelezen).toBe(1);
  });
});

describe('zonder `size` gedraagt de kiezer zich precies als vóór QS8-431', () => {
  /**
   * ⚠️⚠️ **`size` is optioneel** (`size?: number` in
   *    `node_modules/expo-document-picker/build/types.d.ts`). Dit is de helft
   *    die een controle net zo hard nodig heeft als de vorige: een poort die
   *    dichtslaat op een ontbrekend getal, weigert bestanden waar niets mis mee
   *    is — en dat is de vorm waarmee een grendel zichzelf om zeep helpt.
   */
  it('leest het bestand en geeft het terug', async () => {
    kiezer.resultaat = gekozen(undefined);
    const keuze = await kiesDocument(CHATDOC_MAX_BYTES);

    expect(keuze.soort).toBe('gekozen');
    expect(gelezen).toBe(1);
  });

  it('en de keuring erachter vangt hem dan alsnog', () => {
    // De kiezer liet hem door bij gebrek aan `size`; `keurChatdoc()` ziet de
    // échte byteLength. Dát is de grens die telt — de poort is een extra.
    expect(keurChatdoc(CHATDOC_MAX_BYTES + 1, 'application/pdf', 'verslag.pdf')).toBe(
      t('chatdoc.te_groot'),
    );
  });

  it('afbreken blijft afbreken, zonder lezen', async () => {
    kiezer.resultaat = { canceled: true, assets: null };
    expect(await kiesDocument(CHATDOC_MAX_BYTES)).toEqual({ soort: 'afgebroken' });
    expect(gelezen).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('de twee poorten zeggen hetzelfde', () => {
  /**
   * ⚠️⚠️ **Dit is de naadtest en de reden dat deze suite bestaat.** Beide
   *    poorten krijgen hier dezelfde getallen en de échte `CHATDOC_MAX_BYTES`,
   *    en moeten op hetzelfde getal omklappen. Zou iemand er één verplaatsen of
   *    een eigen constante geven, dan wijkt precies één rij af.
   */
  it('klappen om op hetzelfde getal', () => {
    for (const n of [0, 1, CHATDOC_MAX_BYTES - 1, CHATDOC_MAX_BYTES, CHATDOC_MAX_BYTES + 1]) {
      const kiezerWeigert = teGroot(n, CHATDOC_MAX_BYTES);
      const keuringWeigert = keurChatdoc(n, 'application/pdf', 'verslag.pdf') !== null;
      expect(kiezerWeigert, `de poorten zijn het oneens bij ${n} bytes`).toBe(keuringWeigert);
    }
  });

  it('dezelfde zin als de keuring erachter', async () => {
    kiezer.resultaat = gekozen(CHATDOC_MAX_BYTES + 1);
    const keuze = await kiesDocument(CHATDOC_MAX_BYTES);
    if (keuze.soort !== 'fout') throw new Error('verwachtte een fout');

    expect(t(keuze.sleutel)).toBe(
      keurChatdoc(CHATDOC_MAX_BYTES + 1, 'application/pdf', 'verslag.pdf'),
    );
  });
});

// ---------------------------------------------------------------------------

/**
 * ⚠️⚠️ **De helft van de naad die geen runtime-oppervlak heeft.** Alle tests
 *    hierboven geven de grens zélf mee, dus ze blijven groen als een tweede
 *    aanroeper er `5_242_880` intypt of — erger — een eigen getal. Dan staat
 *    dezelfde grens op twee plekken, en die twee lopen uit elkaar; dat is de
 *    klasse die dit project het vaakst geld kost.
 *
 * ⚠️ **Dit is met opzet een bronzeef en dat is een concessie.** Regel 18 vraag 4
 *    waarschuwt ervoor: een test die naar een plek grijpt, verhuist niet mee.
 *    Wat hem hier draaglijk maakt is dat hij niet naar één bestand kijkt maar
 *    naar **elke** aanroep in de hele boom — verhuist de aanroep, dan reist de
 *    eis mee. De belofte is "niemand verzint zijn eigen grens", en die heeft
 *    geen andere vorm: TypeScript kent `number` en niet "dít getal".
 */
const WORTEL = new URL('../..', import.meta.url).pathname;

function bronbestanden(map: string): string[] {
  const uit: string[] = [];
  const loop = (pad: string) => {
    for (const naam of readdirSync(join(WORTEL, pad))) {
      const kind = `${pad}/${naam}`;
      if (naam === 'node_modules' || naam.startsWith('.')) continue;
      if (statSync(join(WORTEL, kind)).isDirectory()) loop(kind);
      else if (/\.tsx?$/.test(naam)) uit.push(kind);
    }
  };
  loop(map);
  return uit;
}

/** Zonder commentaar, zodat een uitleg over de aanroep niet als aanroep telt. */
function zonderCommentaar(bron: string): string {
  return bron
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((regel) => !regel.trimStart().startsWith('//'))
    .join('\n');
}

describe('niemand verzint zijn eigen grens', () => {
  it('elke aanroep van kiesDocument geeft CHATDOC_MAX_BYTES mee', () => {
    const aanroepen: { bron: string; argument: string }[] = [];

    for (const pad of [...bronbestanden('src'), ...bronbestanden('app')]) {
      // Het bestand dat de functie definieert, roept hem niet aan.
      if (pad.endsWith('/kiesDocument.ts')) continue;
      const bron = zonderCommentaar(readFileSync(join(WORTEL, pad), 'utf8'));
      for (const m of bron.matchAll(/(?<![a-zA-Z0-9_])kiesDocument\s*\(([^)]*)\)/g)) {
        aanroepen.push({ bron: pad, argument: (m[1] ?? '').trim() });
      }
    }

    expect(aanroepen.length, 'geen enkele aanroep gevonden — dan meet deze zeef niets').toBeGreaterThan(0);
    for (const { bron, argument } of aanroepen) {
      expect(argument, `${bron} geeft een eigen grens mee in plaats van CHATDOC_MAX_BYTES`).toBe(
        'CHATDOC_MAX_BYTES',
      );
    }
  });
});
