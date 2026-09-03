#!/usr/bin/env node
/**
 * definers-controle — wie schrijft er met `SECURITY DEFINER` in de kerntabellen?
 *
 * ⚠️ **Dit script bestaat omdat een sweep zich voordeed als een inventarisatie.**
 *    Ronde 5 van QS8-262 haalde bij zeven definer-RPC's de eigenaarspoort weg om
 *    te zien of een test rood werd. Vier van die zeven bleken onbewaakt. Wat
 *    niemand mat is of het er zéven waren: het zijn er twaalf, en de achtste —
 *    `verwijder_weekdoel` — had precies hetzelfde gat. Gevonden door de
 *    security-reviewer, niet door het gereedschap.
 *
 *    De dossierrij die de bevinding laag hield zei *"wordt zwaarder als er een
 *    achtste bijkomt"*, en dat was op de dag van schrijven al onwaar. De echte
 *    aanname was **"de zeven die ik mat zijn de hele klasse"**, en zolang die
 *    opsomming alleen in het hoofd van de meter leeft, is elke volgende ronde
 *    weer een greep.
 *
 * ## Waarom deze klasse geen enkel ander rapport raakt
 *
 * `rls:dekking` meet policies door ze open te zetten. Een `SECURITY DEFINER`
 * -functie komt daar principieel niet langs: hij draait als zijn eigenaar, dus
 * geen enkele policy raakt hem. Zijn poort is de `if` in zijn eigen body, en die
 * staat in geen dekkingsrapport. Dit register is de enige plek waar de klasse
 * geteld wordt.
 *
 * ## ⚠️⚠️ Triggerfuncties horen erbij, en dat is de les van 0149
 *
 * `pin:controle` scopete ooit op `has_function_privilege('authenticated', …,
 * 'EXECUTE')`, en zag daardoor twee `SECURITY DEFINER`-**trigger**functies niet:
 * die hebben dat recht niet nodig, want een trigger vuurt zonder. Een client die
 * een bericht plaatste, vuurde ze wél. Het register telde vijf waar er acht
 * waren.
 *
 * Dat is hier één op één van toepassing, dus de vraag scopet **niet** op het
 * EXECUTE-recht. De reden in het register verschilt per soort:
 *
 * | Soort | Waar zijn autorisatie zit |
 * | -- | -- |
 * | RPC die `authenticated` mag aanroepen | de poort ín de functie — die hoort een test te hebben |
 * | RPC zonder dat recht | de **grant** is de grendel, en die bewaakt `tests/rls/functiegrants.test.ts` |
 * | triggerfunctie | de **policy op de schrijfactie die hem aftrapt** — geen eigen poort |
 *
 * ⚠️ Die derde rij is geen vrijbrief. "Geen eigen poort" is iets anders dan "in
 *    orde": het betekent dat déze controle er niets over zegt en dat de dekking
 *    ergens anders vandaan moet komen. `noteer_ontkoppeling` is het scherpste
 *    voorbeeld — die schrijft `goals.losgekoppeld_op` voor een `old.goal_id` die
 *    hij ongecontroleerd overneemt, en leunt volledig op de DELETE-policy van
 *    `goal_group_links`.
 *
 * ## De SQL kiest niet wie er schrijft
 *
 * Dezelfde reparatie als bij `pin:controle` na 27-08: een regex over
 * `pg_get_functiondef()` leest de definitie **inclusief commentaar**, en sloeg
 * daar aan op een zin die uitlegde wat een functie juist níét doet. De valse
 * positief was het kleine probleem; het grote was dat niemand wist hoeveel valse
 * negatieven eronder zaten.
 *
 * `schrijftNaarKerntabel()` hieronder is daarom een gewone functie, en
 * `tests/scripts/definers-controle.test.ts` biedt hem elke vorm los aan — de
 * vormen die hij moet vinden én de vormen die hij met rust moet laten.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** De tabellen waar een schrijfactie een autorisatievraag oproept. */
export const KERNTABELLEN = [
  'goals',
  'weekly_goals',
  'milestones',
  'completions',
  'points_ledger',
];

/**
 * Het register: elke definer-functie die in een kerntabel schrijft, met waar
 * zijn autorisatie zit. Een functie die hier niet staat, is een functie waar
 * niemand die vraag over gesteld heeft.
 */
const REGISTER = new Map([
  // --- RPC's met een eigenaarspoort, bewaakt door een test -------------------
  ['zet_doelstatus', 'Eigenaarspoort. Bewaakt door `tests/rls/definerpoorten.test.ts` (ronde 5).'],
  ['zet_streefdatum', 'Eigenaarspoort. Bewaakt door `definerpoorten.test.ts`. ⚠️ De zwaarste van de reeks: de directe route om A7 heen.'],
  ['schuif_weekdoel_door', 'Eigenaarspoort. Bewaakt door `definerpoorten.test.ts`.'],
  ['verwijder_weekdoel', 'Eigenaarspoort. Bewaakt door `definerpoorten.test.ts` — de achtste, gevonden bij de review op ronde 5.'],
  ['rond_doel_af', 'Eigenaarspoort. Gemeten: poort weg → `epic9.test.ts` wordt rood.'],
  ['sluit_weekdoel_af', 'Eigenaarspoort. Gemeten: poort weg → `weekpassen.test.ts` wordt rood.'],
  ['trek_goedkeuring_in', 'Moet de goedkeurder zijn én actief lid. Gemeten: poort weg → `besluiten.test.ts` wordt rood.'],
  ['beslis_deadline_verzoek', 'Niet de aanvrager zelf én actief lid. Gemeten: poort weg → `besluiten.test.ts` wordt rood.'],
  ['verwijder_doel', 'Eigenaarspoort. Gemeten bij de review op ronde 5: poort weg → één rode test.'],
  ['herorden_mijlpalen', 'Toetst `g.owner_id = v_uid` en pint `m.goal_id`. Gemeten: poort weg → één rode test.'],
  ['dien_opnieuw_in', 'Eigenaarspoort. Gemeten bij de review op ronde 5: poort weg → één rode test.'],
  [
    'zet_week_startdag',
    'Géén losse poort: de scoping zit in de `update … and g.owner_id = v_uid` zelf. ' +
      '⚠️ Daardoor is dit de enige RPC waar de mutatievorm van ronde 5 principieel ' +
      'blind voor is — je kunt de poort niet weghalen zonder de functie te slopen. ' +
      'Wordt toetsbaar zodra de scoping naar een aparte `if` verhuist.',
  ],

  // --- RPC's die `authenticated` níét mag aanroepen --------------------------
  ['herstel_weekdoelstatus', 'Geen EXECUTE voor `authenticated`; de grant is de grendel. Bewaakt door `tests/rls/functiegrants.test.ts`.'],
  ['keur_vastgelopen_goedkeuringen_goed', 'Idem: rollover-functie zonder EXECUTE voor `authenticated`.'],
  ['weekplanstap_naar_weekdoel', 'Idem. ⚠️ De naam suggereert een gebruikershandeling; het recht zegt van niet. Verandert dat, dan hoort hij naar het blok hierboven en heeft hij een test nodig.'],

  // --- Triggerfuncties: geen eigen poort ------------------------------------
  ['award_points_on_approval', 'Triggerfunctie. Autorisatie is de policy op de goedkeuring die hem aftrapt.'],
  ['mark_weekly_goal_pending', 'Triggerfunctie. Autorisatie is `completions_insert`.'],
  ['recalc_goal_max_points', 'Triggerfunctie. Rekent af op `weekly_goals`; autorisatie is de policy op die schrijfactie.'],
  ['koppeling_zet_beoordeelbaar_om', 'Triggerfunctie op `goal_group_links`; autorisatie is de policy op die tabel.'],
  [
    'noteer_ontkoppeling',
    'Triggerfunctie. ⚠️ Schrijft `goals.losgekoppeld_op` voor een `old.goal_id` die ' +
      'hij ongecontroleerd overneemt, en leunt volledig op de DELETE-policy van ' +
      '`goal_group_links`. Het scherpste voorbeeld van "geen eigen poort is iets ' +
      'anders dan in orde".',
  ],
  ['noteer_beoordelaar_weg_groep', 'Triggerfunctie op `groups`; autorisatie is de policy en de pin op die tabel.'],
  ['noteer_beoordelaar_weg_lid', 'Triggerfunctie op `group_members`; idem.'],
]);

/**
 * Scheidingstekens die in geen enkele functiedefinitie voorkomen.
 *
 * ⚠️⚠️ **Allebei als JavaScript-stuurteken de SQL in, en niet als tekst.** De
 *    eerste versie schreef de rijscheiding als `'\\x03'` ín de SQL-string, en
 *    Postgres leest dat als vier gewone tekens — geen stuurteken. De uitvoer werd
 *    dus nooit gesplitst: alles kwam als één blok binnen, de naam van de
 *    alfabetisch eerste functie kreeg de bron van álle andere, en het script
 *    meldde precies één "onbekende" functie die niets fout deed.
 *
 *    Het verraderlijke is dat die uitkomst er plausibel uitzag. Hij vond er één,
 *    met een naam die er relevant uitzag, en pas het nameten van díe functie liet
 *    zien dat ze niet eens in een kerntabel schrijft.
 */
const SCHEIDING = '\x02';
const RIJ = '\x03';

const VRAAG = `
  select p.proname
      || '${SCHEIDING}' || (case when p.prorettype = 'trigger'::regtype then 'ja' else 'nee' end)
      || '${SCHEIDING}' || (case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'ja' else 'nee' end)
      || '${SCHEIDING}' || p.prosrc
      || '${RIJ}'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
  order by p.proname
`;

/**
 * Haalt SQL-commentaar weg vóór er iets besloten wordt.
 *
 * ⚠️ Zonder dit slaat de toets aan op een zin die uitlegt wat een functie juist
 *    níét doet. Dat is op 27-08-2026 bij `pin:controle` gebeurd, en de reparatie
 *    was toen de zín herschrijven in plaats van de code.
 *
 * @param {string} definitie
 * @returns {string}
 */
export function zonderCommentaar(definitie) {
  return definitie.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * Schrijft deze functie in een kerntabel?
 *
 * ⚠️ `\\M` in de SQL-regex bestaat in JavaScript niet; hier staat `\\b` met een
 *    expliciete uitsluiting van een liggend streepje, anders matcht `goals` ook
 *    in `goal_group_links` en `weekly_goals` in `weekly_goals_archief`.
 *
 * @param {string} definitie
 * @returns {boolean}
 */
export function schrijftNaarKerntabel(definitie) {
  const schoon = zonderCommentaar(definitie);
  const tabellen = KERNTABELLEN.join('|');
  const patroon = new RegExp(
    `(insert\\s+into|update|delete\\s+from)\\s+(only\\s+)?(public\\.)?"?(${tabellen})"?(?![\\w-])`,
    'i',
  );
  return patroon.test(schoon);
}

/**
 * Uit de ruwe psql-uitvoer: de definer-functies die in een kerntabel schrijven.
 *
 * @param {string} uitvoer
 * @returns {{naam: string, trigger: boolean, aanroepbaar: boolean}[]}
 */
export function ontleed(uitvoer) {
  return uitvoer
    .split(RIJ)
    .map((blok) => blok.trim())
    .filter((blok) => blok.length > 0)
    .map((blok) => {
      const [naam, trigger, aanroepbaar, ...rest] = blok.split(SCHEIDING);
      // ⚠️ `'ja'`/`'nee'` en niet een boolean. `||` in Postgres maakt van een
      //    boolean de tekst `true`/`false`, niet `t`/`f` — de eerste versie
      //    vergeleek met `'t'` en meldde daardoor "0 RPC's, 0 triggerfuncties"
      //    boven een lijst van 22. Het getal klopte, de uitsplitsing loog.
      return {
        naam,
        trigger: trigger === 'ja',
        aanroepbaar: aanroepbaar === 'ja',
        definitie: rest.join(SCHEIDING),
      };
    })
    .filter((f) => schrijftNaarKerntabel(f.definitie))
    .map(({ naam, trigger, aanroepbaar }) => ({ naam, trigger, aanroepbaar }));
}

/**
 * Legt de gevonden functies naast het register — tweezijdig.
 *
 * @param {{naam: string}[]} gevonden
 * @param {Map<string, string>} register
 */
export function beoordeel(gevonden, register = REGISTER) {
  const gezien = new Set(gevonden.map((f) => f.naam));
  return {
    onbekend: gevonden.filter((f) => !register.has(f.naam)).map((f) => f.naam),
    verdwenen: [...register.keys()].filter((naam) => !gezien.has(naam)),
  };
}

function psql(vraag) {
  const db = process.env.DB ?? process.env.PGDATABASE ?? 'goalbuddies_rls';
  const args = ['--quiet', '--no-psqlrc', '-At', '-d', db, '-c', vraag];
  if (process.env.PGHOST) args.unshift('-h', process.env.PGHOST);
  return execFileSync('psql', args, { encoding: 'utf8' });
}

function hoofd() {
  let gevonden;
  try {
    gevonden = ontleed(psql(VRAAG));
  } catch (fout) {
    console.error(
      '✗ Geen database om tegen te meten.\n\n' +
        'Deze controle leest `pg_proc` en niet de migratiebestanden.\n' +
        'Start de lokale stack met `npm run rls:stack`.\n\n' +
        `psql zei: ${fout instanceof Error ? fout.message.split('\n')[0] : String(fout)}`,
    );
    return 1;
  }

  const { onbekend, verdwenen } = beoordeel(gevonden);

  if (onbekend.length > 0) {
    console.error(
      `✗ ${onbekend.length} definer-functie(s) schrijven in een kerntabel zonder reden:\n`,
    );
    for (const f of onbekend) console.error(`    ${f}()`);
    console.error(
      '\nEen SECURITY DEFINER-functie draait als zijn eigenaar, dus geen enkele policy\n' +
        'houdt hem tegen — zijn poort is de `if` in zijn eigen body, en `rls:dekking`\n' +
        'ziet die niet.\n\n' +
        'Mag `authenticated` hem aanroepen? Dan hoort er een test te staan die rood\n' +
        'wordt als die poort weggehaald wordt — zie tests/rls/definerpoorten.test.ts.\n' +
        'Is het een triggerfunctie? Dan zit de autorisatie in de policy op de\n' +
        'schrijfactie die hem aftrapt; schrijf op wélke.\n' +
        'Zet hem daarna met die reden in REGISTER in scripts/definers-controle.mjs.',
    );
    return 1;
  }

  if (verdwenen.length > 0) {
    console.error(`✗ ${verdwenen.length} functie(s) in het register bestaan niet meer:\n`);
    for (const f of verdwenen) console.error(`    ${f}()`);
    console.error(
      '\nEen register dat achterloopt, geeft redenen voor code die weg is. Haal ze eruit.',
    );
    return 1;
  }

  const rpcs = gevonden.filter((f) => !f.trigger && f.aanroepbaar).length;
  const triggers = gevonden.filter((f) => f.trigger).length;
  console.log(
    `definers-controle: ${gevonden.length} definer-functies schrijven in een kerntabel ` +
      `(${rpcs} aanroepbare RPC's, ${triggers} triggerfuncties), allemaal met een reden.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
