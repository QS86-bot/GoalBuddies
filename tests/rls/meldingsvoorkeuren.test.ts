import { describe, expect, it } from 'vitest';

import { MELDINGSOORTEN, VOORKEUR_PER_SOORT } from '../../src/modules/notifications/regels';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De schakelaars in de code en de kolommen in de database zijn hetzelfde — QS8-92.
 *
 * ⚠️ **Dit is de naad die geen van beide kanten alleen kan bewaken.**
 *    `VOORKEUR_PER_SOORT` zegt "lees `notify_cycle_summary`"; de database moet
 *    die kolom hébben, en `authenticated` moet hem mogen schrijven en juist niet
 *    mogen lezen van een ánder. Klopt één van die drie niet, dan is er niets
 *    kapot en niets rood — de job leest `undefined`, dat is falsy, en dan zwijgt
 *    hij voor iedereen. Stiller dan dat wordt een bug niet.
 *
 * ⚠️ De namen worden aan de codekant uitgelezen uit `VOORKEUR_PER_SOORT` en niet
 *    overgetypt. Een derde lijst hier zou precies de fout zijn die deze test
 *    moet vangen.
 */

/** De kolomnamen die de code van `profiles` verwacht, zonder `reminder_enabled`. */
const NOTIFY_KOLOMMEN = MELDINGSOORTEN.map((s) => VOORKEUR_PER_SOORT[s]).filter(
  (k) => k !== 'reminder_enabled',
);

function kolommenVan(tabel: string): string[] {
  return psql(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = '${tabel}'`,
  )
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
}

function grants(soort: 'SELECT' | 'UPDATE'): string[] {
  return psql(
    `select column_name from information_schema.column_privileges
      where table_name = 'profiles' and grantee = 'authenticated'
        and privilege_type = '${soort}'`,
  )
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
}

const TEST_TIMEOUT = 30_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from information_schema.columns where table_name = 'profiles' and column_name = 'notify_cycle_summary'",
  import.meta.url,
);

describe.skipIf(!beschikbaar)('meldingsvoorkeuren', () => {

  it('heeft voor elke dempbare soort een kolom op `profiles`', () => {
    expect(NOTIFY_KOLOMMEN.length).toBe(4);
    const kolommen = kolommenVan('profiles');
    for (const kolom of NOTIFY_KOLOMMEN) {
      expect(kolommen).toContain(kolom);
    }
  }, TEST_TIMEOUT);

  it('laat de eigenaar ze schrijven', () => {
    const mag = grants('UPDATE');
    for (const kolom of NOTIFY_KOLOMMEN) {
      expect(mag).toContain(kolom);
    }
  });

  /**
   * ⚠️ **En juist níet lezen.** `profiles_select` staat groepsgenoten toe, en RLS
   *    kan geen kolommen beperken — de kolomgrant is hier de énige grendel. Een
   *    `grant select` erbij zou je dagritme aan je buddy's geven.
   */
  it('geeft er geen leesrecht op, ook niet per ongeluk', () => {
    const mag = grants('SELECT');
    expect(mag.sort()).toEqual(['avatar_url', 'display_name', 'id']);
    for (const kolom of NOTIFY_KOLOMMEN) {
      expect(mag).not.toContain(kolom);
    }
  });

  /**
   * ⚠️ De schakelaar voor `nudge` is `reminder_enabled`. Een `notify_nudge`
   *    ernaast zou hetzelfde feit op twee plekken zetten — QS8-125 — en dan is
   *    het een kwestie van tijd tot er één bijgewerkt wordt en de andere liegt.
   */
  it('heeft géén kolom `notify_nudge`', () => {
    expect(kolommenVan('profiles')).not.toContain('notify_nudge');
    expect(VOORKEUR_PER_SOORT.nudge).toBe('reminder_enabled');
  }, TEST_TIMEOUT);

  it('toont ze wél aan de eigenaar via `mijn_profiel`', () => {
    const kolommen = kolommenVan('mijn_profiel');
    for (const kolom of NOTIFY_KOLOMMEN) {
      expect(kolommen).toContain(kolom);
    }
  }, TEST_TIMEOUT);
});
