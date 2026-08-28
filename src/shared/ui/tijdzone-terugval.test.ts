import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * De terugval als `Intl.supportedValuesOf` ontbreekt — de keten, niet de delen.
 *
 * ⚠️ **De belofte staat op drie plekken uitgeschreven en werd door niets
 *    getoetst.** `zoned.ts` zegt: geen lijst maar een lege array, "het scherm
 *    hoort dan een invoerveld te tonen in plaats van een keuzelijst". `tijdzone.ts`
 *    zegt bij `isBruikbareZone()`: "zonder deze uitweg zou een ouder toestel
 *    helemaal geen tijdzone kunnen zetten, en dat is precies de gebruiker die het
 *    het hardst nodig heeft". En `TijdzoneKeuze.tsx` bouwt daar de knop op.
 *
 *    Elk stuk klopt. Wat niemand toetste is of je op zo'n toestel daadwerkelijk
 *    een tijdzone kunt zetten — en `tijdzones()` had helemaal geen test.
 *
 * ⚠️ **Waarom dit geen theoretisch geval is.** Hermes kreeg
 *    `Intl.supportedValuesOf` pas laat en oudere JavaScriptCore-versies missen
 *    het. Dat is een ouder toestel, en dat is precies het toestel waarvan de
 *    klok het vaakst niet klopt met waar de eigenaar woont.
 *
 * ⚠️ **De modulecache is hier het hele probleem.** `tijdzones()` bouwt zijn lijst
 *    één keer op en hergebruikt hem daarna. Wie `Intl` stubt nádat een andere
 *    test de lijst al heeft opgehaald, meet de cache en niet de terugval. Elk
 *    geval hieronder doet daarom `vi.resetModules()` en importeert opnieuw —
 *    dezelfde les als bij de RLS-hulpfuncties, waar een gedeelde fixture het
 *    antwoord overeind hield.
 */

/** Laadt `shared/time` opnieuw, met een `Intl` die deze test bepaalt. */
async function metIntl(vervanger: unknown) {
  vi.resetModules();
  vi.stubGlobal('Intl', vervanger);

  return import('../time');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('een toestel zonder Intl.supportedValuesOf', () => {
  it('geeft een lege lijst en gooit niet', async () => {
    const { tijdzones } = await metIntl({
      DateTimeFormat: Intl.DateTimeFormat,
      // supportedValuesOf ontbreekt met opzet.
    });

    expect(tijdzones()).toEqual([]);
  });

  it('geeft ook een lege lijst als de aanroep zelf gooit', async () => {
    const { tijdzones } = await metIntl({
      DateTimeFormat: Intl.DateTimeFormat,
      supportedValuesOf: () => {
        throw new TypeError('niet ondersteund');
      },
    });

    expect(tijdzones()).toEqual([]);
  });

  it('geeft een lege lijst als er iets anders dan een array uit komt', async () => {
    // ⚠️ Een runtime die de functie kent maar iets vreemds teruggeeft, is geen
    //    verzinsel: dat is precies waar `Array.isArray` voor staat. Zonder die
    //    toets zou `zoekTijdzones()` op `undefined.filter` struikelen.
    const { tijdzones } = await metIntl({
      DateTimeFormat: Intl.DateTimeFormat,
      supportedValuesOf: () => undefined,
    });

    expect(tijdzones()).toEqual([]);
  });

  /**
   * ⚠️ **Dit is de test die de bevinding draagt.** De andere drie toetsen dat
   *    `tijdzones()` netjes leeg is — dat is het ónderdeel. Dit toetst de
   *    belófte: op zo'n toestel kun je nog steeds een tijdzone zetten.
   *
   * ⚠️ Met de hand rood gemaakt door `isBruikbareZone()` de lijst te laten
   *    raadplegen in plaats van `Intl` — dan is er op een leeg toestel geen
   *    enkele weg meer naar een tijdzone, en kantelt dit geval als enige.
   */
  it('laat een zelf getypte zone nog steeds toe — de enige weg die overblijft', async () => {
    vi.resetModules();
    vi.stubGlobal('Intl', {
      DateTimeFormat: Intl.DateTimeFormat,
    });

    const { tijdzones } = await import('../time');
    const { isBruikbareZone, zoekTijdzones } = await import('./tijdzone');

    // Er is niets om uit te kiezen…
    expect(tijdzones()).toEqual([]);
    expect(zoekTijdzones('amsterdam')).toEqual([]);

    // …en toch komt de gebruiker eruit.
    expect(isBruikbareZone('Europe/Amsterdam')).toBe(true);
    expect(isBruikbareZone('europe/amsterdam')).toBe(true);
    expect(isBruikbareZone('Geen/Zone')).toBe(false);
  });
});

describe('een toestel dat de lijst wél kent', () => {
  it('geeft terug wat het platform meldt', async () => {
    const { tijdzones } = await metIntl({
      DateTimeFormat: Intl.DateTimeFormat,
      supportedValuesOf: () => ['Europe/Amsterdam', 'Asia/Tokyo'],
    });

    expect(tijdzones()).toEqual(['Europe/Amsterdam', 'Asia/Tokyo']);
  });

  it('vraagt het maar één keer, ook bij herhaald gebruik', async () => {
    // ⚠️ De lijst is een paar honderd strings en verandert binnen een sessie
    //    niet. Een zoekveld dat per toetsaanslag zoekt, zou hem anders per
    //    aanslag opnieuw opbouwen.
    const vraag = vi.fn(() => ['Europe/Amsterdam']);
    const { tijdzones } = await metIntl({
      DateTimeFormat: Intl.DateTimeFormat,
      supportedValuesOf: vraag,
    });

    tijdzones();
    tijdzones();
    tijdzones();

    expect(vraag).toHaveBeenCalledTimes(1);
  });
});
