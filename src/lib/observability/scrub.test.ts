/**
 * "Geen persoonsgegevens in events" is een acceptatiecriterium van QS8-24, en
 * het enige deel daarvan dat je kunt bewijzen zonder Sentry aangesloten te
 * hebben. Deze tests zijn dat bewijs.
 */
import { describe, expect, it } from 'vitest';

import { REDACTED, scrubContext, scrubMessage } from './scrub';

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

  it('haalt de geciteerde waarde uit een Postgres-melding', () => {
    // Precies het geval dat zonder deze regel een uitnodigingscode lekt.
    const melding = 'duplicate key value violates unique constraint "groups_invite_code_key"';
    expect(scrubMessage(melding)).not.toContain('groups_invite_code_key');
    expect(scrubMessage(melding)).toContain(REDACTED);
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

  it('is standaard dicht: een onbekend veld gaat niet mee', () => {
    expect(scrubContext({ ietsNieuws: 'wat dan ook' })).toEqual({ ietsNieuws: REDACTED });
  });
});
