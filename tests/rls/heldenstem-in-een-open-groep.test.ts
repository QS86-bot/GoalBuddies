import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql } from './psql-stack';

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
 * ⚠⚠ **Hier stond `trigger = 'misser'` als de rij die eróm gaat, en sinds 0278
 *    geeft deze functie die niet meer door.** QS8-493 gaf hem een scherm, en
 *    toen bleek `misser` door de dágelijkse nudge geschreven te worden — "vandaag
 *    niets gedaan" en niet "een week gemist". A41 opende gemiste wéken en
 *    domeinregel 9 zegt dat een dag overslaan géén gevolg heeft. `tussendoor`
 *    ging om dezelfde ronde weg: die draagt iemands quízheld en geen gebeurtenis.
 *
 *    De must-denies hieronder gebruiken daarom `stilte` (⇔ lucerna): drie dagen
 *    niets, en dat is wél tegenslag die A41 een open groep toestaat en die
 *    domeinregel 7 in een beschermde groep buiten de deur houdt. De belofte is
 *    onveranderd, alleen de rij waarmee ze gemeten wordt is er een die de
 *    functie nog geeft.
 *
 *    De redenering eronder is onveranderd en gold woordelijk voor `misser`: wie
 *    leest dat een held bij iemand langs is geweest, weet dat er iets gebeurd is.
 *    In een open groep is dat besluit A41; in een beschermde groep is het het
 *    schaamtemoment waar domeinregel 7 voor bestaat. Elke must-deny hieronder
 *    gebruikt daarom een tegenslagtrigger en geen mijlpaal.
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

/**
 * Een tijdstip op een hele UTC-dag ten opzichte van vandaag.
 *
 * ⚠️ **UTC en niet de zone van de testmachine, want de rand van het venster
 *    staat óók op UTC** (`date_trunc('day', now(), 'UTC')` in 0268). Een helper
 *    die `new Date(...)` in de lokale zone opbouwt, verschuift de gevallen met
 *    een paar uur en maakt van "dag −7, één minuut na middernacht" op een machine
 *    in `Pacific/Honolulu` stilletjes dag −8. Dan toetst dit bestand iets anders
 *    dan het zegt op elke machine behalve die van de schrijver.
 */
function dagRand(dagen: number, uur: number, minuut = 0): string {
  const nu = new Date();
  return new Date(
    Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate() + dagen, uur, minuut),
  ).toISOString();
}

/** Een verschijning op een exact tijdstip, voor de venstergevallen. */
async function noteerOp(
  wie: TestUser,
  held: string,
  trigger: string,
  wanneer: string,
): Promise<void> {
  const { error } = await adminDb()
    .from('hero_appearances')
    .insert({ user_id: wie.id, hero_key: held, trigger, shown_at: wanneer });
  if (error) throw new Error(`verschijning op ${wanneer}: ${error.message}`);
}

/**
 * Het voorvoegsel waaraan de bulkgebruikers van de klem-toets te herkennen zijn.
 *
 * ⚠️ Een eigen voorvoegsel en niet "alles wat de harness niet kent": `leegGroep()`
 *    verwijdert met een `delete` uit `auth.users`, en dat is een handeling die je
 *    nooit op een ruimere voorwaarde laat staan dan je bedoelt.
 */
const BULK = 'heldgroep-klem-';

/**
 * Zet `hoeveel` extra actieve leden met elk één verse verschijning in deze groep.
 *
 * ⚠️ Via `psql()` en niet via de harness: dit zijn rijen en geen sessies. Er is
 *    geen JWT voor nodig — ze worden gelezen, niet gebruikt om mee in te loggen —
 *    en vijfenvijftig keer `createTestUser()` kost een veelvoud aan tijd.
 */
function vulGroep(groupId: string, hoeveel: number): void {
  psql(`
    with nieuw as (
      select gen_random_uuid() as id, i from generate_series(1, ${hoeveel}) i
    ),
    u as (
      insert into auth.users (id, email)
      select n.id, '${BULK}' || n.i || '@klem.local' from nieuw n returning id
    ),
    p as (
      insert into profiles (id, display_name)
      select n.id, '${BULK}' || lpad(n.i::text, 3, '0') from nieuw n returning id
    ),
    m as (
      insert into group_members (group_id, user_id, status)
      select '${groupId}', n.id, 'active' from nieuw n returning user_id
    )
    insert into hero_appearances (user_id, hero_key, trigger, shown_at)
    select n.id, 'strix', 'mijlpaal', now() from nieuw n;
  `);
}

/** Haalt ze weer weg; de cascades ruimen profiel, lidmaatschap en verschijning op. */
function leegGroep(): void {
  psql(`delete from auth.users where email like '${BULK}%@klem.local'`);
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
  /** Lid van de open groep, en de enige wiens verschijningen de toetsen muteren. */
  let frida: TestUser;
  /** Twee rijen van dezelfde UTC-dag, allebei buiten het venster. */
  let gerrit: TestUser;
  /** Twee rijen van dezelfde UTC-dag, allebei binnen het venster. */
  let henk: TestUser;
  /** Krijgt een trigger die deze groep niet mag zien. */
  let ilse: TestUser;
  /** Twee leden voor de uitsluitingstoets van 0278; elk krijgt één verboden trigger. */
  let jasper: TestUser;
  let karin: TestUser;

  let open: Groep;
  let beschermd: Groep;
  let elders: Groep;

  beforeAll(async () => {
    anna = await createTestUser('heldgroep-anna');
    bram = await createTestUser('heldgroep-bram');
    cor = await createTestUser('heldgroep-cor');
    dirk = await createTestUser('heldgroep-dirk');
    eva = await createTestUser('heldgroep-eva');
    frida = await createTestUser('heldgroep-frida');
    gerrit = await createTestUser('heldgroep-gerrit');
    henk = await createTestUser('heldgroep-henk');
    ilse = await createTestUser('heldgroep-ilse');
    jasper = await createTestUser('heldgroep-jasper');
    karin = await createTestUser('heldgroep-karin');

    open = await maakGroep(anna, 'Heldgroep-open', 'open');
    beschermd = await maakGroep(anna, 'Heldgroep-beschermd', 'beschermd');
    elders = await maakGroep(dirk, 'Heldgroep-elders', 'open');

    await laatMeedoen(bram, open);
    await laatMeedoen(bram, beschermd);
    await laatMeedoen(eva, open);
    await laatMeedoen(frida, open);
    await laatMeedoen(gerrit, open);
    await laatMeedoen(henk, open);
    await laatMeedoen(ilse, open);
    await laatMeedoen(jasper, open);
    await laatMeedoen(karin, open);

    // ⚠️ Een **misser** en geen mijlpaal: dit is de rij waar domeinregel 7 over
    //    gaat, en een test die een neutrale trigger gebruikt toetst de
    //    makkelijke helft.
    await noteer(anna, 'lucerna', 'stilte');
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
        expect(gezien?.hero_key).toBe('lucerna');
        expect(gezien?.trigger).toBe('stilte');
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

        try {
          expect(await helden(bram, open.id), 'beschermd').toHaveLength(0);
        } finally {
          // ⚠️ **`finally` en geen gewone regel eronder.** Valt de assertie, dan
          //    blijft de groep zonder dit blok beschermd staan en gaat élke
          //    toets die erna komt om — met een melding die naar de verkeerde
          //    oorzaak wijst. Een toets die de fixture omzet, zet hem terug.
          const terug = await anna.db.rpc('zet_groepszichtbaarheid', {
            p_group_id: open.id,
            p_naar: 'open',
            p_bevestigd: true,
          });
          const terugUit = (terug.data ?? {}) as { ok?: boolean; reason?: string };
          expect(terugUit.ok, JSON.stringify(terug.data)).toBe(true);
        }

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
      'geeft nul rijen in een open groep die gearchiveerd is',
      async () => {
        /**
         * ⚠️ **De archieftoets zit in `lid_van_open_groep()` en niet hier, en
         *    juist dáárom hoort dit oppervlak hem vast te leggen.** 0102 heeft
         *    die toets erbij gezet met de reden dat een gearchiveerde open groep
         *    anders *"zijn schakels bleef uitdelen"*. Deze functie erft dat, en
         *    een erfenis zonder toets is een aanname: haalt iemand de poort ooit
         *    uit elkaar in twee conjuncten, dan valt de archiefhelft er stil af.
         *
         * ⚠️ **Een eigen wegwerpgroep en niet `open` of `elders`.** Archiveren is
         *    niet terug te draaien binnen deze toets, en een gearchiveerde
         *    fixture maakt van élke toets die erna komt een groene om de
         *    verkeerde reden — "nul rijen" klopt dan ook als de poort stuk is.
         */
        const tijdelijk = await maakGroep(anna, 'Heldgroep-archief', 'open');
        await laatMeedoen(bram, tijdelijk);
        await noteerOp(bram, 'lucerna', 'stilte', dagRand(0, 0));

        expect(rijVan(await helden(bram, tijdelijk.id), bram.id), 'vóór').toBeDefined();

        const weg = await anna.db.rpc('archiveer_groep', {
          p_group_id: tijdelijk.id,
          p_bevestigd: true,
        });
        const uit = (weg.data ?? {}) as { ok?: boolean; reason?: string };
        expect(uit.ok, JSON.stringify(weg.data)).toBe(true);

        expect(await helden(bram, tijdelijk.id), 'ná het archiveren').toHaveLength(0);
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
        /**
         * ⚠️ **Op Frida en niet op Anna, en dat is geen smaak.** Anna's `misser`
         *    is de rij waar élke must-deny hierboven op leunt; die hier
         *    overschrijven maakt van die toetsen iets dat alleen klopt zolang
         *    vitest de bestandsvolgorde aanhoudt. Een suite die ooit met
         *    `--shuffle` of parallel draait, meet dan iets anders dan ze zegt —
         *    en de ijking van de poort meet dan mee.
         */
        await noteer(frida, 'lucerna', 'stilte', 2);
        await noteer(frida, 'strix', 'mijlpaal');

        const vanFrida = (await helden(bram, open.id)).filter((rij) => rij.user_id === frida.id);

        expect(vanFrida, 'precies één rij per lid').toHaveLength(1);
        expect(vanFrida[0]?.trigger).toBe('mijlpaal');
        expect(rijVan(await helden(bram, open.id), anna.id)?.trigger, 'Anna onaangeroerd').toBe(
          'stilte',
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een verschijning van acht dagen oud eruit vallen',
      async () => {
        /**
         * 📏 IJKING C — de venstervoorwaarde uit 0268 weggehaald: deze toets werd
         *    rood (Cors `misser` van acht dagen stond in de lijst). Met de regel
         *    erin valt hij eruit.
         *
         * ⚠️ **De grens zelf is de toets, niet de twee gevallen eromheen.** Dag
         *    zes en dag acht laten de grens vrij tussen zeven en negen liggen;
         *    daarom staat hier ook de dag ervóór.
         */
        await laatMeedoen(cor, open);
        await noteerOp(cor, 'lucerna', 'stilte', dagRand(-8, 12));

        expect(rijVan(await helden(bram, open.id), cor.id), 'acht dagen').toBeUndefined();

        await noteerOp(cor, 'strix', 'mijlpaal', dagRand(-6, 12));

        const zes = rijVan(await helden(bram, open.id), cor.id);
        expect(zes, 'zes dagen').toBeDefined();
        expect(zes?.trigger).toBe('mijlpaal');
      },
      TEST_TIMEOUT,
    );

    it(
      'legt de rand op een hele UTC-dag en niet op een tijdstip',
      async () => {
        /**
         * ⚠️⚠️ **Dit is de grendel onder de reparatie uit de security-review, en
         *    de belofte is niet "zeven dagen" maar "de rand draagt geen tijd van
         *    de dag".** Met een kale `now() - interval '7 days'` verdwijnt een
         *    rij precies zeven dagen ná `shown_at`; wie deze functie herhaald
         *    opvraagt, leest daarmee het tijdstip terug tot op zijn polinterval —
         *    juist de kolom die met opzet niet in de handtekening staat.
         *
         *    `date_trunc('day', now(), 'UTC')` laat alles van één UTC-dag
         *    tegelijk wegvallen. De toets daarop is dus niet "hoe oud mag een rij
         *    zijn" maar: **twee rijen van dezelfde UTC-dag horen hetzelfde lot te
         *    delen**, hoe ver hun tijdstippen ook uit elkaar liggen.
         *
         * 📏 IJKING G — `date_trunc('day', now(), 'UTC')` vervangen door `now()`:
         *    deze toets werd rood, de vroege rij van dag −7 viel eruit en de late
         *    bleef staan. Zie §8 van het beslisdocument.
         */
        await noteerOp(gerrit, 'lucerna', 'stilte', dagRand(-8, 0, 1));
        await noteerOp(gerrit, 'lucerna', 'stilte', dagRand(-8, 23, 59));

        expect(
          rijVan(await helden(bram, open.id), gerrit.id),
          'beide rijen van dag −8 horen weg te vallen',
        ).toBeUndefined();

        await noteerOp(henk, 'lucerna', 'stilte', dagRand(-7, 0, 1));
        const vroeg = rijVan(await helden(bram, open.id), henk.id);
        expect(vroeg, 'de vroegste rij van dag −7 hoort te blijven').toBeDefined();

        await noteerOp(henk, 'lucerna', 'stilte', dagRand(-7, 23, 59));
        const laat = rijVan(await helden(bram, open.id), henk.id);
        expect(laat, 'en de laatste van diezelfde dag ook').toBeDefined();
        expect(laat?.trigger, 'en dat is de nieuwste van de twee').toBe('stilte');
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft alleen de twee eenduidige triggers die deze groep mag zien',
      async () => {
        /**
         * ⚠⚠ **Een allowlist en geen doorgeefluik.** De CHECK op
         *    `hero_appearances.trigger` laat zes waarden toe; deze functie geeft
         *    er sinds 0278 nog **twee** door. `nieuw_doel` zou de open groep
         *    vertellen dát dit lid een doel heeft aangemaakt — geen tegenslag,
         *    dus niet wat A41 opent, en per persoon in plaats van per doel, wat
         *    botst met domeinregel 4.
         *
         *    CLAUDE.md: *"Voor élk níeuw oppervlak is beschermd het antwoord tot
         *    iemand het tegendeel besluit."* Zonder deze toets verbreedt het
         *    oppervlak zichzelf op de dag dat er een zevende schrijver bij komt,
         *    en wordt niets daarvan rood.
         *
         * 📏 IJKING H — de `and a.trigger = any (array[…])` weggehaald: deze
         *    toets werd rood.
         */
        await noteerOp(ilse, 'lucerna', 'stilte', dagRand(-1, 12));
        expect(rijVan(await helden(bram, open.id), ilse.id)?.trigger, 'opstelling').toBe('stilte');

        // Een verse `nieuw_doel` hoort de zichtbare held níet te vervangen, en
        // hoort het lid ook niet uit de lijst te duwen: de belofte is "de laatste
        // held die deze groep mag zien".
        await noteerOp(ilse, 'meridian', 'nieuw_doel', dagRand(0, 0));

        const na = rijVan(await helden(bram, open.id), ilse.id);
        expect(na, 'het lid blijft in de lijst').toBeDefined();
        expect(na?.trigger, 'met zijn vorige zichtbare trigger').toBe('stilte');
        expect(na?.hero_key).toBe('lucerna');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat `misser` en `tussendoor` er sinds 0278 buiten — de kaart mag niets bewéren',
      async () => {
        /**
         * ⚠⚠ **Dit is de belofte van 0278 en de duurste les van QS8-493.** Tot
         *    16-09-2026 gaf deze functie ook `misser` en `tussendoor` door. Het
         *    scherm dat er toen bij kwam, kon daardoor het tegenovergestelde
         *    beweren van wat er gebeurd was:
         *
         *    📏 **`tussendoor` draagt geen gebeurtenis maar iemands quízheld.**
         *       `kiesStem()` geeft `{ held: hoofdheld, trigger: 'tussendoor' }`
         *       zódra er géén gebeurtenis is — ook bij `approval_received`, dus bij
         *       goéd nieuws. Is Ignis je quizheld, dan las de kaart
         *       "Bij Anna kwam Ignis langs", en Ignis is de held van `misser`.
         *       0268 zegt dit zelf in zijn kop; het scherm beweerde het tegendeel.
         *
         *    📏 **`misser` betekent "vandaag niets gedaan".** `nudgeReden()` laat
         *       de nudge gaan bij geen Dagzet en geen afronding vándaag met
         *       éérgens een open weekdoel; die nudge schrijft `misser`. Dat botst
         *       met domeinregel 9 (*"een dag overslaan heeft geen enkel gevolg"*)
         *       en A41 opende gemiste wéken.
         *
         * ⚠️ Deze toets staat op de bélofte en niet op de allowlist: hij schrijft
         *    de twee verboden triggers als eníge verschijning van een lid en
         *    eist dat dat lid niet in de lijst staat. Zou iemand de array
         *    uitbreiden, dan valt hij om — ook als de array anders geschreven is.
         */
        await noteerOp(jasper, 'ignis', 'misser', dagRand(0, 6));
        expect(
          rijVan(await helden(bram, open.id), jasper.id),
          'een misser hoort deze groep niet te bereiken',
        ).toBeUndefined();

        await noteerOp(karin, 'quip', 'tussendoor', dagRand(0, 6));
        expect(
          rijVan(await helden(bram, open.id), karin.id),
          'een tussendoor hoort deze groep niet te bereiken',
        ).toBeUndefined();
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
            { user_id: bram.id, hero_key: 'strix', trigger: 'mijlpaal', shown_at: zelfdeMoment },
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

  describe('de twee grenzen die de migratie opschrijft', () => {
    /**
     * ⚠️⚠️ **Deze twee toetsen bestaan omdat ze er niet waren, en dat is gemeten
     *    en niet bedacht.** De security-review op dit issue brak allebei de
     *    grenzen hieronder met de hand in de draaiende functie, en de suite bleef
     *    **13 van de 13 groen**. Een grens die alleen in een comment staat, is
     *    geen grens — dezelfde klasse als de grendel uit QS8-412 die nooit
     *    geschreven was.
     */
    it(
      'sorteert op naam en niet op tijd',
      async () => {
        /**
         * ⚠️ **Waarom dit een belofte is en geen smaak.** Een sortering op
         *    `shown_at` geeft de waarde niet prijs maar wél de vólgorde, en dat
         *    is "wie miste het laatst iets" — een kolom die met opzet niet in de
         *    handtekening staat, alsnog afleidbaar uit de rijvolgorde. Iemand kan
         *    dat over drie maanden omzetten met een net argument erbij ("de verse
         *    bovenaan leest fijner"), en zonder deze toets wordt niets rood.
         *
         * ⚠️ **De toets pint de vólgorde en niet de kolom.** `Object.keys` vangt
         *    dit niet: je mag sorteren op iets wat je niet teruggeeft.
         *
         * 📏 IJKING E — `order by s.display_name asc` vervangen door
         *    `order by s.shown_at desc` (met `shown_at` door de twee CTE's
         *    gevoerd, buiten de kolomlijst): deze toets werd rood.
         */
        const namen = (await helden(bram, open.id)).map((rij) => rij.display_name);

        expect(namen.length, 'er staat iemand in de lijst').toBeGreaterThan(1);
        expect(namen, 'oplopend op naam').toEqual([...namen].sort((a, b) => a.localeCompare(b)));
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft nooit meer dan vijftig rijen, wat de aanroeper ook vraagt',
      async () => {
        /**
         * ⚠️ **Onwrikbare regel 10, en het plafond is met opzet hard.** Een
         *    `p_limit` die de aanroeper vrij mag kiezen, is geen paginering maar
         *    een suggestie; de migratie zegt dat met zoveel woorden en niets hield
         *    het tegen.
         *
         * ⚠️ De toets staat op de **klem** en niet op het aantal rijen dat er
         *    toevallig is: hij vraagt er duizend en eist dat het antwoord niet
         *    boven vijftig komt. Zo blijft hij kloppen als de fixture groeit én
         *    als hij krimpt.
         *
         * 📏 IJKING F — `least(coalesce(p_limit, 20), 50)` vervangen door
         *    `coalesce(p_limit, 20)`: deze toets werd rood zodra de groep meer dan
         *    vijftig zichtbare leden had.
         */
        // ⚠️⚠️ **Vijfenvijftig extra leden, en die moeten er écht zijn.** Een
        //    toets die "hoogstens vijftig" eist op een groep van acht, is groen
        //    met én zonder de klem — precies de vorm waar regel 18 vraag 3 voor
        //    bestaat. Ze worden hier gemaakt en in `finally` weer weggehaald,
        //    zodat de andere toetsen in dit bestand een groep van acht houden.
        vulGroep(open.id, 55);
        try {
          const veel = await bram.db.rpc('groep_helden', {
            p_group_id: open.id,
            p_limit: 100000,
            p_offset: 0,
          });
          expect(veel.error).toBeNull();
          const rijen = (veel.data ?? []) as { totaal: number }[];

          expect(rijen.length, 'de klem knipt op vijftig').toBe(50);
          expect(rijen[0]?.totaal, 'en het totaal telt wél alles door').toBeGreaterThan(50);

          // ⚠️ En een negatieve of onzinnige waarde levert geen fout maar een lege
          //    pagina: `greatest(0, …)` aan beide kanten. Een 500 hier zou een
          //    aanroeper vertellen dát hij een grens raakte.
          const negatief = await bram.db.rpc('groep_helden', {
            p_group_id: open.id,
            p_limit: -5,
            p_offset: -5,
          });
          expect(negatief.error).toBeNull();
          expect((negatief.data ?? []) as unknown[]).toHaveLength(0);
        } finally {
          leegGroep();
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'telt in `totaal` de leden mét een zichtbare verschijning en niet de hele groep',
      async () => {
        /**
         * ⚠️ **`totaal` stond nergens onder toets en heeft toch een betekenis die
         *    ertoe doet.** Zou hij het aantal léden tellen in plaats van het
         *    aantal rijen, dan biedt een aanroeper een volgende pagina aan die
         *    leeg terugkomt — en, erger, verraadt het verschil tussen `totaal` en
         *    de rijen hoeveel leden er géén verschijning hebben.
         */
        const rijen = await helden(bram, open.id);

        expect(rijen.length, 'de fixture vult de eerste pagina niet').toBeLessThan(50);
        expect(new Set(rijen.map((r) => r.totaal)).size, 'één getal voor de hele pagina').toBe(1);
        expect(rijen[0]?.totaal).toBe(rijen.length);
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
        // ⚠️ **Geen exact aantal, want dat aantal ontstaat in een ánder blok
        //    hierboven.** Een toets die op "precies twee" staat, is in
        //    werkelijkheid een toets op de volgorde van de bestanden. Wat de
        //    belofte is: élke rij die Bram leest is van hemzelf.
        const verschijningen = await bram.db.from('hero_appearances').select('id, user_id');
        expect(verschijningen.error).toBeNull();
        const vreemd = (verschijningen.data ?? []).filter(
          (r) => (r as { user_id: string }).user_id !== bram.id,
        );
        expect(vreemd, 'Bram leest alleen zijn eigen rijen').toHaveLength(0);

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
