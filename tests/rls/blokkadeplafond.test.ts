import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql } from './psql-stack';

/**
 * Het dagplafond op blokkades — QS8-496, migratie 0273.
 *
 * ⚠️⚠️ **De must-allow weegt hier zwaarder dan de weigering, en dat is geen
 *    stijlkeuze maar de hele opdracht van het issue.** 0203 liet `user_blocks`
 *    met zoveel woorden zonder plafond, omdat *"een rem op blokkeren iemand in
 *    de weg zit die misbruik ontvlucht"*. Dit plafond mag dat niet omdraaien.
 *
 *    Daarom staat de toets die het zwaarst weegt hieronder als eerste: iemand
 *    die een hele groep blokkeert komt er ongehinderd doorheen. Een toets die
 *    alleen de weigering vastlegt, zou groen blijven bij een plafond van vijf —
 *    en dat is precies de fout die dit issue niet mag maken.
 */

const TEST_TIMEOUT = 60_000;

/** Het getal uit `blokkades_plafond()`; de toets leest het niet uit, hij pint het. */
const PLAFOND = 500;

/**
 * Zet `hoeveel` profielen neer om te blokkeren.
 *
 * ⚠️ Via `psql()` en niet via de harness: dit zijn rijen en geen sessies. Er is
 *    geen JWT voor nodig — ze worden geblokkeerd, niet gebruikt om mee in te
 *    loggen — en vijfhonderd keer `createTestUser()` kost een veelvoud.
 */
const PREFIX = 'blokkadeplafond-';

function maakProfielen(hoeveel: number): string[] {
  const uit = psql(`
    with nieuw as (select gen_random_uuid() as id, i from generate_series(1, ${hoeveel}) i),
    u as (insert into auth.users (id, email) select n.id, '${PREFIX}' || n.i || '@blok.local' from nieuw n returning id),
    p as (insert into profiles (id, display_name) select n.id, '${PREFIX}' || lpad(n.i::text, 4, '0') from nieuw n returning id)
    select n.id from nieuw n order by n.i;
  `);
  return uit.split('\n').map((r) => r.trim()).filter((r) => /^[0-9a-f-]{36}$/.test(r));
}

function ruimProfielenOp(): void {
  psql(`delete from auth.users where email like '${PREFIX}%@blok.local'`);
}

describe.skipIf(!rlsTestsConfigured)('het dagplafond op blokkades', () => {
  let vluchter: TestUser;

  beforeAll(async () => {
    vluchter = await createTestUser('blokkade-vluchter');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    ruimProfielenOp();
    await removeTestUsers();
  }, TEST_TIMEOUT);

  /** Blokkeer via de gewone weg — de RPC die de app ook gebruikt. */
  async function blokkeer(wie: TestUser, id: string): Promise<{ ok?: boolean; reason?: string }> {
    const { data, error } = await wie.db.rpc('blokkeer', { p_user: id });
    if (error) throw new Error(`blokkeer: ${error.message}`);
    return (data ?? {}) as { ok?: boolean; reason?: string };
  }

  describe('wie misbruik ontvlucht, merkt er niets van', () => {
    it(
      'laat een hele groep blokkeren zonder één weigering',
      async () => {
        /**
         * ⚠️⚠️ **Dit is de toets die het zwaarst weegt.** 📏 Het zwaarste échte
         *    geval is een afgedwongen bovengrens en geen schatting (0016): een
         *    groep is vol bij twaalf en je zit in hoogstens tien groepen, dus
         *    via groepen ken je er hoogstens 110. Deze toets neemt er 48 —
         *    ruim boven één volle groep, en genoeg om een te krap plafond te
         *    laten omvallen zonder vijfhonderd sessies op te zetten.
         *
         * 📏 IJKING A — `blokkades_plafond()` op `select 20` gezet: deze toets
         *    werd rood bij de eenentwintigste blokkade. Met 500 komen alle
         *    achtenveertig er doorheen.
         */
        const ids = maakProfielen(48);
        expect(ids, 'de opstelling zelf mislukte').toHaveLength(48);

        for (const [n, id] of ids.entries()) {
          const uit = await blokkeer(vluchter, id);
          expect(uit.ok, `blokkade ${n + 1} van 48 werd geweigerd`).toBe(true);
        }

        const geteld = await adminDb()
          .from('user_blocks')
          .select('blocked_id')
          .eq('blocker_id', vluchter.id);
        expect((geteld.data ?? []).length, 'alle achtenveertig staan er').toBe(48);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat dezelfde persoon opnieuw blokkeren zonder quotum te kosten',
      async () => {
        /**
         * ⚠️⚠️ **`blokkeer()` doet `on conflict do nothing`, dus dit voegt nul
         *    rijen toe — en dan hoort het geen quotum te kosten.** Een app die
         *    bij elke start opnieuw blokkeert, zou iemand anders blijvend
         *    vastzetten op een fout die hij zelf niet kan opheffen. Dat is
         *    woordelijk de must-allow die 0214 voor pushtokens beschrijft.
         *
         * ⚠️⚠️ **Wat deze belofte draagt is níet de lege-batchtak, en dat is met
         *    de hand nagemeten en niet aangenomen.** 📏 IJKING B is twee keer
         *    gedraaid en beet geen van beide keren: niet met
         *    `if v_batch = 0 …` uit `begrens_blokkades()` weg, en ook niet met
         *    `if p_erbij <= 0 …` uit `tel_dagteller()` zelf weg.
         *
         *    De reden is rekenkundig en niet een grendel: bij nul toegevoegde
         *    rijen is `p_erbij` nul, en `aantal = aantal + 0` verandert niets.
         *    De teller kán dus niet stijgen van een statement dat niets deed.
         *
         *    📏 Wat die tak wél doet: hij houdt `dagtellers` schoon. Gemeten —
         *    `tel_dagteller('proef','x','k',10,interval '1 day','proef',0)`
         *    geeft 0 terug en laat **nul** rijen achter; zonder de tak zou er
         *    een rij met `aantal = 0` ontstaan in een tabel die anders alleen
         *    bestaat waar er iets gebeurd is. 0234 zegt dat ook met zoveel
         *    woorden over `begrens_pushtokens()`.
         *
         * ⚠️ Deze toets blijft staan: hij bewaakt de belofte (*herhaald
         *    blokkeren kost geen quotum*) en niet het mechanisme. Wordt de
         *    optelling ooit vervangen door iets dat wél per statement telt, dan
         *    is dit de toets die omvalt.
         */
        const [id] = maakProfielen(1);
        expect(id, 'de opstelling zelf mislukte').toBeDefined();

        expect((await blokkeer(vluchter, id as string)).ok, 'de eerste keer').toBe(true);

        const voor = await tellerstand();
        for (let n = 0; n < 25; n += 1) {
          expect((await blokkeer(vluchter, id as string)).ok, `herhaling ${n + 1}`).toBe(true);
        }
        const na = await tellerstand();

        expect(na, 'vijfentwintig herhalingen kostten geen quotum').toBe(voor);
      },
      TEST_TIMEOUT,
    );
  });

  /** De stand van de dagteller voor deze gebruiker, of 0 als er nog niets staat. */
  async function tellerstand(): Promise<number> {
    const uit = psql(
      `select coalesce(sum(aantal), 0) from dagtellers ` +
        `where domein = 'user_blocks' and sleutel = '${vluchter.id}'`,
    );
    return Number(uit.trim().split('\n').pop());
  }

  describe('maar de bulkvorm loopt vast', () => {
    it(
      `weigert de blokkade die het plafond van ${PLAFOND} passeert`,
      async () => {
        /**
         * ⚠️ De bulkvorm van het issue: `zoek_mensen()` geeft 50 id's per
         *    aanroep, en zonder plafond is het aantal rijen niet meer begrensd
         *    door wie je kent maar door hoeveel accounts er zijn.
         *
         * 📏 IJKING C — de trigger `user_blocks_dagplafond` gedropt: deze toets
         *    werd rood, álle blokkades kwamen er doorheen.
         *
         * ⚠️ De toets rekent vanaf de stand die er al is — de toetsen hierboven
         *    hebben er 49 verbruikt — zodat hij niet afhangt van zijn plaats in
         *    het bestand.
         */
        const gebruikt = await tellerstand();
        const rest = PLAFOND - gebruikt;
        expect(rest, 'er is geen ruimte meer om te toetsen').toBeGreaterThan(1);

        const ids = maakProfielen(rest + 1);

        // De eerste `rest` moeten er nog in passen.
        for (const id of ids.slice(0, rest)) {
          expect((await blokkeer(vluchter, id)).ok).toBe(true);
        }

        // ⚠️ En de eerstvolgende niet. De toets staat op de úitkomst en op de
        //    foutcode: `tel_dagteller()` werpt een `check_violation`, en een
        //    ándere fout zou deze toets groen houden zonder dat het plafond
        //    er iets mee te maken had.
        const teveel = await vluchter.db.rpc('blokkeer', { p_user: ids[rest] as string });
        expect(teveel.error, 'de blokkade over het plafond heen werd toegelaten').not.toBeNull();
        expect(teveel.error?.code, 'en wel door het dagplafond').toBe('23514');

        const staat = await adminDb()
          .from('user_blocks')
          .select('blocked_id')
          .eq('blocker_id', vluchter.id)
          .eq('blocked_id', ids[rest] as string);
        expect(staat.data ?? [], 'en hij landde niet alsnog').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });
});
