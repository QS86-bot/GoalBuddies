/**
 * "Geen persoonsgegevens in events" is een acceptatiecriterium van QS8-24, en
 * het enige deel daarvan dat je kunt bewijzen zonder Sentry aangesloten te
 * hebben. Deze tests zijn dat bewijs.
 */
import { describe, expect, it } from 'vitest';

import { REDACTED, scrubContext, scrubMessage, scrubStack } from './scrub';

describe('scrubMessage', () => {
  it('haalt e-mailadressen eruit', () => {
    expect(scrubMessage('kon quinten.strijdonk@gmail.com niet vinden')).not.toContain('@gmail');
    expect(scrubMessage('kon quinten.strijdonk@gmail.com niet vinden')).toContain('[e-mail]');
  });

  it('haalt JWTs en keys eruit', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-123';
    expect(scrubMessage(`Authorization: Bearer ${jwt}`)).toBe(
      'Authorization: Bearer [token]',
    );
  });

  it('haalt de constraintnaam uit een Postgres-melding', () => {
    // ⚠️ **Deze test heette tot 28-08-2026 "haalt de geciteerde waarde uit een
    //    Postgres-melding" en had er een comment bij dat hij het lek van de
    //    uitnodigingscode dekte.** Dat deed hij niet: de melding hieronder
    //    bevat geen uitnodigingscode, alleen een constraintnaam. Hij was groen
    //    terwijl elke code ongeschoond naar Sentry ging. De naam zegt nu wat hij
    //    doet; de échte belofte staat in de test hieronder.
    const melding = 'duplicate key value violates unique constraint "groups_invite_code_key"';
    expect(scrubMessage(melding)).not.toContain('groups_invite_code_key');
    expect(scrubMessage(melding)).toContain(REDACTED);
  });

  describe('de waarde uit een Postgres DETAIL-regel', () => {
    /**
     * ⚠️ **Deze vier meldingen zijn overgetypt uit een échte Postgres 16**, niet
     *    bedacht. De oude fixture schreef `=('zomer-2026')` mét aanhalingstekens
     *    en dáárop sloeg `QUOTED` aan — Postgres zet ze er nooit omheen, ook niet
     *    bij een waarde met een spatie. Een fixture die niet klopt, maakt een
     *    controle groen zonder dat hij iets bewaakt.
     */
    it('haalt de uitnodigingscode eruit', () => {
      const melding = 'Key (invite_code)=(DUP001) already exists.';
      expect(scrubMessage(melding)).not.toContain('DUP001');
      expect(scrubMessage(melding)).toContain(REDACTED);
    });

    it('haalt ook een waarde met een spatie eruit', () => {
      expect(scrubMessage('Key (invite_code)=(met spatie) already exists.')).not.toContain(
        'met spatie',
      );
    });

    it('laat de kolomnaam staan — die is schemametadata en juist bruikbaar', () => {
      expect(scrubMessage('Key (invite_code)=(DUP001) already exists.')).toContain('invite_code');
    });

    it('doet de melding en de DETAIL-regel samen', () => {
      const volledig =
        'duplicate key value violates unique constraint "groups_invite_code_key" — ' +
        'Key (invite_code)=(DUP001) already exists.';
      const uit = scrubMessage(volledig);

      expect(uit).not.toContain('DUP001');
      expect(uit).not.toContain('groups_invite_code_key');
    });

    it('laat een gewone zin met haakjes met rust', () => {
      // ⚠️ De tegenhanger: het patroon eist `Key (…)=(…)` en niet zomaar haakjes.
      const zin = 'De aanroep (met twee argumenten) is mislukt.';
      expect(scrubMessage(zin)).toBe(zin);
    });
  });

  it('kapt een absurd lange melding af', () => {
    expect(scrubMessage('a'.repeat(2000))).toHaveLength(500);
  });

  it('laat een gewone technische melding met rust', () => {
    expect(scrubMessage('Network request failed')).toBe('Network request failed');
  });
});

describe('scrubContext', () => {
  it('laat technische velden door', () => {
    expect(scrubContext({ where: 'goals.create', httpStatus: 500, count: 3 })).toEqual({
      where: 'goals.create',
      httpStatus: 500,
      count: 3,
    });
  });

  it('laat uuid-ids door, want die zeggen niets zonder de database', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(scrubContext({ goal_id: id, weeklyGoalId: id })).toEqual({
      goal_id: id,
      weeklyGoalId: id,
    });
  });

  it('vervangt alles wat een gebruiker zelf heeft ingetypt', () => {
    const scrubbed = scrubContext({
      note: 'Deze week niks gedaan, was ziek',
      blocked_text: 'ik loop vast',
      display_name: 'Quinten',
      title: 'Afvallen',
    });

    expect(scrubbed).toEqual({
      note: REDACTED,
      blocked_text: REDACTED,
      display_name: REDACTED,
      title: REDACTED,
    });
  });

  it('vervangt een id-veld dat geen uuid is — dan is het iets anders', () => {
    expect(scrubContext({ user_id: 'quinten@example.com' })).toEqual({ user_id: REDACTED });
  });

  it('vervangt geneste objecten in hun geheel', () => {
    // Een allowlist die één niveau diep werkt, is geen allowlist.
    expect(scrubContext({ answers: { past_failure: 'ik geef altijd op' } })).toEqual({
      answers: REDACTED,
    });
  });

  describe('sqlstate — de sleutel met een vormtoets (QS8-315)', () => {
    /**
     * ⚠️ Deze sleutel is de vervanging voor de rúwe Postgres-melding die tot
     *    QS8-315 mee de deur uit ging. Hij staat bewust níét in `ALLOWED_KEYS`:
     *    een allowlist-sleutel is een kanaal, en dit kanaal is zo smal gemaakt
     *    dat er alleen een foutcode doorheen past. De helft hieronder die
     *    `[weggelaten]` verwacht is dus geen randgeval maar het punt.
     */
    it.each([
      ['een SQLSTATE', '23514'],
      ['een rechtenfout', '42501'],
      ['een letterklasse', 'P0001'],
      ['een PostgREST-code', 'PGRST202'],
    ])('laat %s door', (_naam, code) => {
      expect(scrubContext({ sqlstate: code })).toEqual({ sqlstate: code });
    });

    it.each([
      ['een hele foutmelding', 'Europe/Bogus is geen bekende tijdzone'],
      ['een melding die scrubMessage ongemoeid laat', 'Te veel avatars (12).'],
      ['een e-mailadres', 'sanne@voorbeeld.nl'],
      ['iets te kort', '2351'],
      ['iets te lang', '235141'],
      ['kleine letters', 'pgrst202'],
    ])('vervangt %s', (_naam, waarde) => {
      expect(scrubContext({ sqlstate: waarde })).toEqual({ sqlstate: REDACTED });
    });

    it('vervangt een sqlstate die geen string is', () => {
      // ⚠️ `undefined` hoort hier: `PostgrestError.code` is optioneel, en een
      //    aanroeper geeft hem door zonder te kijken.
      expect(scrubContext({ sqlstate: undefined })).toEqual({ sqlstate: REDACTED });
      expect(scrubContext({ sqlstate: 23514 })).toEqual({ sqlstate: REDACTED });
    });

    /**
     * ⚠️ **De belofte, en niet de tak — QS8-330.** `code` stond op
     *    `ALLOWED_KEYS` en ging dus ongetoetst naar buiten, terwijl 74 aanroepen
     *    hem vullen met `error.code`. Een sleutel die een foutcode heet, hoort een
     *    foutcodevorm te hebben; anders is het een gat met een geruststellende
     *    naam. Deze tests worden rood zodra iemand hem terugzet op de allowlist.
     *
     * ⚠️ **Breder dan `sqlstate` en met opzet:** `code` draagt óók de auth- en
     *    storagecatalogus (`invalid_credentials`, `NoSuchKey`). Wat hij níét mag
     *    doorlaten is een zin — en dat is precies wat er langskwam.
     */
    describe('de code-sleutel', () => {
      it.each([
        ['een SQLSTATE', '42501'],
        ['een PostgREST-code', 'PGRST202'],
        ['een authcode', 'invalid_credentials'],
        ['een storagecode', 'NoSuchKey'],
      ])('laat %s door', (_naam, code) => {
        expect(scrubContext({ code })).toEqual({ code });
      });

      it.each([
        ['een hele servermelding', 'permission denied for table goals'],
        ['een melding met een waarde erin', 'Europe/Bogus is geen bekende tijdzone'],
        ['een e-mailadres', 'sanne@voorbeeld.nl'],
        ['een naam met een spatie', 'Sanne de Vries'],
      ])('vervangt %s', (_naam, waarde) => {
        expect(scrubContext({ code: waarde })).toEqual({ code: REDACTED });
      });

      it('vervangt een code die geen string is', () => {
        expect(scrubContext({ code: undefined })).toEqual({ code: REDACTED });
        expect(scrubContext({ code: 42501 })).toEqual({ code: REDACTED });
      });
    });
  });

  it('is standaard dicht: een onbekend veld gaat niet mee', () => {
    expect(scrubContext({ ietsNieuws: 'wat dan ook' })).toEqual({ ietsNieuws: REDACTED });
  });
});

// ---------------------------------------------------------------------------
// De stack — gerepareerd lek, 24-08-2026
// ---------------------------------------------------------------------------

describe('scrubStack', () => {
  it('zet de geschoonde melding boven de stack in plaats van de ruwe', () => {
    // ⚠️ Dit is het lek zelf. `error.stack` begint met `Naam: melding`, dus
    //    alles wat `scrubMessage()` eruit haalde ging er via de stack alsnog uit.
    const ruw = [
      "Error: Key (invite_code)=('zomer-2026') already exists, mail sanne@voorbeeld.nl",
      '    at maakGroep (api.ts:41:11)',
      '    at async handler (index.ts:7:3)',
    ].join('\n');

    const uit = scrubStack(ruw, 'Error', scrubMessage(ruw.split('\n')[0] ?? '')) ?? '';

    expect(uit).not.toContain('zomer-2026');
    expect(uit).not.toContain('sanne@voorbeeld.nl');
    expect(uit).toContain('maakGroep (api.ts:41:11)');
  });

  it('houdt alleen frameregels over', () => {
    // Een melding over meerdere regels — Postgres doet dat met DETAIL en HINT —
    // hoort niet als losse regels in de stack te blijven staan.
    const ruw = [
      'Error: iets ging mis',
      'DETAIL: Key (email)=(sanne@voorbeeld.nl) bestaat al',
      'HINT: gebruik een ander adres',
      '    at ergens (bestand.ts:1:1)',
    ].join('\n');

    const uit = scrubStack(ruw, 'Error', 'iets ging mis') ?? '';

    expect(uit).not.toContain('DETAIL');
    expect(uit).not.toContain('HINT');
    expect(uit).not.toContain('voorbeeld.nl');
    expect(uit.split('\n')).toHaveLength(2);
  });

  it('haalt een e-mailadres en een token ook uit een frameregel', () => {
    // Een bestandspad draagt op een ontwikkelmachine een gebruikersnaam, en een
    // `at`-regel kan een query-string bevatten.
    const ruw = [
      'Error: x',
      '    at fetch (https://api.example/v1?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-123)',
    ].join('\n');

    expect(scrubStack(ruw, 'Error', 'x') ?? '').toContain('[token]');
  });

  it('laat een ontbrekende stack ontbrekend', () => {
    expect(scrubStack(undefined, 'Error', 'x')).toBeUndefined();
  });

  it('kapt een absurd lange stack af', () => {
    const ruw = ['Error: x', ...Array.from({ length: 500 }, (_, i) => `    at f${i} (b.ts:${i}:1)`)];

    expect((scrubStack(ruw.join('\n'), 'Error', 'x') ?? '').length).toBeLessThanOrEqual(4000);
  });
});
