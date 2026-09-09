/**
 * De belofte: een foto verlaat zijn groep niet — QS8-71.
 *
 * ⚠️⚠️ **Waarom dit náást `chatfotobucket.test.ts` staat en er niet in.** Die
 *    suite toetst de ónderdelen: de policy op `storage.objects`, de CHECK op de
 *    kolom, de teller. Elk daarvan kan kloppen terwijl de belofte breekt, want
 *    **het object en de rij zijn twee onafhankelijk geautoriseerde dingen die de
 *    app als één ding presenteert.** De ene policy zegt iets over `storage`, de
 *    andere over `chat_messages`, en niemand legt ze naast elkaar.
 *
 *    Dat is regel 18 vraag 1 in zijn zuiverste vorm: *waar knopen twee correcte
 *    onderdelen aan elkaar?* Deze test stelt daarom niet de vraag "is de policy
 *    goed" maar "komt Carol er langs **welke route dan ook** bij".
 *
 * ⚠️ **Vier routes, één opstelling.** Alice zit in groep A én B, Bob alleen in A,
 *    Carol alleen in B. Voor elke route geldt: Bob ziet het, Carol niet. Zou er
 *    ooit een vijfde route bijkomen — een RPC, een view, een join — dan hoort
 *    hij hier.
 *
 * ⚠️ **Wat deze test niet kan.** De ondertekenroute (`createSignedUrls`) is de
 *    storage-API en die draait lokaal niet. Wat hier wél getoetst wordt is de
 *    RLS eronder: die API tekent uitsluitend wat `chatfotos_select` doorlaat, en
 *    dát is route 1. De echte ondertekening hoort bij de handmatige doorloop op
 *    het echte project.
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

describe.runIf(beschikbaar)('een foto verlaat zijn groep niet', () => {
  const alice = randomUUID();
  const bob = randomUUID();
  const carol = randomUUID();
  let groepA = '';
  let groepB = '';
  let pad = '';

  beforeAll(() => {
    for (const [id, naam] of [
      [alice, 'Alice'],
      [bob, 'Bob'],
      [carol, 'Carol'],
    ] as const) {
      psql(
        `insert into auth.users (id, email) values ('${id}', '${id}@belofte.local')
         on conflict (id) do nothing`,
      );
      psql(
        `insert into public.profiles (id, display_name) values ('${id}', '${naam}')
         on conflict (id) do nothing`,
      );
    }

    groepA = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Belofte A', '${alice}', 'BA${alice.slice(0, 10).replace(/-/g, '')}') returning id`,
    );
    groepB = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Belofte B', '${alice}', 'BB${alice.slice(0, 10).replace(/-/g, '')}') returning id`,
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

    pad = `${groepA}/${alice}/gedeeld.jpg`;

    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${pad}', '${alice}') on conflict do nothing`,
    );
    psql(
      `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url)
       values ('${groepA}', '${alice}', 'kijk', 'photo', '${pad}')`,
    );
  });

  afterAll(() => {
    psql(`delete from public.chat_messages where group_id in ('${groepA}', '${groepB}')`);
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groepA}/%'`);
    psql(`delete from public.group_members where group_id in ('${groepA}', '${groepB}')`);
    psql(`delete from public.groups where id in ('${groepA}', '${groepB}')`);
    psql(`delete from public.profiles where id in ('${alice}', '${bob}', '${carol}')`);
    psql(`delete from auth.users where id in ('${alice}', '${bob}', '${carol}')`);
  });

  /** De vier manieren waarop iemand aan dit pad zou kunnen komen. */
  const ROUTES: readonly (readonly [string, string])[] = [
    ['het opslagobject', `select count(*) from storage.objects where name = '${'PAD'}'`],
    ['de RPC die de chat vult', `select count(*) from groepschat('${'GROEP'}') where attachment_url is not null`],
    [
      'een kale select op de berichtentabel',
      `select count(*) from public.chat_messages where attachment_url is not null and group_id = '${'GROEP'}'`,
    ],
    [
      'een select die alleen de kolom vraagt',
      `select count(*) from public.chat_messages where attachment_url = '${'PAD'}'`,
    ],
  ];

  const vul = (sql: string) => sql.replace(/PAD/g, pad).replace(/GROEP/g, groepA);

  it.each(ROUTES.map(([naam, sql]) => [naam, sql] as const))(
    'geeft %s wél aan een groepsgenoot',
    (_naam, sql) => {
      expect(als(bob, vul(sql))).toBe('1');
    },
  );

  it.each(ROUTES.map(([naam, sql]) => [naam, sql] as const))(
    'geeft %s niet aan wie een ándere groep met je deelt',
    (_naam, sql) => {
      // ⚠️ Carol deelt groep B met Alice. Elke route die op "ken je Alice"
      //    beslist in plaats van op "zit je in deze groep", geeft haar dit pad.
      expect(als(carol, vul(sql))).toBe('0');
    },
  );

  it('neemt de foto mee als de plaatser zijn account verwijdert', () => {
    // ⚠️⚠️ **Dit was een 23514 en geen ontwerp.** 📏 Zonder migratie 0224 valt
    //    `delete from profiles` om op de CHECK van 0223: het `on delete set null`
    //    van 0031 maakt `sender_id` leeg, en die CHECK eist er een bij een
    //    bijlage. Accountverwijdering brak dus op een fotobericht.
    //
    // ⚠️ Twee soorten fotoberichten, twee uitkomsten: mét tekst blijft de tekst
    //    en gaat de foto weg; zónder tekst ís het bericht de foto en gaat de rij
    //    weg. Een lege bubbel kán bovendien niet — `chat_messages_inhoud_vereist`
    //    eist tekst óf een bijlage.
    //
    // ⚠️⚠️ **Dit geval toetste tot 0232 het mechanisme en niet de belofte, en
    //    het mechanisme was fout.** Het eiste `objecten: '0'` — de metadata-rijen
    //    weg — en dat is precies wat 0224 deed. Alleen: een `delete from
    //    storage.objects` haalt de **rij** weg en niet de **bytes**, en zonder rij
    //    wijst er niets meer naar dat pad. De blob was daarmee onvindbaar voor
    //    élke opruimpas, en dus voor altijd. Een groene test op een belofte die
    //    niet waargemaakt werd; de tweede vraag van onwrikbare regel 18.
    //
    //    De belofte is: de foto van een vertrekker is weg uit de groep. De
    //    bewering is daarom nu drieledig — de rij staat er nog (anders is er
    //    niets meer op te ruimen), niemand kan hem lezen, en `verlopen_chatfotos()`
    //    wijst hem aan zodat `storage.remove()` er in de rollover de bytes
    //    daadwerkelijk afhaalt.
    const vertrekker = randomUUID();
    psql(
      `insert into auth.users (id, email) values ('${vertrekker}', '${vertrekker}@weg.local')
       on conflict (id) do nothing`,
    );
    psql(
      `insert into public.group_members (group_id, user_id, role, status)
       values ('${groepA}', '${vertrekker}', 'member', 'active') on conflict do nothing`,
    );

    const metTekst = `${groepA}/${vertrekker}/met-tekst.png`;
    const alleenFoto = `${groepA}/${vertrekker}/alleen-foto.png`;
    for (const p of [metTekst, alleenFoto]) {
      psql(
        `insert into storage.objects (bucket_id, name, owner)
         values ('chatfotos', '${p}', '${vertrekker}') on conflict do nothing`,
      );
    }
    psql(
      `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url)
       values ('${groepA}', '${vertrekker}', 'kijk hier', 'photo', '${metTekst}')`,
    );
    psql(
      `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url)
       values ('${groepA}', '${vertrekker}', '', 'photo', '${alleenFoto}')`,
    );

    // ⚠️ Het respijtuur van 0232 geldt ook voor déze wezen; zonder deze regel
    //    toetst het laatste veld hieronder het respijtuur en niet de trigger.
    psql(
      `update storage.objects set created_at = now() - interval '3 hours'
       where bucket_id = 'chatfotos' and name like '${groepA}/${vertrekker}/%'`,
    );

    psql(`delete from public.profiles where id = '${vertrekker}'`);

    const objecten = psql(
      `select count(*) from storage.objects
       where bucket_id = 'chatfotos' and name like '${groepA}/${vertrekker}/%'`,
    );
    const leesbaar = als(
      bob,
      `select count(*) from storage.objects where name like '${groepA}/${vertrekker}/%'`,
    );
    const opgeruimd = psql(
      `select count(*) from public.verlopen_chatfotos(500)
       where pad like '${groepA}/${vertrekker}/%' and reden = 'wees'`,
    );
    const alleenFotoOver = psql(
      `select count(*) from public.chat_messages where attachment_url = '${alleenFoto}'`,
    );
    const tekstOver = psql(
      `select count(*) from public.chat_messages
       where body = 'kijk hier' and attachment_url is null`,
    );

    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groepA}/${vertrekker}/%'`);
    psql(`delete from public.chat_messages where group_id = '${groepA}' and body = 'kijk hier'`);
    psql(`delete from auth.users where id = '${vertrekker}'`);

    expect({ objecten, leesbaar, opgeruimd, alleenFotoOver, tekstOver }).toEqual({
      objecten: '2',
      leesbaar: '0',
      opgeruimd: '2',
      alleenFotoOver: '0',
      tekstOver: '1',
    });
  });

  it('geeft geen enkele route iets aan wie in geen van beide groepen zit', () => {
    const buitenstaander = randomUUID();
    psql(
      `insert into auth.users (id, email) values ('${buitenstaander}', '${buitenstaander}@b.local')
       on conflict (id) do nothing`,
    );

    const uitkomsten = ROUTES.map(([, sql]) => als(buitenstaander, vul(sql)));

    psql(`delete from public.profiles where id = '${buitenstaander}'`);
    psql(`delete from auth.users where id = '${buitenstaander}'`);

    expect(uitkomsten).toEqual(['0', '0', '0', '0']);
  });
});
