#!/usr/bin/env node
/**
 * lockfile-controle — spreekt `package-lock.json` zichzelf tegen op een manier
 * die `npm audit` niet ziet? QS8-679.
 *
 * ⚠️ **Waarom dit bestaat.** `audit:controle` leunt op `npm audit`, en `npm audit`
 *    leest de lockfile en niet wat `npm ci` installeert. 📏 Drie vervalsingen zijn
 *    met de hand nagemaakt (npm 10.9.9, `lodash`/`minimist`, in een scratchmap) en
 *    elke keer meldde `npm audit` **nul** advisories terwijl `npm ci` slaagde:
 *
 *      1. `version` zegt iets anders dan het tarball in `resolved` — de lock zegt
 *         4.18.1 en `resolved` wijst naar 4.17.20: `npm audit` 0, `npm ci`
 *         installeert 4.17.20.
 *      2. een aliasregel (`npm:lodash@…`) zonder `name` — `npm audit` 0, het
 *         pakket staat onder de aliasnaam.
 *      3. `dev: true` op een pakket dat vanuit `dependencies` bereikbaar is —
 *         `npm audit --omit=dev` 0 in plaats van 2, **ook mét `node_modules`**.
 *
 *    Een vierde, een `integrity` die niet bij het tarball past, faalt al in
 *    `npm ci` zelf (`EINTEGRITY`, gemeten). Daarom controleert dit script
 *    `integrity` niet op waarde — dat kan offline niet — maar wel dat hij er is.
 *
 * ⚠️ **Wat hij níet kan.** Hij toetst dat de lock met zichzelf klopt. Een lock die
 *    klopt met zichzelf en naar een ander pakket wijst dan `package.json` bedoelt
 *    (een kwaadaardig tarball met een eigen, geldige `integrity`) valt erbuiten:
 *    dat is een vraag op registerniveau en geen eigenschap van dit bestand.
 *
 * ⚠️ **Offline, zonder nieuwe dependency.** Hij leest alleen de twee bestanden.
 *    Een lock die niet te lezen is, is geen groene uitslag maar een rode.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** `https://registry.npmjs.org/@babel/core/-/core-7.0.0.tgz` → naam en bestand. */
const TARBALL = /^https?:\/\/[^/]+\/((?:@[^/]+\/)?[^/]+)\/-\/([^/]+\.tgz)$/;

/** De naam die het pad van een lock-regel draagt: wat na de laatste `node_modules/` staat. */
export function naamUitPad(pad) {
  const i = pad.lastIndexOf('node_modules/');
  return i === -1 ? null : pad.slice(i + 'node_modules/'.length);
}

/** Waar een afhankelijkheid vanaf `vanPad` terechtkomt, zoals Node hem zoekt. */
export function oplossen(pakketten, vanPad, naam) {
  let basis = vanPad;
  for (;;) {
    const kandidaat = `${basis ? `${basis}/` : ''}node_modules/${naam}`;
    if (Object.hasOwn(pakketten, kandidaat)) return kandidaat;
    if (!basis) return null;
    const i = basis.lastIndexOf('/node_modules/');
    basis = i === -1 ? '' : basis.slice(0, i);
  }
}

const KANTEN = ['dependencies', 'optionalDependencies', 'peerDependencies'];

/** Alle regels die vanuit de wortel bereikbaar zijn zonder een `devDependencies`-kant. */
export function productieRegels(pakketten) {
  const gezien = new Set();
  const wachtrij = [''];
  while (wachtrij.length > 0) {
    const pad = wachtrij.pop();
    if (gezien.has(pad)) continue;
    gezien.add(pad);
    wachtrij.push(...buren(pakketten, pad));
  }
  return gezien;
}

/** De regels waar `pad` naar wijst, via zijn afhankelijkheden of (bij een link) zijn bestemming. */
function buren(pakketten, pad) {
  const regel = pakketten[pad] ?? {};
  // ⚠️ Een link wijst naar een regel elders in de lock; de bestemming telt mee.
  const uit = regel.link && typeof regel.resolved === 'string' ? [regel.resolved] : [];
  const namen = KANTEN.flatMap((soort) => Object.keys(regel[soort] ?? {}));
  for (const naam of namen) {
    const doel = oplossen(pakketten, pad, naam);
    if (doel !== null) uit.push(doel);
  }
  return uit;
}

/**
 * Eén registerregel naast zijn eigen tarball: versie, naam en integriteit.
 *
 * @param {string} pad
 * @param {Record<string, any>} regel
 * @param {string} urlNaam  de pakketnaam in de `resolved`-URL
 * @param {string} bestand  de bestandsnaam van het tarball
 */
export function controleerRegel(pad, regel, urlNaam, bestand) {
  const klachten = [];
  const padNaam = naamUitPad(pad);
  const basis = urlNaam.slice(urlNaam.lastIndexOf('/') + 1);

  // 1. De versie hoort bij het tarball.
  if (bestand !== `${basis}-${regel.version}.tgz`) {
    klachten.push(`${pad}: version '${regel.version}' hoort niet bij ${regel.resolved}`);
  }
  // 2. De naam hoort bij het tarball, of de regel zegt dat hij een alias is.
  const verwacht = regel.name ?? padNaam;
  if (verwacht !== urlNaam) {
    klachten.push(
      regel.name === undefined
        ? `${pad}: staat onder '${padNaam}' maar het tarball is van '${urlNaam}' en de regel mist \`name\` (alias zonder naam)`
        : `${pad}: \`name\` is '${regel.name}' maar het tarball is van '${urlNaam}'`,
    );
  }
  // 3. Zonder integriteit is er niets dat `npm ci` kan toetsen.
  if (typeof regel.integrity !== 'string' || !/^sha(?:256|384|512)-/.test(regel.integrity)) {
    klachten.push(`${pad}: heeft geen bruikbare \`integrity\``);
  }
  return klachten;
}

/**
 * @param {{ packages?: Record<string, any> } | null} lock
 * @returns {{ klachten: string[], geteld: { registry: number, overgeslagen: number } }}
 */
export function controleer(lock) {
  const pakketten = lock?.packages;
  const klachten = [];
  const geteld = { registry: 0, overgeslagen: 0 };
  if (typeof pakketten !== 'object' || pakketten === null) {
    return { klachten: ['package-lock.json heeft geen `packages` (lockfileVersion 1?): niet te beoordelen'], geteld };
  }

  for (const [pad, regel] of Object.entries(pakketten)) {
    if (pad === '' || regel.link || typeof regel.resolved !== 'string') continue;
    const m = TARBALL.exec(regel.resolved);
    if (m === null) {
      geteld.overgeslagen += 1;
      continue;
    }
    geteld.registry += 1;
    klachten.push(...controleerRegel(pad, regel, m[1], m[2]));
  }

  // 4. Een regel die vanuit `dependencies` bereikbaar is, is geen dev-regel.
  for (const pad of productieRegels(pakketten)) {
    if (pad !== '' && pakketten[pad]?.dev === true) {
      klachten.push(`${pad}: staat op \`dev: true\` maar is bereikbaar vanuit dependencies — \`--omit=dev\` slaat hem over`);
    }
  }
  return { klachten, geteld };
}

export function hoofd(lees = () => JSON.parse(readFileSync(join(WORTEL, 'package-lock.json'), 'utf8'))) {
  let lock;
  try {
    lock = lees();
  } catch (fout) {
    console.error(`✗ lockfile-controle: package-lock.json is niet te lezen (${fout?.message ?? 'onbekend'}).`);
    return 1;
  }
  const { klachten, geteld } = controleer(lock);
  for (const k of klachten) console.error(`✗ ${k}`);
  if (klachten.length > 0) {
    console.error(
      '\nDe lockfile spreekt zichzelf tegen op een manier die `npm audit` niet ziet. Herstel hem met\n' +
        '`npm install --package-lock-only` en bekijk wat er veranderde; maak hem niet met de hand recht.',
    );
    return 1;
  }
  console.log(
    `lockfile-controle: ${geteld.registry} registerregels kloppen met hun tarball` +
      (geteld.overgeslagen > 0 ? ` (${geteld.overgeslagen} niet van het register, overgeslagen)` : '') +
      ', en geen dev-vlag staat op een productieregel.',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pad = process.argv[2];
  process.exit(hoofd(pad ? () => JSON.parse(readFileSync(pad, 'utf8')) : undefined));
}
