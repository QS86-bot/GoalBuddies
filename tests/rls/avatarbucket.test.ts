/**
 * De vier policies op `storage.objects` — migratie 0126.
 *
 * ⚠️ **De belofte is niet "de policy staat er".** Die is: *een pad in andermans
 *    map is niet te schrijven, en een avatar van een vreemde is niet te lezen* —
 *    ook niet met één verzoek buiten de UI om. Dat is de tweede vraag uit
 *    CLAUDE.md domeinregel 7, en de les van EPIC 5: de schermen hielden de regel
 *    netjes aan terwijl de database hem lekte.
 *
 * ⚠️ **Waarom deze suite psql gebruikt en niet de harness.** `storage.objects`
 *    is geen PostgREST-oppervlak: het schema `storage` staat niet in de
 *    exposed schemas, en de storage-API zelf draait lokaal niet. De policies
 *    zijn echter gewoon RLS-expressies, en die zijn met `set local role
 *    authenticated` plus `request.jwt.claims` exact zo te toetsen als PostgREST
 *    ze aanroept. Dat is dichter bij de waarheid dan een mock, en het is de enige
 *    manier waarop deze grens hier meetbaar is.
 *
 * ⚠️ **Draait alleen tegen de lokale stack**, want daar is een supergebruiker.
 *    Zonder draaiende stack wordt deze suite overgeslagen — en dat is
 *    *ongemeten* en niet groen. `npm run poort` houdt dat onderscheid vast.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const OMGEVING = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? '127.0.0.1',
  PGPORT: process.env.PGPORT ?? '5432',
  PGPASSWORD: process.env.PGPASSWORD ?? 'postgres',
};

const DB = process.env.PGDATABASE ?? 'goalbuddies_rls';

function psql(sql: string): string {
  return execFileSync('psql', ['-U', 'postgres', '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], {
    env: OMGEVING,
    encoding: 'utf8',
  }).trim();
}

/** Draait de stack, en kent hij de bucket van 0126? */
function stackBeschikbaar(): boolean {
  try {
    return psql("select count(*) from storage.buckets where id = 'avatars'") === '1';
  } catch {
    return false;
  }
}

const beschikbaar = stackBeschikbaar();

/**
 * Voert SQL uit alsof PostgREST het namens deze gebruiker doet.
 *
 * ⚠️ `set local role authenticated` én de claims, want de policies leunen op
 *    allebei: de rol bepaalt wélke policies gelden, `auth.uid()` bepaalt de
 *    uitkomst. Alleen de rol zetten geeft `auth.uid() is null` en dan weigert
 *    álles — groen om de verkeerde reden.
 */
function als(userId: string, sql: string): string {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' }).replace(/'/g, "''");
  const uitvoer = psql(
    `begin;
     select set_config('request.jwt.claims', '${claims}', true);
     set local role authenticated;
     ${sql};
     rollback;`,
  );

  // ⚠️ De eerste regel is de uitvoer van `set_config` zelf. Zou die blijven
  //    staan, dan bevat élk antwoord de claims — en dan vergelijkt de test een
  //    string die altijd verschilt, of erger: hij slaagt op de verkeerde helft.
  return uitvoer.split('\n').slice(1).join('\n').trim();
}

/** Zoals `als`, maar de transactie mag omvallen — dan komt de SQLSTATE terug. */
function alsMetFout(userId: string, sql: string): string {
  try {
    return `ok:${als(userId, sql)}`;
  } catch (fout) {
    const tekst = fout instanceof Error ? `${fout.message}` : String(fout);
    if (/violates check constraint|23514/i.test(tekst)) return '23514';
    return /row-level security|permission denied|42501/i.test(tekst) ? '42501' : tekst;
  }
}

describe.runIf(beschikbaar)('de avatar-bucket (0126)', () => {
  const alice = randomUUID();
  const bob = randomUUID();
  const vreemde = randomUUID();

  beforeAll(() => {
    // Drie profielen, en Alice en Bob in dezelfde groep. `shares_group_with_user`
    // is de enige reden dat Bob Alice' avatar mag zien.
    for (const [id, naam] of [
      [alice, 'Alice'],
      [bob, 'Bob'],
      [vreemde, 'Vreemde'],
    ] as const) {
      // ⚠️ Eerst `auth.users`: `profiles.id` heeft er een foreign key naartoe. Op
      //    de lokale stack is dat een schil (`supabase/shim/0000_supabase_shim.sql`)
      //    en niet GoTrue — genoeg om de sleutel te laten kloppen.
      psql(
        `insert into auth.users (id, email) values ('${id}', '${id}@avatartest.local')
         on conflict (id) do nothing`,
      );
      psql(
        `insert into public.profiles (id, display_name) values ('${id}', '${naam}')
         on conflict (id) do nothing`,
      );
    }

    const groep = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Avatartest', '${alice}', 'AVTST1') returning id`,
    );
    for (const id of [alice, bob]) {
      psql(
        `insert into public.group_members (group_id, user_id, role, status)
         values ('${groep}', '${id}', 'member', 'active') on conflict do nothing`,
      );
    }

    // Eén avatar van Alice, neergezet met de rechten van de eigenaar van de tabel.
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('avatars', '${alice}/foto.jpg', '${alice}') on conflict do nothing`,
    );
  });

  afterAll(() => {
    psql(`delete from storage.objects where bucket_id = 'avatars' and name like '${alice}/%'`);
    psql(`delete from public.group_members where user_id in ('${alice}', '${bob}')`);
    psql(`delete from public.groups where name = 'Avatartest'`);
    psql(`delete from public.profiles where id in ('${alice}', '${bob}', '${vreemde}')`);
    psql(`delete from auth.users where id in ('${alice}', '${bob}', '${vreemde}')`);
  });

  // -------------------------------------------------------------------------
  // Lezen
  // -------------------------------------------------------------------------

  it('laat je je eigen avatar zien', () => {
    expect(als(alice, `select count(*) from storage.objects where name like '${alice}/%'`)).toBe(
      '1',
    );
  });

  // ⚠️ De must-allow-helft, en die telt even zwaar: een policy die álles weigert
  //    is groen op elke weigertest en breekt het groepsoverzicht.
  it('laat een groepsgenoot je avatar zien', () => {
    expect(als(bob, `select count(*) from storage.objects where name like '${alice}/%'`)).toBe('1');
  });

  it('laat een vreemde niets zien', () => {
    expect(
      als(vreemde, `select count(*) from storage.objects where name like '${alice}/%'`),
    ).toBe('0');
  });

  // -------------------------------------------------------------------------
  // Schrijven — hier hangt de grens aan het pad en niet aan `owner`
  // -------------------------------------------------------------------------

  it('laat je in je eigen map schrijven', () => {
    expect(
      als(
        alice,
        `insert into storage.objects (bucket_id, name) values ('avatars', '${alice}/nieuw.png')`,
      ),
    ).toBe('');
  });

  /**
   * ⚠️ **De kern van 0126.** `owner` wordt door de storage-API gezet en is dus
   *    niet de grens; het eerste padsegment is het enige dat de cliënt niet kan
   *    vervalsen zonder de WITH CHECK te breken. Deze test zet `owner` expliciet
   *    op de schrijver zelf — precies wat de API zou doen — en tóch moet hij eraf
   *    vallen, want het pad is van iemand anders.
   */
  it('weigert een insert in andermans map, ook met je eigen owner erbij', () => {
    expect(
      alsMetFout(
        bob,
        `insert into storage.objects (bucket_id, name, owner)
         values ('avatars', '${alice}/gekaapt.png', '${bob}')`,
      ),
    ).toBe('42501');
  });

  it('weigert het verwijderen van andermans avatar', () => {
    expect(
      als(bob, `with weg as (delete from storage.objects where name = '${alice}/foto.jpg'
                 returning 1) select count(*) from weg`),
    ).toBe('0');
  });

  it('weigert het hernoemen van andermans avatar naar je eigen map', () => {
    expect(
      als(
        bob,
        `with om as (update storage.objects set name = '${bob}/gestolen.jpg'
                     where name = '${alice}/foto.jpg' returning 1) select count(*) from om`,
      ),
    ).toBe('0');
  });

  /**
   * ⚠️ Een pad zónder map heeft geen eerste segment: `storage.foldername()` geeft
   *    dan een lege array en `[1]` is NULL. NULL = uid is niet waar, dus dit valt
   *    af — maar dat is een eigenschap van drie-waardige logica en niet van een
   *    regel die iemand opgeschreven heeft. Vandaar deze test: hij houdt vast dat
   *    de bodem van de bucket dicht is.
   */
  it('weigert een bestand zonder map — daar is geen eigenaar uit te lezen', () => {
    expect(
      alsMetFout(alice, `insert into storage.objects (bucket_id, name) values ('avatars', 'los.png')`),
    ).toBe('42501');
  });

  // -------------------------------------------------------------------------

  it('is privé, dus er is geen weg om de policies heen', () => {
    expect(psql("select public from storage.buckets where id = 'avatars'")).toBe('f');
  });

  // -------------------------------------------------------------------------
  // Wat er in `profiles.avatar_url` mag staan — migratie 0127
  // -------------------------------------------------------------------------
  //
  // ⚠️ **Dit is de naad tussen de bucket en de kolom.** 0126 zegt in vier
  //    policies dat het eerste padsegment de eigenaar is; de kolom zei daar niets
  //    over. `authenticated` heeft UPDATE op `avatar_url` (gemeten in
  //    `information_schema.column_privileges`, veertien kolommen), dus wat er in
  //    staat is niet noodzakelijk door de app geschreven.
  //
  //    De ondertekening in `metGetekendeAvatars` ving de externe URL al — maar
  //    dat is de datalaag, en CLAUDE.md zegt dat de regel pas afgedwongen is als
  //    de dátabase hem afdwingt.

  it('laat je een pad in je eigen map zetten', () => {
    expect(
      als(alice, `update public.profiles set avatar_url = '${alice}/foto.jpg' where id = '${alice}'`),
    ).toBe('');
  });

  it('laat je hem leegmaken', () => {
    expect(
      als(alice, `update public.profiles set avatar_url = null where id = '${alice}'`),
    ).toBe('');
  });

  it('weigert een externe URL — anders laadt elk groepslid dat adres', () => {
    expect(
      alsMetFout(
        alice,
        `update public.profiles set avatar_url = 'https://volgmij.example/pixel.gif'
         where id = '${alice}'`,
      ),
    ).toBe('23514');
  });

  // ⚠️ Dit geval is *niet* door de ondertekening gedekt: Bob mág Alice' avatar
  //    lezen, dus die URL zou netjes getekend worden en haar foto zou naast zíjn
  //    naam staan. Geen lek — hij zag die foto al — maar wel iemand anders'
  //    gezicht onder zijn berichten.
  it('weigert het pad van een groepsgenoot, ook al mag je dat bestand lezen', () => {
    expect(
      alsMetFout(
        bob,
        `update public.profiles set avatar_url = '${alice}/foto.jpg' where id = '${bob}'`,
      ),
    ).toBe('23514');
  });
});
