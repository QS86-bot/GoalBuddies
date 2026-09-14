import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ⚠️ **Rechtstreeks uit `helden.ts` en niet uit `index.ts`.** Sinds QS8-474
//    exporteert die index ook `heldprofiel.ts`, en dat bestand trekt via
//    `lib/supabase` de Supabase-client mee — die kan de testomgeving niet
//    parsen (`react-native`, Flow). 📏 Dit bestand meldde daardoor `0 test` en
//    de suite werd rood; luid, niet stil, want een suite die zwijgt is de fout
//    van QS8-270. Zelfde import als `quiz.test.ts` doet.
import { HELDBRONNEN, HELDSLEUTELS, TRIGGERS } from '../../src/modules/helden/helden';

import {
  adminDb,
  createTestUser,
  magNietLanden,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const TEST_TIMEOUT = 30_000;

/**
 * De twee heldentabellen staan dicht — QS8-471, migratie 0264.
 *
 * ⚠️ **Waarom dit meer is dan de gebruikelijke eigenaar-only-toets.**
 *    `hero_appearances.trigger` draagt `misser` en `stilte`, en dat zijn
 *    tegenslagsignalen: wie ziet dat Ignis langs is geweest, weet dat er iets
 *    gemist is. Een lek hier is niet "iemand ziet welke held je hebt" maar
 *    precies het schaamtemoment waar domeinregel 7 voor bestaat. De
 *    groepsroute komt apart in QS8-477, via een RPC met een expliciete
 *    kolomlijst — want RLS kan geen kolommen beperken.
 *
 * ⚠️ **De CHECK-waarden worden in béide richtingen naast de module gelegd.** De
 *    lijst in `src/modules/helden` is de bron, de CHECK is een kopie. Twee
 *    lijsten die uit elkaar lopen zonder dat iets rood wordt is de fout van
 *    0032/0034; hier wordt elke sleutel daadwerkelijk ingevoerd en een
 *    onbekende daadwerkelijk geweigerd.
 */
describe.skipIf(!rlsTestsConfigured)('De heldentabellen', () => {
  let eigenaar: TestUser;
  let ander: TestUser;
  let groepId: string;

  /**
   * ⚠️⚠️ **`ander` is een groepsgenoot en geen willekeurige vreemde, en dat is de
   *    hele reden dat deze opzet zo staat.** De eerste versie van dit bestand
   *    zette twee gebruikers neer die geen groep deelden. 📏 Met de hand
   *    nagespeeld op de lokale stack: met een groepstak op
   *    `hero_appearances_select` — precies de vorm die QS8-477 zou kunnen
   *    schrijven in plaats van de RPC — bleef die opzet **groen** terwijl een
   *    groepsgenoot `trigger = 'misser'` las.
   *
   *    Een vreemde toetst niets wat hier gevaarlijk is: het gevaar zit bij de
   *    mensen die je kent. Regel 18 vraag 3 — een test die groen kan blijven
   *    terwijl de belofte breekt, bewaakt niets.
   */
  beforeAll(async () => {
    eigenaar = await createTestUser('helden-eigenaar');
    ander = await createTestUser('helden-ander');

    const groep = await eigenaar.db.rpc('create_group', { group_name: 'Helden' });
    const groepData = groep.data as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (groepData.ok !== true || !groepData.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }
    groepId = groepData.group.id;
    registreerGroep(groepId);

    const mee = await ander.db.rpc('join_group_with_code', { code: groepData.group.invite_code });
    const meeData = (mee.data ?? {}) as { ok?: boolean; reason?: string };
    if (meeData.ok !== true) throw new Error(`ander werd geen lid: ${meeData.reason ?? '?'}`);

    await eigenaar.db
      .from('hero_profiles')
      .insert({ user_id: eigenaar.id, hero_key: 'strix', source: 'quiz' });

    // ⚠️ Via `adminDb()` en niet via de eigenaar: sinds de security-review op dit
    //    issue schrijft géén client deze tabel. Dat is precies wat de test
    //    hieronder vastlegt; hier is het alleen de opstelling.
    await adminDb()
      .from('hero_appearances')
      .insert({ user_id: eigenaar.id, hero_key: 'ignis', trigger: 'misser' });
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, TEST_TIMEOUT);

  describe('een ander ziet niets', () => {
    it(
      'leest nul rijen uit hero_profiles',
      async () => {
        const mijn = await eigenaar.db.from('hero_profiles').select('user_id, hero_key');
        expect(mijn.error).toBeNull();
        expect(mijn.data ?? []).toHaveLength(1);

        const vreemd = await ander.db.from('hero_profiles').select('user_id, hero_key');
        expect(vreemd.error).toBeNull();
        expect(vreemd.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'leest nul rijen uit hero_appearances',
      async () => {
        // ⚠️ De eerste helft is niet overbodig: zonder bewijs dát er een rij
        //    staat, is "de ander ziet nul" ook waar bij een lege tabel. Dat is
        //    dezelfde val als een controle die nul meldt omdat hij nergens keek.
        const mijn = await eigenaar.db.from('hero_appearances').select('id, trigger');
        expect(mijn.error).toBeNull();
        expect(mijn.data ?? []).toHaveLength(1);

        const vreemd = await ander.db.from('hero_appearances').select('id, trigger');
        expect(vreemd.error).toBeNull();
        expect(vreemd.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **Het slot dat hier draagt is de SELECT-policy, en niet de UPDATE- of
     *    DELETE-policy. Dat is gemeten, en het ging tegen de verwachting in.**
     *
     *    De security-review op QS8-474 meldde dat deze twee policies onbewaakt
     *    waren: allebei vervangen door
     *    `using (user_id = (select auth.uid()) or shares_group_with_user(user_id))`
     *    en de volledige suite bleef groen. 📏 Nagemeten met een echte
     *    PostgREST-aanroep bleek waaróm, en het is niet "er ontbreekt een test":
     *    een groepsgenoot die de rij van een ander PATCHt krijgt **200 met een
     *    lege lijst** en de rij verandert niet — terwijl
     *    `shares_group_with_user()` voor hem `true` teruggeeft.
     *
     *    De reden is dat Postgres bij een `UPDATE … where user_id = …` óók de
     *    SELECT-policy toepast om de rij te vinden. Zolang die eigenaar-only is,
     *    matcht de `where` niets en is er niets om te wijzigen. De suite stond
     *    dus terecht groen.
     *
     * ⚠️⚠️ **En daarmee is de waarschuwing voor QS8-477 scherper dan hij leek.**
     *    📏 Met de SELECT-policy erbij versoepeld landt de aanval wél: de rij van
     *    de ander wordt `quip/keuze`, en vijf toetsen in dit bestand worden rood
     *    (deze twee, `leest nul rijen uit hero_profiles`, en twee CHECK-toetsen
     *    die op de rij van de eigenaar leunen). **Eén versoepeling van SELECT
     *    opent dus ook het schríjven**, zolang UPDATE en DELETE hun eigen
     *    eigenaarspredicaat niet apart houden. Dat is precies wat QS8-477 gaat
     *    aanraken, en het is niet wat je verwacht als je alleen naar de
     *    leespolicy kijkt.
     *
     * ⚠️ **`magNietLanden()` en niet `expect(error).not.toBeNull()`.** 📏 Gemeten:
     *    een PATCH of DELETE op de rij van een ander geeft **204 zonder fout** en
     *    nul geraakte rijen. Een toets op de fout zou hier dus altijd rood staan
     *    om de verkeerde reden, en na een versoepeling stil groen worden.
     */
    it(
      'laat de held van een ander niet overschrijven',
      async () => {
        await magNietLanden(
          () =>
            ander.db
              .from('hero_profiles')
              .update({ hero_key: 'quip', source: 'keuze' })
              .eq('user_id', eigenaar.id),
          () => adminDb().from('hero_profiles').select('user_id, hero_key, source').order('user_id'),
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de held van een ander niet wissen',
      async () => {
        await magNietLanden(
          () => ander.db.from('hero_profiles').delete().eq('user_id', eigenaar.id),
          () => adminDb().from('hero_profiles').select('user_id, hero_key, source').order('user_id'),
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'kan geen rij op naam van een ander wegschrijven',
      async () => {
        const profiel = await ander.db
          .from('hero_profiles')
          .insert({ user_id: eigenaar.id, hero_key: 'quip', source: 'keuze' });
        expect(profiel.error).not.toBeNull();

        const verschijning = await ander.db
          .from('hero_appearances')
          .insert({ user_id: eigenaar.id, hero_key: 'quip', trigger: 'tussendoor' });
        expect(verschijning.error).not.toBeNull();

        // ⚠️ En ook niet op eigen naam. Dat is het verschil met `hero_profiles`:
        //    je held kies je zelf, je verschijningen overkomen je.
        const eigen = await ander.db
          .from('hero_appearances')
          .insert({ user_id: ander.id, hero_key: 'quip', trigger: 'tussendoor' });
        expect(eigen.error, 'een client hoort hier niet te kunnen schrijven').not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **Béide standen van `groups.zichtbaarheid`, want één stand bewijst de
     *    helft.** Besluit A41 laat een groep kiezen tussen beschermd en open, en
     *    besluit 5 van QS8-468 laat de heldenzichtbaarheid die keuze volgen.
     *    Maar dat gebeurt in QS8-477 via een RPC — niet hier via een policy.
     *
     *    Deze tabellen horen dus in **allebei** de standen nul rijen te geven
     *    aan een groepsgenoot. Toetst deze suite alleen de beschermde stand, dan
     *    is ze over een halfjaar blind voor precies de verruiming die dan
     *    gebouwd wordt.
     */
    it(
      'blijft dicht voor een groepsgenoot, in een beschermde én in een open groep',
      async () => {
        const beschermd = await ander.db.from('hero_appearances').select('id, trigger');
        expect(beschermd.error).toBeNull();
        expect(beschermd.data ?? [], 'beschermde groep').toHaveLength(0);

        const zicht = await eigenaar.db.rpc('zet_groepszichtbaarheid', {
          p_group_id: groepId,
          p_naar: 'open',
          p_bevestigd: true,
        });
        const uitkomst = (zicht.data ?? {}) as { ok?: boolean; reason?: string };
        expect(uitkomst.ok, JSON.stringify(zicht.data)).toBe(true);

        const open = await ander.db.from('hero_appearances').select('id, trigger');
        expect(open.error).toBeNull();
        expect(open.data ?? [], 'open groep').toHaveLength(0);

        const profielen = await ander.db.from('hero_profiles').select('user_id');
        expect(profielen.data ?? [], 'open groep, profielen').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });

  /**
   * ⚠️ **Append-only is hier op twee sloten gebouwd en dit toetst het gedrag,
   *    niet het slot.** Of de weigering van de ontbrekende `grant` komt of van
   *    de policy met `using (false)` doet er voor de belofte niet toe: wat
   *    telt is dat de rij niet verandert en niet verdwijnt. Een test die naar
   *    één van de twee sloten grijpt, wordt groen zodra iemand het ándere
   *    weghaalt — regel 18 vraag 4.
   */
  describe('een verschijning is append-only', () => {
    const lees = () =>
      eigenaar.db.from('hero_appearances').select('id, hero_key, trigger').order('id');

    it(
      'laat zich door de eigenaar niet wijzigen',
      async () => {
        await magNietLanden(
          () =>
            eigenaar.db
              .from('hero_appearances')
              .update({ trigger: 'mijlpaal' })
              .eq('user_id', eigenaar.id),
          lees,
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'laat zich door de eigenaar niet verwijderen',
      async () => {
        await magNietLanden(
          () => eigenaar.db.from('hero_appearances').delete().eq('user_id', eigenaar.id),
          lees,
        );
      },
      TEST_TIMEOUT,
    );
  });

  /**
   * ⚠️ **Beide richtingen, want één richting bewijst de helft.** Dat elke
   *    modulesleutel de CHECK haalt, zegt niets over een CHECK die álles
   *    doorlaat; dat een onbekende sleutel weigert, zegt niets over een CHECK
   *    die per ongeluk een echte sleutel buitensluit.
   */
  describe('de CHECK-waarden zijn dezelfde als in modules/helden', () => {
    it(
      'accepteert elke heldsleutel en elke trigger uit de module',
      async () => {
        for (const sleutel of HELDSLEUTELS) {
          for (const trigger of TRIGGERS) {
            const { error } = await adminDb()
              .from('hero_appearances')
              .insert({ user_id: eigenaar.id, hero_key: sleutel, trigger });
            expect(error, `${sleutel}/${trigger}`).toBeNull();
          }
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'accepteert elke bron uit HELDBRONNEN',
      async () => {
        // ⚠️ **Deze kant ontbrak tot QS8-474, en de kop hierboven belóófde hem
        //    wel.** Voor `hero_key` en `trigger` stonden beide richtingen er;
        //    voor `source` alleen de weigering. Een CHECK die per ongeluk
        //    `keuze` buitensluit, zou dan pas opvallen als een gebruiker bij
        //    gelijkspel zelf koos — en `bewaarHeld()` meldt dat als "je held kon
        //    niet bewaard worden", zonder dat iemand ziet waaróm.
        for (const bron of HELDBRONNEN) {
          const { error } = await eigenaar.db
            .from('hero_profiles')
            .update({ source: bron })
            .eq('user_id', eigenaar.id);
          expect(error, bron).toBeNull();
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een sleutel die de module niet kent',
      async () => {
        const held = await adminDb()
          .from('hero_appearances')
          .insert({ user_id: eigenaar.id, hero_key: 'rune', trigger: 'misser' });
        expect(held.error?.code, JSON.stringify(held.error)).toBe('23514');

        const trigger = await adminDb()
          .from('hero_appearances')
          .insert({ user_id: eigenaar.id, hero_key: 'strix', trigger: 'weekafsluiting' });
        expect(trigger.error?.code, JSON.stringify(trigger.error)).toBe('23514');

        const bron = await eigenaar.db
          .from('hero_profiles')
          .update({ source: 'toegewezen' })
          .eq('user_id', eigenaar.id);
        expect(bron.error?.code, JSON.stringify(bron.error)).toBe('23514');
      },
      TEST_TIMEOUT,
    );
  });

  describe('het model dwingt af wat de app aanneemt', () => {
    it(
      'houdt het bij één held per gebruiker',
      async () => {
        // ⚠️ QS8-475 gaat ervan uit dat "de hoofdheld" één antwoord heeft. Dat
        //    is hier een primaire sleutel en geen afspraak.
        const { error } = await eigenaar.db
          .from('hero_profiles')
          .insert({ user_id: eigenaar.id, hero_key: 'forge', source: 'keuze' });
        expect(error?.code, JSON.stringify(error)).toBe('23505');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **Dit is een gedragstoets en geen kolomtoets, en het verschil is hier
     *    gemeten.** De eerste opzet ging ervan uit dat een client `chosen_at`
     *    mág meesturen en dat de trigger hem stil overschrijft. 📏 Dat is niet
     *    wat er gebeurt: zónder grant op die kolom weigert Postgres de héle
     *    update. Dat is het strengere gedrag van de twee — een client die de
     *    datum probeert te zetten, krijgt een fout in plaats van een stille
     *    correctie — en daarom staat het hier zo vastgelegd.
     */
    it(
      'weigert een update die de keuzetijd zelf wil zetten',
      async () => {
        const { error } = await eigenaar.db
          .from('hero_profiles')
          .update({ hero_key: 'lucerna', chosen_at: '2000-01-01T00:00:00Z' })
          .eq('user_id', eigenaar.id);

        expect(error, 'een update mét chosen_at hoort te weigeren').not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'schuift de keuzetijd zelf mee als de held verandert',
      async () => {
        const voor = await eigenaar.db
          .from('hero_profiles')
          .select('chosen_at')
          .eq('user_id', eigenaar.id)
          .single();
        const tijdVoor = (voor.data as { chosen_at: string }).chosen_at;

        const geschreven = await eigenaar.db
          .from('hero_profiles')
          .update({ hero_key: 'lucerna' })
          .eq('user_id', eigenaar.id);
        expect(geschreven.error).toBeNull();

        const na = await eigenaar.db
          .from('hero_profiles')
          .select('hero_key, chosen_at')
          .eq('user_id', eigenaar.id)
          .single();
        const rij = na.data as { hero_key: string; chosen_at: string };

        expect(rij.hero_key).toBe('lucerna');
        expect(new Date(rij.chosen_at).getTime()).toBeGreaterThanOrEqual(
          new Date(tijdVoor).getTime(),
        );
      },
      TEST_TIMEOUT,
    );
  });

  /**
   * ⚠️ **Een held is persoonsgegeven en hoort niet achter te blijven.** De
   *    cascade hangt aan `profiles.id`, die zelf aan `auth.users` hangt. Dit
   *    toetst de keten en niet de kolomdefinitie: een `on delete cascade` die
   *    op de verkeerde tabel wijst, leest in de migratie net zo goed.
   */
  it(
    'neemt beide tabellen mee bij accountverwijdering',
    async () => {
      const vertrekker = await createTestUser('helden-vertrekker');
      await vertrekker.db
        .from('hero_profiles')
        .insert({ user_id: vertrekker.id, hero_key: 'meridian', source: 'quiz' });
      await adminDb()
        .from('hero_appearances')
        .insert({ user_id: vertrekker.id, hero_key: 'meridian', trigger: 'nieuw_doel' });

      const admin = adminDb();
      const voor = await admin.from('hero_appearances').select('id').eq('user_id', vertrekker.id);
      expect(voor.data ?? []).toHaveLength(1);

      await admin.from('profiles').delete().eq('id', vertrekker.id);

      const profielen = await admin
        .from('hero_profiles')
        .select('user_id')
        .eq('user_id', vertrekker.id);
      const verschijningen = await admin
        .from('hero_appearances')
        .select('id')
        .eq('user_id', vertrekker.id);

      expect(profielen.data ?? []).toHaveLength(0);
      expect(verschijningen.data ?? []).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );
});
