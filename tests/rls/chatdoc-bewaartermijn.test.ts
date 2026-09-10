/**
 * De bewaartermijn van een gedeeld document — migratie 0250 (QS8-408).
 *
 * ⚠️⚠️ **De belofte is niet "er staat een functie". Die is: een document dat de
 *    server niet meer nodig heeft, staat er niet meer — en zolang het er nog
 *    staat, ziet niemand het.** Dat tweede is wat deze suite van de fotokant
 *    onderscheidt: bij de chatfoto was de leesgrens al berichtgebonden, bij het
 *    document is dat de wijziging die de opruimweg überhaupt mogelijk maakte.
 *
 * ⚠️⚠️ **Deze suite toetst de RPC en níet de opruiming.** `verlopen_chatdocs()`
 *    geeft paden terug en wist niets, en dat is geen halve maatregel maar de
 *    enige die werkt: een `delete from storage.objects` haalt de **metadata-rij**
 *    weg en laat het bestand op de opslag staan (bevinding QS8-71, 0224). Alleen
 *    `storage.remove()` haalt allebei weg, en die kant leeft in de rollover. Wat
 *    hier bewaakt wordt is dus: **wijst de database het goede aan** — en,
 *    minstens zo belangrijk, wijst hij niets aan wat nog nodig is.
 *
 * ⚠️ Zonder draaiende stack wordt deze suite overgeslagen, en dat is *ongemeten*
 *    en niet groen. `npm run poort` houdt dat onderscheid vast.
 *
 * 📏 **De ijking — één mutatie per grendel, allemaal op 10-09-2026 rood gezien.**
 *
 *    | Mutatie | Wat er brak | Welk geval rood werd |
 *    |---|---|---|
 *    | A | `o.created_at < now() - interval '1 hour'` uit de weestak | "laat een verse wees met rust" |
 *    | B | de termijntak weg — alleen wezen | "wijst een document aan dat de termijn voorbij is, mét bericht en al" |
 *    | C | de weestak weg — alleen de termijn | "wijst een wees aan die het respijtuur voorbij is" |
 *    | D | de `limit` weg | "houdt zich aan het limiet dat je meegeeft" |
 *    | E | `grant execute on verlopen_chatdocs to authenticated` | "houdt verlopen_chatdocs weg bij een ingelogde gebruiker" |
 *    | F | `chatdoc_bewaartermijn()` op 30 dagen terwijl de app 21 zegt | "noemt in de app dezelfde termijn als de database aanhoudt" |
 *
 *    ⚠️ **B en C zijn twee mutaties en geen een.** De RPC heeft twee redenen, en
 *       een ijking die er één weghaalt terwijl de ander het geval ook vindt, ijkt
 *       niets. Dat de reden mee terugkomt (`verlopen` / `wees`) is precies waarom
 *       ze los te betrappen zijn. Zelfde opzet als bij de chatfoto.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHATDOC_BEWAARDAGEN, CHATFOTO_BEWAARDAGEN } from '@/shared/bewaartermijn';

import { psql as psqlKaal, stackBeschikbaarOfFaal } from './psql-stack';

const psql = (sql: string) => psqlKaal(sql, { verbose: true });

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'verlopen_chatdocs'",
  import.meta.url,
);

function alsMetFout(userId: string, sql: string): string {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' }).replace(/'/g, "''");
  try {
    const uitvoer = psql(
      `begin;
       select set_config('request.jwt.claims', '${claims}', true);
       set local role authenticated;
       ${sql};
       rollback;`,
    );
    return `ok:${uitvoer.split('\n').slice(1).join('\n').trim()}`;
  } catch (fout) {
    const tekst = fout instanceof Error ? `${fout.message}` : String(fout);
    const code = /ERROR:\s+([0-9A-Z]{5}):/.exec(tekst);
    return code === null ? tekst : (code[1] ?? tekst);
  }
}

describe.runIf(beschikbaar)('de bewaartermijn van een document (0250)', () => {
  const alice = randomUUID();
  let groep = '';

  const pad = (bestand: string) => `${groep}/${alice}/${bestand}`;

  /** Zet een object neer en maak de dagteller weer leeg — die telt hier niet mee. */
  function object(bestand: string, ouderdom: string) {
    psql(
      `insert into storage.objects (bucket_id, name, owner)
       values ('chatdocs', '${pad(bestand)}', '${alice}') on conflict do nothing`,
    );
    psql(
      `update storage.objects set created_at = now() - interval '${ouderdom}'
        where bucket_id = 'chatdocs' and name = '${pad(bestand)}'`,
    );
    // ⚠️ Sinds 0233 overleeft `dagtellers` een delete op `storage.objects` met
    //    opzet. Deze suite gaat over de pas en niet over het plafond; laat je de
    //    tellerrijen staan, dan lopen de latere gevallen op 23514 in plaats van
    //    op de bewering die ze doen.
    psql(`delete from dagtellers where domein = 'chatdocs'`);
  }

  function bericht(bestand: string) {
    psql(
      `insert into public.chat_messages (group_id, sender_id, body, type, attachment_url, attachment_name)
       values ('${groep}', '${alice}', 'kijk', 'doc', '${pad(bestand)}', '${bestand}')`,
    );
  }

  const pas = (bestand: string) =>
    psql(`select reden from verlopen_chatdocs(500) where pad = '${pad(bestand)}'`);

  beforeAll(() => {
    psql(
      `insert into auth.users (id, email) values ('${alice}', '${alice}@docbewaar.local')
       on conflict (id) do nothing`,
    );
    psql(
      `insert into public.profiles (id, display_name) values ('${alice}', 'Alice')
       on conflict (id) do nothing`,
    );
    groep = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Docbewaartermijn', '${alice}', 'DW${alice.slice(0, 10).replace(/-/g, '')}')
       returning id`,
    );
    psql(
      `insert into public.group_members (group_id, user_id, role, status)
       values ('${groep}', '${alice}', 'member', 'active') on conflict do nothing`,
    );
  });

  afterAll(() => {
    psql(`delete from storage.objects where bucket_id = 'chatdocs' and name like '${groep}/%'`);
    psql(`delete from dagtellers where domein = 'chatdocs'`);
    psql(`delete from public.chat_messages where group_id = '${groep}'`);
    psql(`delete from public.group_members where group_id = '${groep}'`);
    psql(`delete from public.groups where id = '${groep}'`);
    psql(`delete from public.profiles where id = '${alice}'`);
    psql(`delete from auth.users where id = '${alice}'`);
  });

  // -------------------------------------------------------------------------
  // De termijn zelf
  // -------------------------------------------------------------------------

  it('staat op eenentwintig dagen', () => {
    expect(psql('select public.chatdoc_bewaartermijn()')).toBe('21 days');
  });

  it('noemt in de app dezelfde termijn als de database aanhoudt', () => {
    // ⚠️⚠️ **De naad, en niet een van de twee onderdelen.** `CHATDOC_BEWAARDAGEN`
    //    staat in de zin die de gebruiker vóór het versturen leest en in de zin
    //    die er straks staat waar het document stónd. Lopen die twee uiteen met
    //    wat de pas aanhoudt, dan belooft het scherm een termijn die de server
    //    niet nakomt — allebei de onderdelen kloppen en het geheel liegt.
    expect(psql("select extract(day from public.chatdoc_bewaartermijn())::int")).toBe(
      String(CHATDOC_BEWAARDAGEN),
    );
  });

  it('is vandaag gelijk aan die van de chatfoto, en dat is een keuze', () => {
    // ⚠️⚠️ **Deze test legt geen regel vast maar een sámenval.** De twee termijnen
    //    zijn twee productkeuzes over twee soorten inhoud, allebei een besluit
    //    van Quinten — de foto op 09-09, het document op 10-09 (0250 §2). Dat ze
    //    vandaag hetzelfde getal dragen, maakt er geen één keuze van.
    //
    //    Wordt dit geval ooit rood, dan is dat **geen defect**: het betekent dat
    //    iemand er één veranderd heeft, en dan hoort dit geval mee te veranderen
    //    — met de reden erbij. Wat het voorkomt is dat ze uit elkaar lopen zonder
    //    dat iemand het besloten heeft.
    expect(CHATDOC_BEWAARDAGEN).toBe(CHATFOTO_BEWAARDAGEN);
    expect(psql('select public.chatdoc_bewaartermijn() = public.chatfoto_bewaartermijn()')).toBe(
      't',
    );
  });

  // -------------------------------------------------------------------------
  // Wat de pas aanwijst
  // -------------------------------------------------------------------------

  it('laat een vers document met een bericht met rust', () => {
    object('vers.pdf', '1 minute');
    bericht('vers.pdf');
    expect(pas('vers.pdf')).toBe('');
  });

  it('laat een verse wees met rust', () => {
    // ⚠️⚠️ **Het respijtuur is dragend en geen marge.** Een upload die net
    //    geslaagd is heeft nog geen berichtrij — dat venster is de hele reden dat
    //    wezen bestaan. Zou de pas die meteen meenemen, dan wist hij het document
    //    dat op ditzelfde moment verstuurd wordt.
    object('verse-wees.pdf', '5 minutes');
    expect(pas('verse-wees.pdf')).toBe('');
  });

  it('wijst een wees aan die het respijtuur voorbij is', () => {
    object('oude-wees.pdf', '2 hours');
    expect(pas('oude-wees.pdf')).toBe('wees');
  });

  it('wijst een document aan dat de termijn voorbij is, mét bericht en al', () => {
    // ⚠️ Mét bericht, want anders vindt de weestak hem ook en toetst dit geval
    //    niet wat het belooft. Dat de reden meekomt, maakt dat verschil zichtbaar.
    object('oud.pdf', '22 days');
    bericht('oud.pdf');
    expect(pas('oud.pdf')).toBe('verlopen');
  });

  it('laat een document van twintig dagen met een bericht met rust', () => {
    // ⚠️ De must-allow naast de must-deny. Een pas die álles aanwijst, is groen op
    //    deze suite en wist het gesprek van de gebruiker.
    object('bijna.pdf', '20 days');
    bericht('bijna.pdf');
    expect(pas('bijna.pdf')).toBe('');
  });

  it('houdt zich aan het limiet dat je meegeeft', () => {
    // ⚠️⚠️ **Eerst twee kandidaten, en dat is een reparatie van deze test zelf.**
    //    📏 De eerste vorm vroeg alleen of het er hooguit één waren, en bleef
    //    groen toen de `limit` met de hand op 500 gezet werd — er waren op dat
    //    moment simpelweg niet meer dan één kandidaat, dus de bewering kón niet
    //    breken. Precies vraag 3 van onwrikbare regel 18: een test die groen
    //    blijft terwijl de belofte breekt, bewaakt niets.
    object('limiet-a.pdf', '3 hours');
    object('limiet-b.pdf', '4 hours');
    expect(Number(psql('select count(*) from verlopen_chatdocs(500)'))).toBeGreaterThanOrEqual(2);
    expect(Number(psql('select count(*) from verlopen_chatdocs(1)'))).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Wie hem mag aanroepen
  // -------------------------------------------------------------------------

  it('houdt verlopen_chatdocs weg bij een ingelogde gebruiker', () => {
    // ⚠️ Onwrikbare regel 4: de `revoke` noemt `authenticated` met zoveel
    //    woorden. Alleen de rollover roept dit aan, en die draait als
    //    `service_role`.
    expect(alsMetFout(alice, 'select * from verlopen_chatdocs(10)')).toBe('42501');
  });

  it('houdt chatdoc_bewaartermijn weg bij een ingelogde gebruiker', () => {
    expect(alsMetFout(alice, 'select public.chatdoc_bewaartermijn()')).toBe('42501');
  });
});
