import { describe, expect, it } from 'vitest';

import {
  CODE_ALFABET,
  CODE_LENGTE,
  codeSchema,
  groepSchema,
  huddledagLabel,
  isCodeVorm,
  normaliseerCode,
  toonCode,
  uitnodigingsLink,
} from './schemas';

/**
 * De uitnodigingscode is het enige geheim dat in dit product buiten de app
 * rondgaat: hij staat in WhatsApp-berichten, in schermafbeeldingen en in
 * plakborden. Alles wat hem afzwakt of onnodig weigert, hoort hier vast te staan.
 */

describe('het formaat van de uitnodigingscode', () => {
  it('gebruikt hetzelfde alfabet als generate_invite_code() in migratie 0016', () => {
    // ⚠️ Deze test is de koppeling tussen twee bestanden die niets van elkaar
    //    weten. Loopt hij stuk, dan is één van beide veranderd zonder de ander:
    //    ruimer hier betekent codes accepteren die de server nooit uitgeeft,
    //    krapper betekent een geldige code weigeren voordat de server hem ziet.
    expect(CODE_ALFABET).toBe('23456789ABCDEFGHJKMNPQRSTVWXYZ');
    expect(CODE_ALFABET).toHaveLength(30);
    expect(CODE_LENGTE).toBe(12);
  });

  it('kent geen tekens die door elkaar gehaald worden', () => {
    for (const verwarrend of ['0', 'O', '1', 'I', 'L', 'U']) {
      expect(CODE_ALFABET).not.toContain(verwarrend);
    }
  });

  it('herkent een code van de juiste vorm', () => {
    expect(isCodeVorm('VYHC2X9GSRVH')).toBe(true);
  });

  it('weigert een code die te kort, te lang of buiten het alfabet valt', () => {
    expect(isCodeVorm('VYHC2X9GSRV')).toBe(false);
    expect(isCodeVorm('VYHC2X9GSRVHX')).toBe(false);
    expect(isCodeVorm('VYHC2X9GSRV0')).toBe(false);
  });
});

describe('normaliseerCode — wat mensen echt plakken', () => {
  it('haalt de code uit een volledige uitnodigingslink', () => {
    expect(normaliseerCode('https://goalbuddies.q-projects.tech/uitnodiging/VYHC2X9GSRVH')).toBe(
      'VYHC2X9GSRVH',
    );
  });

  it('overleeft een querystring achter de link', () => {
    expect(normaliseerCode('/uitnodiging/VYHC2X9GSRVH?van=whatsapp')).toBe('VYHC2X9GSRVH');
  });

  it('haalt streepjes, spaties en kleine letters weg', () => {
    expect(normaliseerCode(' vyhc-2x9g-srvh ')).toBe('VYHC2X9GSRVH');
  });

  it('is stabiel: nog een keer normaliseren verandert niets', () => {
    const een = normaliseerCode('vyhc-2x9g-srvh');
    expect(normaliseerCode(een)).toBe(een);
  });

  it('zet geen l naar 1 en geen O naar 0', () => {
    // ⚠️ Dat is de gebruikelijke reflex bij een leescode, en hier is hij fout:
    //    het alfabet kent 0 en 1 juist niet. Zou dit wél gebeuren, dan zou een
    //    verkeerd getypte code stilzwijgend een ándere geldige code kunnen worden.
    expect(normaliseerCode('LOLOLOLOLOLO')).toBe('');
  });
});

describe('toonCode en uitnodigingsLink', () => {
  it('toont de code in drie blokjes van vier', () => {
    expect(toonCode('VYHC2X9GSRVH')).toBe('VYHC-2X9G-SRVH');
  });

  it('bouwt een link die op app/uitnodiging/[code] uitkomt', () => {
    expect(uitnodigingsLink('https://goalbuddies.q-projects.tech', 'vyhc-2x9g-srvh')).toBe(
      'https://goalbuddies.q-projects.tech/uitnodiging/VYHC2X9GSRVH',
    );
  });

  it('verdubbelt de schuine streep niet', () => {
    expect(uitnodigingsLink('https://goalbuddies.q-projects.tech/', 'VYHC2X9GSRVH')).toBe(
      'https://goalbuddies.q-projects.tech/uitnodiging/VYHC2X9GSRVH',
    );
  });
});

describe('codeSchema', () => {
  it('accepteert een geplakte link en geeft de kale code terug', () => {
    const uitkomst = codeSchema.safeParse('  /uitnodiging/vyhc-2x9g-srvh  ');
    expect(uitkomst.success).toBe(true);
    if (uitkomst.success) expect(uitkomst.data).toBe('VYHC2X9GSRVH');
  });

  it('weigert iets dat helemaal geen code is, met een leesbare melding', () => {
    const uitkomst = codeSchema.safeParse('hallo daar');
    expect(uitkomst.success).toBe(false);
    if (!uitkomst.success) {
      expect(uitkomst.error.issues[0]?.message).toContain('uitnodigingscode');
    }
  });
});

describe('groepSchema', () => {
  it('accepteert een gewone groep', () => {
    expect(groepSchema.safeParse({ name: 'De drie musketiers', huddle_day: 0 }).success).toBe(true);
  });

  it('houdt dezelfde naamgrenzen aan als create_group()', () => {
    expect(groepSchema.safeParse({ name: 'A', huddle_day: 0 }).success).toBe(false);
    expect(groepSchema.safeParse({ name: 'A'.repeat(61), huddle_day: 0 }).success).toBe(false);
    expect(groepSchema.safeParse({ name: 'A'.repeat(60), huddle_day: 0 }).success).toBe(true);
  });

  it('weigert een huddledag buiten 0 tot en met 6', () => {
    expect(groepSchema.safeParse({ name: 'Groep', huddle_day: 7 }).success).toBe(false);
    expect(groepSchema.safeParse({ name: 'Groep', huddle_day: -1 }).success).toBe(false);
  });

  it('kent geen invite_code', () => {
    // ⚠️ De belangrijkste eigenschap van dit schema, om dezelfde reden als bij
    //    weekdoelSchema en cycle_start_date: zou de client de code mogen
    //    meesturen, dan bepaalt een formulier hoe raadbaar de uitnodiging is.
    expect(Object.keys(groepSchema.shape)).not.toContain('invite_code');
    expect(Object.keys(groepSchema.shape)).not.toContain('status');
  });
});

describe('huddledagLabel', () => {
  it('gebruikt de nummering van Postgres en shared/time — 0 is zondag', () => {
    expect(huddledagLabel(0)).toBe('Zondag');
    expect(huddledagLabel(1)).toBe('Maandag');
    expect(huddledagLabel(6)).toBe('Zaterdag');
  });
});
