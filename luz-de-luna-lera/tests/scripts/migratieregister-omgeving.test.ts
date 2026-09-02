import { describe, expect, it } from 'vitest';

import { beoordeelOmgeving } from '../../scripts/migratieregister-omgeving.mjs';

/**
 * Wanneer mag `register:controle` zwijgen, en wanneer niet?
 *
 * ⚠️ **De bevinding waar dit uit komt.** Deze controle is de enige die de repo
 *    naast het échte project legt, en zonder `EXPO_PUBLIC_SUPABASE_URL` en
 *    `SUPABASE_SERVICE_ROLE_KEY` deed hij niets — met een regel op **stdout**,
 *    tussen de geslaagde controles in. Daar las `overgeslagen` als `gelukt`.
 *    Dezelfde faalvorm als de Windows-job in CI: een script dat niets doet en
 *    toch niets meldt.
 *
 * ⚠️ **Overslaan blijft goed, en dat is geen compromis.** De service-role-key
 *    hoort niet bij een runner die op elke push draait; een controle die in CI
 *    omvalt op een ontbrekende sleutel, leert je rood te negeren. Wat er
 *    veranderde is dat overslaan er nu úitziet als overslaan (stderr, met een
 *    teken ervoor) en dat er een stand is waarin het wél fout is.
 *
 * ⚠️ **Die stand is `npm run db:push`.** Dat is het pad waarlangs een migratie
 *    op productie landt, en daar zijn de credentials per definitie aanwezig —
 *    dus daar is zwijgen geen afspraak maar een gemiste controle. Precies het
 *    gevaar dat de rij in `docs/ENGINEER-REVIEW.md` noemde: *"een migratie op
 *    productie zonder dat de controle daarna draait"*.
 *
 * ⚠️ Tweezijdig geijkt: elk geval dat moet draaien staat naast het geval dat
 *    mag zwijgen en het geval dat moet vallen.
 */
describe('beoordeelOmgeving', () => {
  const SLEUTEL = 'service-role-sleutel';
  const URL = 'https://voorbeeld.supabase.co';

  it('draait als beide er zijn', () => {
    expect(beoordeelOmgeving({ url: URL, sleutel: SLEUTEL })).toBe('draaien');
  });

  it('draait ook streng als beide er zijn — streng maakt niets strenger dan nodig', () => {
    expect(beoordeelOmgeving({ url: URL, sleutel: SLEUTEL, streng: true })).toBe('draaien');
  });

  it('slaat over zonder sleutel', () => {
    expect(beoordeelOmgeving({ url: URL })).toBe('overslaan');
  });

  it('slaat over zonder url', () => {
    expect(beoordeelOmgeving({ sleutel: SLEUTEL })).toBe('overslaan');
  });

  it('slaat over met een lege omgeving — dit is CI', () => {
    expect(beoordeelOmgeving({})).toBe('overslaan');
  });

  it('valt streng om zonder sleutel — dit is na een db:push', () => {
    expect(beoordeelOmgeving({ url: URL, streng: true })).toBe('ontbreekt');
  });

  it('valt streng om zonder url', () => {
    expect(beoordeelOmgeving({ sleutel: SLEUTEL, streng: true })).toBe('ontbreekt');
  });

  it('valt streng om met een lege omgeving', () => {
    expect(beoordeelOmgeving({ streng: true })).toBe('ontbreekt');
  });

  it('behandelt een lege string als afwezig', () => {
    // ⚠️ Een lege env-var is geen sleutel. Zonder deze regel zou `SUPABASE_
    //    SERVICE_ROLE_KEY=` de controle laten dóórgaan en pas op een HTTP-401
    //    stuklopen — een foutmelding die naar het project wijst in plaats van
    //    naar de omgeving.
    expect(beoordeelOmgeving({ url: URL, sleutel: '' })).toBe('overslaan');
    expect(beoordeelOmgeving({ url: '', sleutel: SLEUTEL, streng: true })).toBe('ontbreekt');
  });
});


