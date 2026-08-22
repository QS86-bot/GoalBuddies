import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, zetTaal } from '../i18n';

import { bevestigingen } from './acties';
import { hulpvraagVoorstel } from './hulpvraag';
import { viering } from './vieringen';

/**
 * QS8-115, eerste slice: de tekstcatalogi van `shared/ui`.
 *
 * ⚠️ **Waarom deze tests bestaan naast de bestaande.** `acties.test.ts` en
 *    `vieringen.test.ts` toetsen de Nederlandse teksten op inhoud — dat een
 *    bevestiging zegt wat hij kost, dat een viering niet overdrijft. Die blijven
 *    en zijn belangrijker dan deze. Wat ze níét kunnen zien, is of de tekst
 *    überhaupt nog van de taal afhangt.
 *
 *    Dat is namelijk de valkuil van deze migratie: haalt iemand later `t()` weg
 *    en zet hij de Nederlandse zin weer hard in de code, dan blijven alle
 *    bestaande tests groen. Deze niet.
 */

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

describe('de teksten volgen de taal', () => {
  it('geeft bevestigingen in de ingestelde taal', () => {
    zetTaal('nl');
    expect(bevestigingen().doelAfronden.titel).toBe('Dit doel afronden?');

    zetTaal('en');
    expect(bevestigingen().doelAfronden.titel).toBe('Complete this goal?');
  });

  it('geeft vieringen in de ingestelde taal, met dezelfde vorm', () => {
    zetTaal('nl');
    const nl = viering('doel');

    zetTaal('en');
    const en = viering('doel');

    expect(nl.titel).not.toBe(en.titel);

    // ⚠️ Niveau en duur zijn geen tekst en horen dus niet te veranderen. Een
    //    vertaler heeft niets te zeggen over hoe lang een animatie duurt.
    expect(en.niveau).toBe(nl.niveau);
    expect(en.duurMs).toBe(nl.duurMs);
    expect(en.soort).toBe('doel');
  });

  it('geeft de hulpvraag in de ingestelde taal', () => {
    zetTaal('nl');
    expect(hulpvraagVoorstel({ doeltitel: 'Boek schrijven', wekenOver: 3 })).toBe(
      'Ik loop achter op "Boek schrijven". Ik heb nog 3 weken te gaan. Iemand een idee?',
    );

    zetTaal('en');
    expect(hulpvraagVoorstel({ doeltitel: 'Write a book', wekenOver: 3 })).toBe(
      'I am behind on "Write a book". I have 3 weeks left. Any ideas?',
    );
  });
});

describe('de hulpvraag telt goed', () => {
  it('gebruikt de enkelvoudsvorm bij één week', () => {
    // ⚠️ Dit was vóór QS8-115 een ternary in de zin zelf. Nu is het een eigen
    //    sleutel, omdat `t()` geen meervoudsregels kent — en dat is bewust: zodra
    //    er een taal bij komt met meer dan twee vormen (Pools heeft er drie), is
    //    dit de plek waar dat zichtbaar wordt.
    zetTaal('nl');
    expect(hulpvraagVoorstel({ doeltitel: 'X', wekenOver: 1 })).toContain('1 week te gaan');
    expect(hulpvraagVoorstel({ doeltitel: 'X', wekenOver: 1 })).not.toContain('weken');

    zetTaal('en');
    expect(hulpvraagVoorstel({ doeltitel: 'X', wekenOver: 1 })).toContain('1 week left');
  });

  it('laat de tijd weg als er niets zinnigs over te zeggen valt', () => {
    // Nul of minder weken: dan is "ik heb nog 0 weken" geen informatie maar een
    // verwijt aan jezelf.
    for (const weken of [0, -2, null]) {
      const tekst = hulpvraagVoorstel({ doeltitel: 'X', wekenOver: weken });
      expect(tekst, String(weken)).not.toContain('te gaan');
    }
  });

  it('noemt nooit een gemiste week of een reeks', () => {
    // ⚠️ Domeinregel 7. Dit is een van de drie routes waarlangs tegenslag de
    //    groep bereikt, en de app hoort er niets bij te verzinnen: hoevéél iemand
    //    achterloopt, blijft van hem. De gebruiker mag het zelf typen.
    const tekst = hulpvraagVoorstel({ doeltitel: 'X', wekenOver: 4 });

    expect(tekst).not.toMatch(/gemist|reeks|streak|missed/i);
  });
});
