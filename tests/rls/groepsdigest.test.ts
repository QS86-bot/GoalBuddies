import { describe, expect, it } from 'vitest';

import { GROEPSDIGEST_GEBEURTENISSEN } from '../../src/modules/notifications/regels';

import { proefId } from './proefid';
import { psql, psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

const COMMITMENT_ID = proefId(1);

/**
 * De groepsdagmelding houdt zijn beloftes in de database — QS8-755, migratie 0310.
 *
 * ⚠️ **Wat dit toetst en waarom hier.** De belofte is een eigenschap van het
 *    gehéél: *geen enkele melding maakt een gemiste week afleidbaar, ook niet via
 *    de afwezigheid ervan, in een open of een beschermde groep.* De job stuurt, de
 *    RPC kiest, de trigger bewaakt; deze test voert die drie door één echte
 *    database en kijkt alleen naar wat eruit komt.
 *
 * ⚠️ **Full house bestaat niet.** Wat er niet is, kan niet lekken: de test toetst
 *    dat de bron uitsluitend positieve gebeurtenissen kent en dat een gemiste
 *    week, een openstaande voltooiing, een verschoven deadline en een slapende
 *    groep geen enkele rij opleveren — vóór en ná het openzetten van de groep,
 *    met identieke uitvoer.
 *
 * ⚠️ **Via psql met een rolwissel en niet via PostgREST.** `set local role
 *    authenticated` + `request.jwt.claims` geeft dezelfde grants en RLS als een
 *    JWT-verzoek; wat PostgREST erbovenop doet (URL's, headers) is hier niet
 *    gemeten. Elke scenario draait in één transactie die wordt teruggerold.
 *
 * IJKING (met de hand, één mutatie per grendel; uitslagen in de PR-tekst).
 */

const TEST_TIMEOUT = 60_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'groepsdigest_voor'",
  import.meta.url,
);

const VLAG_AAN =
  'create or replace function public.groepsdigest_aan() returns boolean language sql stable as $$ select true $$;';

/**
 * Een scenario: voorbereiding, daarna controles die in `r` landen, en een
 * terugrol. Gebruikers `a` (bob), `b` (carol); groep `g1` met beiden.
 */
function scenario(opbouw: string): Record<string, string> {
  const sql = `
begin;
create temp table r (k text, v text);
create temp table w (naam text primary key, id uuid);
grant all on r, w to public;
create function pg_temp.poging(q text) returns text language plpgsql as $f$
begin execute q; return 'ok'; exception when others then return sqlstate; end $f$;
create function pg_temp.maak_groep(p_naam text, p_zicht text default 'beschermd') returns uuid language plpgsql as $f$
declare g uuid;
begin
  insert into public.groups (name, zichtbaarheid, invite_code) values (p_naam, p_zicht, substr(md5(random()::text), 1, 10)) returning id into g;
  insert into public.group_members (group_id, user_id, role, joined_at) select g, id, 'member', now() - interval '3 days' from w;
  return g;
end $f$;
insert into w select 'bob', public.shim_maak_gebruiker('dd-bob-' || gen_random_uuid() || '@example.com', 'Bob');
insert into w select 'carol', public.shim_maak_gebruiker('dd-carol-' || gen_random_uuid() || '@example.com', 'Carol');
create function pg_temp.id(n text) returns uuid language sql as $f$ select id from w where naam = n $f$;
create function pg_temp.bericht(g uuid, ev text, wie text, leeftijd interval) returns void language plpgsql as $f$
begin
  -- ⚠️ De servertijdstempeltrigger (0173) zet created_at op now(); een test die het
  --    verleden nodig heeft, schakelt hem voor deze ene insert uit.
  set local session_replication_role = replica;
  insert into public.chat_messages (group_id, type, body, system_event, subject_id, created_at)
  values (g, 'system', ev, ev, pg_temp.id(wie), now() - leeftijd);
  set local session_replication_role = origin;
end $f$;
create function pg_temp.zet(k text, v text) returns void language sql as $f$ insert into r values (k, v) $f$;
create function pg_temp.voor(n text) returns text language sql as $f$
  select coalesce(string_agg(group_id::text || ':' || groepsnaam, ',' order by group_id), '')
  from public.groepsdigest_voor(pg_temp.id(n), current_date) $f$;
${opbouw}
select k || '=' || v from r order by k;
rollback;
`;
  const uit: Record<string, string> = {};
  for (const regel of psqlMetInvoer(sql).split('\n')) {
    const i = regel.indexOf('=');
    if (i > 0) uit[regel.slice(0, i)] = regel.slice(i + 1).trim();
  }
  return uit;
}

describe.skipIf(!beschikbaar)('de groepsdagmelding (0310)', () => {
  it(
    'staat uit: de vlag geeft false, de RPC geeft niets en een insert wordt geweigerd',
    () => {
      const u = scenario(`
        select pg_temp.maak_groep('Uit');
        select pg_temp.bericht((select id from groups where name='Uit'), 'completion_approved', 'bob', interval '2 hours');
        select pg_temp.zet('vlag', public.groepsdigest_aan()::text);
        select pg_temp.zet('rpc', pg_temp.voor('carol'));
        select pg_temp.zet('insert', pg_temp.poging(format($q$insert into notifications_sent (user_id, kind, local_date, ref_type, ref_id)
          values (%L, 'group_digest', current_date, 'group', %L)$q$, pg_temp.id('carol'), (select id from groups where name='Uit'))));
      `);
      expect(u.vlag).toBe('false');
      expect(u.rpc).toBe('');
      expect(u.insert).toBe('P0001');
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft bij een positief bericht van een ander precies de groep en haar naam, en niets over personen',
    () => {
      const u = scenario(`
        ${VLAG_AAN}
        select pg_temp.maak_groep('Positief');
        select pg_temp.bericht((select id from groups where name='Positief'), 'completion_approved', 'bob', interval '2 hours');
        select pg_temp.zet('carol', (select count(*) from regexp_split_to_table(pg_temp.voor('carol'), ',') x where x like '%:Positief')::text);
        select pg_temp.zet('bob_eigen', pg_temp.voor('bob'));
        select pg_temp.zet('kolommen', pg_get_function_result('public.groepsdigest_voor(uuid,date)'::regprocedure));
      `);
      expect(u.carol).toBe('1');
      // Eigen nieuws telt niet: Bob hoort niets over zijn eigen goedkeuring.
      expect(u.bob_eigen).toBe('');
      // Geen aantallen en geen personen in het resultaat.
      expect(u.kolommen).toBe('TABLE(group_id uuid, groepsnaam text)');
    },
    TEST_TIMEOUT,
  );

  it(
    'maakt geen gemiste week, achterstand of verschoven deadline afleidbaar — beschermd én open, identiek',
    () => {
      const u = scenario(`
        ${VLAG_AAN}
        select pg_temp.maak_groep('Tegenslag');
        select pg_temp.bericht((select id from groups where name='Tegenslag'), e, 'bob', interval '3 hours')
          from unnest(array['completion_pending','deadline_requested','commitment_due','commitment_unlocked',
                            'group_sleeping','member_joined','milestone_done','chain_milestone']) e;
        select pg_temp.zet('beschermd_zonder', pg_temp.voor('carol'));
        update groups set zichtbaarheid = 'open' where name = 'Tegenslag';
        select pg_temp.zet('open_zonder', pg_temp.voor('carol'));
        select pg_temp.bericht((select id from groups where name='Tegenslag'), 'goal_completed', 'bob', interval '3 hours');
        select pg_temp.zet('open_met', pg_temp.voor('carol'));
        update groups set zichtbaarheid = 'beschermd' where name = 'Tegenslag';
        select pg_temp.zet('beschermd_met', pg_temp.voor('carol'));
      `);
      expect(u.beschermd_zonder).toBe('');
      expect(u.open_zonder).toBe('');
      expect(u.open_met).not.toBe('');
      expect(u.open_met).toBe(u.beschermd_met);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een gedempte groep zwijgen en weigert een insert ervoor',
    () => {
      const u = scenario(`
        ${VLAG_AAN}
        select pg_temp.maak_groep('Demp');
        select pg_temp.maak_groep('Luid');
        select pg_temp.bericht(id, 'completion_approved', 'bob', interval '2 hours') from groups where name in ('Demp','Luid');
        insert into groep_demping (user_id, group_id) select pg_temp.id('carol'), id from groups where name = 'Demp';
        select pg_temp.zet('namen', (select string_agg(split_part(x, ':', 2), ',' order by x) from regexp_split_to_table(pg_temp.voor('carol'), ',') x));
        select pg_temp.zet('insert', pg_temp.poging(format($q$insert into notifications_sent (user_id, kind, local_date, ref_type, ref_id)
          values (%L, 'group_digest', current_date, 'group', %L)$q$, pg_temp.id('carol'), (select id from groups where name='Demp'))));
      `);
      expect(u.namen).toBe('Luid');
      expect(u.insert).toBe('P0001');
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft één per groep per dag, en een tweede insert voor dezelfde dag botst',
    () => {
      const u = scenario(`
        ${VLAG_AAN}
        select pg_temp.maak_groep('Eenmaal');
        select pg_temp.bericht((select id from groups where name='Eenmaal'), 'completion_approved', 'bob', interval '2 hours');
        select pg_temp.zet('voor', (pg_temp.voor('carol') <> '')::text);
        insert into notifications_sent (user_id, kind, local_date, ref_type, ref_id)
          select pg_temp.id('carol'), 'group_digest', current_date, 'group', id from groups where name='Eenmaal';
        select pg_temp.zet('na', pg_temp.voor('carol'));
        -- Nieuws ná de digest van vandaag geeft vandaag geen tweede: de anti-join per dag.
        update notifications_sent set sent_at = now() - interval '3 hours' where kind = 'group_digest';
        select pg_temp.bericht((select id from groups where name='Eenmaal'), 'goal_completed', 'bob', interval '1 hour');
        select pg_temp.zet('later_nieuws', pg_temp.voor('carol'));
        select pg_temp.zet('tweede', pg_temp.poging(format($q$insert into notifications_sent (user_id, kind, local_date, ref_type, ref_id)
          values (%L, 'group_digest', current_date, 'group', %L)$q$, pg_temp.id('carol'), (select id from groups where name='Eenmaal'))));
      `);
      expect(u.voor).toBe('true');
      expect(u.na).toBe('');
      expect(u.later_nieuws).toBe('');
      expect(u.tweede).toBe('23505');
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt het dagplafond van drie, in de RPC én in de trigger',
    () => {
      const u = scenario(`
        ${VLAG_AAN}
        select pg_temp.maak_groep('P' || i) from generate_series(1,4) i;
        select pg_temp.bericht(id, 'completion_approved', 'bob', interval '2 hours') from groups where name like 'P_';
        select pg_temp.zet('rpc', (select count(*) from regexp_split_to_table(pg_temp.voor('carol'), ',') x where x <> '')::text);
        insert into notifications_sent (user_id, kind, local_date, ref_type, ref_id)
          select pg_temp.id('carol'), 'group_digest', current_date, 'group', id from groups where name in ('P1','P2','P3');
        select pg_temp.zet('vierde', pg_temp.poging(format($q$insert into notifications_sent (user_id, kind, local_date, ref_type, ref_id)
          values (%L, 'group_digest', current_date + 1, 'group', %L)$q$, pg_temp.id('carol'), (select id from groups where name='P4'))));
        select pg_temp.zet('rpc_na', pg_temp.voor('carol'));
      `);
      expect(u.rpc).toBe('3');
      expect(u.vierde).toBe('P0001');
      expect(u.rpc_na).toBe('');
    },
    TEST_TIMEOUT,
  );

  it(
    'zwijgt voor een slapende groep en voor iemand die geen actief lid meer is',
    () => {
      const u = scenario(`
        ${VLAG_AAN}
        select pg_temp.maak_groep('Slaap');
        select pg_temp.maak_groep('Weg');
        select pg_temp.bericht(id, 'completion_approved', 'bob', interval '2 hours') from groups where name in ('Slaap','Weg');
        update groups set status = 'sleeping' where name = 'Slaap';
        update group_members set status = 'inactive'
          where user_id = pg_temp.id('carol') and group_id = (select id from groups where name = 'Weg');
        select pg_temp.zet('stil', pg_temp.voor('carol'));
      `);
      expect(u.stil).toBe('');
    },
    TEST_TIMEOUT,
  );

  it(
    'wacht tot het intrekvenster voorbij is: een jonge goedkeuring belt niet',
    () => {
      const u = scenario(`
        ${VLAG_AAN}
        select pg_temp.maak_groep('Jong');
        select pg_temp.bericht((select id from groups where name='Jong'), 'completion_approved', 'bob', interval '1 minute');
        select pg_temp.zet('jong', pg_temp.voor('carol'));
      `);
      expect(u.jong).toBe('');
    },
    TEST_TIMEOUT,
  );

  it(
    'is opt-in en niet door een ander te lezen; de RPC en de bron zijn dicht voor een client',
    () => {
      const u = scenario(`
        select pg_temp.zet('standaard', (select notify_group_digest::text from profiles where id = pg_temp.id('carol')));
        select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('carol'), 'role', 'authenticated')::text, true);
        set local role authenticated;
        select pg_temp.zet('eigen_lezen', (select notify_group_digest::text from mijn_profiel));
        select pg_temp.zet('eigen_schrijven', pg_temp.poging('update profiles set notify_group_digest = true where id = ' || quote_literal(auth.uid())));
        select pg_temp.zet('ander_lezen', pg_temp.poging('select notify_group_digest from profiles'));
        select pg_temp.zet('rpc', pg_temp.poging('select * from groepsdigest_voor(auth.uid(), current_date)'));
        select pg_temp.zet('bron_schrijven', pg_temp.poging('insert into notifications_sent (user_id, kind, local_date, ref_type, ref_id) values (auth.uid(), ''group_digest'', current_date, ''group'', gen_random_uuid())'));
        reset role;
      `);
      expect(u.standaard).toBe('false');
      expect(u.eigen_lezen).toBe('false');
      expect(u.eigen_schrijven).toBe('ok');
      expect(u.ander_lezen).toBe('42501');
      expect(u.rpc).toBe('42501');
      expect(u.bron_schrijven).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de eenmaligheid van de andere soorten staan (per_onderwerp)',
    () => {
      const u = scenario(`
        insert into notifications_sent (user_id, kind, local_date, ref_type, ref_id)
          values (pg_temp.id('carol'), 'commitment_witness', current_date, 'commitment', '${COMMITMENT_ID}');
        select pg_temp.zet('tweede', pg_temp.poging(format($q$insert into notifications_sent (user_id, kind, local_date, ref_type, ref_id)
          values (%L, 'commitment_witness', current_date + 1, 'commitment', %L)$q$, pg_temp.id('carol'), '${COMMITMENT_ID}')));
      `);
      // Dezelfde (gebruiker, soort, onderwerp) op een andere dag botst nog steeds.
      expect(u.tweede).toBe('23505');
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt de allowlist in de database gelijk aan die in de code en zonder tegenslag',
    () => {
      const uitDb = psql('select unnest(public.groepsdigest_gebeurtenissen()) order by 1').split('\n');
      expect(uitDb).toEqual([...GROEPSDIGEST_GEBEURTENISSEN].sort());
      for (const verboden of ['completion_pending', 'deadline_requested', 'commitment_due', 'group_sleeping']) {
        expect(uitDb).not.toContain(verboden);
      }
      const bron = psql("select pg_get_functiondef('public.groepsdigest_voor(uuid,date)'::regprocedure)");
      expect(bron).toContain('groep_demping');
      expect(bron).toContain('is_teamgroep');
      expect(bron).toContain('intrekvenster_minuten');
      expect(bron).not.toContain('zichtbaarheid');
    },
    TEST_TIMEOUT,
  );
});
