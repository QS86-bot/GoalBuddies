import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { psqlArgumenten, verbindingsmelding } from './psql.mjs';
import { zonderCommentaar } from './zonder-commentaar.mjs';

/**
 * Een `DEFAULT NULL`-argument is getypt of niemand stuurt er `null` heen — QS8-594.
 *
 * ⚠️⚠️ **De belofte is niet "elk `DEFAULT NULL` staat in de correctielaag".** Die
 *    laag mag geen inventaris worden; de dossierrij van 21-09 zegt met zoveel
 *    woorden dat *"een correctie zonder aanleiding precies is wat dat bestand
 *    niet mag worden"*. De belofte is de regel eronder:
 *
 *    > Een argument met `DEFAULT NULL` is **óf** als `| null` getypt, **óf** geen
 *    > enkele aanroepplek stuurt er `null` heen.
 *
 *    De eerste helft is een typevraag, de tweede een vraag over de broncode, en
 *    allebei zijn ze te meten. Wat een mens hier hoort te beslissen is alleen
 *    wélke van de twee waar hoort te zijn.
 *
 * 📏 **Gemeten op 24-09-2026 tegen een lokaal schema op `0298`:** 24 argumenten
 *    met `DEFAULT NULL` over 14 functies, waarvan 8 als `| null` getypt in de
 *    correctielaag en **16** niet. Alle zestien aanroepplekken gebruiken
 *    dezelfde vorm — `...(x === undefined ? {} : { p_x: x })` — en sturen dus
 *    géén `null`. Het register hieronder draagt die zestien, elk met de plek
 *    erbij, en dit script toetst de bewering na in plaats van haar te geloven.
 *
 * ⚠️⚠️ **Het waren er twaalf in de meting van het issue, en het verschil is
 *    leerzaam.** 📏 Een **naamgerichte** zoektocht door de correctielaag — *komt
 *    `p_na_at` er ergens in voor met `| null`?* — geeft 12; een
 *    **functiegerichte** geeft 14 (op `0294`). Het verschil zijn
 *    `openstaande_beoordelingen.p_na_at` en `.p_na_id`, wier namen botsen met
 *    die van `weekafsluiting_reacties` — die wél gecorrigeerd is. Dezelfde
 *    klasse als `GEDEELDE_WAARDEN` in `dode-keten-controle.mjs`: een zoeker die
 *    een naam vindt zonder te weten bij welke functie hij hoort. `argsBlokIn()`
 *    en `argsBlokInCorrecties()` knippen daarom eerst de functie uit.
 *
 * ⚠️ **De zoektocht naar aanroepplekken is bestandsgericht en niet
 *    aanroepgericht, en dat is een gemeten keuze.** 📏 Vijf van de tien
 *    aanroepers bouwen hun argumentobject als een losse `const argumenten = …`
 *    en geven dat door; een regex die alleen binnen `rpc('naam', { … })` kijkt,
 *    ziet die vijf niet. Dat is de vorm van QS8-414 — *een regel die je met de
 *    hand handhaaft, handhaaf je op de vorm die je toevallig intypt.* Grover
 *    zoeken meldt liever één keer te veel dan één keer te weinig.
 *
 * IJKING — met de hand, 24-09-2026, tegen een lokaal schema op `0298`. Eén
 * mutatie per grendel; de stand ervóór is elke keer gemeten (de controle groen
 * op 24 argumenten, `tests/scripts/defaultnull-controle.test.ts` op 25 groen):
 *
 *   A  `chat.ts` alsnog `p_before_at: cursor?.at ?? null` laten sturen
 *      -> 2 rood: *groepschat.p_before_at / .p_before_id — stuurt `null` …*
 *   B  de rij van `weekpas_standen` naar `src/modules/goals/stand.ts` wijzen
 *      -> 1 rood: *de rij noemt … en dat bestand noemt `weekpas_standen` niet meer*
 *   C  de rij van `verlaat_groep.p_nieuwe_beheerder` weghalen
 *      -> 1 rood: *niet getypt en staat nergens met een reden*
 *   D  diezelfde parameter alsnog in de correctielaag zetten
 *      -> 1 rood: *1 registerrij(en) dekken niets meer*
 *   E  de knip naamgericht maken in plaats van functiegericht
 *      -> 4 rood in de controle, én 2 rood in de test — waaronder de MUST-FIND
 *         die het verschil tussen twaalf en veertien draagt
 *
 * ⚠️⚠️ **Mutatie B was de eerste keer gróén, en dat is de reden dat een ijking
 *    geen formaliteit is.** 📏 `src/modules/goals/stand.ts` nóemt
 *    `weekpas_standen()` in een commentaarregel, en `toetsRij()` las toen de
 *    ruwe bron: een zin over een functie telde als aanroeper. Dezelfde fout die
 *    `schermingang:controle` ooit in zichzelf vond, waar de toelichting boven
 *    een knop als ingang telde. De knip staat er sindsdien ook in die toets.
 */

/** Waar een aanroeper kan staan. */
const BRONMAPPEN = ['src', 'app', 'supabase/functions'];

/**
 * De argumenten met `DEFAULT NULL`, per functie die `authenticated` mag draaien.
 *
 * ⚠️ `has_function_privilege` en niet de hele `public`-namespace: een functie die
 *    geen enkele client mag aanroepen, heeft geen clienttype en dus geen
 *    typebelofte. Zelfde grens als in `functiegrants.test.ts`.
 */
const VRAAG = `
  with f as (
    select p.oid, p.proname, pg_get_function_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
  select proname || '.' || split_part(trim(a), ' ', 1)
    from f, unnest(string_to_array(args, ', ')) as a
   where trim(a) ilike '%default null%'
   order by 1
`;

/**
 * De zestien die vandaag niet getypt zijn, met de plek en de vorm erbij.
 *
 * ⚠️⚠️ **Dit register is een bewéring en geen vrijstelling.** Elke rij zegt
 *    *"dit bestand roept die functie aan en stuurt er geen `null` heen"*, en
 *    `beoordeel()` toetst allebei die helften. Wordt een van de twee onwaar —
 *    het bestand roept de functie niet meer aan, of er komt een `p_x: null` in
 *    te staan — dan wordt deze controle rood.
 *
 *    Dat onderscheid is het hele punt. Een register van zestien uitzonderingen
 *    die niemand natoetst, is de inventaris waarvan dit project weet wat ermee
 *    gebeurt: je leert hem overslaan. Een register van zestien beweringen die
 *    elke run gemeten worden, is een grendel.
 *
 * ⚠️ **De vorm is overal dezelfde, en dat is geen toeval maar een regel die er
 *    al stond.** `exactOptionalPropertyTypes` staat aan, dus een expliciete
 *    `undefined` is iets anders dan een weggelaten veld — en PostgREST maakt van
 *    die `undefined` juist `null`. `src/modules/notifications/tokens.ts` legt in
 *    zijn kop uit dat `?? null` daar ooit stond en bewust vervangen is;
 *    `src/modules/buddies/api.ts` schrijft het bij `verlaat_groep()` woordelijk
 *    op. Deze controle houdt dus iets vast dat de codebase zelf al besloten had.
 *
 * @type {Record<string, { bestand: string, reden: string }>}
 */
export const GEEN_AANROEPER_STUURT_NULL = {
  'beslis_deadline_verzoek.p_note': {
    bestand: 'src/modules/goals/deadline.ts',
    reden:
      'De opmerking wordt eerst gestreken (`schoneVrijeTekst`) en daarna weggelaten als ' +
      'hij leeg is: `...(schoon === \'\' ? {} : { p_note: schoon })`. Een opmerking van ' +
      'louter onzichtbare tekens is ná het strijken leeg en hoort dan wég te blijven, ' +
      'niet als lege string of als `null` mee te gaan.',
  },
  'dien_opnieuw_in.p_note': {
    bestand: 'src/modules/completions/approvals.ts',
    reden:
      'Zelfde vorm als bij `beslis_deadline_verzoek`: `schoneVrijeTekst()` eerst, en daarna de sleutel ' +
      'weglaten als er niets overblijft — `...(schoon === \'\' ? {} : { p_note: schoon })`.',
  },
  'dien_opnieuw_in.p_attachment_url': {
    bestand: 'src/modules/completions/approvals.ts',
    reden:
      'Het bijlagepad wordt getrimd en weggelaten als het leeg is: ' +
      '`...(pad === \'\' ? {} : { p_attachment_url: pad })`. Een lege string is hier iets anders dan geen bijlage.',
  },
  'groepschat.p_before_at': {
    bestand: 'src/modules/buddies/chat.ts',
    reden:
      'Cursor: beide helften of geen van beide, en zonder cursor gaan ze er hélemaal af — ' +
      '`...(cursor === null ? {} : { p_before_at: cursor.at, p_before_id: cursor.id })`.',
  },
  'groepschat.p_before_id': {
    bestand: 'src/modules/buddies/chat.ts',
    reden:
      'De tweede helft van die cursor, uit dezelfde tak: er is geen pad waarin er één van de twee ' +
      'meegaat en de andere niet. Migratie 0024 behandelt een half ingevulde cursor als "geen cursor", ' +
      'maar dat is de tweede grendel — deze vorm is de eerste.',
  },
  'group_overview.p_na_joined_at': {
    bestand: 'src/modules/buddies/api.ts',
    reden:
      'Cursor in twee takken: zonder cursor staan beide parameters niet in het argumentobject. ' +
      '⚠️ Dit is het voorbeeld dat de dossierrij van 21-09 zelf noemde als het geval dat wél ' +
      '`DEFAULT NULL` draagt en toch niet in de laag staat — *"het verschil is alleen dat vandaag ' +
      'niemand er `null` heen stuurt"*. Deze controle is wat dat "vandaag" waar houdt.',
  },
  'group_overview.p_na_user_id': {
    bestand: 'src/modules/buddies/api.ts',
    reden:
      'De tweede helft van die cursor, in diezelfde twee takken van `fetchGroepsoverzicht()`. ' +
      'Migratie 0152 vangt een half ingevulde cursor af; de vorm hier zorgt dat het geval niet ontstaat.',
  },
  'herstel_stuurloze_straf.p_getuige': {
    bestand: 'src/modules/commitments/api.ts',
    reden:
      'De kop zegt het zelf: een expliciete `undefined` zou door PostgREST `null` worden en de ' +
      'servertak `getuige_ontbreekt` raken in plaats van de default. Daarom ' +
      '`...(opties.getuige === undefined ? {} : { p_getuige: opties.getuige })`.',
  },
  'openstaande_beoordelingen.p_na_at': {
    bestand: 'src/modules/completions/approvals.ts',
    reden:
      'Cursor in twee takken, zonder cursor alleen `p_limit`. ⚠️ Deze twee ontbraken in de ' +
      'meting van het issue: 📏 een naamgerichte zoektocht vindt `p_na_at` in de correctierij ' +
      'van `weekafsluiting_reacties` en rekent hem daarmee als gedekt.',
  },
  'openstaande_beoordelingen.p_na_id': {
    bestand: 'src/modules/completions/approvals.ts',
    reden:
      'De tweede helft van die cursor in `fetchBeoordelingen()`, en met dezelfde naambotsing: 📏 ook ' +
      '`p_na_id` staat in de correctierij van `weekafsluiting_reacties` en werd daardoor als gedekt geteld.',
  },
  'openstaande_meldingen.p_na_at': {
    bestand: 'src/modules/buddies/veiligheid.ts',
    reden:
      'Cursor in twee takken (QS8-586, migratie 0296): zonder cursor alleen `p_limit`, met cursor beide ' +
      'helften. Bewust dezelfde vorm als `openstaande_beoordelingen`, want het is dezelfde belofte.',
  },
  'openstaande_meldingen.p_na_id': {
    bestand: 'src/modules/buddies/veiligheid.ts',
    reden:
      'De tweede helft van die cursor in `fetchOpenstaandeMeldingen()`: zonder cursor gaat alleen ' +
      '`p_limit` mee, met cursor gaan beide helften mee. Dezelfde vorm als `openstaande_beoordelingen`.',
  },
  'registreer_push_token.p_p256dh': {
    bestand: 'src/modules/notifications/tokens.ts',
    reden:
      'De twee websleutels gaan samen of niet: `gevonden.p256dh !== undefined && gevonden.auth !== undefined ? {…} : {}`. ' +
      '⚠️ Hier stond `?? null` bij allebei, en dat is bewust vervangen — de kop van dat bestand legt uit waarom.',
  },
  'registreer_push_token.p_auth': {
    bestand: 'src/modules/notifications/tokens.ts',
    reden:
      'De tweede websleutel uit diezelfde tak: `p256dh` en `auth` horen bij elkaar, dus ze gaan samen ' +
      'mee of geen van beide. Een halve sleutelset is voor web push nutteloos.',
  },
  'verlaat_groep.p_nieuwe_beheerder': {
    bestand: 'src/modules/buddies/api.ts',
    reden:
      'De kop zegt het woordelijk: *"De opvolger wordt weggelaten en niet op `undefined` gezet … ' +
      'de RPC heeft een default van `null` die je alleen krijgt door de sleutel niet mee te sturen."*',
  },
  'weekpas_standen.p_goal_ids': {
    bestand: 'src/modules/goals/weekpas.ts',
    reden:
      'Zonder doelen gaat het hele argumentobject leeg de deur uit: ' +
      '`goalIds === undefined ? {} : { p_goal_ids: [...goalIds] }`. Geen doelen meegeven betekent ' +
      '*alle doelen van de ingelogde gebruiker*, en dat is de bedoelde default.',
  },
};

/** De regels `functie.parameter` uit de psql-uitvoer. */
export function ontleed(uit) {
  return uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => /^[a-z0-9_]+\.[a-z0-9_]+$/.test(r));
}

/**
 * Het `Args`-blok van één functie uit de gegenereerde types.
 *
 * ⚠️ **Eerst de functie uitknippen, dan pas de parameter zoeken.** Zoeken op de
 *    parameternaam alleen telt `p_na_at` van de ene functie als gedekt omdat de
 *    ándere hem draagt; 📏 dat verschil is precies de twee die de meting van het
 *    issue miste.
 */
export function argsBlokIn(generatie, functie) {
  const m = new RegExp(`\\n      ${functie}: \\{\\n([\\s\\S]*?)\\n      \\}\\n`).exec(generatie);
  if (m === null) return '';

  const args = /Args:\s*(\{[\s\S]*?\})\s*\n\s*Returns/.exec(m[1]);
  return args === null ? '' : args[1];
}

/** Idem, maar uit de correctielaag: `MetArgs<'functie', { … }>`. */
export function argsBlokInCorrecties(correcties, functie) {
  const m = new RegExp(`MetArgs<\\s*'${functie}',\\s*(\\{[\\s\\S]*?\\})\\s*>`).exec(correcties);
  return m === null ? '' : m[1];
}

/** Draagt dit blok `| null` op deze parameter? */
export function isNullbaar(blok, parameter) {
  const m = new RegExp(`${parameter}\\??\\s*:\\s*([^;}\\n]+)`).exec(blok);
  return m !== null && m[1].includes('| null');
}

/** Staat deze parameter érgens als nullable — in de generatie of in de laag? */
export function getyptAlsNullbaar(generatie, correcties, sleutel) {
  const [functie, parameter] = sleutel.split('.');
  return (
    isNullbaar(argsBlokInCorrecties(correcties, functie), parameter) ||
    isNullbaar(argsBlokIn(generatie, functie), parameter)
  );
}

/**
 * Stuurt deze bron `null` of `undefined` naar deze parameter?
 *
 * ⚠️ **Door de knip**, en dat is hier geen formaliteit: `tokens.ts` legt in zijn
 *    kop uit dat er `?? null` stond en dat het bewust weg is. Zonder de knip
 *    wordt deze controle rood op zijn eigen documentatie — en dat is de klasse
 *    van QS8-568, waar een uitgeschakelde aanroep juist in het commentaar
 *    belandt.
 *
 * ⚠️ `undefined` telt mee. `exactOptionalPropertyTypes` houdt hem uit het type,
 *    maar PostgREST maakt er `null` van zodra hij tóch meegaat — dat is precies
 *    waarom de aanroepers de sleutel weglaten in plaats van hem leeg te zetten.
 */
export function stuurtNull(bron, parameter) {
  const schoon = zonderCommentaar(bron);
  const patroon = new RegExp(`['"]?${parameter}['"]?\\s*:\\s*([^,}\\n]+)`, 'g');

  for (const m of schoon.matchAll(patroon)) {
    if (/\b(null|undefined)\b/.test(m[1])) return true;
  }

  return false;
}

/** Alle bronbestanden waarin een aanroeper kan staan, zonder tests. */
export function bronnenIn(mappen = BRONMAPPEN, wortel = '.') {
  const uit = [];

  for (const map of mappen) {
    const pad = join(wortel, map);
    let inhoud;
    try {
      inhoud = readdirSync(pad);
    } catch {
      continue;
    }

    for (const naam of inhoud) {
      const kind = join(pad, naam);
      if (statSync(kind).isDirectory()) uit.push(...bronnenIn([naam], pad));
      else if (/\.tsx?$/.test(kind) && !kind.includes('.test.')) {
        uit.push({ pad: kind.replace(/^\.\//, ''), inhoud: readFileSync(kind, 'utf8') });
      }
    }
  }

  return uit;
}

/**
 * De drie manieren waarop dit stuk kan gaan, en alle drie zijn ze rood.
 *
 * 1. **ongedekt** — een `DEFAULT NULL`-argument dat niet getypt is en geen
 *    registerrij heeft. Dat is acceptatiecriterium 1 en 2.
 * 2. **gebroken** — een registerrij wiens bewering niet meer klopt: het bestand
 *    roept de functie niet meer aan, of er staat wél een `null` in. Dít is wat
 *    het register van een inventaris onderscheidt.
 * 3. **verouderd** — een rij voor een parameter die geen `DEFAULT NULL` meer
 *    heeft of intussen wél getypt is. Een reden voor iets dat er niet meer is,
 *    dekt ooit stilletjes iets nieuws met dezelfde naam.
 */
export function beoordeel({ argumenten, generatie, correcties, bronnen, register = GEEN_AANROEPER_STUURT_NULL }) {
  const ongetypt = argumenten.filter((a) => !getyptAlsNullbaar(generatie, correcties, a));

  return {
    ongedekt: ongetypt.filter((a) => !(a in register)),
    verouderd: Object.keys(register).filter((a) => !ongetypt.includes(a)).sort(),
    gebroken: ongetypt.filter((a) => a in register).flatMap((a) => toetsRij(a, register[a], bronnen)),
  };
}

/** Toetst de twee helften van één registerrij. Leeg = de bewering klopt nog. */
export function toetsRij(sleutel, rij, bronnen) {
  const [functie, parameter] = sleutel.split('.');

  // ⚠️⚠️ **Door de knip, en dat is bij het ijken gevonden.** Mutatie B — de rij
  //    naar een bestand wijzen dat de functie niet aanroept — bleef gróén, want
  //    `src/modules/goals/stand.ts` nóemt `weekpas_standen()` in een
  //    commentaarregel. Een zin over een functie is geen aanroeper; dat is
  //    dezelfde fout die `schermingang:controle` ooit in zichzelf vond, waar een
  //    toelichting boven een knop als ingang telde.
  //
  // ⚠️ **Onder toets sinds QS8-602**, want 📏 tot dan liet deze knip weghalen
  //    25 van 25 groen: *"het bestand noemt de functie alleen in een
  //    regelcommentaar"* en *"… in een blokcommentaar"* worden rood zonder knip,
  //    *"een echte aanroep met een commentaar erbij"* als hij te veel knipt.
  const aanroepers = bronnen.filter((b) => zonderCommentaar(b.inhoud).includes(functie));

  if (!aanroepers.some((b) => b.pad === rij.bestand)) {
    return [{ sleutel, waarom: `de rij noemt \`${rij.bestand}\`, en dat bestand noemt \`${functie}\` niet meer` }];
  }

  const stuurders = aanroepers.filter((b) => stuurtNull(b.inhoud, parameter)).map((b) => b.pad);

  return stuurders.length === 0
    ? []
    : [{ sleutel, waarom: `stuurt \`null\` of \`undefined\` in ${stuurders.join(', ')}` }];
}

function psql(vraag) {
  return execFileSync('psql', psqlArgumenten(vraag), { encoding: 'utf8' });
}

function meldOngedekt(ongedekt) {
  console.error(`✗ ${ongedekt.length} argument(en) met \`DEFAULT NULL\` zijn niet getypt en staan\nnergens met een reden:\n`);
  for (const a of ongedekt) console.error(`    ${a}`);
  console.error(
    '\nEen `DEFAULT NULL` betekent dat een aanroeper de parameter mag wéglaten —\n' +
      'niet dat hij er `null` heen mag sturen. Kies er één van twee:\n\n' +
      '  1. stuurt een aanroeper er `null` heen → corrigeer het type in\n' +
      '     `src/lib/database.types.correcties.ts` (klasse 2), mét de meting;\n' +
      '  2. laat elke aanroeper de sleutel weg → zet hem in\n' +
      '     GEEN_AANROEPER_STUURT_NULL hierboven, met het bestand en de vorm.\n\n' +
      'Die tweede is een bewéring: dit script toetst hem elke run na. Zie QS8-594.',
  );
}

function meldGebroken(gebroken) {
  console.error(`✗ ${gebroken.length} registerrij(en) beweren iets dat niet meer klopt:\n`);
  for (const g of gebroken) console.error(`    ${g.sleutel} — ${g.waarom}`);
  console.error(
    '\nHet register zegt per rij *"dit bestand roept die functie aan en stuurt er\n' +
      'geen `null` heen"*. Klopt de helft die de plek noemt niet meer, werk de rij\n' +
      'bij; staat er wél een `null`, dan hoort het type gecorrigeerd te worden.',
  );
}

function hoofd() {
  let argumenten;
  try {
    argumenten = ontleed(psql(VRAAG));
  } catch (fout) {
    console.error(
      verbindingsmelding({
        naam: 'defaultnull-controle',
        leest: 'Deze controle leest `pg_get_function_arguments()` en niet de migratiebestanden.',
        melding: fout instanceof Error ? fout.message : String(fout),
      }),
    );
    return 1;
  }

  const { ongedekt, verouderd, gebroken } = beoordeel({
    argumenten,
    generatie: readFileSync('src/lib/database.types.ts', 'utf8'),
    correcties: readFileSync('src/lib/database.types.correcties.ts', 'utf8'),
    bronnen: bronnenIn(),
  });

  if (ongedekt.length > 0) {
    meldOngedekt(ongedekt);
    return 1;
  }

  if (gebroken.length > 0) {
    meldGebroken(gebroken);
    return 1;
  }

  if (verouderd.length > 0) {
    console.error(`✗ ${verouderd.length} registerrij(en) dekken niets meer:\n`);
    for (const a of verouderd) console.error(`    ${a}`);
    console.error(
      '\nDeze parameters dragen geen `DEFAULT NULL` meer, of zijn intussen wél als\n' +
        '`| null` getypt. Haal de rij weg: een reden voor iets dat er niet meer is,\n' +
        'dekt ooit stilletjes iets nieuws met dezelfde naam.',
    );
    return 1;
  }

  const rijen = Object.keys(GEEN_AANROEPER_STUURT_NULL).length;
  console.log(
    `defaultnull-controle: ${argumenten.length} argument(en) met \`DEFAULT NULL\`, ` +
      `allemaal getypt of met een natoetste reden (${rijen} rijen in het register).`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
