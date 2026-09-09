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

/** De laatste regel van een psql-uitvoer, ontdaan van lege regels. */
function laatsteRegel(uit: string): string {
  return (
    uit
      .split('\n')
      .map((regel) => regel.trim())
      .filter((regel) => regel !== '')
      .at(-1) ?? ''
  );
}

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

  it('vijf gebeurtenissen op rij, en in geen enkele body staat de naam', () => {
    // ⚠️⚠️ **Hier stond een scan op `weergavenaam(`, en die bewaakte de verkeerde
    //    kant.** 📏 De security-ronde brak hem met twee mutaties die er allebei
    //    ongemerkt langs kwamen: `select display_name into v_naam from profiles`
    //    gevolgd door `v_naam || ' doet mee.'`, en `weergavenaam (x)` met een
    //    spatie voor het haakje. Erger nog: `weergavenaam()` heeft sinds 0213
    //    **nul** aanroepers, dus de volgende schrijver grijpt er sowieso niet
    //    naar. Een scan op een dode functie bewaakt niets — regel 18 vraag 2.
    //
    // ⚠️ **Een scan op de vórm werkt hier ook niet.** 📏 Geprobeerd: "een plaatser
    //    mag zijn tekst niet samenstellen" vlagt elf functies, want `||` wordt
    //    net zo goed gebruikt voor een jsonb-foutenlijst of een getal. Een
    //    controle met elf uitzonderingen is een lijst en geen grendel.
    //
    // **Dus toetst dit de belofte op echte rijen:** lok vijf gebeurtenissen uit
    // met één zeldzame naam in de groep, en kijk of die naam ergens in een body
    // opduikt. Hoe de naam er zou komen doet er niet toe — via `weergavenaam()`,
    // via een eigen select of via een derde manier die nog niet bedacht is.
    //
    // ⚠️ **Wat dit níét dekt, en dat hoort erbij:** `commitment_due`,
    //    `commitment_unlocked` en `deadline_requested`. Die vragen een commitment-
    //    of deadline-opstelling; ze staan als rij in `docs/ENGINEER-REVIEW.md`.
    //    De andere zeven gebeurtenissen uit de CHECK dragen geen persoon.
    const gevonden = laatsteRegel(
      psql(`
        begin;
        create temp table r (alice uuid, bob uuid, gid uuid, goal uuid, wg uuid,
                             comp uuid, mijl uuid);
        grant select, insert, update on r to authenticated;
        insert into r (alice, bob) values (
          shim_maak_gebruiker('vijf-alice@proef.test', '${NAAM}'),
          shim_maak_gebruiker('vijf-bob@proef.test', 'Bob'));

        select set_config('request.jwt.claims',
          json_build_object('sub', (select bob from r), 'role', 'authenticated')::text, true);
        set local role authenticated;
        update r set gid = ((create_group('Vijfgroep', 0::smallint) -> 'group' ->> 'id'))::uuid;
        reset role;

        -- 1. member_joined
        insert into group_members (group_id, user_id, role, status)
          select gid, alice, 'member', 'active' from r;

        insert into goals (owner_id, title, target_date)
          select alice, 'Doel van Alice', current_date + 90 from r;
        update r set goal = (select id from goals where owner_id = (select alice from r) limit 1);
        insert into goal_group_links (goal_id, group_id) select goal, gid from r;

        insert into weekly_goals (goal_id, title, cycle_start_date)
          select goal, 'Week', date_trunc('week', current_date)::date from r;
        update r set wg = (select id from weekly_goals where goal_id = (select goal from r) limit 1);

        -- 2. completion_pending
        insert into completions (weekly_goal_id, user_id, achieved_level, note)
          select wg, alice, 'ceiling', 'af' from r;
        update r set comp = (select id from completions
                              where weekly_goal_id = (select wg from r) limit 1);

        -- 3. completion_approved
        insert into completion_approvals (completion_id, approver_id, subject_id, group_id, status)
          select comp, bob, alice, gid, 'approved' from r;

        -- 4. milestone_done
        insert into milestones (goal_id, title, order_index)
          select goal, 'Mijlpaal', 1 from r;
        update r set mijl = (select id from milestones where goal_id = (select goal from r) limit 1);
        update milestones set status = 'done' where id = (select mijl from r);

        -- 5. goal_completed
        update goals set status = 'completed' where id = (select goal from r);

        select (select count(*) from chat_messages
                 where group_id = (select gid from r) and type = 'system')
               || ' berichten, naam gevonden in ' ||
               (select count(*) from chat_messages
                 where group_id = (select gid from r) and body like '%${NAAM}%')
               || ' ervan';
        rollback;
      `),
    );

    // ⚠️ Eerst dat er iets te toetsen viel: nul berichten zou hier ook "geen naam
    //    gevonden" opleveren, en dan bewaakt deze test niets.
    const aantal = Number(gevonden.split(' ')[0]);
    expect(aantal, `er zijn geen systeemberichten geplaatst: ${gevonden}`).toBeGreaterThanOrEqual(4);
    expect(gevonden, `de naam staat in een body: ${gevonden}`).toContain('in 0 ervan');
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

/**
 * Een intrekking raakt alleen het bericht van de intrekker zelf — QS8-372,
 * migratie 0213, tweede ronde.
 *
 * ⚠️⚠️ **Dit is de correctie uit de security-ronde op deze branch, en het is de
 *    reden dat de sleutel een páár is.** De zin die 0213 weghaalt codeerde
 *    **twee** dingen: de voltooiing én de beoordelaar, want zijn naam stond erin.
 *    `completion_id` alleen codeert het eerste — en `completion_approvals_one_vote`
 *    is `unique (completion_id, approver_id)`, dus bij een drempel boven één
 *    bevestigen meerdere mensen dezelfde voltooiing en plaatst `meld_goedkeuring()`
 *    per bevestiging een bericht.
 *
 * 📏 Zonder `actor_id` gaat dat twee kanten op fout, allebei nagespeeld — en
 *    allebei waren ze vóór 0213 correct:
 *      * Alice trekt haar eigen bevestiging in en wist het bericht van Carol,
 *        wiens bevestiging geldig blijft. Dit draait `security definer`, dus
 *        langs `chat_messages_delete` (`sender_id = auth.uid()`) heen.
 *      * Bij drie beoordelaars blijven er twee berichten staan die zeggen dat een
 *        week bevestigd is, terwijl de week op `pending` staat.
 */
describe.skipIf(!beschikbaar)('een intrekking raakt alleen het eigen bericht', () => {
  /** Drempel twee. Alice bevestigt eerst, Carol haalt de drempel en plaatst het bericht. */
  function alicetrektInNaCarol(): string {
    return laatsteRegel(
      psql(`
        begin;
        create temp table r (bob uuid, alice uuid, carol uuid, gid uuid, goal uuid,
                             wg uuid, comp uuid, aAlice uuid);
        grant select, insert, update on r to authenticated;
        insert into r (bob, alice, carol) values (
          shim_maak_gebruiker('paar-bob@proef.test', 'Bob'),
          shim_maak_gebruiker('paar-alice@proef.test', 'Alice'),
          shim_maak_gebruiker('paar-carol@proef.test', 'Carol'));

        select set_config('request.jwt.claims',
          json_build_object('sub', (select bob from r), 'role', 'authenticated')::text, true);
        set local role authenticated;
        update r set gid = ((create_group('Paargroep', 0::smallint) -> 'group' ->> 'id'))::uuid;
        insert into goals (owner_id, title, target_date)
          select bob, 'Bobdoel', current_date + 90 from r;
        update r set goal = (select id from goals where owner_id = (select bob from r) limit 1);
        reset role;

        -- De drempel op twee: dit hele geval bestaat alleen boven één.
        update groups set approval_rule = 'quorum', approval_quorum = 2
         where id = (select gid from r);
        insert into group_members (group_id, user_id, role, status)
          select gid, alice, 'member', 'active' from r;
        insert into group_members (group_id, user_id, role, status)
          select gid, carol, 'member', 'active' from r;
        insert into goal_group_links (goal_id, group_id) select goal, gid from r;

        insert into weekly_goals (goal_id, title, cycle_start_date)
          select goal, 'Week', date_trunc('week', current_date)::date from r;
        update r set wg = (select id from weekly_goals where goal_id = (select goal from r) limit 1);
        insert into completions (weekly_goal_id, user_id, achieved_level, note)
          select wg, bob, 'ceiling', 'af' from r;
        update r set comp = (select id from completions
                              where weekly_goal_id = (select wg from r) limit 1);

        insert into completion_approvals (completion_id, approver_id, subject_id, group_id, status)
          select comp, alice, bob, gid, 'approved' from r;
        update r set aAlice = (select id from completion_approvals
                                where completion_id = (select comp from r)
                                  and approver_id = (select alice from r));
        update completion_approvals set created_at = now() - interval '5 minutes'
         where id = (select aAlice from r);
        insert into completion_approvals (completion_id, approver_id, subject_id, group_id, status)
          select comp, carol, bob, gid, 'approved' from r;

        select set_config('request.jwt.claims',
          json_build_object('sub', (select alice from r), 'role', 'authenticated')::text, true);
        set local role authenticated;
        select trek_goedkeuring_in((select aAlice from r));
        reset role;

        select (select count(*) from chat_messages
                 where system_event = 'completion_approved' and group_id = (select gid from r))
               || ' van carol: ' ||
               coalesce((select (m.actor_id = (select carol from r))::text
                           from chat_messages m
                          where m.system_event = 'completion_approved'
                            and m.group_id = (select gid from r) limit 1), 'geen');
        rollback;
      `),
    );
  }

  it('wist niet het bericht van een ander wiens bevestiging blijft staan', () => {
    // 📏 Zonder `and m.actor_id = a.approver_id` staat hier '0 van carol: geen':
    //    Alice wist het bericht van Carol, en Carols bevestiging is nog geldig.
    expect(
      alicetrektInNaCarol(),
      'de intrekking van Alice raakte het bericht van Carol',
    ).toBe('1 van carol: true');
  }, 120_000);
});

