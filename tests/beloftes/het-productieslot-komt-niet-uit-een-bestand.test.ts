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
    [{ rls_test_allow_prod: '1' }, /RLS_TEST_ALLOW_PROD=1/],
    [{ Rls_Doel: 'productie' }, /RLS_DOEL=productie/],
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

  it('ook niet in kleine letters (Windows leest process.env hoofdletterongevoelig)', () => {
    expect(overTeNemen({ rls_doel: 'lokaal', rls_test_allow_prod: '', A: '1' }, {})).toEqual({ A: '1' });
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
    [{ PGHOST: '/var/run/postgresql, 127.0.0.1' }],
    [{ PGHOST: '127.0.0.1', PGDATABASE: 'goalbuddies_rls_2' }],
  ])('%j mag', (omgeving) => {
    expect(psqlDoelFout(omgeving as unknown as NodeJS.ProcessEnv)).toBeNull();
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
    [{ PGHOST: '/var/run/postgresql,db.wehgocadxehottiiyvsc.supabase.co' }, /host "\/var\/run/],
    [{ PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1,3.14.15.92' }, /PGHOSTADDR/],
    [
      { PGHOST: '127.0.0.1', PGDATABASE: 'postgresql://postgres:x@db.wehgocadxehottiiyvsc.supabase.co/postgres' },
      /PGDATABASE is geen kale naam/,
    ],
    [{ PGHOST: '127.0.0.1', PGDATABASE: 'service=prod' }, /PGDATABASE is geen kale naam/],
    [{ PGHOST: '127.0.0.1', PGDATABASE: 'host=db.voorbeeld.nl dbname=postgres' }, /PGDATABASE is geen kale naam/],
  ])('%j wordt geweigerd', (omgeving, melding) => {
    expect(psqlDoelFout(omgeving as unknown as NodeJS.ProcessEnv)).toMatch(melding);
  });
});
