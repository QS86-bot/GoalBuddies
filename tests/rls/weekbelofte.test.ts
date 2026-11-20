import { describe, expect, it } from 'vitest';

import { wordtZichtbaarBijUitstelverzoek } from '../../src/modules/commitments/stand';
import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een weekbelofte in het datamodel, en de strafpaden slaan haar over —
 * QS8-758 (x.1 van de poort QS8-744), migratie 0312.
 *
 * Een weekbelofte is een `commitments`-rij met `type = 'penalty'` én
 * `periode_start`. Vijf bestaande paden pakten elke `penalty`; deze suite toetst
 * per pad dat een belofte er niet in meeloopt, en **steeds met een doelstraf
 * ernaast die er wél in meeloopt** — anders is "0 rijen" niet te onderscheiden
 * van een pad dat helemaal niets meer doet.
 *
 * ⚠️ **Alles als `postgres` opgezet, in `begin … rollback`.** Een client kan
 *    `periode_einde` niet schrijven (criterium 4; `periode_start` sinds 0314 wel), en
 *    `TablesInsert<'commitments'>` kent de kolom pas na de uitrol. De
 *    rolwissel naar `authenticated` gebeurt alleen waar de toets over rechten of
 *    over de leeskant gaat.
 *
 * ⚠️ **`created_at` dertig dagen terug** bij elke straf die
 *    `maak_straffen_verschuldigd()` moet raken: die draagt sinds 0171 een eigen
 *    grendel van 24 uur, en zonder deze regel zou de doelstraf op díe clausule
 *    stranden in plaats van op de streefdatum.
 *
 * Ijking (regel 18, vraag 3): per pad is de conjunct `periode_start is null`
 * met de hand uit de functie gehaald en is gekeken wélke toets omviel. Het
 * verslag staat in het PR-verslag van QS8-758.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  `select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'commitments'
      and column_name = 'periode_start'`,
  import.meta.url,
);

const OOST = 'Pacific/Kiritimati';
/** Exact 24 uur achter {@link OOST}; de datum verschilt daardoor altijd één dag. */
const WEST = 'Pacific/Honolulu';

/**
 * Eigenaar `a`, buddy `b`, groep `grp`, en een doel `g` waarvan de streefdatum
 * `dagenTerug` dagen terug ligt (negatief = in de toekomst). De ids staan in
 * de tijdelijke tabel `proef`; `uitslag` verzamelt de regels die de toets leest.
 */
function opzet({ dagenTerug = 30, gekoppeld = true, tz = 'UTC' } = {}): string {
  return `
do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_grp uuid := gen_random_uuid();
  v_g uuid;
begin
  insert into auth.users (id, email) values (v_a, v_a || '@zz.test'), (v_b, v_b || '@zz.test');
  update profiles set tz = '${tz}' where id = v_a;
  update profiles set tz = 'UTC'   where id = v_b;

  insert into groups (id, name, created_by, invite_code, huddle_day, tz)
    values (v_grp, 'Proefgroep', v_a, 'ZZ' || substr(md5(random()::text), 1, 10), 1, 'UTC');
  insert into group_members (group_id, user_id, role, status)
    values (v_grp, v_a, 'admin', 'active'), (v_grp, v_b, 'member', 'active');

  insert into goals (owner_id, title, target_date)
    values (v_a, 'Doel met een streefdatum', (now() at time zone '${tz}')::date - ${dagenTerug})
    returning id into v_g;

  ${gekoppeld ? 'insert into goal_group_links (goal_id, group_id) values (v_g, v_grp);' : '-- niet gekoppeld'}

  create temp table proef (a uuid, b uuid, grp uuid, g uuid);
  insert into proef values (v_a, v_b, v_grp, v_g);
  create temp table uitslag (n serial, regel text);
  -- De proeftabellen moeten ook na een rolwissel te lezen en te vullen zijn.
  grant select on proef to authenticated, service_role;
  grant insert on uitslag to authenticated, service_role;
  grant usage on sequence uitslag_n_seq to authenticated, service_role;
end $$;`;
}

/** Een doelstraf (`periode_start is null`) op doel `doel`, dertig dagen oud. */
function doelstraf(doel = '(select g from proef)'): string {
  return `
insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id, status, created_at)
  values (${doel}, 'penalty', 'Ik trakteer de groep', now(), (select grp from proef), 'set',
          now() - interval '30 days');`;
}

/**
 * Een weekbelofte op doel `doel`, met een week die drie dagen geleden begon.
 * ⚠️ De weekdag van `periode_start` wordt hier niet getoetst: dat is de
 *    insertgrendel van x.3, en die bestaat in x.1 nog niet.
 */
function belofte(doel = '(select g from proef)', start = 'current_date - 3'): string {
  return `
insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id, status, created_at,
                         periode_start, periode_einde)
  values (${doel}, 'penalty', 'Ik trakteer als ik mijn week niet haal', now(), (select grp from proef), 'set',
          now() - interval '30 days', ${start}, ${start} + 7);`;
}

const UITSLAG = `select regel from uitslag order by n;`;

function draai(sql: string): string[] {
  const uit = psqlMetInvoer(`begin;\n${sql}\n${UITSLAG}\nrollback;`);
  return uit.split('\n').map((r) => r.trim()).filter((r) => r.length > 0);
}

/** Zet een regel in de uitslag. */
function noteer(expr: string): string {
  return `insert into uitslag (regel) select ${expr};`;
}

/** De stand van de belofte en van de doelstraf op hetzelfde of een ander doel. */
const STANDEN = `
${noteer(`'belofte=' || string_agg(status, ',') from commitments where periode_start is not null and goal_id in (select g from proef union all select g2 from proef2)`)}
${noteer(`'doelstraf=' || string_agg(status, ',') from commitments where periode_start is null and goal_id in (select g from proef union all select g2 from proef2)`)}`;

/** Een tweede doel van dezelfde eigenaar, met dezelfde verstreken streefdatum. */
const TWEEDE_DOEL = `
create temp table proef2 (g2 uuid);
insert into goals (owner_id, title, target_date)
  select a, 'Tweede doel', current_date - 30 from proef;
insert into proef2 select id from goals where title = 'Tweede doel' and owner_id = (select a from proef);`;

const ALS_BUDDY = `
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims',
  json_build_object('sub', (select b from proef), 'role', 'authenticated')::text, true); end $$;`;

describe.skipIf(!beschikbaar)('een weekbelofte valt buiten de strafpaden (0312)', () => {
  const TIMEOUT = 30_000;

  // -------------------------------------------------------------------------
  // Criterium 1 — de naad tussen het doelpad en de belofte
  // -------------------------------------------------------------------------

  it(
    'een belofte op `set` op een doel met een streefdatum van 30 dagen geleden blijft `set`; de doelstraf ernaast wordt `due`',
    () => {
      const uit = draai(`
${opzet({ dagenTerug: 30, gekoppeld: false })}
${TWEEDE_DOEL}
${belofte()}
${doelstraf('(select g2 from proef2)')}
${noteer(`'verschuldigd=' || public.maak_straffen_verschuldigd((select a from proef))`)}
${STANDEN}`);

      expect(uit).toEqual(['verschuldigd=1', 'belofte=set', 'doelstraf=due']);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 2 — een goedgekeurd uitstel zet een belofte niet terug
  // -------------------------------------------------------------------------

  it(
    'een verschuldigde belofte blijft `due` na een goedgekeurd uitstel; de doelstraf komt terug op `set`',
    () => {
      const uit = draai(`
${opzet({ dagenTerug: 2 })}
create temp table proef2 (g2 uuid);
${belofte()}
${doelstraf()}
update commitments set status = 'due' where goal_id = (select g from proef);
insert into deadline_requests (goal_id, group_id, requester_id, old_date, new_date, reason, status)
  select g, grp, a, current_date - 2, current_date + 30, 'Ik had meer tijd nodig', 'open' from proef;
${ALS_BUDDY}
${noteer(`'teruggezet=' || (public.beslis_deadline_verzoek(
    (select id from deadline_requests where goal_id = (select g from proef)), true, null) ->> 'straffen_teruggezet')`)}
reset role;
${STANDEN}`);

      expect(uit).toEqual(['teruggezet=1', 'belofte=due', 'doelstraf=set']);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 3 — server en client-spiegel op dezelfde rij
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **De client-spiegel krijgt de rij zoals de database haar geeft**, niet een
   *    object dat de toets zelf verzint. Dat is de naad: wat de server weglaat,
   *    mag de client niet aankondigen.
   */
  it(
    '`straffen_bij_uitstelverzoek()` geeft 0 rijen voor een belofte én `wordtZichtbaarBijUitstelverzoek()` geeft `false` op dezelfde rij',
    () => {
      const vraag = `
${opzet({ dagenTerug: -10 })}
${belofte()}
insert into deadline_requests (goal_id, group_id, requester_id, old_date, new_date, reason, status)
  select g, grp, a, current_date + 10, current_date + 30, 'Ik had meer tijd nodig', 'open' from proef;
${noteer(`'rij=' || json_build_object('type', type, 'status', status, 'periode_start', periode_start)::text
            from commitments where goal_id = (select g from proef)`)}
${ALS_BUDDY}
${noteer(`'server=' || count(*) from public.straffen_bij_uitstelverzoek(array[(select g from proef)])`)}
reset role;`;

      const alleen = draai(vraag);
      const rij = JSON.parse(alleen[0]!.slice('rij='.length)) as {
        type: string;
        status: string;
        periode_start: string | null;
      };
      expect(rij.periode_start).not.toBeNull();
      expect(alleen[1]).toBe('server=0');
      expect(wordtZichtbaarBijUitstelverzoek(rij)).toBe(false);

      // De must-allow: met een doelstraf erbij ziet de groep het wél, en de
      // spiegel waarschuwt voor precies die rij.
      const metStraf = draai(`${vraag}\n${doelstraf()}\n${ALS_BUDDY}\n${noteer(
        `'server=' || count(*) from public.straffen_bij_uitstelverzoek(array[(select g from proef)])`,
      )}\nreset role;\n${noteer(`'doelstraf=' || json_build_object('type', type, 'status', status, 'periode_start', periode_start)::text
            from commitments where goal_id = (select g from proef) and periode_start is null`)}`);
      expect(metStraf[2]).toBe('server=1');
      const straf = JSON.parse(metStraf[3]!.slice('doelstraf='.length)) as typeof rij;
      expect(wordtZichtbaarBijUitstelverzoek(straf)).toBe(true);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 4 — geen client schrijft de periode
  // -------------------------------------------------------------------------

  it(
    '`authenticated` mag de periode lezen maar niet inserten of bijwerken',
    () => {
      const uit = draai(`
create temp table uitslag (n serial, regel text);
${['periode_start', 'periode_einde']
  .map((k) =>
    noteer(`'${k}=' || has_column_privilege('authenticated', 'public.commitments', '${k}', 'SELECT')::text
             || ',' || has_column_privilege('authenticated', 'public.commitments', '${k}', 'INSERT')::text
             || ',' || has_column_privilege('authenticated', 'public.commitments', '${k}', 'UPDATE')::text`),
  )
  .join('\n')}`);

      // ⚠️ Sinds 0314 (QS8-760) mag `authenticated` `periode_start` inserten: de
      //    client rekent de cyclusstart uit en de trigger toetst hem. Het einde
      //    blijft dicht. `tests/rls/weekbelofte-aangaan.test.ts` toetst de rest.
      expect(uit).toEqual(['periode_start=true,true,false', 'periode_einde=true,false,false']);
    },
    TIMEOUT,
  );

  it(
    'een gewone JWT die `periode_einde` meestuurt krijgt 42501; zonder die kolom lukt de insert',
    () => {
      const poging = (kolommen: string, waarden: string): string => `
do $$
begin
  insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id${kolommen})
    values ((select g from proef), 'penalty', 'Ik trakteer de groep', now(), (select grp from proef)${waarden});
  insert into uitslag (regel) values ('gelukt');
exception when others then
  insert into uitslag (regel) values ('sqlstate=' || sqlstate);
end $$;`;

      // ⚠️ `periode_start` alleen viel hier af sinds 0314: die kolom heeft nu een
      //    INSERT-grant (QS8-760). Wat er dan gebeurt, toetst
      //    `tests/rls/weekbelofte-aangaan.test.ts`.
      const uit = draai(`
${opzet({ dagenTerug: -10, gekoppeld: false })}
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims',
  json_build_object('sub', (select a from proef), 'role', 'authenticated')::text, true); end $$;
${poging(', periode_einde', ', current_date + 7')}
${poging(', periode_start, periode_einde', ', current_date, current_date + 7')}
${poging('', '')}
reset role;`);

      expect(uit).toEqual(['sqlstate=42501', 'sqlstate=42501', 'gelukt']);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 5 — de CHECK geldt ook voor service_role
  // -------------------------------------------------------------------------

  it(
    'een einde dat niet start + 7 is, een beloning met een periode of een halve periode wordt door de CHECK geweigerd',
    () => {
      const poging = (type: string, start: string, einde: string): string => `
do $$
begin
  insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id, periode_start, periode_einde)
    values ((select g from proef), '${type}', 'Een week om te houden', now(),
            ${type === 'penalty' ? '(select grp from proef)' : 'null'}, ${start}, ${einde});
  insert into uitslag (regel) values ('gelukt');
exception when others then
  insert into uitslag (regel) values ('sqlstate=' || sqlstate);
end $$;`;

      const uit = draai(`
${opzet({ dagenTerug: -10, gekoppeld: false })}
set local role service_role;
${poging('penalty', 'current_date', 'current_date + 6')}
${poging('penalty', 'current_date', 'current_date + 8')}
${poging('reward', 'current_date', 'current_date + 7')}
${poging('penalty', 'current_date', 'null')}
${poging('penalty', 'null', 'current_date + 7')}
${poging('penalty', 'current_date', 'current_date + 7')}
reset role;`);

      expect(uit).toEqual([
        'sqlstate=23514',
        'sqlstate=23514',
        'sqlstate=23514',
        'sqlstate=23514',
        'sqlstate=23514',
        'gelukt',
      ]);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 6 — de klok van het doel
  // -------------------------------------------------------------------------

  /**
   * ⚠️ De belofte wordt aangegaan in het oosten en de doelstraf in het westen;
   *    de twee zones liggen exact een dag uit elkaar. Nam `doeldatum()` de
   *    belofte mee, dan gaf `max()` de oostelijke dag.
   */
  it(
    '`doeldatum()` verandert niet door een belofte met een afwijkende `tz`',
    () => {
      const uit = draai(`
${opzet({ dagenTerug: -10, gekoppeld: false, tz: WEST })}
${doelstraf()}
update profiles set tz = '${OOST}' where id = (select a from proef);
${belofte()}
${noteer(`'zones=' || string_agg(tz, ',' order by periode_start nulls first) from commitments where goal_id = (select g from proef)`)}
${noteer(`'met-straf=' || (public.doeldatum((select g from proef), (select a from proef))
                           = (now() at time zone '${WEST}')::date)::text`)}
delete from commitments where goal_id = (select g from proef) and periode_start is null;
update profiles set tz = '${WEST}' where id = (select a from proef);
${noteer(`'zonder-straf=' || (public.doeldatum((select g from proef), (select a from proef))
                              = public.eigenaarsdatum((select a from proef)))::text`)}
${noteer(`'oost-is-anders=' || ((now() at time zone '${OOST}')::date <> (now() at time zone '${WEST}')::date)::text`)}`);

      expect(uit).toEqual([
        `zones=${WEST},${OOST}`,
        'met-straf=true',
        'zonder-straf=true',
        'oost-is-anders=true',
      ]);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De grendel van `zet_streefdatum()`
  // -------------------------------------------------------------------------

  it(
    'een belofte houdt de streefdatum niet vast; een doelstraf wel (`straf_staat_open`)',
    () => {
      const schuif = `
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims',
  json_build_object('sub', (select a from proef), 'role', 'authenticated')::text, true); end $$;
${noteer(`'schuif=' || coalesce(public.zet_streefdatum((select g from proef),
           (select target_date + 5 from goals where id = (select g from proef))) ->> 'reason', 'ok')`)}
reset role;`;

      expect(draai(`${opzet({ dagenTerug: -10, gekoppeld: false })}\n${belofte()}\n${schuif}`)).toEqual([
        'schuif=ok',
      ]);
      expect(
        draai(`${opzet({ dagenTerug: -10, gekoppeld: false })}\n${belofte()}\n${doelstraf()}\n${schuif}`),
      ).toEqual(['schuif=straf_staat_open']);
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De indexen
  // -------------------------------------------------------------------------

  it(
    'één lopende belofte per doel en één per week; de doelstraf houdt zijn eigen index, los van de belofte',
    () => {
      const poging = (sql: string): string => `
do $$
begin
  ${sql}
  insert into uitslag (regel) values ('gelukt');
exception when others then
  insert into uitslag (regel) values ('sqlstate=' || sqlstate);
end $$;`;

      const uit = draai(`
${opzet({ dagenTerug: -10, gekoppeld: false })}
${poging(belofte())}
${poging(belofte('(select g from proef)', 'current_date + 4'))}
${poging(doelstraf())}
${poging(doelstraf())}
update commitments set status = 'cancelled' where periode_start is not null;
${poging(belofte())}
update commitments set status = 'due' where periode_start is not null and status = 'set';
${poging(belofte())}
${poging(belofte('(select g from proef)', 'current_date + 4'))}`);

      expect(uit).toEqual([
        'gelukt', // de eerste belofte
        'sqlstate=23505', // een tweede lopende belofte op hetzelfde doel
        'gelukt', // een doelstraf náást de lopende belofte
        'sqlstate=23505', // een tweede open doelstraf: de index van 0170 blijft
        'gelukt', // na intrekken: dezelfde week opnieuw
        'sqlstate=23505', // na `due`: dezelfde week niet nog eens
        'gelukt', // na `due`: de volgende week wel — de oude index blokkeerde dat
      ]);
    },
    TIMEOUT,
  );
});
