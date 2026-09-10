/**
 * De naad van QS8-72: **soort, extensie en emmer zijn één drieklank.**
 *
 * ⚠️⚠️ **Dit is de belofte en niet het onderdeel.** Elk stuk van deze feature is
 *    los correct: de emmer heeft zijn policies (0238), de remmen tellen (0239),
 *    `soortBijlage()` leidt de emmer af uit `type`, en `chatdocPad()` zet er een
 *    `.pdf` achter. De belofte gaat over wat er tússen zit: *`type` zegt tegen
 *    welke emmer de client tekent, en het pad staat in díe emmer.*
 *
 *    Lopen die twee uiteen, dan breekt er niets zichtbaars — je tekent tegen de
 *    verkeerde emmer, krijgt `null` terug, en de bubbel zegt "dit document is
 *    niet meer beschikbaar". Groen op elk onderdeel, kapot voor de gebruiker.
 *    Dat is precies vraag 1 uit regel 18: *waar knopen twee correcte onderdelen
 *    aan elkaar?*
 *
 * ⚠️⚠️ **De knoop wordt door de CHECK gelegd en niet door de app**, en dat is de
 *    reden dat deze suite tegen de database praat. `chat_messages_attachment_
 *    eigen_pad` (0240) paart `type = 'photo'` aan een beeldextensie en
 *    `type = 'doc'` aan `.pdf`. Zonder die paring is de app de enige die de
 *    twee gelijk houdt, en de app is niet wat een verzoek buiten de UI om
 *    tegenhoudt.
 *
 * ⚠️ De tweede helft van de naad — dat de tabel `attachment_name` teruggeeft aan
 *    het scherm dat hem toont — staat onderaan. Een kolom die de RPC niet
 *    doorgeeft, is een kolom die niemand ziet: dezelfde klasse als het
 *    schermloze `/doel/plan` van QS8-383, één laag lager.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { psql as psqlKaal, stackBeschikbaarOfFaal } from './psql-stack';

const psql = (sql: string) => psqlKaal(sql, { verbose: true });

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_constraint where conname = 'chat_messages_attachment_eigen_pad'",
  import.meta.url,
);

function mislukt(sql: string): string {
  try {
    psql(sql);
    return 'ok';
  } catch (fout) {
    const tekst = fout instanceof Error ? `${fout.message}` : String(fout);
    const code = /ERROR:\s+([0-9A-Z]{5}):/.exec(tekst);
    return code?.[1] ?? tekst;
  }
}

describe.runIf(beschikbaar)('een bijlage is wat zijn soort zegt (0240)', () => {
  const alice = randomUUID();
  let groep = '';

  const pad = (bestand: string) => `${groep}/${alice}/${bestand}`;

  /**
   * ⚠️ **Als tabeleigenaar en niet als `authenticated`, en dat is een gemeten
   *    reparatie uit de securityronde van 09-09-2026.** `chat_messages_insert`
   *    eist onder meer `type <> 'system'`; loopt een geval langs die policy, dan
   *    komt de CHECK er nooit aan te pas en is de test groen om een reden die
   *    niets met deze grendel te maken heeft — *"een ijking die zijn geval door
   *    een pad voert dat een éérdere grendel al afvangt"*. De eigenaar staat
   *    buiten RLS, en dan is de CHECK het enige wat er nog tussen zit.
   */
  const bericht = (soort: string, url: string | null, naam: string | null = null) =>
    `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url, attachment_name)
     values ('${groep}', '${alice}', 'kijk', '${soort}',
             ${url === null ? 'null' : `'${url}'`},
             ${naam === null ? 'null' : `'${naam}'`})`;

  beforeAll(() => {
    psql(
      `insert into auth.users (id, email) values ('${alice}', '${alice}@drieklank.local')
       on conflict (id) do nothing`,
    );
    psql(
      `insert into public.profiles (id, display_name) values ('${alice}', 'Alice')
       on conflict (id) do nothing`,
    );
    groep = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Drieklank', '${alice}', 'DK${alice.slice(0, 10).replace(/-/g, '')}') returning id`,
    );
    psql(
      `insert into public.group_members (group_id, user_id, role, status)
       values ('${groep}', '${alice}', 'member', 'active') on conflict do nothing`,
    );
  });

  afterAll(() => {
    psql(`delete from public.chat_messages where group_id = '${groep}'`);
    psql(`delete from public.group_members where group_id = '${groep}'`);
    psql(`delete from public.groups where id = '${groep}'`);
    psql(`delete from public.profiles where id = '${alice}'`);
    psql(`delete from auth.users where id = '${alice}'`);
  });

  // -------------------------------------------------------------------------
  // De drieklank
  // -------------------------------------------------------------------------

  it('laat een document met een .pdf-pad door', () => {
    expect(mislukt(bericht('doc', pad('a.pdf'), 'verslag.pdf'))).toBe('ok');
  });

  it('laat een foto met een beeldextensie door', () => {
    expect(mislukt(bericht('photo', pad('a.jpg')))).toBe('ok');
  });

  it.each([
    ['een document dat naar een beeldextensie wijst', 'doc', 'a.jpg'],
    ['een foto die naar een .pdf wijst', 'photo', 'a.pdf'],
    ['een document met een dubbele extensie', 'doc', 'a.pdf.exe'],
    ['een tekstbericht met een bijlage', 'text', 'a.pdf'],
  ])('weigert %s', (_naam, soort, bestand) => {
    // ⚠️⚠️ **De twee gekruiste gevallen zijn de kern van deze suite.** Zonder de
    //    paring zou een `doc`-rij naar `chatfotos` kunnen wijzen: de app tekent
    //    dan tegen `chatdocs`, krijgt niets, en de bubbel liegt.
    expect(mislukt(bericht(soort, pad(bestand), soort === 'doc' ? 'x.pdf' : null))).toBe('23514');
  });

  it('weigert een pad van een andere afzender', () => {
    expect(mislukt(bericht('doc', `${groep}/${randomUUID()}/a.pdf`, 'x.pdf'))).toBe('23514');
  });

  it('weigert een extern adres', () => {
    expect(mislukt(bericht('doc', 'https://volgmij.example/a.pdf', 'x.pdf'))).toBe('23514');
  });

  it('weigert een tweede pad achter een regeleinde', () => {
    // ⚠️ `$` in een Postgres-regex matcht ook vóór een afsluitende nieuwe regel
    //    niet, maar wél het einde van de string — een tweede URL erachter zou
    //    zonder deze ijking als "eindigt op .pdf" kunnen tellen.
    expect(mislukt(bericht('doc', `${pad('a.pdf')}\nhttps://kwaad.example/b.pdf`, 'x.pdf'))).toBe(
      '23514',
    );
  });

  // -------------------------------------------------------------------------
  // De naam
  // -------------------------------------------------------------------------

  it('eist een naam bij een document met een bijlage', () => {
    expect(mislukt(bericht('doc', pad('naamloos.pdf'), null))).toBe('23514');
  });

  it('laat een document zónder bijlage naamloos', () => {
    // ⚠️⚠️ **Dat is geen soepelheid maar de uitkomst van een botsing.** `type` is
    //    onveranderlijk (`stamp_chat_message()`), dus de AVG-opruiming van 0241
    //    kan een `doc` niet terugzetten op `text`. De naam-eis hangt daarom aan
    //    de bijlage: gaat de bijlage weg, dan gaat de naam mee en blijft er een
    //    `doc`-rij zonder bijlage over. Zie §3 van 0240.
    expect(mislukt(bericht('doc', null, null))).toBe('ok');
  });

  it('weigert een naam bij een foto', () => {
    expect(mislukt(bericht('photo', pad('b.jpg'), 'stiekem.pdf'))).toBe('23514');
  });

  it('weigert een naam zonder bijlage', () => {
    expect(mislukt(bericht('doc', null, 'zwevend.pdf'))).toBe('23514');
  });

  it.each([
    ['een padscheider', 'map/verslag.pdf'],
    ['een nieuwe regel', 'verslag\nregel.pdf'],
  ])('weigert een naam met %s', (_naam, waarde) => {
    expect(mislukt(bericht('doc', pad('c.pdf'), waarde))).toBe('23514');
  });

  it('weigert een naam met een bidi-teken', () => {
    // ⚠️⚠️ **Het geval waarvoor deze CHECK bestaat.** Met een RLO (U+202E) erin
    //    rendert `verslag<RLO>fdp.exe` als `verslagexe.pdf`, terwijl het pad
    //    `.pdf` zegt en de bytes iets anders zijn. Dat is een leugen die de app
    //    met het vertrouwen van de groep erachter vertelt.
    //
    //    ⚠️ Het teken komt uit `chr()` en staat niet letterlijk in dit bestand:
    //       een onzichtbaar stuurteken in een testbestand is precies het soort
    //       ding dat bij een volgende bewerking verdwijnt zonder dat iemand het
    //       ziet — en dan is het geval weg en de suite nog groen.
    expect(
      mislukt(
        `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url, attachment_name)
         values ('${groep}', '${alice}', 'kijk', 'doc', '${pad('d.pdf')}',
                 'verslag' || chr(8238) || 'fdp.exe')`,
      ),
    ).toBe('23514');
  });

  it.each([
    ['een ARABIC LETTER MARK (U+061C)', 1564],
    ['een zero-width space (U+200B)', 8203],
    ['een zero-width joiner (U+200D)', 8205],
    ['een line separator (U+2028)', 8232],
  ])('weigert een naam met %s', (_naam, punt) => {
    // ⚠️⚠️ **Deze vier stonden er tot 10-09-2026 niet in, en dat is een gemeten
    //    bevinding uit de securityronde.** Geen van vieren is een override, dus
    //    de spoofing hierboven bleef dicht; wat er fout aan was, is dat twee van
    //    de drie bidi-marks geweigerd werden (U+200E/200F) en U+061C niet. **Een
    //    willekeurige grens is er een die de volgende lezer verschuift.**
    expect(
      mislukt(
        `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url, attachment_name)
         values ('${groep}', '${alice}', 'kijk', 'doc', '${pad('i.pdf')}',
                 'verslag' || chr(${punt}) || '.pdf')`,
      ),
    ).toBe('23514');
  });

  it('laat een gewone naam met een emoji erin met rust', () => {
    // ⚠️ De must-allow naast de rij must-denies. Een klasse die te ver reikt, is
    //    groen op deze suite en weigert precies wat CLAUDE.md uitdrukkelijk
    //    toestaat: de gebruiker mag overal emoji typen.
    expect(
      mislukt(
        `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url, attachment_name)
         values ('${groep}', '${alice}', 'kijk', 'doc', '${pad('j.pdf')}',
                 'verslag ' || chr(128512) || '.pdf')`,
      ),
    ).toBe('ok');
  });

  it('telt de naamgrens in codepunten en niet in UTF-16-eenheden', () => {
    // ⚠️⚠️ **De grens is 120 codepunten, en dat is wat `char_length` telt.** Een
    //    client die in `.length` telt, laat door wat Postgres weigert: `.length`
    //    is altijd ≥ `char_length`. Vandaar dat `telTekens()` de enige teller in
    //    de app is. Zie `docs/decisions/2026-08-28-tekst-zonder-grens.md`.
    //
    //    Honderdtwintig emoji zijn 120 codepunten en 240 UTF-16-eenheden. Ze
    //    horen er dus dóór te gaan; een grens in UTF-16 zou ze weigeren.
    expect(
      mislukt(
        `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url, attachment_name)
         values ('${groep}', '${alice}', 'kijk', 'doc', '${pad('e.pdf')}',
                 repeat(chr(128512), 120))`,
      ),
    ).toBe('ok');

    expect(
      mislukt(
        `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url, attachment_name)
         values ('${groep}', '${alice}', 'kijk', 'doc', '${pad('f.pdf')}',
                 repeat(chr(128512), 121))`,
      ),
    ).toBe('23514');
  });

  // -------------------------------------------------------------------------
  // De kolom komt ook echt bij het scherm
  // -------------------------------------------------------------------------

  it('geeft groepschat() de naam mee terug', () => {
    // ⚠️ Een kolom die de RPC niet doorgeeft, is een kolom die niemand ziet. 0240
    //    moest `groepschat()` daarvoor droppen en opnieuw maken — `or replace`
    //    kan een returntype niet wijzigen — en dan is "staat hij er nog in" een
    //    vraag die je meet en niet aanneemt.
    psql(
      `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url, attachment_name)
       values ('${groep}', '${alice}', 'met naam', 'doc', '${pad('g.pdf')}', 'jaarplan.pdf')`,
    );
    expect(
      psql(
        `select attachment_name from groepschat('${groep}') where attachment_url = '${pad('g.pdf')}'`,
      ),
    ).toBe('jaarplan.pdf');
  });

  // -------------------------------------------------------------------------
  // De AVG-opruiming raakt béide emmers (0241)
  // -------------------------------------------------------------------------

  it('haalt bij een vertrekker de naam mee weg, niet alleen het pad', () => {
    // ⚠️⚠️ **De naam is zelf een persoonsgegeven.** `jaarrekening-jansen.pdf`
    //    zegt genoeg zonder dat er een byte van het bestand over is. 0241 zet
    //    daarom `attachment_url` én `attachment_name` op `null`; blijft de naam
    //    staan, dan is de opruiming half af en niets wordt er rood van.
    const vertrekker = randomUUID();
    psql(
      `insert into auth.users (id, email) values ('${vertrekker}', '${vertrekker}@weg.local')
       on conflict (id) do nothing`,
    );
    psql(
      `insert into public.profiles (id, display_name) values ('${vertrekker}', 'Vertrekker')
       on conflict (id) do nothing`,
    );
    psql(
      `insert into public.group_members (group_id, user_id, role, status)
       values ('${groep}', '${vertrekker}', 'member', 'active') on conflict do nothing`,
    );

    const doelpad = `${groep}/${vertrekker}/h.pdf`;
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatdocs', '${doelpad}', '${vertrekker}') on conflict do nothing`,
    );
    const berichtId = psql(
      `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url, attachment_name)
       values ('${groep}', '${vertrekker}', 'met tekst erbij', 'doc', '${doelpad}', 'geheim.pdf')
       returning id`,
    );

    psql(`delete from public.profiles where id = '${vertrekker}'`);

    expect(
      psql(
        `select coalesce(attachment_url, '-') || '/' || coalesce(attachment_name, '-')
         from public.chat_messages where id = '${berichtId}'`,
      ),
    ).toBe('-/-');
    expect(
      psql(`select count(*) from storage.objects where bucket_id = 'chatdocs' and name = '${doelpad}'`),
    ).toBe('0');

    psql(`delete from public.chat_messages where id = '${berichtId}'`);
    psql(`delete from auth.users where id = '${vertrekker}'`);
  });
});
