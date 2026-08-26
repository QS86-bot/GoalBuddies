import { describe, expect, it } from 'vitest';

import {
  genereerVapidSleutelpaar,
  vapidAuthorization,
} from '../../src/modules/notifications/webpush-crypto';
// ⚠️ Een `.mjs` zonder eigen typings, net als bij `migratieregister-vergelijk`.
import { controleerPaar, instructies } from '../../scripts/vapid.mjs';

/**
 * `npm run vapid:controle` — QS8-114/QS8-124.
 *
 * ⚠️ **Waarom deze test bestaat.** De controle draait alleen ergens waar de drie
 *    waarden staan, en die staan hier nooit: de privésleutel hoort uitsluitend
 *    in de omgeving van de Edge Function. Een controle die je nooit rood ziet
 *    worden is een aanname (CLAUDE.md, bij de secret-scan van de deploy), dus
 *    wordt élk faalgeval hier met de hand gebroken — én élk geval dat hij met
 *    rust moet laten. Die tweede helft is even belangrijk: een controle die
 *    alles meldt, leert je hem te negeren.
 *
 * ⚠️ **De bewaakte belofte is een naad en geen onderdeel.** De publieke sleutel
 *    staat in de webbundel, de privésleutel in de omgeving van de Edge Function,
 *    het subject weer ergens anders. Elk van de drie kan op zichzelf perfect
 *    zijn terwijl ze niet bij elkaar horen — en dan gaat er niets kapot dat je
 *    kunt zien. WebCrypto weigert pas bij het ondertekenen, in een job die eens
 *    per uur draait, en de gebruiker merkt alleen dat er geen melding komt.
 */
describe('vapid-controle', () => {
  const echtOndertekenen = async (invoer: {
    publiek: string;
    prive: string;
    subject: string;
  }): Promise<void> => {
    await vapidAuthorization({
      endpoint: 'https://fcm.googleapis.com/fcm/send/controle',
      publiekeSleutel: invoer.publiek,
      priveSleutel: invoer.prive,
      subject: invoer.subject,
      nu: new Date('2026-08-25T12:00:00Z'),
    });
  };

  it('laat een kloppend drietal met rust', async () => {
    const paar = await genereerVapidSleutelpaar();

    const klachten = await controleerPaar(
      { publiek: paar.publiek, prive: paar.prive, subject: 'mailto:a@b.nl' },
      echtOndertekenen,
    );

    expect(klachten).toEqual([]);
  });

  it('vindt een gekruist sleutelpaar', async () => {
    // ⚠️ Dit is de fout waar geen enkele andere controle op aanslaat: twee
    //    geldige sleutels die niet bij elkaar horen. Beide waarden zien er goed
    //    uit, de lengtes kloppen, en pas de pushdienst weigert — met een 403
    //    zonder uitleg, uren later.
    const a = await genereerVapidSleutelpaar();
    const b = await genereerVapidSleutelpaar();

    const klachten = await controleerPaar(
      { publiek: a.publiek, prive: b.prive, subject: 'mailto:a@b.nl' },
      echtOndertekenen,
    );

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('horen niet bij elkaar');
  });

  it.each([
    ['publiek', { prive: 'x', subject: 'mailto:a@b.nl' }, 'EXPO_PUBLIC_VAPID_PUBLIC_KEY'],
    ['privé', { publiek: 'x', subject: 'mailto:a@b.nl' }, 'VAPID_PRIVATE_KEY'],
    ['subject', { publiek: 'x', prive: 'y' }, 'VAPID_SUBJECT'],
  ])('meldt een ontbrekende %s', async (_naam, waarden, verwacht) => {
    const klachten = await controleerPaar(waarden, echtOndertekenen);

    expect(klachten.join('\n')).toContain(verwacht);
  });

  it('meldt een subject zonder mailto: of https:', async () => {
    // RFC 8292 §2.1. Een kaal e-mailadres is de voor de hand liggende invoer en
    // precies wat de pushdienst weigert.
    const paar = await genereerVapidSleutelpaar();

    const klachten = await controleerPaar(
      { publiek: paar.publiek, prive: paar.prive, subject: 'quinten@voorbeeld.nl' },
      echtOndertekenen,
    );

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('RFC 8292');
  });

  it('laat een https:-subject met rust', async () => {
    const paar = await genereerVapidSleutelpaar();

    const klachten = await controleerPaar(
      { publiek: paar.publiek, prive: paar.prive, subject: 'https://goalbuddies.q-projects.tech' },
      echtOndertekenen,
    );

    expect(klachten).toEqual([]);
  });

  it('ondertekent niet zolang er een waarde ontbreekt', async () => {
    // ⚠️ Anders is de melding "de sleutels horen niet bij elkaar" terwijl er
    //    gewoon eentje leeg is, en dan gaat iemand het verkeerde repareren.
    let aangeroepen = false;

    const klachten = await controleerPaar({ publiek: 'x' }, async () => {
      aangeroepen = true;
    });

    expect(aangeroepen).toBe(false);
    expect(klachten.length).toBeGreaterThan(0);
  });

  it('zet de privésleutel nooit in de .env-regel', () => {
    // ⚠️ De privésleutel hoort alleen achter `supabase secrets set`. Belandt hij
    //    ooit in de regel die voor `.env` bedoeld is, dan staat hij op schijf
    //    naast een bestand dat gedeeld wordt — en het voorvoegsel `EXPO_PUBLIC_`
    //    is dan de enige rem die er nog is.
    const regels: string[] = instructies(
      { publiek: 'PUBLIEK-HIER', prive: 'PRIVE-HIER' },
      'mailto:a@b.nl',
    );

    const envRegel = regels.find((r) => r.includes('EXPO_PUBLIC_VAPID_PUBLIC_KEY='));
    expect(envRegel).toBeDefined();
    expect(envRegel).not.toContain('PRIVE-HIER');

    // En hij staat er wél waar hij hoort.
    expect(regels.join('\n')).toContain('supabase secrets set VAPID_PRIVATE_KEY=PRIVE-HIER');
  });
});
