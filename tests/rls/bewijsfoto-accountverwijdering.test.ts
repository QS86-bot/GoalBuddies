import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een account verwijderen mag niet stuklopen op een bewijsfoto — QS8-692, 0299.
 *
 * ⚠️⚠️ **De belofte is dat `delete from auth.users` slaagt, niet dat een functie
 *    iets niet doet.** 📏 Op productie gaf elke van de 1.050 verwijderingen op
 *    16-11 een HTTP 500: `storage.protect_delete()` — een trigger van Supabase
 *    zelf — weigert een `delete from storage.objects` met 42501, en
 *    `wis_bewijsfotos_van_vertrekker()` (0230) deed er precies één, midden in de
 *    cascade. De hele transactie rolde terug en het account bleef bestaan.
 *
 * ⚠️ **De grendel komt sinds QS8-694 uit de shim, niet uit deze test.**
 *    `supabase/shim/0000_supabase_shim.sql` draagt `storage.protect_delete()`
 *    en `protect_objects_delete` woordelijk zoals op productie (📏 gelezen met
 *    `pg_get_functiondef()` en `pg_get_triggerdef()` op 17-11-2026). Hier
 *    stond een nabootsing per rij; de echte is **per statement**, en gaat dus
 *    ook af als de `delete` niets raakt. Daarom faalde op productie ook een
 *    gebruiker zónder bewijsfoto, en die toets staat nu hieronder.
 *
 * ⚠️ **`set local storage.allow_delete_query = 'false'`** in elke transactie.
 *    De beheerverbinding van de tests zet die instelling aan
 *    (`PSQL_OMGEVING` in `tests/rls/psql-stack.ts`), zoals het dashboard en de
 *    Storage-API. Een verwijdering vanuit de app heeft hem niet, en die weg
 *    toetst deze test. De weg via PostgREST zelf staat in
 *    `tests/rls/accountverwijdering-langs-de-storagegrendel.test.ts`.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'verlopen_bewijsfotos'",
  import.meta.url,
);

/** Zoals een verwijdering vanuit de app: zonder de vrijstelling van de Storage-API. */
const ALS_DE_APP = `set local storage.allow_delete_query = 'false';`;

/** Een gebruiker met één bewijsfoto in de emmer; `v` houdt uid en pad vast. */
const OPZET = `
  ${ALS_DE_APP}
  create temp table v (uid uuid, pad text);
  insert into v (uid) values (shim_maak_gebruiker('bewijs-weg@proef.test', 'Weg'));
  update v set pad = gen_random_uuid() || '/' || uid || '/foto.jpg';
  insert into storage.objects (bucket_id, name) select 'bewijsfotos', pad from v;
`;

function laatsteRegel(sql: string): string {
  const uit = psql(`begin; ${OPZET} ${sql} rollback;`)
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '' && r !== 'BEGIN' && r !== 'ROLLBACK');
  return uit.at(-1) ?? '';
}

const WEES = "select count(*) from verlopen_bewijsfotos(500) w where w.pad = (select pad from v);";

describe.skipIf(!beschikbaar)('QS8-692 — een account met een bewijsfoto is te verwijderen', () => {
  it('slaagt, ook als storage.objects een delete weigert', () => {
    const uit = laatsteRegel(`
      delete from auth.users where id = (select uid from v);
      select count(*) from auth.users where email = 'bewijs-weg@proef.test';
    `);
    expect(uit).toBe('0');
  });

  it('slaagt ook zonder bewijsfoto, want de grendel van Supabase is per statement', () => {
    // 📏 Productie had op 17-11 nul bewijsfoto's, en toch faalde 1.050 van de
    //    1.050 verwijderingen: `delete from storage.objects` zonder treffer gaat
    //    langs dezelfde statement-trigger.
    const uit = psql(`begin; ${ALS_DE_APP}
      create temp table k (uid uuid);
      insert into k values (shim_maak_gebruiker('kaal-weg@proef.test', 'Kaal'));
      delete from auth.users where id = (select uid from k);
      select count(*) from auth.users where email = 'kaal-weg@proef.test';
      rollback;`)
      .split('\n').map((r) => r.trim())
      .filter((r) => r !== '' && r !== 'BEGIN' && r !== 'ROLLBACK' && r !== 'SET');
    expect(uit.at(-1)).toBe('0');
  });

  it('heeft de grendel van Supabase uit de shim, per statement', () => {
    // De toetsen hierboven bewijzen niets als de grendel er niet staat.
    expect(psql(`select (tgtype & 1) = 0 from pg_trigger where tgname = 'protect_objects_delete'`)).toBe('t');
  });

  it('laat de blob staan, want alleen de Storage-API haalt blob én rij weg', () => {
    const uit = laatsteRegel(`
      delete from auth.users where id = (select uid from v);
      select count(*) from storage.objects where name = (select pad from v);
    `);
    expect(uit).toBe('1');
  });

  it('wijst de foto van een verdwenen gebruiker aan als wees', () => {
    const uit = laatsteRegel(`delete from auth.users where id = (select uid from v); ${WEES}`);
    expect(uit).toBe('1');
  });

  it('wijst de foto van een bestaande gebruiker níét aan', () => {
    // ⚠️ De helft die dataverlies voorkomt: de pas mag nooit een foto wissen
    //    waarvan de eigenaar er nog is.
    expect(laatsteRegel(WEES)).toBe('0');
  });

  it('laat een pad zonder uuid in het tweede segment met rust', () => {
    const uit = laatsteRegel(`
      insert into storage.objects (bucket_id, name) values ('bewijsfotos', 'a/geen-uuid/foto.jpg');
      select count(*) from verlopen_bewijsfotos(500) w where w.pad = 'a/geen-uuid/foto.jpg';
    `);
    expect(uit).toBe('0');
  });

  it('kijkt alleen in de emmer bewijsfotos', () => {
    const uit = laatsteRegel(`
      insert into storage.objects (bucket_id, name)
        values ('chatfotos', gen_random_uuid() || '/' || gen_random_uuid() || '/x.jpg');
      select count(*) from verlopen_bewijsfotos(500);
    `);
    expect(uit).toBe('0');
  });

  it('is niet aanroepbaar voor authenticated of anon', () => {
    const uit = psql(`
      select has_function_privilege('authenticated', 'public.verlopen_bewijsfotos(integer)', 'execute')
          || ',' || has_function_privilege('anon', 'public.verlopen_bewijsfotos(integer)', 'execute')
          || ',' || has_function_privilege('service_role', 'public.verlopen_bewijsfotos(integer)', 'execute');
    `);
    expect(uit).toBe('false,false,true');
  });
});
