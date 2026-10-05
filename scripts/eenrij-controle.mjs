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
 *    zonder leesbare `.from(...)` of `.rpc(...)` komt eruit als `onleesbaar` en
 *    maakt de controle rood. Ongemeten is niet groen; dat is de les van QS8-268
 *    en QS8-270, en die geldt bínnen een controle net zo goed als ertussen.
 *
 * ⚠️⚠️ **Maar een melding moet wél een uitweg noemen die bestaat, en dat was tot
 *    QS8-626 niet zo.** Een keten die met `.rpc(...)` begint heeft geen tabel,
 *    viel daarom in `onleesbaar`, en die tak gaat er in `beoordeel()` uit **vóór**
 *    de registerlookup — die bovendien op `{pad, tabel}` matcht. De melding zei
 *    *"zet hem leesbaar neer of in het register"* en dat tweede kón niet. 📏 Een
 *    poging tot registreren gaf gemeten **twee** bevindingen in plaats van nul.
 *
 *    Een RPC is nu leesbaar en heeft zijn eigen garantie: het **retourtype**.
 *    Zie `rpcGarantiesUit()`, inclusief de meting waarom een `limit 1` in het
 *    functielichaam daar níet bij hoort.
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
const RPC = /\.rpc\(\s*['"](\w+)['"]/;
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
 *
 * ⚠️⚠️ **Een keten die met `.rpc(...)` begint is sinds QS8-626 leesbaar, en dat
 *    was hij nodig.** Daarvóór viel hij in `onleesbaar`, en dat is een tak die
 *    `beoordeel()` eruit gooit **vóór** de registerlookup — terwijl het register
 *    op `{pad, tabel}` matcht en een onleesbare keten geen tabel draagt. 📏 Een
 *    `.rpc(...).maybeSingle()` was daarmee niet groen te krijgen: niet met een
 *    garantie, en niet met een registerrij. Gemeten gaf een poging tot
 *    registreren zelfs **twee** bevindingen in plaats van nul — de keten bleef
 *    onleesbaar en de rij heette ongebruikt.
 */
export function ketensIn(bron) {
  const uit = [];

  for (const statement of statementsIn(zonderCommentaar(bron))) {
    const afsluiter = AFSLUITER.exec(statement);
    if (afsluiter === null) continue;

    const tabel = TABEL.exec(statement);
    const rpc = RPC.exec(statement);

    if (tabel === null && rpc === null) {
      uit.push({
        soort: afsluiter[1],
        tabel: null,
        rpc: null,
        onleesbaar: true,
        fragment: fragment(statement),
      });
      continue;
    }

    uit.push({
      soort: afsluiter[1],
      tabel: tabel === null ? null : tabel[1].replace(/^public\./, ''),
      rpc: tabel === null ? rpc[1] : null,
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

const FUNCTIEKOP = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi;
const RETOUR = /\)\s*returns\s+([\s\S]{0,60})/i;
const MEERRIJ = /^(?:setof\b|table\s*\()/i;
const SQL_REGELCOMMENTAAR = /--[^\n]*/g;

/**
 * Per functienaam of het schema belooft dat er hoogstens één rij uit komt.
 *
 * **De garantie is het retourtype en niets anders.** Een functie die geen
 * `setof` en geen `table(...)` teruggeeft, levert over PostgREST per constructie
 * precies één waarde. Dat is even structureel als een unieke index, en het is
 * niet te omzeilen door wat er in het lichaam staat.
 *
 * ⚠️⚠️ **Een `limit 1` in het functielichaam telt hier níet mee, en dat wijkt af
 *    van wat QS8-626 als acceptatie voorstelde. De reden is een meting.** 📏 Van
 *    de 123 meerrijdefinities in de migratiemap heeft er **geen enkele** een
 *    `limit 1` als laatste clausule van zijn lichaam. Zestien hebben er wél een
 *    ergens in het lichaam, en bij **alle zestien** zit hij in een laterale
 *    subquery — elk wordt gevolgd door `) d on true`, `) k on true`, `) g(regel)`
 *    of `) s`. Een regex die "`limit 1` in het lichaam" leest, zou dus
 *    `group_overview` en `openstaande_beoordelingen` als gedekt aanmerken, en dat
 *    zijn juist de **gepagineerde** functies. Dat is een vals groen op precies de
 *    aanroep die mis kan gaan.
 *
 *    De `limit 1` die wél telt is die op de **aanroep** (`.limit(1)` in de
 *    keten): die staat op de buitenste query en is op de aanroeproep te zien.
 *    `dekkingVoor()` leest hem al.
 *
 * ⚠️⚠️ **Een naam is pas gedekt als élke definitie ervan gedekt is.** Niet de
 *    laatste, zoals bij views. CLAUDE.md waarschuwt er met zoveel woorden voor
 *    dat een drop van `f(uuid, text, text)` geen nieuwe `f` met zes argumenten
 *    dekt — overloads delen een naam en leven naast elkaar, en PostgREST kiest op
 *    de meegegeven parameternamen. Een vals negatief kost een registerrij, een
 *    vals positief een productiefout; de regel staat dus aan de veilige kant.
 *
 *    📏 Vandaag kost die keuze niets: van de **307** namen valt er **geen enkele**
 *    in beide klassen, en de 246 gedekte namen zijn precies de namen waarvan élke
 *    definitie enkelrij is. De regel is er voor de dag dat dat wél gebeurt.
 */
export function rpcGarantiesUit(sqlTeksten) {
  const perNaam = new Map();

  for (const ruw of sqlTeksten) {
    // ⚠️⚠️ **Commentaar gaat eruit, en de zoektocht naar `returns` stopt bij de
    //    volgende kop.** Allebei nodig, en allebei met een gemeten geval. 📏 In
    //    `0276` staat een rollbackpad als `--   create or replace function
    //    public.sleutelzetters() …`. Zonder de knip is dat een kop, en de
    //    `returns` die er dan bij gezocht wordt is die van een **andere** functie
    //    verderop in hetzelfde bestand — `returns integer`. `sleutelzetters`
    //    kwam er zo uit als enkelrij-definitie die nooit geschreven is.
    const sql = ruw.replace(SQL_REGELCOMMENTAAR, '');
    const koppen = [...sql.matchAll(FUNCTIEKOP)];

    for (const [i, m] of koppen.entries()) {
      const eind = koppen[i + 1]?.index ?? sql.length;
      const retour = RETOUR.exec(sql.slice(m.index, eind));
      if (retour === null) continue;

      const eenrij = !MEERRIJ.test(retour[1].trim());
      perNaam.set(m[1], (perNaam.get(m[1]) ?? true) && eenrij);
    }
  }

  return perNaam;
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
export function dekkingVoor(keten, garanties, rpcGaranties = new Map()) {
  if (keten.schrijft) return 'insert geeft zijn eigen rij terug';
  if (keten.heeftLimiet1) return 'limit(1) maakt precies één de definitie';

  // ⚠️ Een RPC heeft geen tabel en dus geen sleutel; zijn garantie is het
  //    retourtype. Zie `rpcGarantiesUit()` voor waarom het lichaam niet telt.
  if (keten.rpc !== null && keten.rpc !== undefined) {
    return rpcGaranties.get(keten.rpc) === true
      ? `${keten.rpc}() geeft geen setof of table terug`
      : null;
  }

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
 * Waar een registerrij over gaat: een tabel óf een RPC, nooit allebei.
 *
 * ⚠️ Sinds QS8-626, want een rij op `{pad, tabel}` kon een `.rpc()`-keten niet
 *    aanwijzen. De naamruimtes staan los van elkaar: een tabel en een functie
 *    mogen dezelfde naam dragen, en dan zijn het twee rijen.
 */
function registersleutel(pad, r) {
  return r.rpc === null || r.rpc === undefined ? `${pad}|tabel:${r.tabel}` : `${pad}|rpc:${r.rpc}`;
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
export function beoordeel(bestanden, garanties, register = ZONDER_GARANTIE, rpcGaranties = new Map()) {
  const gebruikt = new Set();
  const ongedekt = [];
  const onleesbaar = [];

  for (const { pad, inhoud } of bestanden) {
    for (const keten of ketensIn(inhoud)) {
      if (keten.onleesbaar) {
        onleesbaar.push({ pad, fragment: keten.fragment });
        continue;
      }

      if (dekkingVoor(keten, garanties, rpcGaranties) !== null) continue;

      const sleutel = registersleutel(pad, keten);
      const rij = register.find((r) => registersleutel(r.pad, r) === sleutel);
      if (rij === undefined) ongedekt.push({ pad, ...keten });
      else gebruikt.add(sleutel);
    }
  }

  const ongebruikt = register.filter((r) => !gebruikt.has(registersleutel(r.pad, r)));
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

/** Eén bevinding over een leesbare keten — tabel of RPC. */
function meldOngedekt(r) {
  if (r.rpc !== null && r.rpc !== undefined) {
    return (
      `✗ ${r.pad} — ${r.rpc}().${r.soort}() zonder garantie dat er hoogstens één rij is.\n` +
      `    De functie geeft setof of table(…) terug. Zet .limit(1) op de aanroep, lees de\n` +
      `    array en pak [0] met een undefined-toets, of zet hem met reden in het register.\n` +
      `    ${r.fragment}…`
    );
  }

  return (
    `✗ ${r.pad} — ${r.tabel}.${r.soort}() zonder garantie dat er hoogstens één rij is.\n` +
    `    filters: ${[...r.eq.map((f) => f.kolom), ...r.isNull].join(', ') || 'geen'}\n` +
    `    ${r.fragment}…`
  );
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
  const rpcGaranties = rpcGarantiesUit(migraties);
  const { ongedekt, onleesbaar, ongebruikt } = beoordeel(
    bestanden,
    garanties,
    ZONDER_GARANTIE,
    rpcGaranties,
  );
  const geteld = bestanden.reduce((n, b) => n + ketensIn(b.inhoud).length, 0);

  const fouten = [];

  for (const r of ongedekt) {
    fouten.push(meldOngedekt(r));
  }

  for (const r of onleesbaar) {
    // ⚠️ Hier staat géén verwijzing naar het register, en dat is sinds QS8-626
    //    met opzet: een keten zonder `.from(…)` én zonder `.rpc(…)` draagt niets
    //    waar een rij op kan matchen. Een melding die naar een uitweg wijst die
    //    er niet is, is erger dan geen melding.
    fouten.push(
      `✗ ${r.pad} — een keten op .single()/.maybeSingle() zonder leesbare .from(…) of .rpc(…).\n` +
        `    Ongemeten is niet groen; zet de tabel- of functienaam letterlijk in de keten.\n` +
        `    ${r.fragment}…`,
    );
  }

  for (const r of ongebruikt) {
    const waarover = r.rpc === null || r.rpc === undefined ? r.tabel : `${r.rpc}()`;
    fouten.push(`✗ ${r.pad} — registerrij voor ${waarover} dekt niets meer; haal hem weg.`);
  }

  if (fouten.length > 0) {
    console.error(fouten.join('\n\n'));
    console.error(`\n${fouten.length} bevinding(en) over ${geteld} aanroepen.`);
    process.exitCode = 1;
    return;
  }

  const enkelrij = [...rpcGaranties.values()].filter(Boolean).length;
  console.log(
    `eenrij-controle: ${geteld} aanroepen van .single()/.maybeSingle(), elk met een garantie ` +
      `dat er hoogstens één rij terugkomt (${garanties.size} tabellen met een sleutel gelezen, ` +
      `${enkelrij} van ${rpcGaranties.size} functies geven per constructie één rij).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
