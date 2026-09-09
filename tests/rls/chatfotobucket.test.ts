/**
 * De chatfoto-bucket en de kolomgrens — migraties 0222 en 0223.
 *
 * ⚠️⚠️ **De belofte is niet "de policy staat er". Die is: een foto verlaat zijn
 *    groep niet** — ook niet met één verzoek buiten de UI om. Dat is de tweede
 *    vraag uit domeinregel 7, en de les van EPIC 5: de schermen hielden de regel
 *    netjes aan terwijl de database hem lekte.
 *
 * ⚠️⚠️ **De opstelling is de test.** Alice zit in groep A én B, Bob alleen in A,
 *    Carol alleen in B. Dat is precies de stand waarin de vorm van de
 *    avatar-bucket zou lekken: die leest op `shares_group_with_user()`, en Carol
 *    deelt een groep met Alice. Zou het pad de gebruiker als eerste segment
 *    dragen, dan las Carol de foto die Alice in groep A plaatste. Vandaar dat het
 *    eerste segment de **groep** is.
 *
 * ⚠️ **Waarom psql en niet de harness** — zelfde reden als `avatarbucket.test.ts`:
 *    `storage.objects` is geen PostgREST-oppervlak, maar de policies zijn gewone
 *    RLS-expressies en met `set local role authenticated` plus claims exact zo te
 *    toetsen als PostgREST ze aanroept.
 *
 * ⚠️ Zonder draaiende stack wordt deze suite overgeslagen, en dat is *ongemeten*
 *    en niet groen. `npm run poort` houdt dat onderscheid vast.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { psql as psqlKaal, stackBeschikbaarOfFaal } from './psql-stack';

const psql = (sql: string) => psqlKaal(sql, { verbose: true });

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from storage.buckets where id = 'chatfotos'",
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

/**
 * Zoals `als`, maar de transactie mag omvallen — dan komt de SQLSTATE terug.
 *
 * ⚠️ De code komt uit psql en niet uit de mélding: `VERBOSITY=verbose` zet hem er
 *    letterlijk bij. Een test die op woorden matcht, ziet de `raise exception`
 *    van een triggerfunctie niet — die schrijft zijn eigen zin.
 */
function alsMetFout(userId: string, sql: string): string {
  try {
    return `ok:${als(userId, sql)}`;
  } catch (fout) {
    const tekst = fout instanceof Error ? `${fout.message}` : String(fout);
    const code = /ERROR:\s+([0-9A-Z]{5}):/.exec(tekst);
    return code === null ? tekst : (code[1] ?? tekst);
  }
}

describe.runIf(beschikbaar)('de chatfoto-bucket (0222) en de kolomgrens (0223)', () => {
  const alice = randomUUID();
  const bob = randomUUID();
  const carol = randomUUID();
  let groepA = '';
  let groepB = '';
  /**
   * ⚠️ **Een wegwerpgroep voor de archieftests, en dat is een gemeten
   *    noodzaak.** De trigger `archief_blijft_archief` maakt archiveren
   *    onomkeerbaar met een gewone `update`: een groep terugzetten op `active`
   *    gebeurt gewoon niet. 📏 Zonder deze derde groep archiveerde de leestest
   *    groep A en bleef die archief, waarna élke volgende schrijftest 42501 gaf —
   *    `is_group_member()` sluit een archief uit. De testen waren dan rood om
   *    een reden die niets met de policies te maken had.
   */
  let groepArchief = '';

  const padA = () => `${groepA}/${alice}/foto.jpg`;

  /**
   * Genoeg verschillende uploaders om het **groeps**plafond te kunnen raken
   * zonder eerst tegen het **lid**plafond van 0226 te lopen.
   *
   * ⚠️ Het zijn geen echte accounts, en dat hoeft ook niet: de teller leest het
   *    tweede padsegment, en deze rijen worden door de tabeleigenaar geplaatst.
   *    Wat hier getoetst wordt is de teller, niet de policy — die heeft zijn
   *    eigen gevallen hierboven.
   */
  const uploaders = Array.from({ length: 4 }, () => randomUUID());

  beforeAll(() => {
    for (const [id, naam] of [
      [alice, 'Alice'],
      [bob, 'Bob'],
      [carol, 'Carol'],
    ] as const) {
      psql(
        `insert into auth.users (id, email) values ('${id}', '${id}@chatfoto.local')
         on conflict (id) do nothing`,
      );
      psql(
        `insert into public.profiles (id, display_name) values ('${id}', '${naam}')
         on conflict (id) do nothing`,
      );
    }

    // ⚠️ Unieke codes per run: `invite_code` is UNIQUE, en twee suites tegen
    //    dezelfde stack laten de tweede insert anders omvallen (QS8-336).
    groepA = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Chatfoto A', '${alice}', 'CA${alice.slice(0, 10).replace(/-/g, '')}') returning id`,
    );
    groepB = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Chatfoto B', '${alice}', 'CB${alice.slice(0, 10).replace(/-/g, '')}') returning id`,
    );
    groepArchief = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Chatfoto archief', '${alice}', 'CX${alice.slice(0, 10).replace(/-/g, '')}') returning id`,
    );

    for (const [groep, leden] of [
      [groepA, [alice, bob]],
      [groepB, [alice, carol]],
      [groepArchief, [alice, bob]],
    ] as const) {
      for (const id of leden) {
        psql(
          `insert into public.group_members (group_id, user_id, role, status)
           values ('${groep}', '${id}', 'member', 'active') on conflict do nothing`,
        );
      }
    }

    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${padA()}', '${alice}') on conflict do nothing`,
    );
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${groepArchief}/${alice}/foto.jpg', '${alice}') on conflict do nothing`,
    );
  });

  afterAll(() => {
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groepA}/%'`);
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groepB}/%'`);
    psql(
      `delete from storage.objects where bucket_id = 'chatfotos' and name like '${groepArchief}/%'`,
    );
    psql(`delete from public.chat_messages where group_id in ('${groepA}', '${groepB}', '${groepArchief}')`);
    psql(`delete from public.group_members where group_id in ('${groepA}', '${groepB}', '${groepArchief}')`);
    psql(`delete from public.groups where id in ('${groepA}', '${groepB}', '${groepArchief}')`);
    psql(`delete from public.profiles where id in ('${alice}', '${bob}', '${carol}')`);
    psql(`delete from auth.users where id in ('${alice}', '${bob}', '${carol}')`);
  });

  // -------------------------------------------------------------------------
  // Lezen
  // -------------------------------------------------------------------------

  it('laat een groepsgenoot de foto zien', () => {
    expect(als(bob, `select count(*) from storage.objects where name = '${padA()}'`)).toBe('1');
  });

  it('laat de plaatser zelf de foto zien', () => {
    expect(als(alice, `select count(*) from storage.objects where name = '${padA()}'`)).toBe('1');
  });

  it('houdt hem weg bij wie een ándere groep met je deelt', () => {
    // ⚠️⚠️ **Dit is het geval waarvoor het pad de groep vooraan draagt.** Carol
    //    deelt groep B met Alice, dus `shares_group_with_user(alice)` is wáár —
    //    de vorm van de avatar-bucket zou haar deze foto geven.
    expect(als(carol, `select count(*) from storage.objects where name = '${padA()}'`)).toBe('0');
  });

  it('houdt hem weg bij een oud-lid', () => {
    psql(
      `update public.group_members set status = 'inactive'
       where group_id = '${groepA}' and user_id = '${bob}'`,
    );
    const gezien = als(bob, `select count(*) from storage.objects where name = '${padA()}'`);
    psql(
      `update public.group_members set status = 'active'
       where group_id = '${groepA}' and user_id = '${bob}'`,
    );
    expect(gezien).toBe('0');
  });

  it('laat een gearchiveerde groep leesbaar', () => {
    // ⚠️ `mag_groep_lezen()` en niet `is_group_member()` op SELECT — een archief
    //    is leesbaar en niet beschrijfbaar (0153). `archiefleesgat()` bewaakt dat
    //    ook voor `storage`.
    psql(`update public.groups set status = 'archived' where id = '${groepArchief}'`);
    expect(
      als(bob, `select count(*) from storage.objects where name = '${groepArchief}/${alice}/foto.jpg'`),
    ).toBe('1');
  });

  // -------------------------------------------------------------------------
  // Schrijven
  // -------------------------------------------------------------------------

  it('laat een lid in zijn eigen map van zijn eigen groep schrijven', () => {
    expect(
      alsMetFout(
        bob,
        `insert into storage.objects (bucket_id, name)
         values ('chatfotos', '${groepA}/${bob}/eigen.jpg')`,
      ),
    ).toMatch(/^ok:/);
  });

  it('weigert een pad in de map van een ánder lid', () => {
    expect(
      alsMetFout(
        bob,
        `insert into storage.objects (bucket_id, name)
         values ('chatfotos', '${groepA}/${alice}/gestolen.jpg')`,
      ),
    ).toBe('42501');
  });

  it('weigert een pad in een groep waar je niet in zit', () => {
    expect(
      alsMetFout(
        bob,
        `insert into storage.objects (bucket_id, name)
         values ('chatfotos', '${groepB}/${bob}/vreemd.jpg')`,
      ),
    ).toBe('42501');
  });

  it('weigert schrijven in een gearchiveerde groep', () => {
    // ⚠️ Leunt op de archivering van de leestest hierboven — vandaar de eigen
    //    groep: terugzetten kán niet.
    psql(`update public.groups set status = 'archived' where id = '${groepArchief}'`);
    expect(
      alsMetFout(
        bob,
        `insert into storage.objects (bucket_id, name)
         values ('chatfotos', '${groepArchief}/${bob}/na-archief.jpg')`,
      ),
    ).toBe('42501');
  });

  it('valt niet om op een object met een niet-uuid segment', () => {
    // ⚠️ Gat 1 van 0130: staat de uuid-cast achter een `and` in plaats van in een
    //    `case`, dan sloopt één `.emptyFolderPlaceholder` de héle lijstquery en
    //    niet alleen die rij.
    psql(
      `insert into storage.objects (bucket_id, name)
       values ('chatfotos', '.emptyFolderPlaceholder') on conflict do nothing`,
    );
    const uit = alsMetFout(bob, `select count(*) from storage.objects where bucket_id = 'chatfotos'`);
    psql(`delete from storage.objects where name = '.emptyFolderPlaceholder'`);
    expect(uit).toMatch(/^ok:/);
  });

  // -------------------------------------------------------------------------
  // Het dagplafond
  // -------------------------------------------------------------------------

  it('weigert de eenentwintigste foto van dezelfde groep op één dag', () => {
    // ⚠️ **In groep B en niet in groep A, en dat is een gemeten reparatie.**
    //    Groep A draagt al de foto uit `beforeAll`; twintig erbij tikt het
    //    plafond dan tijdens het klaarzetten aan, en dan valt de test om vóór
    //    zijn eigen bewering. Een teller toets je in een groep waarvan je het
    //    aantal kent.
    // ⚠️⚠️ **Gespreid over uploaders, en dat is geen opsmuk.** Sinds 0226 is er
    //    óók een plafond per lid (8), en twintig foto's van één persoon lopen
    //    dáár tegenaan in plaats van tegen het groepsplafond. Dan zou dit geval
    //    groen staan op de verkeerde teller. Een groep die tegen zijn
    //    groepsplafond loopt, is per definitie een groep waarin meer mensen
    //    geplaatst hebben.
    for (let i = 0; i < 20; i += 1) {
      psql(
        `insert into storage.objects (bucket_id, name, owner)
         values ('chatfotos', '${groepB}/${uploaders[i % uploaders.length]}/vol-${i}.jpg', '${alice}')
         on conflict do nothing`,
      );
    }

    expect(
      alsMetFout(
        alice,
        `insert into storage.objects (bucket_id, name)
         values ('chatfotos', '${groepB}/${alice}/eenentwintig.jpg')`,
      ),
    ).toBe('23514');
  });

  it('weigert de negende foto van dezelfde persoon op één dag', () => {
    // ⚠️ **Het lidplafond naast dat van de groep** (0226). Zonder deze tweede
    //    teller legt één lid met twintig uploads de foto's van de hele groep 24
    //    uur stil, en de anderen krijgen "probeer het zo nog eens" — niet te
    //    onderscheiden van een netwerkfout. Onwrikbare regel 5 vraagt letterlijk
    //    om een limiet per gebruiker per dag.
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groepB}/%'`);
    for (let i = 0; i < 8; i += 1) {
      psql(
        `insert into storage.objects (bucket_id, name, owner)
         values ('chatfotos', '${groepB}/${alice}/mijn-${i}.jpg', '${alice}') on conflict do nothing`,
      );
    }

    expect(
      alsMetFout(
        alice,
        `insert into storage.objects (bucket_id, name)
         values ('chatfotos', '${groepB}/${alice}/negen.jpg')`,
      ),
    ).toBe('23514');
  });

  it('laat een ánder lid daarna nog wél plaatsen', () => {
    // ⚠️ De must-allow die het verschil tússen de twee tellers vastlegt. Zonder
    //    dit geval is een lidplafond niet te onderscheiden van een groepsplafond
    //    dat toevallig lager staat — en dan bewaakt de test de asymmetrie niet
    //    die hij belooft.
    expect(
      alsMetFout(
        carol,
        `insert into storage.objects (bucket_id, name)
         values ('chatfotos', '${groepB}/${carol}/van-carol.jpg')`,
      ),
    ).toMatch(/^ok:/);

    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groepB}/%mijn-%'`);
  });

  it('laat de twintigste er nog wél door', () => {
    // ⚠️ De must-allow naast de must-deny. Een plafond dat álles weigert, is
    //    groen op deze suite en stuk voor de gebruiker.
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groepB}/%vol-%'`);
    for (let i = 0; i < 19; i += 1) {
      psql(
        `insert into storage.objects (bucket_id, name, owner)
         values ('chatfotos', '${groepB}/${uploaders[i % uploaders.length]}/rand-${i}.jpg', '${alice}')
         on conflict do nothing`,
      );
    }

    expect(
      alsMetFout(
        alice,
        `insert into storage.objects (bucket_id, name)
         values ('chatfotos', '${groepB}/${alice}/twintig.jpg')`,
      ),
    ).toMatch(/^ok:/);

    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groepB}/%rand-%'`);
  });

  // -------------------------------------------------------------------------
  // De kolomgrens (0223)
  // -------------------------------------------------------------------------

  const bericht = (pad: string) =>
    `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url)
     values ('${groepA}', '${alice}', 'kijk', 'photo', '${pad}')`;

  it('laat een bericht met een eigen pad door', () => {
    expect(alsMetFout(alice, bericht(padA()))).toMatch(/^ok:/);
  });

  it.each([
    ['een pad van een ander lid', () => `${groepA}/${bob}/x.png`],
    ['een pad van een andere groep', () => `${groepB}/${alice}/x.png`],
    ['een extern adres', () => 'https://volgmij.example/pixel.gif'],
    ['padtraversal', () => `${groepA}/../${groepB}/${alice}/x.png`],
    ['een verboden extensie', () => `${groepA}/${alice}/x.svg`],
    ['een tweede URL achter een regeleinde', () => `${groepA}/${alice}/x.png\nhttps://kwaad.example/a.png`],
  ])('weigert %s', (_naam, pad) => {
    expect(alsMetFout(alice, bericht(pad()))).toBe('23514');
  });

  it('laat een systeembericht zonder bijlage met rust', () => {
    // ⚠️⚠️ **Niet als `authenticated`, en dat is een gemeten reparatie.** 📏 Deze
    //    ijking liep eerst via `als(alice, …)` en viel dan om op **42501**:
    //    `chat_messages_insert` eist `type <> 'system'`, dus de CHECK van 0223
    //    werd nooit geëvalueerd. De test was groen om een reden die niets met
    //    deze grendel te maken had — precies wat CLAUDE.md beschrijft als *"een
    //    ijking die zijn geval door een pad voert dat een éérdere grendel al
    //    afvangt"*. Gevonden in de securityronde van 09-09-2026.
    //
    //    Vandaar de tabeleigenaar: die staat buiten RLS, en dan is de CHECK het
    //    enige wat er nog tussen zit.
    expect(() =>
      psql(
        `insert into public.chat_messages (group_id, sender_id, body, type, system_event)
         values ('${groepA}', null, 'x', 'system', 'member_joined')`,
      ),
    ).not.toThrow();
  });

  it('weigert een systeembericht mét bijlage', () => {
    // ⚠️ De andere helft van diezelfde tak. Zonder dit geval zegt de vorige test
    //    alleen dat er íets doorheen komt, en niet dat de tak iets tegenhoudt.
    expect(() =>
      psql(
        `insert into public.chat_messages (group_id, sender_id, body, type, system_event, attachment_url)
         values ('${groepA}', null, 'x', 'system', 'member_joined', '${padA()}')`,
      ),
    ).toThrow(/23514/);
  });
});
