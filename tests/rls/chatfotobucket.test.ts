/**
 * De chatfoto-bucket en de kolomgrens — migraties 0222, 0223, 0233 en 0235.
 *
 * ⚠️⚠️ **Sinds 0233 hangt de leesgrens aan het bericht en niet aan de map**, en
 *    het plafond telt hándelingen en geen voorraad. Dat verandert twee dingen aan
 *    deze suite: elk object dat leesbaar hoort te zijn heeft een chatbericht
 *    nodig, en een plafondtest die zijn objecten wist zet zijn teller daarmee
 *    níet terug. Allebei staan ze hieronder met zoveel woorden.
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
 *
 * 📏 **De ijking van 0233 — één mutatie per grendel, allemaal op 09-09-2026 rood
 *    gezien.** Een test die je niet rood hebt gezien, bewaakt niets, en een
 *    mutatie die niet de grendel raakt die de test noemt, ijkt de verkeerde.
 *
 *    | Mutatie | Wat er brak | Welk geval rood werd |
 *    |---|---|---|
 *    | A | `and exists (… chat_messages …)` uit `chatfotos_select` | "houdt een object zonder chatbericht weg bij een groepsgenoot" |
 *    | B | die `exists` op `attachment_url is not null` in plaats van `= name` | "laat een groepsgenoot niet met andermans bericht binnen" |
 *    | C | `bewaak_chatfoto_aantal()` telt weer `storage.objects` (de vorm van 0226) | "geeft geen nieuwe ruimte terug als je je foto's weer weghaalt" |
 *    | D | het venster uit `tel_opslag_upload()` — de teller vergeet nooit meer | "geeft de ruimte wél terug zodra het etmaal voorbij is" |
 *    | E | `grant select on dagtellers to authenticated` | "houdt de teller weg bij elke client" |
 *
 *    ⚠️ **C, D en E gaan over de teller van 0233 en niet van 0235.** Deze
 *       migratie had eerst een eigen teller (`chatfoto_uploads`); die is
 *       vervallen toen QS8-399 dezelfde reparatie generiek voor alle drie de
 *       emmers bouwde. De drie gevallen bleven staan omdat ze de belofte voor
 *       **deze** emmer toetsen — de teller eronder is alleen van eigenaar
 *       veranderd.
 *    | M | `chatfotos_update` terug in de vorm uit 0222 | "weigert een upsert op een pad dat je zelf verstuurd hebt" |
 *    | N | idem | "weigert een hernoeming binnen je eigen map" |
 *    | O | het eigenaarsbeen uit `chatfotos_select` | "laat de plaatser zijn eigen wees wél zien, en dus opruimen" |
 *    | P | een `::uuid`-cast in `bewaak_chatfoto_aantal()` | "valt niet om op een pad waarvan het eerste segment geen uuid is" |
 *
 *    ⚠️ M t/m P komen uit de securityronde van 09-09-2026 op deze migratie. Drie
 *       van de vier waren gaten die de eerste vorm van 0233 zélf maakte, en geen
 *       van de vier werd door de eerste twaalf mutaties geraakt — de suite stond
 *       groen op alle drie. Regel 18 vraag 3, in het echt.
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

    // ⚠️⚠️ **Het bericht hoort bij het object, sinds 0233.** `chatfotos_select`
    //    eist een chatbericht dat naar dit pad wijst; zonder deze twee rijen zijn
    //    de leestests hieronder rood om de goede reden en toetsen ze niets meer
    //    over de mápgrens. Dat de gréns aan het bericht hangt, staat in zijn
    //    eigen gevallen verderop.
    for (const [groep, pad] of [
      [groepA, padA()],
      [groepArchief, `${groepArchief}/${alice}/foto.jpg`],
    ] as const) {
      psql(
        `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url)
         values ('${groep}', '${alice}', 'kijk', 'photo', '${pad}')`,
      );
    }
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
  // De leesgrens hangt aan het bericht — 0233
  // -------------------------------------------------------------------------
  //
  // ⚠️⚠️ **Dit is de belofte en niet de policy.** De belofte is: een foto die
  //    nooit verstuurd is, of waarvan het bericht weg is, is geen foto meer. Tot
  //    0233 hing `chatfotos_select` uitsluitend aan het **pad**, en dan is elk
  //    object in de map van de groep leesbaar — ook een upload waarvan de
  //    `insert` sneuvelde en de compenserende `remove()` niet aankwam.

  it('houdt een object zonder chatbericht weg bij een groepsgenoot', () => {
    const wees = `${groepA}/${alice}/nooit-verstuurd.jpg`;
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${wees}', '${alice}') on conflict do nothing`,
    );
    const gezien = als(bob, `select count(*) from storage.objects where name = '${wees}'`);
    psql(`delete from storage.objects where name = '${wees}'`);
    expect(gezien).toBe('0');
  });

  it('laat de plaatser zijn eigen wees wél zien, en dus opruimen', () => {
    // ⚠️⚠️ **Hier stond het omgekeerde, en dat was een gemeten regressie.** De
    //    eerste vorm van deze policy hing de leesgrens uitsluitend aan het
    //    bericht — óók voor de plaatser. Postgres past de SELECT-policy echter
    //    óók toe op `delete … where`, en dan kan de plaatser zijn eigen wees niet
    //    meer opruimen: allebei de compenserende opruimingen in `chat.ts` sterven
    //    stil, want `remove()` geeft geen fout op nul rijen.
    //
    //    Het gevolg werkte de verkeerde kant op. Vóór 0233 was een "verwijderde"
    //    foto meteen weg; met die eerste vorm bleef hij tot de volgende
    //    opruimronde staan, en een ondertekende URL van vóór dat moment blijft
    //    zijn volle uur werken. Precies het spijtmoment waar dit issue voor
    //    begon.
    //
    //    Het lek dat de policy sluit, gaat over **elk ánder lid** — dat geval
    //    staat hierboven en hieronder. Deze test is de must-allow ernaast.
    // ⚠️⚠️ **Het aantal gewiste rijen en niet een foutcode, en dat is een gemeten
    //    val.** Een `delete` die door RLS niets ziet, geeft géén 42501 — hij
    //    raakt nul rijen en meldt niets. Een test die op een SQLSTATE let, staat
    //    dan groen terwijl er niets gebeurt. Vandaar `returning` binnen dezelfde
    //    transactie: `als()` rolt terug, dus een telling áchteraf meet niets.
    const wees = `${groepA}/${alice}/eigen-wees.jpg`;
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${wees}', '${alice}') on conflict do nothing`,
    );
    const gezien = als(alice, `select count(*) from storage.objects where name = '${wees}'`);
    const gewist = als(
      alice,
      `with weg as (delete from storage.objects where name = '${wees}' returning 1)
       select count(*) from weg`,
    );
    psql(`delete from storage.objects where name = '${wees}'`);
    expect({ gezien, gewist }).toEqual({ gezien: '1', gewist: '1' });
  });

  it('sluit het object zodra het bericht weg is', () => {
    // ⚠️⚠️ **De tweede route uit de bevinding, en de ernstigste.**
    //    `verwijderBericht()` wist eerst de rij en dán het bestand. Sluit de app
    //    ertussen, dan krijgt wie er spijt van heeft "weg" te zien terwijl elk
    //    ander lid het bestand nog opsomt met één `storage.list()`.
    const pad = `${groepA}/${alice}/spijt.jpg`;
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${pad}', '${alice}') on conflict do nothing`,
    );
    psql(
      `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url)
       values ('${groepA}', '${alice}', 'oeps', 'photo', '${pad}')`,
    );

    const voor = als(bob, `select count(*) from storage.objects where name = '${pad}'`);
    psql(`delete from public.chat_messages where attachment_url = '${pad}'`);
    const na = als(bob, `select count(*) from storage.objects where name = '${pad}'`);
    psql(`delete from storage.objects where name = '${pad}'`);

    // ⚠️ De must-allow zit in dezelfde test, en met opzet: zonder `voor` zegt
    //    `na` alleen dat er niets leesbaar is, en dat is ook waar als de policy
    //    álles dichtzet.
    expect([voor, na]).toEqual(['1', '0']);
  });

  it('laat een groepsgenoot niet met andermans bericht binnen', () => {
    // ⚠️ **De `exists` mag op het pad matchen en niet op "er bestaat een
    //    bericht".** Een tak die `attachment_url is not null` had gelezen in
    //    plaats van `= storage.objects.name`, staat groen op alle gevallen
    //    hierboven en geeft elk object in de map vrij zodra er érgens één foto in
    //    de groep hangt.
    const wees = `${groepA}/${alice}/losse-wees.jpg`;
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${wees}', '${alice}') on conflict do nothing`,
    );
    // `padA()` heeft wél een bericht, en zit in dezelfde groep en dezelfde map.
    const gezien = als(bob, `select count(*) from storage.objects where name = '${wees}'`);
    psql(`delete from storage.objects where name = '${wees}'`);
    expect(gezien).toBe('0');
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
  // Er is geen UPDATE-recht — 0233 §1b
  // -------------------------------------------------------------------------

  it('weigert een upsert op een pad dat je zelf verstuurd hebt', () => {
    // ⚠️⚠️ **Dit is de omzeilroute van het plafond, en hij is gemeten.**
    //    `insert … on conflict do update` vuurt de BEFORE INSERT-trigger (die
    //    slaagt) maar niet de AFTER **INSERT**-trigger, dus er komt geen
    //    tellerrij bij. 📏 Met `chatfotos_update` erin: één nette upload gaf
    //    één tellerrij, en vijftig upserts daarna óók één. Dat is
    //    `upload(..., { upsert: true })` als ongelimiteerde ingress én egress.
    // ⚠️ De opstelling gaat met `psql` en niet met `als()`: die laatste rolt terug,
    //    en dan is er bij de tweede aanroep niets om mee te botsen — de `on
    //    conflict` wordt dan een gewone insert en de test staat groen op niets.
    const pad = `${groepA}/${bob}/upsert.jpg`;
    const eerste = alsMetFout(
      bob,
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${pad}', '${bob}')`,
    );
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${pad}', '${bob}') on conflict do nothing`,
    );
    psql(
      `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url)
       values ('${groepA}', '${bob}', 'x', 'photo', '${pad}')`,
    );
    const tweede = alsMetFout(
      bob,
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${pad}', '${bob}')
       on conflict (bucket_id, name) do update set owner = excluded.owner`,
    );
    psql(`delete from public.chat_messages where attachment_url = '${pad}'`);
    psql(`delete from storage.objects where name = '${pad}'`);
    psql(`delete from public.dagtellers where domein = 'chatfotos'`);

    // ⚠️ De must-allow zit ernaast: de eerste, gewone upload moet gewoon slagen.
    //    Een policy die álles weigert, staat groen op de must-deny alleen.
    expect([eerste.slice(0, 3), tweede]).toEqual(['ok:', '42501']);
  });

  it('weigert een hernoeming binnen je eigen map', () => {
    // ⚠️ De andere kant van hetzelfde ontbrekende recht. Een hernoeming is voor
    //    de opslagdienst nieuwe bytes op een nieuw pad en zou dus moeten tellen —
    //    en telt niet, want de teller hangt aan INSERT.
    const pad = `${groepA}/${bob}/hernoem.jpg`;
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${pad}', '${bob}') on conflict do nothing`,
    );
    // ⚠️ Ook hier het aantal geraakte rijen: zonder UPDATE-policy ziet de `update`
    //    niets en meldt hij niets. Nul is de weigering.
    const uit = als(
      bob,
      `with bij as (
         update storage.objects set name = '${groepA}/${bob}/hernoemd.jpg'
         where name = '${pad}' returning 1
       ) select count(*) from bij`,
    );
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groepA}/${bob}/hernoem%'`);
    psql(`delete from public.dagtellers where domein = 'chatfotos'`);
    expect(uit).toBe('0');
  });

  it('valt niet om op een pad waarvan het eerste segment geen uuid is', () => {
    // ⚠️ Gat 1 van 0130, nu aan de tellerkant. 📏 De eerste vorm van 0233 had een
    //    eigen teller die naar `uuid` castte zonder vormtoets, en dan gaf
    //    `chatfotos/mijnmap/submap/x.jpg` een `invalid input syntax for type
    //    uuid` — de héle insert viel om. Die teller is vervallen (zie §2 van
    //    0233); wat blijft is het geval, want de volgende cast zit er zo weer in.
    //    📏 Nagemeten met een `::uuid` in `bewaak_chatfoto_aantal()`: rood.
    //
    //    Onbereikbaar voor `authenticated` — `chatfotos_insert` pint beide
    //    segmenten — maar niet voor de Storage-browser in Studio of een script
    //    als `service_role`, en dat zijn precies de rollen die RLS passeren.
    expect(() =>
      psql(
        `insert into storage.objects (bucket_id, name)
         values ('chatfotos', 'mijnmap/submap/x.jpg') on conflict do nothing`,
      ),
    ).not.toThrow();
    psql(`delete from storage.objects where name = 'mijnmap/submap/x.jpg'`);
  });

  // -------------------------------------------------------------------------
  // Het dagplafond
  // -------------------------------------------------------------------------
  //
  // ⚠️⚠️ **Sinds 0233 telt het plafond `dagtellers` en niet
  //    `storage.objects`.** Objecten wissen zet de teller dus níet terug — dat is
  //    de hele reparatie, en het geval dat hem bewaakt staat onderaan deze
  //    sectie. Een plafondtest die een schone teller nodig heeft, zegt dat met
  //    `zetTellerTerug()`.

  /**
   * Zet groep én teller terug — een handeling van de tést, niet van de app.
   *
   * ⚠️ **De volgorde van deze twee regels doet er niet toe, maar het paar wél.**
   *    Alleen de objecten wissen laat de teller staan (en dan loopt de vólgende
   *    plafondtest tegen een plafond aan dat hij niet gezet heeft); alleen de
   *    teller wissen laat objecten staan die de leestests verstoren.
   */
  function zetTellerTerug(groep: string) {
    psql(`delete from public.dagtellers where domein = 'chatfotos'`);
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groep}/%'`);
  }

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
    zetTellerTerug(groepB);
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
    // ⚠️⚠️ **De teller moet er sinds 0233 apart bij, en dat is precies wat die
    //    migratie repareert.** `dagtellers` overleeft een `delete` op
    //    `storage.objects` met opzet — wissen zette de rem anders terug. 📏
    //    Gemeten toen alleen de objecten gewist werden: de vorige test liet de
    //    teller op twintig staan, dus de eerste van deze acht viel al om op het
    //    **groeps**plafond — een rode test met de goede code en de verkeerde
    //    oorzaak.
    zetTellerTerug(groepB);
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
    zetTellerTerug(groepB);
  });

  it('laat de twintigste er nog wél door', () => {
    // ⚠️ De must-allow naast de must-deny. Een plafond dat álles weigert, is
    //    groen op deze suite en stuk voor de gebruiker.
    zetTellerTerug(groepB);
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

    zetTellerTerug(groepB);
  });

  // -------------------------------------------------------------------------
  // Het plafond telt handelingen — 0232
  // -------------------------------------------------------------------------

  it('geeft geen nieuwe ruimte terug als je je foto\'s weer weghaalt', () => {
    // ⚠️⚠️ **Dit is de belofte, en tot 0232 was hij onwaar.** 📏 Gemeten met de
    //    teller van 0226:
    //
    //      1..8: ok    9: GEWEIGERD: Te veel foto's van deze persoon vandaag (8).
    //      A wiste 8 rijen
    //      A opnieuw 1..8: ok    9: GEWEIGERD
    //
    //    `upload → remove → upload` was dus onbegrensd: ongelimiteerde ingress én
    //    egress op een tier die 5 GB per maand meet. Onwrikbare regel 5 vraagt een
    //    limiet per gebruiker per dag, en een limiet op de vóórraad is dat niet.
    zetTellerTerug(groepB);
    for (let i = 0; i < 8; i += 1) {
      psql(
        `insert into storage.objects (bucket_id, name, owner)
         values ('chatfotos', '${groepB}/${alice}/ratel-${i}.jpg', '${alice}')
         on conflict do nothing`,
      );
    }

    // Alleen de objecten weg — precies de handeling die vroeger ruimte gaf.
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groepB}/${alice}/ratel-%'`);

    const uit = alsMetFout(
      alice,
      `insert into storage.objects (bucket_id, name)
       values ('chatfotos', '${groepB}/${alice}/opnieuw.jpg')`,
    );
    zetTellerTerug(groepB);
    expect(uit).toBe('23514');
  });

  it('geeft de ruimte wél terug zodra het etmaal voorbij is', () => {
    // ⚠️ **De must-allow naast de ratel, en die is dragend.** Een teller die
    //    handelingen telt en nooit vergeet, is geen dagplafond maar een
    //    levenslang quotum: acht foto's en daarna nooit meer. Het venster van een
    //    etmaal ís het plafond, en zonder dit geval bewaakt niets dat het venster
    //    er nog is.
    zetTellerTerug(groepB);
    for (let i = 0; i < 8; i += 1) {
      psql(
        `insert into storage.objects (bucket_id, name, owner)
         values ('chatfotos', '${groepB}/${alice}/gisteren-${i}.jpg', '${alice}')
         on conflict do nothing`,
      );
    }
    // ⚠️ `venster_start` en geen rij per upload: de teller van 0232 houdt één rij
    //    per emmer, soort en sleutel, en het venster schuift pas als het
    //    verstreken is. Een etmaal terugzetten is dus precies "morgen".
    psql(
      `update public.dagtellers set venster_start = now() - interval '25 hours'
       where domein = 'chatfotos'`,
    );

    const uit = alsMetFout(
      alice,
      `insert into storage.objects (bucket_id, name)
       values ('chatfotos', '${groepB}/${alice}/vandaag.jpg')`,
    );
    zetTellerTerug(groepB);
    expect(uit).toMatch(/^ok:/);
  });

  it('houdt de teller weg bij elke client', () => {
    // ⚠️ RLS aan en géén policy is deny-all, maar alleen als de tabelgrant ook
    //    weg is — anders leest `authenticated` hem met de rechten die
    //    `alter default privileges` uitdeelde. Onwrikbare regel 4.
    expect(alsMetFout(alice, 'select count(*) from public.dagtellers')).toBe('42501');
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
