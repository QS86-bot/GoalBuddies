#!/usr/bin/env node
/**
 * migratie-nieuw — een migratiebestand met een nummer dat niemand anders claimt.
 *
 * ⚠️ **Waarom dit bestaat, met de cijfers erbij.** Op 28-08-2026 botsten
 *    migratienummers **drie keer op één dag**: `0107`–`0109` moesten naar
 *    `0111`–`0113` omdat een parallelle sessie die nummers eerder had, `0119`
 *    lag stil achter een `0118` die nog niet geland was, en tijdens het schrijven
 *    van dít script stond `main` alweer op `0123` terwijl de werkbranch op
 *    `0121` zat.
 *
 * ⚠️ **De fout zit niet in het tellen maar in wáár je telt.** Wie `max + 1` neemt
 *    uit zijn eigen map, kiest het nummer dat de collega een uur geleden ook koos.
 *    Dit script kijkt daarom naar **elke branch die de remote kent**, niet alleen
 *    naar de werkkopie — inclusief branches waarvan de PR nog niet geland is,
 *    want juist díé dragen de nummers die nog niet in `main` staan.
 *
 * ⚠️ **Het is geen slot en dat kan het ook niet zijn.** Twee sessies die op
 *    dezelfde seconde beginnen, krijgen hetzelfde nummer — daar helpt alleen een
 *    reservering die je commit. Wat dit wél wegneemt is het gewone geval: iemand
 *    die begint terwijl er al werk elders ligt. Dat waren alle drie de botsingen
 *    van 28-08.
 *
 * Draaien: `npm run migratie:nieuw -- "korte naam met streepjes"`.
 * Met `--droog` schrijft hij niets en zegt hij alleen welk nummer vrij is.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { nummersPerBranch as nummersPerBranchVolledig } from './migratiebranches.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAP = 'supabase/migrations';

/**
 * De vier cijfers uit een migratiebestandsnaam.
 *
 * ⚠️ Alleen aan het begin en precies vier. `0039a_...` telt als 39 — een
 *    achtervoegsel is nazorg op een bestaand nummer en claimt er geen nieuw.
 */
export function nummerUit(bestandsnaam) {
  const m = /^(\d{4})[a-z]?_/.exec(bestandsnaam);
  return m ? Number(m[1]) : null;
}

/** Het hoogste nummer in een lijst bestandsnamen; 0 als er geen enkel in zit. */
export function hoogsteIn(bestandsnamen) {
  const nummers = bestandsnamen.map(nummerUit).filter((n) => n !== null);
  return nummers.length === 0 ? 0 : Math.max(...nummers);
}

/**
 * Het eerste vrije nummer, gegeven wat er lokaal staat en wat elke branch draagt.
 *
 * ⚠️ Het maximum over **alles**, en niet het eerste gat. Een gat vullen ziet er
 *    zuinig uit en is het niet: `migraties:controle` wordt rood van een gat, dus
 *    een gat betekent dat er ergens een bestand ontbreekt dat nog moet landen.
 *    Ga daar niet bovenop zitten.
 */
export function volgendVrijNummer({ lokaal, perBranch }) {
  const hoogste = Math.max(hoogsteIn(lokaal), ...Object.values(perBranch).map((n) => n ?? 0), 0);
  return hoogste + 1;
}

/** Welke branches een hóger nummer dragen dan de werkkopie — die zijn het gevaar. */
export function branchesVoorOp({ lokaal, perBranch }) {
  const hier = hoogsteIn(lokaal);
  return Object.entries(perBranch)
    .filter(([, n]) => (n ?? 0) > hier)
    .map(([branch, n]) => ({ branch, hoogste: n }))
    .sort((a, b) => b.hoogste - a.hoogste);
}

/**
 * Per branch het hoogste nummer, afgeleid uit de gedeelde scan.
 *
 * ⚠️ **De scan zelf staat sinds QS8-238 in `migratiebranches.mjs`**, want
 *    `migraties:controle` heeft hem óók nodig — en daar met de vólledige
 *    verzameling in plaats van alleen het hoogste. Twee bijna gelijke git-scans
 *    naast elkaar is precies hoe ze uit elkaar gaan lopen.
 *
 * ⚠️ Dit script had genoeg aan het hoogste nummer: het kiest er een vrij. De
 *    controle heeft alles nodig, want een branch die 0126 t/m 0130 draagt terwijl
 *    deze map op 0125 staat, geeft als hoogste 0130 — en dan weet je nog steeds
 *    niet dat 0126 t/m 0129 ook ontbreken.
 */
function nummersPerBranch() {
  const volledig = nummersPerBranchVolledig();
  if (volledig === null) return {};

  const perBranch = {};
  for (const [branch, nummers] of Object.entries(volledig)) {
    perBranch[branch] = nummers.length === 0 ? 0 : Math.max(...nummers);
  }
  return perBranch;
}

/** De kop die onwrikbare regel 20 eist: een rollback-pad, vanaf regel één. */
export function sjabloon({ nummer, naam }) {
  const bestand = `${String(nummer).padStart(4, '0')}_${naam}.sql`;
  return `-- ${bestand} — <waarom deze migratie bestaat, in één regel>
--
-- ROLLBACK-PAD:
--   <de SQL die dit terugdraait, of "n.v.t. — voegt alleen toe">
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- <de meting die deze migratie nodig maakte, niet de redenering>
--
-- ---------------------------------------------------------------------------

`;
}

function hoofd() {
  const argumenten = process.argv.slice(2).filter((a) => a !== '--droog');
  const droog = process.argv.includes('--droog');
  const naam = (argumenten[0] ?? '').trim().replace(/\s+/g, '_').toLowerCase();

  const lokaal = readdirSync(join(WORTEL, MAP)).filter((n) => n.endsWith('.sql'));
  const perBranch = nummersPerBranch();
  const nummer = volgendVrijNummer({ lokaal, perBranch });
  const voorop = branchesVoorOp({ lokaal, perBranch });

  if (voorop.length > 0) {
    process.stdout.write(
      `⚠ ${voorop.length} branch(es) dragen een hoger nummer dan deze werkkopie (${hoogsteIn(lokaal)}):\n`,
    );
    for (const v of voorop) process.stdout.write(`    ${String(v.hoogste).padStart(4, '0')}  ${v.branch}\n`);
    process.stdout.write('\n');
  }

  if (naam === '') {
    process.stdout.write(`Eerste vrije nummer: ${String(nummer).padStart(4, '0')}\n`);
    process.stdout.write('Geef een naam mee om het bestand te maken:\n');
    process.stdout.write('  npm run migratie:nieuw -- "de_klok_van_de_groep"\n');
    return;
  }

  const bestand = `${String(nummer).padStart(4, '0')}_${naam}.sql`;
  if (droog) {
    process.stdout.write(`(droog) zou aanmaken: ${MAP}/${bestand}\n`);
    return;
  }

  writeFileSync(join(WORTEL, MAP, bestand), sjabloon({ nummer, naam }), { flag: 'wx' });
  process.stdout.write(`✓ ${MAP}/${bestand}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
