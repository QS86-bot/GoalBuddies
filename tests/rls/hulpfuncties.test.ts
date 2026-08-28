/**
 * De vier RLS-hulpfuncties, naast elkaar op dezelfde opzet.
 *
 * ⚠️ **De belofte is niet dat elke functie op zichzelf klopt, maar dat de vier
 *    hetzelfde model van "hoort deze kijker er nog bij" delen.** Ze zijn alle
 *    vier `SECURITY DEFINER` en omzeilen dus RLS, en ze zitten samen onder
 *    vrijwel elke policy in het schema — 0029 schrijft dat zelf op. Loopt er één
 *    uit de pas, dan verschuift een autorisatiegrens op elke plek waar díe
 *    functie hangt, en nergens anders. Dat is precies de vorm die geen enkele
 *    test per functie ooit vindt: elk onderdeel klopt en het geheel drift.
 *
 * ⚠️ **En ze zijn uit de pas gelopen, in drie stappen die elk een deel raakten:**
 *
 *      0029  legde vast dat alleen de kant van de kíjker wordt afgeknepen — of
 *            de ánder nog lid is, staat daar los van ("geschiedenis herschrijven").
 *      0092  zette de archieftoets in `is_group_member()` en `is_group_admin()`,
 *            en raakte de andere twee niet.
 *      0102  gaf `shares_group_with_goal()` alsnog de eigenaarshelft — het
 *            tegenovergestelde van wat 0029 opschreef — én de archieftoets.
 *
 *    `shares_group_with_user()` is als enige nooit herzien. Hij is daarmee de
 *    enige van de vier zonder archieftoets, en de enige die 0029's regel voor de
 *    ándere partij nog volgt.
 *
 * ⚠️ **En hij is als enige niet groepsgebonden**, wat bij het schrijven van deze
 *    suite pas zichtbaar werd. De andere drie krijgen een groep of een doel mee;
 *    `shares_group_with_user(other)` krijgt alleen een persoon en vraagt of je
 *    ergens éen groep met hem deelt. Dat is precies waarom deze suite per geval
 *    een eigen paar gebruikers optuigt: deelden ze er een, dan hield een groep
 *    uit een ánder geval het antwoord waar en bewees de tabel niets. Die fout
 *    stond er eerst in en werd rood — dezelfde vorm als de les uit epic13: een
 *    uitkomst die door iets anders overeind wordt gehouden, meet niet wat je meet.
 *
 * ⚠️ **Deze suite verandert dat gedrag niet, hij pint het vast.** Beide
 *    afwijkingen zijn verdedigbaar (een naam in oude geschiedenis hoort leesbaar
 *    te blijven), maar geen van beide is ooit besloten — ze zijn ontstaan doordat
 *    drie migraties elk een deelverzameling aanraakten. Een tabel die roodloopt
 *    zodra er een vakje kantelt, maakt de volgende wijziging een keuze in plaats
 *    van een bijvangst.
 *
 * ⚠️ De verwachtingen hieronder zijn gemeten tegen de gedeployde functies, niet
 *    afgeleid uit de migratiebestanden. `pg_get_functiondef()` is de waarheid
 *    (CLAUDE.md) — en bij het meten bleek dat ook: een eerste poging zette een
 *    lid van `inactive` terug naar `active` en las het resultaat als "archiveren
 *    sluit ook profielen af". Dat was onzin: `guard_group_member_update()`
 *    blokkeerde die terugzet (het gat dat 0029 dichtte), dus er werd een ándere
 *    toestand gemeten dan de bedoelde. Elk geval hieronder staat daarom op een
 *    eigen verse groep.
 */
import { afterAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Opzet {
  groupId: string;
  goalId: string;
  kijker: TestUser;
  ander: TestUser;
}

/** Wat de vier functies zeggen, gezien door één kijker. */
interface Uitslag {
  lid: boolean;
  beheerder: boolean;
  deeltDoel: boolean;
  deeltGebruiker: boolean;
}

describe.skipIf(!rlsTestsConfigured)('de vier RLS-hulpfuncties lopen gelijk', () => {
  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * Een verse groep met twee verse gebruikers als beheerder, en een doel van
   * `ander` dat aan de groep hangt.
   *
   * ⚠️ Béide beheerder, want `guard_group_member_update()` weigert de laatste
   *    beheerder uit te zetten — en dan meet dat geval een geweigerde update in
   *    plaats van een uitgezette kijker.
   *
   * ⚠️ En eigen gebruikers per geval, want `shares_group_with_user()` kijkt naar
   *    álle groepen die de twee delen. Zie de kop.
   */
  async function opzet(slug: string, naam: string): Promise<Opzet> {
    const kijker = await createTestUser(`hulp-${slug}-kijker`);
    const ander = await createTestUser(`hulp-${slug}-ander`);

    const gemaakt = await kijker.db.rpc('create_group', { group_name: naam });
    if (gemaakt.error) throw new Error(`groep ${naam}: ${gemaakt.error.message}`);
    const g = (gemaakt.data ?? {}) as { group?: { id: string; invite_code: string } };
    if (!g.group) throw new Error(`groep ${naam}: ${JSON.stringify(gemaakt.data)}`);

    const mee = await ander.db.rpc('join_group_with_code', { code: g.group.invite_code });
    if (mee.error) throw new Error(`meedoen ${naam}: ${mee.error.message}`);

    const rol = await adminDb()
      .from('group_members')
      .update({ role: 'admin' })
      .eq('group_id', g.group.id)
      .eq('user_id', ander.id);
    if (rol.error) throw new Error(`rol ${naam}: ${rol.error.message}`);

    const doel = await adminDb()
      .from('goals')
      .insert({
        owner_id: ander.id,
        title: `Doel in ${naam}`,
        target_date: '2027-01-01',
        status: 'active',
      })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel ${naam}: ${doel.error.message}`);

    const koppel = await adminDb()
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: g.group.id });
    if (koppel.error) throw new Error(`koppeling ${naam}: ${koppel.error.message}`);

    return { groupId: g.group.id, goalId: doel.data.id, kijker, ander };
  }

  async function meet({ groupId, goalId, kijker, ander }: Opzet): Promise<Uitslag> {
    const [lid, beheerder, doel, gebruiker] = await Promise.all([
      kijker.db.rpc('is_group_member', { gid: groupId }),
      kijker.db.rpc('is_group_admin', { gid: groupId }),
      kijker.db.rpc('shares_group_with_goal', { g: goalId }),
      kijker.db.rpc('shares_group_with_user', { other: ander.id }),
    ]);

    for (const r of [lid, beheerder, doel, gebruiker]) {
      if (r.error) throw new Error(`meten: ${r.error.message}`);
    }

    return {
      lid: lid.data === true,
      beheerder: beheerder.data === true,
      deeltDoel: doel.data === true,
      deeltGebruiker: gebruiker.data === true,
    };
  }

  async function zetLidstatus(groupId: string, userId: string, status: string): Promise<void> {
    const { error } = await adminDb()
      .from('group_members')
      .update({ status })
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (error) throw new Error(`lidstatus: ${error.message}`);
  }

  it(
    'zeggen alle vier ja zolang iedereen actief is en de groep leeft',
    async () => {
      expect(await meet(await opzet('actief', 'Hulp alles actief'))).toEqual({
        lid: true,
        beheerder: true,
        deeltDoel: true,
        deeltGebruiker: true,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    'knijpen alle vier dicht zodra de kíjker eruit ligt',
    async () => {
      // De enige as waarop de vier het wél eens zijn, en de belangrijkste:
      // dit is de eis van 0029 (A18) waar tien schrijfpolicies op leunen.
      const o = await opzet('kijker-eruit', 'Hulp kijker eruit');
      await zetLidstatus(o.groupId, o.kijker.id, 'inactive');

      expect(await meet(o)).toEqual({
        lid: false,
        beheerder: false,
        deeltDoel: false,
        deeltGebruiker: false,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    'lopen uiteen zodra de ánder eruit ligt — doel dicht, profiel open',
    async () => {
      // ⚠️ 0029 zei: alleen de kijkerskant knijpen, anders verdwijnt het doel van
      //    een uitgezet lid uit het groepsoverzicht en dát is geschiedenis
      //    herschrijven. 0102 draaide dat om voor `shares_group_with_goal()` en
      //    liet `shares_group_with_user()` staan. Beide standen zijn te
      //    verdedigen; dat ze verschíllen is nooit besloten.
      const o = await opzet('ander-eruit', 'Hulp ander eruit');
      await zetLidstatus(o.groupId, o.ander.id, 'inactive');

      expect(await meet(o)).toEqual({
        lid: true,
        beheerder: true,
        deeltDoel: false,
        deeltGebruiker: true,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    'laten na archiveren alleen `shares_group_with_user` nog ja zeggen',
    async () => {
      // ⚠️ **Dit is het vakje dat de bevinding draagt.** 0092 sloot een
      //    gearchiveerde groep af via `is_group_member()` en `is_group_admin()`;
      //    0102 gaf `shares_group_with_goal()` dezelfde toets. Niemand kwam
      //    langs `shares_group_with_user()`, dus `profiles_select` geeft na
      //    archiveren nog steeds naam en avatar van je oud-groepsgenoten vrij —
      //    terwijl de chat, de weekafsluitingen en De Ketting van die groep
      //    voor iedereen dicht zijn.
      //
      //    Bewust niet gerepareerd: dichtzetten haalt een naam weg uit
      //    geschiedenis die iemand nog kan tegenkomen, en dat is een
      //    productkeuze en geen bugfix. Wat hier stond te ontbreken was niet het
      //    slot maar het besluit.
      const o = await opzet('archief', 'Hulp archief');
      const gearchiveerd = await o.kijker.db.rpc('archiveer_groep', {
        p_group_id: o.groupId,
        p_bevestigd: true,
      });
      if (gearchiveerd.error) throw new Error(`archiveren: ${gearchiveerd.error.message}`);

      expect(await meet(o)).toEqual({
        lid: false,
        beheerder: false,
        deeltDoel: false,
        deeltGebruiker: true,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    'laten geen enkele functie zonder `search_path` staan, en geen definer open voor `anon`',
    async () => {
      // ⚠️ De tweede helft van "SECURITY DEFINER omzeilt RLS", en de helft die
      //    niet over deze vier gaat maar over alle 123. Zonder een gepinde
      //    search_path kiest de áánroeper welke tabellen de functie leest; open
      //    voor `anon` is een niet-ingelogde beller op een functie zonder RLS.
      //
      // ⚠️ Dat tweede is de stándaard: een kale `create function` geeft execute
      //    aan PUBLIC en `anon` erft dat. Vergeten is dus openzetten.
      //
      // ⚠️ **De eerste helft ging tot 0111 alleen over definer-functies, en dat
      //    was te smal.** `tip_noemt_tegenvaller()` is géén definer en gaf met
      //    een gekaapt pad toch het verkeerde antwoord: `true` werd `false`, dus
      //    de zeef die tegenvallertaal moet tegenhouden liet alles door. Een
      //    ongepind pad hoeft geen rechten te verhogen om een uitkomst te
      //    veranderen. Sinds 0111 kijkt die tak naar élke functie in `public`;
      //    het `anon`-bezwaar blijft terecht alleen over definers gaan.
      //
      //    `invite_preview` is de enige toegestane uitzondering (0019, 0080) en
      //    staat met naam in `definer_bewaking()` zelf, niet in een document.
      //    Met de hand rood gemaakt met een functie zonder pad en een functie
      //    met een grant aan anon — allebei melden, en sinds 0111 ook een
      //    níet-definer zonder pad.
      const { data, error } = await adminDb().rpc('definer_bewaking');

      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
