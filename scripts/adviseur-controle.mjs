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
    sleutel: 'auth_leaked_password_protection',
    reden: 'Bekend en open — QS8-141. Vraagt een schakelaar in het dashboard.',
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
    hoogstens: 47,
    reden: 'Bekend en open — QS8-181, 98 van de 118 functies zijn SECURITY DEFINER.',
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

/* c8 ignore start */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const streng = process.argv.includes('--streng');

  const ONTBREEKT =
    'geen SUPABASE_ACCESS_TOKEN in de omgeving.\n' +
    '  Deze controle vraagt de Management API om Supabase’ eigen linter; zie QS8-235.';

  if (!token) {
    console.error(
      streng
        ? `✗ adviseur-controle kon niet draaien — ${ONTBREEKT}`
        : `⚠ adviseur-controle: OVERGESLAGEN — ${ONTBREEKT}`,
    );
    process.exit(streng ? 1 : 0);
  }

  let bevindingen;
  try {
    const antwoord = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/advisors/security`,
      {
        headers: { Authorization: `Bearer ${token}` },
        // ⚠️ Elke externe call heeft een timeout — CLAUDE.md, coderegel 14.
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!antwoord.ok) {
      console.error(`✗ adviseur-controle: de API gaf ${antwoord.status}.`);
      process.exit(1);
    }
    bevindingen = normaliseer(await antwoord.json());
  } catch (fout) {
    console.error(`✗ adviseur-controle: ophalen mislukt — ${fout.message}`);
    process.exit(1);
  }

  const { onverwacht, verouderd } = beoordeel(bevindingen);

  if (onverwacht.length === 0 && verouderd.length === 0) {
    console.log(
      `adviseur-controle: ${bevindingen.length} bevindingen, allemaal verklaard.`,
    );
    process.exit(0);
  }

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
  process.exit(1);
}
/* c8 ignore stop */
