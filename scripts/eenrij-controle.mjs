#!/usr/bin/env node
/**
 * eenrij-controle — elke `.single()` en `.maybeSingle()` draagt een garantie dat
 * er hoogstens één rij terug kan komen.
 *
 * ⚠️⚠️ **Waarom dit bestaat, met de meting erbij.** 📏 Op 24-09-2026 geteld over
 *    `src/` en `app/`: **36** aanroepen van `.single()` of `.maybeSingle()`, en
 *    alle zesendertig droegen een echte garantie. Ze waren correct omdat
 *    zesendertig schrijvers opgelet hebben; er was niets dat rood werd als de
 *    zevenendertigste die aanname liet vallen. Dat is de vorm die dit project
 *    als schuld telt — een regel die alleen op papier staat, met instanties die
 *    hem toevallig aanhouden. Onwrikbare regel 18, vraag 6.
 *
 * ⚠️ **En het faalgedrag is het slechtst denkbare.** PostgREST geeft bij twee
 *    rijen op `.maybeSingle()` een fout. Die verschijnt dus niet bij het
 *    schrijven maar op het moment dat er voor het eerst een tweede rij bestaat:
 *    in productie, bij de gebruiker met de meeste data. Een test met één rij is
 *    groen.
 *
 * ⚠️⚠️ **De partiële index is het scherpst, en daar kan deze controle te soepel
 *    worden.** `completions_active_uniq` is uniek op `weekly_goal_id` **waar**
 *    `superseded_by is null`. Leest een controle alleen de kolommen en niet het
 *    predicaat, dan keurt hij een aanroep zónder `.is('superseded_by', null)`
 *    goed — en dat is precies de aanroep die vandaag écht mis kan gaan. Het
 *    predicaat telt hier daarom mee.
 *
 * ⚠️ **Wat hij niet kan lezen, meldt hij — hij slaat het niet over.** Een keten
 *    zonder leesbare `.from(...)` komt eruit als `onleesbaar` en maakt de
 *    controle rood. Ongemeten is niet groen; dat is de les van QS8-268 en
 *    QS8-270, en die geldt bínnen een controle net zo goed als ertussen.
 *
 * ⚠️ **Geen regelnummers, en dat is een keuze en geen omissie.** De gedeelde
 *    knip `zonderCommentaar()` laat `//`-regels vallen en plet een blokcommentaar
 *    tot één spatie, dus posities ná die knip komen niet overeen met het bestand.
 *    Een tweede, positiebewarende knip schrijven is precies wat QS8-412 en
 *    QS8-414 duur betaald hebben. Er komt daarom een **fragment** uit dat je
 *    letterlijk kunt zoeken; dat kan niet verkeerd wijzen.
 *
 * Draaien: `npm run eenrij:controle`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { zonderCommentaar } from './zonder-commentaar.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const BRONMAPPEN = ['src', 'app'];
const MIGRATIEMAP = 'supabase/migrations';

/**
 * Aanroepen die met reden geen garantie hoeven, met de reden erbij.
 *
 * ⚠️⚠️ **Dit register begint leeg, en dat is de belofte van QS8-605.** 📏 Alle
 *    zesendertig aanroepen die er op de dag van invoeren stonden, waren gedekt
 *    door een structurele garantie. Een register dat op dag één vol staat is een
 *    inventaris, en die leer je overslaan — dezelfde afweging als bij QS8-591 en
 *    QS8-594. Komt er ooit een rij bij, dan draagt die een gemeten reden en geen
 *    "kan hier niet".
 */
export const ZONDER_GARANTIE = [];

// ---------------------------------------------------------------------------
// 1. De ketens in de bron
// ---------------------------------------------------------------------------

/**
 * De statements van een bronbestand, gesplitst op `;` buiten haakjes en strings.
 *
 * ⚠️ **Een tekenlimiet was hier de verkeerde grens.** De eerste versie knipte de
 *    keten af op 700 tekens; 📏 zes aanroepen vielen daardoor buiten beeld,
 *    allemaal met een lange `.select(...)`-kolomlijst erin — en juist die zes
 *    waren correcte inserts. Een grens op lengte meet de lengte van een
 *    kolomlijst en niet de vraag.
 */
export function statementsIn(bron) {
  const uit = [];
  let begin = 0;
  let diepte = 0;
  let aanhaling = null;

  for (let i = 0; i < bron.length; i += 1) {
    const teken = bron[i];

    if (aanhaling !== null) {
      if (teken === '\\') i += 1;
      else if (teken === aanhaling) aanhaling = null;
      continue;
    }

    if (teken === "'" || teken === '"' || teken === '`') aanhaling = teken;
    // ⚠️ **Accolades tellen hier niet mee, en dat was de eerste fout.** Met `{`
    //    en `}` erbij is een heel functielichaam één statement, want elke `;`
    //    erin staat op diepte 1. 📏 Gevolg: 19 ketens gevonden in plaats van 36,
    //    want per statement wordt alleen de eerste afsluiter gelezen. Een `;`
    //    die wél binnen haakjes staat — `for (;;)` — blijft gedekt.
    else if (teken === '(' || teken === '[') diepte += 1;
    else if (teken === ')' || teken === ']') diepte -= 1;
    else if (teken === ';' && diepte <= 0) {
      uit.push(bron.slice(begin, i));
      begin = i + 1;
    }
  }

  uit.push(bron.slice(begin));
  return uit;
}

const AFSLUITER = /\.(maybeSingle|single)\(\)/;
const TABEL = /\.from\(\s*['"]([\w.]+)['"]\s*\)/;
const EQ = /\.eq\(\s*['"](\w+)['"]\s*,\s*([^)]*)\)/g;
const IS_NULL = /\.is\(\s*['"](\w+)['"]\s*,\s*null\s*\)/g;
const SCHRIJFT = /\.insert\(/;
const LIMIET1 = /\.limit\(\s*1\s*\)/;

/** Een aanknopingspunt dat je letterlijk kunt zoeken, in plaats van een regelnummer. */
function fragment(statement) {
  return statement.trim().replace(/\s+/g, ' ').slice(0, 70);
}

/**
 * Elke keten die op `.single()` of `.maybeSingle()` eindigt.
 *
 * ⚠️ Commentaar gaat er eerst uit met de gedeelde knip. Een `.eq('id', …)` in een
 *    voorbeeld boven de functie is geen filter, en een `.single()` in een
 *    uitlegregel is geen aanroep — precies de fout die de ijking van QS8-594 vond
 *    en het schrijven niet.
 */
export function ketensIn(bron) {
  const uit = [];

  for (const statement of statementsIn(zonderCommentaar(bron))) {
    const afsluiter = AFSLUITER.exec(statement);
    if (afsluiter === null) continue;

    const tabel = TABEL.exec(statement);
    if (tabel === null) {
      uit.push({ soort: afsluiter[1], tabel: null, onleesbaar: true, fragment: fragment(statement) });
      continue;
    }

    uit.push({
      soort: afsluiter[1],
      tabel: tabel[1].replace(/^public\./, ''),
      onleesbaar: false,
      schrijft: SCHRIJFT.test(statement),
      heeftLimiet1: LIMIET1.test(statement),
      eq: [...statement.matchAll(EQ)].map((m) => ({ kolom: m[1], waarde: m[2].trim() })),
      isNull: [...statement.matchAll(IS_NULL)].map((m) => m[1]),
      fragment: fragment(statement),
    });
  }

  return uit;
}

// ---------------------------------------------------------------------------
// 2. De garanties in het schema
// ---------------------------------------------------------------------------

const CREATE_TABLE_KOP = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi;

/**
 * De lichamen van elke `create table`, met haakjes geteld in plaats van geraden.
 *
 * ⚠️⚠️ **Hier stond een regex die `\n\s*\);` eiste, en dat is een brosheid met
 *    een geruststellend uiterlijk.** Een tabel die op één regel staat werd er
 *    niet door gelezen, en dan bestaat zijn sleutel voor deze controle niet meer.
 *    📏 Gevonden in de ijking: de fixture in de toets schreef de tabel op één
 *    regel en de view erfde niets. De vorm faalt dicht — een ongelezen tabel
 *    maakt zijn aanroepen tot bevinding — maar "faalt dicht" is geen reden om
 *    hem verkeerd te lezen.
 */
export function tabelLichamen(sql) {
  const uit = [];

  for (const kop of sql.matchAll(CREATE_TABLE_KOP)) {
    let diepte = 1;
    let i = kop.index + kop[0].length;
    for (; i < sql.length && diepte > 0; i += 1) {
      if (sql[i] === '(') diepte += 1;
      else if (sql[i] === ')') diepte -= 1;
    }
    if (diepte === 0) uit.push({ tabel: kop[1], lichaam: sql.slice(kop.index + kop[0].length, i - 1) });
  }

  return uit;
}
const UNIEKE_INDEX =
  /create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?\w+\s+on\s+(?:public\.)?(\w+)\s*\(([^)]*)\)\s*(where\s+[^;]+)?;/gi;
const ALTER_UNIQUE =
  /alter\s+table\s+(?:only\s+)?(?:public\.)?(\w+)[\s\S]{0,200}?add\s+constraint\s+\w+\s+unique\s*\(([^)]*)\)/gi;
const KOLOM_PK = /^\s*(\w+)\s+[\w ()]*?\bprimary\s+key\b/gim;
const TABEL_PK = /(?:^|,)\s*(?:constraint\s+\w+\s+)?primary\s+key\s*\(([^)]*)\)/gim;
const TABEL_UNIQUE = /(?:^|,)\s*(?:constraint\s+\w+\s+)?unique\s*\(([^)]*)\)/gim;

function kolommen(ruw) {
  return ruw
    .split(',')
    .map((k) => k.trim().replace(/\s+(asc|desc)$/i, '').replace(/^"|"$/g, ''))
    .filter((k) => /^\w+$/.test(k));
}

/**
 * Het predicaat van een partiële index, als deze lezer het aankan.
 *
 * ⚠️⚠️ **Twee vormen en verder niets, en dat is met opzet streng.** `where x is
 *    null` en `where x = 'waarde'` zijn de twee die in dit schema voorkomen.
 *    Alles wat hij níét herkent geeft `null`, en een index met een onleesbaar
 *    predicaat telt **niet** als garantie. Dat is de veilige kant: een controle
 *    die een predicaat dat hij niet snapt maar overslaat, keurt precies het
 *    geval goed waar hij voor bestaat.
 */
export function predicaatUit(ruw) {
  if (ruw === undefined || ruw === null) return null;

  const tekst = ruw.replace(/^where\s+/i, '').trim();

  const isNull = /^(\w+)\s+is\s+null$/i.exec(tekst);
  if (isNull !== null) return { kolom: isNull[1], soort: 'is_null' };

  const gelijk = /^(\w+)\s*=\s*'([^']*)'$/.exec(tekst);
  if (gelijk !== null) return { kolom: gelijk[1], soort: 'eq', waarde: gelijk[2] };

  return { onleesbaar: tekst };
}

/**
 * De views die hun garantie één laag lager halen.
 *
 * ⚠⚠ **Zonder dit zouden `mijn_profiel` en `goal_dashboard` twee permanente
 *    registerrijen worden, en dat zou de ruis zijn die dit issue juist wilde
 *    vermijden.** 📏 Allebei staan ze op precies één basisrelatie zonder join
 *    — `from public.profiles p where id = (select auth.uid())` en `from goals g`
 *    met scalaire subquery's ernaast — dus één rij per rij van de basistabel.
 *    Een view die `id` doorgeeft van een tabel waar `id` de sleutel is, belóóft
 *    hoogstens één rij; dat is geen aanname maar de vorm.
 *
 * ⚠️ **Streng waar hij het niet zeker weet.** Alles met een `join`, een
 *    `group by`, een `union`, of met meer dan één relatie in de buitenste `from`
 *    valt af en erft niets. Een view die hij niet snapt is geen garantie; dan
 *    komt de aanroep er als bevinding uit, en dat is de goede kant om op te
 *    falen.
 */
const VIEW = /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?(\w+)([\s\S]*?);/gi;

/** De stukken van `tekst` op haakjesdiepte nul, gesplitst op `scheider`. */
function opDiepteNul(tekst, scheider) {
  const uit = [];
  let begin = 0;
  let diepte = 0;

  for (let i = 0; i < tekst.length; i += 1) {
    const teken = tekst[i];
    if (teken === '(') diepte += 1;
    else if (teken === ')') diepte -= 1;
    else if (diepte === 0 && tekst.startsWith(scheider, i)) {
      uit.push(tekst.slice(begin, i));
      begin = i + scheider.length;
      i += scheider.length - 1;
    }
  }

  uit.push(tekst.slice(begin));
  return uit;
}

/** De basistabel van een view plus de kolommen die hij onder eigen naam doorgeeft. */
export function viewBasisUit(ruw) {
  // ⚠️ **Eerst de witruimte gelijktrekken, en dat is een gemeten reparatie.**
  //    📏 De eerste versie zocht op de letterlijke tekst ` select `, en
  //    `goal_dashboard` schrijft `as\nselect\n  g.id` — een nieuwe regel waar
  //    `mijn_profiel` een spatie heeft. Die view viel daardoor stil buiten de
  //    erfenis en kwam eruit als bevinding. Alleen namen worden hier gelezen,
  //    dus één spatie overal verandert niets aan het antwoord.
  const lichaam = ` ${ruw.replace(/\s+/g, ' ')} `;
  const laag = lichaam.toLowerCase();
  if (/\bjoin\b|\bgroup\s+by\b|\bunion\b/.test(laag)) return null;

  const naSelect = lichaam.slice(laag.indexOf(' select ') + 8);
  const delen = opDiepteNul(naSelect, ' from ');
  if (delen.length !== 2) return null;

  const [selectlijst, rest] = delen;
  const basis = /^\s*(?:public\.)?(\w+)/.exec(rest);
  if (basis === null) return null;
  if (/^\s*(?:public\.)?\w+\s+\w*\s*,/.test(rest)) return null;

  const kolommen = opDiepteNul(selectlijst, ',').map((stuk) => {
    const schoon = stuk.trim();
    const alias = /\bas\s+(\w+)\s*$/i.exec(schoon);
    if (alias !== null) return alias[1];
    const kaal = /(?:^|\.)(\w+)\s*$/.exec(schoon);
    return kaal === null ? null : kaal[1];
  });

  return { basis: basis[1], kolommen: kolommen.filter((k) => k !== null) };
}

/**
 * Per tabel elke verzameling kolommen waarvan het schema belooft dat ze hoogstens
 * één rij aanwijzen.
 *
 * ⚠️ Zowel de kolomvorm (`goal_id uuid primary key ...`) als de tabelvorm
 *    (`primary key (group_id, user_id)`) telt. 📏 Bij het schrijven meldde een
 *    eerdere versie `goal_risk` en `hero_profiles` als ongedekt, en dat was de
 *    lezer en niet het schema: allebei dragen hun sleutel inline op de kolom.
 */
export function garantiesUit(sqlTeksten) {
  const perTabel = new Map();
  const zet = (tabel, kolommenLijst, predicaat = null) => {
    if (kolommenLijst.length === 0) return;
    if (!perTabel.has(tabel)) perTabel.set(tabel, []);
    perTabel.get(tabel).push({ kolommen: kolommenLijst, predicaat });
  };

  for (const sql of sqlTeksten) {
    for (const { tabel, lichaam } of tabelLichamen(sql)) {
      for (const k of lichaam.matchAll(KOLOM_PK)) zet(tabel, [k[1]]);
      for (const k of lichaam.matchAll(TABEL_PK)) zet(tabel, kolommen(k[1]));
      for (const k of lichaam.matchAll(TABEL_UNIQUE)) zet(tabel, kolommen(k[1]));
    }
    for (const m of sql.matchAll(UNIEKE_INDEX)) zet(m[1], kolommen(m[2]), predicaatUit(m[3]));
    for (const m of sql.matchAll(ALTER_UNIQUE)) zet(m[1], kolommen(m[2]));
  }

  // ⚠️ **Ná de tabellen, en in bestandsvolgorde.** Een view wordt herdefinieerd;
  //    de laatste definitie is de geldende, en zijn basistabel moet al gelezen
  //    zijn vóór hij eruit kan erven.
  const views = new Map();
  for (const sql of sqlTeksten) {
    for (const m of sql.matchAll(VIEW)) views.set(m[1], viewBasisUit(m[2]));
  }

  for (const [naam, view] of views) {
    if (view === null) continue;
    for (const garantie of perTabel.get(view.basis) ?? []) {
      if (!garantie.kolommen.every((k) => view.kolommen.includes(k))) continue;
      if (garantie.predicaat !== null && !view.kolommen.includes(garantie.predicaat.kolom)) continue;
      zet(naam, garantie.kolommen, garantie.predicaat);
    }
  }

  return perTabel;
}

// ---------------------------------------------------------------------------
// 3. Het oordeel
// ---------------------------------------------------------------------------

/** Dekt dit filterstel het predicaat van een partiële index? */
function predicaatGedekt(predicaat, keten) {
  if (predicaat === null) return true;
  if (predicaat.onleesbaar !== undefined) return false;

  if (predicaat.soort === 'is_null') return keten.isNull.includes(predicaat.kolom);

  return keten.eq.some(
    (f) => f.kolom === predicaat.kolom && f.waarde.replace(/^['"]|['"]$/g, '') === predicaat.waarde,
  );
}

/**
 * Waarom deze keten hoogstens één rij oplevert, of `null` als niets dat belooft.
 *
 * ⚠️ **De volgorde is die van sterkte en niet van gemak.** Een `insert(...)`
 *    geeft per constructie de rijen terug die hij zelf schreef; `.limit(1)` maakt
 *    "precies één" de definitie; een sleutel in het schema is een belofte van de
 *    database. Alle drie zijn structureel — er zit geen "ziet er goed uit" bij.
 */
export function dekkingVoor(keten, garanties) {
  if (keten.schrijft) return 'insert geeft zijn eigen rij terug';
  if (keten.heeftLimiet1) return 'limit(1) maakt precies één de definitie';

  const gefilterd = new Set(keten.eq.map((f) => f.kolom));
  for (const kolom of keten.isNull) gefilterd.add(kolom);

  for (const garantie of garanties.get(keten.tabel) ?? []) {
    if (!garantie.kolommen.every((k) => gefilterd.has(k))) continue;
    if (!predicaatGedekt(garantie.predicaat, keten)) continue;

    const waar = garantie.predicaat === null ? '' : ` (partieel: ${garantie.predicaat.kolom})`;
    return `uniek op ${garantie.kolommen.join(', ')}${waar}`;
  }

  return null;
}

/**
 * De ongedekte ketens, de onleesbare, en de registerrijen die niets meer dekken.
 *
 * ⚠️ **De ratel slaat twee kanten op**, zoals bij `levend:controle` en
 *    `regel15:controle`. Een registerrij die niemand meer nodig heeft is óók
 *    rood: anders blijft er een vrijbrief liggen voor een aanroep die morgen om
 *    een heel andere reden terugkomt.
 *
 * ⚠️ Geëxporteerd en zonder bestandssysteem: de aanroeper voedt hem. Een controle
 *    die je niet kunt voeden, kun je niet ijken.
 */
export function beoordeel(bestanden, garanties, register = ZONDER_GARANTIE) {
  const gebruikt = new Set();
  const ongedekt = [];
  const onleesbaar = [];

  for (const { pad, inhoud } of bestanden) {
    for (const keten of ketensIn(inhoud)) {
      if (keten.onleesbaar) {
        onleesbaar.push({ pad, fragment: keten.fragment });
        continue;
      }

      if (dekkingVoor(keten, garanties) !== null) continue;

      const rij = register.find((r) => r.pad === pad && r.tabel === keten.tabel);
      if (rij === undefined) ongedekt.push({ pad, ...keten });
      else gebruikt.add(`${rij.pad}|${rij.tabel}`);
    }
  }

  const ongebruikt = register.filter((r) => !gebruikt.has(`${r.pad}|${r.tabel}`));
  return { ongedekt, onleesbaar, ongebruikt };
}

// ---------------------------------------------------------------------------
// 4. De CLI
// ---------------------------------------------------------------------------

/** Een bronbestand en geen toets: de toetsen dragen hun eigen ketens als fixture. */
function teltMee(naam, achtervoegsels) {
  return achtervoegsels.some((a) => naam.endsWith(a)) && !naam.includes('.test.');
}

function bestandenOnder(map, achtervoegsels) {
  const uit = [];
  const wachtrij = [map];

  while (wachtrij.length > 0) {
    const pad = wachtrij.shift();
    for (const naam of readdirSync(pad)) {
      const vol = join(pad, naam);
      const map_ = statSync(vol).isDirectory();
      if (map_ && naam !== 'node_modules') wachtrij.push(vol);
      else if (!map_ && teltMee(naam, achtervoegsels)) uit.push(vol);
    }
  }

  return uit.sort();
}

export function hoofd() {
  const bestanden = BRONMAPPEN.flatMap((map) =>
    bestandenOnder(join(WORTEL, map), ['.ts', '.tsx']).map((pad) => ({
      pad: relative(WORTEL, pad).replace(/\\/g, '/'),
      inhoud: readFileSync(pad, 'utf8'),
    })),
  );

  const migraties = bestandenOnder(join(WORTEL, MIGRATIEMAP), ['.sql']).map((pad) =>
    readFileSync(pad, 'utf8'),
  );

  const garanties = garantiesUit(migraties);
  const { ongedekt, onleesbaar, ongebruikt } = beoordeel(bestanden, garanties);
  const geteld = bestanden.reduce((n, b) => n + ketensIn(b.inhoud).length, 0);

  const fouten = [];

  for (const r of ongedekt) {
    fouten.push(
      `✗ ${r.pad} — ${r.tabel}.${r.soort}() zonder garantie dat er hoogstens één rij is.\n` +
        `    filters: ${[...r.eq.map((f) => f.kolom), ...r.isNull].join(', ') || 'geen'}\n` +
        `    ${r.fragment}…`,
    );
  }

  for (const r of onleesbaar) {
    fouten.push(
      `✗ ${r.pad} — een keten op .${'single'}() zonder leesbare .from(…).\n` +
        `    Ongemeten is niet groen; zet hem leesbaar neer of in het register.\n` +
        `    ${r.fragment}…`,
    );
  }

  for (const r of ongebruikt) {
    fouten.push(`✗ ${r.pad} — registerrij voor ${r.tabel} dekt niets meer; haal hem weg.`);
  }

  if (fouten.length > 0) {
    console.error(fouten.join('\n\n'));
    console.error(`\n${fouten.length} bevinding(en) over ${geteld} aanroepen.`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `eenrij-controle: ${geteld} aanroepen van .single()/.maybeSingle(), elk met een garantie ` +
      `dat er hoogstens één rij terugkomt (${garanties.size} tabellen met een sleutel gelezen).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
