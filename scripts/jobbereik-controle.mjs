#!/usr/bin/env node
/**
 * jobbereik-controle — een testbestand roept een globale job nooit zonder zijn
 * grens aan (QS8-577).
 *
 * ⚠️⚠️ **Waarom dit een mechanisme is en geen veegbeurt.** De dossierrij van
 *    08-09-2026 in `docs/ENGINEER-REVIEW.md` schreef zijn eigen voorwaarde op:
 *    *"wordt zwaarder als er een derde bestand bijkomt dat een globale job
 *    aanroept — er is geen controle die dat meldt."* 📏 Dertien dagen later
 *    waren het er **vijf**, en niets was er rood van geworden. QS8-339 en
 *    QS8-348 ruimden allebei de instanties op en lieten het mechanisme staan;
 *    CLAUDE.md noemt precies die vorm: *een reparatie die de instanties opruimt
 *    en het mechanisme laat staan, groeit terug.*
 *
 * ⚠️⚠️ **En de rij wees het verkeerde bestand aan.** Hij noemde
 *    `seizoensrecap-per-groep.test.ts`; 📏 dat bestand roept `maak_seizoensrecaps()`
 *    vandaag juist alléén nog mét zijn grens aan. De instantie was opgelost, de
 *    klasse niet, en de rij bleef staan met een voorbeeld dat niet meer bestond.
 *
 * ## Wat een "globale job" is — gemeten en niet opgesomd
 *
 * Een functie in `public` die alle drie deze dingen doet:
 *
 *   1. een parameter `<naam> uuid DEFAULT NULL` of `<naam> uuid[] DEFAULT NULL`
 *      dragen — de grens;
 *   2. **zónder enig argument** aanroepbaar zijn (`pronargs = pronargdefaults`);
 *   3. **niet** door `authenticated` uitgevoerd mogen worden.
 *
 * `NULL` betekent bij alle vijf *"alles"* — de `is null`-tak staat in hun
 * `pg_get_functiondef()`. Een aanroep zonder die grens loopt dus over élke rij
 * in de database, ook die van een andere suite-run.
 *
 * ⚠️⚠️ **Eis 3 is niet cosmetisch.** 📏 Zonder die clausule geeft de vraag er
 *    **zeven** in plaats van vijf: `weekpas_standen(p_goal_ids uuid[] DEFAULT
 *    NULL)` en `openstaande_beoordelingen(p_na_id uuid DEFAULT NULL)` dragen de
 *    vorm en zijn géén job — ze filteren op `auth.uid()`, dus `NULL` betekent
 *    daar *"al mijn eigen rijen"*. De controle meldt er dan **10** aanroepen die
 *    niets mis hebben. Een controle op de handtekening alléén — wat
 *    acceptatiecriterium 2 letterlijk vroeg — had die tien gemeld.
 *
 * ⚠️⚠️ **En eis 2 is er om de spiegelzijde.** 📏 Zonder die clausule komen
 *    `plaats_systeembericht` en `plaats_systeembericht_in_doelgroepen` erbij, op
 *    `p_subject_id` en `p_actor_id`. Dat zijn geen grenzen maar optionele
 *    velden ín een bericht; hun functies vrágen verplichte argumenten en zijn
 *    dus nooit "bloot" aan te roepen. **Aanroepbaar zonder enig argument** is
 *    precies wat een job een job maakt: je kúnt hem kaal draaien, en kaal
 *    betekent alles.
 *
 * ⚠️ **Wat eis 3 daarmee níet toetst:** of een functie die `authenticated` wél
 *    mag draaien echt op `auth.uid()` filtert. Zou er zo eentje zonder die
 *    filter bestaan, dan is dat een veel zwaarder gat dan kruisbesmetting tussen
 *    twee testruns — en dat is het terrein van `definer_bewaking()` en
 *    `definers:controle`, niet van deze.
 *
 * 📏 **Wat er vandaag uit komt (21-09-2026):** `maak_seizoensrecaps`,
 *    `slaap_stille_groepen`, `keur_vastgelopen_goedkeuringen_goed`,
 *    `herstel_weekdoelstatus` en `weekdoelstatus_afwijkingen`. Die laatste twee
 *    zaten er niet in toen deze controle geschreven werd — hun grens is een
 *    kale `uuid` en geen `uuid[]` — en het is uitgerekend
 *    `herstel_weekdoelstatus()` waar de kop van `tests/rls/nevenschade.test.ts`
 *    mee begint: *"raakte 4 rijen aan … die vier rijen waren van een ánder
 *    bestand"*. Al hun aanroepen zijn vandaag gescopeerd; er was geen instantie,
 *    en er was ook geen grendel die een terugval zou melden.
 *
 * ## Wat hij in de bron herkent
 *
 * Twee vormen, en verder niets:
 *
 *   - **`.rpc('<naam>', { … })`** — dan draagt de aanroep zijn grens als de
 *     argumenten de grensnaam met een `:` erachter noemen;
 *   - **`<naam>( … )` in SQL** — dan draagt hij zijn grens als er minstens
 *     zoveel argumenten op het hoogste niveau staan als de grens posities ver
 *     zit, of als de grensnaam met `=>` genoemd wordt.
 *
 * ⚠️ Elk ánder voorkomen van de naam is een **vermelding** en wordt niet
 *    beoordeeld: `where proname = 'maak_seizoensrecaps'` in een zelftoets, of
 *    de naam in een assertie-boodschap. De toets biedt hem die vormen apart aan,
 *    want een controle die alles meldt, leer je te negeren.
 *
 * ⚠️ **Een expliciete `null` is geen grens.** 📏 Alle vijf de lichamen doen
 *    `p_x is null or …`, dus `{ p_group_ids: null }` is bit voor bit gelijk aan
 *    hem weglaten — en het is de goedkoopste manier om deze controle het zwijgen
 *    op te leggen zonder iets op te lossen. Een lege `[]` mag wél door: die
 *    raakt niets.
 *
 * ⚠️ **Wat hij niet ziet:** een grens die pas binnen een `${…}` ontstaat, en een
 *    aanroep die via een variabele loopt (`const job = 'maak_seizoensrecaps';
 *    db.rpc(job, …)`). De vorm is het signaal, niet het bewijs — zelfde grens
 *    als in `tellerbereik-controle.mjs`, en ze staat hier opgeschreven in plaats
 *    van weggelaten.
 *
 * ⚠️⚠️ **Twee blinde vlekken zijn na de security-review gemeten en gedicht, en
 *    ze staan hier omdat ze de klasse laten zien.** De controle was er geen van
 *    beide door een ontbrekende regel; hij was het door een detail dat je alleen
 *    vindt door hem **elk bestand los te voeren**:
 *
 *      📏 **22 van de 366 testbestanden** waren vanaf een bepaalde regel dood
 *      voor deze controle, waaronder tien in `tests/rls/`. Oorzaak: een
 *      regex-literal als `/'/g` draagt een ongepaard aanhalingsteken, en de
 *      toestandsmachine liep daarna de rest van het bestand uit de pas. De
 *      regelgrens in `tekstposities()` herstelt dat.
 *
 *      📏 Een **meerregelige `.rpc(`** — de opmaak die prettier maakt zodra de
 *      regel te lang wordt — was onzichtbaar vanaf zes spaties inspringing,
 *      want de herkenning keek twaalf tekens terug. Die vorm staat drie keer in
 *      deze testboom en één keer in `supabase/functions/rollover/index.ts`.
 *
 *    **Een detector die je alleen op de bestaande gevallen meet, meet dat de
 *    bestaande gevallen bestaan.** De toets biedt beide vormen nu apart aan.
 *
 * ⚠️ **Hij meldt de aanroep en niet het regelnummer.** `zonderCommentaar()`
 *    vervangt een blok door één spatie, dus regelnummers schuiven; een eigen,
 *    regelbehoudende knip zou een tweede knip zijn en dat is precies wat
 *    QS8-446 wegnam. De aanroeptekst is bovendien de sleutel van het register,
 *    en een regelnummer zou daar meedrijven met elke ingevoegde regel.
 *
 * ⚠️ **Geëxporteerd én los te voeden**, want een controle die je niet kunt
 *    voeden, kun je niet ijken. `tests/scripts/jobbereik-controle.test.ts` biedt
 *    hem elke vorm apart aan — die hij moet vinden én die hij met rust moet
 *    laten.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { psqlArgumenten, verbindingsmelding } from './psql.mjs';
import { zonderCommentaar } from './zonder-commentaar.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAP = 'tests';

/**
 * De aanroepen die met opzet geen grens dragen, met de reden per stuk.
 *
 * ⚠️ **Op de aanroep en niet op het bestand.** Een uitzondering per bestand zou
 *    ook de aanroep vrijstellen die er morgen bijkomt. Zelfde overweging als in
 *    `tellerbereik-controle.mjs` en `gedeelde-identiteit-controle.mjs`, en om
 *    dezelfde reden.
 *
 * ⚠️ Een reden en geen vinkje. Wie hier een rij neerzet zonder op te schrijven
 *    waaróm die aanroep zijn grens mist, heeft de controle beantwoord in plaats
 *    van de vraag.
 *
 * ⚠️⚠️ **En een reden die niet klopt is duurder dan geen reden.** Hier stond
 *    eerst bij drie van de vier rijen dat hun ijking zou vervallen als je ze
 *    begrensde. 📏 Nagemeten in `pg_get_functiondef()`: de bereikclausule is bij
 *    alle drie een **pure rijfilter** (`p_x is null or … = any (p_x)`) vóór de
 *    rest van het lichaam, dus voor een rij die in de array staat is het gedrag
 *    bit voor bit gelijk aan NULL — en de mutatie die hun eigen grendel
 *    weghaalt, had ze dus gewoon rood gemaakt. De échte reden staat er nu, en
 *    die is een andere. CLAUDE.md: *een afwijking die je onderbouwt is duurder
 *    dan een die je vergeet.*
 *
 * ⚠️ **Wat deze vier rijen kosten staat in `docs/ENGINEER-REVIEW.md`**, in de
 *    rij van 21-09-2026 over de drie aanroepen die de NULL-tak open houden. Ze
 *    zijn geen nul: bij twee gelijktijdige runs raken ze de rijen van de buren.
 */
/** @type {Record<string, string>} */
export const ZONDER_GRENS = {
  "tests/rls/nevenschade.test.ts: .rpc('slaap_stille_groepen', { p_dagen: 30 })":
    'De NULL-tak, en dit is de enige plek waar hij nog draait. 📏 De rollover ' +
    'roept alle drie de jobs zo aan (`supabase/functions/rollover/index.ts` ' +
    'regel 456, 486 en 587): zonder grens. Scoop je deze drie ook, dan toetst ' +
    'niets meer dat "geen grens" écht "alles" betekent — en dat is de enige ' +
    'vorm die in productie draait.',
  "tests/rls/nevenschade.test.ts: .rpc('keur_vastgelopen_goedkeuringen_goed', { p_termijn_dagen: 7, })":
    'Idem, de NULL-tak van de tweede job.',
  "tests/rls/nevenschade.test.ts: .rpc('maak_seizoensrecaps', { p_op: '2026-11-15T02:30:00Z', })":
    'Idem, de NULL-tak van de derde job. ⚠️ Hier komt er één ding bij: de kop ' +
    'van die toets zegt *niet "hij doet nooit iets" maar "hij doet niets voor ' +
    'een groep waar de aanroeper niet op wees"*. De vreemde groep noemen zou ' +
    'die bewering omdraaien.',
  "tests/rls/seizoensrecap.test.ts: .rpc('maak_seizoensrecaps', { p_op: EERSTE_DAG_Q4 })":
    'Deze aanroep draait niet: hij komt van `alice.db` — een gewone ingelogde ' +
    'gebruiker — en de toets eist juist dat hij een fout terugkrijgt. Een grens ' +
    'meegeven zou suggereren dat er iets te begrenzen viel.',
};


/**
 * De globale jobs, uit de catalogus — naam, grensparameter en zijn positie.
 *
 * ⚠️ `prokind = 'f'` sluit procedures en aggregaten uit; die worden niet zo
 *    aangeroepen. De `like` op `pg_get_function_arguments()` is wat *optioneel
 *    én standaard NULL* afdwingt: een verplichte `uuid[]` is geen valkuil, want
 *    die kun je niet vergeten.
 */
export const VRAAG = `
select p.proname, a.naam, a.pos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral (
    select nm as naam, i as pos
      from unnest(p.proargnames, p.proargtypes::oid[]) with ordinality as u(nm, t, i)
     where t in ('uuid[]'::regtype, 'uuid'::regtype)
       and (pg_get_function_arguments(p.oid) like '%' || nm || ' uuid DEFAULT NULL%'
         or pg_get_function_arguments(p.oid) like '%' || nm || ' uuid[] DEFAULT NULL%')
  ) a
 where n.nspname = 'public'
   and p.prokind = 'f'
   and p.pronargs = p.pronargdefaults
   and not has_function_privilege('authenticated', p.oid, 'execute')
 order by 1, 3;
`;

/** De regels van `VRAAG` als bruikbare rijen. */
export function ontleed(uitvoer) {
  return uitvoer
    .split('\n')
    .map((regel) => regel.trim())
    .filter((regel) => regel.length > 0)
    .map((regel) => {
      const [naam, grens, pos] = regel.split('|');
      return { naam, grens, positie: Number(pos) };
    });
}

/**
 * Het argumentendeel van de haakjes die op `begin` openen, of `null`.
 *
 * ⚠️ Hij telt haakjes, blokhaken én accolades mee en slaat tekst tussen enkele
 *    aanhalingstekens over — anders sluit een `')'` in een SQL-literal de
 *    aanroep te vroeg af, en dat is precies de vorm die in
 *    `seizoensrecap-per-groep.test.ts` staat.
 */
export function haakjesInhoud(bron, begin) {
  if (bron[begin] !== '(') return null;
  let diepte = 0;
  let inTekst = false;

  for (let i = begin; i < bron.length; i += 1) {
    const teken = bron[i];
    if (inTekst) {
      if (teken === "'") inTekst = false;
      continue;
    }
    if (teken === "'") inTekst = true;
    else if (teken === '(' || teken === '[' || teken === '{') diepte += 1;
    else if (teken === ')' || teken === ']' || teken === '}') {
      diepte -= 1;
      if (diepte === 0) return bron.slice(begin + 1, i);
    }
  }
  return null;
}

/** De argumenten op het hoogste niveau, als losse stukken tekst. */
export function argumenten(inhoud) {
  const uit = [];
  let diepte = 0;
  let inTekst = false;
  let stuk = '';

  for (const teken of inhoud) {
    if (inTekst) {
      stuk += teken;
      if (teken === "'") inTekst = false;
      continue;
    }
    if (teken === "'") inTekst = true;
    else if (teken === '(' || teken === '[' || teken === '{') diepte += 1;
    else if (teken === ')' || teken === ']' || teken === '}') diepte -= 1;
    else if (teken === ',' && diepte === 0) {
      uit.push(stuk.trim());
      stuk = '';
      continue;
    }
    stuk += teken;
  }

  if (stuk.trim().length > 0) uit.push(stuk.trim());
  return uit;
}

/** De leden van het eerste object-literal in deze argumenten, of een lege lijst. */
export function objectleden(inhoud) {
  const open = inhoud.indexOf('{');
  if (open === -1) return [];
  const body = haakjesInhoud(inhoud.slice(open).replace('{', '('), 0);
  return body === null ? [] : argumenten(body);
}

/**
 * De waarde die deze aanroep aan de grens meegeeft, of `null` als hij hem niet
 * noemt.
 *
 * ⚠️⚠️ **Eén vraag en niet twee.** Hier stonden eerst een benoemde en een
 *    positionele toets naast elkaar, met een `||` ertussen — en dan overstemt de
 *    ene de andere. 📏 `maak_seizoensrecaps(p_op => now(), p_group_ids => null)`
 *    kwam er zo doorheen: de benoemde tak zag terecht een `null`, en de
 *    positionele tak zag "twee argumenten, dus begrensd". **Twee grendels op één
 *    vraag met een `or` ertussen zijn samen zwakker dan elk apart.**
 */
export function grensWaarde(stukken, job, vorm) {
  const kop = new RegExp(`^${job.grens}\\s*(?::|=>)\\s*`);
  const benoemd = stukken.find((stuk) => kop.test(stuk));
  if (benoemd !== undefined) return benoemd.replace(kop, '');
  if (vorm === 'sql') return stukken[job.positie - 1] ?? null;
  return null;
}

/**
 * Of deze waarde in werkelijkheid "geen grens" betekent.
 *
 * ⚠️⚠️ **`null` en `undefined` zijn allebei de omweg om de grens heen.** Alle
 *    vijf de lichamen doen `p_x is null or …`, en supabase-js stuurt zijn
 *    argumenten door `JSON.stringify()` — die laat een `undefined`-waarde
 *    vállen, dus PostgREST krijgt de parameter nooit en valt terug op
 *    `DEFAULT NULL`. Bit voor bit hetzelfde "alles". Een lege `[]` mag wél door:
 *    die raakt niets.
 *
 * ⚠️ **Hij zoekt het woord ergens in de waarde en niet alleen vooraan**, want
 *    `ids ?? undefined` is precies de vorm die je schrijft als de grens uit een
 *    optionele bron komt. Dat is met opzet de voorzichtige kant: een onterechte
 *    melding kost een registerrij met een reden, een gemiste aanroep kost stilte.
 */
export function isLeeg(waarde) {
  return waarde === null || /\b(null|undefined)\b/i.test(waarde);
}

/** Eén regel tekst van een aanroep, zodat hij als registersleutel dient. */
export function kort(tekst) {
  return tekst.replace(/\s+/g, ' ').trim();
}

/**
 * Welke posities in deze bron binnen een JS-tekenreeks (`'…'` of `"…"`) vallen.
 *
 * ⚠️⚠️ **Dit is de grendel die het verschil maakt tussen een aanroep en een
 *    boodschap.** 📏 Zonder hem meldde deze controle
 *    `tests/beloftes/recap-mislukking-verlaat-de-job.test.ts` twee keer, op
 *    `'geen enkele migratie definieert maak_seizoensrecaps(). …'` — een zin in
 *    een assertie, met haakjes erachter omdat je zo over een functie schrijft.
 *    Dat zijn precies de rijen waarvan een lezer leert de controle te negeren.
 *
 * ⚠️ **Een backtick-sjabloon telt niet als tekenreeks**, en dat is de hele
 *    reden dat dit een toestandsmachine is en geen regex. SQL leeft hier in
 *    sjabloonliteralen, en dáárbinnen staan weer enkele aanhalingstekens
 *    (`'${'$'}{datum}'::timestamptz`). Wie `'` blind als opener leest, verklaart
 *    de halve SQL tot tekst en mist elke aanroep erna.
 *
 * ⚠️ Wat hij niet uit elkaar houdt: code binnen `${'$'}{…}` in een sjabloon. Die
 *    telt als sjabloon en wordt dus beoordeeld — de voorzichtige kant, want een
 *    aanroep daar is een echte aanroep.
 */
export function tekstposities(bron) {
  const uit = new Uint8Array(bron.length);
  let staat = 'code';

  for (let i = 0; i < bron.length; i += 1) {
    const teken = bron[i];
    // ⚠️⚠️ **Een `'` of `"` sluit aan het einde van zijn regel, want zo'n
    //    tekenreeks kán in JS niet over een regeleinde lopen.** Dat is geen
    //    netheid maar de herstelpoort: een regex-literal als `/'/g` draagt een
    //    ongepaard aanhalingsteken, en zonder deze regel loopt de machine vanaf
    //    daar de rest van het bestand uit de pas. 📏 Gemeten: **22** van de 366
    //    testbestanden waren zo blind, waaronder tien in `tests/rls/`. Een
    //    sjabloon mág wél over regels lopen en wordt daarom niet gesloten.
    if (teken === '\n' && (staat === 'enkel' || staat === 'dubbel')) {
      staat = 'code';
      continue;
    }
    if (staat !== 'code' && teken === '\\') {
      i += 1;
      if (i < bron.length && staat !== 'sjabloon') uit[i] = 1;
      continue;
    }
    if (staat === 'code') {
      if (teken === "'") staat = 'enkel';
      else if (teken === '"') staat = 'dubbel';
      else if (teken === '`') staat = 'sjabloon';
      continue;
    }
    if (staat === 'enkel' && teken === "'") staat = 'code';
    else if (staat === 'dubbel' && teken === '"') staat = 'code';
    else if (staat === 'sjabloon' && teken === '`') staat = 'code';
    else if (staat !== 'sjabloon') uit[i] = 1;
  }

  return uit;
}

/**
 * Elk voorkomen van `naam` in deze bron, ingedeeld naar vorm.
 *
 * Geeft `{ vorm, tekst, grens }` terug: `vorm` is `'rpc'`, `'sql'` of
 * `'vermelding'`, en `grens` zegt of de aanroep zijn grens meegeeft.
 */
export function voorkomens(bron, job) {
  const schoon = zonderCommentaar(bron);
  const inTekst = tekstposities(schoon);
  const uit = [];
  const naam = new RegExp(`\\b${job.naam}\\b`, 'g');

  for (const treffer of schoon.matchAll(naam)) {
    const begin = treffer.index ?? 0;
    const na = begin + job.naam.length;
    const rest = schoon.slice(na);
    const vervolg = /^\s*\(/.exec(rest);
    const open = schoon.lastIndexOf('(', begin);
    // ⚠️ **Terugzoeken naar het haakje en niet een venster van twaalf tekens.**
    //    📏 Die eerdere vorm miste elke `.rpc(` die prettier over meer regels
    //    zet zodra de regel te lang wordt — bij zes spaties inspringing was de
    //    punt al buiten beeld, en die opmaak staat drie keer in deze testboom.
    const rpcVorm =
      open !== -1 &&
      /\.rpc\s*$/.test(schoon.slice(Math.max(0, open - 8), open)) &&
      /^\s*['"]$/.test(schoon.slice(open + 1, begin)) &&
      /^['"]/.test(rest);

    if (rpcVorm) {
      // ⚠️⚠️ **De toets staat op het haakje van `.rpc(` en niet op de naam.** De
      //    naam zít bij deze vorm altijd in een tekenreeks — dat is wat PostgREST
      //    vraagt. Wat een échte aanroep onderscheidt van een aanroep die als
      //    voorbeeld in een tekenreeks staat, is of de **aanroepsyntaxis** zelf
      //    code is. 📏 Zonder deze regel meldde de controle zijn eigen
      //    toetsbestand twaalf keer.
      if (inTekst[open] === 1) {
        uit.push({ vorm: 'vermelding', tekst: kort(job.naam), grens: true });
        continue;
      }
      const inhoud = haakjesInhoud(schoon, open);
      if (inhoud === null) continue;
      const draagt = !isLeeg(grensWaarde(objectleden(inhoud), job, 'rpc'));
      uit.push({ vorm: 'rpc', tekst: kort(`.rpc(${inhoud})`), grens: draagt });
      continue;
    }

    if (vervolg !== null && inTekst[begin] !== 1) {
      const open = na + vervolg[0].length - 1;
      const inhoud = haakjesInhoud(schoon, open);
      if (inhoud === null) continue;
      uit.push({
        vorm: 'sql',
        tekst: kort(`${job.naam}(${inhoud})`),
        grens: !isLeeg(grensWaarde(argumenten(inhoud), job, 'sql')),
      });
      continue;
    }

    uit.push({ vorm: 'vermelding', tekst: kort(job.naam), grens: true });
  }

  return uit;
}

/** Wat er mis is aan deze bron, als leesbare regels. */
export function klachten(bron, pad, jobs, register = ZONDER_GRENS) {
  return jobs.flatMap((job) =>
    voorkomens(bron, job)
      .filter((v) => v.vorm !== 'vermelding' && !v.grens)
      .map((v) => `${pad}: ${v.tekst}`)
      .filter((regel) => register[regel] === undefined),
  );
}

/** De registerrijen die naar een aanroep wijzen die er niet meer is. */
export function verweesd(gevonden, register = ZONDER_GRENS) {
  return Object.keys(register)
    .filter((sleutel) => !gevonden.includes(sleutel))
    .sort();
}

function bestanden(map) {
  const uit = [];
  for (const naam of readdirSync(join(WORTEL, map), { withFileTypes: true })) {
    const kind = join(map, naam.name);
    if (naam.isDirectory()) uit.push(...bestanden(kind));
    else if (naam.name.endsWith('.ts')) uit.push(kind);
  }
  return uit;
}

/** Elke ongescopeerde aanroep, register of niet — de bron voor beide oordelen. */
export function alleOngescopeerd(paden, jobs) {
  return paden.flatMap((pad) =>
    jobs.flatMap((job) =>
      voorkomens(readFileSync(join(WORTEL, pad), 'utf8'), job)
        .filter((v) => v.vorm !== 'vermelding' && !v.grens)
        .map((v) => `${relative('.', pad)}: ${v.tekst}`),
    ),
  );
}

/** De melding als de catalogus geen enkele job teruggeeft. */
function meldGeenJobs() {
  console.error(
    'jobbereik-controle: geen enkele globale job gevonden.\n\n' +
      '  Dat is geen groen: de vraag vindt normaal `maak_seizoensrecaps`,\n' +
      '  `slaap_stille_groepen` en `keur_vastgelopen_goedkeuringen_goed`. Nul\n' +
      '  betekent dat het schema niet is opgebouwd of dat de vorm veranderd is.',
  );
}

/** De melding bij een aanroep die zijn grens niet noemt. */
function meldOngescopeerd(gevonden) {
  console.error('jobbereik-controle: een globale job draait zonder grens en raakt andere suites.\n');
  for (const regel of gevonden) console.error(`  ${regel}`);
  console.error(
    "\n  Geef de job de id's van je eigen fixture mee — `p_group_ids`,\n" +
      '  `p_owner_ids`, `p_goal_id`. Zonder grens betekent NULL "alles", ook de\n' +
      '  rijen van een suite die er naast draait.\n\n' +
      '  ⚠️ De parameternaam alléén is niet genoeg: `null` en `undefined` zijn\n' +
      '     precies dezelfde "alles", en deze controle telt ze ook zo. Een lege\n' +
      '     array mag wél — die raakt niets.\n\n' +
      '  Toetst de aanroep juist het bereik, zet hem dan met zijn reden in\n' +
      '  ZONDER_GRENS in dit script.',
  );
}

/** De melding bij een registerrij die nergens meer op slaat. */
function meldWees(wees) {
  console.error('jobbereik-controle: een registerrij wijst naar een aanroep die er niet meer is.\n');
  for (const regel of wees) console.error(`  ${regel}`);
  console.error(
    '\n  Een reden voor iets dat er niet meer staat, dekt ooit stilletjes een\n' +
      '  nieuwe aanroep af. Haal de rij weg.',
  );
}

function hoofd() {
  let jobs;
  try {
    jobs = ontleed(execFileSync('psql', psqlArgumenten(VRAAG), { encoding: 'utf8' }));
  } catch (fout) {
    console.error(
      verbindingsmelding({
        naam: 'jobbereik-controle',
        leest: 'Deze controle leest `pg_proc` en de uitvoerrechten, niet de migratiebestanden.',
        melding: fout instanceof Error ? fout.message : String(fout),
      }),
    );
    return 1;
  }

  if (jobs.length === 0) {
    meldGeenJobs();
    return 1;
  }

  const paden = bestanden(MAP);
  const ongescopeerd = alleOngescopeerd(paden, jobs);
  const gevonden = ongescopeerd.filter((regel) => ZONDER_GRENS[regel] === undefined);

  if (gevonden.length > 0) {
    meldOngescopeerd(gevonden);
    return 1;
  }

  const wees = verweesd(ongescopeerd);
  if (wees.length > 0) {
    meldWees(wees);
    return 1;
  }

  const rijen = Object.keys(ZONDER_GRENS).length;
  console.log(
    `jobbereik-controle: elke aanroep van een globale job noemt zijn grens ` +
      `(${jobs.length} jobs, ${paden.length} bestanden${rijen > 0 ? `, ${rijen} met een reden` : ''}).`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
