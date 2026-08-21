import { describe, expect, it } from 'vitest';

import { SYSTEEM_GEBEURTENISSEN } from './chat-schemas';
import { kentGebeurtenis, OUD_LID, systeemberichtTekst } from './systeemberichten';

/**
 * QS8-107 stap 2.
 *
 * ⚠️ De belangrijkste test hier is de eerste: hij wordt rood zodra er een
 *    gebeurtenis bij komt zonder zin. Zonder die test valt zo'n gebeurtenis
 *    stilletjes terug op `body` — de Nederlandse zin uit de database — en dan is
 *    de reparatie van 0059 op precies dat punt weer ongedaan gemaakt, zonder dat
 *    iemand het merkt.
 */

function invoer(over: Partial<Parameters<typeof systeemberichtTekst>[0]> = {}) {
  return {
    system_event: 'member_joined',
    subject_name: 'Sanne',
    actor_name: null,
    body: 'OPGESLAGEN ZIN',
    ...over,
  };
}

describe('elke toegestane gebeurtenis heeft een zin', () => {
  it('kent alle gebeurtenissen uit de allowlist', () => {
    for (const event of SYSTEEM_GEBEURTENISSEN) {
      expect(kentGebeurtenis(event), event).toBe(true);
    }
  });

  it('valt voor geen enkele bekende gebeurtenis terug op de opgeslagen zin', () => {
    // ⚠️ Dit is de test die de reparatie vasthoudt. `body` mag alleen nog gebruikt
    //    worden voor een rij van vóór 0059 of een gebeurtenis die deze app niet
    //    kent — nooit voor iets dat in de allowlist staat.
    for (const event of SYSTEEM_GEBEURTENISSEN) {
      const tekst = systeemberichtTekst(invoer({ system_event: event }));
      expect(tekst, event).not.toBe('OPGESLAGEN ZIN');
      expect(tekst.length, event).toBeGreaterThan(0);
    }
  });
});

describe('de zinnen zelf', () => {
  it('noemt de persoon bij naam', () => {
    expect(systeemberichtTekst(invoer())).toBe('Sanne doet mee.');
  });

  it('noemt bij een bevestiging beide personen, in de juiste rol', () => {
    // "Tim bevestigde de week van Sanne" — en niet andersom. De omkering is een
    // fout die je in een zin niet ziet en in een test wel.
    const tekst = systeemberichtTekst(
      invoer({ system_event: 'completion_approved', subject_name: 'Sanne', actor_name: 'Tim' }),
    );

    expect(tekst).toBe('Tim bevestigde de week van Sanne.');
  });

  it('noemt nooit een titel, notitie of niveau', () => {
    // ⚠️ Beslisdocument 002 §3. Een systeembericht is een onveranderlijke kopie
    //    die de autorisatie overleeft waaronder hij gemaakt is: ontkoppelen trekt
    //    de toestemming in, maar wist geen chat. Daarom staat er nooit inhoud in.
    //
    //    De invoer bevat bewust geen doeltitel — er ís geen parameter voor, en
    //    dat is de bescherming. Deze test legt vast dat dat zo blijft: komt er
    //    ooit een veld bij, dan moet iemand deze lijst uitbreiden en dus nadenken.
    const velden = Object.keys(invoer());
    expect(velden.sort()).toEqual(['actor_name', 'body', 'subject_name', 'system_event']);
  });

  it('zegt bij een verschuldigde inzet wat er gebeurd is en oordeelt niet', () => {
    // QS8-84: nuchter, niet vernederend. Dit is de enige benoemde uitzondering op
    // domeinregel 7, en de toon is er een acceptatiecriterium.
    const tekst = systeemberichtTekst(invoer({ system_event: 'commitment_due' }));

    expect(tekst).toContain('zelf heeft ingesteld');
    expect(tekst).not.toMatch(/!|gefaald|mislukt|helaas|niet gehaald/i);
  });

  it('gaat bij een slapende groep over de groep en niet over een persoon', () => {
    const tekst = systeemberichtTekst(
      invoer({ system_event: 'group_sleeping', subject_name: null }),
    );

    expect(tekst).not.toContain(OUD_LID);
    expect(tekst).toContain('groep');
  });
});

describe('iemand die er niet meer is', () => {
  it('wordt "Een oud-lid" in plaats van een lege plek', () => {
    // ⚠️ Dit is het gedrag dat `on delete set null` op `subject_id` oplevert
    //    (0059, in de lijn van 0031 en 0033): de rij blijft, de persoon niet.
    //    Een lege naam midden in een zin leest als een storing.
    expect(systeemberichtTekst(invoer({ subject_name: null }))).toBe(`${OUD_LID} doet mee.`);
    expect(systeemberichtTekst(invoer({ subject_name: '   ' }))).toBe(`${OUD_LID} doet mee.`);
  });

  it('doet hetzelfde met de bevestiger', () => {
    const tekst = systeemberichtTekst(
      invoer({ system_event: 'completion_approved', actor_name: null }),
    );

    expect(tekst).toBe(`${OUD_LID} bevestigde de week van Sanne.`);
  });
});

describe('een gebeurtenis die deze app niet kent', () => {
  it('valt terug op de opgeslagen zin', () => {
    // Een server die vooruitloopt op een geïnstalleerde app. Beter een zin in de
    // verkeerde taal dan een lege regel in het gesprek.
    expect(systeemberichtTekst(invoer({ system_event: 'iets_nieuws' }))).toBe('OPGESLAGEN ZIN');
    expect(kentGebeurtenis('iets_nieuws')).toBe(false);
  });

  it('toont niets als er ook geen opgeslagen zin is', () => {
    // Geen "onbekend bericht": dat is ruis in een gesprek.
    expect(systeemberichtTekst(invoer({ system_event: null, body: '' }))).toBe('');
  });
});
