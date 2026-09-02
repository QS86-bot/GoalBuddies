/**
 * De pin op `groups` — QS8-264.
 *
 * ⚠️ **De belofte is niet "de trigger staat er".** Die is: *een client kan
 *    `status`, `zichtbaarheid`, `ontdekbaar`, `invite_code`, `invite_revoked`,
 *    `last_activity_at`, `id`, `created_at` en `created_by` niet wijzigen* — ook
 *    niet met één verzoek buiten de UI om, en ook niet als er ooit per ongeluk
 *    een kolomrecht bij glipt.
 *
 * ⚠️⚠️ **Waarom dit bestand bestaat: er waren twee grendels en er werkte er één.**
 *    `guard_group_update()` besliste op `current_user not in ('authenticated',
 *    'anon')` terwijl hij zélf `SECURITY DEFINER` was. Binnen een definer-functie
 *    is `current_user` de eigenaar, dus daar stond altijd `postgres` — de eerste
 *    regel nam élke keer de vroege uitgang en er werd nooit iets gepind.
 *
 *    Er lekte niets, want geen van die kolommen stond in de UPDATE-kolomgrant
 *    van `authenticated`. Maar dát was de enige grendel, terwijl 0019 de trigger
 *    er met zoveel woorden naast zette als tweede — *"die vangt ook het geval
 *    waarin iemand ooit per ongeluk `grant update on groups` uitvoert"* — en
 *    `scripts/zichtbaarheid-controle.mjs` en `tests/rls/ontdekken.test.ts`
 *    schrijven allebei op dat het er twee zijn.
 *
 *    **En dat is precies het geval dat deze suite naspeelt.** Elke test geeft
 *    `authenticated` tijdelijk het kolomrecht dat hij vandaag niet heeft, en
 *    kijkt of de trigger de wijziging alsnog terugdraait. Zonder die grant zou
 *    deze suite de grant toetsen en niet de pin — groen om de verkeerde reden,
 *    en dan bewaakt hij precies niets (CLAUDE.md regel 18, vraag 3).
 *
 * ⚠️ **Waarom psql en niet de harness.** Het kolomrecht tijdelijk toekennen is
 *    DDL, en dat is geen PostgREST-oppervlak. Alles draait in één transactie die
 *    aan het eind terugrolt, dus de grant overleeft de test niet. Dezelfde vorm
 *    als `avatarbucket.test.ts`.
 *
 * ⚠️ **Draait alleen tegen de lokale stack**, want daar is een supergebruiker.
 *    Zonder stack wordt deze suite overgeslagen — en dat is *ongemeten* en niet
 *    groen.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const OMGEVING = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? '127.0.0.1',
  PGPORT: process.env.PGPORT ?? '5432',
  PGPASSWORD: process.env.PGPASSWORD ?? 'postgres',
};

const DB = process.env.PGDATABASE ?? 'goalbuddies_rls';

function psql(sql: string): string {
  return execFileSync(
    'psql',
    ['-U', 'postgres', '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1', '-tAc', sql],
    { env: OMGEVING, encoding: 'utf8' },
  ).trim();
}

function stackBeschikbaar(): boolean {
  try {
    return psql("select count(*) from pg_proc where proname = 'guard_group_update'") === '1';
  } catch {
    return false;
  }
}

const beschikbaar = stackBeschikbaar();

/**
 * De kolommen die `guard_group_update()` vastpint, met een waarde die er
 * aantoonbaar ánders uitziet dan wat de opstelling erin zet.
 *
 * ⚠️ `id`, `created_at` en `created_by` staan er niet bij: die drie hebben een
 *    eigen tak in de trigger (`created_by` mag naar `null` lopen wegens
 *    `on delete set null`, zie 0060/0086) en horen bij een andere belofte.
 */
const GEPIND: readonly { kolom: string; nieuw: string; hoortTeBlijven: string }[] = [
  { kolom: 'status', nieuw: "'sleeping'", hoortTeBlijven: 'active' },
  { kolom: 'ontdekbaar', nieuw: 'true', hoortTeBlijven: 'false' },
  { kolom: 'zichtbaarheid', nieuw: "'open'", hoortTeBlijven: 'beschermd' },
  { kolom: 'invite_code', nieuw: "'GEKAAPT1'", hoortTeBlijven: 'PINCODE1' },
  { kolom: 'invite_revoked', nieuw: 'true', hoortTeBlijven: 'false' },
];

/**
 * Bouwt een groep, geeft `authenticated` tijdelijk het kolomrecht, laat hem de
 * update doen en geeft terug wat er daarna in de kolom staat. Rolt alles terug.
 */
function naClientUpdate(kolom: string, nieuw: string): string {
  return psql(`
    begin;
    create temp table t as select gen_random_uuid() eig, gen_random_uuid() grp;
    grant select on t to authenticated;
    insert into auth.users (id, email) select eig, 'pin@x.nl' from t;
    -- Let op: categorie staat er meteen in, want
    -- groups_ontdekbaar_heeft_categorie weigert een ontdekbare groep zonder
    -- categorie. Zonder die waarde wordt de test rood op een CHECK in plaats
    -- van op de pin.
    insert into groups (id, name, created_by, status, invite_code, categorie)
      select grp, 'Pin', eig, 'active', 'PINCODE1', 'other' from t;
    insert into group_members (group_id, user_id, role, status)
      select grp, eig, 'admin', 'active' from t;

    -- ⚠️ Het recht dat hij vandaag niet heeft. Zonder deze regel toetst de test
    --    de grant en niet de pin.
    grant update (${kolom}) on groups to authenticated;

    select set_config('request.jwt.claims',
      json_build_object('sub', eig, 'role', 'authenticated')::text, true) from t;
    set local role authenticated;
    update groups set ${kolom} = ${nieuw} where id = (select grp from t);
    reset role;

    select ${kolom}::text from groups where id = (select grp from t);
    rollback;
  `)
    .split('\n')
    .filter((r) => r.trim() !== '')
    .at(-1) as string;
}

describe.skipIf(!beschikbaar)('de pin op groups houdt een client tegen', () => {
  for (const { kolom, nieuw, hoortTeBlijven } of GEPIND) {
    it(
      `${kolom} is niet door een client te wijzigen, ook niet mét het kolomrecht`,
      () => {
        expect(
          naClientUpdate(kolom, nieuw),
          `${kolom}: de trigger hoort dit terug te draaien — met alleen de ` +
            'kolomgrant als slot is dit één grendel en geen twee',
        ).toBe(hoortTeBlijven);
      },
      30_000,
    );
  }

  /**
   * ⚠️ **De must-allow-helft, en die weegt hier even zwaar.** De pin mag de
   *    legitieme route niet dichtzetten: `archiveer_groep()` en
   *    `zet_groepszichtbaarheid()` zijn definer-functies die deze kolommen juist
   *    wél horen te veranderen, na hun eigen toetsing. Zou de reparatie ook die
   *    tegenhouden, dan kan niemand meer een groep archiveren.
   */
  it(
    'een definer-functie mag deze kolommen nog wél veranderen',
    () => {
      const uit = psql(`
        begin;
        create temp table t as select gen_random_uuid() eig, gen_random_uuid() grp;
        grant select on t to authenticated;
        insert into auth.users (id, email) select eig, 'pin2@x.nl' from t;
        insert into groups (id, name, created_by, status, invite_code)
          select grp, 'Pin2', eig, 'active', 'PINCODE2' from t;
        insert into group_members (group_id, user_id, role, status)
          select grp, eig, 'admin', 'active' from t;

        select set_config('request.jwt.claims',
          json_build_object('sub', eig, 'role', 'authenticated')::text, true) from t;
        set local role authenticated;
        select archiveer_groep(grp, true) from t;
        reset role;

        select status from groups where id = (select grp from t);
        rollback;
      `)
        .split('\n')
        .filter((r) => r.trim() !== '')
        .at(-1) as string;

      expect(uit, 'archiveer_groep() hoort de status wél te mogen zetten').toBe('archived');
    },
    30_000,
  );
});
