import { describe, expect, it } from 'vitest';

import { toonBelofteverwijzing } from './verwijzing';

describe('toonBelofteverwijzing', () => {
  it('zonder groep en zonder getuige: geen verwijzing', () => {
    expect(toonBelofteverwijzing({ groepen: 0, getuigen: 0 })).toBe(false);
  });
  it('met een groep: wel', () => {
    expect(toonBelofteverwijzing({ groepen: 1, getuigen: 0 })).toBe(true);
  });
  it('met alleen een getuige: wel', () => {
    expect(toonBelofteverwijzing({ groepen: 0, getuigen: 2 })).toBe(true);
  });
});
