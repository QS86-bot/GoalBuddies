import { afterEach, describe, expect, it } from 'vitest';

import { overTeNemen, slotInDotenv } from '../../src/lib/test-env-slot';
import { bestemmingFout, eisBestemming, psqlDoelFout, vergeetBestemming } from '../rls/psql-stack';

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
    [{ PGHOST: '127.0.0.1', PGDATABASE: 'goalbuddies_rls' }],
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
    [{ PGHOST: '127.0.0.1', PGDATABASE: 'postgres' }, /alleen goalbuddies_rls/],
    [{ PGHOST: '127.0.0.1', PGDATABASE: 'goalbuddies_rls_2' }, /alleen goalbuddies_rls/],
    [{ PGHOST: '127.0.0.1', PGDATABASE: 'host=db.voorbeeld.nl dbname=postgres' }, /PGDATABASE is geen kale naam/],
  ])('%j wordt geweigerd', (omgeving, melding) => {
    expect(psqlDoelFout(omgeving as unknown as NodeJS.ProcessEnv)).toMatch(melding);
  });
});

describe('bestemmingFout — waar psql werkelijk uitkwam (QS8-715)', () => {
  it.each(['127.0.0.1|goalbuddies_rls', '::1|goalbuddies_rls', 'unix-socket|goalbuddies_rls', ' 127.0.0.1|goalbuddies_rls\n'])(
    '%j mag',
    (uitkomst) => {
      expect(bestemmingFout(uitkomst, 'goalbuddies_rls')).toBeNull();
    },
  );

  it.each([
    ['10.0.0.5|goalbuddies_rls', /kwam uit op "10\.0\.0\.5"/],
    ['52.47.1.2|postgres', /kwam uit op "52\.47\.1\.2"/],
    ['127.0.0.1|postgres', /in database "postgres" en niet in "goalbuddies_rls"/],
    ['', /kwam uit op ""/],
  ])('%j wordt geweigerd', (uitkomst, melding) => {
    expect(bestemmingFout(uitkomst, 'goalbuddies_rls')).toMatch(melding);
  });
});

describe('bestemmingFout — de CI-servicecontainer op de eigen dockerbrug (QS8-715)', () => {
  const EIGEN = ['127.0.0.1', '172.18.0.1', '10.1.2.3', '172.32.0.1', '172.15.0.1'];
  const db = 'goalbuddies_rls';

  it('de servicecontainer: server 172.18.0.2, client de eigen bruggateway 172.18.0.1', () => {
    expect(bestemmingFout('172.18.0.2|goalbuddies_rls|172.18.0.1', db, EIGEN)).toBeNull();
  });

  it.each([
    // een tunnel: de server ziet ons NAT-adres, dat op geen eigen interface staat
    ['een privé-adres, client is niet van ons', '172.18.0.2|goalbuddies_rls|203.0.113.9'],
    ['geen clientadres terug (oude vorm van de vraag)', '172.18.0.2|goalbuddies_rls'],
    ['client in het net van de container maar niet van ons (172.18.0.5)', '172.18.0.2|goalbuddies_rls|172.18.0.5'],
    ['server en eigen client buiten 172.16/12', '10.1.2.4|goalbuddies_rls|10.1.2.3'],
    ['server net buiten 172.16/12 (172.32)', '172.32.0.2|goalbuddies_rls|172.32.0.1'],
    ['server net onder 172.16/12 (172.15)', '172.15.0.2|goalbuddies_rls|172.15.0.1'],
    ['client in een ander /16 dan de server', '172.19.0.2|goalbuddies_rls|172.18.0.1'],
    ['een publiek adres met een eigen client', '52.47.1.2|goalbuddies_rls|172.18.0.1'],
  ])('%s wordt geweigerd', (_naam, uitkomst) => {
    expect(bestemmingFout(uitkomst, db, EIGEN)).toMatch(/kwam uit op/);
  });

  it('de brug in de goede ruimte maar een andere database wordt óók geweigerd', () => {
    expect(bestemmingFout('172.18.0.2|postgres|172.18.0.1', db, EIGEN)).toMatch(/in database "postgres"/);
  });
});

describe('eisBestemming — één keer per proces, en geen verbinding is geen fout', () => {
  afterEach(() => vergeetBestemming());

  it('een bestemming buiten loopback werpt, met een eigen melding en niet "geen database"', () => {
    expect(() => eisBestemming(() => '10.0.0.5|goalbuddies_rls')).toThrow(/weigert te meten/);
  });

  it('geen verbinding (psql-exitcode 2): geeft dat terug, en meet de volgende keer opnieuw', () => {
    let keren = 0;
    const kapot = () => {
      keren += 1;
      throw Object.assign(new Error('could not connect'), { status: 2 });
    };
    expect(eisBestemming(kapot)).toBe('geen-verbinding');
    expect(eisBestemming(kapot)).toBe('geen-verbinding');
    expect(keren).toBe(2);
  });

  it.each([
    ['een vraag die de server niet kent (exitcode 1)', { status: 1 }],
    ['een time-out (geen exitcode)', { status: null, code: 'ETIMEDOUT' }],
  ])('%s: niet vast te stellen, en dat werpt', (_naam, eigenschappen) => {
    const kapot = () => {
      throw Object.assign(new Error('kapot'), eigenschappen);
    };
    expect(() => eisBestemming(kapot)).toThrow(/niet vast te stellen/);
  });

  it('een goede bestemming wordt één keer gemeten', () => {
    let keren = 0;
    const goed = () => {
      keren += 1;
      return '127.0.0.1|goalbuddies_rls';
    };
    eisBestemming(goed);
    eisBestemming(goed);
    expect(keren).toBe(1);
  });
});
