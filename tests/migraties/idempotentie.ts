/**
 * Vindt migratieregels die bij een tweede ronde omvallen — onwrikbare regel 20.
 *
 * ⚠️ **Geijkt tegen een meting en niet tegen een redenering.** Op 28-08-2026 is
 *    het schema uit `supabase/migrations/` op een lege database opgebouwd en
 *    daarna is élk bestand een tweede keer afgespeeld. Zeven van de 109 vielen
 *    om, en dat waren twee verschillende dingen:
 *
 *    **Klasse A — werkelijk niet idempotent.** Drie regels in twee bestanden:
 *    `create function` zonder `or replace` (0059, twee keer) en `create unique
 *    index` zonder `if not exists` (0094). Dit is wat deze controle vindt.
 *
 *    **Klasse B — valt om, en dat is de beveiliging.** Vijf bestanden (0002,
 *    0003, 0008, 0016, 0024) proberen bij een tweede ronde een óudere definitie
 *    terug te zetten van een object dat een latere migratie veranderd heeft.
 *    Postgres weigert dat met "cannot change return type" of "cannot drop
 *    columns from view". **Die fout is het enige dat de terugzet tegenhoudt** —
 *    bij `group_visible_streaks` zou het zelfs een domeinregel-7-besluit
 *    terugdraaien (0003 laat `last_cycle_start` er bewust uit, 0078 zette hem er
 *    onder besluit A41 weer in). Deze controle mag klasse B **nooit** melden.
 *
 * ⚠️ **Waarom een drop-uitzondering, en waarom die de handtekening leest.**
 *    `create or replace function` kan het returntype niet wijzigen, dus een
 *    migratie die de vorm van een functie verandert moet hem eerst droppen.
 *    0059 doet dat voor `groepschat` en dat is correct. Maar 0059 dropt óók
 *    `plaats_systeembericht(uuid, text, text)` en maakt daarna een versie met
 *    zés argumenten — een andere functie, dus de drop dekt hem niet. Een
 *    controle die alleen op naam vergelijkt, laat precies de bug door die deze
 *    controle bestaat om te vinden.
 */

export type Bezwaar = {
  readonly bestand: string;
  readonly regel: number;
  readonly soort: string;
  readonly naam: string;
  readonly reden: string;
};

/** Haalt commentaar en tekst uit stringliteralen weg, met behoud van regelnummers. */
function ontdaanVanRuis(inhoud: string): readonly string[] {
  return inhoud.split('\n').map((regel) => {
    const commentaar = regel.indexOf('--');
    return commentaar === -1 ? regel : regel.slice(0, commentaar);
  });
}

const TYPE_ALIAS: Record<string, string> = {
  timestamptz: 'timestamptz',
  'timestamp with time zone': 'timestamptz',
  int: 'integer',
  int4: 'integer',
  int2: 'smallint',
  int8: 'bigint',
  bool: 'boolean',
  varchar: 'text',
};

function normaliseerType(ruw: string): string {
  const schoon = ruw.trim().toLowerCase().replace(/\s+/g, ' ');
  return TYPE_ALIAS[schoon] ?? schoon;
}

/**
 * Leest de argumenttypes uit een functie-handtekening.
 *
 * Werkt zowel op de vorm van een `drop` (`(uuid, text, text)`) als op die van
 * een `create` (`(p_group_id uuid, p_body text default null)`) — bij de tweede
 * is het type het laatste woord vóór een eventuele `default`.
 */
export function argumenttypes(argumentlijst: string): readonly string[] {
  const binnen = argumentlijst.trim().replace(/^\(/, '').replace(/\)$/, '').trim();
  if (binnen === '') return [];

  return binnen.split(',').map((stuk) => {
    const zonderDefault = stuk.split(/\bdefault\b/i)[0]!.trim();
    const woorden = zonderDefault.split(/\s+/).filter(Boolean);
    // Eén woord is een kale type-opsomming (drop); meer woorden is `naam type`.
    const type = woorden.length <= 1 ? woorden.join(' ') : woorden.slice(1).join(' ');
    return normaliseerType(type);
  });
}

/** Pakt de haakjesgroep die op `vanaf` begint, over regelgrenzen heen. */
function haakjesgroep(tekst: string, vanaf: number): string | null {
  let diepte = 0;
  for (let i = vanaf; i < tekst.length; i += 1) {
    if (tekst[i] === '(') diepte += 1;
    else if (tekst[i] === ')') {
      diepte -= 1;
      if (diepte === 0) return tekst.slice(vanaf, i + 1);
    }
  }
  return null;
}

type Drop = { readonly soort: string; readonly naam: string; readonly types: readonly string[] | null };

function zonderSchema(naam: string): string {
  return naam.toLowerCase().replace(/^public\./, '').replace(/"/g, '');
}

/** Alle `drop ... if exists` die vóór regelnummer `voor` staan. */
function dropsVoor(regels: readonly string[], voor: number): readonly Drop[] {
  const gevonden: Drop[] = [];
  const tekst = regels.slice(0, voor).join('\n');
  const patroon = /\bdrop\s+(function|index|table|view|trigger|policy|type)\s+if\s+exists\s+([^\s(;]+)/gi;

  for (let treffer = patroon.exec(tekst); treffer !== null; treffer = patroon.exec(tekst)) {
    const soort = treffer[1]!.toLowerCase();
    const naam = zonderSchema(treffer[2]!);
    let types: readonly string[] | null = null;
    if (soort === 'function') {
      const open = tekst.indexOf('(', treffer.index + treffer[0].length - 1);
      const groep = open === -1 ? null : haakjesgroep(tekst, open);
      types = groep === null ? [] : argumenttypes(groep);
    }
    gevonden.push({ soort, naam, types });
  }
  return gevonden;
}

function zelfdeLijst(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Geeft elke `create` die bij een tweede ronde op een bestaand object stuit.
 *
 * Een `create` is in orde als hij zichzelf beschermt (`or replace`, `if not
 * exists`) of als hetzelfde bestand het object eerder dropt met `if exists` —
 * en bij een functie moet die drop dezelfde argumenttypes noemen.
 */
export function bezwarenIn(bestand: string, inhoud: string): readonly Bezwaar[] {
  const regels = ontdaanVanRuis(inhoud);
  const bezwaren: Bezwaar[] = [];

  regels.forEach((regel, index) => {
    const nr = index + 1;

    const functie = /^\s*create\s+(or\s+replace\s+)?function\s+([^\s(]+)/i.exec(regel);
    if (functie !== null) {
      if (functie[1] !== undefined) return;
      const naam = zonderSchema(functie[2]!);
      const rest = regels.slice(index).join('\n');
      const open = rest.indexOf('(');
      const groep = open === -1 ? null : haakjesgroep(rest, open);
      const types = groep === null ? [] : argumenttypes(groep);
      const gedekt = dropsVoor(regels, index).some(
        (d) => d.soort === 'function' && d.naam === naam && d.types !== null && zelfdeLijst(d.types, types),
      );
      if (!gedekt) {
        bezwaren.push({
          bestand,
          regel: nr,
          soort: 'function',
          naam,
          reden:
            groep === null
              ? 'create function zonder or replace, en de argumentlijst is niet te lezen'
              : `create function zonder or replace, en geen drop function if exists ${naam}(${types.join(', ')}) ervoor`,
        });
      }
      return;
    }

    const index_ = /^\s*create\s+(unique\s+)?index\s+(concurrently\s+)?(if\s+not\s+exists\s+)?([^\s(]+)/i.exec(regel);
    if (index_ !== null) {
      if (index_[3] !== undefined) return;
      const naam = zonderSchema(index_[4]!);
      const gedekt = dropsVoor(regels, index).some((d) => d.soort === 'index' && d.naam === naam);
      if (!gedekt) {
        bezwaren.push({
          bestand, regel: nr, soort: 'index', naam,
          reden: `create index zonder if not exists, en geen drop index if exists ${naam} ervoor`,
        });
      }
      return;
    }

    const tabel = /^\s*create\s+table\s+(if\s+not\s+exists\s+)?([^\s(]+)/i.exec(regel);
    if (tabel !== null) {
      if (tabel[1] !== undefined) return;
      const naam = zonderSchema(tabel[2]!);
      const gedekt = dropsVoor(regels, index).some((d) => d.soort === 'table' && d.naam === naam);
      if (!gedekt) {
        bezwaren.push({
          bestand, regel: nr, soort: 'table', naam,
          reden: `create table zonder if not exists, en geen drop table if exists ${naam} ervoor`,
        });
      }
      return;
    }

    const view = /^\s*create\s+(or\s+replace\s+)?view\s+([^\s(]+)/i.exec(regel);
    if (view !== null) {
      if (view[1] !== undefined) return;
      const naam = zonderSchema(view[2]!);
      const gedekt = dropsVoor(regels, index).some((d) => d.soort === 'view' && d.naam === naam);
      if (!gedekt) {
        bezwaren.push({
          bestand, regel: nr, soort: 'view', naam,
          reden: `create view zonder or replace, en geen drop view if exists ${naam} ervoor`,
        });
      }
      return;
    }

    for (const soort of ['trigger', 'policy', 'type'] as const) {
      const patroon = new RegExp(`^\\s*create\\s+${soort}\\s+([^\\s(]+)`, 'i');
      const treffer = patroon.exec(regel);
      if (treffer === null) continue;
      const naam = zonderSchema(treffer[1]!);
      const gedekt = dropsVoor(regels, index).some((d) => d.soort === soort && d.naam === naam);
      if (!gedekt) {
        bezwaren.push({
          bestand, regel: nr, soort, naam,
          reden: `create ${soort} zonder drop ${soort} if exists ${naam} ervoor`,
        });
      }
      return;
    }
  });

  return bezwaren;
}
