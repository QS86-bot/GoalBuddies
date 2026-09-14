import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Geen tabel in `public` geeft `anon` SELECT — of staat hieronder met een reden.
 * QS8-467.
 *
 * ⚠️ **Waarom dit een eigen grendel is.** Supabase deelt met
 *    `alter default privileges` élke nieuwe tabel in `public` uit aan `anon`,
 *    `authenticated` én `service_role`. Die geërfde `anon`-SELECT blijft dicht
 *    door de **afwezigheid** van een policy, en dat is geen slot: één
 *    `create policy … using (…)` **zonder** `TO`-clausule — de standaardvorm,
 *    die `TO PUBLIC` betekent — opent alles wat de grant nog draagt.
 *
 *    📏 Op 14-09-2026 droegen **24** tabellen die grant. `alleenlezen_bewaking()`
 *    noemt `anon` nergens in zijn definitie, en `schrijfrechten_bewaking()` dekt
 *    INSERT/UPDATE/DELETE — SELECT valt buiten alle drie de bestaande
 *    bewakingen. De doorlichting brak het met de hand: alle drie bleven groen
 *    terwijl een niet-ingelogd verzoek `owner_id`, `title` en `description`
 *    teruggaf.
 *
 * ⚠️⚠️ **`has_any_column_privilege` en niet `has_table_privilege` — en dat is
 *    een blokkerende bevinding uit de security-review geweest.** De eerste
 *    versie vroeg naar het **tabel**recht. 📏 Nagemeten met de hand:
 *
 *        grant select (owner_id, title, description) on public.goals to anon;
 *        has_table_privilege('anon','goals','SELECT')      -> false
 *        has_any_column_privilege('anon','goals','SELECT') -> true
 *
 *    en deze suite bleef **groen op 4** terwijl `anon` leesrecht had op precies
 *    de drie kolommen waar de doorlichtingsrij mee begon. Met één policy zonder
 *    `TO` erbij las een niet-ingelogde bezoeker de titel en de omschrijving.
 *
 * ⚠️ **En de ijking hieronder was medeplichtig.** Mutatie A voerde het geval
 *    door de *tabel*grant — precies de dimensie die het oude predicaat wél zag.
 *    CLAUDE.md waarschuwt daarvoor met zoveel woorden: een ijking die zijn geval
 *    door een pad voert dat een éérdere grendel al afvangt, bewaakt niets van
 *    wat hij belooft. De kolomdimensie was nooit geijkt, terwijl de kop van deze
 *    suite bij mutatie B zélf beschrijft dat een tabelgrant iets anders is dan
 *    een kolomgrant. 📏 De correctie kost niets: nul vals alarm op de schone
 *    database. Deze repo had die les al betaald in
 *    `scripts/kolomrechten-controle.mjs` (QS8-334): *het recht is de waarheid,
 *    niet de boekhouding erover.*
 *
 * ⚠️⚠️ **De tweede helft weegt hier het zwaarst: `authenticated` mag niets
 *    verliezen.** Dat is de enige manier waarop migratie 0261 iets kan breken —
 *    de hele app draait op die rol. Een revoke die te ver grijpt is erger dan de
 *    geërfde grant die hij weghaalt, dus die kant staat hieronder net zo hard
 *    getoetst als de eerste.
 *
 * IJKING — met de hand gedraaid op 14-09-2026, één mutatie per grendel:
 *
 *   A1 `grant select on public.goals to anon` (tabelgrant)   → 1 rood hier
 *   A2 `grant select (title) on public.goals to anon` (kolom)  → 1 rood hier
 *   B  `revoke select on public.goals from authenticated`    → 1 rood hier
 *   C  een naam uit GEEN_CLIENTLEZER halen                   → 1 rood hier
 *
 * ⚠️⚠️ **Zet een grant-ijking terug met een verse opbouw en niet met de hand.**
 *    📏 Bij mutatie B heb ik `revoke select on public.goals from authenticated`
 *    gedaan en daarna `grant select on public.goals to authenticated` — en dat
 *    is de **tabel**grant, terwijl 0236 daar met opzet alleen *kolom*grants
 *    heeft. De ijking slaagde, en drie toetsen in `doelkolommen.test.ts` gingen
 *    daarna om: een groepsgenoot kon `identity_statement` lezen. De inverse van
 *    een revoke is niet de grant die je intypt; hij is wat de migratiereeks
 *    zegt. `DB=goalbuddies_rls bash scripts/schema-opbouwen.sh` is de enige
 *    betrouwbare terugzet — en die drie rode toetsen waren het net dat het ving.
 */

/**
 * Tabellen die `anon` bewust wél mag lezen, met de reden erbij.
 *
 * ⚠️ **Vandaag leeg, en dat is een uitkomst en geen gemakzucht.** Deze app is
 *    volledig achter een login: er is geen scherm dat data toont vóór het
 *    inloggen. Komt er ooit iets publieks bij — een gedeelde doelpagina, een
 *    uitnodigingslandingspagina — dan hoort de tabel hier met een gemeten reden,
 *    niet met "die is toch onschuldig".
 */
const REGISTER: Readonly<Record<string, string>> = {};

/**
 * Tabellen die met opzet vóór géén enkele client openstaan — ook niet voor
 * `authenticated`.
 *
 * ⚠️ **Dit register is er gekomen doordat de toets eronder meteen afging.** De
 *    eerste versie eiste dat élke tabel leesbaar blijft voor `authenticated`, en
 *    dat is niet waar: een dagteller is administratie van de database zelf, geen
 *    gegeven van de gebruiker. 📏 Twee tabellen kwamen eruit, en allebei terecht.
 *    Zonder dit register was de keuze geweest om de toets te verzwakken tot hij
 *    zweeg — en dan bewaakt hij de kant die stuk kán gaan niet meer.
 */
const GEEN_CLIENTLEZER: Readonly<Record<string, string>> = {
  dagtellers:
    'De gedeelde dagtellertabel achter `tel_dagteller()` (0203/0207/0234). Een ' +
    'client die zijn eigen verbruik kan lezen, kan het ook plannen; de tellers ' +
    'worden uitsluitend door definer-functies bijgewerkt.',
  invite_preview_limits:
    'De limiettabel achter het oningelogde uitnodigingseindpunt (0131). Hij ' +
    'bestaat juist om een niet-ingelogde bezoeker te remmen, dus leesrecht voor ' +
    'wie dan ook zou de rem meetbaar maken voor wie hem wil omzeilen.',
};

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'goals' and relkind = 'r' and relnamespace = 'public'::regnamespace",
  import.meta.url,
);

/** Elke tabel in `public`, met wat `anon` en `authenticated` erop mogen lezen. */
function leesrechten(): { naam: string; anon: boolean; ingelogd: boolean }[] {
  const uit = psql(`
    select c.relname
         || '|' || has_any_column_privilege('anon', c.oid, 'SELECT')::text
         || '|' || has_any_column_privilege('authenticated', c.oid, 'SELECT')::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by 1
  `);

  return uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '')
    .map((r) => {
      const [naam, anon, ingelogd] = r.split('|');
      // ⚠️ `'true'` en niet `'t'` — de query cast met `::text`. Zelfde valkuil
      //    als in `plafonddekking.test.ts`, en die kostte daar een toets die
      //    voor élke tabel `false` zag.
      return { naam: naam ?? '', anon: anon === 'true', ingelogd: ingelogd === 'true' };
    });
}

describe.skipIf(!beschikbaar)('geen tabel geeft anon een leesrecht zonder reden', () => {
  it('geen enkele tabel buiten het register laat anon lezen', () => {
    const open = leesrechten()
      .filter((t) => t.anon && REGISTER[t.naam] === undefined)
      .map((t) => t.naam);

    expect(
      open,
      `Deze tabellen geven \`anon\` nog SELECT. Trek dat in met een migratie ` +
        `(zie 0261 voor de vorm), of zet ze met een gemeten reden in REGISTER ` +
        `hierboven. De grant blijft vandaag alleen dicht doordat er geen policy ` +
        `voor anon bestaat — één \`create policy\` zonder \`TO\` opent alles.`,
    ).toEqual([]);
  });

  /**
   * ⚠️ **Zonder deze toets bewijst de regel hierboven niets.** Een query die
   *    per ongeluk nul rijen teruggeeft — een typfout in het schema, een
   *    kolomnaam die verschuift — laat hem stilzwijgend slagen. 📏 Op
   *    14-09-2026 telde `public` 42 tabellen.
   */
  it('en de meting vindt werkelijk tabellen — anders is groen niets waard', () => {
    expect(leesrechten().length).toBeGreaterThanOrEqual(40);
  });

  /**
   * ⚠️ **De kant die stuk kan gaan.** Migratie 0261 revoket van `public, anon`
   *    en laat `authenticated` met opzet staan; grijpt zo'n revoke ooit te ver,
   *    dan is de app dicht voor iedereen. Dit is de eerste toets die dat vindt.
   */
  it('elke tabel blijft leesbaar voor authenticated', () => {
    const dicht = leesrechten()
      .filter((t) => !t.ingelogd && GEEN_CLIENTLEZER[t.naam] === undefined)
      .map((t) => t.naam);

    expect(
      dicht,
      'Deze tabellen geven `authenticated` geen enkel leesrecht meer. Een revoke ' +
        'heeft te ver gegrepen: de app draait volledig op die rol. Hoort de tabel ' +
        'juist dicht te staan, zet hem dan met een reden in GEEN_CLIENTLEZER.',
    ).toEqual([]);
  });

  it('de registers bevatten geen naam die niets meer bewaakt', () => {
    const bestaand = new Set(leesrechten().map((t) => t.naam));
    const verdwenen = [...Object.keys(REGISTER), ...Object.keys(GEEN_CLIENTLEZER)].filter(
      (n) => !bestaand.has(n),
    );

    expect(verdwenen, 'Deze tabellen bestaan niet meer; haal ze uit REGISTER.').toEqual([]);
  });
});
