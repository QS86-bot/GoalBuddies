/**
 * Een herdefinitie mag geen voorwaarde of blok laten vallen — QS8-766.
 *
 * ⚠️ **Dit is de tweede helft van `registerdrift:controle`.** De eerste (QS8-358)
 *    vergelijkt rijen van een register. Dezelfde botsing treft ook een voorwaarde
 *    in een functielichaam, een blok, een waarde in een CHECK en een policy:
 *    `create or replace` vervangt het geheel, en een migratie uit een oude tak
 *    herdefinieert dan op basis van een oudere stand. Git ziet geen conflict, want
 *    het zijn verschillende bestanden.
 *
 * ⚠️ **Wat hij vergelijkt:** per functie (naam én argumenten), per CHECK (naam) en
 *    per policy (naam + tabel) de vorige definitie — de hoogste migratie eronder —
 *    met de nieuwe. Een regel (functie, policy) of een tekstwaarde (CHECK) die
 *    verdwijnt wordt gemeld, tenzij de kop van de migratie hem noemt:
 *
 *      -- laat bewust vallen: <de regel of waarde zoals hij er stond>
 *
 * ⚠️⚠️ **Twee afbakeningen, besloten door Quinten op 20-11-2026, en beide zijn een
 *    blinde vlek die je moet kennen:**
 *
 *    1. **Alleen migraties vanaf `GRENS` (0328) worden beoordeeld.** 📏 Gemeten op
 *       0327: een regelvergelijking van elke herdefinitie met de vorige geeft
 *       **1389** meldingen over 0001-0327, en ook bij 85% overlap nog 400. Een
 *       volledige herschrijving is hier de norm. Wat eronder zit is niet
 *       goedgekeurd maar vrijgesteld; de vorige definitie komt wél uit de héle
 *       map, want de oude tak herdefinieert op basis van een oudere stand.
 *    2. **Een herdefinitie telt pas als `MIN_OVERLAP` (70%) van de vorige regels
 *       terugkomt.** Dat is het beeld van een kopie van een oude stand met een
 *       gat. Een bijna volledige herschrijving valt erbuiten: een verdwenen
 *       voorwaarde in een functie die voor 60% opnieuw geschreven is, ziet deze
 *       controle niet.
 *
 *    Ook buiten die twee: een definitie die buiten functie, CHECK en policy valt
 *    (view, trigger) ziet hij niet, en een herschrijving met dezelfde betekenis in
 *    een andere vorm is voor hem een verlies — daar markeer je.
 */

import { zonderCommentaarSql } from './zonder-sql-commentaar.mjs';

/** De eerste migratie die deze controle beoordeelt. Zie de kop. */
export const GRENS = '0328';

/** Het deel van de vorige regels dat moet terugkomen om te mogen oordelen. */
export const MIN_OVERLAP = 0.7;

const spatie = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();

/** Genormaliseerde, niet-triviale regels van een stuk SQL. */
export function regelsVan(sql) {
  const triviaal = new Set(['', 'begin', 'end', 'end;', ');', ')', '(', 'as', 'declare', ',']);
  return zonderCommentaarSql(sql)
    .replace(/\bpublic\./gi, '')
    .split('\n')
    .map(spatie)
    // ⚠️ `as $$` en `$function$;` zeggen niets over wat de functie doet.
    .filter((r) => !triviaal.has(r) && !/^(as )?\$\w*\$;?$/.test(r));
}

/** De tekstwaarden `'…'` in een stuk SQL. */
export function waardenVan(sql) {
  return [...zonderCommentaarSql(sql).matchAll(/'((?:[^']|'')*)'/g)].map((m) => `'${m[1].toLowerCase()}'`);
}

/** Spring over een `'…'` of `$tag$…$tag$` op positie `i`; geeft de nieuwe positie, of `i`. */
function springOver(bron, i) {
  const dollar = /^\$(\w*)\$/.exec(bron.slice(i, i + 40));
  if (dollar !== null) {
    const einde = bron.indexOf(dollar[0], i + dollar[0].length);
    return einde === -1 ? bron.length : einde + dollar[0].length - 1;
  }
  if (bron[i] !== "'") return i;
  const einde = bron.indexOf("'", i + 1);
  return einde === -1 ? bron.length : einde;
}

/** Het stuk vanaf `start` tot de puntkomma op haakjesdiepte nul, buiten tekst en `$$`-lichamen. */
function totPuntkomma(bron, start) {
  let diepte = 0;
  for (let i = start; i < bron.length; i += 1) {
    i = springOver(bron, i);
    if (bron[i] === '(') diepte += 1;
    if (bron[i] === ')') diepte -= 1;
    if (bron[i] === ';' && diepte <= 0) return bron.slice(start, i);
  }
  return bron.slice(start);
}

/** De haakjes na `check` tot hun sluiting. */
function checkTekst(bron, start) {
  const open = bron.indexOf('(', start);
  if (open === -1) return '';
  let diepte = 0;
  for (let i = open; i < bron.length; i += 1) {
    if (bron[i] === '(') diepte += 1;
    if (bron[i] === ')') {
      diepte -= 1;
      if (diepte === 0) return bron.slice(open + 1, i);
    }
  }
  return bron.slice(open + 1);
}

/**
 * Alle definities van de drie soorten in één migratie.
 * `{ soort, sleutel, items }` — `items` zijn regels (functie, policy) of
 * tekstwaarden (CHECK).
 */
export function definitiesIn(bron) {
  const schoon = zonderCommentaarSql(bron);
  const uit = [];

  for (const m of schoon.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(([^)]*)\)/gi)) {
    const sleutel = `${m[1]}(${spatie(m[2])})`;
    // ⚠️ Vanaf ná de argumenten: de kop zegt hoe de functie heet, niet wat hij doet,
    //    en de sleutel draagt de naam al.
    const na = m.index + m[0].length;
    uit.push({ soort: 'functie', sleutel, items: regelsVan(totPuntkomma(schoon, na)) });
  }

  for (const m of schoon.matchAll(/create\s+policy\s+"?(\w+)"?\s+on\s+(?:public\.)?(\w+)/gi)) {
    uit.push({
      soort: 'policy',
      sleutel: `${m[1]} on ${m[2]}`,
      items: regelsVan(totPuntkomma(schoon, m.index)),
    });
  }

  for (const m of schoon.matchAll(/add\s+constraint\s+(\w+)\s+check\s*(?=\()/gi)) {
    const tekst = checkTekst(schoon, m.index + m[0].length);
    uit.push({ soort: 'check', sleutel: m[1], items: [...new Set([...waardenVan(tekst), ...regelsVan(tekst).filter((r) => !r.includes("'"))])] });
  }

  return uit;
}

/** De bewuste verliezen uit de kop: `-- laat bewust vallen: …`. */
export function bewustVallen(bron) {
  const uit = [];
  for (const regel of (bron ?? '').split('\n')) {
    if (regel.trim() === '') continue;
    if (!regel.trimStart().startsWith('--')) break;
    const m = /laat bewust vallen:\s*(.+)$/i.exec(regel);
    if (m !== null) uit.push(spatie(m[1]));
  }
  return uit;
}

/** Het deel van `eerder` dat in `nu` terugkomt, 0..1. */
export function behouden(eerder, nu) {
  if (eerder.length === 0) return 1;
  const set = new Set(nu);
  return eerder.filter((i) => set.has(i)).length / eerder.length;
}

/**
 * Wat een latere definitie laat vallen. `migraties` is `{ naam, bron }` op volgorde.
 * Een verlies is aanvaard als een markering in de kop van die migratie het item
 * als deelstring bevat.
 */
export function verliezenInRegels(migraties, { grens = GRENS, minOverlap = MIN_OVERLAP } = {}) {
  const laatste = new Map();
  const uit = [];

  for (const { naam, bron } of migraties) {
    const bewust = bewustVallen(bron);
    for (const d of definitiesIn(bron)) {
      const k = `${d.soort} ${d.sleutel}`;
      const eerder = laatste.get(k);
      if (naam.slice(0, 4) >= grens && eerder !== undefined) {
        uit.push(...verlies(naam, d, eerder, bewust, minOverlap));
      }
      laatste.set(k, { migratie: naam, items: d.items });
    }
  }
  return uit;
}

/** De regels uit `eerder` die `nu` mist, als `nu` genoeg op `eerder` lijkt en de kop ze niet noemt. */
function verlies(naam, nu, eerder, bewust, minOverlap) {
  if (behouden(eerder.items, nu.items) < minOverlap) return [];

  return eerder.items
    .filter((item) => !nu.items.includes(item))
    .filter((item) => !bewust.some((b) => b !== '' && item.includes(b)))
    .map((item) => ({
      migratie: naam,
      soort: nu.soort,
      sleutel: nu.sleutel,
      item,
      eerder: eerder.migratie,
    }));
}
