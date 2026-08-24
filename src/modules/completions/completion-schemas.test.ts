import { describe, expect, it } from 'vitest';

import { afrondSchema, dagzetSchema } from './completion-schemas';

const UUID = '3f1a7c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b';

describe('afrondSchema', () => {
  it('accepteert vloer en plafond', () => {
    expect(afrondSchema.safeParse({ achieved_level: 'floor', note: null }).success).toBe(true);
    expect(afrondSchema.safeParse({ achieved_level: 'ceiling', note: null }).success).toBe(true);
  });

  /**
   * ⚠️ Er zijn precies twee niveaus. Een derde zou het puntenmodel uit
   *    domeinregel 10 stilzwijgend uitbreiden — `completions_level_valid` in de
   *    database staat er niet voor niets.
   */
  it.each(['partial', 'half', 'missed', 'none', ''])('weigert niveau %s', (niveau) => {
    expect(afrondSchema.safeParse({ achieved_level: niveau, note: null }).success).toBe(false);
  });

  it('laat precies tweeduizend tekens door en weigert er één meer', () => {
    expect(
      afrondSchema.safeParse({ achieved_level: 'floor', note: 'x'.repeat(2000) }).success,
    ).toBe(true);
    expect(
      afrondSchema.safeParse({ achieved_level: 'floor', note: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });
});

describe('dagzetSchema', () => {
  it('accepteert een Dagzet zonder weekdoel', () => {
    const uit = dagzetSchema.safeParse({
      body: 'Vandaag een half uur gelopen.',
      weekly_goal_id: null,
      visibility: 'private',
    });

    expect(uit.success).toBe(true);
  });

  it('accepteert een Dagzet die aan een weekdoel hangt', () => {
    const uit = dagzetSchema.safeParse({
      body: 'Hoofdstuk drie af.',
      weekly_goal_id: UUID,
      visibility: 'group',
    });

    expect(uit.success).toBe(true);
  });

  it('weigert een lege of blanco regel', () => {
    const leeg = { weekly_goal_id: null, visibility: 'private' as const };

    expect(dagzetSchema.safeParse({ ...leeg, body: '' }).success).toBe(false);
    expect(dagzetSchema.safeParse({ ...leeg, body: '   ' }).success).toBe(false);
  });

  /**
   * ⚠️ `visibility` bepaalt of deze regel de groep bereikt — domeinregel 7 en 9.
   *    Een derde waarde erbij zou een nieuw groepsoppervlak zijn zonder dat
   *    iemand die vraag gesteld heeft. `daily_moves_visibility_valid` dwingt
   *    hetzelfde af in de database.
   */
  it.each(['public', 'buddies', 'everyone', ''])('weigert zichtbaarheid %s', (zicht) => {
    expect(
      dagzetSchema.safeParse({ body: 'iets', weekly_goal_id: null, visibility: zicht }).success,
    ).toBe(false);
  });

  it('weigert een weekdoel-id dat geen uuid is', () => {
    expect(
      dagzetSchema.safeParse({ body: 'iets', weekly_goal_id: 'niet-een-uuid', visibility: 'private' })
        .success,
    ).toBe(false);
  });
});
