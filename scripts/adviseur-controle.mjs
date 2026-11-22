#!/usr/bin/env node
/**
 * Supabase' eigen beveiligingslinter, langs een allowlist met reden — QS8-235.
 *
 * ⚠️ **Waarom dit bestaat.** `npm run poort` draait 29 controles, en ze toetsen
 *    alle 29 iets wat wij zélf bedacht hebben te toetsen. Supabase heeft
 *    daarnaast een linter die het gedéployde schema nakijkt op patronen die wij
 *    niet verzonnen hebben. Die was op 31-08-2026 voor het eerst gedraaid — met
 *    de hand, in een chat. 53 bevindingen, en niets in de repo wist dat dit
 *    bestond.
 *
 * ⚠️ **Waarom een allowlist en niet een drempel.** Alle 53 zijn op 31-08 stuk
 *    voor stuk beoordeeld en verklaard. Een lijst die vandaag volledig verklaard
 *    is, is de goedkoopste die er ooit zal zijn: elke bevinding daarná is per
 *    definitie nieuw werk, en die zou tussen 52 bekende staan zonder dat iemand
 *    het ziet. Een drempel ("hoogstens 60 bevindingen") vangt dat niet — dan
 *    verdwijnt een nieuwe achter een opgeloste.
 *
 * ⚠️ **De lijst rot de andere kant op ook.** Een uitzondering die niets meer
 *    aanwijst, is een uitspraak die niemand meer nameet. Daarom is een
 *    ongebruikte regel óók rood, en telt `hoogstens` naar bénéden mee: zakt het
 *    aantal definer-functies van 47 naar 40, dan hoort dat getal mee te zakken.
 *    Anders is het geen ratel maar een plafond waar je onder kunt blijven zitten.
 *
 * ⚠️ **Zonder token slaat hij zichzelf over — zichtbaar.** Zelfde afspraak en
 *    dezelfde vorm als `functies:controle` en `register:controle`: de melding
 *    gaat naar stderr met `OVERGESLAGEN` erin, want op stdout leest
 *    "overgeslagen" als "gelukt". `poort.mjs` telt dat als *ongemeten* en niet
 *    als groen. Met `--streng` is een ontbrekende token een fout.
 *
 * ⚠️ **Wat hier niet getest ís.** `beoordeel()` en `normaliseer()` staan los
 *    onder test in `tests/scripts/adviseur-controle.test.ts`, met elke vorm die
 *    ze moeten vinden én elke vorm die ze met rust moeten laten. Het ophalen
 *    zelf niet: dat vraagt een echte token. Dat is een bewuste grens en geen
 *    omissie — maar het betekent wel dat een wijziging in het antwoordformaat
 *    van Supabase hier pas bij het eerstvolgende draaien opvalt.
 *
 * Draaien: `npm run adviseur:controle`. Hoort mee in `/audit` en in de poort.
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { config } from 'dotenv';

config({ path: '.env', quiet: true });

const PROJECT_REF = 'wehgocadxehottiiyvsc';

/**
 * Wat er op 31-08-2026 stond, en waarom het mag staan.
 *
 * Twee vormen:
 *   - `sleutel` — precies deze ene bevinding (`cache_key` uit het antwoord).
 *   - `regel` + `hoogstens` — deze regel mag hoogstens zoveel keer voorkomen.
 *     Alleen voor bevindingen die als groep één open besluit zijn; de reden
 *     noemt dan het issue waar dat besluit ligt.
 *
 * ⚠️ De sleutel van een definer-functie draagt zijn handtekening
 *    (`..._annuleer_adempauze_p_id uuid`). Die verandert mee met elke
 *    parameterwijziging, dus 47 losse sleutels zouden bij elke refactor rood
 *    worden zonder dat er iets nieuws is. Vandaar `hoogstens` voor díé groep, en
 *    losse sleutels voor de rest.
 */
export const ALLOWLIST = [
  {
    sleutel: 'security_definer_view_public_mijn_profiel',
    reden:
      'Bewust. security_invoker = false ís de werking: de view omzeilt de ' +
      'kolomintrekking van 0089 en beperkt zichzelf met een where tot één rij — ' +
      'die van de aanroeper. De schrijfkant was een echte achterdeur en is in ' +
      '0095 dichtgezet.',
  },
  {
    sleutel: 'security_definer_view_public_group_visible_streaks',
    reden:
      'Bewust, zelfde vorm als mijn_profiel. Deze view is bovendien de plek waar ' +
      'besluit A41 leeft: 0003 liet last_cycle_start er bewust uit, 0078 zette ' +
      'hem er onder A41 weer in.',
  },
  {
    sleutel: 'security_definer_view_public_mijn_doelvelden',
    reden:
      'Bewust — 0236, geland 17-09-2026. De migratie schrijft de afweging zelf ' +
      'uit: definer kán hier veilig waar het bij goal_dashboard niet kon, want ' +
      'de `where` geeft uitsluitend rijen van de aanroeper terug. Er is dus geen ' +
      'kijker voor wie een telling anders zou uitvallen, en dát is waarom ' +
      '`max_points` hier wél mag staan. Draagt ook `security_barrier = true`. ' +
      '⚠️ Stond een week niet op deze lijst en niets werd daar rood van — ' +
      'QS8-597 heeft daar `adviseurdrift:controle` voor gebouwd.',
  },
  {
    sleutel: 'rls_enabled_no_policy_public_dagtellers',
    reden:
      'Bewust en getest — 0233, hernoemd in 0234, geland 17-09-2026. Geen policy ' +
      'is deny-all; alleen definer-functies schrijven hier. Zelfde vorm als ' +
      'invite_events en invite_preview_limits, en onder test in ' +
      'tests/rls/anonleesrecht.test.ts, tests/rls/plafonddekking.test.ts en ' +
      'tests/rls/bewijsfotobucket.test.ts.',
  },
  {
    sleutel: 'rls_enabled_no_policy_public_invite_events',
    reden:
      'Bewust en getest. Geen policy is deny-all; tests/rls/policies.test.ts ' +
      'bewaakt dat invite_events voor niemand leesbaar is.',
  },
  {
    sleutel: 'rls_enabled_no_policy_public_invite_preview_limits',
    reden:
      'Bewust en getest — 0131. Zelfde vorm als invite_events: alleen de ' +
      'definer-functie schrijft hier. tests/rls/uitnodigingslimiet.test.ts ' +
      'bewaakt dat geen enkele client hem leest.',
  },
  {
    regel: 'anon_security_definer_function_executable',
    hoogstens: 1,
    reden:
      'invite_preview is met opzet zonder sessie bereikbaar — je moet een ' +
      'uitnodiging kunnen bekijken vóór je een account hebt. Sinds 0131 met een ' +
      'limiet (QS8-236). ⚠️ Een twééde oningelogde functie is een besluit dat ' +
      'niemand genomen heeft; die hoort hier rood te worden.',
  },
  {
    regel: 'authenticated_security_definer_function_executable',
    hoogstens: 105,
    reden:
      'Bekend en open — QS8-181. 📏 Gemeten op 22-11-2026 (get_advisors op ' +
      'productie, alleen lezen, productie op 0337): de adviseur meldt er **105**. ' +
      'Op 18-11-2026 waren het er 81 (productie op 0302), op 24-09-2026 76. ' +
      'De 24 erbij, per migratie die de `grant ... to authenticated` met zoveel ' +
      'woorden geeft: ' +
      '0309 `deel_prestatie(p_group_id uuid, p_badge text)`; ' +
      '0314 `weekbelofte_begunstigde_bekend(p_groep uuid, p_getuige uuid)`; ' +
      '0316 `is_organisatielid(p_organization_id uuid)`, `maak_organisatie(p_naam text)` ' +
      '(grant herhaald in 0337), `organisatie_uitnodigcode(p_organization_id uuid)`, ' +
      '`organisatieleden(p_organization_id uuid, p_limit integer, p_na_user_id uuid)`, ' +
      '`verlaat_organisatie(p_organization_id uuid)`, ' +
      '`vernieuw_organisatiecode(p_organization_id uuid, p_intrekken boolean)`, ' +
      '`word_organisatielid(p_code text)`, ' +
      '`zet_organisatielid_uit(p_organization_id uuid, p_user_id uuid)`; ' +
      '0317 `maak_teamgroep(p_organization_id uuid, p_naam text, p_huddledag smallint, p_tz text, p_zichtbaarheid text)`; ' +
      '0318 `benoem_organisatiebeheerder(p_organization_id uuid, p_user_id uuid)`, ' +
      '`treed_terug_als_organisatiebeheerder(p_organization_id uuid)`; ' +
      '0319 `maak_teamdoel(p_group_id uuid, p_titel text, p_streefdatum date, p_beschrijving text)`, ' +
      '`neem_aandeel(p_team_goal_id uuid, p_titel text)`; ' +
      '0320 `teambalk(p_team_goal_id uuid)`; ' +
      '0321 `aandeel_wacht_op_teamgenoot(g uuid)`, `is_aandeel_van_een_ander(g uuid)`; ' +
      '0324 `organisatieteams(p_organization_id uuid, p_limit integer, p_na_id uuid)`; ' +
      '0325 `straf_teamband_klopt_voor_mij(p_goal_id uuid)`; ' +
      '0326 `keur_teamdoel_goed(p_team_goal_id uuid)`, `vraag_teamdoel_afronding(p_team_goal_id uuid)`; ' +
      '0333 `lid_van_levende_groep(gid uuid)`; ' +
      '0336 `zet_groepsklassement(p_group_id uuid, p_aan boolean, p_bevestigd boolean)`. ' +
      'Elk is op 22-11 met `pg_get_functiondef()` op productie nagelopen: `set search_path`, ' +
      'niet uitvoerbaar door `anon`, een toets op `auth.uid()` of op lidmaatschap ' +
      '(groep of organisatie), en geen tegenslag van een ander lid in wat eruit komt. ' +
      'De tabel per functie staat in ' +
      'docs/decisions/2026-11-22-het-plafond-van-de-definer-ratel-staat-op-105.md, ' +
      'samen met de volledige lijst van 105 namen zodat de volgende meting per naam ' +
      'kan vergelijken. ⚠️ Twee zijn policyhelpers die één bit over een doel-uuid ' +
      'geven zonder eigen lidmaatschapstoets (`is_aandeel_van_een_ander`, ' +
      '`straf_teamband_klopt_voor_mij`); de grant is nodig omdat de invoker-functie ' +
      '`group_overview()` en de policies op `commitments` ze aanroepen. ' +
      '⚠️ Dit getal is een ratel en geen constante: `beoordeel()` faalt ' +
      'óók als het aantal zákt zonder dat het plafond meezakt, zodat er geen ' +
      'ruimte vrijkomt waar de volgende definer-functie stil in glijdt.',
  },
];

/**
 * Haalt de `lints` uit wat de API teruggaf.
 *
 * ⚠️ Twee vormen omdat er twee bronnen zijn: de Management API geeft
 *    `{ lints: [...] }`, de MCP-tool `{ result: { lints: [...] } }`. Een kale
 *    array accepteren we ook. Alles daarbuiten is een fout en geen lege lijst —
 *    "nul bevindingen" en "ik snapte het antwoord niet" mogen hier nooit
 *    hetzelfde betekenen, want het eerste is groen.
 */
export function normaliseer(antwoord) {
  if (Array.isArray(antwoord)) return antwoord;
  if (Array.isArray(antwoord?.lints)) return antwoord.lints;
  if (Array.isArray(antwoord?.result?.lints)) return antwoord.result.lints;
  throw new Error('onbegrepen antwoord van de adviseur-API');
}

/**
 * Legt de bevindingen naast de allowlist.
 *
 * Geeft terug wat er níét op staat (`onverwacht`) en welke regels niets meer
 * aanwijzen of te ruim staan (`verouderd`).
 */
export function beoordeel(bevindingen, allowlist = ALLOWLIST) {
  const opSleutel = new Map();
  const opRegel = new Map();
  for (const regel of allowlist) {
    if (regel.sleutel) opSleutel.set(regel.sleutel, regel);
    else if (regel.regel) opRegel.set(regel.regel, regel);
  }

  const gezienSleutel = new Set();
  const geteldPerRegel = new Map();
  const onverwacht = [];

  for (const bevinding of bevindingen) {
    const sleutel = bevinding.cache_key ?? '';
    const naam = bevinding.name ?? '';

    if (opSleutel.has(sleutel)) {
      gezienSleutel.add(sleutel);
      continue;
    }

    if (opRegel.has(naam)) {
      geteldPerRegel.set(naam, (geteldPerRegel.get(naam) ?? 0) + 1);
      continue;
    }

    onverwacht.push({
      niveau: bevinding.level ?? 'ONBEKEND',
      naam,
      sleutel,
      detail: bevinding.detail ?? '',
    });
  }

  const verouderd = [];
  for (const [sleutel, regel] of opSleutel) {
    if (!gezienSleutel.has(sleutel)) {
      verouderd.push({ soort: 'ongebruikt', sleutel, reden: regel.reden });
    }
  }
  for (const [naam, regel] of opRegel) {
    const geteld = geteldPerRegel.get(naam) ?? 0;
    if (geteld > regel.hoogstens) {
      onverwacht.push({
        niveau: 'RATEL',
        naam,
        sleutel: `${naam} × ${geteld}`,
        detail: `deze regel mag hoogstens ${regel.hoogstens} keer voorkomen en komt ${geteld} keer voor`,
      });
    } else if (geteld < regel.hoogstens) {
      verouderd.push({
        soort: 'te-ruim',
        sleutel: naam,
        reden: `staat op hoogstens ${regel.hoogstens} en komt nog ${geteld} keer voor — zet het getal omlaag`,
      });
    }
  }

  return { onverwacht, verouderd };
}

// ---------------------------------------------------------------------------
// Vanaf hier alleen nog het ophalen en het afdrukken.
// ---------------------------------------------------------------------------

const ONTBREEKT =
  'geen SUPABASE_ACCESS_TOKEN in de omgeving.\n' +
  '  Deze controle vraagt de Management API om Supabase’ eigen linter; zie QS8-235.';

/** Een niet-ok antwoord van de API: de statuscode is de melding. */
export class ApiStatusFout extends Error {
  /** @param {number} status */
  constructor(status) {
    super(`de API gaf ${status}.`);
    this.status = status;
  }
}

/**
 * Haalt de ruwe linterbevindingen op. Gooit `ApiStatusFout` bij een niet-ok antwoord.
 *
 * @param {{ token: string }} invoer
 * @returns {Promise<unknown>}
 */
async function uitManagementApi({ token }) {
  const antwoord = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/advisors/security`,
    {
      headers: { Authorization: `Bearer ${token}` },
      // ⚠️ Elke externe call heeft een timeout — CLAUDE.md, coderegel 14.
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!antwoord.ok) throw new ApiStatusFout(antwoord.status);
  return antwoord.json();
}

function drukRoodAf({ onverwacht, verouderd }) {
  console.error('adviseur-controle: de linter zegt iets wat niet op de lijst staat.\n');
  for (const b of onverwacht) {
    console.error(`  [${b.niveau}] ${b.naam}`);
    console.error(`    ${b.detail}`);
    console.error(`    sleutel: ${b.sleutel}\n`);
  }
  for (const v of verouderd) {
    console.error(`  [verouderd — ${v.soort}] ${v.sleutel}`);
    console.error(`    ${v.reden}\n`);
  }
  console.error(
    'Beoordeel elke nieuwe bevinding zélf en zet hem daarna met een reden op de\n' +
      'ALLOWLIST in scripts/adviseur-controle.mjs, of repareer hem. Een lege reden\n' +
      'is geen reden. Zie QS8-235.',
  );
}

/**
 * Draait de controle en geeft de **exitcode terug** — hij sluit het proces niet af.
 *
 * ⚠️ **Geen `process.exit()` na een `await fetch()`** (QS8-684). Op Windows
 *    stort libuv dan in met een assertion in `src\win\async.c`, nadat de uitslag
 *    al geprint was; gemeten op 18-11-2026 (exit -1073740791). De aanroeper zet
 *    `process.exitCode` en laat de event loop leeglopen. `haalOp` is
 *    injecteerbaar, dus de exitcode is zonder netwerk te toetsen.
 *
 * @param {{ token?: string | undefined, streng?: boolean }} invoer
 * @param {(invoer: { token: string }) => Promise<unknown>} [haalOp]
 * @returns {Promise<number>}
 */
export async function draai({ token, streng }, haalOp = uitManagementApi) {
  if (!token) {
    console.error(
      streng
        ? `✗ adviseur-controle kon niet draaien — ${ONTBREEKT}`
        : `⚠ adviseur-controle: OVERGESLAGEN — ${ONTBREEKT}`,
    );
    return streng ? 1 : 0;
  }

  let bevindingen;
  try {
    bevindingen = normaliseer(await haalOp({ token }));
  } catch (fout) {
    const melding = fout instanceof Error ? fout.message : String(fout);
    console.error(
      fout instanceof ApiStatusFout
        ? `✗ adviseur-controle: ${melding}`
        : `✗ adviseur-controle: ophalen mislukt — ${melding}`,
    );
    return 1;
  }

  const oordeel = beoordeel(bevindingen);
  if (oordeel.onverwacht.length === 0 && oordeel.verouderd.length === 0) {
    console.log(`adviseur-controle: ${bevindingen.length} bevindingen, allemaal verklaard.`);
    return 0;
  }

  drukRoodAf(oordeel);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await draai({
    token: process.env.SUPABASE_ACCESS_TOKEN,
    streng: process.argv.includes('--streng'),
  });
}
