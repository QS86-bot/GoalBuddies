#!/usr/bin/env node
/**
 * stand — de migratiestand in `WERKVOORRAAD` §2 genereren in plaats van overtypen.
 *
 * ⚠️ **Waarom dit bestaat.** Op 28-08-2026 gaf élke PR een merge-conflict op
 *    dezelfde alinea: *"Migraties 0001 t/m X staan in de map: N bestanden"*.
 *    Vier PR's, vier keer met de hand oplossen, en twee van die vier keer stond
 *    er daarna een getal in dat niet klopte — 121 registerrijen tegen 120
 *    bestanden, en één keer "alle 117 op productie" terwijl het er 120 waren.
 *
 * ⚠️ **Dat is precies de regel die dit project zichzelf oplegde en hier zelf
 *    brak.** QS8-125: *wie kopieën met de hand onderhoudt, maakt het probleem
 *    groter.* Deze alinea ís een kopie — van `supabase/migrations/`. Een
 *    gegenereerd blok kan niet uiteenlopen met de map, en twee sessies die het
 *    allebei regenereren, schrijven letterlijk dezelfde regels: geen conflict.
 *
 * ⚠️ **Alleen wat uit de repo te meten valt.** Wélke migraties op productie
 *    staan is géén eigenschap van de map, en dat blijft dus met de hand
 *    geschreven proza eronder — met `register:controle` als grendel. Een
 *    generator die dat erbij verzint, is een kopie met extra stappen.
 *
 * Draaien: `npm run stand` schrijft het blok. `npm run stand -- --controle`
 * zegt alleen of het achterloopt, en die vorm draait mee in `docs:controle`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const DOCUMENT = 'docs/WERKVOORRAAD.md';

export const BEGIN = '<!-- STAND:BEGIN — gegenereerd door `npm run stand` -->';
export const EINDE = '<!-- STAND:EINDE -->';

/**
 * De regels zoals ze in het document horen te staan.
 *
 * ⚠️ Geen datum erin, en dat is met opzet. Een gegenereerd blok met "bijgewerkt
 *    op <vandaag>" verandert elke dag zonder dat er iets veranderd is, en dan is
 *    de conflictbron terug — alleen nu met een stempel die betrouwbaar oogt.
 */
export function standRegels(bestandsnamen) {
  const sql = bestandsnamen.filter((n) => n.endsWith('.sql')).sort();
  const genummerd = sql.filter((n) => /^\d{4}_/.test(n));
  const metLetter = sql.filter((n) => /^\d{4}[a-z]_/.test(n));

  const nummers = genummerd.map((n) => Number(n.slice(0, 4)));
  const laagste = nummers.length > 0 ? Math.min(...nummers) : 0;
  const hoogste = nummers.length > 0 ? Math.max(...nummers) : 0;
  const gaten = [];
  for (let n = laagste; n <= hoogste; n += 1) {
    if (!nummers.includes(n)) gaten.push(String(n).padStart(4, '0'));
  }

  const vier = (n) => `\`${String(n).padStart(4, '0')}\``;
  const achtervoegsels = metLetter.map((n) => `\`${n.slice(0, 5)}\``).join(', ');

  const regels = [
    `Migraties ${vier(laagste)} t/m ${vier(hoogste)} staan in de map: **${sql.length} bestanden**,`,
    `waarvan ${metLetter.length} met een letter-achtervoegsel (${achtervoegsels}).`,
  ];

  regels.push(
    gaten.length === 0
      ? 'De nummering is aaneengesloten.'
      : `⚠️ **Er ontbreken nummers: ${gaten.join(', ')}.** Zie \`migraties:controle\`.`,
  );

  return regels.join('\n');
}

/** Het blok zoals het nu in het document staat, of `null` als het er niet is. */
export function blokUit(document) {
  const van = document.indexOf(BEGIN);
  const tot = document.indexOf(EINDE);
  if (van === -1 || tot === -1 || tot < van) return null;
  return document.slice(van + BEGIN.length, tot).trim();
}

/**
 * Zet een nieuw blok in het document.
 *
 * ⚠️ Ontbreken de markeringen, dan is dat een fout en geen stille toevoeging.
 *    Een generator die het blok er zelf bij plakt op een plek die hij kiest,
 *    zet de stand een keer middenin een andere paragraaf — en dan is het
 *    document stuk op een manier die niemand terugleest.
 */
export function vervangBlok(document, tekst) {
  const van = document.indexOf(BEGIN);
  const tot = document.indexOf(EINDE);
  if (van === -1 || tot === -1 || tot < van) {
    throw new Error(`De markeringen ${BEGIN} … ${EINDE} staan niet in het document.`);
  }
  return `${document.slice(0, van + BEGIN.length)}\n${tekst}\n${document.slice(tot)}`;
}

function hoofd() {
  const alleenControleren = process.argv.includes('--controle');
  const pad = join(WORTEL, DOCUMENT);
  const document = readFileSync(pad, 'utf8');
  const verwacht = standRegels(readdirSync(join(WORTEL, 'supabase/migrations')));
  const huidig = blokUit(document);

  if (huidig === verwacht) {
    if (!alleenControleren) process.stdout.write('stand: het blok klopt al.\n');
    return;
  }

  if (alleenControleren) {
    process.stderr.write('✗ Het stand-blok in WERKVOORRAAD §2 loopt achter op de migratiemap.\n\n');
    process.stderr.write(`  er staat:\n${(huidig ?? '(geen blok gevonden)').replace(/^/gm, '    ')}\n\n`);
    process.stderr.write(`  het hoort te zijn:\n${verwacht.replace(/^/gm, '    ')}\n\n`);
    process.stderr.write('Draai `npm run stand`. Met de hand bijwerken heeft geen zin —\n');
    process.stderr.write('dit blok is een kopie van de map en hoort er ook een te blijven.\n');
    process.exitCode = 1;
    return;
  }

  writeFileSync(pad, vervangBlok(document, verwacht));
  process.stdout.write('✓ stand-blok bijgewerkt in WERKVOORRAAD §2.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
