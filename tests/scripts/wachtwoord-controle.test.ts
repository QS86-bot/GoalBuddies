import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { minimumUit, vergelijk } from '../../scripts/wachtwoord-controle.mjs';
import { WACHTWOORD_MINIMUM } from '../../src/modules/auth/schemas';

/**
 * `wachtwoord:controle` legt het formulier naast de server — QS8-234.
 *
 * ⚠️ **De belofte is niet "het schema eist twaalf" maar "een wachtwoord ís hier
 *    minstens twaalf tekens".** Het eerste is een eigenschap van een onderdeel
 *    en stond al onder test. Het tweede hangt aan een naad tussen Zod in de
 *    browser en `password_min_length` in het Supabase-dashboard, en daar stond
 *    tot 31-08-2026 niets.
 *
 * ⚠️ **Er was geen test die dit kón raken.** Dat is regel 18 vraag 3 in zijn
 *    ergste vorm: niet een test die groen blijft terwijl de belofte breekt, maar
 *    een belofte die door geen enkele test wordt aangeraakt. De anon-sleutel zit
 *    per definitie in elke bundel, dus een POST rechtstreeks naar
 *    `/auth/v1/signup` omzeilt élke clientvalidatie.
 */

describe('minimumUit', () => {
  it('leest het echte schema-bestand', () => {
    const bron = readFileSync('src/modules/auth/schemas.ts', 'utf8');
    expect(minimumUit(bron)).toBe(WACHTWOORD_MINIMUM);
  });

  it('pakt de benoemde constante en niet een .min() uit de keten', () => {
    // ⚠️ Dit is waarom de constante bestaat. Deze bron draagt drie getallen die
    //    er alle drie uitzien als "de ondergrens": de max van 72, de .min(1) van
    //    inloggen, en het echte minimum. Een regex op `.min(` pakt de verkeerde
    //    zodra iemand de volgorde wijzigt — en bewaakt dan stil iets anders dan
    //    het formulier gebruikt.
    const bron = `
      export const WACHTWOORD_MINIMUM = 14;
      export const wachtwoordSchema = z.string().min(1).max(72);
      export const inloggenSchema = z.object({ wachtwoord: z.string().min(1) });
    `;
    expect(minimumUit(bron)).toBe(14);
  });

  it('werpt als de constante hernoemd of weggehaald is', () => {
    // ⚠️ Niet stil doorgaan met een verzonnen getal. Een controle die zijn eigen
    //    anker kwijt is, bewaakt niets — en dat mag nooit groen zijn.
    expect(() => minimumUit('export const IETS_ANDERS = 12;')).toThrow(
      /WACHTWOORD_MINIMUM niet gevonden/,
    );
  });
});

describe('vergelijk', () => {
  it('zwijgt als beide hetzelfde zeggen', () => {
    expect(vergelijk({ schema: 12, server: 12 })).toBeNull();
  });

  it('meldt het als de server lager staat — dit is de bevinding zelf', () => {
    const klacht = vergelijk({ schema: 12, server: 6 });
    expect(klacht?.soort).toBe('server-lager');
    expect(klacht?.melding).toContain('suggestie');
  });

  it('meldt ook het omgekeerde', () => {
    // Lekt niets, maar levert een storingsmelding op ná een formulier dat "goed"
    // zei. Dat is precies het patroon uit het deadline-argument van QS8-118.
    expect(vergelijk({ schema: 8, server: 12 })?.soort).toBe('server-hoger');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['een string', '12'],
    ['NaN', Number.NaN],
  ])('noemt %s ongemeten en niet in orde', (_naam, server) => {
    // ⚠️ De belangrijkste van dit blok. Geeft de API dit veld niet terug — een
    //    ander pad, een gewijzigd formaat, een gedeeltelijk antwoord — dan is er
    //    níéts gemeten. Zou dat als "klopt" tellen, dan meldt deze controle
    //    jarenlang groen over een grens die niemand meer nakijkt.
    expect(vergelijk({ schema: 12, server })?.soort).toBe('onbekend');
  });

  it('accepteert de grens precies, en niet één eronder', () => {
    expect(vergelijk({ schema: 12, server: 12 })).toBeNull();
    expect(vergelijk({ schema: 12, server: 11 })?.soort).toBe('server-lager');
  });
});
