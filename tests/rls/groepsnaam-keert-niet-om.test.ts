import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * De belofte: **een groepsnaam kan niet als een ándere groep renderen** —
 * QS8-494, migratie 0270.
 *
 * ⚠️⚠️ **Waarom dit een eigen suite is en niet een regel bij `profielschrijven`.**
 *    Migratie 0269 sloot dezelfde klasse op `profiles.display_name`. De rij die
 *    `groups` open liet, hield zichzelf laag met de voorwaarde *"wordt zwaarder
 *    als er een uitnodigingsoppervlak komt waar de groepsnaam buiten de groep
 *    getoond wordt, of zodra groepsnamen doorzoekbaar worden voor niet-leden"*.
 *
 *    📏 Allebei bestonden al, gemeten op 14-09-2026:
 *
 *      proname        | prosecdef | anon_mag | auth_mag
 *      ---------------+-----------+----------+----------
 *      invite_preview | t         | t        | t
 *      ontdek_groepen | t         | f        | t
 *
 *    Een **uitgelogde** bezoeker met een uitnodigingslink krijgt `group_name` en
 *    `icon`; een ingelogd niet-lid krijgt `naam` en `omschrijving` uit de
 *    ontdeklijst. Dat is de fout waar QS8-123 voor bestaat: een voorwaarde die al
 *    gevuurd had, hield de rij laag.
 *
 * ⚠️ **Twee schrijvers, allebei getoetst** — de les van §7a in
 *    `docs/decisions/2026-09-13-twee-poorten-die-elkaar-niet-kenden.md`.
 *    `create_group()` zet de naam bij het aanmaken; een beheerder verzet hem
 *    daarna met een kale PATCH (📏 `has_column_privilege('authenticated',
 *    'public.groups', 'name', 'UPDATE')` is `t`, en `guard_group_update()` noemt
 *    `name` niet). Een suite die alleen de PATCH toetst, laat de aanmaakroute
 *    open — en dat is precies hoe QS8-448 de eerste keer misging.
 *
 * ⚠️ Door PostgREST en niet over psql: de route die een aanvaller neemt.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** `U+202E` RIGHT-TO-LEFT OVERRIDE — het teken uit de gemeten bevinding. */
const RLO = String.fromCodePoint(0x202e);
/** `U+2067` RIGHT-TO-LEFT ISOLATE. */
const RLI = String.fromCodePoint(0x2067);

let beheerder: TestUser;
let groupId: string;

describe.skipIf(!rlsTestsConfigured)('een groepsnaam keert de tekens eromheen niet om', () => {
  beforeAll(async () => {
    beheerder = await createTestUser('bidi-groep-beheerder');

    const groep = await beheerder.db.rpc('create_group', {
      group_name: 'Gewone groep',
      huddle_day: 1,
      tz: 'Europe/Amsterdam',
    });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    groupId = gd.group.id;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // Schrijver 1 — de kale PATCH
  // -------------------------------------------------------------------------

  it.each([
    { naam: 'de gemeten spoofnaam', kolom: 'name', waarde: `Just${RLO}kcart` },
    { naam: 'een override midden in de naam', kolom: 'name', waarde: `a${RLO}b` },
    { naam: 'een isolaat midden in de naam', kolom: 'name', waarde: `a${RLI}b` },
    { naam: 'een override in het icoon', kolom: 'icon', waarde: `a${RLO}b` },
    { naam: 'een override in de omschrijving', kolom: 'omschrijving', waarde: `a${RLO}b` },
  ])(
    'weigert $naam via een PATCH',
    async ({ kolom, waarde }) => {
      const { error } = await beheerder.db
        .from('groups')
        .update({ [kolom]: waarde })
        .eq('id', groupId);

      expect(
        error?.code,
        'de database liet een groepstekst toe die omgekeerd rendert — die staat ' +
          'in het uitnodigingsvoorbeeld van een uitgelogde bezoeker',
      ).toBe('23514');

      // ⚠️ **De constraintnaam erbij, en dat is geen sierlijkheid.** `23514` zegt
      //    alleen "een CHECK weigerde dit". `groups` draagt er twintig; een
      //    andere die deze invoer toevallig ook weigert, houdt deze toets groen
      //    terwijl de bidi-CHECK weg is. Dat is de les uit de security-ronde op
      //    QS8-450.
      expect(
        error?.message ?? '',
        'een CHECK weigerde dit, maar niet degene die deze toets bewaakt',
      ).toContain(`groups_${kolom}_geen_bidi`);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Schrijver 2 — `create_group()`
  // -------------------------------------------------------------------------

  /**
   * ⚠️⚠️ **Deze toets is de helft die een suite over "de PATCH" zou missen.**
   *    `create_group()` is `security definer` en zet `name` bij het aanmaken. Zat
   *    de grens in een policy of een kolomgrant in plaats van in een CHECK, dan
   *    kwam hij hier ongehinderd langs — een definer-functie draait met de
   *    rechten van de eigenaar. Een CHECK geldt voor élke schrijver, en dát is de
   *    reden dat het er een is.
   */
  it(
    'weigert een groepsnaam met een override ook bij het aanmaken',
    async () => {
      const { data, error } = await beheerder.db.rpc('create_group', {
        group_name: `Just${RLO}kcart`,
        huddle_day: 1,
        tz: 'Europe/Amsterdam',
      });

      const mislukt =
        error !== null || (data as unknown as { ok?: boolean } | null)?.ok !== true;

      expect(
        mislukt,
        'create_group() maakte een groep met een omgekeerde naam aan — de CHECK ' +
          'geldt niet voor deze route',
      ).toBe(true);

      // ⚠️⚠️ **De reden erbij, en dat is een ijking die deze toets zelf vond.**
      //    📏 Met `grant execute on zonder_bidi` ingetrokken vielen elf van de
      //    twaalf toetsen om — en deze bleef groen, want `create_group()` faalde
      //    toen óók, alleen op `permission denied` in plaats van op de CHECK.
      //    Een toets die alleen "het mislukte" eist, leest een dichte deur als
      //    een veilige deur; dat is woordelijk de les uit de security-ronde op
      //    QS8-450.
      expect(
        `${error?.message ?? ''}`,
        'create_group() mislukte, maar niet op de CHECK die deze toets bewaakt',
      ).toContain('groups_name_geen_bidi');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De must-allows
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **Niet optioneel, en om de reden die 0256 en 0269 allebei bijna de kop
   *    kostte.** De CHECKs roepen `public.zonder_bidi()` aan; zónder
   *    `grant execute` aan `authenticated` valt **élke** groepsschrijving om op
   *    `permission denied for function zonder_bidi` — ook een doodgewone
   *    hernoeming. Postgres toetst het uitvoerrecht op het moment van schrijven.
   *
   *    Een dichte deur leest als een veilige deur: zonder deze helft zouden de
   *    weigeringen hierboven óók groen zijn, maar op `42501` in plaats van
   *    `23514`.
   */
  it.each([
    { naam: 'een gewone hernoeming', kolom: 'name', waarde: 'Gewone groep, hernoemd' },
    { naam: 'een Arabische groepsnaam', kolom: 'name', waarde: 'مجموعة' },
    { naam: 'een naam met een emoji', kolom: 'name', waarde: '🏃 Hardlopers' },
    { naam: 'een gezinsemoji in het icoon', kolom: 'icon', waarde: '👨‍👩‍👧‍👦' },
    { naam: 'een gewone omschrijving', kolom: 'omschrijving', waarde: 'Elke week één doel.' },
    // ⚠️ De RLM is een *markering* en geen override — besluit uit 0269, met zijn
    //    voorwaarde in `docs/ENGINEER-REVIEW.md`. Hij staat hier zodat dat besluit
    //    zichtbaar blijft als besluit en niet als omissie.
    { naam: 'een right-to-left mark', kolom: 'name', waarde: `a${String.fromCodePoint(0x200f)}b` },
  ])(
    'laat $naam wel toe',
    async ({ kolom, waarde }) => {
      const { error } = await beheerder.db
        .from('groups')
        .update({ [kolom]: waarde })
        .eq('id', groupId);

      expect(error, 'de CHECK weigert een groepstekst die hij hoort door te laten').toBeNull();

      const na = await adminDb().from('groups').select(kolom).eq('id', groupId).single();
      expect((na.data as unknown as Record<string, unknown> | null)?.[kolom]).toBe(waarde);
    },
    TEST_TIMEOUT,
  );
});
