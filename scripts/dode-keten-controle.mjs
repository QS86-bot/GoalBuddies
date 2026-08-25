#!/usr/bin/env node
/**
 * dode-keten-controle — de variant van regel 18 die geen kapot onderdeel heeft.
 *
 * `docs/ENGINEER-REVIEW.md` heeft sinds 21-08-2026 een rij met de titel "Drie
 * backend-issues op rij bleken geen enkele aanroeper te hebben". Die rij is
 * sindsdien twee keer bijgewerkt en staat inmiddels op vijf gevallen: QS8-47,
 * QS8-112, EPIC 9, `goals.status = 'missed'` (0082) en `scope_reduced` /
 * `milestone_dropped` in `goal_events` (0087). De rij eindigt met een suggestie
 * voor de review — "dat is statisch af te leiden" — en dit is dat.
 *
 * ⚠️ **Twee controles, want de vijf gevallen zijn twee soorten.**
 *
 *   1. **Een functie of trigger die niemand aanroept.** Dat is de vorm van
 *      QS8-47 en QS8-112: een stuk backend dat af is, getest, en waar geen
 *      enkele knop naartoe loopt.
 *   2. **Een CHECK-waarde die niemand schrijft.** Dat is de vorm van 0082 en
 *      0087: de kolom mág de waarde aannemen, er is code die erop rekent, en
 *      er is geen pad dat hem ooit zet. Allebei die gevallen waren
 *      groepszichtbaar — een status die niemand kan bereiken, in een lijst waar
 *      de UI en de policies wél op vertrouwen.
 *
 * ⚠️ **Wat deze controle níét vindt, en dat hoort er expliciet bij te staan.**
 *    EPIC 9 was een trigger die netjes aan een tabel hing en dus een aanroeper
 *    hád; hij wachtte op een status die niets ooit zette. Dat is een dode keten
 *    op wáárde-niveau binnen een functie, en die is hier niet uit af te leiden.
 *    Controle 2 dekt de helft daarvan (de waarde in een CHECK), niet het geval
 *    waarin de waarde alleen in een `if` staat. De vraag uit onwrikbare regel 18
 *    blijft het gereedschap: *kan een gebruiker hier daadwerkelijk bij, en langs
 *    welke knop?*
 *
 * ⚠️ **Tests en scripts tellen niet als aanroeper, en dat is de kern.** Bij
 *    EPIC 9 stonden er tests omheen die het losse gedrag bewezen. Zou een test
 *    als bereikbaarheid tellen, dan was juist dát geval groen geweest. Wat telt
 *    is `src/`, `app/` en `supabase/functions/` — en binnen de database een
 *    trigger, een policy, een view, een default of een andere functie.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Waarden die bewust nog niet geschreven worden, met de reden en de voorwaarde
 * die ze weer interessant maakt.
 *
 * ⚠️ **Dit is een lijst met redenen en geen lijst met namen.** Wie hier iets aan
 *    toevoegt zonder de tweede helft in te vullen, heeft de controle uitgezet in
 *    plaats van beantwoord. Dezelfde vorm als `Wordt zwaarder als:` in
 *    `docs/ENGINEER-REVIEW.md`, en om dezelfde reden: een uitzondering die zijn
 *    houdbaarheidsdatum niet noemt, verloopt zonder dat iemand het merkt.
 *
 * @type {Record<string, string>}
 */
export const BEWUST_ONGESCHREVEN = {
  'groups.approval_rule=majority':
    'De peer-goedkeuring kent vandaag alleen `any`. `majority` is ontwerp uit ' +
    'PRD 0001 en de kolom wordt door niets gelezen — ook niet door `any`. ' +
    'Wordt een defect zodra iets de kolom gaat lézen: dan belooft een groep een ' +
    'regel die de goedkeuring niet uitvoert, en dat raakt domeinregel 3.',
  'groups.season_cadence=monthly':
    'Seizoenen zijn niet gebouwd; de kolom wordt door niets gelezen of ' +
    'geschreven. Wordt een defect zodra het seizoenoverzicht er is.',
  'chat_messages.type=photo':
    'Wacht op Storage-buckets, die er nog niet zijn. ⚠️ De waarde is vandaag ' +
    'wél door een client te schrijven — kolomrecht en policy staan open — dus ' +
    'een bericht kan `photo` heten met een gewone tekst erin. Wordt een defect ' +
    'zodra de chat op `type` gaat renderen.',
  'chat_messages.type=doc':
    'Idem als `photo`, en met dezelfde open schrijfkant.',
  'points_ledger.reason=goal_done':
    '⚠️ De enige van deze vijf die een besluit vraagt in plaats van een epic. ' +
    'Domeinregel 10 zegt dat het puntenplafond van een doel de som is van de ' +
    'plafondpunten van zijn weekdoelen — dan is een aparte boeking voor het ' +
    'afronden van het doel dubbeltelling, en hoort de waarde weg zoals ' +
    '`missed` in 0082. Maar `milestone_done` staat er wél en wórdt geboekt, ' +
    'dus zomaar schrappen zonder besluit zou het model veranderen. Staat als ' +
    'rij in docs/ENGINEER-REVIEW.md.',
};

/** Bestanden waarin een aanroep als "productie" telt. Tests en scripts niet. */
const PRODUCTIEMAPPEN = ['src', 'app', 'supabase/functions'];

function bronbestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    if (naam === 'node_modules' || naam === '.git') continue;
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) bronbestanden(pad, uit);
    else if (/\.(ts|tsx)$/.test(naam)) uit.push(pad);
  }
  return uit;
}

/**
 * Alle functienamen die een migratie definieert.
 *
 * ⚠️ `drop function ... ; create or replace function ...` is hier de normale
 *    vorm van een idempotente migratie — 71 van de 99 functies staan zo in het
 *    bestand. Een `drop` betekent dus niet dat de functie weg is.
 */
export function functiesIn(sql) {
  const namen = new Set();
  for (const m of sql.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi,
  )) {
    namen.add(m[1].toLowerCase());
  }
  return namen;
}

/**
 * De SQL zonder de koppen van de functiedefinities zelf, zodat een functie niet
 * zijn eigen aanroeper wordt.
 *
 * ⚠️ `public.` gaat er hier af. De eerste versie van deze controle miste acht
 *    functies omdat de aanroep `execute function public.noteer_commitment()`
 *    luidt en de negatieve lookbehind op `.` die wegfilterde. Alle acht waren
 *    vals alarm, en dat is precies het soort controle dat je leert negeren.
 */
export function zonderDefinities(sql) {
  return sql
    .replace(/\bpublic\./gi, '')
    .replace(/create\s+(?:or\s+replace\s+)?function\s+([a-z0-9_]+)\s*\(/gi, ' ')
    .replace(/drop\s+function\s+(?:if\s+exists\s+)?[a-z0-9_]+[^;]*;/gi, ' ');
}

/** De namen die `src/`, `app/` en `supabase/functions/` via `.rpc()` aanroepen. */
export function rpcAanroepenIn(bron) {
  const namen = new Set();
  for (const m of bron.matchAll(/\.rpc\(\s*['"`]([a-z0-9_]+)['"`]/gi)) {
    namen.add(m[1].toLowerCase());
  }
  return namen;
}

/** Functies zonder enige aanroeper — niet in de database, niet in productiecode. */
export function functiesZonderAanroeper({ sql, prodBron }) {
  const gedefinieerd = functiesIn(sql);
  const romp = zonderDefinities(sql);
  const rpc = rpcAanroepenIn(prodBron);

  const dood = [];
  for (const naam of gedefinieerd) {
    if (rpc.has(naam)) continue;
    if (new RegExp(`(?<![a-z0-9_])${naam}\\s*\\(`, 'i').test(romp)) continue;
    dood.push(naam);
  }
  return dood.sort();
}

/**
 * Het CHECK-landschap zoals de migraties het achterlaten.
 *
 * ⚠️ **In volgorde verwerken en `drop constraint` honoreren.** De verkenning
 *    vond `goals_risk_status_valid` als dode constraint, maar die bestaat al
 *    sinds 0050 niet meer — de risicokolommen zijn toen naar `goal_risk`
 *    verhuisd. Een controle die alleen naar het laatste `check (...)` kijkt,
 *    meldt constraints die er niet zijn, en dat is dezelfde valse-alarmklasse
 *    als hierboven.
 */
export function checksIn(bestanden) {
  const huidig = new Map();

  for (const { naam, sql } of bestanden) {
    for (const m of sql.matchAll(/drop\s+constraint\s+(?:if\s+exists\s+)?([a-z0-9_]+)/gi)) {
      huidig.delete(m[1].toLowerCase());
    }

    // ⚠️ Een kolom die weggaat, neemt zijn CHECK mee. 0050 verhuisde de
    //    risicokolommen naar `goal_risk` met `drop column` en liet
    //    `goals_risk_status_valid` daarmee verdwijnen zonder hem ooit bij naam
    //    te noemen. De eerste versie van deze controle meldde die constraint
    //    dus als dood terwijl hij al maanden niet meer bestond.
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:only\s+)?(?:public\.)?([a-z0-9_]+)[\s\S]*?drop\s+column\s+(?:if\s+exists\s+)?([a-z0-9_]+)/gi,
    )) {
      const [, tabel, kolom] = [m[0], m[1].toLowerCase(), m[2].toLowerCase()];
      for (const [cnaam, c] of huidig) {
        if (c.tabel === tabel && c.kolom === kolom) huidig.delete(cnaam);
      }
    }

    for (const m of sql.matchAll(/constraint\s+([a-z0-9_]+)\s+check\s*\(/gi)) {
      const body = haakjesBlok(sql, m.index + m[0].length - 1);
      if (body === null) continue;
      const kolom = /^\s*\(?\s*([a-z0-9_]+)/i.exec(body)?.[1]?.toLowerCase() ?? null;
      const waarden = [...new Set([...body.matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]))];
      if (waarden.length < 2) continue;
      huidig.set(m[1].toLowerCase(), {
        bestand: naam,
        tabel: tabelVoor(sql, m.index),
        kolom,
        waarden,
        body,
      });
    }
  }
  return huidig;
}

/**
 * De tabel waar de constraint op `positie` bij hoort: de dichtstbijzijnde
 * `create table` of `alter table` erboven.
 *
 * ⚠️ Niet uit de constraintnaam afleiden. `groups_approval_rule_valid` levert
 *    met elke denkbare afkapregel `groups_approval` op in plaats van `groups`,
 *    en dan zoekt de uitzonderingenlijst naar een sleutel die niemand ooit
 *    intikt.
 */
function tabelVoor(sql, positie) {
  const ervoor = sql.slice(0, positie);
  const treffers = [
    ...ervoor.matchAll(/(?:create|alter)\s+table\s+(?:if\s+not\s+exists\s+|only\s+)?(?:public\.)?([a-z0-9_]+)/gi),
  ];
  return treffers.length ? treffers[treffers.length - 1][1].toLowerCase() : null;
}

/** Het blok vanaf het openingshaakje op `start`, haakjes meetellend. */
function haakjesBlok(tekst, start) {
  let diepte = 0;
  for (let i = start; i < tekst.length; i++) {
    if (tekst[i] === '(') diepte++;
    else if (tekst[i] === ')') {
      diepte--;
      if (diepte === 0) return tekst.slice(start + 1, i);
    }
  }
  return null;
}

/** De SQL met alle CHECK-bodies eruit, zodat een waarde niet zijn eigen schrijver is. */
export function zonderChecks(sql) {
  let uit = '';
  let i = 0;
  const re = /check\s*\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const body = haakjesBlok(sql, m.index + m[0].length - 1);
    if (body === null) continue;
    uit += sql.slice(i, m.index);
    i = m.index + m[0].length + body.length + 1;
    re.lastIndex = i;
  }
  return uit + sql.slice(i);
}

/** CHECK-waarden die geen enkel pad ooit schrijft. */
export function waardenZonderSchrijver({ bestanden, prodBron }) {
  const checks = checksIn(bestanden);
  const romp = zonderChecks(bestanden.map((b) => b.sql).join('\n'));

  const dood = [];
  for (const [naam, c] of checks) {
    const tabel = c.tabel;
    for (const waarde of c.waarden) {
      if (new RegExp(`['"\`]${waarde}['"\`]`).test(prodBron)) continue;
      if (new RegExp(`'${waarde}'`).test(romp)) continue;
      dood.push({ constraint: naam, kolom: c.kolom, waarde, bestand: c.bestand, tabel });
    }
  }
  return dood;
}

/** De sleutel waaronder een dode waarde in `BEWUST_ONGESCHREVEN` staat. */
export function sleutelVan({ tabel, kolom, waarde }) {
  return `${tabel}.${kolom}=${waarde}`;
}

export function controleer({ bestanden, prodBron, bewust = BEWUST_ONGESCHREVEN }) {
  const sql = bestanden.map((b) => b.sql).join('\n');
  const functies = functiesZonderAanroeper({ sql, prodBron });
  const waarden = waardenZonderSchrijver({ bestanden, prodBron }).filter(
    (w) => !(sleutelVan(w) in bewust),
  );
  return { functies, waarden };
}

function hoofd() {
  const migMap = join(WORTEL, 'supabase/migrations');
  const bestanden = readdirSync(migMap)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((naam) => ({ naam, sql: readFileSync(join(migMap, naam), 'utf8') }));

  const prodBron = PRODUCTIEMAPPEN.flatMap((m) => bronbestanden(join(WORTEL, m)))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');

  const { functies, waarden } = controleer({ bestanden, prodBron });

  if (functies.length === 0 && waarden.length === 0) {
    const aantal = functiesIn(bestanden.map((b) => b.sql).join('\n')).size;
    console.log(
      `dode-keten-controle: ${aantal} functies hebben allemaal een aanroeper, en ` +
        `elke CHECK-waarde wordt ergens geschreven of staat met reden op de lijst.`,
    );
    return 0;
  }

  for (const naam of functies) {
    console.error(
      `✗ ${naam}() wordt door niets aangeroepen — niet via .rpc() uit src/, app/ of ` +
        `supabase/functions/, en niet door een trigger, policy, view of andere functie.`,
    );
  }
  for (const w of waarden) {
    console.error(
      `✗ ${w.tabel}.${w.kolom} mag '${w.waarde}' zijn (${w.constraint}, ${w.bestand}), ` +
        `maar niets schrijft die waarde ooit.`,
    );
  }
  console.error(
    '\nOfwel er ontbreekt een schrijfpad, ofwel de waarde hoort weg zoals in 0082 en ' +
      '0087. Is het bewust en tijdelijk: zet hem in BEWUST_ONGESCHREVEN mét de ' +
      'voorwaarde die hem weer interessant maakt.',
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(hoofd());
