import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Twee teksten die een autorisatiegrens oversteken — QS8-498, migratie 0273.
 *
 * ⚠️⚠️ **Dit is de belofte-toets, en de belofte is met opzet niet "de CHECK
 *    weigert".** Wat beloofd wordt, is dat *een bidi-stuurteken de
 *    uitnodigingskaart van een vreemde niet haalt.* Dat is een eigenschap van
 *    het gehéél: `goals` mag hem weigeren, óf `invite_preview()` mag hem niet
 *    meer aan een niet-lid geven — allebei houden de belofte.
 *
 *    Die formulering is niet cosmetisch. QS8-498 noemt vier opties, en twee
 *    ervan repareren dit langs verschillende kanten. Een toets die `23514`
 *    eist, legt één van die vier vast en wordt rood zodra iemand voor een
 *    andere kiest — dan bewaakt hij de oplossing in plaats van de belofte.
 *
 * ⚠️ **Via PostgREST als een echte `authenticated`, en niet via `psql`.** Alleen
 *    zo doen de policy, de kolomgrant en de CHECK alle drie mee. 📏 Bij het
 *    meten van dit issue zijn twee eigen opstellingen groen geweest om de
 *    verkeerde reden: een subquery naar `groups.id` die als de vreemde draaide
 *    gaf `null` terug (en dus een aanroep met een leeg argument), en een
 *    `is not null` op een functie die áltijd een object teruggeeft toetste
 *    niets. Beide staan hieronder als expliciete voorwaarde-toets.
 */

const TEST_TIMEOUT = 30_000;

/** U+202E RIGHT-TO-LEFT OVERRIDE — de klassieke spoof. */
const RLO = '‮';
/** U+2066 LEFT-TO-RIGHT ISOLATE — het isolaat uit dezelfde familie. */
const LRI = '⁦';

describe.skipIf(!rlsTestsConfigured)('een doeltitel rendert niet als een andere', () => {
  let eigenaar: TestUser;
  let vreemde: TestUser;
  let groepId = '';
  let code = '';

  beforeAll(async () => {
    eigenaar = await createTestUser('bidititel-eigenaar');
    vreemde = await createTestUser('bidititel-vreemde');

    code = `BT${Math.random().toString(36).slice(2, 12).toUpperCase()}`.slice(0, 12);
    const groep = await adminDb()
      .from('groups')
      .insert({ name: 'Bidititel', created_by: eigenaar.id, invite_code: code })
      .select('id')
      .single();
    if (groep.error !== null) throw new Error(`groep: ${groep.error.message}`);
    groepId = (groep.data as { id: string }).id;
    registreerGroep(groepId);

    const lid = await adminDb()
      .from('group_members')
      .insert({ group_id: groepId, user_id: eigenaar.id, role: 'admin', status: 'active' });
    if (lid.error !== null) throw new Error(`lidmaatschap: ${lid.error.message}`);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await adminDb().from('goal_group_links').delete().eq('group_id', groepId);
    await adminDb().from('goals').delete().eq('owner_id', eigenaar.id);
    await adminDb().from('group_join_requests').delete().eq('group_id', groepId);
    await removeTestUsers();
  }, TEST_TIMEOUT);

  /** Probeert een doel met deze titel te maken, als de eigenaar zelf. */
  async function maakDoel(titel: string) {
    return eigenaar.db
      .from('goals')
      .insert({
        owner_id: eigenaar.id,
        title: titel,
        // ⚠️ Geen `status`: 📏 `authenticated` heeft INSERT op acht kolommen van
        //    `goals` en `status` staat daar niet bij — meesturen geeft
        //    `42501 permission denied for table goals`, en dan meet deze
        //    opstelling de kolomgrant in plaats van de CHECK.
        target_date: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
      })
      .select('id')
      .single();
  }

  // ---------------------------------------------------------------------------
  // De belofte
  // ---------------------------------------------------------------------------

  it(
    'laat geen bidi-stuurteken op de uitnodigingskaart van een vreemde komen',
    async () => {
      // ⚠️⚠️ **Eerst bewijzen dat het kanaal überhaupt open staat.** 📏 Zonder
      //    deze helft bewaakte deze toets níéts: de eerste versie maakte wel een
      //    doel maar koppelde het niet aan de groep, dus `invite_preview()` gaf
      //    `goal_title: null` en de toets bleef groen met de CHECK eruit
      //    gesloopt. De ijking vond dat — regel 18 vraag 3, en het is precies
      //    de reden dat die vraag met een mutatie beantwoord wordt en niet met
      //    nadenken.
      const schoon = 'Hardlopen met de groep';
      const doel = await maakDoel(schoon);
      expect(doel.error, `de opstelling zelf mislukte: ${doel.error?.message}`).toBeNull();
      const doelId = (doel.data as { id: string }).id;

      const koppel = await eigenaar.db
        .from('goal_group_links')
        .insert({ goal_id: doelId, group_id: groepId });
      expect(koppel.error, `koppelen mislukte: ${koppel.error?.message}`).toBeNull();

      const vooraf = await vreemde.db.rpc('invite_preview', { code });
      expect(vooraf.error, `invite_preview viel om: ${vooraf.error?.message}`).toBeNull();
      expect(
        JSON.stringify(vooraf.data ?? {}),
        'de vreemde kreeg de doeltitel niet te zien — dan meet deze toets niets',
      ).toContain(schoon);

      // Het geval, woordelijk zoals het gemeten is.
      const besmet = await eigenaar.db
        .from('goals')
        .update({ title: `Sparen voor ${RLO}gpj.exe` })
        .eq('id', doelId);

      const uit = await vreemde.db.rpc('invite_preview', { code });
      expect(uit.error).toBeNull();

      // ⚠️ De hele kaart en niet alleen `goal_title`: de belofte gaat over wat
      //    er op dat scherm terechtkomt, en een volgend veld hoort er vanzelf
      //    onder te vallen.
      const kaart = JSON.stringify(uit.data ?? {});
      expect(kaart, 'een bidi-override bereikte de uitnodigingskaart').not.toContain(RLO);
      expect(kaart, 'een bidi-isolaat bereikte de uitnodigingskaart').not.toContain(LRI);

      // ⚠️ En de rij is onveranderd — anders is "geen RLO op de kaart" ook waar
      //    als de schrijfactie stilletjes niets raakte (valkuil 5).
      expect(besmet.error, 'de schrijfactie werd niet geweigerd').not.toBeNull();
      const na = await adminDb().from('goals').select('title').eq('id', doelId).single();
      expect((na.data as { title: string }).title, 'de rij veranderde toch').toBe(schoon);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een toetredingsbericht met een stuurteken niet bij de beheerder komen',
    async () => {
      await adminDb().from('groups').update({ ontdekbaar: true, categorie: 'fitness' }).eq('id', groepId);

      // ⚠️ `groepId` komt uit `adminDb()` en niet uit een subquery die als de
      //    vreemde draait — die kan `groups` niet lezen en geeft `null`, en dan
      //    meet deze toets een aanroep met een leeg argument. 📏 Gemeten.
      const poging = await vreemde.db.rpc('vraag_lidmaatschap_aan', {
        p_group_id: groepId,
        p_bericht: `Laat me erin ${RLO}exe.gpj`,
      });

      // ⚠️ **Niet `error is not null`**: deze RPC geeft bij een geweigerde
      //    aanvraag een object terug en géén fout, dus een toets op `error`
      //    is groen wat er ook gebeurt. 📏 Ook dat is hier één keer misgegaan.
      const gelukt =
        poging.error === null && (poging.data as { ok?: boolean } | null)?.ok === true;

      const rijen = await adminDb()
        .from('group_join_requests')
        .select('bericht')
        .eq('group_id', groepId);
      expect(rijen.error).toBeNull();

      const berichten = ((rijen.data ?? []) as { bericht: string | null }[])
        .map((r) => r.bericht ?? '')
        .join('|');
      expect(berichten, 'een stuurteken staat in wat de beheerder leest').not.toContain(RLO);

      // De must-allow-helft van dezelfde handeling: een gewoon bericht landt wél.
      const gewoon = await vreemde.db.rpc('vraag_lidmaatschap_aan', {
        p_group_id: groepId,
        p_bericht: 'Laat me erin, ik loop ook hard',
      });
      expect(gewoon.error, `een gewoon verzoek viel om: ${gewoon.error?.message}`).toBeNull();
      expect((gewoon.data as { ok?: boolean }).ok, 'een gewoon verzoek werd geweigerd').toBe(true);
      expect(gelukt, 'het verzoek mét stuurteken landde').toBe(false);
    },
    TEST_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  // De must-allow-helft — zonder deze is elke weigertoets gratis
  // ---------------------------------------------------------------------------
  //
  // ⚠️⚠️ **Deze drie zijn hier het zwaarst, en dat is gemeten en niet beleefd.**
  //    Een CHECK die `zonder_bidi()` aanroept, valt zonder de `grant execute`
  //    aan `authenticated` om op `permission denied for function zonder_bidi` —
  //    bij élke schrijving op `goals`, ook eentje die niets met bidi te maken
  //    heeft. 📏 Dat is in 0256, 0269 én 0270 gebeurd en het was elke keer
  //    bijna een ship-stopper.

  it(
    'laat een gewone doeltitel gewoon door',
    async () => {
      const uit = await maakDoel('Drie keer per week hardlopen');
      expect(uit.error, `een gewone titel viel om: ${uit.error?.message}`).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een Arabische titel door — rechts-naar-links is geen stuurteken',
    async () => {
      // ⚠️ Het verschil dat deze toets bewaakt: Arabisch schrift lóópt van
      //    rechts naar links uit zichzelf, zonder één stuurteken. Een grendel
      //    die dat weigert, sluit een taal uit in plaats van een aanval.
      const uit = await maakDoel('الجري ثلاث مرات في الأسبوع');
      expect(uit.error, `een Arabische titel viel om: ${uit.error?.message}`).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een titel met een emoji door, samengesteld en al',
    async () => {
      const uit = await maakDoel('Hardlopen 🏃‍♀️ met het gezin 👨‍👩‍👧‍👦');
      expect(uit.error, `een titel met emoji viel om: ${uit.error?.message}`).toBeNull();
    },
    TEST_TIMEOUT,
  );
});
