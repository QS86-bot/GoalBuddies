import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { PSQL_DB, PSQL_OMGEVING, psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een definer-functie die `authenticated` mag aanroepen, toetst de aanroeper —
 * QS8-289, vervolg op QS8-287.
 *
 * ⚠️ **De klasse, niet het geval.** 0165 sloot `verdien_badges()`: definer,
 *    uitvoerbaar door `authenticated`, en zonder enige toets op wie belt. Er
 *    bleken er negen meer van die vorm te zijn. CLAUDE.md noemt *"fouten worden
 *    gekopieerd — elke definer-functie is een kopie van de vorige"* als de reden
 *    dat de security-reviewer nooit wacht; dit bestand is dat citaat als grendel.
 *
 * ⚠️ **Waarom `functiegrants.test.ts` dit per constructie niet kan zien.** Die
 *    toetst of een migratie een recht bewúst gunt in plaats van het te erven —
 *    niet of dat recht nódig is. 0113 gaf het recht op `verdien_badges` expliciet
 *    weg, dus die grendel zag een besloten recht en zweeg. Twee vragen, twee
 *    grendels.
 *
 * ## Wat hier bewaakt wordt, en in welke volgorde
 *
 * 1. **De vijf revokes van 0167.** Het recht terugzetten maakt precies één rij
 *    zichtbaar in `definer_bewaking()`, per functie.
 * 2. **De vierde tak zelf**, gevoed met elke vorm die hij moet vinden én elke
 *    vorm die hij met rust moet laten. Een controle die je niet kunt voeden, kun
 *    je niet ijken; en een controle die alles meldt, leer je negeren.
 * 3. **De vijfde tak**: het register van uitzonderingen mag niet rotten.
 * 4. **De must-see:** de vier bewakingsfuncties werken ná de revoke nog steeds
 *    via `service_role`. Zonder die helft is "niemand mag het meer" ook te halen
 *    met een functie die stuk is — dat bleek bij QS8-287 het echte
 *    regressierisico.
 *
 * ⚠️ **"Toetst de aanroeper" is transitief.** `groep_klassement`, `groep_teller`
 *    en `ketting_stand` noemen `auth.uid()` niet zelf; ze leunen op
 *    `lid_van_open_groep()` respectievelijk `is_group_member()`, en díe doen het
 *    wel. Een tak die alleen naar het eigen lichaam kijkt, meldt die drie ten
 *    onrechte — gemeten. Vandaar `vorm_delegeert` hieronder, en zijn tegenhanger
 *    `vorm_commentaar`: een helper die alleen in een toelichting genoemd wordt,
 *    is geen delegatie.
 */

const TEST_TIMEOUT = 30_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'definer_bewaking'",
  import.meta.url,
);

/**
 * Draait SQL in **één** psql-sessie, zodat `create function`, `grant` en de
 * aanroep van `definer_bewaking()` erna in dezelfde transactie zitten en de
 * `rollback` alles opruimt.
 *
 * ⚠️ `psql()` uit `./psql-stack` gebruikt `-c`: elke aanroep is dan een eigen
 *    sessie, de `begin` is meteen weer weg, en de proeffunctie blijft staan.
 */
function inEenSessie(sql: string): string {
  return execFileSync(
    'psql',
    ['-U', PSQL_OMGEVING.PGUSER as string, '-d', PSQL_DB, '-q', '-w', '-v', 'ON_ERROR_STOP=1', '-tA'],
    { env: PSQL_OMGEVING, encoding: 'utf8', input: sql },
  ).trim();
}

/** Leest één `sleutel=waarde`-regel uit de uitvoer van een sessie. */
function regel(uit: string, sleutel: string): string | undefined {
  return uit
    .split('\n')
    .map((r) => r.trim())
    .find((r) => r.startsWith(`${sleutel}=`))
    ?.slice(sleutel.length + 1);
}

/**
 * De vijf functies waarvan 0167 het uitvoerrecht van `authenticated` intrekt,
 * met hun handtekening — die staat erbij omdat een `revoke` zonder argumenten
 * een ándere functie kan raken zodra er een overload bijkomt.
 */
const INGETROKKEN: readonly { naam: string; handtekening: string; waarom: string }[] = [
  {
    naam: 'uitnodigingscode_bewaking',
    handtekening: 'uitnodigingscode_bewaking()',
    waarom:
      'serveert de entropie van de uitnodigingscode (alfabet 30, lengte 12) — precies het getal dat de open dossierrij van 16-08 als enige bescherming tegen raden noemt',
  },
  {
    naam: 'systeembericht_allowlist',
    handtekening: 'systeembericht_allowlist()',
    waarom: 'geeft de volledige allowlist van systeemberichttypen prijs',
  },
  {
    naam: 'onveranderlijkheid_bewaking',
    handtekening: 'onveranderlijkheid_bewaking()',
    waarom: 'geeft tabel, trigger, functie en kolom van elke append-only-grendel prijs',
  },
  {
    naam: 'check_waarden',
    handtekening: 'check_waarden(text, text)',
    waarom: 'neemt een willekeurige tabelnaam aan en geeft de CHECK-waarden van elke tabel in public',
  },
  {
    naam: 'goedkeuringsdrempel_gehaald',
    handtekening: 'goedkeuringsdrempel_gehaald(uuid)',
    waarom:
      'vertelt een vreemde met een voltooiings-id of de week van een ánder de goedkeuringsdrempel haalde — domeinregel 7',
  },
];

/**
 * De vormen waarmee de vierde tak gevoed wordt.
 *
 * ⚠️ **Elke vorm zet `anon` er expliciet af**, en dat is geen netheid maar de
 *    ijking zelf: een kale `create function` geeft execute aan PUBLIC, `anon`
 *    erft dat, en dan vangt de dérde tak ("uitvoerbaar door anon") het geval al
 *    af. Een ijking die door een eerdere grendel wordt opgevangen, bewaakt niets
 *    van wat hij belooft. Dat is hier één keer echt gebeurd.
 */
const VORMEN: readonly {
  naam: string;
  lichaam: string;
  definer: boolean;
  gemeld: boolean;
  waarom: string;
}[] = [
  {
    naam: 'vorm_zonder_toets',
    lichaam: 'select 1',
    definer: true,
    gemeld: true,
    waarom: 'het geval van QS8-287: definer, open voor authenticated, geen toets',
  },
  {
    naam: 'vorm_met_toets',
    lichaam: 'select 1 where auth.uid() is not null',
    definer: true,
    gemeld: false,
    waarom: 'toetst de aanroeper zelf',
  },
  {
    naam: 'vorm_invoker',
    lichaam: 'select 1',
    definer: false,
    gemeld: false,
    waarom:
      'een invoker draait met de rechten van de beller, dus er is niets verhoogd — dit bezwaar gaat alleen over definers',
  },
  {
    naam: 'vorm_delegeert',
    lichaam: 'select 1 where is_group_member(gen_random_uuid())',
    definer: true,
    gemeld: false,
    waarom:
      'delegeert de toets aan is_group_member(), dat auth.uid() noemt — de vorm van groep_teller, ketting_stand en groep_klassement',
  },
  {
    naam: 'vorm_commentaar',
    lichaam: '-- leunt volgens de auteur op is_group_member()\n  select 1',
    definer: true,
    gemeld: true,
    waarom:
      'een helper die alleen in een toelichting genoemd wordt, is geen delegatie — pg_get_functiondef() geeft het commentaar mee, dus zonder knipbeurt zou dit stil blijven',
  },
];

describe.skipIf(!beschikbaar)('een definer die authenticated mag aanroepen, toetst de aanroeper', () => {
  it(
    'meldt vandaag niets — geen enkele functie in `public` staat van de vier takken open',
    async () => {
      // ⚠️ Dit is de klassetest en niet de gevaltest: hij blijft kloppen als er
      //    functies bijkomen, en dat is precies waarom hij hier staat naast de
      //    rijen hieronder.
      const uit = psql('select coalesce(string_agg(naam || \' | \' || bezwaar, E\'\\n\'), \'\') from definer_bewaking()');

      expect(uit.trim()).toBe('');
    },
    TEST_TIMEOUT,
  );

  it.each(INGETROKKEN)(
    'laat `authenticated` $naam niet uitvoeren, en meldt het zodra dat weer mag',
    async ({ naam, handtekening, waarom }) => {
      const mag = psql(
        `select has_function_privilege('authenticated', 'public.${handtekening}', 'execute')`,
      ).trim();

      expect(mag, `${naam}: ${waarom}`).toBe('f');

      // ⚠️ De tweede helft, en de reden dat dit meer is dan een catalogusvraag:
      //    het recht terugzetten moet dít geval bij naam melden. Zonder deze
      //    helft toetst de regel hierboven alleen dat de migratie gedraaid is.
      const uit = inEenSessie(`
        begin;
        grant execute on function public.${handtekening} to authenticated;
        select 'gemeld=' || case when exists (
          select 1 from definer_bewaking()
          where naam = '${naam}' and bezwaar like 'definer, uitvoerbaar door authenticated%'
        ) then 'ja' else 'nee' end;
        rollback;
      `);

      expect(regel(uit, 'gemeld'), `${naam}: ${waarom}`).toBe('ja');
    },
    TEST_TIMEOUT,
  );

  it.each(VORMEN)(
    'definer_bewaking() over $naam: gemeld = $gemeld',
    async ({ naam, lichaam, definer, gemeld, waarom }) => {
      const uit = inEenSessie(`
        begin;
        create function public.${naam}() returns integer
          language sql stable
          ${definer ? 'security definer' : ''}
          set search_path = public, pg_temp
          as $ijk$
  ${lichaam}
$ijk$;
        revoke execute on function public.${naam}() from public, anon;
        grant execute on function public.${naam}() to authenticated;

        select 'gemeld=' || case when exists (
          select 1 from definer_bewaking()
          where naam = '${naam}' and bezwaar like 'definer, uitvoerbaar door authenticated%'
        ) then 'ja' else 'nee' end;
        rollback;
      `);

      expect(regel(uit, 'gemeld'), `${naam}: ${waarom}`).toBe(gemeld ? 'ja' : 'nee');
    },
    TEST_TIMEOUT,
  );

  it(
    'meldt een uitzondering die geen bezwaar meer is, zodat het register niet rot',
    async () => {
      // ⚠️ De andere kant van de ratel. Een register zonder houdbaarheid dekt
      //    straks stilzwijgend iets ánders af dan waarvoor het geschreven is:
      //    de naam blijft staan, de reden verdwijnt, en de volgende functie die
      //    zo heet is gratis vrijgesteld.
      // ⚠️ **Dit geval stond op `vereiste_goedkeuringen` en staat sinds 0249 op
      //    `groepsdatum`**, en die verhuizing is zelf het bewijs dat deze test
      //    werkt: QS8-181 gaf de eerste een poort, waarmee zijn registerregel
      //    geen bezwaar meer dekte — en déze tak werd rood en dwong de regel
      //    eruit. Zie de rij in `docs/ENGINEER-REVIEW.md`.
      const uit = inEenSessie(`
        begin;
        revoke execute on function public.groepsdatum(uuid)
          from public, anon, authenticated;
        select 'gemeld=' || case when exists (
          select 1 from definer_bewaking()
          where naam = 'groepsdatum' and bezwaar like 'staat als uitzondering%'
        ) then 'ja' else 'nee' end;
        rollback;
      `);

      expect(regel(uit, 'gemeld')).toBe('ja');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de vier bewakingsfuncties na de revoke nog steeds draaien als `service_role`',
    async () => {
      // ⚠️ De must-see. "Niemand mag het meer" is ook te halen met een functie
      //    die stuk is, en dan is de suite groen om de verkeerde reden. Deze vier
      //    bestaan om via `adminDb()` gedraaid te worden; die weg moet open
      //    blijven.
      const uit = inEenSessie(`
        begin;
        set local role service_role;
        select 'code=' || (uitnodigingscode_bewaking()).alfabet_lengte;
        select 'allowlist=' || (select count(*) > 0 from systeembericht_allowlist());
        select 'onveranderlijk=' || (select count(*) > 0 from onveranderlijkheid_bewaking());
        select 'checks=' || (select count(*) > 0 from check_waarden('public', 'goals'));
        rollback;
      `);

      expect(regel(uit, 'code')).toBe('30');
      expect(regel(uit, 'allowlist')).toBe('true');
      expect(regel(uit, 'onveranderlijk')).toBe('true');
      expect(regel(uit, 'checks')).toBe('true');
    },
    TEST_TIMEOUT,
  );
});
