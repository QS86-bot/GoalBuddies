import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  anonDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql } from './psql-stack';

/**
 * De uitnodigingskaart na een vertrek — QS8-502, migratie 0277.
 *
 * ⚠️⚠️ **De naad: de schrijfkant was dicht en de leeskant niet.** 📏 Gemeten op
 *    de lokale stack: `join_group_with_code()` draagt allebei de toetsen die
 *    hier ontbraken — `blokkade_met_groep()` geeft `invalid`, een
 *    `inactive`-lidmaatschap geeft `removed` — dus terugkómen kon een
 *    weggestuurd lid al niet. Alleen de kaart erbóven bleef alles tonen: de
 *    volledige ledennamen en de **actuele** doeltitels van de groep die hem
 *    eruit had gezet, tot 60× per uur.
 *
 *    Dat is onwrikbare regel 18 vraag 1 in zijn zuiverste vorm. Twee correcte
 *    onderdelen, en geen test op de knoop ertussen. Dit bestand is die test.
 *
 * ⚠️ **De must-allow staat vooraan, en dat is niet decoratief.** Doeltitels op
 *    de uitnodigingskaart zijn een besluit: ze helpen iemand kiezen of hij
 *    meedoet, en acceptatiecriterium 2 zegt met zoveel woorden dat een gewone
 *    genodigde ze móét blijven zien. Een toets die alleen de weigering
 *    vastlegt, blijft groen bij een fix die de titels overal weghaalt — en dat
 *    is precies de richting die dit issue afwees.
 *
 * ⚠️ **De toetsen lezen `null` en niet een eigen foutcode.** 0019 maakte `null`
 *    één antwoord voor "ingetrokken, verlopen of nooit bestaan" zodat deze
 *    functie geen orakel is; 0277 hangt er een vierde geval aan. Zou een latere
 *    wijziging hier een eigen `reason` invoeren, dan wordt blokkeren — dat stil
 *    hoort te zijn (0145) — afleesbaar, en dan hoort deze toets om te vallen.
 *
 * IJKING — met de hand gedraaid op 16-09-2026, mutatie per grendel:
 *
 *   A  de hele wachttak uit `invite_preview()` gehaald
 *      → 3 rood: de weggestuurde, de geblokkeerde én de teller-toets. De twee
 *        must-allows blijven groen.
 *   B  alleen de `status = 'inactive'`-tak gehaald (de blokkadetak blijft staan)
 *      → **2** rood, en de geblokkeerde blijft groen. 📏 Hier stond eerst één,
 *        en dat was een voorspelling en geen meting: de weggestuurde kíjkt dan
 *        niet alleen weer naar binnen, hij stookt óók de teller weer vol. Dat
 *        die twee samen omvallen is precies waarom het twee toetsen zijn.
 *      📏 **En dit is de ijking die de richting bepaalt.** In deze opstelling
 *        geeft `blokkade_met_groep()` `f`, dus richting 2 uit het issue —
 *        *"`invite_preview()` toetst de blokkade"* — zou dit geval hebben laten
 *        staan, terwijl acceptatiecriterium 1 *weggestuurd óf geblokkeerd* zegt.
 *   C  de wachttak ná de teller gezet in plaats van ervóór
 *      → 1 rood: de teller-toets, en die valt om op zijn eigen belofte
 *        (*"een weggestuurd lid heeft de teller van de groep volgestookt"*) en
 *        niet op de weigering. De twee weigeringstoetsen blijven groen: de
 *        weigering zelf klopt dan nog steeds, alleen te laat.
 *   D  `not mag_groep_lezen(g.id)` uit de wachttak gehaald
 *      → 1 rood: de must-allow van een actief lid, op zijn eigen belofte. De
 *        andere vijf blijven groen — en dát is de reden dat die toets er is.
 *        ⚠⚠ De eerste versie van 0277 hád die voorwaarde niet, en geen van de
 *        ijkingen A–C vond dat: alle drie braken de wéigering en keken of die
 *        omviel, en geen ervan vroeg of de weigering te brééd was.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 120_000;

/** Het plafond uit migratie 0131. */
const LIMIET = 60;

interface Opstelling {
  eigenaar: TestUser;
  weggestuurd: TestUser;
  geblokkeerd: TestUser;
  genodigde: TestUser;
  groupId: string;
  code: string;
}

describe.skipIf(!rlsTestsConfigured)('de uitnodigingskaart na een vertrek', () => {
  let f: Opstelling;

  beforeAll(async () => {
    const eigenaar = await createTestUser('kaart-eigenaar');
    const weggestuurd = await createTestUser('kaart-weggestuurd');
    const geblokkeerd = await createTestUser('kaart-geblokkeerd');
    const genodigde = await createTestUser('kaart-genodigde');

    const groep = await eigenaar.db.rpc('create_group', {
      group_name: 'Kaart na vertrek',
      huddle_day: 1,
    });
    if (groep.error) throw new Error(`create_group: ${groep.error.message}`);
    const g = (groep.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`create_group: ${JSON.stringify(groep.data)}`);
    const groupId = g.group.id;
    const code = g.group.invite_code;
    registreerGroep(groupId);

    // ⚠️ Een doel dat aan de groep hangt — zónder dat is `goal_title` altijd
    //    null en bewijst de must-allow niets.
    const doel = await adminDb()
      .from('goals')
      .insert({
        owner_id: eigenaar.id,
        title: 'Stoppen met drinken',
        status: 'active',
        target_date: '2026-12-31',
      })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel aanmaken: ${doel.error.message}`);
    await adminDb()
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: groupId });

    // ⚠⚠ **Weggestuurd via de échte knop en niet met een `update` — dat is de
    //    naad.** Zou de opstelling `status = 'inactive'` met de hand zetten, dan
    //    toetst dit bestand een eigenschap van `invite_preview()` gégeven een
    //    zelfgemaakte toestand, en niet de belofte *"wie via de uitzetknop de
    //    groep uit is, kijkt niet meer naar binnen"* (regel 18, vraag 2 en 4).
    //
    //    📏 En dat is hier geen theorie: de twee vertrekroutes doen het
    //    vérschillend. `verwijder_lid()` doet `update … set status = 'inactive'`,
    //    `verlaat_groep()` doet `delete from group_members`. Beweegt de eerste
    //    ooit naar de tweede vorm, dan verdampt de fix — en met een handgezette
    //    rij zou geen enkele toets rood worden. Gevonden in de security-review.
    // ⚠️ Eerst toetreden langs de gewone weg, anders is er niets om weg te
    //    sturen — en dan doet `verwijder_lid()` niets en zegt er niets over.
    //    📏 Precies dat gebeurde bij de eerste versie van deze opstelling: de
    //    RPC gaf geen fout en liet géén rij achter. De controle erna ving het.
    const toegetreden = await weggestuurd.db.rpc('join_group_with_code', { code });
    if (toegetreden.error) throw new Error(`toetreden: ${toegetreden.error.message}`);
    expect(
      (toegetreden.data as { ok?: boolean })?.ok,
      `toetreden mislukte: ${JSON.stringify(toegetreden.data)}`,
    ).toBe(true);

    const eruit = await eigenaar.db.rpc('verwijder_lid', {
      p_group_id: groupId,
      p_user_id: weggestuurd.id,
      p_bevestigd: true,
    });
    if (eruit.error) throw new Error(`verwijder_lid: ${eruit.error.message}`);

    const stand = psql(
      `select status from group_members ` +
        `where group_id = '${groupId}' and user_id = '${weggestuurd.id}'`,
    ).trim();
    if (stand !== 'inactive') throw new Error(`verwijder_lid liet status = ${stand || 'geen rij'}`);

    // Geblokkeerd — en met opzet nooit lid geweest.
    const blok = await eigenaar.db.rpc('blokkeer', { p_user: geblokkeerd.id });
    if (blok.error) throw new Error(`blokkeer: ${blok.error.message}`);

    f = { eigenaar, weggestuurd, geblokkeerd, genodigde, groupId, code };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  async function kaart(wie: TestUser | null): Promise<Record<string, unknown> | null> {
    const db = wie === null ? anonDb() : wie.db;
    const { data, error } = await db.rpc('invite_preview', { code: f.code });
    if (error) throw new Error(`invite_preview: ${error.message}`);
    return data as unknown as Record<string, unknown> | null;
  }

  describe('een gewone genodigde ziet de kaart waar hij voor bedoeld is', () => {
    it(
      'toont de ledennaam én de doeltitel aan wie nog geen lid is',
      async () => {
        const uit = await kaart(f.genodigde);

        expect(uit, 'de genodigde kreeg geen kaart').not.toBeNull();
        expect(uit?.detailed, 'een ingelogde genodigde hoort de detailkaart te zien').toBe(true);

        const leden = uit?.members as { display_name?: string; goal_title?: string }[];
        expect(leden.length, 'de kaart noemt geen leden').toBeGreaterThan(0);
        expect(
          leden.some((m) => m.goal_title === 'Stoppen met drinken'),
          'de doeltitel staat niet op de kaart — dát is waar hij voor is',
        ).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'toont een actief lid de kaart van zijn eigen groep, ook als een medelid hem blokkeert',
      async () => {
        /**
         * ⚠⚠ **Deze toets ontbrak, en dat is precies het gat waar de eerste
         *    versie van 0277 doorheen viel.** De twee andere must-allows gaan
         *    allebei over iemand die géén lid is — de genodigde en de anonieme
         *    bezoeker — en bleven dus groen terwijl de kaart voor élk actief lid
         *    van de groep verdwenen was. Gevonden in de security-review.
         *
         * 📏 Gemeten op de eerste versie: een actief admin met
         *    `mag_groep_lezen() = t` en `status = 'active'` kreeg `null` zodra
         *    een medelid haar blokkeerde. `blokkade_met_groep()` vraagt niet
         *    *"is deze persoon eruit gezet"* maar *"zit er ergens in deze groep
         *    een blokkade tussen deze persoon en een actief lid"*, en blokkeren
         *    beéindigt geen lidmaatschap.
         *
         * ⚠️ Het misbruikpad was hoofdgedrag: één lid blokkeert de andere elf
         *    (geen beheerdersrecht nodig, plafond 500 per dag) en niemand in de
         *    groep ziet zijn eigen uitnodigingskaart nog — stil, want blokkeren
         *    is stil, en alleen de blokkeerder kan het opheffen.
         */
        const blokkeerder = await createTestUser('kaart-medelid');
        const toe = await blokkeerder.db.rpc('join_group_with_code', { code: f.code });
        if (toe.error) throw new Error(`join_group_with_code: ${toe.error.message}`);
        expect((toe.data as { ok?: boolean })?.ok, 'het medelid kwam er niet in').toBe(true);

        const blok = await blokkeerder.db.rpc('blokkeer', { p_user: f.eigenaar.id });
        if (blok.error) throw new Error(`blokkeer: ${blok.error.message}`);

        // De eigenaar is nog gewoon actief lid — dat is de hele premisse.
        // ⚠️ Gelezen uit `group_members` en niet met `mag_groep_lezen()`: `psql()`
        //    draait als superuser zónder JWT, dus `auth.uid()` is daar null en die
        //    helper geeft altijd `f`. 📏 Dat gaf deze toets eerst een rood op zijn
        //    eigen opstelling — dezelfde vorm als de tellersleutel bij QS8-496.
        expect(
          psql(
            `select status from group_members ` +
              `where group_id = '${f.groupId}' and user_id = '${f.eigenaar.id}'`,
          ).trim(),
          'de opstelling klopt niet: de eigenaar is geen actief lid meer',
        ).toBe('active');

        const uit = await kaart(f.eigenaar);
        expect(uit, 'een actief lid ziet de kaart van zijn eigen groep niet meer').not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'toont zonder account nog steeds de ongedetailleerde kaart',
      async () => {
        // ⚠️ De andere helft van de must-allow. 0277 raakt alleen een ingelogde
        //    aanroeper; wie niet inlogt kán niet weggestuurd of geblokkeerd zijn,
        //    en zijn kaart hoort onveranderd te blijven.
        const uit = await kaart(null);

        expect(uit, 'de anonieme kaart is weg').not.toBeNull();
        expect(uit?.detailed).toBe(false);
        expect((uit?.members as unknown[]).length, 'anoniem ziet geen leden meer').toBeGreaterThan(
          0,
        );
      },
      TEST_TIMEOUT,
    );
  });

  describe('maar wie eruit is, kijkt niet meer naar binnen', () => {
    it(
      'geeft een weggestuurd lid niets, ook zonder blokkade',
      async () => {
        // ⚠️⚠️ **Dit lid is met opzet níet geblokkeerd.** 📏 Gemeten:
        //    `blokkade_met_groep()` geeft hier `f`. Richting 2 uit het issue —
        //    alleen de blokkade toetsen — laat dit geval dus staan, terwijl
        //    acceptatiecriterium 1 *weggestuurd óf geblokkeerd* zegt.
        const geblokkeerd = psql(
          `select blokkade_met_groep('${f.groupId}', '${f.weggestuurd.id}')`,
        ).trim();
        expect(geblokkeerd, 'de opstelling klopt niet: dit lid is wél geblokkeerd').toBe('f');

        expect(await kaart(f.weggestuurd), 'een weggestuurd lid ziet de kaart nog').toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft een geblokkeerde niets, ook zonder ooit lid te zijn geweest',
      async () => {
        const lid = psql(
          `select count(*) from group_members ` +
            `where group_id = '${f.groupId}' and user_id = '${f.geblokkeerd.id}'`,
        ).trim();
        expect(lid, 'de opstelling klopt niet: deze is wél lid geweest').toBe('0');

        expect(await kaart(f.geblokkeerd), 'een geblokkeerde ziet de kaart nog').toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een INGELOGD weggestuurd lid de uitnodigingsteller niet volstoken',
      async () => {
        /**
         * ⚠️⚠️ **Dit is de reden dat de wachttak vóór de teller staat en niet
         *    erna, en het is een eigen belofte en geen bijvangst.** De teller van
         *    0131 is per gróép: raakt hij vol, dan krijgt iedereen met die code
         *    `{limiet_bereikt: true}`. 📏 Gemeten vóór 0277: een weggestuurd lid
         *    maakte hem met 61 aanroepen vol, waarna een échte genodigde de kaart
         *    niet meer kreeg — het uitnodigen van de hele groep lag een uur stil.
         *
         * ⚠️ De toets telt tot boven het plafond en kijkt daarna of een ánder er
         *    nog bij kan. Dat is de belofte; "de weggestuurde kreeg null" is het
         *    onderdeel, en dat staat hierboven al.
         *
         * ⚠⚠ **INGELOGD staat met opzet in de naam, want verder reikt deze toets
         *    niet.** 📏 Gemeten in de security-review: de wachttak begint met
         *    `auth.uid() is not null`, en `invite_preview()` is
         *    `anon`-uitvoerbaar. Dezelfde weggestuurde persoon die uitlogt,
         *    krijgt de kaart wél én hoogt de teller wél op — die DoS bestaat dus
         *    nog steeds, voor iedereen die de code heeft. Hij hoort bij 0131 en
         *    niet bij 0277, en staat als rij in `docs/ENGINEER-REVIEW.md`.
         *
         *    Deze toets dékt dat niet, en de naam zegt dat nu. Een toets die
         *    "de teller wordt niet volgestookt" heet terwijl hij alleen de
         *    ingelogde helft meet, bewaakt een andere zin dan hij draagt.
         */
        // ⚠️ **De lus toetst met opzet niets.** Dat de weggestuurde `null` krijgt,
        //    staat hierboven al; zou deze lus dat nóg eens beweren, dan valt de
        //    toets om op de weigering in plaats van op zijn eigen belofte — en
        //    dan bewaakt hij die belofte niet. 📏 Gezien bij het ijken: met de
        //    wachttak ná de teller viel hij om op "aanroep 57 gaf een kaart",
        //    wat over de weigering gaat en niet over de genodigde.
        for (let n = 0; n < LIMIET + 1; n += 1) {
          await kaart(f.weggestuurd);
        }

        const uit = await kaart(f.genodigde);
        expect(uit, 'de genodigde kreeg geen kaart meer').not.toBeNull();
        expect(
          uit?.limiet_bereikt,
          'een weggestuurd lid heeft de teller van de groep volgestookt',
        ).toBeUndefined();
      },
      TEST_TIMEOUT,
    );
  });
});
