import { describe, expect, it } from 'vitest';

import { naamSchema, teamNaamSchema } from './schemas';

describe('naamSchema', () => {
  it('accepteert tachtig emoji: de grens telt codepunten, geen UTF-16-eenheden', () => {
    expect(naamSchema.safeParse('\u{1F600}'.repeat(80)).success).toBe(true);
  });

  it('weigert eenentachtig emoji', () => {
    expect(naamSchema.safeParse('\u{1F600}'.repeat(81)).success).toBe(false);
  });

  it('weigert alleen spaties', () => {
    expect(naamSchema.safeParse('     ').success).toBe(false);
  });

  it('strijkt de randen', () => {
    expect(naamSchema.parse('  Acme  ')).toBe('Acme');
  });
});

describe('teamNaamSchema', () => {
  it('eist minstens twee tekens en hoogstens zestig', () => {
    expect(teamNaamSchema.safeParse('A').success).toBe(false);
    expect(teamNaamSchema.safeParse('AB').success).toBe(true);
    expect(teamNaamSchema.safeParse('\u{1F600}'.repeat(60)).success).toBe(true);
    expect(teamNaamSchema.safeParse('\u{1F600}'.repeat(61)).success).toBe(false);
  });
});
