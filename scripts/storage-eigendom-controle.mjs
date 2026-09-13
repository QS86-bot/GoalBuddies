#!/usr/bin/env node
/**
 * Wat er op `storage.*` wél en niet voorwaardelijk mag — QS8-439.
 *
 * ⚠️ **De vraag is niet "staat dit in een blok" maar "draait dit op productie".**
 *    De eerste versie van deze controle vroeg of een `create index` búiten een
 *    `$$`-blok stond. 📏 De security-review voerde er acht vormen aan die er
 *    allemaal doorheen kwamen, en de gevaarlijkste was `do $$ begin create index
 *    … end $$;` **zonder** `exception`-regel: dat is precies de kopieerfout die
 *    ontstaat als iemand de huisstijl uit 0222 overneemt en bij het knippen de
 *    vangregel laat vallen. Groene controle, groene migratie, en productie staat
 *    opnieuw stil.
 *
 * ## Twee richtingen, en ze zijn elkaars spiegelbeeld
 *
 * `storage.objects` is eigendom van `supabase_storage_admin`; alles wat dit
 * project heeft draait als `postgres`. 📏 Per handeling gemeten op 12-09-2026,
 * elk in een eigen terugrollende transactie tegen het echte project:
 *
 *     create policy   -> gaat        create index  -> 42501
 *     create trigger  -> gaat        add constraint unique -> 42501
 *
 * **Een index móet voorwaardelijk** — anders stopt de reeks.
 * **Een grendel mag dat juist níet** — een policy of trigger die stil wordt
 * overgeslagen is geen prestatiekwestie maar een gat. Bij een policy valt dat
 * dicht (geen policy, niemand erbij); bij een **trigger valt het open**: een
 * migratie die `drop trigger if exists` doet en daarna een voorwaardelijke
 * `create trigger`, laat `bewaak_chatfoto_aantal()` nergens meer aan hangen en
 * dan is er geen bovengrens meer op uploads. Die richting is de reden dat deze
 * controle beide kanten meldt en niet alleen de index.
 *
 * ⚠️ **`when others` telt niet als vangen.** Die slikt óók een ontbrekende
 *    kolom, een onbekende functie en een tikfout in de expressie — dan is de
 *    migratie groen terwijl hij niets heeft gedaan.
 *
 * ⚠️ **`concurrently` kan niet in een blok** (`25001: CREATE INDEX CONCURRENTLY
 *    cannot run inside a transaction block`, gemeten). Die vorm krijgt daarom
 *    een eigen melding: hij is hier niet op te lossen en hoort buiten de
 *    migratie.
 *
 * ⚠️ **De grens verschuift.** Op 09-09-2026 gaven policies en triggers dezelfde
 *    42501; Supabase heeft de rechten daarna verruimd. Wordt `create index` ooit
 *    ook toegestaan, dan hoort deze controle wég en niet uitgezet — met de
 *    nieuwe meting en haar datum erbij.
 *
 * Draaien: `npm run storage-eigendom:controle`. Hoort mee in `npm run poort`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIES = join(WORTEL, 'supabase', 'migrations');

/**
 * `storage.objects`, `storage . objects`, `"objects"` én het kale `objects` —
 * dit project heeft geen tabel `objects` of `buckets` in `public`, dus een
 * ongekwalificeerde verwijzing kan alleen die van `storage` zijn.
 */
const VREEMDE_TABEL = String.raw`(?:storage\s*\.\s*)?"?(?:objects|buckets)"?`;

/** Een index aanleggen vraagt eigendom — dit moet voorwaardelijk. */
const INDEXACHTIG = new RegExp(
  String.raw`create\s+(?:unique\s+)?index\s+(?:(concurrently)\s+)?(?:if\s+not\s+exists\s+)?` +
    String.raw`(?:"?[a-z0-9_]+"?\s+)?on\s+(?:only\s+)?${VREEMDE_TABEL}`,
  'gi',
);

/** Een unieke constraint legt óók een index aan, en vraagt dus hetzelfde. */
const CONSTRAINTACHTIG = new RegExp(
  String.raw`alter\s+table\s+(?:only\s+)?${VREEMDE_TABEL}\s+add\s+constraint\s+[a-z0-9_"]+\s+` +
    String.raw`(unique|primary\s+key|exclude)\b`,
  'gi',
);

/** Een grendel — die gaat wél, en mag dus juist niet stil overgeslagen worden. */
const GRENDEL = new RegExp(
  String.raw`(?:create\s+(policy|trigger)\s+[a-z0-9_"]+\s+(?:on|before|after|instead)[\s\S]{0,80}?${VREEMDE_TABEL}` +
    String.raw`|alter\s+table\s+${VREEMDE_TABEL}\s+enable\s+(row\s+level\s+security))`,
  'gi',
);

/** Commentaar weg, zodat een rollback-pad in de kop niet als code telt. */
export function zonderCommentaar(sql) {
  return sql.replace(/--[^\n]*/g, '');
}

/**
 * Elk dollargequote blok, met zijn tekst — ook `$fn$`, `$rb$`, `$migratie$`.
 *
 * ⚠️ De eerste versie kende alleen `$$`. Dit project gebruikt meerdere labels,
 *    en een correct afgevangen `do $migratie$ … $migratie$` werd daardoor ten
 *    onrechte gemeld.
 */
export function blokken(sql) {
  const uit = [];
  const tags = [...sql.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)?\$/g)];
  const open = new Map();

  for (const t of tags) {
    const label = t[1] ?? '';
    const start = open.get(label);
    if (start === undefined) {
      open.set(label, t.index + t[0].length);
      continue;
    }
    uit.push({ van: start, tot: t.index, tekst: sql.slice(start, t.index) });
    open.delete(label);
  }
  return uit;
}

/**
 * Het blok waarin deze positie valt, of `null`.
 *
 * `vangt` is alleen waar bij een expliciete `insufficient_privilege`-handler:
 * `when others` slikt ook echte fouten en telt daarom niet.
 */
export function omhullendBlok(alle, positie) {
  const blok = alle.find((b) => positie > b.van && positie < b.tot);
  if (blok === undefined) return null;
  return {
    vangt: /exception[\s\S]*?when[\s\S]*?insufficient_privilege/i.test(blok.tekst),
    slikt: /exception[\s\S]*?when[\s\S]*?\bothers\b/i.test(blok.tekst),
  };
}

function regelnummer(sql, positie) {
  return sql.slice(0, positie).split('\n').length;
}

/** Alle bevindingen in één migratiebestand. */
export function bevindingenIn(ruw) {
  const sql = zonderCommentaar(ruw);
  const alle = blokken(sql);
  const uit = [];

  for (const m of [...sql.matchAll(INDEXACHTIG), ...sql.matchAll(CONSTRAINTACHTIG)]) {
    const plek = { regelnummer: regelnummer(sql, m.index), fragment: m[0].replace(/\s+/g, ' ') };
    const blok = omhullendBlok(alle, m.index);
    if (m[1] !== undefined && /concurrently/i.test(m[1])) uit.push({ ...plek, soort: 'concurrently' });
    else if (blok === null || (!blok.vangt && !blok.slikt)) uit.push({ ...plek, soort: 'kaal' });
    else if (!blok.vangt) uit.push({ ...plek, soort: 'others' });
  }

  for (const m of sql.matchAll(GRENDEL)) {
    const blok = omhullendBlok(alle, m.index);
    if (blok === null || !(blok.vangt || blok.slikt)) continue;
    uit.push({
      regelnummer: regelnummer(sql, m.index),
      fragment: m[0].replace(/\s+/g, ' ').slice(0, 70),
      soort: 'grendel-afgevangen',
    });
  }

  return uit;
}

export function bevindingen() {
  const uit = [];
  for (const naam of readdirSync(MIGRATIES).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIES, naam), 'utf8');
    for (const b of bevindingenIn(sql)) uit.push({ naam, ...b });
  }
  return uit;
}

const UITLEG = {
  kaal:
    'een index op een vreemde tabel die NIET wordt afgevangen — dit stopt de\n' +
    '    hele migratiereeks op productie met `42501: must be owner of table objects`,\n' +
    '    en lokaal merk je er niets van omdat we de tabel daar wél bezitten.',
  others:
    'afgevangen met `when others` — die slikt ook een ontbrekende kolom, een\n' +
    '    onbekende functie en een tikfout in de expressie. Dan is de migratie groen\n' +
    '    terwijl hij niets gedaan heeft. Vang `insufficient_privilege` met naam af.',
  concurrently:
    '`create index concurrently` kan niet in een blok (`25001`), dus hij is hier\n' +
    '    niet voorwaardelijk te maken. Deze index hoort buiten de migratie.',
  'grendel-afgevangen':
    'een policy of trigger die stil kan worden overgeslagen. Die gaan wél op\n' +
    '    productie, dus afvangen verbergt alleen een echte fout. Bij een trigger\n' +
    '    valt dat OPEN: een vervangen uploadgrendel die niet geplaatst wordt, laat\n' +
    '    de telling nergens meer aan hangen.',
};

function main() {
  const gevonden = bevindingen();

  if (gevonden.length === 0) {
    console.log('storage-eigendom-controle: elke index op storage.* wordt afgevangen, elke grendel niet.');
    process.exit(0);
  }

  console.error('storage-eigendom-controle: wat er op `storage.*` gebeurt, klopt niet.\n');
  for (const { naam, regelnummer: r, fragment, soort } of gevonden) {
    console.error(`  - supabase/migrations/${naam}:${r}  [${soort}]\n      ${fragment}\n    ${UITLEG[soort]}\n`);
  }
  console.error(
    'De vorm die wél klopt voor een index (zie 0222, 0228, 0233, 0250):\n' +
      '\n  do $$\n  begin\n    create index if not exists <naam> on storage.objects (…);\n' +
      '  exception when insufficient_privilege then\n' +
      "    raise notice '<naam> overgeslagen (42501) — geen eigenaar van storage.objects.';\n" +
      '  end $$;\n' +
      '\nEen policy of trigger blijft juist kaal: die gaan op productie gewoon.\n' +
      'Zie docs/decisions/2026-09-12-een-index-op-een-tabel-die-niet-van-ons-is.md.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
