import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De kolomgrants van `authenticated`, over de volle breedte — QS8-613.
 *
 * ## Waarom dit bestand bestaat
 *
 * De duurste regel van QS8-293 stond niet in een migratie maar als toelichting
 * in een test: *"die kolom staat niet in de UPDATE- of INSERT-grant van
 * `authenticated`, en dat hoort zo."* De invariant was precies goed. De
 * vaststelling was onwaar — `0057` versmalde alleen de UPDATE-grant, en de
 * INSERT-grant was nog de standaard die Supabase via `alter default privileges`
 * uitdeelt: **álle** kolommen. Er stond geen query naast, dus er werd niets
 * rood van, en de belofte van een hele migratie hing eraan.
 *
 * Rij 169 van `docs/ENGINEER-REVIEW.md` laat daarover achter: *schrijf een
 * grant, een policy of een default nooit op als feit zonder de query erbij die
 * het meet — en zet die query in een test, niet in een commentaarregel.*
 *
 * ⚠️⚠️ **Dit bestand is de brede vorm van die regel, en dat is met opzet.** Er
 *    stonden al drie toetsen die de grants van `commitments` en `goals`
 *    vastpinnen. Dat zijn **onderdelen**; de belofte is een eigenschap van het
 *    gehéle schema, en die blijft ook kloppen als er een tabel bij komt die
 *    niemand hier met de hand toevoegt. Regel 18 vraag 2.
 *
 * ⚠️ **Wat hier niet staat en niet kan.** 📏 138 bestanden noemen een grant in
 *    proza, en precies **één** regel draagt een getalsvorm die een script zou
 *    kunnen natellen. Een controle op dat proza is dus niet te bouwen zonder
 *    vals alarm op tientallen plekken — de meting staat in rij 169. Wat wél kan
 *    is de invariant zelf vastleggen, zodat elke bewering ertegen te houden is.
 */

/**
 * ⚠️ De proef moet exact `'1'` geven, en hij moet iets noemen dat pas in een
 *    récénte migratie bestaat — anders zegt een groene proef alleen dat er een
 *    database staat en niet dat hij het schema draagt dat dit bestand toetst.
 *    `reports` komt uit `0296`.
 */
const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'reports' and relkind = 'r'",
  import.meta.url,
);

/**
 * Tabellen waar de schrijfgrant van `authenticated` élke kolom dekt.
 *
 * ⚠️ De query draait binnen een transactie die de aanroeper openlaat, zodat een
 *    toets er eerst een kapot geval in kan zetten. Dat is de ijking: deze lezer
 *    moet aantoonbaar kúnnen vinden wat hij belooft te vinden.
 */
function tabelbredeSchrijfgrants(opzet: readonly string[] = []): string[] {
  const uit = psqlMetInvoer(
    [
      'begin;',
      ...opzet,
      `select coalesce(string_agg(t, ','), '') from (
         select g.table_name || '|' || g.privilege_type as t
         from (
           select table_name, privilege_type, count(*) as gegund
           from information_schema.column_privileges
           where table_schema = 'public' and grantee = 'authenticated'
             and privilege_type in ('INSERT', 'UPDATE')
           group by 1, 2
         ) g
         join (
           select table_name, count(*) as totaal
           from information_schema.columns
           where table_schema = 'public'
           group by 1
         ) k on k.table_name = g.table_name
         where g.gegund = k.totaal
         order by 1
       ) s;`,
      'rollback;',
    ].join('\n'),
  );

  return uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.includes('|'))
    .flatMap((r) => r.split(','))
    .filter((r) => r !== '');
}

/**
 * Schrijfrechten op een kolom die de database zelf hoort te zetten.
 *
 * ⚠️ Zelfde vorm als hierboven: `opzet` laat een toets er een kapot geval in
 *    zetten, binnen een transactie die terugrolt. Een lezer zonder ijking is een
 *    bewering.
 */
function schrijfrechtOpTijdstempels(opzet: readonly string[] = []): string[] {
  const uit = psqlMetInvoer(
    [
      'begin;',
      ...opzet,
      `select coalesce(string_agg(table_name || '.' || column_name || '|' || privilege_type, ','), '')
       from information_schema.column_privileges
       where table_schema = 'public' and grantee = 'authenticated'
         and privilege_type in ('INSERT', 'UPDATE')
         and column_name in ('created_at', 'updated_at');`,
      'rollback;',
    ].join('\n'),
  );

  return uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.includes('|'))
    .flatMap((r) => r.split(','))
    .filter((r) => r !== '');
}

describe.skipIf(!beschikbaar)('de kolomgrants van authenticated', () => {
  /**
   * ⚠️⚠️ **De ijking staat hier ín het bestand en niet in een handeling.** Een
   *    toets die zegt "er is geen tabelbrede schrijfgrant" ziet er precies zo uit
   *    als een toets die niets meet. Deze zet er eerst zelf een neer — in een
   *    transactie die terugrolt — en eist dat de lezer hem vindt. Pas daarna
   *    betekent de groene toets hieronder iets.
   */
  it(
    'vindt een tabelbrede schrijfgrant als die er is',
    () => {
      const gevonden = tabelbredeSchrijfgrants([
        'create table public.proef_grants_613 (id uuid primary key, tekst text);',
        'grant insert on public.proef_grants_613 to authenticated;',
      ]);

      expect(gevonden, 'de lezer zag een tabelbrede INSERT-grant niet').toContain(
        'proef_grants_613|INSERT',
      );
    },
    30_000,
  );

  /**
   * De faalvorm van QS8-293: een grant die de Supabase-standaard nog is in plaats
   * van een bewuste lijst. Zo'n grant ziet er in een migratie uit als niets —
   * hij is de afwezigheid van een `revoke`.
   */
  it(
    'laat geen enkele tabel een schrijfgrant dragen die alle kolommen dekt',
    () => {
      expect(tabelbredeSchrijfgrants()).toEqual([]);
    },
    30_000,
  );

  /**
   * De invariant die rij 169 redde. ⚠️ Hij staat hier over álle tabellen en niet
   * over de vier die het oorspronkelijke issue mat: een gebruiker die zijn eigen
   * `created_at` kiest, kiest zijn eigen wachtvenster — en welke tabel dat is,
   * hangt af van welke grendel er morgen op een tijdstempel gebouwd wordt.
   */
  it(
    'vindt schrijfrecht op een tijdstempel als dat er is',
    () => {
      const gevonden = schrijfrechtOpTijdstempels([
        'create table public.proef_klok_613 (id uuid primary key, created_at timestamptz);',
        'grant update (created_at) on public.proef_klok_613 to authenticated;',
      ]);

      expect(gevonden, 'de lezer zag een UPDATE-recht op `created_at` niet').toContain(
        'proef_klok_613.created_at|UPDATE',
      );
    },
    30_000,
  );

  it(
    'geeft `authenticated` nergens schrijfrecht op `created_at` of `updated_at`',
    () => {
      expect(schrijfrechtOpTijdstempels()).toEqual([]);
    },
    30_000,
  );
});
