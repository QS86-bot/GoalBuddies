import { describe, expect, it } from 'vitest';

import { WEIGERCODES, magNietLanden } from './harness';

/**
 * De ijking van `magNietLanden()` — de bevinding van 21-08-2026, uitgevoerd.
 *
 * ⚠️ **Deze test heeft geen database nodig en dat is met opzet.** De helper
 *    krijgt zijn twee stappen als functies aangereikt, dus hij is met de hand te
 *    voeden — precies de eis die dit project sinds QS8-115 aan élke controle
 *    stelt: wat je niet kunt voeden, kun je niet ijken. Hij draait dus mee in
 *    elke gewone `npm test`, ook zonder de lokale opstelling.
 *
 * ⚠️ **Waarom deze helper bestaat.** Alleen een schending van de `with check`
 *    geeft `42501`. Ketst de rij af op de `using`, dan filtert RLS hem weg: nul
 *    rijen, HTTP 204, geen fout. Dezelfde policy weigert dus luid of stil,
 *    afhankelijk van welke helft afgaat — en de eerste proef op migratie 0057
 *    concludeerde daaruit letterlijk "gelukt (fout!)" waar de policy juist
 *    correct weigerde.
 */

const eenRij = () => Promise.resolve({ data: [{ id: 1, event: 'spent' }] });

describe('magNietLanden laat door', () => {
  it('een stille weigering: geen fout, en de rij is onveranderd', async () => {
    await expect(
      magNietLanden(() => Promise.resolve({ error: null }), eenRij),
    ).resolves.toBeUndefined();
  });

  it.each(WEIGERCODES)('een luide weigering met %s', async (code) => {
    await expect(
      magNietLanden(() => Promise.resolve({ error: { code, message: 'nee' } }), eenRij),
    ).resolves.toBeUndefined();
  });
});

describe('magNietLanden klaagt', () => {
  it('als de schrijfpoging stil landt', async () => {
    // Het geval waar deze helper voor gebouwd is: geen fout, wél een wijziging.
    let gewist = false;

    await expect(
      magNietLanden(
        () => {
          gewist = true;
          return Promise.resolve({ error: null });
        },
        () => Promise.resolve({ data: gewist ? [] : [{ id: 1 }] }),
      ),
    ).rejects.toThrow(/stille doorlaat/);
  });

  it('als de rij verandert ondanks een fout', async () => {
    let gedraaid = false;

    await expect(
      magNietLanden(
        () => {
          gedraaid = true;
          return Promise.resolve({ error: { code: '42501', message: 'nee' } });
        },
        () => Promise.resolve({ data: [{ id: 1, event: gedraaid ? 'earned' : 'spent' }] }),
      ),
    ).rejects.toThrow(/veranderde alsnog/);
  });

  it('bij een fout die geen weigering is', async () => {
    // ⚠️ Een typo in een kolomnaam geeft óók een fout en verandert óók niets.
    //    Zonder deze toets blijft zo'n test staan als bewijs voor een policy die
    //    hij nooit heeft aangeraakt.
    await expect(
      magNietLanden(
        () => Promise.resolve({ error: { code: '42703', message: 'column x does not exist' } }),
        eenRij,
      ),
    ).rejects.toThrow(/onverwachte code 42703/);
  });

  it('als er niets te veranderen valt', async () => {
    // ⚠️ "Onveranderd" is gratis als het filter niets raakt. Dan bewijst de test
    //    geen slot maar een lege selectie.
    await expect(
      magNietLanden(
        () => Promise.resolve({ error: null }),
        () => Promise.resolve({ data: [] }),
      ),
    ).rejects.toThrow(/niets terug/);
  });

  it('ook als `lees()` null teruggeeft in plaats van een lege lijst', async () => {
    await expect(
      magNietLanden(
        () => Promise.resolve({ error: null }),
        () => Promise.resolve({ data: null }),
      ),
    ).rejects.toThrow(/niets terug/);
  });
});
