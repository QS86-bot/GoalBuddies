import { describe, expect, it, vi } from 'vitest';

import { eersteTeken, grafemen, initiaalVan, kapAf, telGrafemen, telTekens } from './index';

const EMOJI = '\u{1F600}'; // 😀 — één codepunt, twee UTF-16-eenheden
const GEZIN = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}'; // 👨‍👩‍👧‍👦

/**
 * Staat er ergens een halve codepoint in? Dat is de eigenschap die telt — niet
 * "eindigt op een low surrogate", want dat is juist de correcte tweede helft
 * van een compleet paar.
 */
function heeftLosseSurrogate(tekst: string): boolean {
  return Array.from(tekst).some((teken) => {
    const punt = teken.codePointAt(0) ?? 0;
    return punt >= 0xd800 && punt <= 0xdfff;
  });
}

describe('de drie tellingen', () => {
  it('telt codepunten zoals char_length in Postgres', () => {
    expect(EMOJI.length).toBe(2);
    expect(telTekens(EMOJI)).toBe(1);

    expect(GEZIN.length).toBe(11);
    expect(telTekens(GEZIN)).toBe(7);
  });

  it('telt grafemen zoals een mens ze ziet', () => {
    expect(telGrafemen(EMOJI)).toBe(1);
    expect(telGrafemen(GEZIN)).toBe(1);
    expect(telGrafemen('abc')).toBe(3);
  });

  /**
   * ⚠️ De gevaarlijke kant. `.length` is altijd ≥ `char_length`, dus bij een
   *    ONDERGRENS zegt een client die in UTF-16 telt "lang genoeg" terwijl
   *    Postgres het verzoek weigert. Tien emoji halen `.length >= 20` maar
   *    `char_length` is dan 10.
   */
  it('laat zien waarom een ondergrens op .length misgaat', () => {
    const tien = EMOJI.repeat(10);

    expect(tien.length).toBe(20); // client zou zeggen: lang genoeg
    expect(telTekens(tien)).toBe(10); // database: te kort
  });
});

describe('eersteTeken', () => {
  it('geeft een heel teken bij een naam die met een emoji begint', () => {
    const uit = eersteTeken(`${EMOJI}Anna`);

    expect(uit).toBe(EMOJI);
    expect(uit).not.toBe('\ud83d');
  });

  it('houdt een samengestelde emoji heel', () => {
    expect(eersteTeken(`${GEZIN} thuis`)).toBe(GEZIN);
  });

  it('doet gewone tekst gewoon', () => {
    expect(eersteTeken('Anna')).toBe('A');
  });

  it('geeft een lege string bij lege invoer', () => {
    expect(eersteTeken('')).toBe('');
  });
});

describe('kapAf', () => {
  it('laat tekst die past ongemoeid', () => {
    expect(kapAf('kort', 10)).toBe('kort');
  });

  /**
   * ⚠️ Dit is de bug uit `voorstelUitDagzetten()`, naast elkaar gezet. `slice()`
   *    telt UTF-16-eenheden en houdt op deze invoer een losse high surrogate
   *    over — die rendert als `�`. `kapAf()` telt codepunten, houdt de emoji
   *    heel, en levert er zelfs méér bruikbare tekst mee op.
   */
  it('snijdt nooit door een surrogaatpaar heen, waar slice dat wel doet', () => {
    const invoer = `abcdefghi${EMOJI}rest`;

    expect(heeftLosseSurrogate(invoer.slice(0, 10))).toBe(true);

    const uit = kapAf(invoer, 10);
    expect(uit).toBe(`abcdefghi${EMOJI}`);
    expect(telTekens(uit)).toBe(10);
    expect(heeftLosseSurrogate(uit)).toBe(false);
  });

  it('vult de ruimte die overblijft gewoon verder', () => {
    expect(kapAf(`abcdefghi${EMOJI}rest`, 11)).toBe(`abcdefghi${EMOJI}r`);
  });

  it('blijft binnen de grens die de database telt', () => {
    const lang = EMOJI.repeat(50);

    expect(telTekens(kapAf(lang, 10))).toBeLessThanOrEqual(10);
  });

  /** Een teken dat niet meer past gaat er in zijn geheel af. */
  it('kapt liever korter af dan door een samengestelde emoji heen', () => {
    const uit = kapAf(`ab${GEZIN}`, 5);

    expect(uit).toBe('ab');
    expect(telTekens(uit)).toBeLessThanOrEqual(5);
  });

  it('geeft een lege string bij een grens van nul of minder', () => {
    expect(kapAf('abc', 0)).toBe('');
    expect(kapAf('abc', -1)).toBe('');
  });
});

/**
 * ⚠️ Hermes op React Native heeft `Intl.Segmenter` niet gegarandeerd. De
 *    terugval moet nog steeds nooit een half teken opleveren — dat is het enige
 *    dat echt schade doet. Wat je verliest is dat een samengestelde emoji als
 *    meerdere tekens telt.
 */
describe('zonder Intl.Segmenter', () => {
  function zonderSegmenter<T>(doe: () => T): T {
    const echt = Intl.Segmenter;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined } as any);
    try {
      return doe();
    } finally {
      vi.stubGlobal('Intl', { ...Intl, Segmenter: echt });
      vi.unstubAllGlobals();
    }
  }

  it('geeft nog steeds een heel teken terug', () => {
    expect(zonderSegmenter(() => eersteTeken(`${EMOJI}Anna`))).toBe(EMOJI);
  });

  it('snijdt nog steeds niet door een surrogaatpaar', () => {
    const uit = zonderSegmenter(() => kapAf(`abcdefghi${EMOJI}rest`, 10));

    expect(uit).toBe(`abcdefghi${EMOJI}`);
    expect(heeftLosseSurrogate(uit)).toBe(false);
  });

  it('telt codepunten onveranderd', () => {
    expect(zonderSegmenter(() => telTekens(GEZIN))).toBe(7);
  });

  it('valt terug op codepunten voor een samengestelde emoji', () => {
    expect(zonderSegmenter(() => grafemen(GEZIN))).toHaveLength(7);
  });
});

/**
 * Acceptatiecriterium 1 van QS8-118. De ledenlijst is een groepsoppervlak: wat
 * hier stukgaat, gaat stuk naast de naam van iemand anders.
 */
describe('initiaalVan', () => {
  it('geeft een heel teken bij een naam die met een emoji begint', () => {
    const uit = initiaalVan(`${EMOJI}Anna`);

    expect(uit).toBe(EMOJI);
    expect(heeftLosseSurrogate(uit)).toBe(false);
  });

  it('houdt een samengestelde emoji heel', () => {
    expect(heeftLosseSurrogate(initiaalVan(GEZIN))).toBe(false);
  });

  it('maakt een gewone letter hoofdletter', () => {
    expect(initiaalVan('anna')).toBe('A');
    expect(initiaalVan('  bram ')).toBe('B');
  });

  it('geeft een vraagteken bij een lege of blanco naam', () => {
    expect(initiaalVan('')).toBe('?');
    expect(initiaalVan('   ')).toBe('?');
  });

  /**
   * ⚠️ **Dezelfde opvatting van witruimte als de database** — QS8-448. Hier stond
   *    `naam.trim()`, tien regels onder `schoneNaam()` die er juist één van moest
   *    maken. `.trim()` strijkt de JS-WhiteSpace-klasse en laat U+200B, de hangul
   *    filler en de soft hyphen staan, dus die kwamen als avatarletter naast de
   *    naam van een groepsgenoot te staan: een leeg vak.
   *
   *    De CHECK uit 0256 weigert zo'n naam nu bij het schrijven, maar
   *    `initiaalVan()` krijgt ook namen te zien die van vóór die CHECK zijn — en
   *    een presentatiehelper hoort niet te leunen op een grens die ergens anders
   *    staat.
   */
  it.each([
    { naam: 'zero-width space', rand: String.fromCodePoint(0x200b) },
    { naam: 'hangul filler', rand: String.fromCodePoint(0x3164) },
    { naam: 'soft hyphen', rand: String.fromCodePoint(0x00ad) },
    { naam: 'no-break space', rand: String.fromCodePoint(0x00a0) },
  ])('slaat een onzichtbare voorrand over ($naam)', ({ rand }) => {
    expect(initiaalVan(`${rand}bram`)).toBe('B');
  });

  it('geeft een vraagteken bij een naam die alleen onzichtbaar is', () => {
    expect(initiaalVan(String.fromCodePoint(0x200b))).toBe('?');
    expect(initiaalVan(String.fromCodePoint(0x3164))).toBe('?');
  });
});
