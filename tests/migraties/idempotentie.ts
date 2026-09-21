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

/**
 * Haalt commentaar en de tekst uit stringliteralen weg, met behoud van
 * regelnummers.
 *
 * ⚠️⚠️ **Die zin stond hier al vóór QS8-570 en de code deed alleen de helft van
 *    de eerste helft.** Er stond één regel — knip vanaf de eerste `--` — en dat
 *    betekende drie dingen: blokcommentaar bleef staan, stringliteralen bleven
 *    staan, en een `--` binnen een literal knipte juist wél. Dezelfde klasse als
 *    QS8-466, waar een comment een transactie beloofde die de vlag niet leverde:
 *    **een belofte in de kop leest als een eigenschap van de code.**
 *
 * ⚠️ **Wat het open liet.** `dropsVoor()` zoekt de `drop … if exists` die een
 *    `create` vrijpleit. Stond die drop in een blokcommentaar, dan telde hij mee
 *    en zweeg de grendel onder onwrikbare regel 20. 📏 Gemeten met vier vormen,
 *    de controlerij eerst — zonder die had de nul van rij 3 niets bewezen:
 *
 *    ```
 *    create zonder enige drop        -> 1 gemeld   (de controlerij)
 *    met een échte drop ervoor       -> 0 gedekt   (correct)
 *    met die drop in een blok        -> 0 gedekt   <- het gat
 *    met die drop op een --regel     -> 1 gemeld   (correct)
 *    ```
 *
 *    Het gat was nog niet geraakt: 📏 nul migraties dragen vandaag een
 *    `drop … if exists` ín een blok. Wat het dichthield was een gewoonte —
 *    de koppen van dit project staan in `--`-regels — en niet een grendel. En
 *    juist die kop draagt het ROLLBACK-PAD, dat per definitie drops bevat: wie
 *    ooit een kop als blok schrijft, pleit zijn eigen migratie vrij.
 *
 * ⚠️ **Waarom een scanner en niet een tweede knip.** Een tweede knip op blokcommentaar die
 *    niets van quotes weet, verplaatst het gat alleen: dan knipt een blokopener in
 *    een literal de rest van het bestand weg, en dat faalt **open** op alles wat
 *    erna komt. Postgres nest blokcommentaar bovendien. Dit loopt daarom teken
 *    voor teken, met dezelfde redenering als `code_zonder_commentaar()` in
 *    migratie 0292 — die code is SQL en niet te hergebruiken, de redenering wel.
 *
 * ⚠️ De tekst ín een literal gaat eruit maar de quotes blijven staan: een
 *    `create table` die als tekst in een string staat, wordt niet uitgevoerd en
 *    hoort dus niet gemeld te worden. Aanhalingstekens rond een **identifier**
 *    (`"..."`) blijven ongemoeid — dat is een objectnaam en die telt wél mee.
 */
function ontdaanVanRuis(inhoud: string): readonly string[] {
  return zonderCommentaarEnTekst(inhoud).split('\n');
}

/**
 * De bron met commentaar en literaalinhoud vervangen door spaties.
 *
 * ⚠️⚠️ **De naam begint met opzet met `zonderCommentaar`.** `knip:controle`
 *    (QS8-567) zoekt knippen met het patroon `zonderCommentaar\\w*` en kijkt
 *    daarbij óók in `tests/`. Een zeef die anders heet, is voor die grendel
 *    onzichtbaar — 📏 gemeten: onder de naam `schoneBron` bleef hij groen op
 *    813 bestanden zonder deze knip te tellen. **Dat is langs een grendel komen
 *    door hoe je iets noemt**, en dat is precies de klasse waar dit bestand zelf
 *    over gaat. De uitzondering staat nu met reden in `MET_REDEN` in
 *    `scripts/knip-controle.mjs`.
 *
 *    ⚠️ Het achtervoegsel `EnTekst` volgt `scripts/uitgang-controle.mjs`: die
 *    haalt óók stringliteralen weg, en dat is een andere belofte dan "zonder
 *    commentaar".
 *
 * Geëxporteerd om los te kunnen voeden — CLAUDE.md regel 18: *een controle die
 * je niet kunt voeden, kun je niet ijken*. Elke regel houdt zijn lengte en elke
 * `\n` blijft staan, zodat de regelnummers in een bezwaar blijven kloppen.
 */
export function zonderCommentaarEnTekst(inhoud: string): string {
  const uit: string[] = [];
  let i = 0;

  while (i < inhoud.length) {
    const rest = inhoud.slice(i);

    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (dollar !== null) {
      i = slaOver(inhoud, i, uit, dollar[0], dollar[0].length, dollar[0]);
      continue;
    }
    if (inhoud.startsWith('--', i)) {
      i = totEindeRegel(inhoud, i, uit);
      continue;
    }
    if (inhoud.startsWith('/*', i)) {
      i = blokWeg(inhoud, i, uit);
      continue;
    }
    if (inhoud[i] === "'") {
      i = slaOver(inhoud, i, uit, "'", 1, "'");
      continue;
    }
    if (inhoud[i] === '"') {
      i = identifierDoor(inhoud, i, uit);
      continue;
    }

    uit.push(inhoud[i]!);
    i += 1;
  }

  return uit.join('');
}

/** Een teken bewaren als spatie, of als zichzelf zodra het een regeleinde is. */
function leeg(teken: string): string {
  return teken === '\n' ? '\n' : ' ';
}

/** Vanaf `i` tot en met het regeleinde leegmaken. */
function totEindeRegel(inhoud: string, i: number, uit: string[]): number {
  let j = i;
  while (j < inhoud.length && inhoud[j] !== '\n') {
    uit.push(' ');
    j += 1;
  }
  return j;
}

/**
 * Blokcommentaar leegmaken.
 *
 * ⚠️ **Postgres nest blokcommentaar**, anders dan C. Een blokopener binnen een blok
 *    opent een niveau erbij, en pas de bijbehorende sluiter sluit het. Tellen
 *    tot de eerste sluiter zou hier een blok te vroeg sluiten en de rest van het
 *    bestand als code lezen.
 */
function blokWeg(inhoud: string, i: number, uit: string[]): number {
  let diepte = 0;
  let j = i;
  while (j < inhoud.length) {
    if (inhoud.startsWith('/*', j)) {
      diepte += 1;
      uit.push(' ', ' ');
      j += 2;
      continue;
    }
    if (inhoud.startsWith('*/', j)) {
      diepte -= 1;
      uit.push(' ', ' ');
      j += 2;
      if (diepte === 0) return j;
      continue;
    }
    uit.push(leeg(inhoud[j]!));
    j += 1;
  }
  return j;
}

/**
 * Een literal leegmaken: de begrenzers blijven, de inhoud wordt spatie.
 *
 * ⚠️ `''` binnen een enkelgequote string is een ontsnapt aanhalingsteken en geen
 *    einde. Bij een dollar-quote bestaat die vorm niet — daar sluit alleen
 *    dezelfde tag.
 */
function slaOver(
  inhoud: string,
  i: number,
  uit: string[],
  begin: string,
  lengte: number,
  eind: string,
): number {
  uit.push(begin);
  let j = i + lengte;
  while (j < inhoud.length) {
    if (eind === "'" && inhoud.startsWith("''", j)) {
      uit.push(' ', ' ');
      j += 2;
      continue;
    }
    if (inhoud.startsWith(eind, j)) {
      uit.push(eind);
      return j + eind.length;
    }
    uit.push(leeg(inhoud[j]!));
    j += 1;
  }
  return j;
}

/** Een gequote identifier blijft staan — dat is een objectnaam, geen tekst. */
function identifierDoor(inhoud: string, i: number, uit: string[]): number {
  uit.push('"');
  let j = i + 1;
  while (j < inhoud.length) {
    if (inhoud.startsWith('""', j)) {
      uit.push('""');
      j += 2;
      continue;
    }
    uit.push(inhoud[j]!);
    if (inhoud[j] === '"') return j + 1;
    j += 1;
  }
  return j;
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
