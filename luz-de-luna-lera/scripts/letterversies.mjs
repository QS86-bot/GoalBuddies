/**
 * Mag de Supabase CLI migraties toepassen in dit project? — QS8-251.
 *
 * ⚠️ **Waarom dit een eigen bestand is.** `migraties-controle.mjs` doet zijn werk
 *    op moduleniveau en eindigt met `process.exit()`. Importeren om één functie
 *    te toetsen zou dus het hele script uitvoeren. Zelfde scheiding als
 *    `migratieregister-omgeving.mjs`, en om dezelfde reden: **een controle die je
 *    niet kunt voeden, kun je niet ijken.**
 *
 * ⚠️ **Wat er misging, en het stond al maanden opgeschreven.**
 *    `docs/decisions/004-migratieregister.md` zei in juli met zoveel woorden:
 *    *"Dit project gebruikt de CLI niet voor het toepassen van migraties."* De
 *    reden is een deelmigratie met een letter — `0039a`, `0041a`, `0052a`.
 *    Sommige CLI-versies lezen een bestandsnaam met `^([0-9]+)_` en slaan die
 *    drie **stilzwijgend** over.
 *
 *    En tóch stond er in `package.json`:
 *
 *      "db:push": "npm run db:dump && supabase db push && npm run register:controle -- --streng"
 *
 *    …en presenteerde `docs/DEPLOY.md` §2.2b dat als hét pad. Eén vraag, twee
 *    documenten, twee antwoorden — dezelfde vorm als QS8-125.
 *
 * ⚠️ **Dit is regel 18 vraag 4 in zijn zuiverste vorm.** Elk onderdeel klopte:
 *    het beslisdocument was goed onderbouwd, `register:controle --streng` werkt,
 *    en de CLI doet precies wat zijn eigen regex zegt. Wat ontbrak was de
 *    verbínding — niemand legde het besluit "niet met de CLI" naast het script
 *    dat de CLI aanroept. Er was geen test die de belofte kón raken, want die
 *    belofte stond alleen in proza.
 */

/**
 * Welke bestandsnamen een letter achter hun nummer dragen.
 *
 * ⚠️ Een deelmigratie is nazorg op een bestaand nummer (`0039a` hoort bij 0039)
 *    en is met opzet niet hernummerd: die nummers stáán zo in het register op
 *    productie. Hernummeren maakt de map onverenigbaar met wat er draait —
 *    QS8-122 en QS8-237.
 *
 * @param {readonly string[] | undefined} bestandsnamen
 * @returns {string[]}
 */
export function letterversies(bestandsnamen) {
  return [...(bestandsnamen ?? [])].filter((n) => /^\d{4}[a-z]_[a-z0-9_]+\.sql$/.test(n)).sort();
}

/**
 * Welke npm-scripts de CLI migraties laten toepassen.
 *
 * ⚠️ **Alleen `db push` en `migration repair`, en niet elke `supabase`-aanroep.**
 *    `supabase functions deploy` en `supabase secrets set` raken de migratiemap
 *    niet en zijn juist het normale pad; die meemelden maakt de controle
 *    onbruikbaar, en een controle die te veel meldt leer je uitzetten.
 *
 * @param {Record<string, string> | undefined} scripts
 * @returns {{naam: string, commando: string}[]}
 */
export function cliMigratiescripts(scripts) {
  const uit = [];
  for (const [naam, commando] of Object.entries(scripts ?? {})) {
    if (/\bsupabase\s+db\s+push\b/.test(commando) || /\bsupabase\s+migration\s+repair\b/.test(commando)) {
      uit.push({ naam, commando });
    }
  }
  return uit.sort((a, b) => a.naam.localeCompare(b.naam));
}

/**
 * Het oordeel: een script dat de CLI laat pushen terwijl er letterversies staan.
 *
 * ⚠️ **Beide voorwaarden, en dat is geen slap aftreksel.** Zonder letterversies
 *    is `supabase db push` gewoon een geldig pad, en dan is dit script een
 *    verbod op iets dat werkt. De tegenspraak ontstaat pas als de map iets bevat
 *    dat de CLI niet kan lezen.
 *
 * @param {{scripts?: Record<string, string> | undefined,
 *          bestandsnamen?: readonly string[] | undefined}} invoer
 * @returns {string[]} één melding per script, of leeg
 */
export function cliTegenspraak({ scripts, bestandsnamen }) {
  const letters = letterversies(bestandsnamen);
  if (letters.length === 0) return [];

  return cliMigratiescripts(scripts).map(
    ({ naam }) =>
      `Het script "${naam}" laat de Supabase CLI migraties toepassen, maar ` +
      `${letters.length} migratie(s) dragen een letter (${letters.map((n) => n.slice(0, 5)).join(', ')}). ` +
      'Sommige CLI-versies lezen `^([0-9]+)_` en slaan die stilzwijgend over — dan sta je ' +
      'met een half toegepaste set op productie. Gebruik de psql-route uit docs/DEPLOY.md §2.2b.',
  );
}
