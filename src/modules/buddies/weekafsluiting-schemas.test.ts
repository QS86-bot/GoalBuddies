import { describe, expect, it } from 'vitest';

import {
  ANTWOORD_MAX,
  groepeerReacties,
  heeftInhoud,
  REACTIE_MAX,
  reactieSchema,
  voorstelUitDagzetten,
  vragen,
  weekafsluitingSchema,
  type Antwoord,
  type Reactie,
} from './weekafsluiting-schemas';

/**
 * QS8-73 — de weekafsluiting.
 *
 * Twee dingen staan hier vast en die zijn allebei een acceptatiecriterium:
 * overslaan mag zonder spoor, en vraag 1 komt uit je eigen Dagzetten zonder dat
 * die daarmee automatisch gedeeld worden.
 */

function antwoord(over: Partial<Antwoord> = {}): Antwoord {
  return {
    review_id: 'r1',
    user_id: 'u1',
    display_name: 'Sanne',
    avatar_url: null,
    did_text: null,
    blocked_text: null,
    next_text: null,
    created_at: '2026-08-16T09:00:00Z',
    ...over,
  };
}

function reactie(over: Partial<Reactie> & { id: string; week_review_id: string }): Reactie {
  return {
    author_id: 'u2',
    author_name: 'Tim',
    author_avatar: null,
    body: 'mooi',
    created_at: '2026-08-16T10:00:00Z',
    ...over,
  };
}

describe('de drie vragen', () => {
  it('staan in de volgorde van het voorstel: gedaan, in de weg, volgende week', () => {
    expect(vragen().map((v) => v.veld)).toEqual(['did_text', 'blocked_text', 'next_text']);
  });

  it('hebben alle drie een hint, want de toon doet hier het werk', () => {
    // ⚠️ Vraag 2 is de enige plek in de app waar tegenslag benoemd wordt. Zonder
    //    hint is het een leeg veld met een confronterende kop erboven, en dan voelt
    //    het als een bekentenis in plaats van als het derde punt van de agenda.
    for (const vraag of vragen()) {
      expect(vraag.hint.length).toBeGreaterThan(10);
      expect(vraag.placeholder.length).toBeGreaterThan(10);
    }
  });
});

describe('de grenzen van een antwoord', () => {
  it('houdt dezelfde bovengrenzen aan als migratie 0026', () => {
    // Loopt dit stuk, dan is de app ruimer of krapper dan de database.
    expect(ANTWOORD_MAX).toBe(2000);
    expect(REACTIE_MAX).toBe(1000);
  });

  it('weigert drie lege velden', () => {
    // ⚠️ De tegenhanger van `week_reviews_iets_ingevuld`. Zonder deze regel levert
    //    "opslaan" een lid op dat op de kaart staat met niets erin — precies wat
    //    "wie niets invult verschijnt gewoon niet" uitsluit.
    const uitkomst = weekafsluitingSchema.safeParse({
      did_text: '   ',
      blocked_text: '',
      next_text: '\n',
    });

    expect(uitkomst.success).toBe(false);
  });

  it('neemt één ingevuld veld aan, ook als het vraag 2 is', () => {
    for (const veld of ['did_text', 'blocked_text', 'next_text'] as const) {
      const invoer = { did_text: '', blocked_text: '', next_text: '', [veld]: 'iets' };
      expect(weekafsluitingSchema.safeParse(invoer).success).toBe(true);
    }
  });

  it('weigert een antwoord dat één teken over de grens gaat', () => {
    const grens = { did_text: 'x'.repeat(ANTWOORD_MAX), blocked_text: '', next_text: '' };
    const erover = { did_text: 'x'.repeat(ANTWOORD_MAX + 1), blocked_text: '', next_text: '' };

    expect(weekafsluitingSchema.safeParse(grens).success).toBe(true);
    expect(weekafsluitingSchema.safeParse(erover).success).toBe(false);
  });

  it('weigert een lege reactie', () => {
    expect(reactieSchema.safeParse({ body: '  ' }).success).toBe(false);
    expect(reactieSchema.safeParse({ body: 'ja!' }).success).toBe(true);
  });
});

describe('wat er op de kaart komt', () => {
  it('rekent een antwoord met alleen witruimte als leeg', () => {
    // ⚠️ Anders staat er een naam op de kaart met niets eronder, en dat leest als
    //    een storing — of erger, als iemand die iets wilde zeggen en het niet deed.
    expect(heeftInhoud(antwoord({ did_text: '   ', blocked_text: '', next_text: null }))).toBe(
      false,
    );
    expect(heeftInhoud(antwoord({ next_text: 'hoofdstuk drie' }))).toBe(true);
  });

  it('groepeert de reacties per antwoord in één doorloop', () => {
    const per = groepeerReacties([
      reactie({ id: 'a', week_review_id: 'r1' }),
      reactie({ id: 'b', week_review_id: 'r2' }),
      reactie({ id: 'c', week_review_id: 'r1' }),
    ]);

    expect(per.get('r1')?.map((r) => r.id)).toEqual(['a', 'c']);
    expect(per.get('r2')?.map((r) => r.id)).toEqual(['b']);
    expect(per.get('r3')).toBeUndefined();
  });
});

describe('vraag 1 voorvullen uit de Dagzetten', () => {
  it('zet de Dagzetten oudste eerst onder elkaar', () => {
    // ⚠️ `fetchDagzetten()` levert nieuwste eerst. Een week leest van voor naar
    //    achter, dus deze functie sorteert zelf — en op `local_date`, want dat is
    //    de dag in de tijdzone van de gebruiker.
    const voorstel = voorstelUitDagzetten([
      { body: 'woensdag geschreven', local_date: '2026-08-19' },
      { body: 'maandag geschreven', local_date: '2026-08-17' },
      { body: 'dinsdag geschreven', local_date: '2026-08-18' },
    ]);

    expect(voorstel).toBe('maandag geschreven\ndinsdag geschreven\nwoensdag geschreven');
  });

  it('laat dezelfde regel maar één keer staan', () => {
    const voorstel = voorstelUitDagzetten([
      { body: 'een uur gelopen', local_date: '2026-08-17' },
      { body: 'een uur gelopen', local_date: '2026-08-18' },
    ]);

    expect(voorstel).toBe('een uur gelopen');
  });

  it('slaat lege Dagzetten over', () => {
    const voorstel = voorstelUitDagzetten([
      { body: '  ', local_date: '2026-08-17' },
      { body: 'iets', local_date: '2026-08-18' },
    ]);

    expect(voorstel).toBe('iets');
  });

  it('geeft een lege string als er geen Dagzetten zijn', () => {
    // Dan begint vraag 1 gewoon leeg, en dat is een geldige uitkomst en geen fout.
    expect(voorstelUitDagzetten([])).toBe('');
  });

  it('blijft binnen de grens die de database aanhoudt', () => {
    // ⚠️ Zonder deze afkapping levert een week vol lange Dagzetten een voorstel op
    //    dat de database weigert — en dan krijgt iemand een foutmelding voor tekst
    //    die de app zelf heeft ingevuld.
    const lang = Array.from({ length: 30 }, (_, i) => ({
      body: `${i} ${'x'.repeat(200)}`,
      local_date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    }));

    expect(voorstelUitDagzetten(lang).length).toBeLessThanOrEqual(ANTWOORD_MAX);
  });
});

/**
 * Acceptatiecriterium 2 van QS8-118 — het voorstel mag nooit op een halve
 * codepoint eindigen. `slice(0, ANTWOORD_MAX)` deed dat wel.
 */
describe('voorstelUitDagzetten met emoji', () => {
  const EMOJI = '\u{1F600}';
  const GEZIN = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';

  function heeftLosseSurrogate(tekst: string): boolean {
    return Array.from(tekst).some((teken) => {
      const punt = teken.codePointAt(0) ?? 0;
      return punt >= 0xd800 && punt <= 0xdfff;
    });
  }

  it('eindigt nooit op een halve codepoint bij afkappen', () => {
    // Ruim over de grens, met een emoji precies op elke mogelijke snijplek.
    const dagzetten = Array.from({ length: 40 }, (_, i) => ({
      body: `${'x'.repeat(60)}${EMOJI}${i}`,
      local_date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
    }));

    const uit = voorstelUitDagzetten(dagzetten);

    expect(heeftLosseSurrogate(uit)).toBe(false);
  });

  it('blijft binnen de grens die de database telt', () => {
    const dagzetten = Array.from({ length: 40 }, (_, i) => ({
      body: `${GEZIN.repeat(20)}-${i}`,
      local_date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
    }));

    const uit = voorstelUitDagzetten(dagzetten);

    // char_length telt codepunten, niet UTF-16-eenheden.
    expect(Array.from(uit).length).toBeLessThanOrEqual(ANTWOORD_MAX);
    expect(heeftLosseSurrogate(uit)).toBe(false);
  });

  it('laat een kort voorstel met emoji ongemoeid', () => {
    const uit = voorstelUitDagzetten([
      { body: `Vandaag gelopen ${EMOJI}`, local_date: '2026-08-20' },
    ]);

    expect(uit).toBe(`Vandaag gelopen ${EMOJI}`);
  });
});
