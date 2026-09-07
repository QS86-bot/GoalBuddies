/**
 * Draait de lokale stack op dezelfde Postgres-major als productie? — QS8-177.
 *
 * ⚠️ **Waarom dit bestaat.** `scripts/lokale-stack.sh` gebruikt de Postgres van
 *    het besturingssysteem. Staat daar een andere major dan op het
 *    Supabase-project, dan draait de hele RLS-suite tegen een andere
 *    databaseversie dan productie — en bewijst hij gedrag dat daar niet
 *    per se geldt. De dossierrij van 27-08 zei erover: *"tussen 16 en 17 is er
 *    in RLS, policies en security definer niets gewijzigd dat dit project
 *    raakt — maar dat is geredeneerd en niet nagemeten."*
 *
 *    Dit script maakt dat geen redenering meer maar een regel op je scherm.
 *
 * ⚠️ **Een verschil is hier ONGEMETEN en niet ROOD, en dat is de hele keuze in
 *    dit bestand.** Rood zou betekenen dat iedereen die geen Postgres 17 kan
 *    installeren een permanent rode poort heeft — en een controle die altijd
 *    rood staat, leer je wegklikken. Dat is precies de fout die dit project
 *    elders opschrijft.
 *
 *    Ongemeten is bovendien wát het is: de suite heeft gedraaid, maar wat hij
 *    bewees geldt voor een andere major. `npm run poort` heeft daar al een zin
 *    voor — *"niets staat rood, maar N controle(s) hebben niets gemeten"* — en
 *    die zin klopt hier woordelijk.
 *
 * ⚠️ **Het productienummer staat hier gepind en niet opgehaald.** Ophalen vraagt
 *    credentials van het echte project, en dan zou deze controle in de poort
 *    altijd overgeslagen worden en dus nooit iets zeggen. De pin is gemeten en
 *    draagt zijn datum; klopt hij niet meer, dan is dát het defect.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { psqlArgumenten, verbindingsmelding, verbindingsoordeel } from './psql.mjs';

/**
 * De major van het Supabase-project.
 *
 * 📏 Gemeten op 06-09-2026 tegen `wehgocadxehottiiyvsc`:
 *    `PostgreSQL 17.6 on x86_64-pc-linux-gnu`, `server_version_num` = 170006.
 *
 * ⚠️ Verhoogt Supabase de major, dan hoort dit getal mee te verhuizen én hoort
 *    de lokale stack te volgen. Blijft hij achter, dan zegt deze controle
 *    voortaan dat de suite ongemeten is — en dat is dan waar.
 */
export const PG_MAJOR_PRODUCTIE = 17;

/** De datum waarop dat getal tegen het echte project gemeten is. */
export const PG_MAJOR_GEMETEN_OP = '2026-09-06';

/**
 * De major uit `server_version_num`.
 *
 * ⚠️ Uit het **nummer** en niet uit `version()`. Die tekst verschilt per
 *    distributie en per build (`PostgreSQL 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)`),
 *    en een regex daarop is een controle die op de verkeerde machine iets anders
 *    vindt. `server_version_num` is één integer met een vaste vorm.
 *
 * @param {unknown} nummer
 * @returns {number | null}
 */
export function majorUit(nummer) {
  const tekst = String(nummer ?? '').trim();
  if (!/^\d+$/.test(tekst)) return null;

  const n = Number(tekst);
  // 170006 → 17, 160013 → 16. Sinds Postgres 10 is dit de vorm.
  const major = Math.floor(n / 10000);
  return major >= 10 && major < 100 ? major : null;
}

/**
 * @param {{ lokaal: number | null, productie: number }} opties
 * @returns {{ soort: 'gelijk' | 'ongelijk' | 'onleesbaar', melding: string }}
 */
export function oordeel({ lokaal, productie }) {
  if (lokaal === null) {
    return {
      soort: 'onleesbaar',
      melding:
        'De lokale server gaf geen bruikbare `server_version_num` terug. Dat is geen ' +
        'versieverschil maar een kapotte meting, en die hoort niet als "gelijk" te tellen.',
    };
  }

  if (lokaal === productie) {
    return {
      soort: 'gelijk',
      melding: `lokaal en productie draaien allebei Postgres ${lokaal}.`,
    };
  }

  return {
    soort: 'ongelijk',
    melding:
      `de lokale stack draait Postgres ${lokaal} en productie draait ${productie} ` +
      `(gemeten ${PG_MAJOR_GEMETEN_OP}). De RLS-suite heeft dus gedraaid, maar bewijst ` +
      `gedrag op een andere major dan er live staat.\n` +
      `  Installeer Postgres ${productie} en bouw de stack opnieuw op, of weet dat deze ` +
      `ronde op dit punt ongemeten is.`,
  };
}

/** Leest `server_version_num` van de lokale stack. */
export function leesLokaleMajor(env = process.env) {
  const uit = spawnSync('psql', psqlArgumenten('show server_version_num', env), {
    encoding: 'utf8',
    env,
  });

  if (uit.status !== 0) {
    return { ok: /** @type {const} */ (false), melding: `${uit.stderr ?? ''}${uit.error ?? ''}` };
  }

  return { ok: /** @type {const} */ (true), major: majorUit(uit.stdout) };
}

const NAAM = 'pg-versie-controle';
const LEEST =
  'Deze controle leest `server_version_num` van de dráaiende stack; de\n' +
  'migratiebestanden zeggen niets over de versie waarop ze afgespeeld worden.';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gelezen = leesLokaleMajor();

  if (!gelezen.ok) {
    // Zelfde indeling als elke andere controle die psql aanroept: alleen
    // `geen-server` en `geen-database` heten OVERGESLAGEN; een geweigerde
    // gebruiker is rood, want de database ligt er gewoon (QS8-268).
    const melding = verbindingsmelding({ naam: NAAM, leest: LEEST, melding: gelezen.melding });
    console.error(melding);
    process.exit(verbindingsoordeel(gelezen.melding) === 'geweigerd' ? 1 : 0);
  }

  const uitkomst = oordeel({ lokaal: gelezen.major, productie: PG_MAJOR_PRODUCTIE });

  if (uitkomst.soort === 'onleesbaar') {
    console.error(`✗ ${NAAM}\n\n${uitkomst.melding}`);
    process.exit(1);
  }

  if (uitkomst.soort === 'ongelijk') {
    // ⚠️ OVERGESLAGEN en niet rood — zie de kop. De poort telt deze stap dan bij
    //    "niets staat rood, maar N controle(s) hebben niets gemeten", en dat is
    //    hier precies de waarheid.
    console.error(`⚠ ${NAAM}: OVERGESLAGEN — ${uitkomst.melding}`);
    process.exit(0);
  }

  console.log(`${NAAM}: ${uitkomst.melding}`);
}

export { NAAM, LEEST };
