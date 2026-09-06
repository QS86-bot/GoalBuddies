import { describe, expect, it } from 'vitest';

import { en } from '../../shared/i18n/en';
import { nl } from '../../shared/i18n/nl';

import {
  aanmeldenSchema,
  emailSchema,
  profielPatchSchema,
  tijdzoneSchema,
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

  it('kapt niet stilzwijgend af boven de bcrypt-grens', () => {
    // bcrypt negeert alles na 72 bytes. Zonder deze grens denkt iemand met een
    // wachtwoord van 100 tekens dat die laatste 28 meetellen.
    expect(wachtwoordSchema.safeParse('a'.repeat(73)).success).toBe(false);
  });

  it('vertelt bij een te kort wachtwoord wat er moet gebeuren', () => {
    const uitkomst = wachtwoordSchema.safeParse('kort');
    expect(uitkomst.success).toBe(false);
    if (!uitkomst.success) {
      expect(uitkomst.error.issues[0]?.message).toContain(`${WACHTWOORD_MINIMUM} tekens`);
    }
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
