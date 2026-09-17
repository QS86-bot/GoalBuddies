import { describe, expect, it, vi } from 'vitest';

import {
  eersteTeken,
  grafemen,
  initiaalVan,
  isOnzichtbaarMiddenin,
  kapAf,
  telGrafemen,
  telTekens,
} from './index';

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

// ---------------------------------------------------------------------------

describe('MIDDENIN_BEREIKEN is afgeleid en niet met de hand bedacht', () => {
  /**
   * ⚠️⚠️ **Deze toets bestaat omdat de handgeschreven versie er 146 van 4174
   *    dekte, en de commit beweerde dat er nog twee open stonden.** 📏 Gemeten
   *    in de security-review op QS8-495: van de tekens die Unicode zelf
   *    `Default_Ignorable_Code_Point` noemt, overleefden er **4028** midden in
   *    een naam — waaronder `U+034F`, `U+FE00`, `U+2065`, `U+1D173` en
   *    `U+E0100`. Negen van de tien geteste gevallen landden als een naam die
   *    als `Jan` rendert.
   *
   *    Een lijst die je zelf opsomt, dekt de gevallen die je bedacht hebt. De
   *    property dekt de klasse — en, belangrijker, **hij faalt de goede kant
   *    op**: een nieuwe Unicode-versie voegt codepunten toe aan de property, en
   *    die vallen dan dicht in plaats van open.
   *
   * ⚠️ **De uitzonderingen staan hier en nergens anders**, want dát is het stuk
   *    dat een mens moet beslissen. Elk van de acht breekt een echte naam als
   *    hij **onvoorwaardelijk** zou meedoen; ze staan met hun reden in
   *    `MIDDENIN_BEREIKEN` hierboven en in
   *    `docs/decisions/2026-09-14-onzichtbaar-in-het-midden.md` §3.
   *
   * ⚠️⚠️ **Er staan er sinds 16-09-2026 elf, en de drie die erbij kwamen zijn
   *    van een ándere soort** (QS8-507, migratie 0285). De acht zijn tekens die
   *    wél als nul pixels renderen en tóch moeten blijven, omdat ze werk doen in
   *    een schrift. TAB, LF en CR renderen **niet** als nul pixels — ze zijn
   *    lay-out, en ze zaten hier alleen in omdat de afleiding "stuurteken" als
   *    benadering van "rendert als niets" gebruikte. Dat is een correctie van de
   *    afleiding en geen negende, tiende en elfde uitzondering.
   *
   *    Waar in deze kop "de acht" staat, gaat het dus over die eerste soort.
   *
   * ⚠️⚠️ **En sinds QS8-499 betekent "mag blijven" hier niet meer "blijft
   *    overal", en dat verschil hoort in deze kop te staan.** Deze lijst gaat
   *    over `isOnzichtbaarMiddenin()`, en die is per codepunt en dus
   *    onvoorwaardelijk — daar horen de acht niet in, en dat is onveranderd.
   *    Maar `zonderOnzichtbaarTussenLetters()` en `zonderLosseTags()` halen
   *    zeven ervan alsnog weg op de plek waar ze niets kunnen betekenen: tussen
   *    twee ASCII-alfanumerieken, en voor een tag zonder vlag ervoor.
   *
   *    Wie deze toets leest als *"de acht zijn toegestaan"* leest hem te breed.
   *    Wat hij zegt is *"ze zitten niet in de onvoorwaardelijke lijst"* — de
   *    contextregel staat in `tests/rls/naamnormalisatie.test.ts` en in
   *    `docs/decisions/2026-09-16-de-plek-is-het-probleem-en-niet-het-teken.md`.
   */
  const MAG_BLIJVEN: readonly (readonly [number, number])[] = [
    // ⚠️⚠️ **TAB, LF en CR staan hier sinds 16-09-2026 (QS8-507, migratie 0285),
    //    en dat is geen verruiming maar een correctie.** Ze zijn stuurtekens, dus
    //    de afleiding hierboven trok ze binnen — maar deze lijst draagt de
    //    belofte *"een teken dat als nul pixels rendert is nooit inhoud"*, en een
    //    regelovergang rendert als lay-out.
    //
    //    📏 Gemeten vóór de correctie: de nul-pixelregel weigerde élke tekst met
    //    een alinea erin, op tien van de twaalf kolommen van 0284 en vier van de
    //    dertien van 0283 — allemaal achter een `multiline`-veld.
    //
    // ⚠️ **Dat maakt de afleiding niet zwakker maar preciezer.** "Stuurteken" was
    //    hier een benadering van "rendert als niets", en voor drie codepunten
    //    klopte die benadering niet. `U+000B` en `U+000C` blijven er wél in: geen
    //    lay-out die iemand typt.
    //
    // ⚠️ Voor de belofte *"dit veld is één regel"* is er `zonderRegelovergang()`,
    //    met eigen CHECKs op de acht eenregelige kolommen. Zie de kop van 0285.
    [0x0009, 0x0009], // TAB
    [0x000a, 0x000a], // LF
    [0x000d, 0x000d], // CR
    [0x034f, 0x034f], // combining grapheme joiner
    [0x061c, 0x061c], // arabic letter mark
    [0x180b, 0x180f], // mongoolse variatieselectors, MVS en FVS4
    [0x200c, 0x200d], // ZWNJ (Perzisch, Hindi, Bengaals) en ZWJ (emoji-lijm)
    [0x200e, 0x200f], // LRM en RLM
    [0xfe00, 0xfe0f], // variatieselectors, incl. VS16 (emoji-presentatie)
    [0xe0020, 0xe007f], // tags — de subdivisievlaggen 🏴󠁧󠁢󠁳󠁣󠁴󠁿
    [0xe0100, 0xe01ef], // ideographic variation selectors (Japanse namen)
  ];

  const inBereik = (cp: number, bereiken: readonly (readonly [number, number])[]): boolean =>
    bereiken.some(([van, tot]) => cp >= van && cp <= tot);

  it('dekt precies `Default_Ignorable` plus de stuurtekens, min de uitzonderingen', () => {
    const teveel: string[] = [];
    const tekort: string[] = [];

    for (let cp = 1; cp <= 0x10ffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;

      const teken = String.fromCodePoint(cp);
      const stuurteken = cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
      const annotatie = cp >= 0xfff9 && cp <= 0xfffb;
      const onzichtbaar = /\p{Default_Ignorable_Code_Point}/u.test(teken);

      const hoort = (stuurteken || annotatie || onzichtbaar) && !inBereik(cp, MAG_BLIJVEN);
      const staat = isOnzichtbaarMiddenin(cp);

      if (staat && !hoort) teveel.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
      if (hoort && !staat) tekort.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
    }

    expect(tekort.slice(0, 20), 'deze renderen als nul pixels en staan er niet in').toEqual([]);
    expect(teveel.slice(0, 20), 'deze staan erin zonder dat de property ze noemt').toEqual([]);
  });

  it('en de uitzonderingen zitten niet in de onvoorwaardelijke lijst', () => {
    // ⚠️ De must-allow, en die weegt hier zwaarder dan de weigering — zie
    //    acceptatiecriterium 2 van QS8-495. ⚠️ Maar hij gaat over déze lijst en
    //    niet over `schoneNaam()`: sinds QS8-499 gaan zeven van de acht alsnog
    //    weg tussen twee ASCII-letters.
    for (const [van, tot] of MAG_BLIJVEN) {
      for (let cp = van; cp <= tot; cp += 1) {
        expect(isOnzichtbaarMiddenin(cp), `U+${cp.toString(16).toUpperCase()}`).toBe(false);
      }
    }
  });

  it('laat de spatie en de no-break space met rust', () => {
    // ⚠️ De scheidslijn: een spatie is onzichtbaar en tóch betekenisvol. Hij is
    //    niet `Default_Ignorable`, en dat is precies waarom de property de
    //    goede bron is en een eigen opsomming niet.
    expect(isOnzichtbaarMiddenin(0x0020), 'de spatie').toBe(false);
    expect(isOnzichtbaarMiddenin(0x00a0), 'de no-break space').toBe(false);
    expect(isOnzichtbaarMiddenin(0x2800), 'de braille blank — die heeft breedte').toBe(false);
  });
});
