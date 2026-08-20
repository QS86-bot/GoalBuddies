import { describe, expect, it } from 'vitest';

import { hulpvraagVoorstel } from './hulpvraag';

describe('hulpvraagVoorstel', () => {
  it('noemt het doel en de resterende tijd', () => {
    const tekst = hulpvraagVoorstel({ doeltitel: 'Website live', wekenOver: 5 });

    expect(tekst).toContain('Website live');
    expect(tekst).toContain('5 weken');
  });

  it('gebruikt enkelvoud bij één week', () => {
    const tekst = hulpvraagVoorstel({ doeltitel: 'Boek af', wekenOver: 1 });
    expect(tekst).toContain('1 week');
    expect(tekst).not.toContain('1 weken');
  });

  it('laat de tijd weg als er niets zinnigs over te zeggen valt', () => {
    for (const wekenOver of [null, 0]) {
      const tekst = hulpvraagVoorstel({ doeltitel: 'Iets', wekenOver });
      expect(tekst).not.toContain('weken te gaan');
      expect(tekst).not.toContain('null');
      expect(tekst).not.toContain('NaN');
    }
  });

  /**
   * ⚠️ De belangrijkste test van dit bestand. De hulpvraag is een van de drie
   *    routes waarlangs tegenslag de groep bereikt, en het voorstel dat de app
   *    invult mag die route niet oprekken. "Ik heb drie weken gemist" is een
   *    feit over het verleden; de app zet dat er niet in. Wil de gebruiker het
   *    erbij typen, dan mag dat — dat is dan zijn keuze, en dat is het verschil.
   */
  it('zet geen gemiste weken of reeks in het voorstel', () => {
    const tekst = hulpvraagVoorstel({ doeltitel: 'Website live', wekenOver: 5 }).toLowerCase();

    for (const verboden of ['gemist', 'reeks', 'streak', 'achterstand van', 'punten']) {
      expect(tekst, verboden).not.toContain(verboden);
    }
  });

  it('blijft binnen de berichtlengte, ook bij een lange doeltitel', () => {
    const tekst = hulpvraagVoorstel({
      doeltitel: 'x'.repeat(200),
      wekenOver: 52,
    });

    expect(tekst.length).toBeLessThan(4000);
  });

  it('eindigt met een open vraag', () => {
    // De uitnodiging om te reageren is de hele bedoeling: dit is geen mededeling
    // maar een vraag aan drie mensen die je zelf hebt uitgekozen.
    expect(hulpvraagVoorstel({ doeltitel: 'Iets', wekenOver: 3 })).toMatch(/\?$/);
  });
});
