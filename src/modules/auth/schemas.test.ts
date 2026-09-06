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
   *    noemen dat getal in woorden. Tot vandaag hield niets die twee bij
   *    elkaar: wie de constante verlaagt en de teksten laat staan, krijgt een
   *    app die om twaalf tekens vraagt en er acht accepteert. Beide onderdelen
   *    kloppen dan, de belofte niet — en `wachtwoord:controle` ziet het niet,
   *    want die kijkt naar de server en niet naar de catalogus.
   *
   *    QS8-216 wás precies die wijziging, en dit is de test die hem bewaakt.
   *
   * ⚠️ **Vraag 4: dit grijpt naar de sleutel en niet naar het scherm.**
   *    `aanmelden.wachtwoord_hint` staat vandaag in `app/aanmelden.tsx`.
   *    Verhuist die hint morgen naar de onboarding, dan verhuist deze test
   *    mee — hij toetst de catalogus, die de bron is.
   */
  const sleutels = ['validatie.wachtwoord_kort', 'aanmelden.wachtwoord_hint'] as const;
  const catalogi = [
    ['nl', nl],
    ['en', en],
  ] as const;

  for (const [taalcode, catalogus] of catalogi) {
    for (const sleutel of sleutels) {
      it(`${taalcode}: ${sleutel} noemt ${WACHTWOORD_MINIMUM}`, () => {
        const getallen = catalogus[sleutel].match(/\d+/g) ?? [];
        expect(getallen).toContain(String(WACHTWOORD_MINIMUM));
      });
    }
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
