import { afterAll, describe, expect, it } from 'vitest';

import { createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql as psqlKaal, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De belofte: **een gebruiker kan zijn account verwijderen**, ook als Supabase
 * een `delete from storage.objects` weigert — QS8-692.
 *
 * 📏 Op productie faalde vanaf 09-11-2026 élke verwijdering met 42501
 *    (`storage.protect_delete()`, per statement): 1.050 van de 1.050 op 16-11.
 *    De trigger van 0230 deed `delete from storage.objects`, en die grendel van
 *    Supabase gaat ook af als de `delete` niets raakt. Een gebruiker zónder
 *    bewijsfoto kon zijn account dus net zo min verwijderen. Het wisrecht was kapot.
 *
 * ⚠️ **De naad.** Elk onderdeel was correct: `verwijder_mijn_account()`, de
 *    cascade naar `profiles`, de trigger die de foto meenam, en Supabase' eigen
 *    grendel. Pas samen braken ze, en de suite zag het niet omdat de shim die
 *    grendel niet had. Daarom gaat deze test via PostgREST met het JWT van de
 *    gebruiker: dezelfde weg als de knop in de app. De shim draagt sinds dit
 *    issue de grendel woordelijk zoals op productie.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (QS8-694, 17-11-2026): met
 *    de functie van 0230 terug (`delete from storage.objects` in de cascade)
 *    worden "verwijdert een account mét bewijsfoto" en "zónder bewijsfoto"
 *    allebei rood met 42501, woordelijk de fout van productie.
 */

const TEST_TIMEOUT = 30_000;

const psql = (sql: string) => psqlKaal(sql, { verbose: true });

const beschikbaar =
  rlsTestsConfigured &&
  stackBeschikbaarOfFaal(
    "select count(*) from pg_proc where proname = 'verlopen_bewijsfotos'",
    import.meta.url,
  );

/** Een doel, een weekdoel en een voltooiing mét bewijsfoto voor deze gebruiker. */
function maakBewijs(eigenaar: string): string {
  const doel = psql(
    `insert into public.goals (owner_id, title, target_date)
     values ('${eigenaar}', 'Bewijsdoel', current_date + 60) returning id`,
  );
  const week = psql(
    `insert into public.weekly_goals (goal_id, title, cycle_start_date, status)
     values ('${doel}', 'Week', current_date, 'todo') returning id`,
  );
  const pad = `${week}/${eigenaar}/bewijs.jpg`;
  psql(
    `insert into public.completions (weekly_goal_id, user_id, achieved_level, note, attachment_url)
     values ('${week}', '${eigenaar}', 'ceiling', 'gedaan', '${pad}')`,
  );
  psql(
    `insert into storage.objects (bucket_id, name, owner)
     values ('bewijsfotos', '${pad}', '${eigenaar}')`,
  );
  return pad;
}

function teOpruimen(): string[] {
  const uit = psql(`select pad || '|' || reden from public.verlopen_bewijsfotos(500)`);
  return uit === '' ? [] : uit.split('\n');
}

describe.runIf(beschikbaar)('accountverwijdering langs Supabase\' storagegrendel', () => {
  const opTeRuimen: string[] = [];

  afterAll(async () => {
    if (opTeRuimen.length > 0) {
      psql(
        `delete from storage.objects where bucket_id = 'bewijsfotos'
         and name in (${opTeRuimen.map((p) => `'${p}'`).join(', ')})`,
      );
    }
    await removeTestUsers();
  });

  it('verwijdert een account mét bewijsfoto via de app-weg', async () => {
    const wie: TestUser = await createTestUser('wisrecht-foto');
    const pad = maakBewijs(wie.id);
    opTeRuimen.push(pad);

    const { data, error } = await wie.db.rpc('verwijder_mijn_account');

    expect(error).toBeNull();
    expect((data as { ok: boolean }).ok).toBe(true);
    expect(psql(`select count(*) from public.profiles where id = '${wie.id}'`)).toBe('0');
  }, TEST_TIMEOUT);

  it('verwijdert een account zónder bewijsfoto via de app-weg', async () => {
    // 📏 De grendel van Supabase is per statement: op productie faalde ook dit.
    const wie: TestUser = await createTestUser('wisrecht-kaal');

    const { data, error } = await wie.db.rpc('verwijder_mijn_account');

    expect(error).toBeNull();
    expect((data as { ok: boolean }).ok).toBe(true);
    expect(psql(`select count(*) from public.profiles where id = '${wie.id}'`)).toBe('0');
  }, TEST_TIMEOUT);

  it('laat de foto van een vertrokken gebruiker over aan de opruimpas', async () => {
    const wie: TestUser = await createTestUser('wisrecht-wees');
    const pad = maakBewijs(wie.id);
    opTeRuimen.push(pad);

    const { error } = await wie.db.rpc('verwijder_mijn_account');
    expect(error).toBeNull();

    // De rij staat er nog: SQL kan de blob niet weghalen, de rollover wel
    // (`storage.remove()`), en die vraagt het pad aan `verlopen_bewijsfotos()`.
    expect(psql(`select count(*) from storage.objects where name = '${pad}'`)).toBe('1');
    expect(teOpruimen()).toContain(`${pad}|wees`);
  }, TEST_TIMEOUT);

  it('laat een bewijsfoto staan zolang zijn eigenaar bestaat', async () => {
    const wie: TestUser = await createTestUser('wisrecht-blijft');
    const pad = maakBewijs(wie.id);
    opTeRuimen.push(pad);

    expect(teOpruimen().some((r) => r.startsWith(`${pad}|`))).toBe(false);
  }, TEST_TIMEOUT);

  it('laat verlopen_bewijsfotos() niet door een ingelogde gebruiker aanroepen', () => {
    // Onwrikbare regel 4: een recht zonder grant-regel is geërfd en niet besloten.
    const uitvoerbaar = psql(
      `select has_function_privilege('authenticated', 'public.verlopen_bewijsfotos(integer)', 'EXECUTE')
          or has_function_privilege('anon', 'public.verlopen_bewijsfotos(integer)', 'EXECUTE')`,
    );
    expect(uitvoerbaar).toBe('f');
  });
});
