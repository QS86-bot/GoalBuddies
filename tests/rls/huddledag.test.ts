/**
 * De huddledag is een afspraak en geen schakelaar — QS8-360, migratie 0208.
 *
 * ⚠️ **De belofte is niet "de kolom zit op slot".** Dat is de kolom, en het zou
 *    bovendien het verkeerde antwoord zijn: de huddledag ís per ontwerp iets dat
 *    een groep mag veranderen, met een scherm en al. De belofte is een
 *    eigenschap van het gehéél:
 *
 *      Een beheerder verzet de huddledag zonder dat een ánder lid daar zijn
 *      lopende weekafsluiting door verliest, en zonder dat de groep een gemiste
 *      week van iemand anders te zien krijgt die er niet is.
 *
 * ⚠️ 📏 **Wat er gemeten is vóór 0208** — beschermde groep, huddledag zondag,
 *    lopende periode `2026-09-06`, de beheerder had afgesloten en het lid niet:
 *
 *      VOOR   group_overview(gid, '2026-09-06')   adm=true   lid=false
 *      PATCH  /groups {"huddle_day": 3}           -> 204
 *      NA     group_overview(gid, '2026-09-06')   adm=true   lid=false
 *      NA     group_overview(gid, '2026-09-02')   adm=false  lid=false
 *      lid sluit af op 2026-09-06  ->  22023
 *
 *    Drie dingen, en het derde stond niet in het issue: de afsluiting van de
 *    beheerder telt onder de nieuwe start niet meer mee, en
 *    `chain_links_one_per_period` staat op `(group_id, user_id,
 *    group_period_start)` — dus hij kan een tweede schakel leggen voor
 *    materieel dezelfde week. Dat is de reden dat alléén de oude periodestart
 *    blijven accepteren niet genoeg was.
 *
 * ⚠️ **Beide groepsstanden, en dat is geen netheid.** In een beschermde groep
 *    verbergt de datumgrens `groepsdatum - 6` de oude periode vanzelf zodra hij
 *    voorbij is; in een **open** groep valt die grens weg (A41) en is de
 *    verkeerde `false` permanent. De open groep is dus de plek waar dit het
 *    langst zichtbaar blijft.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { groupPeriod, now, type IsoDate, type TimeZone, type Weekday } from '../../src/shared/time';

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

/** Eén vaste zone voor alle groepen hier, zodat de twee periodestarts te rekenen zijn. */
const ZONE: TimeZone = 'Europe/Amsterdam';

interface Fout {
  code?: string;
  message?: string;
}

interface Uitkomst {
  ok?: boolean;
  reason?: string;
  huddle_day?: number;
  verzette_schakels?: number;
  verzette_afsluitingen?: number;
}

interface Groep {
  id: string;
  beheerder: TestUser;
  lid: TestUser;
  /** De huddledag waarmee hij is aangemaakt. */
  dag: Weekday;
}

/** De periodestart die vandaag bevat, voor een groep met deze huddledag. */
function startVan(dag: Weekday): IsoDate {
  return groupPeriod({ huddleDay: dag, tz: ZONE }, now()).startDate;
}

/**
 * De weekdag van vandaag, en de dag drie verder.
 *
 * ⚠️ **De huddledag mag niet vandaag zijn, en de nieuwe ook niet.** Valt de
 *    periodestart op vandaag, dan is `groepsdatum` gelijk aan de start en zegt
 *    de test niets over de verhuizing van een lópende week; en een nieuwe dag
 *    die op vandaag valt, geeft een nieuwe start die gelijk is aan de oude. Twee
 *    dagen die allebei drie van vandaag af liggen, kunnen dat geen van beide.
 */
function dagen(): { oud: Weekday; nieuw: Weekday } {
  const vandaag = new Date(now()).getUTCDay();
  return {
    oud: (((vandaag + 4) % 7) as Weekday),
    nieuw: (((vandaag + 2) % 7) as Weekday),
  };
}

const DAG = dagen();

describe.skipIf(!rlsTestsConfigured)('de huddledag verzet de lopende periode mee', () => {
  let beschermd: Groep;
  let open: Groep;

  /** Een verse groep met twee leden, in de gevraagde stand. */
  async function verseGroep(naam: string, zichtbaarheid: 'beschermd' | 'open'): Promise<Groep> {
    const beheerder = await createTestUser(`huddle-${naam}-adm`);
    const lid = await createTestUser(`huddle-${naam}-lid`);

    const g = await beheerder.db.rpc('create_group', {
      group_name: `Huddle ${naam}`,
      huddle_day: DAG.oud,
      tz: ZONE,
      zichtbaarheid,
    });
    if (g.error) throw new Error(`groep: ${g.error.message}`);
    const uit = (g.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (uit.ok !== true || !uit.group) throw new Error(`groep: ${JSON.stringify(g.data)}`);

    const mee = await lid.db.rpc('join_group_with_code', { code: uit.group.invite_code });
    if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);

    return { id: uit.group.id, beheerder, lid, dag: DAG.oud };
  }

  /** Wat het overzicht over deze periode zegt, per lid. */
  async function overzicht(
    groep: Groep,
    kijker: TestUser,
    periode: IsoDate,
  ): Promise<Record<string, boolean | null>> {
    const { data, error } = await kijker.db.rpc('group_overview', {
      p_group_id: groep.id,
      p_period_start: periode,
    });
    if (error) throw new Error(`overzicht: ${error.message}`);

    const uit: Record<string, boolean | null> = {};
    for (const rij of (data ?? []) as { user_id: string; closed_this_period: boolean | null }[]) {
      uit[rij.user_id] = rij.closed_this_period;
    }
    return uit;
  }

  /** De beheerder sluit zijn week af; het lid met opzet niet. */
  async function beheerderSluitAf(groep: Groep, periode: IsoDate): Promise<void> {
    const admin = adminDb();
    const schakel = await admin
      .from('chain_links')
      .insert({ group_id: groep.id, user_id: groep.beheerder.id, group_period_start: periode });
    if (schakel.error) throw new Error(`schakel: ${schakel.error.message}`);

    const review = await admin.from('week_reviews').insert({
      group_id: groep.id,
      user_id: groep.beheerder.id,
      group_period_start: periode,
      did_text: 'gedaan',
      blocked_text: 'niets',
      next_text: 'verder',
    });
    if (review.error) throw new Error(`weekafsluiting: ${review.error.message}`);
  }

  beforeAll(async () => {
    if (!rlsTestsConfigured) return;
    beschermd = await verseGroep('beschermd', 'beschermd');
    open = await verseGroep('open', 'open');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    if (!rlsTestsConfigured) return;
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // 1. De weg die dicht is, en de weg die open is
  // -------------------------------------------------------------------------

  it(
    'weigert een kale PATCH op huddle_day, ook van een beheerder',
    async () => {
      const { error } = await beschermd.beheerder.db
        .from('groups')
        .update({ huddle_day: DAG.nieuw })
        .eq('id', beschermd.id);

      const fout = (error ?? {}) as Fout;
      expect(error, 'de PATCH landde').not.toBeNull();
      // ⚠️ 42501 is de kolomgrant. Iets anders betekent dat de grant terug is en
      //    alleen de pin in `guard_group_update()` het werk doet — en die zwijgt.
      expect(fout.code, JSON.stringify(error)).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert de RPC voor een gewoon lid en laat de dag staan',
    async () => {
      const antwoord = await beschermd.lid.db.rpc('zet_huddledag', {
        p_group_id: beschermd.id,
        p_dag: DAG.nieuw,
        p_oude_start: startVan(DAG.oud),
        p_nieuwe_start: startVan(DAG.nieuw),
        p_bevestigd: true,
      });
      expect(antwoord.error).toBeNull();
      expect(antwoord.data as Uitkomst).toMatchObject({ ok: false, reason: 'not_admin' });

      const na = await adminDb().from('groups').select('huddle_day').eq('id', beschermd.id).single();
      expect(na.data?.huddle_day).toBe(DAG.oud);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 2. De twee periodestarts komen van de client, dus ze worden getoetst
  // -------------------------------------------------------------------------
  //
  // ⚠️ Zonder deze drie is de RPC een manier om willekeurige rijen naar een
  //    datum naar keuze te verhuizen. De groepsklok hoort in `shared/time`
  //    (correctheidsregel 7), dus de argumenten kúnnen niet uit de database
  //    komen — dan blijft alleen toetsen over.

  const misvormd: readonly { wat: string; patch: () => Record<string, unknown>; reden: string }[] = [
    {
      wat: 'een nieuwe start die niet op de nieuwe dag valt',
      patch: () => ({ p_nieuwe_start: startVan(DAG.oud) }),
      reden: 'periode_valt_niet_op_huddledag',
    },
    {
      wat: 'een oude start die niet op de huidige dag valt',
      patch: () => ({ p_oude_start: startVan(DAG.nieuw) }),
      reden: 'oude_periode_valt_niet_op_huddledag',
    },
    {
      wat: 'een dag buiten 0 tot en met 6',
      patch: () => ({ p_dag: 9 }),
      reden: 'ongeldige_dag',
    },
  ];

  for (const geval of misvormd) {
    it(
      `weigert ${geval.wat}`,
      async () => {
        const antwoord = await beschermd.beheerder.db.rpc('zet_huddledag', {
          p_group_id: beschermd.id,
          p_dag: DAG.nieuw,
          p_oude_start: startVan(DAG.oud),
          p_nieuwe_start: startVan(DAG.nieuw),
          p_bevestigd: true,
          ...geval.patch(),
        });
        expect(antwoord.error).toBeNull();
        expect(antwoord.data as Uitkomst).toMatchObject({ ok: false, reason: geval.reden });

        const na = await adminDb()
          .from('groups')
          .select('huddle_day')
          .eq('id', beschermd.id)
          .single();
        expect(na.data?.huddle_day, 'de dag is alsnog verzet').toBe(DAG.oud);
      },
      TEST_TIMEOUT,
    );
  }

  it(
    'weigert een periode die vandaag niet bevat',
    async () => {
      // ⚠️ Zeven dagen terug is een échte periodestart en valt dus op de goede
      //    weekdag — hij is alleen niet de lopende. Zonder die vorm zou deze
      //    test afketsen op de dagtoets hierboven en niets over het venster
      //    zeggen.
      const vorige = groupPeriod(
        { huddleDay: DAG.oud, tz: ZONE },
        new Date(now().getTime() - 7 * 86_400_000),
      ).startDate;

      const antwoord = await beschermd.beheerder.db.rpc('zet_huddledag', {
        p_group_id: beschermd.id,
        p_dag: DAG.nieuw,
        p_oude_start: vorige,
        p_nieuwe_start: startVan(DAG.nieuw),
        p_bevestigd: true,
      });
      expect(antwoord.error).toBeNull();
      expect(antwoord.data as Uitkomst).toMatchObject({
        ok: false,
        reason: 'periode_bevat_vandaag_niet',
      });
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 3. De belofte zelf, in beide standen
  // -------------------------------------------------------------------------

  for (const stand of ['beschermd', 'open'] as const) {
    it(
      `neemt de lopende week mee in een ${stand}e groep`,
      async () => {
        const groep = stand === 'beschermd' ? beschermd : open;
        const oudeStart = startVan(DAG.oud);
        const nieuweStart = startVan(DAG.nieuw);

        await beheerderSluitAf(groep, oudeStart);

        const voor = await overzicht(groep, groep.beheerder, oudeStart);
        expect(voor[groep.beheerder.id], 'de opstelling klopt niet').toBe(true);
        expect(voor[groep.lid.id], 'de opstelling klopt niet').toBe(false);

        const antwoord = await groep.beheerder.db.rpc('zet_huddledag', {
          p_group_id: groep.id,
          p_dag: DAG.nieuw,
          p_oude_start: oudeStart,
          p_nieuwe_start: nieuweStart,
          p_bevestigd: true,
        });
        expect(antwoord.error, JSON.stringify(antwoord.error)).toBeNull();
        expect(antwoord.data as Uitkomst).toMatchObject({ ok: true, huddle_day: DAG.nieuw });

        // ⚠️ **AC1 en het derde gemeten gevolg in één regel.** Onder de nieuwe
        //    start staat het overzicht er precies zo bij als vóór de wissel: wie
        //    afgesloten had, is afgesloten; wie niet, kan nog. Zou de verhuizing
        //    niet gebeuren, dan stond hier `false/false` en kon de beheerder een
        //    tweede schakel leggen voor dezelfde week.
        const na = await overzicht(groep, groep.beheerder, nieuweStart);
        expect(na[groep.beheerder.id], 'de afsluiting is niet meeverhuisd').toBe(true);
        expect(na[groep.lid.id]).toBe(false);

        // ⚠️ **AC2.** De oude start is geen periodestart meer, dus daar hoort
        //    geen antwoord over te komen — `null` en niet `false`. In een open
        //    groep valt de datumgrens weg, en juist daar was de verkeerde
        //    `false` permanent.
        const oud = await overzicht(groep, groep.lid, oudeStart);
        expect(oud[groep.beheerder.id], `${stand}: de oude periode geeft nog antwoord`).toBeNull();
        expect(oud[groep.lid.id], `${stand}: de oude periode geeft nog antwoord`).toBeNull();

        // ⚠️ **AC1, langs de weg die het lid zelf loopt.** Zijn weekafsluiting
        //    kon vóór 0208 nooit meer landen; nu wel, op de nieuwe start.
        const afsluiten = await adminDb().from('week_reviews').insert({
          group_id: groep.id,
          user_id: groep.lid.id,
          group_period_start: nieuweStart,
          did_text: 'alsnog',
          blocked_text: 'niets',
          next_text: 'verder',
        });
        expect(afsluiten.error, JSON.stringify(afsluiten.error)).toBeNull();

        // ⚠️ Eén schakel voor de beheerder en niet twee. De unieke index staat op
        //    `(group_id, user_id, group_period_start)`; bleef zijn oude schakel
        //    op de oude start staan, dan is een tweede op de nieuwe start
        //    gewoon toegestaan.
        const schakels = await adminDb()
          .from('chain_links')
          .select('group_period_start')
          .eq('group_id', groep.id)
          .eq('user_id', groep.beheerder.id);
        expect(schakels.data ?? []).toHaveLength(1);
        expect((schakels.data ?? [])[0]?.group_period_start).toBe(nieuweStart);
      },
      TEST_TIMEOUT,
    );
  }

  // -------------------------------------------------------------------------
  // 4. De groep hoort het te weten, en niet meer dan dat
  // -------------------------------------------------------------------------

  it(
    'laat een systeembericht en een auditrij achter, zonder aantallen',
    async () => {
      const bericht = await adminDb()
        .from('chat_messages')
        .select('system_event, body, actor_id, subject_id, payload')
        .eq('group_id', beschermd.id)
        .eq('system_event', 'huddle_day_changed');

      expect(bericht.data ?? [], 'de groep hoort dit te weten').toHaveLength(1);
      const rij = (bericht.data ?? [])[0] as {
        body: string | null;
        actor_id: string | null;
        subject_id: string | null;
      };
      expect(rij.actor_id).toBe(beschermd.beheerder.id);

      // ⚠️⚠️ **Domeinregel 7 op een plek waar je hem makkelijk mist**, want de
      //    gebeurtenis zelf is geen tegenslag. `zet_huddledag()` weet hoeveel
      //    afsluitingen er mee zijn verhuisd; uit "één van de twee" is af te
      //    leiden wie er nog niet had afgesloten. Dat getal gaat alleen terug
      //    naar de beheerder die de handeling deed, en die wist het al.
      expect(rij.body ?? '').not.toMatch(/[0-9]/);
      expect(rij.subject_id, 'een systeembericht over de groep noemt geen persoon').toBeNull();

      const audit = await adminDb()
        .from('group_events')
        .select('event_type, actor_id')
        .eq('group_id', beschermd.id)
        .eq('event_type', 'huddle_day_changed');
      expect(audit.data ?? []).toHaveLength(1);
      expect((audit.data ?? [])[0]?.actor_id).toBe(beschermd.beheerder.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert zonder bevestiging, en dat is domeinregel 5 en geen formaliteit',
    async () => {
      // ⚠️ 📏 De reden dat deze bevestiging er is: de venstertoets laat élke
      //    periodestart in `[groepsdatum - 6, groepsdatum]` toe, dus een
      //    verzetting kan de lopende week van de ánderen tot vandaag inkorten
      //    (gemeten: `09-08 .. 09-14` werd `09-02 .. 09-08`). Verbieden kan niet
      //    — élke verzetting maakt de week korter of langer — dus is de prijs
      //    iets om te noemen. Gevonden in de security-review op deze branch.
      const antwoord = await open.beheerder.db.rpc('zet_huddledag', {
        p_group_id: open.id,
        p_dag: DAG.oud,
        p_oude_start: startVan(DAG.nieuw),
        p_nieuwe_start: startVan(DAG.oud),
      });
      expect(antwoord.error).toBeNull();
      expect(antwoord.data as Uitkomst).toMatchObject({ ok: false, reason: 'not_confirmed' });

      const na = await adminDb().from('groups').select('huddle_day').eq('id', open.id).single();
      expect(na.data?.huddle_day, 'de dag is alsnog verzet').toBe(DAG.nieuw);
    },
    TEST_TIMEOUT,
  );

  it(
    'remt op één wisseling per dag',
    async () => {
      // ⚠️ De open groep heeft hierboven al één keer gewisseld, dus deze tweede
      //    hoort af te ketsen. 📏 Zonder rem gaven elf wisselingen achter elkaar
      //    elf systeemberichten in de groepschat — onwrikbare regel 5, en
      //    dezelfde rem als `zet_groepszichtbaarheid()` (0076).
      const antwoord = await open.beheerder.db.rpc('zet_huddledag', {
        p_group_id: open.id,
        p_dag: DAG.oud,
        p_oude_start: startVan(DAG.nieuw),
        p_nieuwe_start: startVan(DAG.oud),
        p_bevestigd: true,
      });
      expect(antwoord.error).toBeNull();
      expect(antwoord.data as Uitkomst).toMatchObject({ ok: false, reason: 'too_soon' });

      const na = await adminDb().from('groups').select('huddle_day').eq('id', open.id).single();
      expect(na.data?.huddle_day).toBe(DAG.nieuw);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert dezelfde dag nog een keer — dat is geen wijziging',
    async () => {
      const antwoord = await beschermd.beheerder.db.rpc('zet_huddledag', {
        p_group_id: beschermd.id,
        p_dag: DAG.nieuw,
        p_oude_start: startVan(DAG.nieuw),
        p_nieuwe_start: startVan(DAG.nieuw),
        p_bevestigd: true,
      });
      expect(antwoord.error).toBeNull();
      expect(antwoord.data as Uitkomst).toMatchObject({ ok: false, reason: 'unchanged' });
    },
    TEST_TIMEOUT,
  );
});
