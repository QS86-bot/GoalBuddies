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
 * ⚠️ **Wat hij níét ziet:** een herdefinitie waarvan de regels herschreven maar
 *    niet verdwenen zijn (een andere vorm met dezelfde betekenis is voor hem een
 *    verlies, dus daar markeer je), en een definitie die buiten deze drie soorten
 *    valt (view, trigger). Dat is de blinde vlek om te kennen.
 */

/** Alles vóór de eerste scheidslijn `;` op nul haakjes, zonder commentaar. */
export function zonderCommentaar(bron) {
  return (bron ?? '').replace(/--[^\n]*/g, '');
}

const spatie = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();

/** Genormaliseerde, niet-triviale regels van een stuk SQL. */
export function regelsVan(sql) {
  const triviaal = new Set(['', '$function$', '$$', 'begin', 'end', 'end;', ');', ')', '(', 'as', 'declare', ',']);
  return zonderCommentaar(sql)
    .replace(/\bpublic\./gi, '')
    .split('\n')
    .map(spatie)
    .filter((r) => !triviaal.has(r));
}

/** De tekstwaarden `'…'` in een stuk SQL. */
export function waardenVan(sql) {
  return [...zonderCommentaar(sql).matchAll(/'((?:[^']|'')*)'/g)].map((m) => `'${m[1].toLowerCase()}'`);
}

/** Het stuk vanaf `start` tot de sluitende haak of puntkomma op nul diepte. */
function totPuntkomma(bron, start) {
  let diepte = 0;
  let tag = null;
  for (let i = start; i < bron.length; i += 1) {
    const rest = bron.slice(i);
    if (tag === null) {
      const d = /^\$(\w*)\$/.exec(rest);
      if (d !== null) {
        tag = d[0];
        i += tag.length - 1;
        continue;
      }
      if (bron[i] === "'") {
        const einde = bron.indexOf("'", i + 1);
        if (einde === -1) return bron.slice(start);
        i = einde;
        continue;
      }
      if (bron[i] === '(') diepte += 1;
      if (bron[i] === ')') diepte -= 1;
      if (bron[i] === ';' && diepte <= 0) return bron.slice(start, i);
    } else if (rest.startsWith(tag)) {
      i += tag.length - 1;
      tag = null;
    }
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
  const schoon = zonderCommentaar(bron);
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
export function verliezenInRegels(migraties, minOverlap = 0) {
  const laatste = new Map();
  const uit = [];

  for (const { naam, bron } of migraties) {
    const bewust = bewustVallen(bron);
    for (const d of definitiesIn(bron)) {
      const k = `${d.soort} ${d.sleutel}`;
      const eerder = laatste.get(k);
      if (eerder !== undefined && behouden(eerder.items, d.items) >= minOverlap) {
        for (const item of eerder.items) {
          if (d.items.includes(item)) continue;
          if (bewust.some((b) => b !== '' && item.includes(b))) continue;
          uit.push({ migratie: naam, soort: d.soort, sleutel: d.sleutel, item, eerder: eerder.migratie });
        }
      }
      laatste.set(k, { migratie: naam, items: d.items });
    }
  }
  return uit;
}
