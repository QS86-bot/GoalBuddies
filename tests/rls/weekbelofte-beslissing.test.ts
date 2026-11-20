import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een weekbelofte wordt verschuldigd of gehouden aan het einde van haar week —
 * QS8-759 (x.2 van de poort QS8-744), migratie 0313.
 *
 * Gehouden is `cancelled` met `actor_id null`, gebroken is `due`. De beslissing
 * staat in `beslis_weekbeloftes(owner, moment)`; `maak_straffen_verschuldigd()`
 * roept hem aan met `now()`. Waar het moment ertoe doet (de DST-wissel), roept de
 * suite de binnenste functie aan met een vast moment; waar het de naad met de
 * rollover of met 0294 is, gaat ze door de publieke functie.
 *
 * ⚠️ **Alles als `postgres` opgezet, in `begin … rollback`.** Een client kan een
 *    belofte pas in x.3 aanmaken. Weekdoelen worden zonder JWT ingevoegd; hun
 *    cyclustrigger (0198) zwijgt dan, en dat is nodig voor een week in oktober.
 *
 * 📏 Twee dingen in deze suite spreken het issue tegen en zijn gemeten:
 *    een weekpas laat de week op `missed` staan (met een `spent`-rij), en een
 *    zelf afgesloten weekdoel (`cancelled`) is nog niet beslist — de rollover
 *    maakt er `missed` van (A40). Zie de kop van 0313.
 *
 * Ijking (regel 18, vraag 3): per grendel met de hand gebroken en gekeken wélke
 * toets omvalt; het verslag staat in het PR-verslag van QS8-759.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  `select count(*) from pg_proc where proname = 'beslis_weekbeloftes'`,
  import.meta.url,
);

const TIMEOUT = 30_000;

interface Opzet {
  tz?: string;
  weekStartDag?: 0 | 1;
  /** Met een getuige (`b`) als begunstigde in plaats van de groep. */
  getuige?: boolean;
}

/**
 * Eigenaar `a` (lid), buddy `b` (beheerder), groep `grp` waar het doel aan
 * hangt, en een tweede groep `ander` waar `a` ook in zit maar die niet de
 * begunstigde is. Het doel `g` heeft geen mijlpalen en geen streefdatum die
 * ertoe doet (ver in de toekomst).
 */
function opzet({ tz = 'UTC', weekStartDag = 1 }: Opzet = {}): string {
  return `
do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_grp uuid := gen_random_uuid();
  v_ander uuid := gen_random_uuid();
  v_g uuid;
begin
  insert into auth.users (id, email) values (v_a, v_a || '@zz.test'), (v_b, v_b || '@zz.test');
  update profiles set tz = '${tz}', week_start_day = ${weekStartDag} where id = v_a;

  insert into groups (id, name, created_by, invite_code, huddle_day, tz)
    values (v_grp, 'Begunstigde', v_b, 'ZZ' || substr(md5(random()::text), 1, 10), 1, 'UTC'),
           (v_ander, 'Andere groep', v_b, 'ZZ' || substr(md5(random()::text), 1, 10), 1, 'UTC');
  insert into group_members (group_id, user_id, role, status)
    values (v_grp, v_b, 'admin', 'active'), (v_grp, v_a, 'member', 'active'),
           (v_ander, v_b, 'admin', 'active'), (v_ander, v_a, 'member', 'active');

  insert into goals (owner_id, title, target_date)
    values (v_a, 'Elke week hardlopen', (now() at time zone 'UTC')::date + 300)
    returning id into v_g;
  insert into goal_group_links (goal_id, group_id) values (v_g, v_grp), (v_g, v_ander);

  create temp table proef (a uuid, b uuid, grp uuid, ander uuid, g uuid);
  insert into proef values (v_a, v_b, v_grp, v_ander, v_g);
  create temp table uitslag (n serial, regel text);
  grant select on proef to authenticated, service_role;
  grant insert on uitslag to authenticated, service_role;
  grant usage on sequence uitslag_n_seq to authenticated, service_role;
end $$;`;
}

/**
 * Een weekbelofte met de gegeven week. `tz` wordt door `bevries_commitmentzone()`
 * uit het profiel bevroren, zoals in productie.
 */
function belofte(
  start: string,
  { getuige = false, aangegaan = `'2026-01-01 00:00+00'::timestamptz` } = {},
): string {
  const begunstigde = getuige
    ? `null, (select b from proef)`
    : `(select grp from proef), null`;
  return `
insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id, beneficiary_user_id,
                         status, created_at, periode_start, periode_einde)
  values ((select g from proef), 'penalty', 'Ik trakteer als ik mijn week niet haal', now(), ${begunstigde},
          'set', ${aangegaan}, ${start}, ${start} + 7);`;
}

/** Een weekdoel van het doel in de cyclus `start`, met status `status`. */
function weekdoel(start: string, status: string): string {
  return `
insert into weekly_goals (goal_id, title, cycle_start_date, status)
  values ((select g from proef), 'Drie keer hardlopen', ${start}, '${status}');`;
}

function noteer(expr: string): string {
  return `insert into uitslag (regel) select ${expr};`;
}

const STAND = noteer(`string_agg(status, ',') from commitments where goal_id = (select g from proef)`);

function draai(sql: string): string[] {
  const uit = psqlMetInvoer(`begin;\n${sql}\nselect regel from uitslag order by n;\nrollback;`);
  return uit.split('\n').map((r) => r.trim()).filter((r) => r.length > 0);
}

function alsEigenaar(): string {
  return `
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims',
  json_build_object('sub', (select a from proef), 'role', 'authenticated')::text, true); end $$;`;
}

describe.skipIf(!beschikbaar)('een weekbelofte beslist aan het einde van haar week (0313)', () => {
  // -------------------------------------------------------------------------
  // Criterium 1 — de grens in de eigen zone, met beide startdagen en over DST
  // -------------------------------------------------------------------------

  /**
   * Telkens twee aanroepen in één transactie: één seconde vóór middernacht op de
   * laatste dag van de week (lokaal), en precies op middernacht. De eerste moet
   * `set` laten staan, de tweede maakt haar `due`.
   *
   * 📏 Europe/Amsterdam gaat op zondag 25-10-2026 om 03:00 terug naar 02:00
   *    (UTC+2 → UTC+1). Met startdag maandag valt de grens ná de wissel
   *    (26-10 00:00 = 25-10 23:00 UTC), met startdag zondag ervóór
   *    (25-10 00:00 = 24-10 22:00 UTC). Wie de grens in UTC of met een vaste
   *    offset rekent, zit er in één van de twee een uur naast.
   *    Pacific/Auckland staat op NZDT (UTC+13) sinds 27-09-2026.
   */
  it.each([
    { tz: 'Europe/Amsterdam', wsd: 1 as const, start: `'2026-10-19'::date`, voor: '2026-10-25 22:59:59+00', op: '2026-10-25 23:00:00+00' },
    { tz: 'Europe/Amsterdam', wsd: 0 as const, start: `'2026-10-18'::date`, voor: '2026-10-24 21:59:59+00', op: '2026-10-24 22:00:00+00' },
    { tz: 'Pacific/Auckland', wsd: 1 as const, start: `'2026-11-09'::date`, voor: '2026-11-15 10:59:59+00', op: '2026-11-15 11:00:00+00' },
    { tz: 'Pacific/Auckland', wsd: 0 as const, start: `'2026-11-08'::date`, voor: '2026-11-14 10:59:59+00', op: '2026-11-14 11:00:00+00' },
  ])(
    '$tz, startdag $wsd: `set` één seconde vóór lokale middernacht, `due` erop',
    ({ tz, wsd, start, voor, op }) => {
      const uit = draai(`
${opzet({ tz, weekStartDag: wsd })}
${belofte(start)}
${weekdoel(start, 'missed')}
${noteer(`'voor=' || public.beslis_weekbeloftes((select a from proef), '${voor}')`)}
${STAND}
${noteer(`'op=' || public.beslis_weekbeloftes((select a from proef), '${op}')`)}
${STAND}`);

      expect(uit).toEqual(['voor=0', 'set', 'op=1', 'due']);
    },
    TIMEOUT,
  );

  it(
    'het wachtvenster van 24 uur geldt ook voor een belofte',
    () => {
      const uit = draai(`
${opzet({ tz: 'UTC' })}
${belofte(`'2026-11-09'::date`, { aangegaan: `'2026-11-15 12:00+00'::timestamptz` })}
${weekdoel(`'2026-11-09'::date`, 'missed')}
${noteer(`'te_vroeg=' || public.beslis_weekbeloftes((select a from proef), '2026-11-16 11:59:59+00')`)}
${noteer(`'daarna=' || public.beslis_weekbeloftes((select a from proef), '2026-11-16 12:00:01+00')`)}
${STAND}`);

      expect(uit).toEqual(['te_vroeg=0', 'daarna=1', 'due']);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 2 — Kiritimati → Honolulu: het moment verandert niet (naad 0294)
  // -------------------------------------------------------------------------

  /**
   * Door de publieke functie en met de echte `now()`: de week eindigt vandaag in
   * Kiritimati, en dat is gisteren in Honolulu (exact 24 uur verschil). De
   * belofte die in Kiritimati is aangegaan wordt `due`, ook nadat het profiel
   * naar Honolulu ging; de belofte die in Honolulu is aangegaan nog niet. Die
   * tweede is de controle dat de toets de bevroren zone leest en niet iets
   * anders dat toevallig hetzelfde antwoord geeft.
   */
  /**
   * ⚠️ **Wat dit criterium níet belooft.** De datumgrens ligt vast, maar de week
   *    sluit de rollover op de klok van het profiel (`afsluitbareCyclus()`). Wie
   *    naar het westen verhuist, krijgt de beslissing tot een dag later; de
   *    derde rij legt vast dat een nog open week de belofte op `set` houdt, ook
   *    als de bevroren grens voorbij is. Uitstel, geen ontsnapping; de ER-rij
   *    staat in het PR-verslag.
   */
  it.each([
    { aangegaanIn: 'Pacific/Kiritimati', week: 'missed', verwacht: ['verschuldigd=1', 'due'] },
    { aangegaanIn: 'Pacific/Honolulu', week: 'missed', verwacht: ['verschuldigd=0', 'set'] },
    { aangegaanIn: 'Pacific/Kiritimati', week: 'todo', verwacht: ['verschuldigd=0', 'set'] },
  ])(
    'aangegaan in $aangegaanIn, daarna het profiel naar Honolulu, week $week',
    ({ aangegaanIn, week, verwacht }) => {
      const einde = `(now() at time zone 'Pacific/Kiritimati')::date`;
      const uit = draai(`
${opzet({ tz: aangegaanIn })}
${belofte(`${einde} - 7`)}
${weekdoel(`${einde} - 7`, week)}
update profiles set tz = 'Pacific/Honolulu' where id = (select a from proef);
${noteer(`'verschuldigd=' || public.maak_straffen_verschuldigd((select a from proef))`)}
${STAND}`);

      expect(uit).toEqual(verwacht);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 3 en 4 — wat telt als gehouden, en dat het stil blijft
  // -------------------------------------------------------------------------

  const START = `'2026-11-09'::date`;
  const NA_DE_WEEK = '2026-11-17 12:00+00';
  /** Eén beslisronde na de week, zonder eigen uitvoerregel. */
  const BESLIS = `do $$ begin perform public.beslis_weekbeloftes((select a from proef), '${NA_DE_WEEK}'); end $$;`;

  it.each([
    { geval: 'adempauze (`excused`)', weken: [['excused']], stand: 'cancelled' },
    { geval: 'gehaald plafond (`approved`)', weken: [['approved']], stand: 'cancelled' },
    { geval: 'wacht op goedkeuring (`pending`)', weken: [['pending']], stand: 'cancelled' },
    { geval: 'geen weekdoel in die week', weken: [], stand: 'cancelled' },
    { geval: 'gemist (`missed`)', weken: [['missed']], stand: 'due' },
    { geval: 'één gehaald, één gemist: de week telt (A37)', weken: [['approved'], ['missed']], stand: 'cancelled' },
    // Security-ronde: een keuring die nog loopt kan de week alsnog laten tellen.
    { geval: 'één wacht op goedkeuring, één gemist', weken: [['pending'], ['missed']], stand: 'cancelled' },
    // ⚠️ `carried` ís een gemiste week (0185, 0216). Gehouden zoals de poort het
    //    tekende; dat het een uitweg is, ligt bij Quinten (kop van 0313).
    { geval: 'gemist en doorgeschoven (`carried`)', weken: [['carried']], stand: 'cancelled' },
    { geval: 'nog open (`todo`)', weken: [['todo']], stand: 'set' },
    { geval: 'zelf afgesloten, nog niet door de rollover (`cancelled`)', weken: [['cancelled']], stand: 'set' },
  ])(
    '$geval → $stand',
    ({ weken, stand }) => {
      const uit = draai(`
${opzet()}
${belofte(START)}
${weken.map(([s]) => weekdoel(START, s)).join('\n')}
${BESLIS}
${STAND}`);

      expect(uit).toEqual([stand]);
    },
    TIMEOUT,
  );

  it(
    'een gemiste week die een weekpas redde, telt als gehouden; zonder pas als gebroken',
    () => {
      const metPas = draai(`
${opzet()}
${belofte(START)}
${weekdoel(START, 'missed')}
insert into week_pass_events (user_id, goal_id, event, cycle_start_date)
  select a, g, 'spent', ${START} from proef;
${BESLIS}
${STAND}`);

      // De pas van een ánder doel of een andere week redt deze week niet.
      const pasElders = draai(`
${opzet()}
${belofte(START)}
${weekdoel(START, 'missed')}
insert into week_pass_events (user_id, goal_id, event, cycle_start_date)
  select a, g, 'spent', ${START} - 7 from proef;
insert into week_pass_events (user_id, goal_id, event, cycle_start_date)
  select a, g, 'earned', ${START} from proef;
${BESLIS}
${STAND}`);

      expect(metPas).toEqual(['cancelled']);
      expect(pasElders).toEqual(['due']);
    },
    TIMEOUT,
  );

  it(
    'een gehaalde vloer telt als gehouden',
    () => {
      const uit = draai(`
${opzet()}
${belofte(START)}
${weekdoel(START, 'approved')}
insert into completions (weekly_goal_id, user_id, achieved_level, cycle_start_date, note)
  select w.id, p.a, 'floor', ${START}, 'Twee keer gelopen' from weekly_goals w, proef p where w.goal_id = p.g;
${noteer(`'vloer=' || count(*) from completions where achieved_level = 'floor' and user_id = (select a from proef)`)}
${BESLIS}
${STAND}`);

      expect(uit).toEqual(['vloer=1', 'cancelled']);
    },
    TIMEOUT,
  );

  /**
   * Gehouden is stil: geen systeembericht in welke groep ook, geen getuigenis
   * (de vraag die de pushjob stelt, 0178), en een spoorregel `cancelled` zonder
   * actor. Met een gebroken belofte ernaast als controle dat dezelfde opzet wél
   * spreekt — anders is "niets" niet te onderscheiden van een kapotte opzet.
   */
  it.each([
    { week: 'excused', verwacht: ['cancelled', 'spoor=cancelled:geen_actor', 'berichten=0', 'getuigenissen=0'] },
    { week: 'missed', verwacht: ['due', 'spoor=triggered:geen_actor', 'berichten=0', 'getuigenissen=1'] },
  ])(
    'met een getuige als begunstigde, week $week: stand, spoor en wat er naar buiten gaat',
    ({ week, verwacht }) => {
      const uit = draai(`
${opzet()}
${belofte(START, { getuige: true })}
${weekdoel(START, week)}
${BESLIS}
${STAND}
${noteer(`'spoor=' || e.event_type || ':' || coalesce(e.actor_id::text, 'geen_actor')
            from commitment_events e join commitments c on c.id = e.commitment_id
           where c.goal_id = (select g from proef) and e.event_type <> 'confirmed'`)}
${noteer(`'berichten=' || count(*) from chat_messages
           where group_id in (select grp from proef union all select ander from proef)
             and system_event like 'commitment%'`)}
${noteer(`'getuigenissen=' || count(*) from public.getuigenissen_voor((select b from proef))`)}`);

      expect(uit).toEqual(verwacht);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 5 — de week sluit in dezelfde run: de belofte wacht een run
  // -------------------------------------------------------------------------

  /**
   * De rollover roept `maak_straffen_verschuldigd()` aan vóór hij de week sluit
   * (`verwerkProfiel()` in `supabase/functions/rollover/index.ts`). Hier dezelfde
   * volgorde met de echte functie: run 1 ziet de week nog open, dan sluit de
   * week zoals `schrijfWeekAf()` dat doet, en run 2 beslist.
   */
  it.each([
    { open: 'todo', verwacht: ['run1=0', 'set', 'run2=1', 'due'] },
    { open: 'cancelled', verwacht: ['run1=0', 'set', 'run2=1', 'due'] },
  ])(
    'een week op `$open` in run 1, gesloten tussen de runs',
    ({ open, verwacht }) => {
      const start = `(now() at time zone 'UTC')::date - 8`;
      const uit = draai(`
${opzet()}
${belofte(start)}
${weekdoel(start, open)}
${noteer(`'run1=' || public.maak_straffen_verschuldigd((select a from proef))`)}
${STAND}
update weekly_goals set status = 'missed' where goal_id = (select g from proef);
${noteer(`'run2=' || public.maak_straffen_verschuldigd((select a from proef))`)}
${STAND}`);

      expect(uit).toEqual(verwacht);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 6 — één bericht in de begunstigde groep, geen punt erbij
  // -------------------------------------------------------------------------

  it(
    'bij `due`: precies één `commitment_due` in de begunstigde groep, niets in de andere, geen rij in `points_ledger`',
    () => {
      const uit = draai(`
${opzet()}
${belofte(START)}
${weekdoel(START, 'missed')}
${noteer(`'punten_voor=' || count(*) from points_ledger where user_id = (select a from proef)`)}
${BESLIS}
${noteer(`'punten_na=' || count(*) from points_ledger where user_id = (select a from proef)`)}
${noteer(`'begunstigde=' || count(*) from chat_messages
           where group_id = (select grp from proef) and system_event = 'commitment_due'
             and subject_id = (select a from proef)`)}
${noteer(`'ander=' || count(*) from chat_messages
           where group_id = (select ander from proef) and system_event like 'commitment%'`)}
-- Een tweede aanroep maakt geen tweede bericht.
${noteer(`'opnieuw=' || public.beslis_weekbeloftes((select a from proef), '${NA_DE_WEEK}')`)}
${noteer(`'begunstigde_na=' || count(*) from chat_messages
           where group_id = (select grp from proef) and system_event = 'commitment_due'`)}`);

      expect(uit).toEqual([
        'punten_voor=0',
        'punten_na=0',
        'begunstigde=1',
        'ander=0',
        'opnieuw=0',
        'begunstigde_na=1',
      ]);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 7 — de startdag zit vast zolang de belofte loopt
  // -------------------------------------------------------------------------

  /**
   * De eigenaar zet zijn startdag op dezelfde dag (geen verschuiving, wel een
   * geldige aanroep): weigering op `set`, en na `cancelled` lukt het weer.
   * ⚠️ De cyclusstart rekent de toets hier zelf uit: dat is testcode die een
   *    geldige invoer bouwt, geen tweede opvatting in het schema.
   */
  it(
    '`zet_week_startdag()` weigert met `weekbelofte_loopt` zolang de belofte op `set` staat, en lukt na `cancelled`',
    () => {
      const aanroep = `public.zet_week_startdag(1::smallint, (select d from cyclus), (select d from cyclus)) ->> 'reason'`;
      const uit = draai(`
${opzet()}
${belofte(START)}
create temp table cyclus as
  select eigenaarsdatum(a) - ((extract(dow from eigenaarsdatum(a))::int - 1 + 7) % 7) as d from proef;
grant select on cyclus to authenticated;
${alsEigenaar()}
${noteer(`'lopend=' || coalesce(${aanroep}, 'ok')`)}
reset role;
update commitments set status = 'cancelled' where goal_id = (select g from proef);
${alsEigenaar()}
${noteer(`'ingetrokken=' || coalesce(${aanroep}, 'ok')`)}
reset role;`);

      expect(uit).toEqual(['lopend=weekbelofte_loopt', 'ingetrokken=ok']);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 8 — het wisrecht neemt een verschuldigde belofte mee (0247, 0309)
  // -------------------------------------------------------------------------

  it(
    'een eigenaar met een verschuldigde belofte verwijdert zijn account: bericht, commitment en spoor zijn weg',
    () => {
      const uit = draai(`
${opzet()}
${belofte(START)}
${weekdoel(START, 'missed')}
create temp table belofte_id as select id from commitments where goal_id = (select g from proef);
grant select on belofte_id to authenticated;
${BESLIS}
${noteer(`'bericht_voor=' || count(*) from chat_messages
           where subject_id = (select a from proef) and system_event = 'commitment_due'`)}
${alsEigenaar()}
${noteer(`'weg=' || (public.verwijder_mijn_account() ->> 'ok')`)}
reset role;
${noteer(`'commitment=' || count(*) from commitments where id in (select id from belofte_id)`)}
${noteer(`'spoor=' || count(*) from commitment_events where commitment_id in (select id from belofte_id)`)}
${noteer(`'bericht_na=' || count(*) from chat_messages
           where group_id in (select grp from proef union all select ander from proef)
             and system_event in ('commitment_due', 'commitment_unlocked')`)}`);

      expect(uit).toEqual(['bericht_voor=1', 'weg=true', 'commitment=0', 'spoor=0', 'bericht_na=0']);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De vraag uit de reactie op het issue: afronden binnen de week = gehouden
  // -------------------------------------------------------------------------

  /**
   * `rond_doel_af()` als eigenaar, met een doelstraf ernaast op hetzelfde doel
   * die op tijd is en dus ook vervalt. Binnen de week van de belofte: gehouden.
   * Ná de week: de belofte blijft staan en de week beslist (anders poetst
   * afronden een gebroken week weg vóór de volgende run).
   */
  it.each([
    { wanneer: 'binnen de week', start: `(now() at time zone 'UTC')::date - 2`, verwacht: ['vervallen=2', 'blijft=0', 'belofte=cancelled'] },
    { wanneer: 'na de week', start: `(now() at time zone 'UTC')::date - 8`, verwacht: ['vervallen=1', 'blijft=1', 'belofte=set'] },
  ])(
    'het doel afronden $wanneer',
    ({ start, verwacht }) => {
      const uit = draai(`
${opzet()}
${belofte(start)}
insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id, status)
  values ((select g from proef), 'penalty', 'Doelstraf', now(), (select grp from proef), 'set');
${alsEigenaar()}
create temp table afloop as select public.rond_doel_af((select g from proef)) -> 'commitments' as j;
${noteer(`'vervallen=' || (j ->> 'vervallen') from afloop`)}
${noteer(`'blijft=' || (j ->> 'blijft_staan') from afloop`)}
reset role;
${noteer(`'belofte=' || status from commitments where goal_id = (select g from proef) and periode_start is not null`)}`);

      expect(uit).toEqual(verwacht);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Rechten — een klok die de aanroeper zet, mag niemand zetten
  // -------------------------------------------------------------------------

  it(
    '`beslis_weekbeloftes()` is voor geen enkele clientrol uitvoerbaar, ook niet voor service_role',
    () => {
      const uit = draai(`
${opzet()}
${noteer(`string_agg(r || '=' || has_function_privilege(r, 'public.beslis_weekbeloftes(uuid, timestamptz)', 'execute'), ',' order by r)
            from unnest(array['anon', 'authenticated', 'service_role']) r`)}`);

      expect(uit).toEqual(['anon=false,authenticated=false,service_role=false']);
    },
    TIMEOUT,
  );
});
