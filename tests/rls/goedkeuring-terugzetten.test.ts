import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Wat er gebeurt als je `completion_approvals` terugzet — reviewrij 15-09-2026.
 *
 * ⚠️⚠️ **De aanleiding.** 0275 liet de trigger op goedkeuringen ook toetsen of de
 *    voltooiing nog de actieve is. Dat is voor levend verkeer precies goed: je
 *    keurt geen voltooiing goed die al vervangen is. Maar bij een **quorum** is
 *    een goedkeuring op een inmiddels vervángen voltooiing de gewone gang van
 *    zaken, niet een randgeval:
 *
 *      1. Bob keurt goed          -> de week blijft `pending` (1 van 2)
 *      2. Alice dient opnieuw in  -> de eerste voltooiing wordt vervangen
 *      3. die eerste draagt nu een volkomen legitieme goedkeuring
 *
 *    `dien_opnieuw_in()` ruimt die goedkeuring niet op, en dat hóórt ook niet:
 *    voltooiingen en goedkeuringen zijn append-only (domeinregel 6).
 *
 *    📏 Gemeten: die rij is daarna **niet meer terug te schrijven**. Een
 *    volledige `pg_restore` gaat goed — triggers zitten in de post-data-sectie,
 *    dus de data is er al vóór de trigger bestaat — maar een `--data-only`
 *    terugzet van juist deze tabel loopt erop vast. En dat is precies wat je
 *    doet om één migratie ongedaan te maken.
 *
 * ⚠️ **Dit bestand verandert niets aan dat gedrag en wil dat ook niet.** De
 *    trigger heeft gelijk; wat ontbrak was dat iemand het wist. Het legt de
 *    eigenschap vast zodat een volgende lezer hem vindt vóór een terugzet, en
 *    zodat wie de trigger ooit verzacht, ziet wát hij verzacht.
 *    `docs/DEPLOY.md` §2.9a draagt de handleiding.
 *
 * ⚠️⚠️ **En het meet de prijs van de remedie, want die is niet nul.** De
 *    standaardoplossing (`--disable-triggers`, oftewel
 *    `session_replication_role = replica`) zet álle gebruikers­triggers uit — ook
 *    de helft van domeinregel 3 die in een trigger zit. 📏 Gemeten valt de regel
 *    dan in tweeën uiteen, en dat is exact waarom hij in dit project met twee
 *    middelen is afgedwongen: de CHECK houdt stand, de trigger niet.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  // De vierde clausule komt uit 0275; zonder die migratie meet dit bestand niets.
  "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
    "where n.nspname = 'public' and p.proname = 'fill_approval_subject' " +
    "and pg_get_functiondef(p.oid) like '%superseded_by is not null%'",
  import.meta.url,
);

/**
 * Een groep met quorum 2, een weekdoel, een goedgekeurde voltooiing die daarna
 * vervangen is, en die goedkeuring alvast verwijderd — klaar om terug te zetten.
 *
 * ⚠️ De volgorde is die van `dien_opnieuw_in()` zelf: de nieuwe voltooiing komt
 *    binnen mét `superseded_by` gevuld, want `completions_active_uniq` laat er
 *    maar één actief zijn per weekdoel. Andersom botst hij.
 */
const OPZET = `
do $$
declare
  v_alice uuid; v_bob uuid; v_grp uuid; v_goal uuid; v_wg uuid; v_c1 uuid; v_c2 uuid;
  v_cyclus date := date_trunc('week', current_date)::date;
begin
  v_alice := public.shim_maak_gebruiker('alice-terugzet@x.nl','Alice');
  v_bob   := public.shim_maak_gebruiker('bob-terugzet@x.nl','Bob');
  insert into public.groups (name, created_by, approval_rule, approval_quorum, invite_code, evidence_policy)
    values ('Terugzetgroep', v_alice, 'quorum', 2, 'TERUG1', 'optional') returning id into v_grp;
  insert into public.group_members (group_id, user_id, role)
    values (v_grp, v_alice, 'admin'), (v_grp, v_bob, 'member');
  insert into public.goals (owner_id, title, target_date)
    values (v_alice, 'Doel', current_date + 30) returning id into v_goal;
  insert into public.goal_group_links (goal_id, group_id) values (v_goal, v_grp);
  insert into public.weekly_goals (goal_id, title, cycle_start_date)
    values (v_goal, 'Week', v_cyclus) returning id into v_wg;
  insert into public.completions (weekly_goal_id, user_id, achieved_level, cycle_start_date)
    values (v_wg, v_alice, 'ceiling', v_cyclus) returning id into v_c1;

  -- Legitiem: quorum 2, dus na Bob staat de week nog op pending.
  insert into public.completion_approvals (completion_id, approver_id, subject_id, group_id, status)
    values (v_c1, v_bob, v_alice, v_grp, 'approved');

  -- Alice dient opnieuw in.
  insert into public.completions (weekly_goal_id, user_id, achieved_level, cycle_start_date, superseded_by)
    values (v_wg, v_alice, 'ceiling', v_cyclus, v_c1) returning id into v_c2;
  update public.completions set superseded_by = v_c2 where id = v_c1;
  update public.completions set superseded_by = null where id = v_c2;

  delete from public.completion_approvals where completion_id = v_c1;
  create temp table terugzet (c1 uuid, bob uuid, alice uuid, grp uuid);
  insert into terugzet values (v_c1, v_bob, v_alice, v_grp);
end $$;
`;

/** Draait de opzet plus `sql`, rolt terug, en geeft terug wat psql zei. */
function naOpzet(sql: string): string {
  try {
    return psqlMetInvoer(`begin;\n${OPZET}\n${sql}\nrollback;`);
  } catch (fout) {
    return fout instanceof Error ? fout.message : String(fout);
  }
}

const TERUGZET =
  'insert into public.completion_approvals ' +
  '(completion_id, approver_id, subject_id, group_id, status) ' +
  "select c1, bob, alice, grp, 'approved' from terugzet;";

describe.skipIf(!beschikbaar)('een goedkeuring terugzetten op een vervangen voltooiing', () => {
  it('weigert de gewone terugzet — dit is de eigenschap die een --data-only herstel breekt', () => {
    expect(naOpzet(TERUGZET)).toContain(
      'Deze voltooiing is vervangen door een nieuwere en is niet meer goed te keuren',
    );
  });

  it('laat hem wél door met de triggers uit, zoals `pg_restore --disable-triggers` doet', () => {
    // ⚠️ Niet op "INSERT 0 1" toetsen: `psqlBasisArgumenten()` zet `-q`, dus er
    //    komt geen commandotag op stdout. Tel de rij die er wél of niet staat.
    const uit = naOpzet(
      `set session_replication_role = replica;\n${TERUGZET}\n` +
        'select \'teruggezet=\' || count(*) from public.completion_approvals ' +
        'where completion_id = (select c1 from terugzet);',
    );

    expect(uit).not.toContain('is vervangen door een nieuwere');
    expect(uit).toContain('teruggezet=1');
  });

  it('houdt de zelfgoedkeur-grens óók met de triggers uit — die zit in een CHECK', () => {
    // ⚠️ Dit is de helft van domeinregel 3 die een terugzet overleeft. Een CHECK
    //    wordt getoetst tegen de rij, wie hem ook schrijft: `security definer`,
    //    `service_role`, `COPY` en `pg_restore` komen er allemaal niet langs.
    const uit = naOpzet(
      'set session_replication_role = replica;\n' +
        'insert into public.completion_approvals ' +
        '(completion_id, approver_id, subject_id, group_id, status) ' +
        "select c1, alice, alice, grp, 'approved' from terugzet;",
    );

    expect(uit).toContain('completion_approvals_not_self');
  });

  it('verliest de lidmaatschapsgrens met de triggers uit — die zit in de trigger', () => {
    // ⚠️⚠️ De prijs van de remedie, en de reden dat §2.9a van DEPLOY.md zegt dat je
    //    alleen je eigen dump terugzet. Clausule 2 van domeinregel 3 — alleen een
    //    lid van dezelfde groep mag goedkeuren — hangt aan `fill_approval_subject()`
    //    en staat dus uit zolang de triggers uit staan.
    const uit = naOpzet(
      'set session_replication_role = replica;\n' +
        'do $$ declare v_vreemde uuid; r record; begin ' +
        "v_vreemde := public.shim_maak_gebruiker('vreemde-terugzet@x.nl','Vreemde'); " +
        'select * into r from terugzet; ' +
        'insert into public.completion_approvals ' +
        '(completion_id, approver_id, subject_id, group_id, status) ' +
        "values (r.c1, v_vreemde, r.alice, r.grp, 'approved'); end $$;\n" +
        // ⚠️ Geen `raise notice` als signaal: dat gaat naar stderr en
        //    `psqlMetInvoer()` geeft alleen stdout terug — de toets zou dan
        //    altijd falen, ongeacht wat er gebeurde.
        "select 'vreemde_erdoorheen=' || count(*) " +
        'from public.completion_approvals a ' +
        'join terugzet t on t.c1 = a.completion_id ' +
        'where a.approver_id not in (t.bob, t.alice);',
    );

    expect(uit).toContain('vreemde_erdoorheen=1');
  });
});
