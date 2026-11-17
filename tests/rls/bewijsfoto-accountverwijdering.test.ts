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
 * ⚠️ **De lokale stack heeft die trigger niet.** Daarom bouwt elke test hem
 *    hieronder na (binnen een transactie die terugrolt), met dezelfde regel als
 *    Supabase: weigeren tenzij `storage.allow_delete_query` op `'true'` staat.
 *    Zonder deze nabootsing slaagt de oude functie lokaal, en dan toetst de test
 *    niets van wat misging. Dat die nabootsing klopt met de échte trigger is
 *    niet gemeten (`storage.protect_delete` is hier niet te lezen); het enige dat
 *    uit de issuetekst volgt is de melding en de instelling.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'verlopen_bewijsfotos'",
  import.meta.url,
);

const SUPABASE_GRENDEL = `
  create function pg_temp.protect_delete() returns trigger language plpgsql as $f$
  begin
    if coalesce(current_setting('storage.allow_delete_query', true), '') <> 'true' then
      raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
        using errcode = '42501';
    end if;
    return old;
  end $f$;
  create trigger protect_objects_delete before delete on storage.objects
    for each row execute function pg_temp.protect_delete();
`;

/** Een gebruiker met één bewijsfoto in de emmer; `v` houdt uid en pad vast. */
const OPZET = `
  ${SUPABASE_GRENDEL}
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
