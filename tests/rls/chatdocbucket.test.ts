/**
 * De documentemmer en zijn twee remmen — migraties 0240 en 0241.
 *
 * ⚠️⚠️ **De belofte is niet "de policy staat er". Die is: een document verlaat
 *    zijn groep niet** — ook niet met één verzoek buiten de UI om. Zelfde tweede
 *    vraag uit domeinregel 7 als bij `chatfotobucket.test.ts`, en dezelfde
 *    opstelling: Alice zit in groep A én B, Bob alleen in A, Carol alleen in B.
 *    Dat is precies de stand waarin de vorm van de avatar-emmer zou lekken.
 *
 * ⚠️⚠️ **Waarom dit een eigen suite is en geen extra `describe` bij de foto.**
 *    De policies zijn qua vorm een kopie, en dat is nu juist de reden: bij een
 *    kopie is de vraag niet of het patroon deugt maar of er precies één
 *    letter verschoven is. Een suite die beide emmers door dezelfde lus haalt,
 *    zou een `chatfotos` in de `chatdocs`-policy niet vinden — hij zou hem twee
 *    keer toetsen en twee keer groen zijn.
 *
 * ⚠️ **De getallen komen uit de gedéployde staat en niet uit het bestand.**
 *    `pg_get_functiondef()` is de waarheid; dat een migratie iets zegt, is een
 *    voornemen. De vergelijking met wat de app dénkt staat in
 *    `tests/beloftes/een-document-voert-niets-uit.test.ts`.
 *
 * ⚠️ Zonder draaiende stack wordt deze suite overgeslagen, en dat is *ongemeten*
 *    en niet groen. `npm run poort` houdt dat onderscheid vast.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { psql as psqlKaal, stackBeschikbaarOfFaal } from './psql-stack';

const psql = (sql: string) => psqlKaal(sql, { verbose: true });

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from storage.buckets where id = 'chatdocs'",
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

/** Zoals `als`, maar de transactie mag omvallen — dan komt de SQLSTATE terug. */
function alsMetFout(userId: string, sql: string): string {
  try {
    return `ok:${als(userId, sql)}`;
  } catch (fout) {
    const tekst = fout instanceof Error ? `${fout.message}` : String(fout);
    const code = /ERROR:\s+([0-9A-Z]{5}):/.exec(tekst);
    return code === null ? tekst : (code[1] ?? tekst);
  }
}

describe.runIf(beschikbaar)('de chatdoc-emmer (0240) en de twee remmen (0241)', () => {
  const alice = randomUUID();
  const bob = randomUUID();
  const carol = randomUUID();
  let groepA = '';
  let groepB = '';
  /**
   * ⚠️ Een wegwerpgroep voor de archieftests. `archief_blijft_archief` maakt
   *    archiveren onomkeerbaar met een gewone `update`, dus een groep die je
   *    voor één geval archiveert, kun je daarna niet meer voor de rest
   *    gebruiken. Zelfde gemeten val als in `chatfotobucket.test.ts`.
   */
  let groepArchief = '';

  /**
   * De tellersleutels van dít bestand — QS8-442.
   *
   * ⚠️⚠️ **`where domein = 'chatdocs'` was niet genoeg, en dat is gemeten.**
   *    Meer bestanden schrijven in dat domein, dus een domeinbrede opruiming wist
   *    de teller van de buren. Dat is dezelfde fout als een kale
   *    `delete from dagtellers`, alleen met een kleinere straal.
   *
   * ⚠️ `tel_dagteller()` legt twee sleutels per groep aan — `<groep>` voor het
   *    groepsplafond en `<groep>/<uploader>` voor het persoonlijke. Een `like` op
   *    de groep dekt ze allebei en niets van iemand anders.
   *
   * ⚠️ Een functie en geen constante: de groepen krijgen hun id pas in
   *    `beforeAll`, dus een `const` op modulehoogte zou een lege string invullen.
   *
   * `tellerbereik:controle` bewaakt dat deze vorm niet terugglijdt.
   */
  function mijnTellers(): string {
    const groepen = [groepA, groepB, groepArchief]
      .map((g) => `sleutel like '${g}%'`)
      .join(' or ');

    return `domein = 'chatdocs' and (${groepen})`;
  }

  const padA = () => `${groepA}/${alice}/document.pdf`;

  /**
   * Genoeg verschillende uploaders om het **groeps**plafond (4) te kunnen raken
   * zonder eerst tegen het **lid**plafond (2) te lopen.
   */
  const uploaders = Array.from({ length: 4 }, () => randomUUID());

  const kort = (id: string) => id.slice(0, 10).replace(/-/g, '');

  beforeAll(() => {
    for (const [id, naam] of [
      [alice, 'Alice'],
      [bob, 'Bob'],
      [carol, 'Carol'],
    ] as const) {
      psql(
        `insert into auth.users (id, email) values ('${id}', '${id}@chatdoc.local')
         on conflict (id) do nothing`,
      );
      psql(
        `insert into public.profiles (id, display_name) values ('${id}', '${naam}')
         on conflict (id) do nothing`,
      );
    }

    // ⚠️ Unieke codes per run: `invite_code` is UNIQUE (QS8-336).
    groepA = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Chatdoc A', '${alice}', 'DA${kort(alice)}') returning id`,
    );
    groepB = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Chatdoc B', '${alice}', 'DB${kort(alice)}') returning id`,
    );
    groepArchief = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Chatdoc archief', '${alice}', 'DX${kort(alice)}') returning id`,
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
       values ('chatdocs', '${padA()}', '${alice}') on conflict do nothing`,
    );
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatdocs', '${groepArchief}/${alice}/document.pdf', '${alice}')
       on conflict do nothing`,
    );

    // ⚠️⚠️ **Sinds 0250 hangt de leesgrens aan het bericht en niet aan de map**,
    //    dus een object zónder bericht is voor iedereen behalve de plaatser
    //    onzichtbaar. De fixture moet die berichten dus hébben — anders toetsen
    //    de leesgevallen hieronder een wees en staan ze rood om de verkeerde
    //    reden. Het geval "een wees is onleesbaar" heeft een eigen test.
    for (const [groep, pad] of [
      [groepA, padA()],
      [groepArchief, `${groepArchief}/${alice}/document.pdf`],
    ] as const) {
      psql(
        `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url, attachment_name)
         values ('${groep}', '${alice}', 'kijk', 'doc', '${pad}', 'document.pdf')
         on conflict do nothing`,
      );
    }
  });

  afterAll(() => {
    for (const groep of [groepA, groepB, groepArchief]) {
      psql(`delete from storage.objects where bucket_id = 'chatdocs' and name like '${groep}/%'`);
    }
    psql(`delete from dagtellers where ${mijnTellers()}`);
    psql(
      `delete from public.chat_messages where group_id in ('${groepA}', '${groepB}', '${groepArchief}')`,
    );
    psql(
      `delete from public.group_members where group_id in ('${groepA}', '${groepB}', '${groepArchief}')`,
    );
    psql(`delete from public.groups where id in ('${groepA}', '${groepB}', '${groepArchief}')`);
    psql(`delete from public.profiles where id in ('${alice}', '${bob}', '${carol}')`);
    psql(`delete from auth.users where id in ('${alice}', '${bob}', '${carol}')`);
  });

  // -------------------------------------------------------------------------
  // De emmer zelf
  // -------------------------------------------------------------------------

  it('is privé', () => {
    // ⚠️ Eén woord in een migratie, en de vier policies eronder zijn decoratie:
    //    een openbare emmer omzeilt RLS volledig.
    expect(psql(`select public from storage.buckets where id = 'chatdocs'`)).toBe('f');
  });

  it('laat precies één MIME-type toe, en dat is application/pdf', () => {
    // ⚠️⚠️ **Dit is de enige grendel tegen uitvoerbare inhoud.** De emmer serveert
    //    terug wat hij bewaart; staat `text/html` hier ooit tussen, dan is de
    //    storage-origin een plek waar iemand anders script kan neerzetten. Zie
    //    §1 van `docs/decisions/2026-09-10-een-document-is-geen-foto.md` en
    //    `tests/beloftes/een-document-voert-niets-uit.test.ts`.
    expect(psql(`select allowed_mime_types from storage.buckets where id = 'chatdocs'`)).toBe(
      '{application/pdf}',
    );
  });

  it('staat op 5 MB', () => {
    expect(psql(`select file_size_limit from storage.buckets where id = 'chatdocs'`)).toBe(
      '5242880',
    );
  });

  it('heeft drie policies en met opzet geen UPDATE', () => {
    // ⚠️⚠️ **Drie en niet vier, en dat is een besluit.** Het UPDATE-recht opende
    //    twee routes die allebei gemeten zijn: een `upsert` omzeilt het
    //    dagplafond (de teller hangt aan INSERT), en een `update` die
    //    `bucket_id` wijzigt verhuist een object uit een ándere emmer hierheen —
    //    waarmee `allowed_mime_types` niet meer de grendel is die de kop van
    //    0240 belooft. `chatfotos` ging hem op dezelfde dag voor (0235 §1b).
    //
    // ⚠️ Onwrikbare regel 1 vraagt vier policies per tabel; `storage.objects` is
    //    niet onze tabel, en vier policies zijn hier een emmer-conventie.
    expect(
      psql(
        `select string_agg(cmd::text, ',' order by cmd::text) from pg_policies
         where schemaname = 'storage' and tablename = 'objects' and policyname like 'chatdocs\\_%'`,
      ),
    ).toBe('DELETE,INSERT,SELECT');
  });

  // -------------------------------------------------------------------------
  // Lezen
  // -------------------------------------------------------------------------

  it('laat een groepsgenoot het document zien', () => {
    expect(als(bob, `select count(*) from storage.objects where name = '${padA()}'`)).toBe('1');
  });

  it('laat de plaatser zelf het document zien', () => {
    expect(als(alice, `select count(*) from storage.objects where name = '${padA()}'`)).toBe('1');
  });

  it('houdt het weg bij wie een ándere groep met je deelt', () => {
    // ⚠️⚠️ **Het geval waarvoor het pad de groep vooraan draagt.** Carol deelt
    //    groep B met Alice, dus `shares_group_with_user(alice)` is wáár — de vorm
    //    van de avatar-emmer zou haar dit document geven.
    expect(als(carol, `select count(*) from storage.objects where name = '${padA()}'`)).toBe('0');
  });

  it('houdt het weg bij een oud-lid', () => {
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

  it('houdt een wees weg bij een groepsgenoot', () => {
    // ⚠️⚠️ **De kern van 0250.** Een object zonder bericht heeft geen
    //    bestaansrecht: de bijlage hóórt bij een bericht. Zolang de leesgrens aan
    //    het pad hing, bleef een verweesd document voor de hele groep leesbaar —
    //    en dat is precies waarom `wis_bijlagen_van_vertrekker()` het object toen
    //    moest wissen, met een onopruimbare blob als prijs.
    const wees = `${groepA}/${alice}/wees.pdf`;
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatdocs', '${wees}', '${alice}') on conflict do nothing`,
    );
    const gezien = als(bob, `select count(*) from storage.objects where name = '${wees}'`);
    psql(`delete from storage.objects where name = '${wees}'`);
    // ⚠️ De teller mee opruimen. 📏 Zonder deze regel aten deze twee gevallen het
    //    dagplafond van groep A op, en viel het must-deny-geval verderop om met
    //    23514 in plaats van 42501 — groen noch rood om de eigen reden. Sinds
    //    0233 overleeft `dagtellers` een delete op `storage.objects` met opzet.
    psql(`delete from dagtellers where ${mijnTellers()}`);
    expect(gezien).toBe('0');
  });

  it('laat de plaatser zijn eigen wees nog wél zien', () => {
    // ⚠️⚠️ **Het eigenaarsbeen is geen verzachting maar een gemeten noodzaak.**
    //    Postgres past de SELECT-policy óók toe op `delete … where`, dus zonder
    //    deze tak kan de plaatser zijn eigen wees niet opruimen — en dan sterft
    //    de compenserende opruiming van `stuurBericht()` stil, want `remove()`
    //    geeft geen fout op nul rijen. Zelfde geval en dezelfde reden als bij de
    //    chatfoto (0235 §1).
    const wees = `${groepA}/${alice}/eigen-wees.pdf`;
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatdocs', '${wees}', '${alice}') on conflict do nothing`,
    );
    const gezien = als(alice, `select count(*) from storage.objects where name = '${wees}'`);
    psql(`delete from storage.objects where name = '${wees}'`);
    psql(`delete from dagtellers where ${mijnTellers()}`);
    expect(gezien).toBe('1');
  });

  it('laat een gearchiveerde groep leesbaar', () => {
    // ⚠️ `mag_groep_lezen()` op SELECT en `is_group_member()` op de rest — een
    //    archief is leesbaar en niet beschrijfbaar (0153). `archiefleesgat()`
    //    bewaakt dat ook.
    psql(`update public.groups set status = 'archived' where id = '${groepArchief}'`);
    expect(
      als(
        bob,
        `select count(*) from storage.objects where name = '${groepArchief}/${alice}/document.pdf'`,
      ),
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
         values ('chatdocs', '${groepA}/${bob}/eigen.pdf')`,
      ),
    ).toMatch(/^ok:/);
  });

  it('weigert een pad in de map van een ánder lid', () => {
    expect(
      alsMetFout(
        bob,
        `insert into storage.objects (bucket_id, name)
         values ('chatdocs', '${groepA}/${alice}/gestolen.pdf')`,
      ),
    ).toBe('42501');
  });

  it('weigert een pad in een groep waar je niet in zit', () => {
    expect(
      alsMetFout(
        bob,
        `insert into storage.objects (bucket_id, name)
         values ('chatdocs', '${groepB}/${bob}/vreemd.pdf')`,
      ),
    ).toBe('42501');
  });

  it('weigert schrijven in een gearchiveerde groep', () => {
    psql(`update public.groups set status = 'archived' where id = '${groepArchief}'`);
    expect(
      alsMetFout(
        bob,
        `insert into storage.objects (bucket_id, name)
         values ('chatdocs', '${groepArchief}/${bob}/na-archief.pdf')`,
      ),
    ).toBe('42501');
  });

  it.each([
    ['een pad dat niet op .pdf eindigt', 'evil.html'],
    ['een pad met een hoofdletterextensie', 'evil.PDF'],
    ['een naam met een teken buiten de klasse', 'ver slag.pdf'],
  ])('weigert %s', (_naam, bestand) => {
    // ⚠️⚠️ **De vorm van de bestandsnaam staat sinds 10-09-2026 in de policy en
    //    niet meer alleen in `chatdocPad()`.** 📏 De securityronde mat dat een
    //    lid `<groep>/<zelf>/evil.html` in deze emmer kon plaatsen. Onbereikbaar
    //    vandaag — de CHECK van 0242 eist `.pdf`, dus geen bericht kan ernaar
    //    wijzen — maar "het pad eindigt op .pdf" was daarmee een eigenschap van
    //    de cliënt, en dit is de laag die dat hoort te weten.
    expect(
      alsMetFout(
        bob,
        `insert into storage.objects (bucket_id, name)
         values ('chatdocs', '${groepA}/${bob}/${bestand}')`,
      ),
    ).toBe('42501');
  });

  it('laat een gewoon .pdf-pad daarnaast nog wél door', () => {
    // ⚠️ De must-allow naast de drie must-denies. Een naamtoets die álles
    //    weigert, is groen op deze suite en stuk voor de gebruiker.
    expect(
      alsMetFout(
        bob,
        `insert into storage.objects (bucket_id, name)
         values ('chatdocs', '${groepA}/${bob}/m9x2q-4kd8.pdf')`,
      ),
    ).toMatch(/^ok:/);
  });

  it('valt niet om op een object met een niet-uuid segment', () => {
    // ⚠️ Gat 1 van 0130: staat de uuid-cast achter een `and` in plaats van in een
    //    `case`, dan sloopt één `.emptyFolderPlaceholder` de héle lijstquery.
    psql(
      `insert into storage.objects (bucket_id, name)
       values ('chatdocs', '.emptyFolderPlaceholder') on conflict do nothing`,
    );
    const uit = alsMetFout(bob, `select count(*) from storage.objects where bucket_id = 'chatdocs'`);
    psql(`delete from storage.objects where name = '.emptyFolderPlaceholder'`);
    expect(uit).toMatch(/^ok:/);
  });

  // -------------------------------------------------------------------------
  // De twee dagplafonds
  // -------------------------------------------------------------------------

  it('weigert het vijfde document van dezelfde groep op één dag', () => {
    // ⚠️ **Gespreid over uploaders**: het lidplafond staat op 2, dus vier van één
    //    persoon lopen dáár tegenaan en dan staat dit geval groen op de verkeerde
    //    teller.
    psql(`delete from storage.objects where bucket_id = 'chatdocs' and name like '${groepB}/%'`);
    psql(`delete from dagtellers where ${mijnTellers()}`);
    for (let i = 0; i < 4; i += 1) {
      psql(
        `insert into storage.objects (bucket_id, name, owner)
         values ('chatdocs', '${groepB}/${uploaders[i]}/vol-${i}.pdf', '${alice}')
         on conflict do nothing`,
      );
    }

    expect(
      alsMetFout(
        alice,
        `insert into storage.objects (bucket_id, name)
         values ('chatdocs', '${groepB}/${alice}/vijf.pdf')`,
      ),
    ).toBe('23514');
  });

  it('laat het vierde er nog wél door', () => {
    // ⚠️ De must-allow naast de must-deny. Een plafond dat álles weigert, is
    //    groen op deze suite en stuk voor de gebruiker.
    psql(`delete from storage.objects where bucket_id = 'chatdocs' and name like '${groepB}/%'`);
    psql(`delete from dagtellers where ${mijnTellers()}`);
    for (let i = 0; i < 3; i += 1) {
      psql(
        `insert into storage.objects (bucket_id, name, owner)
         values ('chatdocs', '${groepB}/${uploaders[i]}/rand-${i}.pdf', '${alice}')
         on conflict do nothing`,
      );
    }

    expect(
      alsMetFout(
        alice,
        `insert into storage.objects (bucket_id, name)
         values ('chatdocs', '${groepB}/${alice}/vier.pdf')`,
      ),
    ).toMatch(/^ok:/);
  });

  it('weigert het derde document van dezelfde persoon op één dag', () => {
    // ⚠️⚠️ **De teller moet er sinds 0233 apart bij.** `dagtellers`
    //    overleeft een `delete` op `storage.objects` met opzet — wissen zette de
    //    rem anders terug. De objecten weghalen is dus niet meer genoeg.
    psql(`delete from storage.objects where bucket_id = 'chatdocs' and name like '${groepB}/%'`);
    psql(`delete from dagtellers where ${mijnTellers()}`);
    for (let i = 0; i < 2; i += 1) {
      psql(
        `insert into storage.objects (bucket_id, name, owner)
         values ('chatdocs', '${groepB}/${alice}/mijn-${i}.pdf', '${alice}') on conflict do nothing`,
      );
    }

    expect(
      alsMetFout(
        alice,
        `insert into storage.objects (bucket_id, name)
         values ('chatdocs', '${groepB}/${alice}/drie.pdf')`,
      ),
    ).toBe('23514');
  });

  it('laat een ánder lid daarna nog wél plaatsen', () => {
    // ⚠️ De must-allow die het verschil tússen de twee tellers vastlegt. Zonder
    //    dit geval is een lidplafond niet te onderscheiden van een groepsplafond
    //    dat toevallig lager staat.
    expect(
      alsMetFout(
        carol,
        `insert into storage.objects (bucket_id, name)
         values ('chatdocs', '${groepB}/${carol}/van-carol.pdf')`,
      ),
    ).toMatch(/^ok:/);
  });

  it('laat een lid geen object uit een andere emmer hierheen verhuizen', () => {
    // ⚠️⚠️ **Dit is de reden dat het UPDATE-recht weg is.** 📏 Met
    //    `chatdocs_update` erin gaf deze `update` één rij: een PNG uit
    //    `chatfotos` belandde als `.pdf` in `chatdocs`, en dan is
    //    `allowed_mime_types` niet meer de grendel maar de unie over alle
    //    emmers. Zonder UPDATE-policy op de doelemmer voldoet de nieuwe rij aan
    //    geen enkele `with check`.
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${groepA}/${bob}/verhuizer.jpg', '${bob}') on conflict do nothing`,
    );
    als(
      bob,
      `update storage.objects set bucket_id = 'chatdocs', name = '${groepA}/${bob}/verhuisd.pdf'
        where bucket_id = 'chatfotos' and name = '${groepA}/${bob}/verhuizer.jpg'`,
    );
    expect(
      psql(`select count(*) from storage.objects where name = '${groepA}/${bob}/verhuisd.pdf'`),
    ).toBe('0');
    psql(`delete from storage.objects where name like '${groepA}/${bob}/verhuiz%'`);
  });

  it('weigert een upsert op een pad dat je zelf verstuurd hebt', () => {
    // ⚠️⚠️ **De andere route die het UPDATE-recht opende.** `insert … on conflict
    //    do update` vuurt de BEFORE INSERT-trigger — die slaagt — en de
    //    verhuistrigger niet, dus er komt geen tel bij. Dat is
    //    `upload(..., { upsert: true })` als ongelimiteerde ingress.
    // ⚠️ De opstelling gaat met `psql` en niet met `als()`: die laatste rolt
    //    terug, en dan is er bij de tweede aanroep niets om mee te botsen — de
    //    `on conflict` wordt dan een gewone insert en de test staat groen op
    //    niets. Zelfde val en dezelfde opzet als in `chatfotobucket.test.ts`.
    const pad = `${groepA}/${bob}/upsert.pdf`;
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatdocs', '${pad}', '${bob}') on conflict do nothing`,
    );
    const tweede = alsMetFout(
      bob,
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatdocs', '${pad}', '${bob}')
       on conflict (bucket_id, name) do update set owner = excluded.owner`,
    );
    psql(`delete from storage.objects where name = '${pad}'`);
    psql(`delete from dagtellers where ${mijnTellers()}`);
    expect(tweede).toBe('42501');
  });

  it('telt een verhuizing naar een andere groepsmap mee', () => {
    // ⚠️ De les van 0233: zonder de naamtak op de verhuistrigger schuif je een
    //    object binnen dezelfde emmer naar een ándere groepsmap en telt het daar
    //    nergens mee — een gratis vijfde document.
    psql(`delete from storage.objects where bucket_id = 'chatdocs' and name like '${groepB}/%'`);
    psql(`delete from storage.objects where bucket_id = 'chatdocs' and name like '${groepA}/%'`);
    psql(`delete from dagtellers where ${mijnTellers()}`);
    for (let i = 0; i < 4; i += 1) {
      psql(
        `insert into storage.objects (bucket_id, name, owner)
         values ('chatdocs', '${groepB}/${uploaders[i]}/bezet-${i}.pdf', '${alice}')
         on conflict do nothing`,
      );
    }
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatdocs', '${groepA}/${alice}/verhuizer.pdf', '${alice}') on conflict do nothing`,
    );

    expect(() =>
      psql(
        `update storage.objects set name = '${groepB}/${alice}/verhuisd.pdf'
         where bucket_id = 'chatdocs' and name = '${groepA}/${alice}/verhuizer.pdf'`,
      ),
    ).toThrow(/23514/);
  });
});
