/**
 * Persoonsgegevens uit foutmeldingen halen, vóór ze het apparaat verlaten.
 *
 * ⚠️ Dit is niet alleen een AVG-kwestie. Domeinregel 7 zegt dat falen nooit
 *    publiek is, en een foutrapport is publiek genoeg: een crash bij het
 *    afsluiten van een gemiste week mag niet met de tekst van die week in een
 *    dashboard belanden waar iemand anders meekijkt.
 *
 * Daarom een **allowlist** en geen blocklist. Bij een blocklist is elk veld dat
 * later aan het datamodel wordt toegevoegd standaard lekbaar, en dat merk je
 * pas als het al gebeurd is.
 */

/**
 * Sleutels die veilig meegaan. Allemaal technisch: geen van deze velden bevat
 * iets dat een gebruiker zelf heeft ingetypt.
 */
const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'where',
  'name',
  'code',
  'status',
  'httpStatus',
  'table',
  'operation',
  'platform',
  'count',
  'durationMs',
  'retryCount',
  'cycleIndex',
]);

/** Sleutels die een id dragen. Een uuid zegt niets zonder toegang tot de database. */
const ID_KEY = /(?:^|_)id$|Id$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** JWT's en Supabase-keys beginnen allemaal met `eyJ`. */
const TOKEN = /eyJ[\w-]+\.[\w-]+(\.[\w-]+)?/g;
/** Waarden tussen enkele of dubbele aanhalingstekens in Postgres-meldingen. */
const QUOTED = /'[^']{0,500}'|"[^"]{0,500}"/g;

export const REDACTED = '[weggelaten]';

/** Een foutmelding zonder e-mailadressen, tokens of geciteerde waarden. */
export function scrubMessage(message: string): string {
  return message
    .replace(EMAIL, '[e-mail]')
    .replace(TOKEN, '[token]')
    // Postgres citeert de waarde die een constraint brak. Precies de waarde die
    // je niet wilt versturen: "Key (invite_code)=(zomer-2026) already exists".
    .replace(QUOTED, REDACTED)
    .slice(0, 500);
}

function scrubValue(value: unknown): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return scrubMessage(value);
  return REDACTED;
}

/**
 * Houdt alleen wat op de allowlist staat, plus id-velden die er als uuid
 * uitzien. De rest wordt vervangen, niet weggelaten — dat een veld bestond is
 * zelf nuttige informatie bij het uitzoeken.
 */
export function scrubContext(extra: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(extra)) {
    if (ALLOWED_KEYS.has(key)) {
      out[key] = scrubValue(value);
      continue;
    }
    if (ID_KEY.test(key) && typeof value === 'string' && UUID.test(value)) {
      out[key] = value;
      continue;
    }
    out[key] = REDACTED;
  }

  return out;
}
