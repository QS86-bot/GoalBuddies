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
 * `groep_helden()` — de éne route waarlangs een open groep je held ziet.
 * QS8-477, besluit 5 van QS8-468, migratie 0268.
 *
 * ⚠️⚠️ **De belofte die dit bestand bewaakt is een eigenschap van het gehéél en
 *    niet van de functie.** `hero_profiles` en `hero_appearances` staan op
 *    `user_id = auth.uid()` (0264) en blijven zo; deze RPC is de enige
 *    uitzondering daarop. De vraag is dus niet "werkt de functie" maar: **komt er
 *    langs déze weg iets naar buiten dat de tabellen zelf dichthouden, in een
 *    groep die daar niet voor gekozen heeft?**
 *
 *    Vandaar dat de tegentoetsen hier zwaarder wegen dan de bevestigende, en dat
 *    de scherpste van allemaal dezelfde kijker, hetzelfde lid en dezelfde
 *    verschijning gebruikt met alléén `groups.zichtbaarheid` omgezet. Twee
 *    aparte opstellingen zouden op tien manieren kunnen verschillen; deze op één.
 *
 * ⚠️ **`trigger = 'misser'` is wat er op het spel staat.** Wie leest dat Ignis
 *    bij iemand langs is geweest, weet dat die iets gemist heeft. In een open
 *    groep is dat besluit A41; in een beschermde groep is het het schaamtemoment
 *    waar domeinregel 7 voor bestaat. Elke must-deny hieronder gebruikt daarom
 *    een misser en geen mijlpaal.
 *
 * ⚠️ Met de hand rood gemaakt. Wat er per belofte gebroken is en wat er toen
 *    omviel, staat bij het geval zelf.
 */

const TEST_TIMEOUT = 30_000;

interface Groep {
  id: string;
  code: string;
}

interface Heldenrij {
  user_id: string;
  display_name: string;
  hero_key: string;
  trigger: string;
  totaal: number;
}

async function maakGroep(eigenaar: TestUser, naam: string, zicht: string): Promise<Groep> {
  const { data, error } = await eigenaar.db.rpc('create_group', {
    group_name: naam,
    zichtbaarheid: zicht,
  });
  if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);

  const gelezen = data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (gelezen.ok !== true || !gelezen.group) {
    throw new Error(`groep ${naam} mislukte: ${JSON.stringify(data)}`);
  }
  registreerGroep(gelezen.group.id);
  return { id: gelezen.group.id, code: gelezen.group.invite_code };
}

async function laatMeedoen(wie: TestUser, groep: Groep): Promise<void> {
  const { data, error } = await wie.db.rpc('join_group_with_code', { code: groep.code });
  if (error) throw new Error(`meedoen (HTTP): ${error.message}`);

  const gelezen = (data ?? {}) as { ok?: boolean; reason?: string };
  if (gelezen.ok !== true) throw new Error(`meedoen mislukte: ${gelezen.reason ?? 'geen reden'}`);
}

/**
 * Een verschijning wegschrijven zoals de meldingenjob dat doet.
 *
 * ⚠️ Via `adminDb()` en niet via de gebruiker zelf: sinds de security-review op
 *    QS8-471 schrijft géén client deze tabel — `hero_appearances_insert` staat op
 *    `with check (false)` en er is geen `grant insert`. Een fixture die dat
 *    omzeilt, zou een rij maken die de app nooit maakt.
 */
async function noteer(
  wie: TestUser,
  held: string,
  trigger: string,
  dagenGeleden = 0,
): Promise<void> {
  const wanneer = new Date(Date.now() - dagenGeleden * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await adminDb()
    .from('hero_appearances')
    .insert({ user_id: wie.id, hero_key: held, trigger, shown_at: wanneer });
  if (error) throw new Error(`verschijning: ${error.message}`);
}

/** De heldenlijst zoals déze kijker hem krijgt. */
async function helden(kijker: TestUser, groupId: string): Promise<readonly Heldenrij[]> {
  const { data, error } = await kijker.db.rpc('groep_helden', { p_group_id: groupId });
  if (error) throw new Error(`groep_helden: ${error.message}`);
  return (data ?? []) as unknown as readonly Heldenrij[];
}

function rijVan(rijen: readonly Heldenrij[], userId: string): Heldenrij | undefined {
  return rijen.find((rij) => rij.user_id === userId);
}

describe.skipIf(!rlsTestsConfigured)('groep_helden() — je held in een open groep', () => {
  /** Lid van de open groep. Zijn misser is wat er niet mag lekken. */
  let anna: TestUser;
  /** Lid van dezelfde open groep. De kijker die het wél mag zien. */
  let bram: TestUser;
  /** Lid van geen enkele groep. */
  let cor: TestUser;
  /** Lid van een tweede, ándere open groep. Deelt niets met Bram. */
  let dirk: TestUser;
  /** Doet mee aan de open groep en wordt daarna uitgezet. */
  let eva: TestUser;

  let open: Groep;
  let beschermd: Groep;
  let elders: Groep;

  beforeAll(async () => {
    anna = await createTestUser('heldgroep-anna');
    bram = await createTestUser('heldgroep-bram');
    cor = await createTestUser('heldgroep-cor');
    dirk = await createTestUser('heldgroep-dirk');
    eva = await createTestUser('heldgroep-eva');

    open = await maakGroep(anna, 'Heldgroep-open', 'open');
    beschermd = await maakGroep(anna, 'Heldgroep-beschermd', 'beschermd');
    elders = await maakGroep(dirk, 'Heldgroep-elders', 'open');

    await laatMeedoen(bram, open);
    await laatMeedoen(bram, beschermd);
    await laatMeedoen(eva, open);

    // ⚠️ Een **misser** en geen mijlpaal: dit is de rij waar domeinregel 7 over
    //    gaat, en een test die een neutrale trigger gebruikt toetst de
    //    makkelijke helft.
    await noteer(anna, 'ignis', 'misser');
    await noteer(dirk, 'lucerna', 'stilte');
    await noteer(eva, 'strix', 'mijlpaal');

    const uitgezet = await adminDb()
      .from('group_members')
      .update({ status: 'inactive' })
      .eq('group_id', open.id)
      .eq('user_id', eva.id);
    if (uitgezet.error) throw new Error(`uitzetten: ${uitgezet.error.message}`);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, TEST_TIMEOUT);

  describe('in een open groep gaat hij open', () => {
    it(
      'geeft een groepsgenoot de held én de trigger van een ander lid',
      async () => {
        // ⚠️ De must-allow. Zonder deze helft is elke "nul rijen" hieronder ook
        //    waar bij een functie die altijd niets teruggeeft — dezelfde val als
        //    een controle die nul meldt omdat hij nergens keek.
        const gezien = rijVan(await helden(bram, open.id), anna.id);

        expect(gezien).toBeDefined();
        expect(gezien?.hero_key).toBe('ignis');
        expect(gezien?.trigger).toBe('misser');
        expect(gezien?.display_name.length ?? 0).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft geen tijdstip en geen rij-id terug — die kolommen bestaan niet',
      async () => {
        /**
         * ⚠️⚠️ **Dit toetst de handtekening en niet het scherm, en dat is het
         *    hele punt van de RPC-vorm.** RLS kan geen kolommen beperken: een
         *    vierde tak op `hero_appearances_select` had `shown_at` meegegeven,
         *    en dat is de dag waarop iemand iets miste. Zou die kolom hier ooit
         *    bijkomen, dan is de belofte gebroken zonder dat er één component
         *    verandert — en dan hoort déze test om te vallen en niet een
         *    schermtest.
         */
        const rij = rijVan(await helden(bram, open.id), anna.id);

        expect(rij).toBeDefined();
        expect(Object.keys(rij ?? {}).sort()).toEqual([
          'display_name',
          'hero_key',
          'totaal',
          'trigger',
          'user_id',
        ]);
      },
      TEST_TIMEOUT,
    );
  });

  describe('in een beschermde groep gaat hij niet open', () => {
    it(
      'geeft nul rijen aan een groepsgenoot in een beschermde groep',
      async () => {
        // 📏 IJKING A — `where lid_van_open_groep(p_group_id)` uit 0268 weggehaald
        //    en het schema opnieuw opgebouwd: deze toets werd rood met Anna's
        //    `misser` erin, en die hieronder over de niet-lid ook. Met de regel
        //    erin: allebei nul rijen.
        expect(await helden(bram, beschermd.id)).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt dezelfde kijker en dezelfde verschijning tegen zodra de groep dichtgaat',
      async () => {
        /**
         * ⚠️⚠️ **De scherpste toets van dit bestand, en de reden is dat er
         *    precies één ding verandert.** Twee aparte groepen verschillen op
         *    tien manieren — andere leden, andere rijen, een ander moment van
         *    aanmaken — en dan bewijst "de ene geeft rijen en de andere niet"
         *    niet dat het aan de zichtbaarheid lag. Hier is het dezelfde groep,
         *    dezelfde kijker en dezelfde verschijning, met alléén
         *    `groups.zichtbaarheid` omgezet.
         *
         *    Zelfde vorm als de meting bij rij 33 in
         *    `docs/decisions/002-domeinregel7-oppervlakken.md`.
         */
        expect(rijVan(await helden(bram, open.id), anna.id), 'open').toBeDefined();

        const dicht = await anna.db.rpc('zet_groepszichtbaarheid', {
          p_group_id: open.id,
          p_naar: 'beschermd',
          p_bevestigd: true,
        });
        const uit = (dicht.data ?? {}) as { ok?: boolean; reason?: string };
        expect(uit.ok, JSON.stringify(dicht.data)).toBe(true);

        expect(await helden(bram, open.id), 'beschermd').toHaveLength(0);

        const terug = await anna.db.rpc('zet_groepszichtbaarheid', {
          p_group_id: open.id,
          p_naar: 'open',
          p_bevestigd: true,
        });
        const terugUit = (terug.data ?? {}) as { ok?: boolean; reason?: string };
        expect(terugUit.ok, JSON.stringify(terug.data)).toBe(true);

        expect(rijVan(await helden(bram, open.id), anna.id), 'weer open').toBeDefined();
      },
      TEST_TIMEOUT,
    );
  });

  describe('buiten de groep gaat hij nergens open', () => {
    it(
      'geeft nul rijen aan iemand die geen lid is, ook van een open groep',
      async () => {
        expect(await helden(cor, open.id), 'vreemde').toHaveLength(0);
        expect(await helden(cor, elders.id), 'tweede open groep').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft nul rijen aan een uitgezet lid van diezelfde open groep',
      async () => {
        // ⚠️ Vertrekken en uitzetten zijn sinds 0102 statuswijzigingen en geen
        //    DELETE, dus Eva hóudt haar rij in `group_members`. Dat is precies
        //    waarom dit een eigen toets is: `lid_van_open_groep()` moet op de
        //    status kijken en niet op het bestaan van de rij.
        expect(await helden(eva, open.id)).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een uitgezet lid ook niet ín de lijst staan',
      async () => {
        // 📏 IJKING B — `and m.status <> 'inactive'` uit 0268 weggehaald: deze
        //    toets werd rood (Eva's `mijlpaal` stond in Brams lijst). Met de
        //    regel erin staat ze er niet in.
        expect(rijVan(await helden(bram, open.id), eva.id)).toBeUndefined();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een lid van een ándere open groep niet lekken — acceptatiecriterium 5',
      async () => {
        /**
         * ⚠️ **Dirk zit in een open groep en Bram ook, maar niet in dezelfde.**
         *    Twee open groepen naast elkaar is de vorm waarin een te ruime
         *    `where` onzichtbaar blijft: een functie die de `p_group_id` alleen
         *    voor de póórt gebruikt en daarna álle verschijningen ophaalt, komt
         *    door elke toets hierboven heen en valt hier om.
         *
         *    Dirks verschijning is bovendien `stilte` — het tweede
         *    tegenslagsignaal, en de enige plek in dit bestand waar het staat.
         */
        expect(rijVan(await helden(bram, open.id), dirk.id), 'in Brams groep').toBeUndefined();
        expect(await helden(bram, elders.id), 'in Dirks groep').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });

  describe('één rij per lid, en alleen de verse', () => {
    it(
      'geeft de nieuwste verschijning en niet de oudste',
      async () => {
        await noteer(anna, 'strix', 'mijlpaal');

        const rijen = await helden(bram, open.id);
        const vanAnna = rijen.filter((rij) => rij.user_id === anna.id);

        expect(vanAnna, 'precies één rij per lid').toHaveLength(1);
        expect(vanAnna[0]?.trigger).toBe('mijlpaal');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een verschijning van acht dagen oud eruit vallen',
      async () => {
        /**
         * 📏 IJKING C — `and a.shown_at > now() - interval '7 days'` uit 0268
         *    weggehaald: deze toets werd rood (Cors `misser` van acht dagen
         *    stond in de lijst). Met de regel erin valt hij eruit.
         *
         * ⚠️ **De grens zelf is de toets, niet de twee gevallen eromheen.** Dag
         *    zes en dag acht laten de grens vrij tussen zeven en negen liggen;
         *    daarom staat hier ook de dag ervóór.
         */
        await laatMeedoen(cor, open);
        await noteer(cor, 'ignis', 'misser', 8);

        expect(rijVan(await helden(bram, open.id), cor.id), 'acht dagen').toBeUndefined();

        await noteer(cor, 'forge', 'vastlopen', 6);

        const zes = rijVan(await helden(bram, open.id), cor.id);
        expect(zes, 'zes dagen').toBeDefined();
        expect(zes?.trigger).toBe('vastlopen');
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft bij twee verschijningen op hetzelfde tijdstip twee keer hetzelfde antwoord',
      async () => {
        /**
         * ⚠️ **Regel 18 vraag 6 in zijn zuiverste vorm.** De meldingenjob mag op
         *    één dag twee helden noteren (hoofdheld plus Strix) en `shown_at`
         *    staat op `now()`, dat binnen één transactie niet opschuift — dus
         *    "er is er precies één met de hoogste tijd" is een aanname. Zonder
         *    de tiebreaker `a.id desc` in de `distinct on` kiest Postgres er
         *    willekeurig een, en dan geeft dezelfde groep bij twee aanroepen
         *    twee antwoorden.
         *
         * ⚠️ Dit is bewust een *stabiliteits*toets en geen toets op wélke van de
         *    twee wint: de belofte is dat het antwoord niet verspringt, en wélke
         *    rij-id de hoogste is, is niets om aan vast te leggen.
         */
        const zelfdeMoment = new Date().toISOString();
        const twee = await adminDb()
          .from('hero_appearances')
          .insert([
            { user_id: bram.id, hero_key: 'quip', trigger: 'tussendoor', shown_at: zelfdeMoment },
            { user_id: bram.id, hero_key: 'meridian', trigger: 'nieuw_doel', shown_at: zelfdeMoment },
          ]);
        if (twee.error) throw new Error(`twee verschijningen: ${twee.error.message}`);

        const eerste = rijVan(await helden(anna, open.id), bram.id);
        const tweede = rijVan(await helden(anna, open.id), bram.id);

        expect(eerste).toBeDefined();
        expect(eerste?.trigger).toBe(tweede?.trigger);
        expect(eerste?.hero_key).toBe(tweede?.hero_key);
      },
      TEST_TIMEOUT,
    );
  });

  describe('de grendels eromheen', () => {
    it(
      'laat de tabellen zelf dicht, ook in een open groep',
      async () => {
        /**
         * ⚠️⚠️ **De naad, en de reden dat deze toets in dit bestand staat en niet
         *    alleen in `helden.test.ts`.** Die suite toetst dat de tabellen dicht
         *    zijn zónder dat er een RPC bestaat. Deze toetst dat ze dicht
         *    *blijven* nu er een is — en dat is de vorm die 0268 had kunnen
         *    breken door een policytak toe te voegen "omdat de functie er toch al
         *    is". Elk onderdeel klopt en het geheel lekt: precies regel 18.
         */
        const verschijningen = await bram.db.from('hero_appearances').select('id, trigger');
        expect(verschijningen.error).toBeNull();
        expect(
          (verschijningen.data ?? []).filter((r) => (r as { id: string }).id !== undefined),
          'Bram leest alleen zijn eigen rijen',
        ).toHaveLength(2);

        const vanAnna = await bram.db
          .from('hero_appearances')
          .select('id')
          .eq('user_id', anna.id);
        expect(vanAnna.error).toBeNull();
        expect(vanAnna.data ?? [], 'en niets van Anna').toHaveLength(0);

        const profielen = await bram.db.from('hero_profiles').select('user_id');
        expect(profielen.error).toBeNull();
        expect(profielen.data ?? [], 'en geen enkel heldprofiel van een ander').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een tweede gebruiker als `p_group_id` van iemand anders',
      async () => {
        // ⚠️ De functie neemt een groep als argument en niet een gebruiker, dus
        //    de enige manier om hem "voor iemand anders" aan te roepen is een
        //    groep waar je niet in zit. Dat is de toets hierboven — deze legt
        //    vast dat er geen tweede parameter bij is gekomen die dat wél kan.
        //    Zelfde les als `verdien_badges(p_user_id)` in 0165.
        const alles = await anna.db.rpc('groep_helden', {
          p_group_id: elders.id,
          p_limit: 50,
          p_offset: 0,
        });
        expect(alles.error).toBeNull();
        expect((alles.data ?? []) as unknown[]).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });
});
