import { describe, expect, it } from 'vitest';

import { invoerProps, knopSleutel } from './wachtwoordveld';

/**
 * IJking van het wachtwoordveld — QS8-249.
 *
 * ⚠️ **De belofte is niet "de knop wisselt een boolean".** Die is triviaal. Er
 *    zijn er twee, en de tweede is de stille:
 *
 *    1. *Het veld begint verborgen* — tonen is een handeling, geen stand die je
 *       erft van een vorig scherm of een vorige gebruiker.
 *    2. *Wat de aanroeper meegaf, blijft staan.* Het aanmeldscherm zet
 *       `autoComplete` en `textContentType` per modus — bij inloggen
 *       `current-password`, bij aanmelden `new-password`. Zou het wachtwoordveld
 *       die overschrijven, dan biedt de wachtwoordmanager het verkeerde aan of
 *       niets. **Daar komt geen foutmelding en geen rode test van**; je merkt het
 *       pas als je zelf inlogt en je opgeslagen wachtwoord niet krijgt
 *       aangeboden. Precies de bug die QS8-248 net repareerde.
 *
 * ⚠️ **Waarom een pure functie en geen render.** Er is geen renderer in dit
 *    project. Zolang deze beslissing in `Field.tsx` blijft zitten, is ze niet te
 *    toetsen — zelfde beweging als `routewacht.ts` en `aanmeldmodus.ts`.
 *
 * IJKING — met de hand gedraaid op 01-09-2026, één mutatie per grendel:
 *
 *   A  `secureTextEntry: !zichtbaar` omdraaien        → 3 rood
 *   B  `{ ...opgegeven }` weglaten uit de terugkeer   → 3 rood
 *   C  de `!wachtwoord`-tak eruit                     → 1 rood
 *   D  `knopSleutel` altijd dezelfde sleutel          → 1 rood
 */

describe('invoerProps', () => {
  const opgegeven = {
    autoComplete: 'current-password',
    textContentType: 'password',
    value: 'geheim',
  } as const;

  /** ⚠️ Grendel 1: verborgen is de beginstand, en `secureTextEntry` is de omkering. */
  it('verbergt de invoer zolang de knop niet is omgezet', () => {
    const uit = invoerProps({ wachtwoord: true, zichtbaar: false, opgegeven });
    expect(uit.secureTextEntry).toBe(true);
  });

  it('toont de invoer zodra de knop om is', () => {
    const uit = invoerProps({ wachtwoord: true, zichtbaar: true, opgegeven });
    expect(uit.secureTextEntry).toBe(false);
  });

  /**
   * ⚠️ **Grendel 2, en de enige die iets vindt wat niemand ziet.** Zou het
   *    wachtwoordveld deze twee overschrijven, dan werkt de wachtwoordmanager
   *    niet meer — zonder foutmelding, zonder rode test, en alleen te merken door
   *    zelf in te loggen.
   */
  it.each([false, true])('laat autoComplete en textContentType staan (zichtbaar=%s)', (zichtbaar) => {
    const uit = invoerProps({ wachtwoord: true, zichtbaar, opgegeven });

    expect(uit.autoComplete).toBe('current-password');
    expect(uit.textContentType).toBe('password');
  });

  it('laat de rest van de props ongemoeid', () => {
    const uit = invoerProps({ wachtwoord: true, zichtbaar: false, opgegeven });
    expect(uit.value).toBe('geheim');
  });

  /**
   * ⚠️ **De must-allow-helft.** Er staan tientallen gewone velden in deze app —
   *    naam, tijdzone, een weekdoeltitel. Zou dit die aanraken, dan is de
   *    wijziging niet lokaal meer.
   */
  it('raakt een gewoon veld niet aan', () => {
    const gewoon = { autoComplete: 'name' as const, value: 'Quinten' };
    const uit = invoerProps({ wachtwoord: false, zichtbaar: false, opgegeven: gewoon });

    expect(uit).toBe(gewoon);
    expect('secureTextEntry' in uit).toBe(false);
  });

  /**
   * ⚠️ **De knop wint van een `secureTextEntry` van de aanroeper**, en dat is een
   *    keuze. Een veld dat "wachtwoord" heet en tóch open ligt omdat iemand er
   *    `secureTextEntry={false}` bij zette, is een lek dat niemand ziet.
   */
  it('laat de knop winnen van een eigen secureTextEntry', () => {
    const uit = invoerProps({
      wachtwoord: true,
      zichtbaar: false,
      opgegeven: { secureTextEntry: false },
    });
    expect(uit.secureTextEntry).toBe(true);
  });
});

describe('knopSleutel', () => {
  it('biedt aan te tonen zolang het verborgen is', () => {
    expect(knopSleutel(false)).toBe('veld.wachtwoord_tonen');
  });

  it('biedt aan te verbergen zodra het zichtbaar is', () => {
    expect(knopSleutel(true)).toBe('veld.wachtwoord_verbergen');
  });
});
