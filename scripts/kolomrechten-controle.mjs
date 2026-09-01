#!/usr/bin/env node
/**
 * kolomrechten-controle — vraagt of schrijft de app kolommen waar hij geen recht
 * op heeft, en ligt er ergens een recht dat niemand gebruikt?
 *
 * ⚠️ **Twee helften van één belofte, en de tweede is er pas sinds QS8-258.** De
 *    leeskant hieronder bestaat sinds de 0089-storing; de schrijfkant is
 *    toegevoegd nadat 0140 om precies de spiegelvorm omviel. Wat de twee
 *    gemeen hebben staat in de kop van de schrijfkant verderop.
 *
 * ⚠️ **Deze controle bestaat door een productiestoring die niemand zag, en die
 *    door twee verschillende reviewers op dezelfde dag gevonden werd.**
 *    Migratie 0089 trok de tabelbrede SELECT op `profiles` in — een groepsgenoot
 *    kon je dagritme uitlezen, en RLS kan geen kolommen beperken, dus het moest
 *    een kolomgrant worden. Correct, en getest: `policies.test.ts` toetst de
 *    lééskant uitgebreid.
 *
 *    Wat niemand toetste is dat `updateProfiel()` zijn rij terugvroeg met
 *    `.select('*')`. Een `returning *` vraagt leesrecht op élke kolom, dus vanaf
 *    0089 viel élke profielopslag om met 42501: tijdzone, week-startdag,
 *    herinneringen, taal — én `rondOnboardingAf()`, zodat niemand de onboarding
 *    kon afronden. Er was niets kapot aan de policy, niets kapot aan de grant en
 *    niets kapot aan de app. Alleen de combinatie deugde niet, en de combinatie
 *    was van niemand (onwrikbare regel 18).
 *
 * ⚠️ **De aanname die het in stand hield staat opgeschreven in een test.** Bij de
 *    0089-tests stond dat PostgREST bij `select=*` stilletjes de kolommen weglaat
 *    waar je geen recht op hebt. Dat doet hij niet: hij geeft 42501. Een
 *    aanname over gedrag van een ander systeem is geen bewijs — vandaar dat deze
 *    controle de échte grants leest en niet een verwachting.
 *
 * De regel: **elke kolom die `src/` of `app/` terugvraagt van een tabel of view,
 * moet in de SELECT-grant van `authenticated` zitten.** `select('*')` op een
 * tabel met een versmalde grant is per definitie fout.
 *
 * ⚠️ Draait tegen een opgebouwde database, want grants staan niet in de code.
 *    Zie `klokgrens-controle.mjs` voor hetzelfde patroon en dezelfde reden.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Kolommen die wél in een `select()` staan maar geen kolom van de tabel zijn.
 *
 * PostgREST kent ingebedde bronnen (`goals(title)`) en aliassen (`naam:title`).
 * Die beoordeelt deze controle niet — ze lopen over een relatie, en dan gelden
 * de rechten van de ándere tabel. Wordt dat ooit een gat, dan is dat een eigen
 * bevinding en geen uitbreiding van deze regex.
 */
function isIngebed(kolom) {
  return kolom.includes('(') || kolom.includes(')');
}

/** `naam:title` → `title`; `title` → `title`. */
export function kolomNaam(stuk) {
  const schoon = stuk.trim();
  const dubbelePunt = schoon.indexOf(':');
  return dubbelePunt === -1 ? schoon : schoon.slice(dubbelePunt + 1).trim();
}

/**
 * Alle `.from('X') … .select('…')`-paren in één bestand.
 *
 * @param inhoud de bestandsinhoud — als parameter zodat deze controle te voeden
 *   is zonder de codebase te wijzigen.
 */
export function selectiesIn(pad, inhoud) {
  const uit = [];
  const stukken = inhoud.split(".from('");

  for (let i = 1; i < stukken.length; i++) {
    const stuk = stukken[i];
    const eindeNaam = stuk.indexOf("'");
    if (eindeNaam === -1) continue;
    const tabel = stuk.slice(0, eindeNaam);

    // Alleen tot aan de volgende `.from(` kijken: daarna is het een andere keten.
    const venster = stuk.slice(eindeNaam);
    const select = /\.select\(\s*'([^']*)'/.exec(venster);
    if (select === null) continue;

    // ⚠️ `'*, goals!inner(owner_id)'` is een geldige selectie: een ster plús een
    //    ingebedde bron. De ster telt dan gewoon als "alle kolommen van déze
    //    tabel" — hem als kolomnaam behandelen leverde twee valse meldingen op,
    //    en een controle die valse meldingen geeft leer je te negeren.
    const delen = select[1].split(',').map(kolomNaam).filter((k) => k.length > 0);
    const alles = delen.includes('*');
    const kolommen = alles ? [] : delen.filter((k) => !isIngebed(k));

    uit.push({ pad, tabel, kolommen, alles });
  }

  return uit;
}

/**
 * Legt de gevraagde kolommen naast de rechten.
 *
 * @param rechten `{ [tabel]: { kolommen: string[], volledig: boolean } }`
 */
export function beoordeel(selecties, rechten) {
  const fouten = [];

  for (const s of selecties) {
    const recht = rechten[s.tabel];
    if (recht === undefined) {
      fouten.push({ ...s, reden: `\`authenticated\` heeft geen enkel leesrecht op \`${s.tabel}\`` });
      continue;
    }

    if (s.alles) {
      if (!recht.volledig) {
        fouten.push({
          ...s,
          reden:
            `\`select('*')\` op \`${s.tabel}\`, maar \`authenticated\` mag maar ` +
            `${recht.kolommen.length} van de ${recht.totaal} kolommen lezen`,
        });
      }
      continue;
    }

    const missend = s.kolommen.filter((k) => !recht.kolommen.includes(k));
    if (missend.length > 0) {
      fouten.push({ ...s, reden: `geen leesrecht op ${missend.map((k) => `\`${k}\``).join(', ')}` });
    }
  }

  return fouten;
}

const VRAAG = `
select c.table_name,
       count(*) filter (where p.grantee = 'authenticated'),
       count(*),
       coalesce(string_agg(c.column_name, ',') filter (where p.grantee = 'authenticated'), '')
from information_schema.columns c
left join information_schema.column_privileges p
  on p.table_schema = c.table_schema
 and p.table_name   = c.table_name
 and p.column_name  = c.column_name
 and p.grantee      = 'authenticated'
 and p.privilege_type = 'SELECT'
where c.table_schema = 'public'
group by c.table_name
order by c.table_name;
`;

/** Zet de uitvoer van `psql -At -F'|'` om in een rechtentabel. */
export function ontleedRechten(uitvoer) {
  const rechten = {};
  for (const regel of uitvoer.split('\n')) {
    if (regel.trim().length === 0) continue;
    const [tabel, mag, totaal, kolommen] = regel.split('|');
    if (Number(mag) === 0) continue;
    rechten[tabel] = {
      kolommen: kolommen.split(',').filter((k) => k.length > 0),
      totaal: Number(totaal),
      volledig: Number(mag) === Number(totaal),
    };
  }
  return rechten;
}

function bestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    if (naam === 'node_modules' || naam === '.git') continue;
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) bestanden(pad, uit);
    else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) uit.push(pad);
  }
  return uit;
}


// ---------------------------------------------------------------------------
// De schrijfkant — QS8-258
// ---------------------------------------------------------------------------
//
// ⚠️ **Dit is de andere helft van dezelfde belofte, en die ontbrak.** De leeskant
//    hierboven bewaakt "vraag niets terug wat je niet mag lezen". Het spiegelbeeld
//    is "stuur niets mee wat je niet mag schrijven", en dat had geen enkele
//    controle. Migratie 0140 voegde `goals.ritme`, `weekly_goals.floor_days` en
//    `weekly_goals.ceiling_days` toe zonder ze in de INSERT-kolomgrant te zetten.
//    Omdat `doelSchema` `ritme` een default geeft, stuurt de client hem áltijd
//    mee: niet een ritme-doel brak, maar élk doel aanmaken, met 42501.
//
//    `kolomrechten:controle` bleef groen en dat was terecht — hij bewaakte de
//    ene helft. Onwrikbare regel 18 in zuivere vorm: elk onderdeel klopte, en de
//    naad was van niemand.
//
// ⚠️ **En de tweede richting hoort er gratis bij.** Een kolom die wél een grant
//    heeft en door niets geschreven wordt, is het dode hout van QS8-113 — daar
//    lag een kolom met een grant en een policy die niemand ooit kon vullen, en
//    geen enkele test kón dat zien omdat er niets kapot was (regel 18 vraag 5).
//    De controle die de ene richting kent, kent de andere er bijna gratis bij.

/**
 * Het eerste argument dat op `start` begint, met de haakjes meegeteld.
 *
 * ⚠️ **Waarom een tellertje en geen regex.** `.upsert({ … }, { onConflict: … })`
 *    heeft twee argumenten, en een objectliteraal kan zelf komma's, haakjes en
 *    strings bevatten. Een regex die op de eerste `}` of `,` stopt, knipt
 *    `{ a: f(x, y) }` doormidden en geeft dan stilzwijgend een hálve kolomlijst
 *    terug — een controle die te weinig ziet en groen blijft.
 *
 * @returns de tekst van het argument, of `null` als het niet afgesloten wordt.
 */
export function argumentNa(inhoud, start) {
  let diepte = 0;
  let aanhaling = null;

  for (let i = start; i < inhoud.length; i++) {
    const c = inhoud[i];

    if (aanhaling !== null) {
      if (c === '\\') i++;
      else if (c === aanhaling) aanhaling = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      aanhaling = c;
      continue;
    }

    if (c === '(' || c === '{' || c === '[') diepte++;
    else if (c === ')' || c === '}' || c === ']') {
      if (diepte === 0) return inhoud.slice(start, i);
      diepte--;
    } else if (c === ',' && diepte === 0) return inhoud.slice(start, i);
  }

  return null;
}

/**
 * De sleutels op het bovenste niveau van een objectliteraal, plus zijn spreads.
 *
 * Werkt net zo goed op een `z.object({ … })` als op het argument van een
 * `insert()`: allebei zijn het een accolade met `sleutel:` op diepte 1.
 *
 * @returns `{ sleutels, spreads }` — `spreads` zijn de `...expr` die er nog
 *   ongelezen in staan; die lost `losSpreadOp()` op, of niemand.
 */
export function objectSleutels(tekst) {
  const begin = tekst.indexOf('{');
  if (begin === -1) return { sleutels: [], spreads: [] };

  const sleutels = [];
  const spreads = [];
  let diepte = 0;
  let aanhaling = null;
  let inRegel = false;
  let inBlok = false;
  let inWaarde = false;

  for (let i = begin; i < tekst.length; i++) {
    const c = tekst[i];

    if (inRegel) {
      if (c === '\n') inRegel = false;
      continue;
    }
    if (inBlok) {
      if (c === '*' && tekst[i + 1] === '/') {
        inBlok = false;
        i++;
      }
      continue;
    }
    if (aanhaling !== null) {
      if (c === '\\') i++;
      else if (c === aanhaling) aanhaling = null;
      continue;
    }

    // ⚠️ Commentaar eerst: in dit project staat er een halve alinea uitleg
    //    tússen de velden van een `z.object()`, met dubbele punten in de tekst.
    if (c === '/' && tekst[i + 1] === '/') {
      inRegel = true;
      i++;
      continue;
    }
    if (c === '/' && tekst[i + 1] === '*') {
      inBlok = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      // ⚠️ **Een sleutel tussen aanhalingstekens is geen string.** Wie hier meteen
      //    de aanhalingsmodus inschakelt, slikt `'goal_id':` in zijn geheel op en
      //    ziet die kolom nooit. Dat is een controle die stilletjes minder ziet,
      //    en de rode test die dit vond stond er eerder dan de reparatie.
      if (diepte !== 1 || inWaarde || !/^'[A-Za-z0-9_]+'\s*:/.test(tekst.slice(i))) {
        aanhaling = c;
        continue;
      }
    }

    if (c === '{' || c === '(' || c === '[') {
      diepte++;
      continue;
    }
    if (c === '}' || c === ')' || c === ']') {
      diepte--;
      if (diepte === 0) break;
      continue;
    }

    if (diepte !== 1) continue;

    // ⚠️ **Na een sleutel niet meer kijken tot de komma.** Anders leest
    //    `note: notitie === '' ? null : notitie` óók `null` als sleutel — de
    //    tweede helft van een ternaire staat op precies dezelfde diepte. Dat gaf
    //    bij het bouwen twee kolommen die niet bestaan, en een controle die
    //    verzonnen kolommen meldt leer je uit te zetten.
    if (inWaarde) {
      if (c === ',') inWaarde = false;
      continue;
    }

    // `...gevalideerd.data` — een spread die hier nog ongelezen is.
    const spread = /^\.\.\.([A-Za-z0-9_.]+)/.exec(tekst.slice(i));
    if (spread !== null) {
      spreads.push(spread[1]);
      i += spread[0].length - 1;
      inWaarde = true;
      continue;
    }

    // `naam:` of `'naam':` — een sleutel op het bovenste niveau.
    const sleutel = /^(?:'([A-Za-z0-9_]+)'|([A-Za-z_][A-Za-z0-9_]*))\s*:/.exec(tekst.slice(i));
    if (sleutel !== null) {
      sleutels.push(sleutel[1] ?? sleutel[2]);
      i += sleutel[0].length - 1;
      inWaarde = true;
    }
  }

  return { sleutels, spreads };
}

/**
 * De velden van elk `z.object({ … })` dat aan een `…Schema` hangt.
 *
 * ⚠️ **De Zod-schema's zijn per tabel de facto de schrijfvorm**, en dát is waarom
 *    ze meetellen: `.default()` maakt een veld verplicht *aanwezig* in de uitvoer,
 *    ook als de gebruiker het niet invulde. Precies dat maakte `ritme` een kolom
 *    die de client altijd meestuurt, en daarmee élk doel aanmaken kapot.
 *
 * ⚠️ Afgeleide schema's (`doelSchema.omit({…}).partial()`) staan er bewust niet
 *    in. Ze worden in dit project via een opgebouwd `update`-object geschreven, en
 *    dát pad leest `velduitLokaal()` al. Zou er ooit een afgeleid schema
 *    rechtstreeks in een `insert()` gespreid worden, dan is dat hier een
 *    onleesbare spread en dus een bevinding — geen stilte.
 */
export function zodSchemas(inhoud) {
  const uit = {};
  const patroon = /export const ([A-Za-z0-9_]*[Ss]chema) = z\.object\(/g;

  for (let m = patroon.exec(inhoud); m !== null; m = patroon.exec(inhoud)) {
    const arg = argumentNa(inhoud, m.index + m[0].length);
    if (arg === null) continue;
    uit[m[1]] = objectSleutels(arg).sleutels;
  }

  return uit;
}

/**
 * Wat een lokale variabele als kolommen draagt.
 *
 * Twee vormen, en allebei staan ze meermaals in deze codebase:
 *
 *     const update: TablesUpdate<'goals'> = {};
 *     if (velden.title !== undefined) update.title = velden.title;
 *
 *     const rijen = gevalideerd.data.map((stap, i) => ({ goal_id: goalId, … }));
 *
 * @returns de kolomnamen, of `null` als de variabele hier niet te lezen is.
 */
export function velduitLokaal(inhoud, naam) {
  const m = new RegExp(`\\bconst ${naam}\\b[^=\\n]*=`).exec(inhoud);
  if (m === null) return null;

  const rest = inhoud.slice(m.index + m[0].length);

  // Vorm 2: een `.map()` die een objectliteraal teruggeeft.
  const pijl = /^[^;]*?=>\s*\(\s*\{/.exec(rest);
  if (pijl !== null) {
    const { sleutels, spreads } = objectSleutels(rest.slice(pijl[0].length - 1));
    return spreads.length > 0 ? null : sleutels;
  }

  // Vorm 1: een (meestal leeg) beginobject plus losse toewijzingen.
  if (!/^\s*\{/.test(rest)) return null;

  const uit = new Set(objectSleutels(rest).sleutels);
  const toewijzing = new RegExp(`\\b${naam}\\.([A-Za-z0-9_]+)\\s*=(?!=)`, 'g');
  for (let a = toewijzing.exec(inhoud); a !== null; a = toewijzing.exec(inhoud)) uit.add(a[1]);

  return [...uit];
}

/**
 * Waar een spread vandaan komt, als dat te zeggen is.
 *
 * `...gevalideerd.data`, waar `const gevalideerd = doelSchema.safeParse(…)` staat,
 * is de velden van `doelSchema`. `...m` in een `map()` is dat niet, en dan is het
 * antwoord `null` — ongemeten, en dat is iets anders dan leeg.
 */
export function losSpreadOp(inhoud, spread, schemas) {
  const punt = spread.indexOf('.');
  if (punt === -1 || spread.slice(punt) !== '.data') return null;

  const naam = spread.slice(0, punt);
  const m = new RegExp(`\\bconst ${naam}\\b[^=\\n]*=\\s*([A-Za-z0-9_]+)\\.safeParse\\b`).exec(inhoud);
  if (m === null) return null;

  return schemas[m[1]] ?? null;
}

/**
 * Welke rechten een schrijfactie nodig heeft.
 *
 * ⚠️ **Een upsert is niet altijd INSERT plús UPDATE, en dat is hier geen
 *    haarkloverij.** `on conflict do update` eist het UPDATE-recht al bij het
 *    plannen, óók als er geen conflict is; `do nothing` heeft het niet nodig.
 *    PostgREST kiest daartussen op `ignoreDuplicates`. Migratie 0118 leunt op
 *    precies dat verschil — zolang `koppelDoelAanGroep()` een gewone upsert was,
 *    hield een inert UPDATE-recht een werkende knop overeind. Zou deze functie
 *    dat onderscheid niet kennen, dan meldt ze daar een gat dat er niet is, en
 *    een controle met vals alarm zet je uit.
 */
export function rechtenVoor(soort, opties) {
  if (soort === 'insert') return ['INSERT'];
  if (soort === 'update') return ['UPDATE'];
  return /ignoreDuplicates\s*:\s*true/.test(opties ?? '') ? ['INSERT'] : ['INSERT', 'UPDATE'];
}

/**
 * Alle `.from('X') … .insert(/.update(/.upsert(`-paren in één bestand.
 *
 * @param schemas de uitkomst van `zodSchemas()` over het hele project — een
 *   schema staat vrijwel nooit in het bestand dat het gebruikt.
 */
export function schrijfIn(pad, inhoud, schemas = {}) {
  const uit = [];
  const stukken = inhoud.split(".from('");

  for (let i = 1; i < stukken.length; i++) {
    const stuk = stukken[i];
    const eindeNaam = stuk.indexOf("'");
    if (eindeNaam === -1) continue;
    const tabel = stuk.slice(0, eindeNaam);

    // Alleen tot aan de volgende `.from(` kijken: daarna is het een andere keten.
    const venster = stuk.slice(eindeNaam);
    const aanroep = /\.(insert|update|upsert)\(/.exec(venster);
    if (aanroep === null) continue;

    const soort = aanroep[1];
    const na = aanroep.index + aanroep[0].length;
    const arg = argumentNa(venster, na);
    const opties = arg === null ? null : argumentNa(venster, na + arg.length + 1);
    const gemeen = { pad, tabel, soort, rechten: rechtenVoor(soort, opties) };

    if (arg === null) {
      uit.push({ ...gemeen, kolommen: null, reden: 'het argument is niet af te lezen' });
      continue;
    }

    // Een kale naam: een variabele die elders in het bestand opgebouwd wordt.
    const kaal = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(arg);
    if (kaal !== null) {
      const kolommen = velduitLokaal(inhoud, kaal[1]);
      uit.push(
        kolommen === null
          ? { ...gemeen, kolommen: null, reden: `\`${kaal[1]}\` is hier niet te lezen` }
          : { ...gemeen, kolommen },
      );
      continue;
    }

    const { sleutels, spreads } = objectSleutels(arg);
    if (sleutels.length === 0 && spreads.length === 0) {
      uit.push({ ...gemeen, kolommen: null, reden: 'geen objectliteraal' });
      continue;
    }

    const kolommen = [...sleutels];
    let onleesbaar = null;
    for (const spread of spreads) {
      const velden = losSpreadOp(inhoud, spread, schemas);
      if (velden === null) onleesbaar = spread;
      else kolommen.push(...velden);
    }

    uit.push(
      onleesbaar === null
        ? { ...gemeen, kolommen: [...new Set(kolommen)] }
        : { ...gemeen, kolommen: null, reden: `\`...${onleesbaar}\` is hier niet te lezen` },
    );
  }

  return uit;
}

const SCHRIJFVRAAG = `
select c.table_name,
       pr.privilege_type,
       count(*),
       count(*) filter (where p.column_name is not null),
       coalesce(string_agg(c.column_name, ',') filter (where p.column_name is not null), '')
from information_schema.columns c
cross join (values ('INSERT'), ('UPDATE')) as pr(privilege_type)
left join information_schema.column_privileges p
  on p.table_schema = c.table_schema
 and p.table_name   = c.table_name
 and p.column_name  = c.column_name
 and p.grantee      = 'authenticated'
 and p.privilege_type = pr.privilege_type
where c.table_schema = 'public'
group by c.table_name, pr.privilege_type
order by c.table_name, pr.privilege_type;
`;

/**
 * Zet de uitvoer van `psql -At` om in `{ tabel: { INSERT: …, UPDATE: … } }`.
 *
 * ⚠️ **Een tabel zonder enige grant staat er wél in, met een lege kolomlijst.**
 *    Dat is het verschil tussen "hier mag niemand schrijven" (dan is een
 *    schrijfactie een bevinding) en "deze tabel bestaat niet" (ook een
 *    bevinding, maar een andere: een typefout in de tabelnaam). De leeskant
 *    hierboven gooit lege rechten juist weg — die heeft dat onderscheid niet
 *    nodig, want daar is "geen enkel recht" al de melding.
 */
export function ontleedSchrijfrechten(uitvoer) {
  const uit = {};
  for (const regel of uitvoer.split('\n')) {
    if (regel.trim().length === 0) continue;
    const [tabel, soort, totaal, mag, kolommen] = regel.split('|');
    uit[tabel] ??= {};
    uit[tabel][soort] = {
      kolommen: kolommen.split(',').filter((k) => k.length > 0),
      totaal: Number(totaal),
      // Een tabelbrede grant: élke kolom mag, dus ook elke kolom die er morgen
      // bij komt. Daar is een nieuwe kolom vanzelf schrijfbaar en valt er niets
      // te bewaken — dat is de grens die deze controle bruikbaar houdt.
      breed: Number(mag) === Number(totaal),
    };
  }
  return uit;
}

/**
 * Legt de geschreven kolommen naast de schrijfrechten, in beide richtingen.
 *
 * @returns `{ ontbrekend, ongeschreven, onleesbaar }` — achtereenvolgens: een
 *   kolom die geschreven wordt zonder recht (de storing van 0140), een kolom met
 *   een recht dat niemand gebruikt (het dode hout van QS8-113), en een
 *   schrijfactie die hier niet te lezen was (ongemeten, en dus niet groen).
 */
export function beoordeelSchrijven({ acties, rechten }) {
  const ontbrekend = [];
  const onleesbaar = [];

  /** Per `tabel|recht`: wat er ergens geschreven wordt, en of dat compleet is. */
  const geschreven = {};

  for (const a of acties) {
    for (const recht of a.rechten) {
      const sleutel = `${a.tabel}|${recht}`;
      geschreven[sleutel] ??= { kolommen: new Set(), volledig: true };
      if (a.kolommen === null) geschreven[sleutel].volledig = false;
      else for (const k of a.kolommen) geschreven[sleutel].kolommen.add(k);
    }

    if (a.kolommen === null) {
      onleesbaar.push({ pad: a.pad, tabel: a.tabel, soort: a.soort, reden: a.reden });
      continue;
    }

    const per = rechten[a.tabel];
    if (per === undefined) {
      ontbrekend.push({ ...a, reden: `\`${a.tabel}\` bestaat niet in \`public\`` });
      continue;
    }

    for (const soort of a.rechten) {
      const r = per[soort];
      if (r === undefined || r.kolommen.length === 0) {
        ontbrekend.push({
          ...a,
          reden: `\`authenticated\` heeft geen enkel ${soort}-recht op \`${a.tabel}\``,
        });
        continue;
      }
      if (r.breed) continue;

      const missend = a.kolommen.filter((k) => !r.kolommen.includes(k));
      if (missend.length > 0) {
        ontbrekend.push({
          ...a,
          reden:
            `geen ${soort}-recht op ${missend.map((k) => `\`${k}\``).join(', ')} van ` +
            `\`${a.tabel}\` — PostgREST geeft hier 42501`,
        });
      }
    }
  }

  // ⚠️ **De andere richting: een grant die niemand gebruikt.** Alleen op een
  //    versmalde grant, want daar ís elke kolom een besluit geweest. Op een
  //    tabelbrede grant zou dit `id`, `created_at` en elke triggerkolom melden,
  //    en een controle die alles meldt leer je te negeren.
  const ongeschreven = [];

  for (const [tabel, per] of Object.entries(rechten)) {
    for (const [soort, r] of Object.entries(per)) {
      if (r.breed || r.kolommen.length === 0) continue;

      const g = geschreven[`${tabel}|${soort}`];
      // Niets geschreven, of niet volledig te lezen: dan is dit ongemeten en
      // geen bevinding. Dat onleesbare pad staat al in `onleesbaar`.
      if (g === undefined || !g.volledig) continue;

      const dood = r.kolommen.filter((k) => !g.kolommen.has(k));
      if (dood.length > 0) ongeschreven.push({ tabel, soort, kolommen: dood });
    }
  }

  return { ontbrekend, ongeschreven, onleesbaar };
}

// ---------------------------------------------------------------------------
// Wat er vandaag bewust anders is
// ---------------------------------------------------------------------------
//
// ⚠️ **Twee lijsten, en allebei kloppen ze in twee richtingen.** Een uitzondering
//    die er niet meer toe doet is een leugen in een grendel: hij zegt "dit is
//    beoordeeld" over een toestand die niet meer bestaat. Daarom is een regel die
//    geen bevinding meer is óók rood — dezelfde vorm als `NOG_NIET_AANGESLOTEN`
//    in `catalogus-controle.mjs`.

/**
 * Kolommen met een grant die geen enkel schrijfpad in `src/` of `app/` gebruikt.
 *
 * Elke regel draagt de reden waarom dat vandaag klopt. Staat er geen reden, dan
 * is het dode hout van QS8-113 en hoort de grant weg of het scherm erbij.
 */
export const GEEN_SCHRIJFPAD = [
  {
    tabel: 'chat_messages',
    soort: 'INSERT',
    kolom: 'system_event',
    reden:
      'de grant is inert: `chat_messages_insert` weigert sinds 0071 elke rij van ' +
      'een client met een `system_event`. Systeemberichten komen uitsluitend uit ' +
      '`plaats_systeembericht()`. Opruimen hoort bij een 0118-achtige ronde.',
  },
  {
    tabel: 'chat_messages',
    soort: 'INSERT',
    kolom: 'attachment_url',
    reden: 'de kolom bestaat vooruit op bijlagen in de chat; er is nog geen scherm dat er een zet.',
  },
  {
    tabel: 'commitments',
    soort: 'UPDATE',
    kolom: 'body',
    reden:
      '0057 geeft de eigenaar met zoveel woorden het recht zijn tekst bij te ' +
      'werken zolang de status `set` is; het scherm dat dat doet bestaat nog niet.',
  },
  {
    tabel: 'commitments',
    soort: 'UPDATE',
    kolom: 'image_url',
    reden: 'idem — zelfde grant, zelfde zin in 0057.',
  },
  {
    tabel: 'groups',
    soort: 'UPDATE',
    kolom: 'icon',
    reden: '0019 geeft het recht; het groepsinstellingenscherm raakt het icoon nog niet aan.',
  },
  {
    tabel: 'groups',
    soort: 'UPDATE',
    kolom: 'tz',
    reden:
      'idem. ⚠️ En hier hangt meer aan: 0123 wijst erop dat een beheerder via ' +
      'deze grant de tijdzone van de groep kan verzetten. Zolang geen scherm hem ' +
      'gebruikt, is het een recht zonder pad.',
  },
  {
    tabel: 'weekly_goals',
    soort: 'INSERT',
    kolom: 'ai_generated',
    reden:
      'herkomst wordt bij een weekdoel niet door de client gezet — zie de kop van ' +
      '`mijlpalen.ts`. Bij `weekly_plan_steps` wél, en daar staat het recht dus terecht.',
  },
  {
    tabel: 'weekly_goals',
    soort: 'INSERT',
    kolom: 'points_floor',
    reden:
      'de puntenwaarden komen uit domeinregel 10 en staan als default op de kolom. ' +
      'Dat de client ze mág overschrijven is een oud recht en geen pad.',
  },
  {
    tabel: 'weekly_goals',
    soort: 'INSERT',
    kolom: 'points_ceiling',
    reden: 'idem.',
  },
];

/**
 * Schrijfacties waarvan de kolommen hier niet te lezen zijn.
 *
 * ⚠️ **Ongemeten is niet groen, en dat is de hele reden dat deze lijst bestaat.**
 *    Een schrijfactie die deze controle niet kan lezen, telt niet mee in béide
 *    richtingen: hij kan een ontbrekend recht verbergen, en hij zet de
 *    dode-hout-melding voor die tabel uit. Dat mag, maar het moet opgeschreven
 *    staan — anders groeit het stil door tot de controle nog maar over de helft
 *    van de codebase iets zegt.
 */
export const NIET_TE_LEZEN = [
  {
    pad: 'src/modules/ai/plan-toepassen.ts',
    tabel: 'milestones',
    reden:
      '`rijen.mijlpalen.map((m) => ({ ...m, goal_id }))` spreidt een rij die in ' +
      '`rijenUitPlan()` is opgebouwd. `milestones` heeft een tabelbrede ' +
      'INSERT-grant, dus er valt hier niets te missen zolang dat zo blijft.',
  },
  {
    pad: 'src/modules/goals/interview.ts',
    tabel: 'goals',
    reden:
      '`update(patch)` waar `patch` uit `spiegelpatch()` komt — een functie en ' +
      'geen literaal. De velden die zij zet zijn een deelverzameling van wat ' +
      '`wijzigDoel()` schrijft, en die staat hier wél onder de controle.',
  },
];

function schrijfacties(paden, lees) {
  const schemas = {};
  for (const pad of paden) Object.assign(schemas, zodSchemas(lees(pad)));
  return paden.flatMap((pad) => schrijfIn(relative(WORTEL, pad), lees(pad), schemas));
}

const dodeSleutel = (tabel, soort, kolom) => `${tabel}|${soort}|${kolom}`;
const leesSleutel = (pad, tabel) => `${pad}|${tabel}`;

/**
 * De bevindingen die niet op een uitzonderingslijst staan, als tekst.
 *
 * ⚠️ **Bewust los van `verlopenRegels()` hieronder.** Die twee kijken de
 *    tegenovergestelde kant op, en samengevoegd is deze functie niet te voeden:
 *    elk verzonnen voorbeeld heeft per definitie een lege bevindingenlijst, en
 *    dan is élke uitzondering "verlopen". Een controle die je niet kunt voeden,
 *    kun je niet ijken (QS8-115).
 */
export function meldingen({ ontbrekend, ongeschreven, onleesbaar }) {
  const uit = [];

  for (const f of ontbrekend) uit.push(`${f.pad}  —  ${f.reden}`);

  const bekend = new Set(GEEN_SCHRIJFPAD.map((r) => dodeSleutel(r.tabel, r.soort, r.kolom)));
  for (const o of ongeschreven) {
    for (const kolom of o.kolommen) {
      if (bekend.has(dodeSleutel(o.tabel, o.soort, kolom))) continue;
      uit.push(
        `\`${o.tabel}.${kolom}\` heeft een ${o.soort}-grant die niets gebruikt — zet het ` +
          'schrijfpad erbij, trek de grant in, of zet hem met een reden in `GEEN_SCHRIJFPAD`',
      );
    }
  }

  const gelezen = new Set(NIET_TE_LEZEN.map((r) => leesSleutel(r.pad, r.tabel)));
  for (const o of onleesbaar) {
    if (gelezen.has(leesSleutel(o.pad, o.tabel))) continue;
    uit.push(
      `${o.pad} schrijft naar \`${o.tabel}\` en ${o.reden} — ongemeten is niet groen; maak ` +
        'er een objectliteraal van of zet hem met een reden in `NIET_TE_LEZEN`',
    );
  }

  return uit;
}

/**
 * Uitzonderingen die geen bevinding meer zijn, en dus weg horen.
 *
 * ⚠️ **Een verlopen uitzondering is een leugen in een grendel**: hij zegt "dit is
 *    beoordeeld" over een toestand die niet meer bestaat, en hij dekt daarna de
 *    volgende bevinding op diezelfde plek stilletjes af. Dezelfde regel als bij
 *    `NOG_NIET_AANGESLOTEN` in `catalogus-controle.mjs`.
 */
export function verlopenRegels({ ongeschreven, onleesbaar }) {
  const dood = new Set();
  for (const o of ongeschreven) {
    for (const kolom of o.kolommen) dood.add(dodeSleutel(o.tabel, o.soort, kolom));
  }
  const paden = new Set(onleesbaar.map((o) => leesSleutel(o.pad, o.tabel)));

  return [
    ...GEEN_SCHRIJFPAD.filter((r) => !dood.has(dodeSleutel(r.tabel, r.soort, r.kolom))).map(
      (r) =>
        `\`${r.tabel}.${r.kolom}\` (${r.soort}) staat in \`GEEN_SCHRIJFPAD\` maar wórdt ` +
        'geschreven — haal de regel weg',
    ),
    ...NIET_TE_LEZEN.filter((r) => !paden.has(leesSleutel(r.pad, r.tabel))).map(
      (r) =>
        `${r.pad} → \`${r.tabel}\` staat in \`NIET_TE_LEZEN\` maar is gewoon te lezen — ` +
        'haal de regel weg',
    ),
  ];
}

function hoofd() {
  const db = process.env.DB ?? 'goalbuddies_rls';
  const vraag = (sql) => {
    const args = ['--quiet', '--no-psqlrc', '-At', '-d', db, '-c', sql];
    if (process.env.PGHOST) args.unshift('-h', process.env.PGHOST);
    return execFileSync('psql', args, { encoding: 'utf8' });
  };

  let rechten;
  let schrijfrechten;
  try {
    rechten = ontleedRechten(vraag(VRAAG));
    schrijfrechten = ontleedSchrijfrechten(vraag(SCHRIJFVRAAG));
  } catch (fout) {
    // ⚠️ **`OVERGESLAGEN` én exitcode 1, en dat is met opzet allebei.** De poort
    //    herkent de overslag aan deze regel; wie alleen naar de exitcode kijkt,
    //    ziet geen nul en telt hem dus niet als bewijs. Zie de uitleg boven
    //    `beoordeel()` in `poort.mjs`: een controle die zich overslaat en
    //    daarna 0 teruggeeft, is voor de helft van zijn lezers groen.
    console.error(
      '⚠ kolomrechten-controle: OVERGESLAGEN — geen database om de grants uit te lezen.\n\n' +
        'Deze controle leest `information_schema.column_privileges` en niet de\n' +
        'migratiebestanden. Start de lokale stack met `npm run rls:stack`.\n\n' +
        `psql zei: ${fout instanceof Error ? fout.message.split('\n')[0] : String(fout)}`,
    );
    return 1;
  }

  const paden = ['src', 'app'].flatMap((m) => bestanden(join(WORTEL, m)));
  const lees = (pad) => readFileSync(pad, 'utf8');

  const selecties = paden.flatMap((pad) => selectiesIn(relative(WORTEL, pad), lees(pad)));
  const leesfouten = beoordeel(selecties, rechten);

  const acties = schrijfacties(paden, lees);
  const oordeel = beoordeelSchrijven({ acties, rechten: schrijfrechten });
  const schrijffouten = [...meldingen(oordeel), ...verlopenRegels(oordeel)];

  if (leesfouten.length > 0) {
    console.error(`✗ ${leesfouten.length} plek(ken) vragen kolommen terug die niet gelezen mogen worden:\n`);
    for (const f of leesfouten) console.error(`    ${f.pad}  —  ${f.reden}`);
    console.error(
      '\nPostgREST geeft hier 42501 en niet stilzwijgend minder kolommen. Vraag alleen\n' +
        'terug wat je mag lezen, en lees de rest desnoods via een view die met de rechten\n' +
        'van zijn eigenaar draait (zoals `mijn_profiel`).',
    );
  }

  if (schrijffouten.length > 0) {
    console.error(`\n✗ ${schrijffouten.length} bevinding(en) op de schrijfkant:\n`);
    for (const regel of schrijffouten) console.error(`    ✗ ${regel}`);
    console.error(
      '\nEen kolom die de client meestuurt zonder INSERT- of UPDATE-recht geeft 42501 op\n' +
        'de héle rij, ook als de rest van de kolommen wel mag. Zie migratie 0140.',
    );
  }

  if (leesfouten.length > 0 || schrijffouten.length > 0) return 1;

  console.log(
    `kolomrechten-controle: ${selecties.length} selecties en ${acties.length} schrijfacties, ` +
      'allemaal binnen de rechten.',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
