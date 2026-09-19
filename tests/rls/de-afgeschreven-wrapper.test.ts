import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De belofte: **`maak_straffen_verschuldigd(uuid, date)` is geen tweede
 * implementatie maar een doorgeefluik, en de datum die hij krijgt doet niets** —
 * QS8-548, migratie 0293.
 *
 * ⚠️⚠️ **Waarom die wrapper bestaat.** `0293` haalde `p_vandaag` van de functie
 *    die het werk doet: die datum kwam uit de levende `profiles.tz` en was
 *    precies het gat van dit issue. De **gedeployde** rollover stuurt hem nog
 *    mee — 📏 `supabase/uitgerold.json` zegt dat productie op `0282` staat
 *    (gemeten 17-09-2026) terwijl de map veel verder is — en een migratie die
 *    een RPC-handtekening dropt maakt een deploy tot een harde volgorde-eis die
 *    hier nergens afdwingbaar is. Zelfde vorm en zelfde reden als `0186` /
 *    QS8-324.
 *
 * ⚠️⚠️ **En hij is meer dan compatibiliteit: hij past de reparatie óók toe op de
 *    gedeployde rollover.** Daarom is "de wrapper negeert zijn datum" hier geen
 *    detail maar de belofte zelf. Zou hij hem alsnog gebruiken — of zou iemand
 *    het lichaam kopiëren in plaats van door te geven — dan staat het gat open
 *    voor iedereen die nog niet opnieuw uitgerold is, en ziet niemand dat.
 *
 * ⚠️ **Een wrapper zonder einddatum is permanent.** De voorwaarde waaronder hij
 *    weg mag staat in zijn `comment on` én als QS8-559; de laatste toets
 *    hieronder houdt vast dat die zin er is.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  `select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'maak_straffen_verschuldigd'
      and p.pronargs = 1`,
  import.meta.url,
);

/** `UTC+14`. */
const OOST = 'Pacific/Kiritimati';
/** `UTC−10`, en exact 24 uur achter {@link OOST} — zie de zustersuite. */
const WEST = 'Pacific/Honolulu';

/**
 * Zet twee identieke opstellingen neer en draait op de ene de eenargumentsvorm
 * en op de andere de wrapper.
 *
 * ⚠️ **Twee opstellingen en niet één, want de eerste aanroep zet de straf op
 *    `due`.** Zou deze helper dezelfde rij twee keer gebruiken, dan gaf de
 *    tweede aanroep altijd nul en zou elk verschil onzichtbaar zijn — een toets
 *    die groen blijft terwijl de belofte breekt.
 */
function beideVormen(bijAangaan: string, daarna: string, dagenTerug: number, datum: string): string {
  const opzet = (eigenaar: string): string => `
  ${eigenaar} := gen_random_uuid();
  v_b := gen_random_uuid();
  v_grp := gen_random_uuid();
  insert into auth.users (id, email) values (${eigenaar}, ${eigenaar} || '@zz.test'), (v_b, v_b || '@zz.test');
  update profiles set tz = '${bijAangaan}' where id = ${eigenaar};
  update profiles set tz = 'UTC'           where id = v_b;
  insert into groups (id, name, created_by, invite_code, huddle_day, tz)
    values (v_grp, 'Proefgroep', ${eigenaar}, 'ZZ' || substr(md5(random()::text), 1, 10), 1, 'UTC');
  insert into group_members (group_id, user_id, role, status)
    values (v_grp, ${eigenaar}, 'admin', 'active'), (v_grp, v_b, 'member', 'active');
  v_t := (now() at time zone '${bijAangaan}')::date - ${dagenTerug};
  insert into goals (owner_id, title, target_date)
    values (${eigenaar}, 'Doel met een streefdatum', v_t) returning id into v_g;
  insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id, status, created_at)
    values (v_g, 'penalty', 'Ik doneer vijftig euro aan een goed doel', now(), v_grp, 'set',
            now() - interval '30 days');
  update profiles set tz = '${daarna}' where id = ${eigenaar};`;

  return `
begin;
do $$
declare
  v_een uuid; v_twee uuid; v_b uuid; v_grp uuid; v_g uuid; v_t date;
  n_een integer; n_twee integer;
begin
  ${opzet('v_een')}
  ${opzet('v_twee')}
  n_een  := public.maak_straffen_verschuldigd(v_een);
  n_twee := public.maak_straffen_verschuldigd(v_twee, ${datum});
  create temp table uitslag (regel text);
  insert into uitslag values ('eenarguments=' || n_een);
  insert into uitslag values ('wrapper=' || n_twee);
end $$;
select regel from uitslag;
rollback;`;
}

/** Draait een opstelling en geeft stdout terug. */
function meet(sql: string): string {
  try {
    return psqlMetInvoer(sql);
  } catch (fout) {
    return fout instanceof Error ? fout.message : String(fout);
  }
}

describe.skipIf(!beschikbaar)('de afgeschreven wrapper', () => {
  const TIMEOUT = 30_000;

  // -------------------------------------------------------------------------
  // De naad: één implementatie, twee deuren
  // -------------------------------------------------------------------------

  /**
   * ⚠️⚠️ **Dit is de toets die de belofte draagt.** Vier opstellingen, en in elke
   *    moeten de twee handtekeningen hetzelfde antwoord geven — inclusief de
   *    aanval waarvoor `0293` gemaakt is. Gaat iemand het lichaam kopiëren in
   *    plaats van door te geven, dan lopen ze hier uiteen.
   *
   *    📏 Gemeten op 19-09-2026, in alle vier de gevallen gelijk.
   */
  it(
    'geeft door beide deuren hetzelfde antwoord',
    () => {
      const gevallen: readonly (readonly [string, string, string, number, string])[] = [
        ['eerlijk, streefdatum gisteren', 'UTC', 'UTC', 1, `(now() at time zone 'UTC')::date`],
        ['de aanval: zone westwaarts', OOST, WEST, 1, `(now() at time zone '${WEST}')::date`],
        ['streefdatum vandaag: nog niet verstreken', 'UTC', 'UTC', 0, `(now() at time zone 'UTC')::date`],
        ['ruim verstreken', OOST, WEST, 10, `(now() at time zone '${WEST}')::date`],
      ];

      for (const [naam, bij, na, dagen, datum] of gevallen) {
        const uit = meet(beideVormen(bij, na, dagen, datum));
        const een = /eenarguments=(\d+)/.exec(uit)?.[1];
        const twee = /wrapper=(\d+)/.exec(uit)?.[1];

        expect(een, `${naam}: geen uitslag uit de eenargumentsvorm — ${uit}`).toBeDefined();
        expect(twee, `${naam}: de wrapper gaf een ander antwoord dan de functie eronder`).toBe(een);
      }
    },
    TIMEOUT,
  );

  /**
   * ⚠️⚠️ **De wrapper negeert zijn datum, en dat is de reparatie zelf.** Tien jaar
   *    terug of tien jaar vooruit verandert niets: het antwoord komt uit
   *    `doeldatum()` en niet uit wat de beller meestuurt.
   *
   *    Zonder dit geval zou de toets hierboven ook groen zijn bij een wrapper
   *    die `p_vandaag` gewoon doorgeeft — want de gevallen daar sturen precies
   *    de datum mee die de gedeployde rollover zou sturen.
   */
  it(
    'laat zich niet sturen door de datum die de beller meestuurt',
    () => {
      const terug = meet(beideVormen('UTC', 'UTC', 1, `current_date - 3650`));
      const vooruit = meet(beideVormen('UTC', 'UTC', 0, `current_date + 3650`));

      expect(terug, 'een datum van tien jaar terug hield de straf tegen').toContain('wrapper=1');
      expect(vooruit, 'een datum van tien jaar vooruit liet de straf afgaan').toContain('wrapper=0');
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De vorm: wie mag wat, en wie draagt de autorisatie
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **Geen tweede `security definer`.** De wrapper hoeft niets te mogen wat de
   *    beller niet mag; de eenargumentsvorm is zélf definer en draagt de
   *    autorisatie. Een definer erbovenop is oppervlak zonder reden — en elke
   *    definer-functie in dit project is een kopie van de vorige, zo groeit die
   *    verzameling zonder dat iemand het besluit. Zelfde regel als in `0186`.
   */
  it(
    'laat de autorisatie bij de functie eronder',
    () => {
      const uit = psqlMetInvoer(`
        select p.pronargs || ':definer=' || p.prosecdef
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'maak_straffen_verschuldigd'
         order by p.pronargs;`);

      expect(uit, 'de eenargumentsvorm is geen definer meer — dan draagt niemand de autorisatie').toContain(
        '1:definer=t',
      );
      expect(uit, 'de wrapper is definer geworden; dat is oppervlak zonder reden').toContain('2:definer=f');
    },
    TIMEOUT,
  );

  /**
   * ⚠️ **De grant ís hier de grendel**, en dat staat ook zo in het register van
   *    `scripts/definers-controle.mjs`. `authenticated` mag deze functie niet
   *    aanroepen — hij zou er de straf van een ander mee kunnen laten afgaan.
   *    Beide handtekeningen moeten dat dragen; een overload erft niets.
   */
  it(
    'houdt beide handtekeningen dicht voor `anon` en `authenticated`',
    () => {
      const uit = psqlMetInvoer(`
        select 'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
            || ' auth=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
            || ' service=' || has_function_privilege('service_role', p.oid, 'EXECUTE')
            || ' (' || p.pronargs || ')'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'maak_straffen_verschuldigd'
         order by p.pronargs;`);

      expect(uit).toContain('anon=false auth=false service=true (1)');
      expect(uit).toContain('anon=false auth=false service=true (2)');
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De einddatum
  // -------------------------------------------------------------------------

  /**
   * ⚠️⚠️ **Een wrapper zonder einddatum is permanent.** De voorwaarde waaronder
   *    deze weg mag hoort bij de functie te staan en niet alleen in een
   *    migratiebestand dat niemand meer opent — wie hem in de database
   *    tegenkomt, moet niet hoeven raden of hij nog ergens voor dient.
   *
   * ⚠️ Deze toets grijpt naar een tekst en niet naar gedrag, en dat is hier de
   *    bedoeling: de belofte ís dat de tekst er staat.
   */
  it(
    'draagt de voorwaarde waaronder hij weg mag',
    () => {
      const uit = psqlMetInvoer(
        `select coalesce(obj_description('public.maak_straffen_verschuldigd(uuid,date)'::regprocedure, 'pg_proc'), '(geen)');`,
      );

      expect(uit, 'de wrapper zegt niet meer dat hij afgeschreven is').toContain('Afgeschreven');
      expect(uit, 'de wrapper noemt het issue niet waaronder hij weg mag').toContain('QS8-559');
      expect(
        uit,
        'de voorwaarde is verwaterd tot "als de rollover gedeployd is" — de meting tegen de gedeployde bundel is de grendel',
      ).toContain('gedeployde bundel');
    },
    TIMEOUT,
  );
});
