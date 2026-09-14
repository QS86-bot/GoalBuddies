#!/usr/bin/env node
/**
 * sleutelvorm-controle — `null = <waarde>` is `null` en niet `false`, en aan de
 * weiger-kant van een `if` betekent dat "niet geweigerd".
 *
 * ⚠️⚠️ **De veilige en de onveilige vorm zien er identiek uit.** Alleen de kant
 *    van de `if` bepaalt welke het is:
 *
 *      if <sleutel> = old.x then return new; end if;   -- toelaten: veilig
 *      if <sleutel> = old.x then raise ...; end if;    -- weigeren: een gat
 *
 *    Dat is één keer misgegaan, in de eerste versie van 0199: de promotie, de
 *    degradatie en het terugzetten van een lidmaatschap bleven gewoon landen,
 *    omdat het patroon van `join_group_with_code()` drie regels hoger gekopieerd
 *    was — dáár stond het aan de toelaat-kant.
 *
 * ⚠️ **Deze controle eist de vórm en bepaalt de kant niet.** De kant vraagt de
 *    `if` uitparsen; de vorm eisen is scherper én eenvoudiger, en kost niets,
 *    want 📏 alle zeven bestaande vergelijkingen halen hem al (14-09-2026). Een
 *    nullveilige vergelijking is aan béíde kanten goed, dus de strengere eis
 *    sluit niets uit wat iemand zou willen schrijven.
 *
 * ## Wat "nullveilig" hier betekent
 *
 *   - `is distinct from` / `is not distinct from` — de operator kan zelf geen
 *     `null` opleveren; of
 *   - de hele vergelijking staat in een `coalesce(…, false)`.
 *
 * ⚠️⚠️ **Die `coalesce(` staat vóór de `current_setting` en niet erna**, en dat
 *    is de valkuil waar de eerste meting in QS8-491 zelf in liep: een venster dat
 *    140 tekens **vooruit** keek meldde de drie gerepareerde plekken in
 *    `guard_group_member_update()` als defect. Een controle die de reparatie als
 *    fout meldt, leer je uitzetten. Vandaar dat dit script de omhullende
 *    aanroepen echt uitloopt in plaats van naar een venster te kijken.
 *
 * ⚠️ **Hij leest `pg_get_functiondef()` en niet de migratiebestanden.** Dat is
 *    in QS8-485 misgegaan: een grendel gemodelleerd op een migratiebestand dat
 *    een latere migratie allang vervangen had. CLAUDE.md bij regel 19:
 *    `pg_get_functiondef()` is de waarheid.
 *
 * ⚠️ **Hij faalt dicht.** Een leesplek die in geen van de klassen past, wordt
 *    gemeld — niet stil overgeslagen. Zelfde keuze als `sleutelzetters()`, en om
 *    dezelfde reden: een onbekende vorm is precies waar de volgende fout in zit.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { psqlArgumenten, verbindingsmelding } from './psql.mjs';

/**
 * Scheidt de naam van het lichaam, en de functies onderling.
 *
 * ⚠️ Als escape geschreven en niet als het teken zelf: een kaal stuurteken in
 *    de bron is onzichtbaar in een diff en overleeft niet elke kopieerslag.
 */
const VELD = '\u0001';
const RIJ = '\u0002';

/**
 * Functies waarvan de `app.`-leesplekken numeriek zijn en dus buiten deze klasse
 * vallen, met de reden per rij.
 *
 * ⚠️⚠️ **Een rij hier zet de functie niet uit — hij legt een bewéring vast.**
 *    De controle toetst per leesplek of die bewering klopt: leest een functie
 *    hieronder alsnog een sleutel op een andere manier, dan wordt díé plek
 *    gewoon gemeld. Een register op naam dat de hele functie stilzet, zou
 *    precies de tweede leesplek missen die er ooit bijkomt — en dat is de vorm
 *    waar dit project al vaker op is vastgelopen.
 *
 * 📏 Alle zeventien lezen `coalesce(nullif(current_setting(…), ''), '0')::integer`
 *    en vergelijken numeriek. Een `coalesce` met een niet-lege terugval kán geen
 *    `null` opleveren, dus de klasse is hier niet van toepassing — niet
 *    "afgesproken weg", maar aantoonbaar afwezig.
 *
 * @type {Record<string, string>}
 */
export const NUMERIEKE_LEZERS = Object.fromEntries(
  [
    'rem_berichten',
    'rem_commitments',
    'rem_dagafvinkingen',
    'rem_dagzetten',
    'rem_doelen',
    'rem_doelgebeurtenissen',
    'rem_doelinterviews',
    'rem_doelkoppelingen',
    'rem_goedkeuringen',
    'rem_groepsgebeurtenissen',
    'rem_mijlpalen',
    'rem_pushtokens',
    'rem_taken',
    'rem_voltooiingen',
    'rem_weekdoelen',
    'rem_weekplanstappen',
    'rem_weekreacties',
  ].map((naam) => [
    naam,
    "Leest de dagteller numeriek: `coalesce(nullif(…, ''), '0')::integer`. " +
      'Een coalesce met een niet-lege terugval kan geen null opleveren.',
  ]),
);

const VRAAG = `
select coalesce(string_agg(p.proname || E'\\x01' || pg_get_functiondef(p.oid),
                           E'\\x02' order by p.proname), '')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind in ('f', 'p')
  and pg_get_functiondef(p.oid) ~ 'current_setting\\(\\s*''app\\.';
`;

/**
 * Haalt SQL-commentaar weg zodat een uitgecommentarieerde vorm niet meetelt.
 *
 * ⚠️ **Dit is SQL en niet JS**, dus niet de gedeelde knip uit
 *    `scripts/zonder-commentaar.mjs`: die filtert regels die met `//` beginnen.
 *    De rij staat met die reden in `MET_REDEN` van `scripts/knip-controle.mjs`,
 *    naast de vier andere SQL-knippen.
 *
 * ⚠️⚠️ **Hij loopt teken voor teken om quotes heen, en dat is gemeten en geen
 *    voorzorg.** 📏 De eerste versie hier knipte met één regex op `--`, en
 *    op `v_x := 'a--b' || nullif(current_setting('app.k', true), '') = old.id::text;`
 *    hield die `v_x := 'a` over: **nul** leesplekken waar er één hoort, dus een
 *    kale vergelijking die stil doorglipt. Dat is de richting die telt — een
 *    knip die te veel wegneemt houdt de controle groen terwijl de belofte breekt.
 *
 * ⚠️ **En de toets die dat had moeten vangen deed het niet.** Die zette de `--`
 *    en de leesplek op verschillende régels, en dan valt de vorm binnen de knip
 *    zijn eigen regelgrens — groen om een reden die niets met de belofte te
 *    maken heeft. Precies de val die CLAUDE.md bij regel 18 noemt: een ijking
 *    die zijn geval langs een andere grendel voert, bewaakt niets.
 *
 * Zelfde vorm als `zonderCommentaar()` in `scripts/klokgrens-controle.mjs`.
 */
export function zonderCommentaar(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map(regelZonderCommentaar)
    .join('\n');
}

/** Knipt op de eerste `--` die buiten een tekstliteral staat. */
function regelZonderCommentaar(regel) {
  let inTekst = false;

  for (let i = 0; i < regel.length; i += 1) {
    if (regel[i] === "'") {
      if (inTekst && regel[i + 1] === "'") {
        i += 1;
        continue;
      }
      inTekst = !inTekst;
      continue;
    }
    if (!inTekst && regel[i] === '-' && regel[i + 1] === '-') return regel.slice(0, i);
  }

  return regel;
}

/** De index van de `)` die hoort bij de `(` op `open`. */
function sluit(src, open) {
  let diepte = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === "'") {
      i = src.indexOf("'", i + 1);
      if (i === -1) return -1;
      continue;
    }
    if (c === '(') diepte += 1;
    else if (c === ')') {
      diepte -= 1;
      if (diepte === 0) return i;
    }
  }
  return -1;
}

/**
 * De aanroep die de uitdrukking op [start, eind] direct omsluit.
 *
 * ⚠️ Dit is de helft die vooruitkijken mist: `coalesce(` staat links van de
 *    `current_setting` die hij veilig maakt.
 */
function omhullende(src, start, eind) {
  let i = start - 1;
  while (i >= 0 && /\s/.test(src[i])) i -= 1;
  if (src[i] !== '(') return null;
  const open = i;
  i -= 1;
  while (i >= 0 && /\s/.test(src[i])) i -= 1;
  const naamEind = i;
  while (i >= 0 && /[A-Za-z0-9_]/.test(src[i])) i -= 1;
  if (i === naamEind) return null;
  const dicht = sluit(src, open);
  if (dicht === -1 || dicht < eind) return null;
  return { naam: src.slice(i + 1, naamEind + 1).toLowerCase(), open, dicht };
}

const OPERATOREN = [
  { re: /^\s*is\s+not\s+distinct\s+from\b/i, soort: 'nullveilig' },
  { re: /^\s*is\s+distinct\s+from\b/i, soort: 'nullveilig' },
  { re: /^\s*(?:<>|!=|=)(?!=)/, soort: 'kaal' },
];

/** Het eind van de vergelijking: tot de komma of de sluithaak op dit niveau. */
function vergelijkingEind(src, eind) {
  let diepte = 0;
  for (let i = eind + 1; i < src.length; i += 1) {
    const c = src[i];
    if (c === "'") {
      i = src.indexOf("'", i + 1);
      if (i === -1) return src.length - 1;
      continue;
    }
    if (c === '(') diepte += 1;
    else if (c === ')') {
      if (diepte === 0) return i - 1;
      diepte -= 1;
    } else if (c === ',' && diepte === 0) return i - 1;
  }
  return src.length - 1;
}

/** Een `coalesce(<dit>, false)` om de vergelijking heen maakt hem alsnog veilig. */
function coalesceMetFalse(src, start, eind) {
  const om = omhullende(src, start, eind);
  if (!om || om.naam !== 'coalesce') return false;
  return /^\s*,\s*false\s*\)$/i.test(src.slice(eind + 1, om.dicht + 1));
}

/** Een `coalesce(<dit>, '<iets>')` met niet-lege terugval kan geen null geven. */
function coalesceMetLiteral(src, start, eind) {
  const om = omhullende(src, start, eind);
  if (!om || om.naam !== 'coalesce') return false;
  return /^\s*,\s*'[^']+'\s*\)$/.test(src.slice(eind + 1, om.dicht + 1));
}

/** `nullif(...)` eromheen maakt niets veilig — het máákt juist de null. */
function doorNullifHeen(src, start, eind) {
  let huidig = { start, eind };
  for (;;) {
    const om = omhullende(src, huidig.start, huidig.eind);
    if (!om || om.naam !== 'nullif') return huidig;
    huidig = { start: om.open - om.naam.length, eind: om.dicht };
  }
}

/**
 * Deelt elke `current_setting('app.…')` in een functielichaam in.
 *
 * ⚠️ Geëxporteerd omdat dit de grendel ís: `tests/scripts/sleutelvorm-controle.test.ts`
 *    biedt hem élke vorm los aan — de vormen die hij moet vinden én de zeven die
 *    hij met rust moet laten.
 */
export function leesplekken(bron) {
  const src = zonderCommentaar(bron);
  const plekken = [];
  const re = /current_setting\(\s*'(app\.[A-Za-z0-9_]+)'/g;

  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const open = src.indexOf('(', m.index);
    const dicht = sluit(src, open);
    if (dicht === -1) continue;

    const { start, eind } = doorNullifHeen(src, m.index, dicht);
    const staart = src.slice(eind + 1);
    const op = OPERATOREN.find((o) => o.re.test(staart));

    if (op && op.soort === 'nullveilig') {
      plekken.push({
        sleutel: m[1],
        klasse: 'vergelijking',
        veilig: true,
        vorm: 'is [not] distinct from',
      });
    } else if (op) {
      const veilig = coalesceMetFalse(src, start, vergelijkingEind(src, eind));
      plekken.push({
        sleutel: m[1],
        klasse: 'vergelijking',
        veilig,
        vorm: veilig ? 'coalesce(…, false)' : 'kale vergelijking',
      });
    } else if (coalesceMetLiteral(src, start, eind)) {
      plekken.push({ sleutel: m[1], klasse: 'numeriek', veilig: true, vorm: "coalesce(…, '0')" });
    } else {
      plekken.push({ sleutel: m[1], klasse: 'onbekend', veilig: false, vorm: kort(staart) });
    }
  }

  return plekken;
}

function kort(staart) {
  return staart.trim().replace(/\s+/g, ' ').slice(0, 40);
}

/** Leest wat de vraag hierboven teruggeeft: naam, lichaam, per functie. */
export function ontleed(uitvoer) {
  return String(uitvoer)
    .split(RIJ)
    .map((blok) => blok.trim())
    .filter((blok) => blok !== '')
    .map((blok) => {
      const scheiding = blok.indexOf(VELD);
      return {
        naam: blok.slice(0, scheiding),
        plekken: leesplekken(blok.slice(scheiding + 1)),
      };
    });
}

/**
 * Wat er mis is, en wat er in het register verlopen is.
 *
 * ⚠️ **Twee kanten, zoals elke ratel hier.** Een kale vergelijking is een gat.
 *    Een registerrij die naar een functie wijst die geen numerieke leesplek meer
 *    heeft, is een reden voor iets dat er niet meer is — die dekt ooit stilletjes
 *    een nieuwe functie met dezelfde naam.
 */
export function beoordeel(functies, register = NUMERIEKE_LEZERS) {
  const plekken = functies.flatMap((f) => f.plekken.map((p) => ({ ...p, functie: f.naam })));

  const numeriek = new Set(
    plekken.filter((p) => p.klasse === 'numeriek' && p.functie in register).map((p) => p.functie),
  );

  return {
    defect: plekken.map((p) => ({ ...p, reden: gebrek(p, register) })).filter((p) => p.reden !== null),
    verdwenen: Object.keys(register)
      .filter((n) => !numeriek.has(n))
      .sort(),
    plekken: plekken.length,
    sleutels: new Set(plekken.map((p) => p.sleutel)).size,
  };
}

/**
 * Wat er mis is met één leesplek, of `null` als er niets mis is.
 *
 * ⚠️ Apart van `beoordeel()` omdat de twee lussen erboven anders vier diep
 *    nesten (onwrikbare regel 15), maar ook omdat dit de enige plek is waar
 *    staat wát er precies fout is aan een vorm.
 */
function gebrek(p, register) {
  if (p.klasse === 'numeriek') {
    return p.functie in register ? null : 'numerieke leesplek zonder registerrij';
  }
  if (p.veilig) return null;
  return p.klasse === 'onbekend'
    ? 'onbekende vorm — deze controle faalt dicht'
    : 'vergelijking zonder coalesce(…, false) en zonder `is distinct from`';
}

function psql(vraag) {
  return execFileSync('psql', psqlArgumenten(vraag), { encoding: 'utf8' });
}

function meldDefect(defect) {
  console.error(`✗ ${defect.length} leesplek(ken) van een \`app.\`-sleutel zijn niet nullveilig:\n`);
  for (const d of defect) {
    console.error(`    ${d.functie}()  ${d.sleutel}\n        ${d.reden}  [${d.vorm}]`);
  }
  console.error(
    '\n`null = <waarde>` is `null` en niet `false`. Aan de weiger-kant van een `if`\n' +
      'betekent dat "niet geweigerd", en dan landt de wijziging die je tegenhield.\n' +
      'De veilige en de onveilige vorm zien er identiek uit; alleen de kant van de\n' +
      '`if` verschilt, en die staat soms drie regels verderop.\n\n' +
      'Twee vormen die wél nullveilig zijn:\n\n' +
      "  nullif(current_setting('app.x', true), '') is distinct from old.y::text\n" +
      "  coalesce(nullif(current_setting('app.x', true), '') = old.y::text, false)\n\n" +
      'Meting en mechanisme: QS8-491, de eerste versie van 0199.',
  );
}

function meldVerdwenen(verdwenen) {
  console.error(
    `\n✗ ${verdwenen.length} registerrij(en) in NUMERIEKE_LEZERS wijzen naar een functie\n` +
      'zonder numerieke leesplek:\n',
  );
  for (const n of verdwenen) console.error(`    ${n}()`);
  console.error(
    '\nEen reden voor iets dat er niet meer is, dekt ooit stilletjes een nieuwe\n' +
      'functie met dezelfde naam. Haal de rij weg.',
  );
}

function hoofd() {
  let functies;
  try {
    functies = ontleed(psql(VRAAG));
  } catch (fout) {
    console.error(
      verbindingsmelding({
        naam: 'sleutelvorm-controle',
        leest: 'Deze controle leest `pg_get_functiondef()` en niet de migratiebestanden.',
        melding: fout instanceof Error ? fout.message : String(fout),
      }),
    );
    return 1;
  }

  const uitslag = beoordeel(functies);
  if (uitslag.defect.length > 0) meldDefect(uitslag.defect);
  if (uitslag.verdwenen.length > 0) meldVerdwenen(uitslag.verdwenen);
  if (uitslag.defect.length > 0 || uitslag.verdwenen.length > 0) return 1;

  const vergelijkingen = functies.reduce(
    (n, f) => n + f.plekken.filter((p) => p.klasse === 'vergelijking').length,
    0,
  );
  console.log(
    `sleutelvorm-controle: ${uitslag.plekken} leesplekken van ${uitslag.sleutels} ` +
      `\`app.\`-sleutels in ${functies.length} functies; alle ${vergelijkingen} ` +
      `vergelijkingen nullveilig, ${uitslag.plekken - vergelijkingen} numeriek met een reden.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
