/**
 * De bewaartermijn van een chatfoto — migratie 0232 (QS8-396, deel 2 van QS8-394).
 *
 * ⚠️⚠️ **De belofte is niet "er staat een functie". Die is: wat de server niet
 *    meer nodig heeft, staat er niet meer.** Het WhatsApp-model dat Quinten op
 *    09-09-2026 koos, is niet "geen server" — WhatsApp uploadt óók, en gooit weg
 *    zodra het afgeleverd is. Wat wij daarvan kopiëren zonder sleutelbeheer is de
 *    tweede helft. Wat er niet meer staat, kan niet lekken.
 *
 * ⚠️⚠️ **Deze suite toetst de RPC en níet de opruiming.** `verlopen_chatfotos()`
 *    geeft paden terug en wist niets, en dat is geen halve maatregel maar de
 *    enige die werkt: een `delete from storage.objects` haalt de **metadata-rij**
 *    weg en laat het bestand op de opslag staan (bevinding QS8-71, 0224). Alleen
 *    `storage.remove()` haalt allebei weg, en die kant leeft in de
 *    rollover-functie. Wat hier bewaakt wordt is dus: **wíjst de database het
 *    goede aan** — en, minstens zo belangrijk, wijst hij niets aan wat nog nodig
 *    is.
 *
 * ⚠️ Zonder draaiende stack wordt deze suite overgeslagen, en dat is *ongemeten*
 *    en niet groen. `npm run poort` houdt dat onderscheid vast.
 *
 * 📏 **De ijking — één mutatie per grendel, allemaal op 09-09-2026 rood gezien.**
 *
 *    | Mutatie | Wat er brak | Welk geval rood werd |
 *    |---|---|---|
 *    | F | `o.created_at < now() - interval '1 hour'` uit de weestak | "laat een verse wees met rust" |
 *    | G | de termijntak weg — alleen wezen | "wijst een foto aan die de termijn voorbij is, mét bericht en al" |
 *    | H | de weestak weg — alleen de termijn | "wijst een wees aan die het respijtuur voorbij is" |
 *    | I | de `limit` weg | "houdt zich aan het limiet dat je meegeeft" |
 *    | J | `grant execute on verlopen_chatfotos to authenticated` | "houdt verlopen_chatfotos weg bij een ingelogde gebruiker" |
 *    | K | `snoei_chatfoto_teller()` zonder venster — wist alles | "snoeit tellerrijen die het venster uit zijn en laat de verse staan" |
 *    | L | `wis_chatfotos_van_vertrekker()` terug naar 0224, dus mét de `delete from storage.objects` | "laat de foto van een verwijderd account als wees staan in plaats van als blob" |
 *    | M | `chatfoto_bewaartermijn()` op 30 dagen terwijl de app 21 zegt | "noemt in de app dezelfde termijn als de database aanhoudt" |
 *
 *    ⚠️ **G en H zijn twee mutaties en geen een.** De RPC heeft twee redenen, en
 *       een ijking die er één weghaalt terwijl de ander het geval ook vindt, ijkt
 *       niets. Dat de reden mee terugkomt (`verlopen` / `wees`) is precies waarom
 *       ze los te betrappen zijn.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHATFOTO_BEWAARDAGEN } from '@/shared/bewaartermijn';

import { psql as psqlKaal, stackBeschikbaarOfFaal } from './psql-stack';

const psql = (sql: string) => psqlKaal(sql, { verbose: true });

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'verlopen_chatfotos'",
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

function alsMetFout(userId: string, sql: string): string {
  try {
    return `ok:${als(userId, sql)}`;
  } catch (fout) {
    const tekst = fout instanceof Error ? `${fout.message}` : String(fout);
    const code = /ERROR:\s+([0-9A-Z]{5}):/.exec(tekst);
    return code === null ? tekst : (code[1] ?? tekst);
  }
}

describe.runIf(beschikbaar)('de bewaartermijn van een chatfoto (0232)', () => {
  const alice = randomUUID();
  let groep = '';

  /** Het pad van een foto, met de vorm die `chatfotos_insert` en 0223 eisen. */
  const pad = (naam: string) => `${groep}/${alice}/${naam}.jpg`;

  /**
   * Zet één object neer, desgewenst met bericht en met een eigen leeftijd.
   *
   * ⚠️ `created_at` wordt met een `update` gezet en niet in de `insert`: de kolom
   *    heeft een default en `storage.objects` is niet van ons — een kolomnaam die
   *    Supabase morgen anders invult, moet hier omvallen en niet stil de
   *    verkeerde leeftijd zetten.
   */
  function objectMet(naam: string, opties: { uren: number; bericht: boolean }) {
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${pad(naam)}', '${alice}') on conflict do nothing`,
    );
    psql(
      `update storage.objects set created_at = now() - interval '${opties.uren} hours'
       where bucket_id = 'chatfotos' and name = '${pad(naam)}'`,
    );
    if (opties.bericht) {
      psql(
        `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url)
         values ('${groep}', '${alice}', 'kijk', 'photo', '${pad(naam)}')`,
      );
    }
  }

  /**
   * Wat de RPC aanwijst, beperkt tot deze groep.
   *
   * ⚠️ **Het filter is geen netheid.** `verlopen_chatfotos()` kijkt over de hele
   *    bucket, en er draaien meer suites tegen dezelfde stack (QS8-336). Een
   *    bewering over "alle rijen" is dan een bewering over andermans opstelling.
   */
  function aangewezen(): string[] {
    const uit = psql(
      `select pad || ' ' || reden from public.verlopen_chatfotos(500)
       where pad like '${groep}/%' order by pad`,
    );
    return uit.split('\n').map((r) => r.trim()).filter((r) => r !== '');
  }

  beforeAll(() => {
    psql(
      `insert into auth.users (id, email) values ('${alice}', '${alice}@bewaartermijn.local')
       on conflict (id) do nothing`,
    );
    psql(
      `insert into public.profiles (id, display_name) values ('${alice}', 'Alice')
       on conflict (id) do nothing`,
    );
    groep = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Bewaartermijn', '${alice}', 'BW${alice.slice(0, 10).replace(/-/g, '')}') returning id`,
    );
    psql(
      `insert into public.group_members (group_id, user_id, role, status)
       values ('${groep}', '${alice}', 'admin', 'active') on conflict do nothing`,
    );
  });

  afterAll(() => {
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groep}/%'`);
    psql(`delete from public.chatfoto_uploads where group_id = '${groep}'`);
    psql(`delete from public.chat_messages where group_id = '${groep}'`);
    psql(`delete from public.group_members where group_id = '${groep}'`);
    psql(`delete from public.groups where id = '${groep}'`);
    psql(`delete from public.profiles where id = '${alice}'`);
    psql(`delete from auth.users where id = '${alice}'`);
  });

  // -------------------------------------------------------------------------
  // De termijn zelf
  // -------------------------------------------------------------------------

  it('bewaart eenentwintig dagen', () => {
    // ⚠️ Het besluit van Quinten op 09-09-2026, op één plek. Een tweede getal in
    //    de meldingstekst of in de opruimpas is een tweede belofte.
    expect(psql('select public.chatfoto_bewaartermijn()')).toBe('21 days');
  });

  it('noemt in de app dezelfde termijn als de database aanhoudt', () => {
    // ⚠️⚠️ **De naad, en niet een van de twee onderdelen.** `CHATFOTO_BEWAARDAGEN`
    //    staat in de zin die de gebruiker ziét waar zijn foto stónd;
    //    `chatfoto_bewaartermijn()` bepaalt wat de opruimpas dóet. Allebei kunnen
    //    op zichzelf kloppen terwijl het scherm 30 belooft en de server na 21
    //    dagen wist — en dan is er geen enkele test die rood wordt. Dit is de
    //    eerste van de zes vragen bij onwrikbare regel 18: waar knopen twee
    //    correcte onderdelen aan elkaar.
    //
    // ⚠️ De vergelijking gaat via de database en niet via een tweede letterlijke
    //    `21` in deze test: dan zou dit geval alleen zeggen dat ik hier hetzelfde
    //    getal heb overgetypt.
    const uitDb = psql(
      `select extract(day from public.chatfoto_bewaartermijn())::integer`,
    );
    expect(uitDb).toBe(String(CHATFOTO_BEWAARDAGEN));
  });

  // -------------------------------------------------------------------------
  // Wat er weg mag
  // -------------------------------------------------------------------------

  it('wijst een foto aan die de termijn voorbij is, mét bericht en al', () => {
    // ⚠️⚠️ **Mét bericht, en dat is het geval dat de bewaartermijn ís.** Een pas
    //    die alleen wezen opruimt, is een lekreparatie en geen bewaartermijn: dan
    //    blijft elke verstuurde foto eeuwig staan en is er niets gekozen.
    objectMet('oud-met-bericht', { uren: 22 * 24, bericht: true });
    expect(aangewezen()).toEqual([`${pad('oud-met-bericht')} verlopen`]);
  });

  it('wijst een wees aan die het respijtuur voorbij is', () => {
    // De upload die slaagde terwijl de `insert` sneuvelde, of het bericht dat
    // gewist is voordat het bestand weg was. Allebei uit de doorlichting van
    // 09-09-2026 en allebei gereproduceerd.
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groep}/%'`);
    objectMet('wees', { uren: 3, bericht: false });
    expect(aangewezen()).toEqual([`${pad('wees')} wees`]);
  });

  // -------------------------------------------------------------------------
  // Wat er níet weg mag — de helft die de pas bruikbaar maakt
  // -------------------------------------------------------------------------

  it('laat een verse wees met rust', () => {
    // ⚠️⚠️ **Het respijtuur is dragend en geen marge.** Tussen de upload en de
    //    `insert` van het bericht heeft élke foto even geen berichtrij. Zonder dit
    //    uur wist de pas de foto die op dít moment verstuurd wordt — en dan is de
    //    opruiming zelf de bug.
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groep}/%'`);
    objectMet('net-geupload', { uren: 0, bericht: false });
    expect(aangewezen()).toEqual([]);
  });

  it('laat een verstuurde foto binnen de termijn met rust', () => {
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groep}/%'`);
    psql(`delete from public.chat_messages where group_id = '${groep}'`);
    objectMet('gisteren', { uren: 30, bericht: true });
    expect(aangewezen()).toEqual([]);
  });

  it('laat een foto op de dag vóór de grens met rust en pakt hem daarna wél', () => {
    // ⚠️ De rand zelf, en van twee kanten. Een pas die op `>=` in plaats van `>`
    //    staat is met één geval niet te betrappen; met deze twee wel.
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groep}/%'`);
    psql(`delete from public.chat_messages where group_id = '${groep}'`);
    objectMet('rand', { uren: 20 * 24 + 23, bericht: true });
    const voor = aangewezen();
    psql(
      `update storage.objects set created_at = now() - interval '21 days 1 hour'
       where bucket_id = 'chatfotos' and name = '${pad('rand')}'`,
    );
    const na = aangewezen();
    expect([voor, na]).toEqual([[], [`${pad('rand')} verlopen`]]);
  });

  it('houdt zich aan het limiet dat je meegeeft', () => {
    // ⚠️ Onwrikbare regel 10 in de vorm die hier telt: de pas draait op een job
    //    zonder scherm, en een ongelimiteerde lijst is daar een verzoek dat
    //    omvalt op de dag dat het uitmaakt.
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groep}/%'`);
    psql(`delete from public.chat_messages where group_id = '${groep}'`);
    for (let i = 0; i < 3; i += 1) objectMet(`veel-${i}`, { uren: 25 * 24 + i, bericht: false });

    const uit = psql(
      `select count(*) from public.verlopen_chatfotos(2) where pad like '${groep}/%'`,
    );
    expect(uit).toBe('2');
  });

  // -------------------------------------------------------------------------
  // De vertrekker — 0224 gerepareerd in §4 van 0232
  // -------------------------------------------------------------------------

  it('laat de foto van een verwijderd account als wees staan in plaats van als blob', () => {
    // ⚠️⚠️ **Dit geval bestond niet, en de trigger van 0224 deed precies het ene
    //    dat de opruimpas onmogelijk maakt: hij wiste de metadata-rij.** De blob
    //    bleef staan en was daarna door géén enkele SQL-pas nog te vinden — er
    //    wijst dan niets meer naar dat pad. Onleesbaar is niet hetzelfde als weg.
    //
    //    De bewering is daarom drieledig, en de eerste helft is de must-allow:
    //    de rij staat er nog (anders is er niets op te ruimen), hij is niet
    //    leesbaar, en de pas wijst hem aan.
    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name like '${groep}/%'`);
    psql(`delete from public.chat_messages where group_id = '${groep}'`);

    const weg = randomUUID();
    psql(
      `insert into auth.users (id, email) values ('${weg}', '${weg}@weg.local')
       on conflict (id) do nothing`,
    );
    psql(
      `insert into public.profiles (id, display_name) values ('${weg}', 'Vertrekker')
       on conflict (id) do nothing`,
    );
    psql(
      `insert into public.group_members (group_id, user_id, role, status)
       values ('${groep}', '${weg}', 'member', 'active') on conflict do nothing`,
    );

    const zijnPad = `${groep}/${weg}/afscheid.jpg`;
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatfotos', '${zijnPad}', '${weg}') on conflict do nothing`,
    );
    psql(
      `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url)
       values ('${groep}', '${weg}', '', 'photo', '${zijnPad}')`,
    );
    // ⚠️ Het respijtuur geldt ook voor deze wees — de pas mag hem pas een uur
    //    later aanwijzen, en anders toetst dit geval het respijtuur en niet de
    //    trigger.
    psql(
      `update storage.objects set created_at = now() - interval '3 hours'
       where bucket_id = 'chatfotos' and name = '${zijnPad}'`,
    );

    psql(`delete from public.profiles where id = '${weg}'`);

    const rijStaatEr = psql(
      `select count(*) from storage.objects where bucket_id = 'chatfotos' and name = '${zijnPad}'`,
    );
    const leesbaar = als(alice, `select count(*) from storage.objects where name = '${zijnPad}'`);
    const paden = aangewezen();

    psql(`delete from storage.objects where bucket_id = 'chatfotos' and name = '${zijnPad}'`);
    psql(`delete from auth.users where id = '${weg}'`);

    expect([rijStaatEr, leesbaar, paden]).toEqual(['1', '0', [`${zijnPad} wees`]]);
  });

  // -------------------------------------------------------------------------
  // De teller snoeien
  // -------------------------------------------------------------------------

  it('snoeit tellerrijen die het venster uit zijn en laat de verse staan', () => {
    psql(`delete from public.chatfoto_uploads where group_id = '${groep}'`);
    psql(
      `insert into public.chatfoto_uploads (group_id, uploader, created_at) values
         ('${groep}', '${alice}', now() - interval '3 days'),
         ('${groep}', '${alice}', now() - interval '5 hours')`,
    );
    psql('select public.snoei_chatfoto_teller()');
    // ⚠️ De must-allow in dezelfde test: een snoei die álles wist, zet elk
    //    dagplafond terug op nul en is dan de ratel van §2 kwijt.
    expect(psql(`select count(*) from public.chatfoto_uploads where group_id = '${groep}'`)).toBe('1');
  });

  // -------------------------------------------------------------------------
  // De rechten
  // -------------------------------------------------------------------------

  it.each([
    ['verlopen_chatfotos', 'select * from public.verlopen_chatfotos(1)'],
    ['chatfoto_bewaartermijn', 'select public.chatfoto_bewaartermijn()'],
    ['snoei_chatfoto_teller', 'select public.snoei_chatfoto_teller()'],
  ])('houdt %s weg bij een ingelogde gebruiker', (_naam, sql) => {
    // ⚠️ Onwrikbare regel 4: `revoke ... from public, anon` houdt precies de rol
    //    over waaronder iedere ingelogde gebruiker draait. Dit zijn `security
    //    definer`-functies die over de héle bucket kijken — `verlopen_chatfotos()`
    //    somt paden op van groepen waar je niet in zit.
    expect(alsMetFout(alice, sql)).toBe('42501');
  });
});
