/**
 * Een account is te verwijderen, ook met Supabase' storagegrendel ervoor —
 * QS8-701, migratie 0299.
 *
 * **De belofte die dit bestand bewaakt:**
 *
 *      Wie zijn account opzegt, is daarna weg. Zijn bewijsfoto's gaan mee. En
 *      wat de grendel verder tegenhoudt, houdt hij daarna nog steeds tegen.
 *
 * ⚠️⚠️ **Waarom dit er niet eerder was: de lokale stack kende de grendel niet.**
 *    Supabase zet op `storage.objects` een `before delete`-trigger per statement
 *    die elke SQL-delete weigert (42501). 0230 wist bewijsfoto's met zo'n delete,
 *    in een trigger op `profiles`, dus elke profielverwijdering op productie liep
 *    erop vast. Ook bij nul foto's, want per statement vuurt hij altijd. De
 *    steiger kreeg de grendel in QS8-701, letterlijk van productie.
 *
 * ⚠️ **Dit draait waar de grendel staat: de lokale stack, via PostgREST.**
 *    PostgREST verbindt als `authenticator` en krijgt de beheerdersuitzondering
 *    van de steiger niet. `verwijder_mijn_account()` loopt hier dus door dezelfde
 *    trigger als op productie. §1 controleert dat de grendel er staat; zonder
 *    die controle zou §2 groen zijn op een stack zonder grendel, en dan bewijst
 *    hij niets.
 *
 * **Met de hand rood gemaakt, grendel voor grendel (regel 18, vraag 3):**
 *
 *      1. 0299 teruggezet naar het lichaam van 0230
 *         → §2 beide rood (42501 in `verwijder_mijn_account()`); §1 en §3 groen
 *      2. de regel die de instelling terugzet weggelaten
 *         → §3 rood: de grendel staat na de verwijdering nog open; §2 groen
 *      3. `storage.protect_delete()` leeggemaakt, met de trigger nog op zijn plek
 *         → §1 en §3 rood; §2 groen, en dat hoort zo. De trigger zelf
 *         weghalen raakt §1 niet: dan weigert de proef bovenaan het bestand al
 *         te draaien, en dat is een eerdere grendel.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  gooiBijMisluktOpruimen,
  removeTestUsers,
  rlsTestsConfigured,
} from './harness';
import { psql as psqlKaal, stackBeschikbaarOfFaal } from './psql-stack';

const TEST_TIMEOUT = 30_000;

const psql = (sql: string) => psqlKaal(sql, { verbose: true });

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_trigger where tgname = 'protect_objects_delete'",
  import.meta.url,
);

/** Voert `sql` uit als `postgres`, maar zónder de beheerdersuitzondering. */
function zonderUitzondering(sql: string): string {
  try {
    psql(
      `begin;
       set local storage.allow_delete_query = 'false';
       ${sql};
       rollback;`,
    );
    return 'OK';
  } catch (fout) {
    const tekst = fout instanceof Error ? fout.message : String(fout);
    if (/Direct deletion from storage tables is not allowed/.test(tekst)) return '42501';
    return tekst.split('\n')[0] ?? 'FOUT';
  }
}

describe.runIf(rlsTestsConfigured && beschikbaar)('accountverwijdering en de storagegrendel (0299)', () => {
  afterAll(async () => {
    await removeTestUsers();
  });

  it(
    '§1 de grendel van productie staat op deze stack',
    () => {
      // Zonder dit is §2 geen bewijs: dan slaagt de verwijdering omdat er niets
      // in de weg staat, en niet omdat 0299 de weg vrijmaakt.
      expect(zonderUitzondering('delete from storage.objects where false')).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    '§2 verwijder_mijn_account() slaagt voor een gebruiker zonder bewijsfoto',
    async () => {
      // ⚠️ Zonder foto: de grendel vuurt per statement, dus ook hier. Dat was het
      //    geval dat iedereen trof, niet alleen wie ooit een foto maakte.
      const wie = await createTestUser('zonder-foto');
      const weg = await wie.db.rpc('verwijder_mijn_account');
      expect(weg.error, weg.error?.message).toBeNull();
      expect((weg.data as { ok?: boolean } | null)?.ok, JSON.stringify(weg.data)).toBe(true);

      const profiel = await adminDb().from('profiles').select('id').eq('id', wie.id);
      expect(profiel.data ?? []).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    '§2 verwijder_mijn_account() slaagt mét bewijsfoto, en de foto gaat mee',
    async () => {
      const wie = await createTestUser('met-foto');
      const pad = `${randomUUID()}/${wie.id}/bewijs.jpg`;
      psql(`insert into storage.objects (bucket_id, name) values ('bewijsfotos', '${pad}')`);
      expect(psql(`select count(*) from storage.objects where name = '${pad}'`)).toBe('1');

      const weg = await wie.db.rpc('verwijder_mijn_account');
      expect(weg.error, weg.error?.message).toBeNull();
      expect((weg.data as { ok?: boolean } | null)?.ok, JSON.stringify(weg.data)).toBe(true);

      expect(psql(`select count(*) from storage.objects where name = '${pad}'`)).toBe('0');
    },
    TEST_TIMEOUT,
  );

  it(
    '§3 na de verwijdering staat de grendel weer dicht, in dezelfde transactie',
    () => {
      // ⚠️ `set_config(…, true)` geldt tot het eind van de transactie. Zonder het
      //    terugzetten in 0299 zou de kale delete hieronder slagen: de
      //    verwijdering had de grendel dan voor de rest van de transactie open
      //    laten staan.
      const id = psql(`select public.shim_maak_gebruiker('rls-grendel-${randomUUID()}@example.com', 'Grendel')`);
      try {
        expect(
          zonderUitzondering(
            `delete from auth.users where id = '${id}';
             delete from storage.objects where false`,
          ),
        ).toBe('42501');
        // En de verwijdering zelf, op zichzelf, slaagt wél.
        expect(zonderUitzondering(`delete from auth.users where id = '${id}'`)).toBe('OK');
      } finally {
        psql(`delete from auth.users where id = '${id}'`);
      }
    },
    TEST_TIMEOUT,
  );
});

describe('gooiBijMisluktOpruimen — een mislukte opruiming is rood (QS8-701)', () => {
  it('zwijgt als alles weg kon', () => {
    expect(() => gooiBijMisluktOpruimen([], 3)).not.toThrow();
  });

  it('gooit als er één niet weg kon, met de reden erbij', () => {
    expect(() => gooiBijMisluktOpruimen(['abc: Direct deletion from storage tables is not allowed.'], 3)).toThrow(
      /1 van de 3 testgebruikers.*\n[\s\S]*Direct deletion/,
    );
  });
});
