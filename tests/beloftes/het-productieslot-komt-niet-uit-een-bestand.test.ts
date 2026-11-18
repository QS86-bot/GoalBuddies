import { describe, expect, it } from 'vitest';

import { overTeNemen, slotInDotenv } from '../../src/lib/test-env-slot';
import { psqlDoelFout } from '../rls/psql-stack';

/**
 * QS8-703 — het tweede productieslot van de RLS-suite, op onderdeelniveau.
 * De naad (vitest → `.env` → harness of psql) staat in
 * `tests/beloftes/dotenv-opent-het-slot-niet.test.ts`.
 */

describe('slotInDotenv — .env mag het productieslot niet zetten', () => {
  it.each([
    [{ RLS_TEST_ALLOW_PROD: '1' }, /RLS_TEST_ALLOW_PROD=1/],
    [{ RLS_TEST_ALLOW_PROD: 'ja' }, /RLS_TEST_ALLOW_PROD=ja/],
    [{ RLS_DOEL: 'productie' }, /RLS_DOEL=productie/],
    [{ RLS_DOEL: ' Productie ' }, /RLS_DOEL= Productie /],
    [{ RLS_DOEL: 'productie', RLS_TEST_ALLOW_PROD: '1' }, /RLS_TEST_ALLOW_PROD=1 en RLS_DOEL=productie/],
  ])('%j wordt geweigerd', (bestand, melding) => {
    expect(slotInDotenv(bestand)).toMatch(melding);
  });

  it.each([
    {},
    { RLS_TEST_ALLOW_PROD: '' },
    { RLS_TEST_ALLOW_PROD: '   ' },
    { RLS_DOEL: 'lokaal' },
    { SUPABASE_SERVICE_ROLE_KEY: 'x', EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' },
  ])('%j laat hij door', (bestand) => {
    expect(slotInDotenv(bestand)).toBeNull();
  });

  it('de melding noemt de uitweg per run', () => {
    expect(slotInDotenv({ RLS_TEST_ALLOW_PROD: '1' })).toMatch(/cross-env RLS_DOEL=productie RLS_TEST_ALLOW_PROD=1/);
  });
});

describe('overTeNemen — wat er uit .env in de procesomgeving komt', () => {
  it('neemt RLS_DOEL en RLS_TEST_ALLOW_PROD nooit over, ook een onschuldige waarde niet', () => {
    expect(overTeNemen({ RLS_DOEL: 'lokaal', RLS_TEST_ALLOW_PROD: '', A: '1' }, {})).toEqual({ A: '1' });
  });

  it('een waarde die het proces al heeft, wint — zoals dotenv zelf', () => {
    expect(overTeNemen({ A: 'uit-bestand', B: '2' }, { A: 'uit-proces' })).toEqual({ B: '2' });
  });
});

describe('psqlDoelFout — het psql-pad praat alleen met een lokale database', () => {
  it.each([
    [{ PGHOST: '127.0.0.1' }],
    [{ PGHOST: 'localhost' }],
    [{ PGHOST: 'LOCALHOST' }],
    [{ PGHOST: '::1' }],
    [{ PGHOST: '/var/run/postgresql' }],
    [{ PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1' }],
  ])('%j mag', (omgeving) => {
    expect(psqlDoelFout(omgeving as NodeJS.ProcessEnv)).toBeNull();
  });

  it.each([
    [{ PGHOST: 'aws-0-eu-west-3.pooler.supabase.com' }, /host "aws-0-eu-west-3/],
    [{ PGHOST: 'db.wehgocadxehottiiyvsc.supabase.co' }, /host "db\.wehgo/],
    [{ PGHOST: 'DB.WEHGOCADXEHOTTIIYVSC.SUPABASE.CO' }, /host "DB\.WEHGO/],
    [{ PGHOST: 'mijn-eigen-domein.nl' }, /host "mijn-eigen-domein\.nl"/],
    [{ PGHOST: '127.0.0.1,db.voorbeeld.nl' }, /host "127\.0\.0\.1,db/],
    [{ PGHOST: '' }, /host ""/],
    [{ PGHOST: '127.0.0.1', PGHOSTADDR: '3.14.15.92' }, /PGHOSTADDR/],
    [{ PGHOST: '127.0.0.1', PGSERVICE: 'productie' }, /PGSERVICE/],
  ])('%j wordt geweigerd', (omgeving, melding) => {
    expect(psqlDoelFout(omgeving as NodeJS.ProcessEnv)).toMatch(melding);
  });
});
