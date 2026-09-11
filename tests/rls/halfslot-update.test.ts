import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De `using`-helft van vier UPDATE-policies, apart gemeten — QS8-262, ronde 9.
 *
 * ⚠️⚠️ **Deze vier stonden als "per hélft niet te meten" in het register van
 *    `rls:dekking`, en dat was één stap te ver geredeneerd.** Het feit eronder
 *    klopt en is gemeten: `using` en `with check` dragen dezelfde uitdrukking,
 *    en de sleutelkolom (`id`, `owner_id`, `goal_id`) staat niet in de
 *    UPDATE-kolomgrant — er bestaat dus geen rij die de ene helft passeert en de
 *    andere niet. **Maar daaruit volgt niet dat de helft niet te toetsen is.**
 *
 *    📏 Gemeten op 10-09-2026, per tabel, in een terugrollende transactie: een
 *    groepsgenoot die de rij van een ander bijwerkt krijgt
 *
 *    | stand van de policy | uitkomst |
 *    |---|---|
 *    | zoals hij is | **0 rijen, geen fout** |
 *    | alleen `using` open | **`42501`** |
 *    | alleen `with check` open | 0 rijen, geen fout |
 *
 *    Zet je de `using`-helft open, dan haalt de rij de `with check` niet meer en
 *    slaat de stilte om in een harde weigering. Dat is waarneembaar, en dus
 *    toetsbaar. De vier registerrijen zijn weggehaald en vervangen door dit
 *    bestand.
 *
 * ⚠️ **De vorm komt van `todo-lijst.test.ts`**, en dáár zat het bewijs al: die
 *    tabel stond maar half in het register, precies omdat er voor de
 *    `using`-helft wél zo'n test lag. Het verschil tussen `todo_items` en
 *    `goals` zat niet in de policy maar in de testsuite.
 *
 * ⚠️⚠️ **De SELECT-policy gaat tijdelijk wagenwijd open, en zonder die regel
 *    toetst dit bestand iets anders dan het belooft.** Een UPDATE die kolommen
 *    leest — en dat doet elk verzoek met een filter — krijgt in Postgres óók de
 *    SELECT-policy over zich heen. Staat die dicht, dan is de rij al weg vóór de
 *    UPDATE-policy hem ziet, en blijft deze test groen met de `using`-helft
 *    wagenwijd open. Zelfde vondst als in `todo-lijst.test.ts`.
 *
 * ⚠️ **Elke rij heeft een must-allow ernaast.** "Nul rijen geraakt" is gratis
 *    zodra het filter nergens op past: een `using`-helft die álles wegfiltert
 *    laat de weigertests groen terwijl niemand zijn eigen rij nog kan wijzigen.
 *
 * IJKING — met de hand gedraaid op 10-09-2026, mutatie per grendel:
 *
 *   W  `<tabel>_update` op `using (true)`   → 4 rood, elk op zijn eigen tabel
 *   X  `<tabel>_update` op `using (false)`  → 4 rood, op de must-allow-helft
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname = 'goals' and p.polname = 'goals_update'",
  import.meta.url,
);

interface Geval {
  /** De tabel, en meteen de naam van de test. */
  readonly tabel: string;
  /** De SELECT-policy die tijdelijk open moet, zie de kop. */
  readonly leespolicy: string;
  /**
   * SQL die de tijdelijke tabel `t` vult met `eig` (de eigenaar), `ind` (de
   * indringer, een groepsgenoot) en `rij` (het id dat aangevallen wordt).
   */
  readonly opzet: string;
  /** De UPDATE die geprobeerd wordt; `v_rij` is de rij uit `t`. */
  readonly schrijf: string;
}

const GEVALLEN: readonly Geval[] = [
  {
    tabel: 'profiles',
    leespolicy: 'profiles_select',
    opzet: `update t set rij = eig;`,
    schrijf: `update profiles set display_name = 'overgenomen' where id = v_rij;`,
  },
  {
    tabel: 'goals',
    leespolicy: 'goals_select',
    opzet: `
      insert into goals (owner_id, title, target_date)
        select eig, 'Doel van de eigenaar', current_date + 100 from t;
      update t set rij = (
        select id from goals where owner_id = (select eig from t)
        order by created_at desc limit 1);`,
    schrijf: `update goals set title = 'overgenomen' where id = v_rij;`,
  },
  {
    tabel: 'weekly_goals',
    leespolicy: 'weekly_goals_select',
    opzet: `
      insert into goals (owner_id, title, target_date)
        select eig, 'Doel van de eigenaar', current_date + 100 from t;
      insert into weekly_goals (goal_id, title, cycle_start_date)
        select (select id from goals where owner_id = (select eig from t)
                order by created_at desc limit 1),
               'Weekdoel van de eigenaar', date_trunc('week', current_date)::date
        from t;
      update t set rij = (
        select id from weekly_goals order by created_at desc limit 1);`,
    schrijf: `update weekly_goals set title = 'overgenomen' where id = v_rij;`,
  },
  {
    // ⚠️ Hier is de eigenaar de **beheerder** en de indringer een gewoon lid:
    //    `groups_update` staat op `is_group_admin(id)` en niet op eigenaarschap.
    tabel: 'groups',
    leespolicy: 'groups_select',
    opzet: `
      insert into groups (name, invite_code, created_by)
        select 'Groep van de eigenaar', 'H' || substr(md5(random()::text), 1, 6), eig from t;
      update t set rij = (select id from groups order by created_at desc limit 1);
      insert into group_members (group_id, user_id, role, status)
        select rij, eig, 'admin', 'active' from t;
      insert into group_members (group_id, user_id, role, status)
        select rij, ind, 'member', 'active' from t;`,
    schrijf: `update groups set name = 'overgenomen' where id = v_rij;`,
  },
];

/**
 * Draait één poging in een transactie die terugrolt, en geeft `GERAAKT n` of
 * `GEWEIGERD <sqlstate>` terug.
 *
 * ⚠️ Het onderscheid tussen die twee ís de meting: dicht hoort `GERAAKT 0` te
 *    geven, en met de `using`-helft open wordt het `GEWEIGERD 42501`.
 */
function probeer(geval: Geval, wie: 'eig' | 'ind'): string {
  const uit = psql(`
    begin;
    create temp table t as
      select shim_maak_gebruiker('halfslot-e-' || gen_random_uuid() || '@proef.test', 'E') eig,
             shim_maak_gebruiker('halfslot-i-' || gen_random_uuid() || '@proef.test', 'I') ind,
             null::uuid rij;
    grant select on t to authenticated;

    ${geval.opzet}

    -- Zie de kop: zonder deze regel filtert de leespolicy de rij weg en toetst
    -- dit bestand niet de helft waar het over gaat.
    alter policy ${geval.leespolicy} on ${geval.tabel} using (true);

    select set_config('request.jwt.claims',
      json_build_object('sub', ${wie}, 'role', 'authenticated')::text, true) from t;

    do $proef$
    declare v_rij uuid; v_n integer;
    begin
      select rij into v_rij from t;
      set local role authenticated;
      ${geval.schrijf}
      get diagnostics v_n = row_count;
      reset role;
      perform set_config('proef.uitslag', 'GERAAKT ' || v_n, true);
    exception when others then
      reset role;
      perform set_config('proef.uitslag', 'GEWEIGERD ' || sqlstate, true);
    end $proef$;

    select current_setting('proef.uitslag');
    rollback;
  `)
    .split('\n')
    .filter((r) => r.trim() !== '')
    .at(-1) as string;

  return uit.trim();
}

describe.skipIf(!beschikbaar)('de using-helft van vier UPDATE-policies', () => {
  for (const geval of GEVALLEN) {
    it(
      `${geval.tabel}: een ander raakt de rij niet, en krijgt geen weigering te zien`,
      () => {
        expect(
          probeer(geval, 'ind'),
          `met de leespolicy open is \`${geval.tabel}_update using (…)\` de enige ` +
            'grendel die er nog staat; hij hoort de rij weg te filteren en niet ' +
            'de `with check` te laten weigeren',
        ).toBe('GERAAKT 0');
      },
      60_000,
    );

    it(
      `${geval.tabel}: en wie het wél mag, wijzigt zijn eigen rij gewoon`,
      () => {
        expect(probeer(geval, 'eig')).toBe('GERAAKT 1');
      },
      60_000,
    );
  }
});
