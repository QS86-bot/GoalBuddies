import { afterEach, describe, expect, it, vi } from 'vitest';

import { achtergeblevenMelding, bepaalDoel } from './doel';

/**
 * QS8-702 — productie is nooit een stille standaard, en een mislukte teardown
 * is een rode suite.
 *
 * Geen database nodig: de beslissing is een pure functie, en de naad (het
 * harnas zelf) wordt in-process geladen met een gestuurde omgeving.
 */

const PROD = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://wehgocadxehottiiyvsc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  SUPABASE_JWT_SECRET: 'geheim',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
};

describe('bepaalDoel', () => {
  it('lokaal en productie moeten uitdrukkelijk gekozen zijn', () => {
    expect(bepaalDoel({ RLS_DOEL: 'lokaal' }).soort).toBe('lokaal');
    expect(bepaalDoel({ RLS_DOEL: 'productie' }).soort).toBe('productie');
  });

  it('zonder doel en zonder sleutels: niets te meten, geen fout', () => {
    expect(bepaalDoel({}).soort).toBe('geen');
  });

  it('zonder doel mét productiesleutels: geweigerd, en de melding noemt beide uitwegen', () => {
    const oordeel = bepaalDoel(PROD);
    expect(oordeel.soort).toBe('geweigerd');
    expect(oordeel.soort === 'geweigerd' && oordeel.melding).toMatch(/RLS_DOEL=lokaal|rls:lokaal/);
    expect(oordeel.soort === 'geweigerd' && oordeel.melding).toMatch(/RLS_DOEL=productie/);
  });

  it.each(['', 'prod', 'Lokaal', 'true'])('een onbekende waarde (%j) valt niet terug op productie', (waarde) => {
    expect(bepaalDoel({ RLS_DOEL: waarde }).soort).toBe('geweigerd');
    expect(bepaalDoel({ RLS_DOEL: waarde, ...PROD }).soort).toBe('geweigerd');
  });
});

describe('achtergeblevenMelding', () => {
  it('is null als alles weg is', () => {
    expect(achtergeblevenMelding([], 5)).toBeNull();
  });

  it('noemt het aantal achtergebleven accounts', () => {
    expect(achtergeblevenMelding(['a: boom', 'b: boom'], 5)).toMatch(/2 van de 5/);
  });
});

describe('de naad: het harnas zelf', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const laad = async (env: Record<string, string | undefined>) => {
    for (const k of [
      'RLS_DOEL', 'EXPO_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_JWT_SECRET', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'RLS_TEST_ALLOW_PROD',
    ]) vi.stubEnv(k, env[k] ?? '');
    // stubEnv met '' is niet hetzelfde als afwezig; verwijder expliciet.
    for (const k of Object.keys(process.env)) if (process.env[k] === '' && !(k in env)) delete process.env[k];
    vi.resetModules();
    return import('./harness');
  };

  it('productiesleutels zonder RLS_DOEL: het laden faalt, er wordt niets aangemaakt', async () => {
    await expect(laad(PROD)).rejects.toThrow(/RLS_DOEL is niet gezet/);
  });

  it('geen sleutels en geen doel: de suite slaat zichzelf over', async () => {
    const h = await laad({});
    expect(h.doelsoort).toBe('geen');
    expect(h.rlsTestsConfigured).toBe(false);
    expect(() => h.adminDb()).toThrow(/Geen RLS-doel/);
  });

  it('productie zonder het tweede slot: geblokkeerd bij het aanmaken van een client', async () => {
    const h = await laad({ ...PROD, RLS_DOEL: 'productie' });
    expect(h.doelsoort).toBe('productie');
    expect(() => h.adminDb()).toThrow(/geblokkeerd/);
  });

  it('lokaal blijft werken zonder sleutels', async () => {
    const h = await laad({ RLS_DOEL: 'lokaal' });
    expect(h.doelsoort).toBe('lokaal');
    expect(h.rlsTestsConfigured).toBe(true);
  });
});
