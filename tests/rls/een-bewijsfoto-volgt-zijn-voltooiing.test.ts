/**
 * De belofte: een bewijsfoto is zichtbaar voor precies wie de voltooiing mag
 * lezen — QS8-391.
 *
 * ⚠️⚠️ **Waarom dit náást `bewijsfotobucket.test.ts` staat en er niet in.** Die
 *    suite toetst de ónderdelen: de policy op `storage.objects`, de CHECK op de
 *    kolom, de teller. Elk daarvan kan kloppen terwijl de belofte breekt, want
 *    **het object en de rij zijn twee onafhankelijk geautoriseerde dingen die de
 *    app als één ding presenteert.**
 *
 * ⚠️⚠️ **En hier komt een tweede laag bij die bij de chatfoto niet bestond.**
 *    `completions_select` luidt `owner or shares_group_with_goal(goal)` — geen
 *    woord over een status. Maar zijn `exists` leest `weekly_goals`, en **RLS
 *    geldt óók binnen een policy-subquery**. Staat het weekdoel op `missed`,
 *    `carried`, `cancelled` of `excused`, dan is de vóltooiing onzichtbaar voor
 *    een groepsgenoot — via een filter dat nergens in zijn eigen tekst staat.
 *
 *    📏 Dat is geen redenering maar een meting, en hij heeft in deze branch een
 *    echt lek gevonden: de eerste versie van 0227 had `security definer`
 *    hulpfuncties die het predicaat van `completions_select` **overschreven**.
 *    Letterlijk overgetypt, en toch niet hetzelfde — want een definer-functie
 *    omzeilt precies die overerving. Bob las het object van een gemiste week die
 *    hij niet mocht zien.
 *
 *    De reparatie is niet het filter erbij kopiëren; dan staat er een tweede
 *    kopie die opnieuw kan verlopen. De policy stelt nu de **vraag**
 *    (`exists (select 1 from completions where attachment_url = name)`) met een
 *    **invoker**-functie, zodat de RLS van `completions` beslist.
 *
 * ⚠️ **Elke route heeft een must-allow én een must-deny.** Een nul die niets
 *    bewijst is het gevaarlijkste resultaat in deze suite: als álles stuk is,
 *    is álles nul en staat de test groen te wezen.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { psql as psqlKaal, stackBeschikbaarOfFaal } from './psql-stack';

const psql = (sql: string) => psqlKaal(sql, { verbose: true });

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from storage.buckets where id = 'bewijsfotos'",
  import.meta.url,
);

function als(userId: string, sql: string): string {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' }).replace(/'/g, "''");
  const uitvoer = psql(
    `begin;
     select set_config('request.jwt.claims', '${claims}', true);
     set local role authenticated;
     ${sql};
     rollback;`,
  );
  return uitvoer.split('\n').slice(1).join('\n').trim();
}

describe.runIf(beschikbaar)('een bewijsfoto volgt zijn voltooiing', () => {
  const alice = randomUUID();
  const bob = randomUUID();
  const carol = randomUUID();
  const dave = randomUUID();

  let groepA = '';
  let groepB = '';
  let doelA = '';
  let doelSolo = '';
  let weekLopend = '';
  let weekGemist = '';
  let weekSolo = '';
  let padLopend = '';
  let padGemist = '';
  let padSolo = '';

  function maakWeek(doel: string, titel: string, status: string): string {
    return psql(
      `insert into public.weekly_goals (goal_id, title, cycle_start_date, status)
       values ('${doel}', '${titel}', current_date, '${status}') returning id`,
    );
  }

  function maakBewijs(week: string, eigenaar: string, naam: string): string {
    const pad = `${week}/${eigenaar}/${naam}.jpg`;
    psql(
      `insert into public.completions (weekly_goal_id, user_id, achieved_level, note, attachment_url)
       values ('${week}', '${eigenaar}', 'ceiling', 'gedaan', '${pad}')`,
    );
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('bewijsfotos', '${pad}', '${eigenaar}') on conflict do nothing`,
    );
    return pad;
  }

  beforeAll(() => {
    for (const id of [alice, bob, carol, dave]) {
      psql(
        `insert into auth.users (id, email) values ('${id}', '${id}@bewijs.local')
         on conflict (id) do nothing`,
      );
    }

    // Alice zit in A én B, Bob alleen in A, Carol alleen in B, Dave nergens.
    groepA = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Bewijs A', '${alice}', 'BWA${alice.slice(0, 9).replace(/-/g, '')}') returning id`,
    );
    groepB = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Bewijs B', '${alice}', 'BWB${alice.slice(0, 9).replace(/-/g, '')}') returning id`,
    );
    for (const [groep, leden] of [
      [groepA, [alice, bob]],
      [groepB, [alice, carol]],
    ] as const) {
      for (const id of leden) {
        psql(
          `insert into public.group_members (group_id, user_id, role, status)
           values ('${groep}', '${id}', 'member', 'active') on conflict do nothing`,
        );
      }
    }

    doelA = psql(
      `insert into public.goals (owner_id, title, target_date)
       values ('${alice}', 'Doel in A', current_date + 60) returning id`,
    );
    psql(
      `insert into public.goal_group_links (goal_id, group_id)
       values ('${doelA}', '${groepA}') on conflict do nothing`,
    );

    // ⚠️ Een doel dat aan **geen enkele** groep hangt. Dat geval bestaat, en het
    //    is precies waarom de `chatfotos`-vorm hier niet kon: die heeft een
    //    `group_id` als sleutel en die is er dan niet.
    doelSolo = psql(
      `insert into public.goals (owner_id, title, target_date)
       values ('${alice}', 'Solodoel', current_date + 60) returning id`,
    );

    weekLopend = maakWeek(doelA, 'Lopend', 'pending');
    weekGemist = maakWeek(doelA, 'Gemist', 'missed');
    weekSolo = maakWeek(doelSolo, 'Solo', 'pending');

    padLopend = maakBewijs(weekLopend, alice, 'lopend');
    padGemist = maakBewijs(weekGemist, alice, 'gemist');
    padSolo = maakBewijs(weekSolo, alice, 'solo');
  });

  afterAll(() => {
    psql(`delete from storage.objects where bucket_id = 'bewijsfotos'`);
    psql(`delete from public.goals where owner_id = '${alice}'`);
    psql(`delete from public.group_members where group_id in ('${groepA}', '${groepB}')`);
    psql(`delete from public.groups where id in ('${groepA}', '${groepB}')`);
    psql(`delete from auth.users where id in ('${alice}', '${bob}', '${carol}', '${dave}')`);
  });

  /** De vier manieren waarop iemand aan dit pad zou kunnen komen. */
  const ROUTES: readonly (readonly [string, string])[] = [
    ['het opslagobject', `select count(*) from storage.objects where name = 'PAD'`],
    [
      'de RPC die de wachtrij vult',
      `select count(*) from openstaande_beoordelingen() where attachment_url = 'PAD'`,
    ],
    [
      'een kale select op de voltooiingentabel',
      `select count(*) from public.completions where attachment_url = 'PAD'`,
    ],
    [
      'een select die alleen de kolom vraagt',
      `select count(*) from public.completions where attachment_url is not null and attachment_url = 'PAD'`,
    ],
  ];

  const vul = (sql: string, pad: string) => sql.replace(/PAD/g, pad);

  // ── must-allow ─────────────────────────────────────────────────────────────
  //
  // ⚠️ Zonder deze helft bewijst elke nul hieronder niets: is de opstelling stuk,
  //    dan is álles nul en staat de suite groen.

  it.each(ROUTES.map(([naam, sql]) => [naam, sql] as const))(
    'geeft %s wél aan de beoordelaar, bij een lopende week',
    (naam, sql) => {
      // De RPC filtert op `w.status = 'pending'` én "niet jezelf"; de andere drie
      // routes zijn voor de eigenaar ook waar. Alleen Bob is hier beoordelaar.
      expect(als(bob, vul(sql, padLopend))).toBe('1');
      if (!naam.startsWith('de RPC')) expect(als(alice, vul(sql, padLopend))).toBe('1');
    },
  );

  // ── must-deny ──────────────────────────────────────────────────────────────

  it.each(ROUTES.map(([naam, sql]) => [naam, sql] as const))(
    'geeft %s niet aan wie een ándere groep met je deelt',
    (_naam, sql) => {
      // ⚠️ Carol deelt groep B met Alice. Elke route die op "ken je Alice"
      //    beslist in plaats van op "zit je in deze groep", geeft haar dit pad.
      //    Dat is precies wat de avatar-vorm `<user_id>/<naam>` zou doen.
      expect(als(carol, vul(sql, padLopend))).toBe('0');
    },
  );

  it.each(ROUTES.map(([naam, sql]) => [naam, sql] as const))(
    'geeft %s aan niemand buiten beide groepen',
    (_naam, sql) => {
      expect(als(dave, vul(sql, padLopend))).toBe('0');
    },
  );

  it.each(ROUTES.map(([naam, sql]) => [naam, sql] as const))(
    'geeft %s van een doel zónder groep aan niemand anders',
    (_naam, sql) => {
      // Bob deelt groep A met Alice, maar dit doel hangt aan geen enkele groep.
      expect(als(bob, vul(sql, padSolo))).toBe('0');
      expect(als(carol, vul(sql, padSolo))).toBe('0');
    },
  );

  it('geeft het bewijs van een gemiste week aan niemand behalve de eigenaar', () => {
    // ⚠️⚠️ **Dit is het geval dat in deze branch een echt lek was.**
    //    `shares_group_with_goal(doel)` is voor Bob wáár — hij is actief lid van
    //    groep A en het doel hangt eraan. Toch mag hij deze rij niet lezen, want
    //    `completions_select` leest `weekly_goals` en dáár filtert de policy
    //    `missed` weg. Een `security definer` hulpfunctie omzeilde die
    //    overerving en gaf hem het object alsnog.
    //
    //    Een gemiste week van iemand anders is precies wat domeinregel 7
    //    beschermt.
    const deelt = als(bob, `select shares_group_with_goal('${doelA}')`);
    const rij = als(bob, `select count(*) from public.completions where attachment_url = '${padGemist}'`);
    const object = als(bob, `select count(*) from storage.objects where name = '${padGemist}'`);
    const eigenaar = als(alice, `select count(*) from storage.objects where name = '${padGemist}'`);

    expect({ deelt, rij, object, eigenaar }).toEqual({
      deelt: 't',
      rij: '0',
      object: '0',
      eigenaar: '1',
    });
  });

  it('sluit het object op hetzelfde moment als de rij, zodra het lidmaatschap eindigt', () => {
    // ⚠️ De twee autorisaties mogen niet uit elkaar lopen over tijd. Dat is de
    //    derde reden dat het pad niet op een groep gesleuteld is: een pad ligt
    //    vast, een lidmaatschap niet.
    const voorRij = als(bob, `select count(*) from public.completions where attachment_url = '${padLopend}'`);
    const voorObject = als(bob, `select count(*) from storage.objects where name = '${padLopend}'`);

    psql(
      `update public.group_members set status = 'inactive'
       where group_id = '${groepA}' and user_id = '${bob}'`,
    );

    const naRij = als(bob, `select count(*) from public.completions where attachment_url = '${padLopend}'`);
    const naObject = als(bob, `select count(*) from storage.objects where name = '${padLopend}'`);

    psql(
      `update public.group_members set status = 'active'
       where group_id = '${groepA}' and user_id = '${bob}'`,
    );

    expect({ voorRij, voorObject, naRij, naObject }).toEqual({
      voorRij: '1',
      voorObject: '1',
      naRij: '0',
      naObject: '0',
    });
  });

  it('laat het bewijs verdwijnen als de eigenaar zijn account verwijdert', () => {
    // ⚠️⚠️ **Dit is het tegenovergestelde van wat QS8-391 vroeg, en de reden
    //    staat in 0230.** Het issue zei dat de bewijsfoto blijft omdat hij bewijs
    //    is voor een ander. Maar `completions_user_id_fkey` en
    //    `goals_owner_id_fkey` zijn `on delete cascade`: de rij gaat weg, en dan
    //    is er geen bewijs meer om te bewaren — alleen een wees.
    const vertrekker = randomUUID();
    psql(
      `insert into auth.users (id, email) values ('${vertrekker}', '${vertrekker}@weg.local')
       on conflict (id) do nothing`,
    );
    psql(
      `insert into public.group_members (group_id, user_id, role, status)
       values ('${groepA}', '${vertrekker}', 'member', 'active') on conflict do nothing`,
    );
    const doel = psql(
      `insert into public.goals (owner_id, title, target_date)
       values ('${vertrekker}', 'Weg', current_date + 30) returning id`,
    );
    const week = maakWeek(doel, 'Weg', 'pending');
    const pad = maakBewijs(week, vertrekker, 'weg');

    const voor = psql(`select count(*) from storage.objects where name = '${pad}'`);
    psql(`delete from public.profiles where id = '${vertrekker}'`);
    const naObject = psql(`select count(*) from storage.objects where name = '${pad}'`);
    const naRij = psql(`select count(*) from public.completions where attachment_url = '${pad}'`);

    psql(`delete from auth.users where id = '${vertrekker}'`);

    expect({ voor, naObject, naRij }).toEqual({ voor: '1', naObject: '0', naRij: '0' });
  });
});
