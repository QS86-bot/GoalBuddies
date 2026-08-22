import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, zetTaal } from '../i18n';

import { bevestigingen } from './acties';
import { hulpvraagVoorstel } from './hulpvraag';
import {
  kettingLabel,
  puntenUitleg,
  streakLabel,
  weekpasLabel,
  weekpasUitleg,
  weekpasVoortgang,
} from './metrics';
import { risicoLabel, risicoUitleg } from './risico';
import { viering } from './vieringen';

/**
 * QS8-115: de tekstcatalogi van `shared/ui` — bevestigingen, vieringen, de
 * hulpvraag en de Risico-radar.
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

describe('de Risico-radar telt en formatteert per taal', () => {
  it('gebruikt de enkelvoudsvorm bij één mijlpaal', () => {
    // ⚠️ Dit was een bestaande fout, geen fout die de catalogus introduceerde:
    //    de zin zei onvoorwaardelijk "mijlpalen", dus "1 mijlpalen" stond er
    //    gewoon. Het overzetten naar de catalogus was het moment om hem te
    //    repareren.
    zetTaal('nl');
    const tekst = risicoUitleg('unreachable', { weken_over: 0, open_mijlpalen: 1 });

    expect(tekst).toContain('1 mijlpaal');
    expect(tekst).not.toContain('1 mijlpalen');
  });

  it('gebruikt de meervoudsvorm bij meer dan één', () => {
    zetTaal('nl');
    expect(risicoUitleg('unreachable', { weken_over: 0, open_mijlpalen: 4 })).toContain(
      '4 mijlpalen',
    );
  });

  it('telt ook weken in enkelvoud', () => {
    zetTaal('nl');
    const tekst = risicoUitleg('unreachable', { weken_over: 1, open_mijlpalen: 3 });

    expect(tekst).toContain('1 week');
    expect(tekst).not.toMatch(/1 weken/);
  });

  it('schrijft het decimaalteken van de taal', () => {
    // ⚠️ Tot QS8-115 stond hier een harde `.replace('.', ',')`. In het Engels
    //    leest "0,5" als een opsomming of als vijfhonderd — het soort fout dat je
    //    in een vertaalde app pas ziet als iemand zich meldt.
    const reden = {
      weken_over: 10,
      open_mijlpalen: 5,
      cycli_bekeken: 4,
      cycli_gehaald: 2,
      tempo: 0.5,
      benodigd_tempo: 0.5,
      vloeraandeel: 0,
    };

    zetTaal('nl');
    expect(risicoUitleg('at_risk', reden)).toContain('0,5');

    zetTaal('en');
    const engels = risicoUitleg('at_risk', reden);
    expect(engels).toContain('0.5');
    expect(engels).not.toContain('0,5');
  });

  it('vertaalt de vier labels', () => {
    zetTaal('nl');
    expect(risicoLabel('unreachable')).toBe('Deadline onhaalbaar');

    zetTaal('en');
    expect(risicoLabel('unreachable')).toBe('Deadline out of reach');
  });

  it('houdt in beide talen elke stand een eigen label', () => {
    // Zelfde eis als in `risico.test.ts`, maar nu ook voor de vertaling: twee
    // standen die hetzelfde heten, zijn twee standen die je niet uit elkaar houdt.
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);
      const labels = new Set(
        (['on_track', 'at_risk', 'behind', 'unreachable'] as const).map(risicoLabel),
      );
      expect(labels.size, taalcode).toBe(4);
    }
  });

  it('bevat in geen enkele taal een gat bij een lege onderbouwing', () => {
    // De Engelse kant van de bestaande test in `risico.test.ts`. Een ontbrekende
    // vertaling zou hier als "undefined" of als de kale sleutel opduiken.
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);
      for (const stand of ['on_track', 'at_risk', 'behind', 'unreachable'] as const) {
        const tekst = risicoUitleg(stand, null);
        expect(tekst, `${taalcode}/${stand}`).not.toMatch(/NaN|null|undefined|^risico\./);
        expect(tekst.length, `${taalcode}/${stand}`).toBeGreaterThan(20);
      }
    }
  });
});

describe('reeks, Ketting en weekpassen volgen de taal', () => {
  const pas = (over: Partial<Parameters<typeof weekpasLabel>[0]> = {}) => ({
    voorraad: 1,
    maximum: 2,
    voltooideCycli: 3,
    totVolgende: 3,
    laatstVerbruikt: null,
    ...over,
  });

  it('telt reeksen in enkelvoud en meervoud, in beide talen', () => {
    zetTaal('nl');
    expect(streakLabel(1)).toBe('1 week op rij');
    expect(streakLabel(7)).toBe('7 weken op rij');
    expect(streakLabel(0)).toBe('Nog geen reeks');

    zetTaal('en');
    expect(streakLabel(1)).toBe('1 week in a row');
    expect(streakLabel(7)).toBe('7 weeks in a row');
    expect(streakLabel(0)).toBe('No streak yet');
  });

  it('telt weekpassen in enkelvoud en meervoud', () => {
    zetTaal('nl');
    expect(weekpasLabel(pas({ voorraad: 1 }))).toBe('1 weekpas van 2');
    expect(weekpasLabel(pas({ voorraad: 2 }))).toBe('2 weekpassen van 2');

    zetTaal('en');
    expect(weekpasLabel(pas({ voorraad: 1 }))).toBe('1 week pass of 2');
    expect(weekpasLabel(pas({ voorraad: 2 }))).toBe('2 week passes of 2');
  });

  it('houdt De Ketting in beide talen bij wat er wél is', () => {
    // ⚠️ De Ketting telt opdagen en is onderweg per definitie onaf. "1 van 3"
    //    leest als een tekortkoming; er staat daarom nooit wat er mist. Deze
    //    eis geldt ook voor de vertaling — een vertaler die "1 of 3" schrijft,
    //    haalt de hele bescherming weg.
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);
      const tekst = kettingLabel({ schakels: 1, inAanmerking: 3, voltallig: false });

      expect(tekst, taalcode).not.toMatch(/van 3|of 3|nog \d|te gaan|mist|missing|left/i);
    }
  });

  it('vertaalt de puntenuitleg met dezelfde getallen', () => {
    // De cijfers zijn domeinregel 10 en geen tekst: +2, +1, −1, 0. Een vertaling
    // die daaraan tornt, beschrijft een ander product.
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);
      const tekst = puntenUitleg();

      expect(tekst, taalcode).toContain('+2');
      expect(tekst, taalcode).toContain('+1');
      expect(tekst, taalcode).toContain('−1');
    }
  });

  it('zegt in beide talen dat het minpunt blijft en dat je niets hoeft te doen', () => {
    // ⚠️ De drie dingen die in WEEKPAS_UITLEG stonden en die een gebruiker er
    //    anders verkeerd van maakt: het minpunt blijft, je hoeft niets te doen,
    //    en het is per doel. In het Nederlands bewaakt `metrics.test.ts` dat al;
    //    dit is de Engelse kant.
    zetTaal('en');
    const tekst = weekpasUitleg();

    expect(tekst).toMatch(/streak/i);
    expect(tekst).toMatch(/point/i);
    expect(tekst).toMatch(/automatically|do not have to/i);
    expect(tekst).toMatch(/per goal/i);
  });

  it('zegt bij een volle voorraad dat een extra pas vrijkomt en niet vervalt', () => {
    // Migratie 0042 draaide dat om: een pas die je verdient terwijl je vol zit,
    // vervalt niet meer. Wie zes weken doorwerkt, wil weten of dat werk ergens
    // heen gaat.
    zetTaal('en');
    const tekst = weekpasVoortgang(pas({ voorraad: 2, maximum: 2 }));

    expect(tekst).toMatch(/free/i);
    expect(tekst).not.toMatch(/expire|lost/i);
  });
});
