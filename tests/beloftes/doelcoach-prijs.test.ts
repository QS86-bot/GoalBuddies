import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');
const DOELCOACH = join(WORTEL, 'supabase', 'functions', 'doelcoach', 'index.ts');

/**
 * Wat een AI-call kost, hoort bij het model dat hem deed — QS8-187.
 *
 * ⚠️ **De belofte is niet "er staat een prijs in de code".** De belofte is: *het
 *    bedrag waarmee `cost_cents` berekend wordt, is de lijstprijs van het model
 *    dat werkelijk aangeroepen is.* Dat is een eigenschap van een **paar**, en
 *    precies daar ging het mis.
 *
 * 📏 **Gemeten op 10-09-2026, en de vondst is de reden dat dit bestand bestaat.**
 *    `MODEL` stond op `claude-sonnet-5` en `PRIJS_PER_MTOK_CENT` op 300/1500.
 *    Volgens
 *    `platform.claude.com/docs/en/about-claude/models/overview.md` (diezelfde dag
 *    opgehaald) is Claude Sonnet 5 **$2 in / $10 uit per MTok** — 200/1000 cent.
 *    300/1500 is de prijs van Claude Sonnet **4.6**. Elke `cost_cents` sinds
 *    06-09-2026 stond dus **de helft te hoog**.
 *
 * ⚠️ **Wat dat kostte, is geen boekhoudkundige schoonheidsfout.** Sinds 0182
 *    hangt het dagbudget van een gebruiker aan dit bedrag
 *    (`ai_dag_budget_cent()` = `ai_dag_limiet() × ai_job_voorschot_cent()`), en
 *    een job die te duur geboekt wordt, eet dat budget te snel op. De gebruiker
 *    merkt dat als een AI-quotum dat eerder op is dan bedoeld.
 *
 * ⚠️ **Twee grendels, want ze bewaken twee verschillende dingen.**
 *
 *    1. **Hoort de prijs bij het model?** Dat is een typefout sinds QS8-187:
 *       `MODEL` draagt het sleuteltype van de prijstabel, dus een model zonder
 *       prijsregel komt `npm run edge:types:controle` niet door. 📏 Nagemeten
 *       door `MODEL` op `claude-opus-5` te zetten: `deno check` wordt rood.
 *    2. **Klopt het bedrag nog?** Dat kan geen typesysteem weten — het is een
 *       feit van buiten dit project. Dat staat hieronder, met de datum en de bron
 *       erbij, zodat er iets te hérzien valt in plaats van iets te geloven.
 *
 * ⚠️ **Waarom niet gewoon een datum in een commentaarregel.** Dat stond er, en
 *    dat is precies hoe het misging: *"loopt tot en met 31-08-2026; daarna wordt
 *    het 300/1500"*. Een zin die vanzelf onwaar wordt en waar niets rood van
 *    gaat, is geen grendel maar een aantekening. Zelfde vorm als QS8-293.
 *
 * IJKING — met de hand, 10-09-2026. Eén mutatie per grendel:
 *
 *   A  `MODEL` op `'claude-opus-5'` zetten (geen prijsregel)
 *      -> `npm run edge:types:controle` rood op regel 95. De test hieronder
 *         ('het aangeroepen model heeft een prijs') wordt daar óók rood van, en
 *         dat is de bedoeling: de typecheck vangt hem vóór de suite, de test
 *         vangt hem als iemand de typering versoepelt naar `string`.
 *   B  de prijs terugzetten op 300/1500
 *      -> 1 rood: 'de prijs is die van de gemeten lijstprijs'
 *   C  `PRIJS` weer loskoppelen van `MODEL` (een kale literal)
 *      -> 1 rood: 'de prijs wordt uit het model afgeleid en niet los gezet'
 */

const BRON = readFileSync(DOELCOACH, 'utf8');

/**
 * Het model dat de functie werkelijk aanroept.
 *
 * ⚠️ Grijpt naar de declaratie en niet naar de eerste keer dat de naam ergens
 *    voorkomt: `claude-sonnet-5` staat ook in commentaar, en een lezer die de
 *    eerste treffer pakt, toetst straks een zin in plaats van de constante.
 */
export function modelUit(bron: string): string | null {
  return /^const MODEL(?::[^=]*)?\s*=\s*'([^']+)'/m.exec(bron)?.[1] ?? null;
}

/** De prijstabel, als `{ model: { invoer, uitvoer } }`. */
export function prijzenUit(bron: string): Record<string, { invoer: number; uitvoer: number }> {
  const blok = /const PRIJS_PER_MTOK_CENT\s*=\s*\{([\s\S]*?)\n\}/.exec(bron)?.[1];
  if (blok === undefined || blok === null) return {};

  const uit: Record<string, { invoer: number; uitvoer: number }> = {};
  const regel = /'([^']+)':\s*\{\s*invoer:\s*(\d+),\s*uitvoer:\s*(\d+)\s*\}/g;
  let m = regel.exec(blok);
  while (m !== null) {
    const [, model, invoer, uitvoer] = m;
    if (model !== undefined) uit[model] = { invoer: Number(invoer), uitvoer: Number(uitvoer) };
    m = regel.exec(blok);
  }
  return uit;
}

/**
 * De lijstprijzen zoals gemeten, in dollarcent per miljoen tokens.
 *
 * 📏 Bron: `platform.claude.com/docs/en/about-claude/models/overview.md`,
 *    opgehaald op 10-09-2026. Claude Sonnet 5: $2 / $10 per MTok.
 *
 * ⚠️ **Verzet je dit getal, verzet dan ook de datum en de bron hierboven.** Een
 *    bedrag zonder meting is precies waar dit issue over ging.
 */
const GEMETEN_LIJSTPRIJS: Readonly<Record<string, { invoer: number; uitvoer: number }>> = {
  'claude-sonnet-5': { invoer: 200, uitvoer: 1000 },
};

describe('de prijs hoort bij het model dat hem maakte', () => {
  it('het aangeroepen model heeft een prijs', () => {
    const model = modelUit(BRON);

    expect(model, 'geen `const MODEL` gevonden — is de declaratie verplaatst?').not.toBeNull();
    expect(
      Object.keys(prijzenUit(BRON)),
      'een model zonder prijsregel boekt zijn kosten met de prijs van een ander model',
    ).toContain(model);
  });

  it('de prijs is die van de gemeten lijstprijs', () => {
    const model = modelUit(BRON) ?? '';
    const gemeten = GEMETEN_LIJSTPRIJS[model];

    expect(
      gemeten,
      `er is geen gemeten lijstprijs voor ${model}; meet hem en zet hem hierboven met datum en bron`,
    ).toBeDefined();
    expect(prijzenUit(BRON)[model]).toEqual(gemeten);
  });

  /**
   * ⚠️ **De regressietest op de vorm die de fout mogelijk maakte.** Twee losse
   *    constanten kunnen elk op zichzelf kloppen terwijl het paar niet klopt;
   *    dat was de stand van 06-09 tot 10-09-2026.
   */
  it('de prijs wordt uit het model afgeleid en niet los gezet', () => {
    expect(
      /const PRIJS\s*=\s*PRIJS_PER_MTOK_CENT\[MODEL\]/.test(BRON),
      'koppel de prijs aan `MODEL`; losse constanten lopen uiteen zonder dat iets rood wordt',
    ).toBe(true);
  });
});

describe('de zeven vormen die de lezers moeten raken', () => {
  it('leest het model uit een getypeerde declaratie', () => {
    expect(modelUit("const MODEL: keyof typeof P = 'claude-sonnet-5';")).toBe('claude-sonnet-5');
  });

  it('leest het model uit een kale declaratie', () => {
    expect(modelUit("const MODEL = 'claude-haiku-4-5';")).toBe('claude-haiku-4-5');
  });

  /** ⚠️ Must-leave-alone: een zin in commentaar is geen declaratie. */
  it('trapt niet in de modelnaam in een commentaarregel', () => {
    const bron = " * Sonnet en geen Opus — 'claude-opus-5' is duurder.\nconst MODEL = 'claude-sonnet-5';";
    expect(modelUit(bron)).toBe('claude-sonnet-5');
  });

  it('geeft null als de declaratie er niet is', () => {
    expect(modelUit('const IETS_ANDERS = 3;')).toBeNull();
  });

  it('leest een tabel met één regel', () => {
    const bron = "const PRIJS_PER_MTOK_CENT = {\n  'a': { invoer: 1, uitvoer: 2 },\n}";
    expect(prijzenUit(bron)).toEqual({ a: { invoer: 1, uitvoer: 2 } });
  });

  it('leest een tabel met meer regels', () => {
    const bron =
      "const PRIJS_PER_MTOK_CENT = {\n  'a': { invoer: 1, uitvoer: 2 },\n  'b': { invoer: 3, uitvoer: 4 },\n}";
    expect(prijzenUit(bron)).toEqual({ a: { invoer: 1, uitvoer: 2 }, b: { invoer: 3, uitvoer: 4 } });
  });

  /** ⚠️ Must-leave-alone: geen tabel is een leeg antwoord en geen fout. */
  it('geeft een lege tabel als hij er niet is', () => {
    expect(prijzenUit('const IETS = 1;')).toEqual({});
  });
});
