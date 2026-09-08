import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql } from './psql-stack';

/**
 * Een chatbericht is niet te bewerken — QS8-327, migratie 0193.
 *
 * ⚠️ **Dit bestand toetste tot 08-09-2026 het tegenovergestelde**, en dat is
 *    geen koerswijziging maar het sluiten van een tegenspraak. Er stond een
 *    `chat_messages_update` met een venster van vijftien minuten, en dit bestand
 *    bewaakte dat venster keurig. Wat er níét was, is een knop:
 *
 *      📏 `.update()` op chat_messages in `src/` of `app/`     geen
 *      📏 functies in het schema die chat_messages UPDATEN      geen
 *
 *    En in `src/shared/ui/ChatRegel.tsx` stond bij de plek waar die knop zou
 *    komen met zoveel woorden waaróm hij er niet is: *"Een bewerkte regel in een
 *    gesprek van drie mensen is een gesprek waarvan de helft achteraf kan
 *    veranderen. Weghalen is eerlijker: dan is de regel weg en niet stil
 *    anders."* De app had de vraag dus al beantwoord; alleen de database wist
 *    het niet. 0193 laat ze hetzelfde zeggen.
 *
 * ⚠️ **Wat de weigering nu is, en waarom dat beter is dan wat het was.**
 *    📏 Gemeten op 08-09-2026, vóór en na 0193, met een echt JWT tegen de lokale
 *    PostgREST:
 *
 *      vóór 0193, eigen vers bericht      HTTP 200  — de bewerking landde
 *      vóór 0193, bericht van een ánder   HTTP 200  []  — stille weigering
 *      ná  0193, eigen vers bericht       HTTP 403  42501 permission denied
 *
 *    Een `using` die niet past filtert de rij weg en levert `200` met een lege
 *    lijst op: niets mis, niets gebeurd. Een ontbrekend kolomrecht weigert
 *    hoorbaar. Deze migratie haalt dus niet alleen een oppervlak weg, hij haalt
 *    ook een stil-weigerpad weg — dezelfde klasse als QS8-314 en QS8-326.
 *
 * ⚠️ **De must-allows dragen hier het meeste gewicht.** "Bewerken kan niet" is
 *    gratis groen zodra het token verlopen is, de groep leeg, of de fixture
 *    stuk. Wat bewezen moet worden is dat de tabel verder gewoon werkt: plaatsen
 *    en weghalen, én de referentiële actie.
 *
 * ⚠️⚠️ **Die laatste is de reden dat `stamp_chat_message()` niet is opgeruimd.**
 *    Zijn UPDATE-tak lijkt na 0193 dood en is dat niet: `sender_id`, `actor_id`
 *    en `subject_id` dragen `on delete set null`, en dat is een UPDATE die
 *    Postgres zélf doet als een profiel verdwijnt. Een trigger is geen policy —
 *    hij vuurt ook daarvoor. Zonder de laatste test hieronder is dat een
 *    aanname; mét hem is het gemeten.
 *
 * IJKING — met de hand gedraaid op 08-09-2026, per grendel apart. De eerste twee
 * ronden legden een gat bloot dat de security-review op deze branch mat, en de
 * derde regel hieronder is de reparatie:
 *
 *   A  het kolomrecht terugzetten (policy blijft weg)
 *      → 1 rood: 'een eigen vers bericht is niet te bewerken', en alléén op de
 *        audibiliteit. De bewerking landde niet — zonder UPDATE-policy weigert
 *        Postgres hem — maar PostgREST gaf er `200` met een lege lijst op.
 *   B  de policy terugzetten (kolomrecht blijft ingetrokken)
 *      → 1 rood: 'er bestaat geen UPDATE-policy meer op chat_messages'.
 *        ⚠️ **Vóór die test was dit 0 rood**: `42501` komt vóór de policy, dus
 *        de `drop policy`-helft van 0193 had geen enkele bewaker.
 *   C  béide terugzetten — de volledige rollback uit de kop van 0193
 *      → 2 rood, en de eerste melding is nu
 *        *'het bericht is herschreven — bewerken is niet dicht'*.
 *        ⚠️ **Vóór de herordening hieronder was dat de melding over het
 *        kolomrecht**, terwijl het de policy was die de herschrijving toeliet.
 *        Wie die melding leest, gaat bij de grants zoeken.
 *
 * ⚠️ **De twee helften doen dus verschillend werk en geen van beide is opsmuk.**
 *    De `drop policy` sluit het oppervlak; de `revoke` maakt de weigering
 *    hoorbaar. Alleen droppen laat precies het stille-weigerpad staan waar dit
 *    project al drie issues aan besteed heeft (QS8-314, QS8-326, QS8-342), en
 *    alleen revoken laat een policy staan die iets toestaat wat niemand meer kan
 *    aanroepen. Wie er één van de twee weghaalt, haalt geen dubbeling weg — en
 *    sinds ronde B heeft elke helft zijn eigen rode test.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  alice: TestUser;
  groupId: string;
  berichtId: string;
}

let w: Wereld;

describe.skipIf(!rlsTestsConfigured)('chat_messages — bewerken bestaat niet', () => {
  beforeAll(async () => {
    const alice = await createTestUser('venster-alice');

    const groep = await alice.db.rpc('create_group', { group_name: 'Venstergroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const bericht = await alice.db
      .from('chat_messages')
      .insert({ group_id: gd.group.id, sender_id: alice.id, type: 'text', body: 'VERS' })
      .select('id')
      .single();
    if (bericht.error) throw new Error(`bericht: ${bericht.error.message}`);

    w = { alice, groupId: gd.group.id, berichtId: bericht.data.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'een eigen vers bericht is niet te bewerken',
    async () => {
      // ⚠️ **Vers en van jezelf is met opzet het gunstigste geval.** Precies dit
      //    bericht was vóór 0193 wél te bewerken (HTTP 200, gemeten). Lukt het
      //    hier niet, dan lukt het nergens: elk ander geval faalde al op de oude
      //    `using`.
      const poging = await w.alice.db
        .from('chat_messages')
        .update({ body: 'HERSCHREVEN' })
        .eq('id', w.berichtId)
        .select('id, body');

      // ⚠️⚠️ **De rij eerst, de foutcode daarna, en die volgorde is een
      //    reparatie** (security-review op deze branch). Andersom faalt bij een
      //    volledige terugzetting van 0193 alleen de assertie over het
      //    kolomrecht, terwijl het bericht gewoon herschreven is — dan leest
      //    Quinten "een ontbrekend kolomrecht hoort hóórbaar te weigeren" en gaat
      //    hij bij de grants zoeken naar een fout die bij de policy zit. Wat er
      //    het ergst is, hoort het eerst gemeld te worden.
      const na = await adminDb().from('chat_messages').select('body').eq('id', w.berichtId).single();
      expect(na.data?.body, 'het bericht is herschreven — bewerken is niet dicht').toBe('VERS');

      expect(poging.error, 'een ontbrekend kolomrecht hoort hóórbaar te weigeren').not.toBeNull();
      expect(poging.error?.code, 'permission denied for table chat_messages').toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'er bestaat geen UPDATE-policy meer op chat_messages',
    () => {
      // ⚠️ **De `drop policy`-helft van 0193 had geen eigen grendel, en dat is de
      //    security-review op deze branch die dat mat.** De test hierboven bijt op
      //    het kolomrecht: zet je alléén de policy terug, dan blijft alles groen.
      //    Zet je álles terug — de rollback uit de kop van 0193 — dan landt de
      //    bewerking weer, en zonder deze assertie is de enige melding er een over
      //    grants terwijl het de policy is die het toeliet.
      //
      // ⚠️ `polcmd = 'w'` is UPDATE in `pg_policy`. Dit leest het schema en niet
      //    een migratiebestand: wat er draait is de waarheid.
      const aantal = psql(`
        select count(*) from pg_policy
        where polrelid = 'public.chat_messages'::regclass and polcmd = 'w'
      `);

      expect(
        Number(aantal.trim()),
        'er staat weer een UPDATE-policy op chat_messages — zie 0193 en QS8-327',
      ).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'MUST-ALLOW: een bericht plaatsen kan gewoon',
    async () => {
      const poging = await w.alice.db
        .from('chat_messages')
        .insert({ group_id: w.groupId, sender_id: w.alice.id, type: 'text', body: 'NOG EEN' })
        .select('id');

      expect(poging.error).toBeNull();
      expect(poging.data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'MUST-ALLOW: je eigen bericht weghalen kan gewoon',
    async () => {
      // ⚠️ Dit is het alternatief dat `ChatRegel` noemt: niet stil anders, maar
      //    weg. Valt deze om, dan heeft 0193 meer meegenomen dan bedoeld.
      const gemaakt = await w.alice.db
        .from('chat_messages')
        .insert({ group_id: w.groupId, sender_id: w.alice.id, type: 'text', body: 'WEG HIERMEE' })
        .select('id')
        .single();
      if (gemaakt.error) throw new Error(`bericht: ${gemaakt.error.message}`);

      const weg = await w.alice.db
        .from('chat_messages')
        .delete()
        .eq('id', gemaakt.data.id)
        .select('id');

      expect(weg.error).toBeNull();
      expect(weg.data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'MUST-ALLOW: `on delete set null` werkt nog, met het UPDATE-recht ingetrokken',
    async () => {
      // ⚠️ **De referentiële actie is een UPDATE, en die moet blijven werken.**
      //    Zou 0193 hem geraakt hebben, dan werpt het verwijderen van een account
      //    op het eerste chatbericht dat de vertrekker ooit stuurde — en dat is
      //    precies het soort gevolg dat je pas ziet als iemand het doet.
      //
      //    Dit gaat langs `psql` en niet langs de client: het profiel verwijderen
      //    is geen handeling die een gebruiker rechtstreeks op deze tabel doet.
      //    Bob hoeft geen lid te zijn: de rij wordt met `adminDb()` geplaatst,
      //    want het gaat hier om de foreign key en niet om een policy.
      const bob = await createTestUser('venster-bob');

      const vanBob = await adminDb()
        .from('chat_messages')
        .insert({ group_id: w.groupId, sender_id: bob.id, type: 'text', body: 'VAN BOB' })
        .select('id')
        .single();
      if (vanBob.error) throw new Error(`bericht van bob: ${vanBob.error.message}`);

      psql(`delete from public.profiles where id = '${bob.id}'`);

      const na = await adminDb()
        .from('chat_messages')
        .select('id, sender_id, body')
        .eq('id', vanBob.data.id)
        .single();

      expect(na.error, 'het bericht hoort te blijven staan').toBeNull();
      expect(na.data?.sender_id, '`on delete set null` hoort de afzender leeg te maken').toBeNull();
      expect(na.data?.body).toBe('VAN BOB');
    },
    TEST_TIMEOUT,
  );
});
