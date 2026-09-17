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

  beforeAll(async () => {
    beheerder = await createTestUser('randgroep-beheerder');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, TEST_TIMEOUT);

  /**
   * ⚠️ **Via `create_group()` en niet via een PATCH**, want dat is de route
   *    waarlangs een groepsnaam ontstaat. Die functie is `security definer`, dus
   *    de CHECK draait daar met de rechten van de eigenaar — precies de meting
   *    uit `groepsnaam-keert-niet-om.test.ts`, en de reden dat een CHECK meer
   *    waard is dan een grant.
   */
  it('weigert een groepsnaam van alleen onzichtbare tekens', async () => {
    const { data, error } = await beheerder.db.rpc('create_group', {
      group_name: '  ',
      huddle_day: 1,
      tz: 'Europe/Amsterdam',
    });

    const mislukt = error !== null || (data as unknown as { ok?: boolean } | null)?.ok !== true;
    expect(mislukt, 'create_group() maakte een groep met een onzichtbare naam aan').toBe(true);
    expect(
      `${error?.message ?? ''}`,
      'create_group() mislukte, maar niet op de CHECK die deze toets bewaakt',
    ).toContain('groups_name_schoon');
  }, TEST_TIMEOUT);

  it('weigert een groepsnaam met een nul-pixelteken aan de rand', async () => {
    const { data, error } = await beheerder.db.rpc('create_group', {
      group_name: `‌${MI}`,
      huddle_day: 1,
      tz: 'Europe/Amsterdam',
    });

    const mislukt = error !== null || (data as unknown as { ok?: boolean } | null)?.ok !== true;
    expect(mislukt, 'create_group() maakte een groep met een rand-teken aan').toBe(true);
    expect(
      `${error?.message ?? ''}`,
      'create_group() mislukte, maar niet op de CHECK die deze toets bewaakt',
    ).toContain('groups_name_schoon');
  }, TEST_TIMEOUT);

  /** ⚠️ De must-allow-helft: een gewone groepsnaam moet gewoon kunnen. */
  it('laat een gewone groepsnaam gewoon landen', async () => {
    const { data, error } = await beheerder.db.rpc('create_group', {
      group_name: 'De donderdagclub',
      huddle_day: 1,
      tz: 'Europe/Amsterdam',
    });

    expect(error, 'een gewone groepsnaam wordt geweigerd — de CHECK is te streng').toBeNull();
    const g = (data ?? {}) as { ok?: boolean; group?: { id: string } };
    expect(g.ok, `create_group gaf ${JSON.stringify(data)}`).toBe(true);
    if (g.group) registreerGroep(g.group.id);
  }, TEST_TIMEOUT);
});
