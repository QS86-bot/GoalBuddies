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
 * De **rand** van een naam wordt genormaliseerd afgedwongen — QS8-508,
 * migratie 0286.
 *
 * ⚠️⚠️ **Dit toetst de weigering en niet de functie, en dat is het hele punt van
 *    dit issue.** `schone_naam()` streek deze tekens altijd al weg; wat ontbrak
 *    was een CHECK die dat éíste. De randstap woonde in `handle_new_user()` en
 *    in `profielSchema` — en dat schema zit in de bundel van de aanvaller en
 *    zegt in zijn eigen kop dat het geen grens is. Een toets op `schone_naam()`
 *    was dus groen terwijl de deur openstond.
 *
 *    📏 Dat is geen hypothese: QS8-499 mat dat
 *    `een-naam-rendert-niet-als-een-andere.test.ts` groen bleef toen de
 *    randenlijst verbreed werd, omdat die toets naar een plek greep waar de
 *    belofte niet langskomt. Regel 18 vraag 4, woordelijk.
 *
 * ⚠️ **Via PostgREST als een echte `authenticated`**, net als de toets van
 *    QS8-495: alleen zo doen de trigger, de CHECK én de kolomgrant alle drie mee.
 *
 * ⚠️ **De constraintnaam staat in elke assertie.** Een kale `23514` zegt alleen
 *    "een CHECK weigerde dit", en `profiles` draagt er zes. Een ándere die
 *    dezelfde invoer toevallig ook weigert, houdt deze toets groen terwijl
 *    `profiles_display_name_schoon` weg is. Dat is de les uit de security-ronde
 *    op QS8-450.
 */

const TEST_TIMEOUT = 30_000;

/**
 * De tien codepunten uit de meting van QS8-508 die als **nul pixels** renderen
 * en die vóór 0286 aan de rand door álle vijf CHECKs heen kwamen.
 *
 * ⚠️ De twintig witruimte-codepunten uit diezelfde meting staan hier niet: die
 *    hébben breedte, dus `<spatie>Jan` en `Jan` zien er niet identiek uit. Ze
 *    worden nu wél geweigerd, en dat staat hieronder apart — als gemeten
 *    bijvangst en niet als spoofingvector.
 */
const NUL_PIXELS: readonly [string, string][] = [
  ['U+034F combining grapheme joiner', '͏'],
  ['U+061C arabic letter mark', '؜'],
  ['U+180B mongolian free variation selector one', '᠋'],
  ['U+180C mongolian free variation selector two', '᠌'],
  ['U+180D mongolian free variation selector three', '᠍'],
  ['U+180E mongolian vowel separator', '᠎'],
  ['U+200C zero width non-joiner', '‌'],
  ['U+200D zero width joiner', '‍'],
  ['U+200E left-to-right mark', '‎'],
  ['U+200F right-to-left mark', '‏'],
];

/** Het Perzische woord uit de meting — twee letters die aan elkaar renderen. */
const MI = 'می';

describe.skipIf(!rlsTestsConfigured)('de rand van een naam', () => {
  let mallory: TestUser;

  beforeAll(async () => {
    mallory = await createTestUser('randnaam-mallory');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, TEST_TIMEOUT);

  /**
   * Of deze naam geweigerd wordt, door de bedoelde CHECK, met de rij onveranderd.
   *
   * ⚠️⚠️ **Drie dingen en niet één.** Een `update` die op zijn filter niets raakt
   *    geeft óók geen fout en verandert óók niets. Daarom eerst een anker dat wél
   *    mag, dan de poging, en daarna nalezen dat het anker er nog staat — pas dan
   *    staat vast dat de schrijfactie de rij echt probeerde te raken. Overgenomen
   *    uit `een-naam-rendert-niet-als-een-andere.test.ts`.
   */
  async function magNietLanden(naam: string): Promise<void> {
    const anker = `Anker${Math.random().toString(36).slice(2, 8)}`;
    const opstelling = await mallory.db
      .from('profiles')
      .update({ display_name: anker })
      .eq('id', mallory.id);
    expect(opstelling.error, 'de opstelling zelf mislukte').toBeNull();

    const poging = await mallory.db
      .from('profiles')
      .update({ display_name: naam })
      .eq('id', mallory.id);

    expect(
      poging.error?.code,
      `\`${JSON.stringify(naam)}\` landde als naam — aan de rand staat de normalisatie dan nergens afgedwongen`,
    ).toBe('23514');
    expect(
      poging.error?.message ?? '',
      'een CHECK weigerde dit, maar niet degene die deze toets bewaakt',
    ).toContain('profiles_display_name_schoon');

    const na = await adminDb().from('profiles').select('display_name').eq('id', mallory.id).single();
    expect((na.data as { display_name: string }).display_name, 'de rij is onveranderd').toBe(anker);
  }

  describe('de tien nul-pixeltekens komen er niet meer langs', () => {
    it.each(NUL_PIXELS)('weigert %s aan de voorrand', async (_naam, teken) => {
      await magNietLanden(`${teken}${MI}`);
    }, TEST_TIMEOUT);

    it.each(NUL_PIXELS)('weigert %s aan de achterrand', async (_naam, teken) => {
      await magNietLanden(`${MI}${teken}`);
    }, TEST_TIMEOUT);
  });

  /**
   * ⚠️ **De gemeten bijvangst, en die hoort in een toets en niet in een comment.**
   *    Een spatie aan de rand is een typefout en geen aanval, en hij wordt nu
   *    geweigerd. Dat is te verdedigen omdat `profielSchema` hem client-side al
   *    wegstrijkt (`schoneNaam()` stap 5), dus alleen een rechtstreekse `PATCH`
   *    raakt deze CHECK. Zou iemand dat gedrag later zachter willen maken, dan
   *    hoort hij hier langs te komen en niet bij een verbaasde gebruiker.
   */
  it('weigert ook een gewone spatie aan de rand', async () => {
    await magNietLanden(' Quinten');
    await magNietLanden('Quinten ');
  }, TEST_TIMEOUT);

  /**
   * ⚠️ **De must-allow-helft.** Zonder deze toets is alles hierboven te
   *    bevredigen door élke schrijfactie op `display_name` te weigeren, en dan
   *    kan niemand meer zijn naam wijzigen (QS8-473).
   */
  it('laat een gewone naam gewoon landen', async () => {
    const naam = `Quinten ${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await mallory.db
      .from('profiles')
      .update({ display_name: naam })
      .eq('id', mallory.id);

    expect(error, 'een gewone naam wordt geweigerd — de CHECK is te streng').toBeNull();

    const na = await adminDb().from('profiles').select('display_name').eq('id', mallory.id).single();
    expect((na.data as { display_name: string }).display_name).toBe(naam);
  }, TEST_TIMEOUT);
});

/**
 * Dezelfde rand op `groups.name` — QS8-508, en daar sluit hij een tweede gat.
 *
 * ⚠️ `groups.name` heeft geen tegenhanger van `profiles_display_name_zichtbaar`,
 *    dus `groups_name_len` (`char_length >= 1`) was er de enige ondergrens. 📏
 *    Gemeten: een naam van alleen NBSP haalde die lengte én alle vier de
 *    gelijkheden. Na 0286 niet meer — `schone_naam()` strijkt hem tot de lege
 *    string en dan is de gelijkheid weg.
 */
describe.skipIf(!rlsTestsConfigured)('de rand van een groepsnaam', () => {
  let beheerder: TestUser;
  let groupId: string;

  beforeAll(async () => {
    beheerder = await createTestUser('randgroep-beheerder');

    const groep = await beheerder.db.rpc('create_group', {
      group_name: 'De donderdagclub',
      huddle_day: 1,
      tz: 'Europe/Amsterdam',
    });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    groupId = gd.group.id;
    registreerGroep(groupId);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, TEST_TIMEOUT);

  /**
   * Dezelfde vorm als `magNietLanden()` hierboven: anker, poging, nalezen.
   *
   * ⚠️⚠️ **Deze helft stond er tot QS8-515 niet, en dat was geen omissie maar
   *    een afhankelijkheid.** Tot migratie 0287 wérd `groups_name_schoon` hier
   *    aangetoond door `create_group()`: die functie streek met `btrim()`, liet
   *    een niet-ASCII rand door, en viel dan om op deze CHECK. 0287 laat die
   *    route met `schone_naam()` strijken — terecht, want een RPC-aanroeper
   *    hoort een reden terug te krijgen en geen `23514` — en daarmee zou de
   *    enige toets die deze constraintnaam noemde verdwijnen.
   *
   *    De CHECK zelf verdwijnt niet en mag dat ook niet: `authenticated` mag
   *    `groups.name` rechtstreeks patchen (📏 `has_column_privilege` is `t`) en
   *    díé schrijver normaliseert niets. Deze helper is die schrijver.
   */
  async function magNietLandenAlsGroepsnaam(naam: string): Promise<void> {
    const anker = `Anker${Math.random().toString(36).slice(2, 8)}`;
    const opstelling = await beheerder.db.from('groups').update({ name: anker }).eq('id', groupId);
    expect(opstelling.error, 'de opstelling zelf mislukte').toBeNull();

    const poging = await beheerder.db.from('groups').update({ name: naam }).eq('id', groupId);

    expect(
      poging.error?.code,
      `\`${JSON.stringify(naam)}\` landde als groepsnaam — aan de rand staat de normalisatie dan nergens afgedwongen`,
    ).toBe('23514');
    expect(
      poging.error?.message ?? '',
      'een CHECK weigerde dit, maar niet degene die deze toets bewaakt',
    ).toContain('groups_name_schoon');

    const na = await adminDb().from('groups').select('name').eq('id', groupId).single();
    expect((na.data as { name: string }).name, 'de rij is onveranderd').toBe(anker);
  }

  it('weigert een nul-pixelteken aan de rand van een groepsnaam via een PATCH', async () => {
    await magNietLandenAlsGroepsnaam(`\u200c${MI}`);
    await magNietLandenAlsGroepsnaam(`${MI}\u200c`);
  }, TEST_TIMEOUT);

  it('weigert een groepsnaam van alleen onzichtbare tekens via een PATCH', async () => {
    await magNietLandenAlsGroepsnaam('\u00a0\u00a0');
  }, TEST_TIMEOUT);

  /**
   * ⚠️⚠️ **Deze twee eisten tot 0287 een weigering van `create_group()`, en dat
   *    was een eigenschap van het onderdeel en niet de belofte** — QS8-515. De
   *    belofte van deze suite is *er landt geen naam met een onzichtbare rand*.
   *    Weigeren en strijken houden die allebei; sinds 0287 strijkt deze route,
   *    en de gestructureerde reden die er dan uit komt is wat `api.ts` kan
   *    vertalen. Wat hier nu staat is de belofte zelf, plus de eis dat er een
   *    ántwoord komt — een kale `23514` uit deze route is een bevinding op zich
   *    en staat in `tests/rls/create_group-antwoordt-gestructureerd.test.ts`.
   */
  it('laat via create_group() geen naam van alleen onzichtbare tekens ontstaan', async () => {
    const { data, error } = await beheerder.db.rpc('create_group', {
      group_name: '\u00a0\u00a0',
      huddle_day: 1,
      tz: 'Europe/Amsterdam',
    });

    expect(
      error === null ? null : `${error.code} ${error.message}`,
      'create_group() viel om op de database in plaats van een reden terug te geven',
    ).toBeNull();

    const antwoord = data as unknown as { ok?: boolean; reason?: string } | null;
    expect(antwoord?.ok, 'create_group() maakte een groep met een onzichtbare naam aan').toBe(false);
    expect(antwoord?.reason, 'create_group() weigerde met een andere reden dan verwacht').toBe(
      'name_too_short',
    );
  }, TEST_TIMEOUT);

  it('laat via create_group() geen nul-pixelteken aan de rand van een naam landen', async () => {
    const { data, error } = await beheerder.db.rpc('create_group', {
      group_name: `\u200c${MI}`,
      huddle_day: 1,
      tz: 'Europe/Amsterdam',
    });

    expect(
      error === null ? null : `${error.code} ${error.message}`,
      'create_group() viel om op de database in plaats van een reden terug te geven',
    ).toBeNull();

    const antwoord = data as unknown as {
      ok?: boolean;
      reason?: string;
      group?: { id: string };
    } | null;
    if (antwoord?.group?.id) registreerGroep(antwoord.group.id);

    // ⚠️ Niet *of* hij geweigerd is, maar *wat er staat*: geen groep van deze
    //    beheerder draagt het teken nog. Dat blijft waar of de route weigert of
    //    strijkt, en het wordt onwaar zodra er één landt.
    const alle = await adminDb().from('groups').select('name').eq('created_by', beheerder.id);

    expect(alle.error, 'de groepen van deze beheerder waren niet terug te lezen').toBeNull();
    expect(
      (alle.data ?? []).filter((g) => g.name.includes('\u200c')).map((g) => g.name),
      'er staat een groep met een nul-pixelteken aan de rand van zijn naam',
    ).toEqual([]);
    expect(
      (alle.data ?? []).length,
      'er stond geen enkele groep van deze beheerder — de terugleesregel meet niets',
    ).toBeGreaterThanOrEqual(1);
  }, TEST_TIMEOUT);

  /** ⚠️ De must-allow-helft: een gewone groepsnaam moet gewoon kunnen. */
  it('laat een gewone groepsnaam gewoon landen', async () => {
    const { data, error } = await beheerder.db.rpc('create_group', {
      group_name: 'De vrijdagclub',
      huddle_day: 1,
      tz: 'Europe/Amsterdam',
    });

    expect(error, 'een gewone groepsnaam wordt geweigerd — de CHECK is te streng').toBeNull();
    const g = (data ?? {}) as { ok?: boolean; group?: { id: string } };
    expect(g.ok, `create_group gaf ${JSON.stringify(data)}`).toBe(true);
    if (g.group) registreerGroep(g.group.id);
  }, TEST_TIMEOUT);
});
