import { describe, expect, it } from 'vitest';

import { en } from '../../shared/i18n/en';
import { telBytes, telTekens } from '../../shared/tekst';
import { nl } from '../../shared/i18n/nl';

import {
  aanmeldenSchema,
  emailSchema,
  profielPatchSchema,
  tijdzoneSchema,
  WACHTWOORD_MAXIMUM,
  WACHTWOORD_MINIMUM,
  wachtwoordSchema,
  weekdagSchema,
} from './schemas';

describe('e-mail', () => {
  it('normaliseert spaties en hoofdletters', () => {
    // Anders maakt iemand twee accounts op hetzelfde adres zonder het te merken.
    expect(emailSchema.parse('  Quinten@Example.COM ')).toBe('quinten@example.com');
  });

  it('weigert wat geen adres is', () => {
    expect(emailSchema.safeParse('quinten').success).toBe(false);
    expect(emailSchema.safeParse('').success).toBe(false);
  });
});

describe('wachtwoord', () => {
  it('eist lengte en geen tekenklassen', () => {
    // Een zin van vier woorden hoort te mogen; Welkom123! hoort niet nodig te zijn.
    expect(wachtwoordSchema.safeParse('mijn hond heet karel').success).toBe(true);

    // ⚠️ Afgeleid van de constante en niet een vast wachtwoord. Hier stond
    //    `Welkom123!` — tien tekens, en dus 'te kort' zolang de grens twaalf
    //    was. Toen QS8-216 hem naar acht bracht, werd datzelfde wachtwoord
    //    lang genoeg: de test zou groen blijven en stilzwijgend iets anders
    //    toetsen dan zijn naam belooft. Beide kanten van de grens, afgeleid.
    expect(wachtwoordSchema.safeParse('a'.repeat(WACHTWOORD_MINIMUM - 1)).success).toBe(false);
    expect(wachtwoordSchema.safeParse('a'.repeat(WACHTWOORD_MINIMUM)).success).toBe(true);
  });

  it('telt codepunten en geen UTF-16-eenheden', () => {
    // ⚠️ Dit was het gat. Met een kale `.min(8)` telde de grens UTF-16-eenheden,
    //    en `'😀😀😀😀'` is vier tekens in acht eenheden — die kwam er moeiteloos
    //    door. De ondergrens was in codepunten dus vier en niet acht, en QS8-216
    //    verlaagde hem daarmee niet van 12 naar 8 maar van 6 naar 4.
    expect(wachtwoordSchema.safeParse('😀'.repeat(WACHTWOORD_MINIMUM - 1)).success).toBe(false);
    expect(wachtwoordSchema.safeParse('😀'.repeat(WACHTWOORD_MINIMUM)).success).toBe(true);

    // Een samengesteld gezin is één grafeem maar zeven codepunten — en zeven is
    // te kort. `telTekens()` telt codepunten, want dat is wat de database telt.
    expect(wachtwoordSchema.safeParse('👨‍👩‍👧‍👦').success).toBe(false);
  });

  it('vertelt bij een te kort wachtwoord wat er moet gebeuren', () => {
    const uitkomst = wachtwoordSchema.safeParse('kort');
    expect(uitkomst.success).toBe(false);
    if (!uitkomst.success) {
      expect(uitkomst.error.issues[0]?.message).toContain(`${WACHTWOORD_MINIMUM} tekens`);
    }
  });
});

/**
 * ⚠️⚠️ **De bovengrens telt bytes, en dat is de belofte — QS8-672.** bcrypt
 *    leest 72 bytes en GoTrue weigert daarboven met een 400. Tot dit issue
 *    stond hier één test, `'a'.repeat(73)`, en die bewees alleen het
 *    ASCII-geval: in ASCII zijn bytes, codepunten en UTF-16-eenheden hetzelfde
 *    getal, dus hij bleef groen bij élke telling. 📏 Onder zod 4.4.3 passeerden
 *    36 emoji (144 bytes), onder 4.6.7 72 emoji (288 bytes) — en deze test zag
 *    geen van beide.
 *
 *    De gevallen hieronder liggen daarom op de naad tussen de eenheden: een
 *    emoji is één codepunt, twee UTF-16-eenheden en vier bytes, dus 18 emoji
 *    zijn precies 72 bytes en 19 zijn er 76. Een grens die iets anders telt dan
 *    bytes geeft op minstens één van die vier een ander antwoord.
 *
 * ⚠️ Vraag 3 met de hand beantwoord — de ijking staat in het beslisdocument:
 *    `telBytes` → `telTekens` laat 72 emoji en 19 emoji door (drie tests rood, de melding meegeteld);
 *    `<=` → `<` weigert 72 ASCII en 18 emoji (twee tests rood).
 */
describe('de bovengrens van het wachtwoord telt bytes', () => {
  const EMOJI = '😀';

  it('is met vier bytes per emoji gemeten en niet aangenomen', () => {
    expect(telBytes(EMOJI)).toBe(4);
    expect(telTekens(EMOJI)).toBe(1);
    expect(EMOJI.length).toBe(2);
  });

  it('weigert 72 emoji — 72 codepunten, maar 288 bytes', () => {
    expect(wachtwoordSchema.safeParse(EMOJI.repeat(WACHTWOORD_MAXIMUM)).success).toBe(false);
  });

  it('laat 72 ASCII-tekens door — precies de grens', () => {
    expect(wachtwoordSchema.safeParse('a'.repeat(WACHTWOORD_MAXIMUM)).success).toBe(true);
  });

  it('en weigert 73', () => {
    expect(wachtwoordSchema.safeParse('a'.repeat(WACHTWOORD_MAXIMUM + 1)).success).toBe(false);
  });

  it('laat 18 emoji door — precies 72 bytes', () => {
    const wachtwoord = EMOJI.repeat(WACHTWOORD_MAXIMUM / 4);
    expect(telBytes(wachtwoord)).toBe(WACHTWOORD_MAXIMUM);
    expect(wachtwoordSchema.safeParse(wachtwoord).success).toBe(true);
  });

  it('en weigert 19 emoji — 76 bytes, al zijn het maar 19 tekens', () => {
    const wachtwoord = EMOJI.repeat(WACHTWOORD_MAXIMUM / 4 + 1);
    expect(telTekens(wachtwoord)).toBeLessThan(WACHTWOORD_MAXIMUM);
    expect(wachtwoordSchema.safeParse(wachtwoord).success).toBe(false);
  });

  it('zegt bij een te lang wachtwoord dat het om bytes gaat', () => {
    const uitkomst = wachtwoordSchema.safeParse(EMOJI.repeat(WACHTWOORD_MAXIMUM));
    expect(uitkomst.success).toBe(false);
    if (!uitkomst.success) {
      expect(uitkomst.error.issues).toHaveLength(1);
      expect(uitkomst.error.issues[0]?.message).toContain(`${WACHTWOORD_MAXIMUM} bytes`);
    }
  });
});

describe('de ondergrens blijft codepunten tellen, ook nu de bovengrens bytes telt', () => {
  it('zeven emoji zijn 28 bytes en tóch te kort — de grenzen kijken elk naar hun eigen eenheid', () => {
    const wachtwoord = '😀'.repeat(WACHTWOORD_MINIMUM - 1);
    expect(telBytes(wachtwoord)).toBeGreaterThan(WACHTWOORD_MINIMUM);
    expect(wachtwoordSchema.safeParse(wachtwoord).success).toBe(false);
  });
});

describe('het getal in de tekst volgt de constante', () => {
  /**
   * ⚠️ **Regel 18, vraag 1: hier knopen twee correcte onderdelen aan elkaar.**
   *    Het schema weigert op `WACHTWOORD_MINIMUM`, en vier catalogusregels
   *    noemen dat getal in woorden. Tot QS8-216 hield niets die twee bij
   *    elkaar: wie de constante verlaagt en de teksten laat staan, krijgt een
   *    app die om twaalf tekens vraagt en er acht accepteert. Beide onderdelen
   *    kloppen dan, de belofte niet — en `wachtwoord:controle` ziet het niet,
   *    want die kijkt naar de server en niet naar de catalogus.
   *
   * ⚠️ **De eerste versie van deze test was zelf vraag 3.** Hij matchte
   *    `/\d+/g` over de hele zin en toetste of `8` er ergens in stond. Daarmee
   *    bleef *"Minstens 12 tekens. Een zin van 8 woorden werkt prima."* groen
   *    terwijl de gebruiker twaalf las — de belofte gebroken, de test tevreden.
   *    Met een probe aangetoond, niet beredeneerd. Nu wordt het getal
   *    **achter het woord** gevangen en niet ergens in de zin gezocht.
   *
   * ⚠️ **Vraag 4: dit grijpt naar de sleutel en niet naar het scherm.**
   *    `aanmelden.wachtwoord_hint` staat vandaag in `app/aanmelden.tsx`.
   *    Verhuist die hint morgen naar de onboarding, dan verhuist deze test mee.
   */
  const ONDERGRENS = /minstens (\d+) tekens|at least (\d+) characters/i;

  /** Het getal dat de zin als ondergrens nóemt, of null als hij er geen noemt. */
  function genoemdeOndergrens(tekst: string): number | null {
    const treffer = ONDERGRENS.exec(tekst);
    if (treffer === null) return null;
    return Number(treffer[1] ?? treffer[2]);
  }

  const sleutels = ['validatie.wachtwoord_kort', 'aanmelden.wachtwoord_hint'] as const;
  const catalogi = [
    ['nl', nl],
    ['en', en],
  ] as const;

  for (const [taalcode, catalogus] of catalogi) {
    for (const sleutel of sleutels) {
      it(`${taalcode}: ${sleutel} noemt ${WACHTWOORD_MINIMUM}`, () => {
        expect(genoemdeOndergrens(catalogus[sleutel])).toBe(WACHTWOORD_MINIMUM);
      });
    }
  }

  /**
   * ⚠️ **De lijst hierboven is met de hand bijgehouden, en dat is precies de
   *    vorm die stil verkeerd gaat.** Komt er een catalogusregel bij die óók
   *    een ondergrens in tekens noemt, dan dekt geen enkele test hem en wordt
   *    niemand rood. Deze twee toetsen dwingen af dat de lijst compleet blijft:
   *    is er een vijfde regel met zo'n getal, dan gaan ze rood en beslist
   *    iemand of hij erbij hoort — in plaats van dat het toeval blijft.
   */
  for (const [taalcode, catalogus] of catalogi) {
    it(`${taalcode}: geen andere sleutel noemt een ondergrens in tekens`, () => {
      const gevonden = Object.entries(catalogus)
        .filter(([, tekst]) => genoemdeOndergrens(tekst) !== null)
        .map(([sleutel]) => sleutel)
        .sort();

      expect(gevonden).toEqual([...sleutels].sort());
    });
  }
});

/**
 * Dezelfde naad voor de bovengrens — QS8-672. De melding noemt het getal én de
 * eenheid, en allebei moeten ze de constante volgen: *"72 tekens"* zou de oude
 * fout in woorden zijn, en *"80 bytes"* een getal dat de server niet kent.
 */
describe('het getal en de eenheid van de bovengrens volgen de constante', () => {
  const BOVENGRENS = /hoogstens (\d+) bytes|at most (\d+) bytes/i;

  function genoemdeBovengrens(tekst: string): number | null {
    const treffer = BOVENGRENS.exec(tekst);
    if (treffer === null) return null;
    return Number(treffer[1] ?? treffer[2]);
  }

  const catalogi = [
    ['nl', nl],
    ['en', en],
  ] as const;

  for (const [taalcode, catalogus] of catalogi) {
    it(`${taalcode}: validatie.wachtwoord_lang noemt ${WACHTWOORD_MAXIMUM} bytes`, () => {
      expect(genoemdeBovengrens(catalogus['validatie.wachtwoord_lang'])).toBe(WACHTWOORD_MAXIMUM);
    });

    it(`${taalcode}: en noemt de grens niet in tekens`, () => {
      // De oude melding zei "72 tekens". Dat was precies de eenheid die niet klopt.
      expect(catalogus['validatie.wachtwoord_lang']).not.toMatch(/\d+ (tekens|characters)/);
    });

    it(`${taalcode}: geen andere sleutel noemt een bovengrens in bytes`, () => {
      const gevonden = Object.entries(catalogus)
        .filter(([, tekst]) => genoemdeBovengrens(tekst) !== null)
        .map(([sleutel]) => sleutel);

      expect(gevonden).toEqual(['validatie.wachtwoord_lang']);
    });
  }
});

describe('aanmelden', () => {
  it('accepteert een geldige combinatie', () => {
    const uitkomst = aanmeldenSchema.safeParse({
      email: 'Test@Example.com',
      wachtwoord: 'een lange zin hier',
    });
    expect(uitkomst.success).toBe(true);
    if (uitkomst.success) expect(uitkomst.data.email).toBe('test@example.com');
  });
});

describe('weekdag', () => {
  it('accepteert 0 tot en met 6', () => {
    for (const dag of [0, 1, 2, 3, 4, 5, 6]) {
      expect(weekdagSchema.safeParse(dag).success).toBe(true);
    }
  });

  it('weigert 7 en negatieve waarden', () => {
    expect(weekdagSchema.safeParse(7).success).toBe(false);
    expect(weekdagSchema.safeParse(-1).success).toBe(false);
    expect(weekdagSchema.safeParse(1.5).success).toBe(false);
  });
});

describe('tijdzone', () => {
  it('accepteert een echte IANA-zone', () => {
    expect(tijdzoneSchema.safeParse('Europe/Amsterdam').success).toBe(true);
    expect(tijdzoneSchema.safeParse('Pacific/Auckland').success).toBe(true);
  });

  it('weigert een verzonnen zone', () => {
    // Belangrijk: een onbekende zone laat currentUserCycle() stukgaan, en dan
    // klopt "deze week" niet meer. Dat mag niet via een formulier binnenkomen.
    expect(tijdzoneSchema.safeParse('Europa/Amsterdam').success).toBe(false);
    expect(tijdzoneSchema.safeParse('').success).toBe(false);
  });
});

describe('profielpatch', () => {
  it('laat losse velden toe', () => {
    expect(profielPatchSchema.safeParse({ week_start_day: 0 }).success).toBe(true);
    expect(profielPatchSchema.safeParse({}).success).toBe(true);
  });

  it('controleert een herinneringstijd op vorm', () => {
    expect(profielPatchSchema.safeParse({ reminder_time: '20:00' }).success).toBe(true);
    expect(profielPatchSchema.safeParse({ reminder_time: '20:00:00' }).success).toBe(true);
    expect(profielPatchSchema.safeParse({ reminder_time: '25:00' }).success).toBe(false);
    expect(profielPatchSchema.safeParse({ reminder_time: '8:00' }).success).toBe(false);
  });

  it('staat een lege herinneringstijd toe', () => {
    // Geen tijd betekent: geen dagelijkse herinnering. Dat is een geldige keuze.
    expect(profielPatchSchema.safeParse({ reminder_time: null }).success).toBe(true);
  });

  it('weigert een onbekende toon', () => {
    expect(profielPatchSchema.safeParse({ reminder_tone: 'streng' }).success).toBe(false);
    expect(profielPatchSchema.safeParse({ reminder_tone: 'firm' }).success).toBe(true);
  });
});

/**
 * ⚠️⚠️ **De bovenkant van de naadtest van QS8-448.** De onderkant — of SQL en
 *    TypeScript hetzelfde oordelen — staat in `tests/rls/naamnormalisatie.test.ts`,
 *    want die heeft een database nodig. Wat híér te toetsen is, is het gedrág dat
 *    de gebruiker merkt: loopt hij vast op een veld dat hij niet aanraakte?
 */
describe('de weergavenaam telt zoals de database telt', () => {
  /**
   * 📏 Het gemeten geval uit `docs/ENGINEER-REVIEW.md` regel 480: de trigger doet
   *    `left(…, 80)` (codepunten) en maakt dus een naam van 80 emoji aan.
   *    `app/onboarding/profiel.tsx` vult het veld met die waarde en stuurt hem
   *    onveranderd terug. Met `.max(80)` — dat onder zod 4.4.3 UTF-16-eenheden
   *    telde en er 160 zag — weigerde het schema hem, en kon de gebruiker zijn onboarding niet
   *    afronden op een veld dat hij nooit had aangeraakt.
   */
  it('accepteert een naam van 80 emoji-codepunten, zoals de trigger hem aanmaakt', () => {
    const naam = '👩'.repeat(80);

    expect(telTekens(naam), 'de invoer is niet 80 codepunten').toBe(80);
    expect(naam.length, 'de invoer is niet 160 UTF-16-eenheden — dan meet dit geval niets').toBe(
      160,
    );
    expect(profielPatchSchema.safeParse({ display_name: naam }).success).toBe(true);
  });

  it('en weigert er 81, want dat is wat de CHECK weigert', () => {
    expect(profielPatchSchema.safeParse({ display_name: '👩'.repeat(81) }).success).toBe(false);
  });

  /**
   * ⚠️ De vier vormen die vóór QS8-448 langs de trigger kwamen. Drie ervan
   *    weigerde dit schema al (JS' `.trim()` strijkt ze); U+200B niet — en dat
   *    was het enige geval waar beide poorten open stonden.
   */
  it.each([
    ['twee newlines', '\n\n'],
    ['twee tabs', '\t\t'],
    ['een no-break space', ' '],
    ['een zero-width space', '​'],
    ['een byte order mark', '﻿'],
  ])('weigert een naam die alleen uit %s bestaat', (_wat, waarde) => {
    expect(profielPatchSchema.safeParse({ display_name: waarde }).success).toBe(false);
  });

  it('maar laat een naam met onzichtbare randen door, zonder die randen', () => {
    const uit = profielPatchSchema.safeParse({ display_name: '​ Jan ​' });

    expect(uit.success).toBe(true);
    expect(
      uit.success ? uit.data.display_name : null,
      'de onzichtbare randen gaan mee de database in',
    ).toBe('Jan');
  });

  /**
   * ⚠️⚠️ **De reparatie die het erger had gemaakt.** U+200D is de lijm in
   *    `👨‍👩‍👧‍👦`; wie hem overal wegknipt in plaats van alleen aan de rand,
   *    houdt vier losse mensen over.
   */
  it('en laat een gezinsemoji heel', () => {
    const uit = profielPatchSchema.safeParse({ display_name: ' 👨‍👩‍👧‍👦 ' });

    expect(uit.success).toBe(true);
    expect(uit.success ? telTekens(uit.data.display_name ?? '') : 0).toBe(7);
  });
});
