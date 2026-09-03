import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * Een gearchiveerde groep is leesbaar en omkeerbaar — 0153, QS8-217.
 *
 * ⚠️ **De belofte is niet "de policy klopt" maar "wat er stond, staat er nog".**
 *    0092 zette de archieftoets in `is_group_member()`, en `groups_select` liep
 *    langs diezelfde functie — dus de chat, de weekafsluitingen en de ledenlijst
 *    van een gearchiveerde groep waren voor niemand meer te openen. Er werd niets
 *    gewist; "archief" beloofde alleen leesbaarheid die er niet was.
 *
 * ⚠️ **De opstelling schrijft alles vóór het archiveren en leest alles erná.** Dat
 *    is met opzet: een test die ná het archiveren schrijft, toetst de schrijfkant,
 *    en die hóórt dicht te zitten. De vraag hier is of de rijen die er al waren
 *    nog te bereiken zijn.
 *
 * ⚠️ **Twee dingen blijven met opzet dicht, en dat staat hier als test en niet als
 *    aanname:** De Ketting van een ánder (domeinregel 7 — in een archief is élke
 *    periode afgesloten, dus een ontbrekende schakel betekent daar altijd "gemist")
 *    en schrijven in het algemeen. Zou een van beide meeliften op deze migratie,
 *    dan is dat geen ruimere leesbaarheid maar een lek.
 *
 * ⚠️ `tests/rls/archief.test.ts` (0092) bewaakt de andere helft: dat er niets in
 *    te schrijven is en dat drie van de vier routes de groep niet terugzetten. Eén
 *    belofte daar is op 03-09 omgedraaid; wat en waarom staat bij die test zelf.
 *
 * ⚠️ Met de hand rood gemaakt; wat er per belofte gebroken is, staat bij het geval.
 */

interface Fixture {
  /** Beheerder. Archiveert en heropent. */
  anna: TestUser;
  /** Gewoon lid. Leest. */
  bram: TestUser;
  /** Nergens lid van. Hoort niets te zien, ook niet in een archief. */
  cor: TestUser;
  groep: string;
  berichtId: string;
  reviewId: string;
}

let f: Fixture;

/**
 * De lopende periodestart van één groep, uit de database.
 *
 * ⚠️ **Niet zelf uitrekenen en niet een vaste datum in het verleden**, om twee
 *    redenen. `bewaak_week_review_periode()` weigert alles buiten een venster van
 *    35 dagen én alles wat niet de huddledag van déze groep is (0108) — dat is de
 *    praktische. De inhoudelijke is dat de Ketting-toets hieronder juist een
 *    periode nodig heeft die het vénster van `chain_links_select` zou doorlaten:
 *    alleen dan bewijst een lege uitkomst dat het lidmaatschap hem tegenhoudt en
 *    niet de datum. Op een oude datum zou die test groen blijven om de verkeerde
 *    reden — regel 18 vraag 3.
 */
async function periodestartVan(groupId: string): Promise<string> {
  const dag = await adminDb().rpc('groepsdatum', { gid: groupId });
  if (dag.error) throw new Error(`groepsdatum: ${dag.error.message}`);
  const groep = await adminDb().from('groups').select('huddle_day').eq('id', groupId).single();
  if (groep.error) throw new Error(`groep lezen: ${groep.error.message}`);

  const vandaag = new Date(`${dag.data as unknown as string}T00:00:00Z`);
  const terug = (vandaag.getUTCDay() - (groep.data.huddle_day % 7) + 7) % 7;
  vandaag.setUTCDate(vandaag.getUTCDate() - terug);
  return vandaag.toISOString().slice(0, 10);
}

/** Hoeveel rijen déze gebruiker van een tabel ziet, op één kolomwaarde. */
async function lees(wie: TestUser, tabel: string, kolom: string, waarde: string): Promise<number> {
  const db = wie.db as unknown as {
    from: (t: string) => {
      select: (k: string) => { eq: (c: string, v: string) => Promise<{ data: unknown[] | null }> };
    };
  };
  const { data } = await db.from(tabel).select('*').eq(kolom, waarde);
  return (data ?? []).length;
}

describe.skipIf(!rlsTestsConfigured)('een gearchiveerde groep is leesbaar', () => {
  beforeAll(async () => {
    const anna = await createTestUser('archleesb-anna');
    const bram = await createTestUser('archleesb-bram');
    const cor = await createTestUser('archleesb-cor');

    const gemaakt = await anna.db.rpc('create_group', { group_name: 'Leesbaar archief' });
    if (gemaakt.error) throw new Error(`groep: ${gemaakt.error.message}`);
    const uit = gemaakt.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (uit.ok !== true || uit.group === undefined) {
      throw new Error(`groep mislukte: ${JSON.stringify(gemaakt.data)}`);
    }

    const mee = await bram.db.rpc('join_group_with_code', { code: uit.group.invite_code });
    if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);
    const gelezen = mee.data as unknown as { ok?: boolean; reason?: string };
    if (gelezen.ok !== true) throw new Error(`meedoen: ${gelezen.reason ?? '?'}`);

    // ⚠️ Alles wat straks gelezen wordt, wordt hier geschreven — vóór het
    //    archiveren. Zie de kop.
    const bericht = await bram.db
      .from('chat_messages')
      .insert({ group_id: uit.group.id, sender_id: bram.id, body: 'ARCHIEF hallo', type: 'text' })
      .select('id')
      .single();
    if (bericht.error || bericht.data === null) {
      throw new Error(`bericht: ${bericht.error?.message}`);
    }

    const periode = await periodestartVan(uit.group.id);

    const review = await adminDb()
      .from('week_reviews')
      .insert({
        group_id: uit.group.id,
        user_id: bram.id,
        group_period_start: periode,
        did_text: 'ARCHIEF ging goed',
      })
      .select('id')
      .single();
    if (review.error || review.data === null) throw new Error(`review: ${review.error?.message}`);

    const schakel = await adminDb().from('chain_links').insert({
      group_id: uit.group.id,
      user_id: anna.id,
      group_period_start: periode,
    });
    if (schakel.error) throw new Error(`schakel: ${schakel.error.message}`);

    f = {
      anna,
      bram,
      cor,
      groep: uit.group.id,
      berichtId: bericht.data.id,
      reviewId: review.data.id,
    };

    const weg = await anna.db.rpc('archiveer_groep', { p_group_id: f.groep, p_bevestigd: true });
    if (weg.error) throw new Error(`archiveren (HTTP): ${weg.error.message}`);
    const uitslag = weg.data as unknown as { ok?: boolean; reason?: string };
    if (uitslag.ok !== true) throw new Error(`archiveren mislukte: ${uitslag.reason ?? '?'}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await adminDb().from('groups').delete().eq('id', f.groep);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // Wat er open moet
  // -------------------------------------------------------------------------

  it(
    'is voor zijn leden nog te openen',
    async () => {
      // ⚠️ Rood gemaakt door `groups_select` terug te zetten op
      //    `is_group_member(id)`: dan geeft dit nul, en dát was de stand vóór
      //    0153 — de groep bestond nog maar was voor niemand te bereiken.
      expect(await lees(f.anna, 'groups', 'id', f.groep)).toBe(1);
      expect(await lees(f.bram, 'groups', 'id', f.groep)).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt zijn chat, ledenlijst en weekafsluitingen leesbaar',
    async () => {
      // Dit is wat "archief" belooft en wat het niet deed.
      expect(await lees(f.bram, 'chat_messages', 'id', f.berichtId)).toBe(1);
      expect(await lees(f.bram, 'group_members', 'group_id', f.groep)).toBe(2);
      expect(await lees(f.bram, 'week_reviews', 'id', f.reviewId)).toBe(1);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Wat er dicht moet blijven
  // -------------------------------------------------------------------------

  it(
    'geeft een buitenstaander nog steeds niets',
    async () => {
      // ⚠️ **De belangrijkste van allemaal.** `mag_groep_lezen()` haalde de
      //    archieftoets eruit; haalt hij per ongeluk óók het lidmaatschap eruit,
      //    dan staat elk archief open voor iedereen die het id kent. Rood gemaakt
      //    door `m.user_id = auth.uid()` uit die functie te halen.
      expect(await lees(f.cor, 'groups', 'id', f.groep)).toBe(0);
      expect(await lees(f.cor, 'chat_messages', 'id', f.berichtId)).toBe(0);
      expect(await lees(f.cor, 'week_reviews', 'id', f.reviewId)).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat er niemand meer in schrijven',
    async () => {
      // ⚠️ **De splitsing zelf.** De leeskant ging open; de schrijfkant hoort
      //    langs `is_group_member()` te blijven lopen, die zijn archieftoets
      //    houdt. Rood gemaakt door `chat_messages_insert` op `mag_groep_lezen()`
      //    te zetten — dan landt dit bericht gewoon.
      const { error } = await f.bram.db.from('chat_messages').insert({
        group_id: f.groep,
        sender_id: f.bram.id,
        body: 'ARCHIEF nog een',
        type: 'text',
      });

      expect(error).not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt De Ketting van een ander dicht, ook in het archief',
    async () => {
      // ⚠️ **Domeinregel 7, en de reden dat `chain_links_select` als enige van de
      //    elf niet is omgezet.** Die policy draagt sinds 0037 een venster: van
      //    een ánder zie je alleen de lopende periode, want daarin betekent een
      //    ontbrekende schakel "nog niet". In een archief is élke periode
      //    afgesloten, dus daar zou het altijd "gemist" betekenen — precies het
      //    lek dat 0037 dichtte, met "archief" als omweg.
      //
      //    ⚠️ Rood gemaakt door `chain_links_select` óók op `mag_groep_lezen()`
      //    te zetten: bram ziet anna's schakel dan wél.
      expect(await lees(f.anna, 'chain_links', 'user_id', f.anna.id)).toBeGreaterThan(0);
      expect(await lees(f.bram, 'chain_links', 'user_id', f.anna.id)).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'staat aan de goede kant van de lees/schrijf-splitsing, en dat is telbaar',
    async () => {
      // ⚠️ **De enige test die de splitsing zelf bewaakt en niet één gevolg
      //    ervan.** De volgende SELECT-policy krijgt `is_group_member()` omdat dat
      //    de naam is die iedereen kent, en dan is één tabel stilzwijgend dicht in
      //    het archief — of, gevaarlijker, een schrijfpolicy krijgt
      //    `mag_groep_lezen()` en dan mag je schrijven in een archief.
      //
      //    ⚠️ Rood gemaakt door `season_recaps_select` terug te zetten op
      //    `is_group_member()`: `archiefleesgat()` noemt hem dan bij naam.
      const { data, error } = await adminDb().rpc('archiefleesgat');
      if (error) throw new Error(`archiefleesgat: ${error.message}`);

      expect(data ?? []).toEqual([]);
    },
    TEST_TIMEOUT,
  );


  it(
    'laat niemand zijn eigen chatbericht meer wissen',
    async () => {
      // ⚠️ **Dit is de deur die de security-ronde vond, en hij stond al open vóór
      //    deze migratie — alleen liep er geen gang naartoe.** `chat_messages_delete`
      //    toetste alleen `sender_id = auth.uid()` en nooit het archief. Tot 0153
      //    laadde de chat van een gearchiveerde groep niet, dus de verwijderknop
      //    stond er niet; het openen van de leeskant maakte hem bereikbaar.
      //
      //    📏 Nagespeeld vóór de reparatie: een lid verwijderde als
      //    `authenticated` zijn eigen bericht uit een gearchiveerde groep, en het
      //    was weg. Op de gratis tier zijn er geen backups.
      //
      //    ⚠️ Rood gemaakt door de policy terug te zetten op alleen
      //    `sender_id = (select auth.uid())`.
      await f.bram.db.from('chat_messages').delete().eq('id', f.berichtId);

      // Een DELETE die door de `using` wordt weggefilterd raakt nul rijen en geeft
      // géén fout — daarom telt hier alleen of de rij er nog is.
      const { data } = await adminDb().from('chat_messages').select('id').eq('id', f.berichtId);
      expect((data ?? []).length).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat niemand zijn eigen weekafsluiting meer wissen',
    async () => {
      // ⚠️ `week_reviews_write` is `for all`, en DELETE kent geen `with_check` —
      //    dus de `is_group_member` die daarin stond gold niet voor verwijderen.
      //    Dat is dezelfde deur, één tabel verder, en hij was net zo onzichtbaar.
      //    Rood gemaakt door de `using` terug te zetten op alleen
      //    `user_id = (select auth.uid())`.
      await f.bram.db.from('week_reviews').delete().eq('id', f.reviewId);

      const { data } = await adminDb().from('week_reviews').select('id').eq('id', f.reviewId);
      expect((data ?? []).length).toBe(1);
    },
    TEST_TIMEOUT,
  );


  it(
    'heeft precies twee functies die de ontgrendelsleutel kennen',
    async () => {
      // ⚠️ **De belofte "die instelling zet alleen `heropen_groep()`" stond in
      //    commentaar en nergens als controle** — aangewezen door de
      //    security-ronde. Elke derde functie die `app.heropent_groep` noemt, is
      //    een tweede sleutel op een slot dat 0092 voor élke rol dichtzette.
      //
      //    ⚠️ Rood gemaakt door een wegwerpfunctie te maken die die instelling
      //    noemt: `sleutelzetters()` noemt hem meteen bij naam.
      const { data, error } = await adminDb().rpc('sleutelzetters');
      if (error) throw new Error(`sleutelzetters: ${error.message}`);

      expect(data ?? []).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De weg terug
  // -------------------------------------------------------------------------

  it(
    'blijft gearchiveerd bij een gewone update, ook door service_role',
    async () => {
      // ⚠️ De pin van 0092 moet blijven staan; 0153 geeft hem één sleutel en
      //    schaft hem niet af. Rood gemaakt door de `if` in
      //    `archief_blijft_archief()` weg te halen.
      await adminDb().from('groups').update({ status: 'active' }).eq('id', f.groep);

      const { data } = await adminDb().from('groups').select('status').eq('id', f.groep).single();
      expect(data?.status).toBe('archived');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert te heropenen zonder bevestiging, en voor wie geen beheerder is',
    async () => {
      const zonder = await f.anna.db.rpc('heropen_groep', { p_group_id: f.groep });
      expect((zonder.data as { reason?: string }).reason).toBe('not_confirmed');

      const gewoonLid = await f.bram.db.rpc('heropen_groep', {
        p_group_id: f.groep,
        p_bevestigd: true,
      });
      expect((gewoonLid.data as { reason?: string }).reason).toBe('not_admin');
    },
    TEST_TIMEOUT,
  );

  it(
    'gaat open voor de beheerder, en laat een spoor na',
    async () => {
      // ⚠️ Rood gemaakt door de `perform set_config(...)` uit `heropen_groep()`
      //    te halen: de pin weigert dan stíl, de teruglezing in die functie vangt
      //    dat en er komt `pinned` uit in plaats van `ok`. Dát is waarom die
      //    teruglezing erin zit — zonder hem was deze test groen gebleven op een
      //    groep die gewoon gearchiveerd bleef.
      const terug = await f.anna.db.rpc('heropen_groep', {
        p_group_id: f.groep,
        p_bevestigd: true,
      });
      expect((terug.data as { ok?: boolean; reason?: string }).ok).toBe(true);

      const { data } = await adminDb().from('groups').select('status').eq('id', f.groep).single();
      expect(data?.status).toBe('active');

      const spoor = await adminDb()
        .from('group_events')
        .select('event_type')
        .eq('group_id', f.groep)
        .eq('event_type', 'group_reopened');
      expect((spoor.data ?? []).length).toBe(1);
    },
    TEST_TIMEOUT,
  );
});
