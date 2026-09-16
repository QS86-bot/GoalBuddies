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

/**
 * De drie kolommen die 0270 dekt.
 *
 * ⚠️ **Een berekende sleutel (`{ [kolom]: waarde }`) typecheckt niet tegen de
 *    gegenereerde Supabase-types**: die maken van een index-signatuur `never`, en
 *    dan is élke waarde onjuist. Een `as`-cast eromheen zou het stil maken en
 *    precies het soort fout verbergen dat deze suite moet vinden — een kolomnaam
 *    die niet bestaat. Vandaar een schakelaar die per tak een letterlijk object
 *    teruggeeft; `tsc` toetst dan nog steeds of de kolom bestaat.
 */
type BidiKolom = 'name' | 'icon' | 'omschrijving';

function patchVoor(kolom: BidiKolom, waarde: string) {
  if (kolom === 'name') return { name: waarde };
  if (kolom === 'icon') return { icon: waarde };
  return { omschrijving: waarde };
}

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

    // ⚠️ **Vergeten aan te roepen is geen stille fout**, zegt de harnaskop — maar
    //    hij viel hier nét goed uit omdat de beheerder lid blijft en
    //    `wipe('groups','created_by')` hem terugvindt. Dat is toeval en geen
    //    ontwerp; tien andere suites melden hun groep wél aan. Gevonden in de
    //    security-ronde.
    registreerGroep(groupId);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // Schrijver 1 — de kale PATCH
  // -------------------------------------------------------------------------

  it.each<{ naam: string; kolom: BidiKolom; waarde: string }>([
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
        .update(patchVoor(kolom, waarde))
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

      // ⚠️⚠️ **De reden erbij, en niet alleen dát het mislukte.** Een toets die
      //    alleen "het mislukte" eist, leest een dichte deur als een veilige
      //    deur — de les uit de security-ronde op QS8-450.
      //
      //    📏 **En wat die mutatie hier laat zien, is precies andersom dan ik
      //    eerst opschreef.** Met `grant execute on zonder_bidi` ingetrokken
      //    vallen elf van de twaalf toetsen om; deze blijft groen, en hij blijft
      //    groen op de **CHECK** (`23514` mét de constraintnaam) en niet op
      //    `permission denied`. `create_group()` is `security definer` en
      //    eigendom van `postgres`, dus de aanroep van `zonder_bidi()` binnen de
      //    CHECK draait daar met de rechten van de eigenaar. Nagemeten in een
      //    geïsoleerde database, alle vier de combinaties.
      //
      //    **De grant beschermt dus alleen de directe PATCH-route.**
      expect(
        `${error?.message ?? ''}`,
        'create_group() mislukte, maar niet op de CHECK die deze toets bewaakt',
      ).toContain('groups_name_geen_bidi');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Schrijver 3 — de contextregel die 0283 erbij zet
  // -------------------------------------------------------------------------

  /**
   * ⚠️⚠️ **Dit geval stond hierónder als must-allow en staat nu hier, en die
   *    verhuizing is zelf de bevinding** — QS8-506, migratie 0283.
   *
   *    0269 besloot dat een richtingsmarkering géén override is en dus door de
   *    bidi-CHECK mag; dat besluit staat nog. 0283 legt er de contextregel van
   *    0282 naast op `groups.name`, en díé weegt niet *"is dit een override"*
   *    maar *"doet dit teken hier werk"*. Tussen twee ASCII-letters doet een RLM
   *    dat niet: hij kan er alleen de leesvolgorde mee kantelen.
   *
   *    📏 Gemeten op de lokale stack (16-09-2026):
   *
   *      a<RLM>b   zonder_bidi: door   middenin: door   contextregel: geweigerd
   *      م<RLM>ب   zonder_bidi: door   middenin: door   contextregel: door
   *
   * ⚠️ **De constraintnaam erbij, om dezelfde reden als hierboven.** `groups`
   *    draagt er inmiddels drieëntwintig; een andere die deze invoer toevallig
   *    ook weigert, houdt deze toets groen terwijl de contextregel weg is.
   */
  it(
    'weigert een richtingsmarkering tussen twee ASCII-letters in een groepsnaam',
    async () => {
      const { error } = await beheerder.db
        .from('groups')
        .update({ name: `a${String.fromCodePoint(0x200f)}b` })
        .eq('id', groupId);

      expect(
        error?.code,
        'de contextregel van 0282 staat niet op groups.name — een naam die als ' +
          'twee letters rendert komt er gewoon in',
      ).toBe('23514');

      expect(
        error?.message ?? '',
        'een CHECK weigerde dit, maar niet degene die deze toets bewaakt',
      ).toContain('groups_name_geen_onzichtbaar_tussen_letters');
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
  it.each<{ naam: string; kolom: BidiKolom; waarde: string }>([
    { naam: 'een gewone hernoeming', kolom: 'name', waarde: 'Gewone groep, hernoemd' },
    { naam: 'een Arabische groepsnaam', kolom: 'name', waarde: 'مجموعة' },
    { naam: 'een naam met een emoji', kolom: 'name', waarde: '🏃 Hardlopers' },
    { naam: 'een gezinsemoji in het icoon', kolom: 'icon', waarde: '👨‍👩‍👧‍👦' },
    { naam: 'een gewone omschrijving', kolom: 'omschrijving', waarde: 'Elke week één doel.' },
    // ⚠️ De RLM is een *markering* en geen override — besluit uit 0269, met zijn
    //    voorwaarde in `docs/ENGINEER-REVIEW.md`. Hij staat hier zodat dat besluit
    //    zichtbaar blijft als besluit en niet als omissie.
    //
    // ⚠️⚠️ **Verhuisd van `name` naar `omschrijving` op 16-09-2026 (QS8-506,
    //    migratie 0283), en dat is een versmalling van dit geval en geen
    //    herroeping van dat besluit.** 0283 zet de contextregel van 0282 op
    //    `groups.name` erbij, en díé weigert een richtingsmarkering tussen twee
    //    ASCII-letters — precies waar hij geen werk doet. 📏 Gemeten:
    //    `a<RLM>b` komt langs `zonder_bidi()` én langs
    //    `zonder_onzichtbaar_middenin()` en wordt door
    //    `zonder_onzichtbaar_tussen_letters()` geweigerd; `م<RLM>ب` komt overal
    //    langs. `omschrijving` draagt de contextregel niet, dus dáár toetst dit
    //    geval nog steeds wat het altijd toetste: dat de bidi-CHECK een
    //    markering niet als een override behandelt.
    {
      naam: 'een right-to-left mark in proza',
      kolom: 'omschrijving',
      waarde: `a${String.fromCodePoint(0x200f)}b`,
    },
    // ⚠️ En de markering waar hij wél werk doet, in de kolom die de contextregel
    //    nu draagt. Zonder dit geval zou "de contextregel weigert de RLM in een
    //    naam" hieronder groen blijven terwijl de regel élke markering weigert.
    {
      naam: 'een right-to-left mark tussen twee Arabische letters',
      kolom: 'name',
      waarde: `م${String.fromCodePoint(0x200f)}ب`,
    },
  ])(
    'laat $naam wel toe',
    async ({ kolom, waarde }) => {
      const { error } = await beheerder.db
        .from('groups')
        .update(patchVoor(kolom, waarde))
        .eq('id', groupId);

      expect(error, 'de CHECK weigert een groepstekst die hij hoort door te laten').toBeNull();

      // ⚠️ Een vaste kolomlijst en geen `select(kolom)`: die laatste geeft `tsc`
      //    weer een berekende sleutel, en de terugleesregel is juist de helft die
      //    bewijst dát de waarde geland is en de update niet stil niets deed.
      const na = await adminDb()
        .from('groups')
        .select('name, icon, omschrijving')
        .eq('id', groupId)
        .single();

      expect(na.data?.[kolom], 'de update gaf geen fout maar de waarde staat er niet').toBe(waarde);
    },
    TEST_TIMEOUT,
  );
});
