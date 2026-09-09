import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een systeembericht bakt geen weergavenaam in — QS8-372, migratie 0213.
 *
 * ⚠️⚠️ **Het scherm hield de regel netjes aan terwijl de database hem lekte.**
 *    Sinds 0059 rendert `systeemberichtTekst()` uit de catalogus met
 *    `naam(subject_name)`, en na een accountverwijdering is `subject_name` `null`
 *    — dus daar staat "Een oud-lid". Maar acht functies bakten de naam als platte
 *    tekst in `chat_messages.body`, en die kolom is voor elk groepslid leesbaar.
 *    Dat is de les van EPIC 5, opnieuw: **de regel is pas afgedwongen als de
 *    dátabase hem afdwingt.**
 *
 * ⚠️ **Daarom toetst dit bestand per route en niet per functie.** Domeinregel 7
 *    stelt twee vragen bij elk oppervlak, en de tweede is: *kan iemand dat met
 *    één API-verzoek uitlezen buiten de UI om?* Een test die alleen
 *    `groepschat()` voert, beantwoordt die vraag niet — de kale
 *    `select body from chat_messages` loopt er omheen. Beide staan hieronder, en
 *    ze zijn apart geijkt.
 *
 * ⚠️ **Realtime is bewust geen derde geval.** `chat_messages` zit in de
 *    realtime-publicatie, maar die levert alleen nieuwe rijen op het moment van
 *    invoegen — als de persoon dus nog bestaat en zijn naam in de groep sowieso
 *    zichtbaar is. Geschiedenis wordt niet nagestuurd, dus een verwijderde naam
 *    kan er niet langs. Wat er wél langs zou kunnen is een DELETE met
 *    `REPLICA IDENTITY FULL`, en dat is al verboden en al bewaakt
 *    (`realtime_bewaking()`, migratie 0027).
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'plaats_systeembericht'",
  import.meta.url,
);

/** Zeldzaam genoeg om een `like`-treffer eenduidig te maken. */
const NAAM = 'ZeldzameNaamAlice';

/**
 * Laat Alice toetreden tot de groep van Bob — dat plaatst `member_joined` —
 * verwijdert daarna haar account, en geeft terug wat Bob nog kan lezen.
 *
 * `wat` kiest de route: de RPC of een kale select op de tabel.
 */
function watBobLeestNaHaarVertrek(wat: 'rpc' | 'select'): string {
  const bron =
    wat === 'rpc'
      ? 'select coalesce(string_agg(g.body, $$ | $$), $$niets$$) from groepschat((select gid from r)) g'
      : 'select coalesce(string_agg(m.body, $$ | $$), $$niets$$) from chat_messages m ' +
        'where m.group_id = (select gid from r)';

  return (
    psql(`
      begin;
      create temp table r (alice uuid, bob uuid, gid uuid);
      grant select, insert, update on r to authenticated;
      insert into r (alice, bob) values (
        shim_maak_gebruiker('naam-alice@proef.test', '${NAAM}'),
        shim_maak_gebruiker('naam-bob@proef.test', 'Bob'));

      select set_config('request.jwt.claims',
        json_build_object('sub', (select bob from r), 'role', 'authenticated')::text, true);
      set local role authenticated;
      update r set gid = ((create_group('Naamgroep', 0::smallint) -> 'group' ->> 'id'))::uuid;
      reset role;

      insert into group_members (group_id, user_id, role, status)
        select gid, alice, 'member', 'active' from r;

      select set_config('request.jwt.claims',
        json_build_object('sub', (select alice from r), 'role', 'authenticated')::text, true);
      set local role authenticated;
      select verwijder_mijn_account();
      reset role;

      select set_config('request.jwt.claims',
        json_build_object('sub', (select bob from r), 'role', 'authenticated')::text, true);
      set local role authenticated;
      ${bron};
      reset role;
      rollback;
    `)
      .split('\n')
      .map((regel) => regel.trim())
      .filter((regel) => regel !== '')
      .at(-1) ?? ''
  );
}

describe.skipIf(!beschikbaar)('de naam van een vertrokken lid staat niet in de body', () => {
  it('niet via groepschat()', () => {
    const gelezen = watBobLeestNaHaarVertrek('rpc');

    // ⚠️ Eerst dat de opstelling deed wat ze belooft: staat hier 'niets', dan is
    //    er geen bericht geplaatst en toetst de regel eronder een lege string.
    expect(gelezen, 'er is geen systeembericht geplaatst').toContain('doet mee');
    expect(gelezen, `groepschat() gaf de naam terug: ${gelezen}`).not.toContain(NAAM);
  }, 120_000);

  it('en ook niet via een kale select op chat_messages', () => {
    // ⚠️⚠️ **Dit is de route die de eerste test níét dekt**, en het is de route
    //    waar acceptatiecriterium 1 met zoveel woorden om vraagt. `authenticated`
    //    heeft kolom-SELECT op `body`, en `chat_messages_select` is een rij- en
    //    geen kolombeperking — RLS kan geen kolommen beperken.
    const gelezen = watBobLeestNaHaarVertrek('select');

    expect(gelezen, 'er is geen systeembericht geplaatst').toContain('doet mee');
    expect(gelezen, `de kale select gaf de naam terug: ${gelezen}`).not.toContain(NAAM);
  }, 120_000);

  it('MUST-ALLOW: zolang ze er is, komt haar naam gewoon op het scherm', () => {
    // De keerzijde. Zonder deze helft zou een migratie die `subject_id` leeggooit
    // of de join sloopt ook groen zijn — en dan staat er "Een oud-lid" bij iemand
    // die er nog gewoon is. De naam hoort niet in de **body**; hij hoort wel in
    // de rij, want het scherm rendert hem uit de catalogus met een verse join.
    const naam = psql(`
      begin;
      create temp table r (alice uuid, bob uuid, gid uuid);
      grant select, insert, update on r to authenticated;
      insert into r (alice, bob) values (
        shim_maak_gebruiker('naam-blijft-a@proef.test', '${NAAM}'),
        shim_maak_gebruiker('naam-blijft-b@proef.test', 'Bob'));
      select set_config('request.jwt.claims',
        json_build_object('sub', (select bob from r), 'role', 'authenticated')::text, true);
      set local role authenticated;
      update r set gid = ((create_group('Blijftgroep', 0::smallint) -> 'group' ->> 'id'))::uuid;
      reset role;
      insert into group_members (group_id, user_id, role, status)
        select gid, alice, 'member', 'active' from r;
      select set_config('request.jwt.claims',
        json_build_object('sub', (select bob from r), 'role', 'authenticated')::text, true);
      set local role authenticated;
      select coalesce(g.subject_name, 'NULL')
        from groepschat((select gid from r)) g
       where g.system_event = 'member_joined';
      reset role;
      rollback;
    `)
      .split('\n')
      .map((regel) => regel.trim())
      .filter((regel) => regel !== '')
      .at(-1);

    expect(naam, 'het scherm kan de naam niet meer tonen van iemand die er nog is').toBe(NAAM);
  }, 120_000);

  it('geen enkele functie bouwt nog een berichttekst uit een weergavenaam', () => {
    // ⚠️⚠️ **Dit is de grendel die de vólgende functie vangt.** Het issue noemde
    //    vijf functies; 📏 een scan over `pg_proc.prosrc` gaf er acht — twee in
    //    `meld_commitment()` en één in `vraag_deadline_verschuiving()` stonden er
    //    niet bij, en `trek_goedkeuring_in()` bouwde de zin zelfs opnieuw op om
    //    er een bericht mee terug te zoeken. Een lijst in een issue is geen
    //    dekking; deze toets is dat wel.
    //
    // ⚠️ **Commentaar wordt eruit gestript, en dat is geen slordigheid maar een
    //    besluit.** 0213 schrijft in `trek_goedkeuring_in()` op wat er wég is
    //    ("hier stond `weergavenaam(approver) || …`"), en dat is documentatie en
    //    geen aanroep. Zelfde vorm en zelfde reden als de `paused`-scan in
    //    `pauze-bestaat-niet.test.ts`.
    const treffers = psql(
      `select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and regexp_replace(p.prosrc, '--[^\\n]*', '', 'g') like '%weergavenaam(%'`,
    ).trim();

    expect(
      treffers,
      `deze functies bouwen nog tekst uit een weergavenaam: ${treffers}`,
    ).toBe('');
  }, 120_000);
});

/**
 * Een ingetrokken bevestiging haalt haar bericht weg, ook nu de zin niet meer
 * uniek is — QS8-372, migratie 0213.
 *
 * ⚠️⚠️ **Dit is de naad die deze wijziging zelf maakt, en regel 18 vraag 6 in het
 *    echt:** *tilt deze feature een aanname van "er is er altijd precies één"
 *    naar "er kunnen er meer zijn"?*
 *
 *    `trek_goedkeuring_in()` zocht het bericht terug met `m.body = tekst`, waarbij
 *    het de zin opnieuw opbouwde uit twee weergavenamen. De zin wás de sleutel.
 *    Zonder naam dragen twee bevestigingen van dezelfde beoordelaar voor dezelfde
 *    persoon in dezelfde groep exact dezelfde tekst — en dan telt `treffers` er
 *    twee, slaat de `if` over, en blijft er een bericht staan dat zegt dat een
 *    week bevestigd is terwijl de bevestiging is ingetrokken.
 *
 * 📏 **Nagespeeld, en het is geen theorie.** Met de oude sleutel bleven er na het
 *    intrekken **2** berichten staan; met de `completion_id` uit `payload` blijft
 *    er **1** over, en dat is de andere voltooiing.
 */
describe.skipIf(!beschikbaar)('een ingetrokken bevestiging neemt haar bericht mee', () => {
  /** Twee bevestigingen door dezelfde persoon voor dezelfde persoon, één intrekking. */
  function naIntrekkenVanDeTweede(): { berichten: number; hoortBijDeEerste: boolean } {
    const uit = psql(`
      begin;
      create temp table r (alice uuid, bob uuid, gid uuid, goal uuid,
                           wg1 uuid, wg2 uuid, c1 uuid, c2 uuid, a2 uuid);
      grant select, insert, update on r to authenticated;
      insert into r (alice, bob) values (
        shim_maak_gebruiker('naad-alice@proef.test', 'Alice'),
        shim_maak_gebruiker('naad-bob@proef.test', 'Bob'));

      select set_config('request.jwt.claims',
        json_build_object('sub', (select bob from r), 'role', 'authenticated')::text, true);
      set local role authenticated;
      update r set gid = ((create_group('Naadgroep', 0::smallint) -> 'group' ->> 'id'))::uuid;
      insert into goals (owner_id, title, target_date)
        select bob, 'Bobdoel', current_date + 90 from r;
      update r set goal = (select id from goals where owner_id = (select bob from r) limit 1);
      reset role;

      insert into group_members (group_id, user_id, role, status)
        select gid, alice, 'member', 'active' from r;
      -- Zonder deze koppeling telt bevestigingsstand() geen enkele groep mee en
      -- plaatst meld_goedkeuring() niets. Dan zou deze test groen zijn op een
      -- opstelling zonder berichten.
      insert into goal_group_links (goal_id, group_id) select goal, gid from r;

      insert into weekly_goals (goal_id, title, cycle_start_date)
        select goal, 'W1', date_trunc('week', current_date)::date from r;
      update r set wg1 = (select id from weekly_goals
                           where goal_id = (select goal from r) and title = 'W1' limit 1);
      insert into weekly_goals (goal_id, title, cycle_start_date)
        select goal, 'W2', date_trunc('week', current_date)::date from r;
      update r set wg2 = (select id from weekly_goals
                           where goal_id = (select goal from r) and title = 'W2' limit 1);

      insert into completions (weekly_goal_id, user_id, achieved_level, note)
        select wg1, bob, 'ceiling', 'een' from r;
      update r set c1 = (select id from completions
                          where weekly_goal_id = (select wg1 from r) limit 1);
      insert into completions (weekly_goal_id, user_id, achieved_level, note)
        select wg2, bob, 'ceiling', 'twee' from r;
      update r set c2 = (select id from completions
                          where weekly_goal_id = (select wg2 from r) limit 1);

      insert into completion_approvals (completion_id, approver_id, subject_id, group_id, status)
        select c1, alice, bob, gid, 'approved' from r;
      insert into completion_approvals (completion_id, approver_id, subject_id, group_id, status)
        select c2, alice, bob, gid, 'approved' from r;
      update r set a2 = (select id from completion_approvals
                          where completion_id = (select c2 from r) limit 1);

      select set_config('request.jwt.claims',
        json_build_object('sub', (select alice from r), 'role', 'authenticated')::text, true);
      set local role authenticated;
      select trek_goedkeuring_in((select a2 from r));
      reset role;

      select (select count(*) from chat_messages
               where system_event = 'completion_approved' and group_id = (select gid from r))
             || ' ' ||
             coalesce((select (m.payload->>'completion_id') = (select c1 from r)::text
                         from chat_messages m
                        where m.system_event = 'completion_approved'
                          and m.group_id = (select gid from r)
                        limit 1)::text, 'geen');
      rollback;
    `)
      .split('\n')
      .map((regel) => regel.trim())
      .filter((regel) => regel !== '')
      .at(-1) ?? '';

    const [aantal, hoort] = uit.split(' ');
    return { berichten: Number(aantal), hoortBijDeEerste: hoort === 't' || hoort === 'true' };
  }

  it('haalt precies het bericht van die ene voltooiing weg', () => {
    const { berichten, hoortBijDeEerste } = naIntrekkenVanDeTweede();

    // 📏 Met de oude sleutel (`m.body = tekst`) staan hier er 2: `treffers` telt
    //    er twee, de `if` slaat over, en het bericht van de ingetrokken
    //    bevestiging blijft staan.
    expect(berichten, 'de ingetrokken bevestiging liet haar bericht staan').toBe(1);
    expect(hoortBijDeEerste, 'het verkeerde bericht is weggehaald').toBe(true);
  }, 120_000);
});

