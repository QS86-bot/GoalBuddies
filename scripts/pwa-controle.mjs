#!/usr/bin/env node
/**
 * pwa-controle — de bevinding van 23-08 over de servicewormer-scope.
 *
 * De bevinding zei: `public/manifest.json` gebruikt `start_url: "/"` en
 * `scope: "/"`, terwijl `docs/DEPLOY.md` een `.htaccess` met
 * `RewriteBase /goalbuddies/` beschreef. Draait de app onder een pad, dan staat
 * de worker op `/goalbuddies/sw.js`, bedient hij alleen dat pad, en klopt geen
 * van de absolute verwijzingen meer.
 *
 * ⚠️ **Op 25-08-2026 nagetrokken, en de spanning bestaat niet meer.**
 *    `scripts/deploy-web.mjs` schrijft de `.htaccess` en die kent geen enkele
 *    `RewriteBase` — alleen `RewriteEngine On`. `docs/DEPLOY.md` zegt op zijn
 *    beurt: "Er is géén pad-voorvoegsel meer. Het subdomein heeft een eigen
 *    documentroot (`public_html/goalbuddies`), dus de app staat in de root van
 *    dat adres." Wat er nog stond was een waarschuwing die verwees naar een
 *    `RewriteBase` "hierboven" die er niet meer is.
 *
 *    ⚠️ En de meting van 25-08 in `docs/ENGINEER-REVIEW.md` — "terwijl de app
 *    onder `/goalbuddies/` draait" — was fout. `public_html/goalbuddies` is het
 *    pad op de schíjf; het adres is een subdomein, en dat is iets anders. Zie de
 *    rij daar.
 *
 * ⚠️ **Waarom er dan toch een controle staat.** De bevinding eindigde met een
 *    vraag: hoort een deploy `/sw.js` en `/manifest.json` op te vragen en op
 *    status én content-type te toetsen? Het antwoord is ja, en dit is dat — plus
 *    de statische helft, die zonder netwerk draait en dus in CI past.
 *
 *    De reden is niet dat het vandaag fout staat, maar dat het stil fout kan
 *    gáán: verhuist de app ooit naar een pad, dan blijft alles werken behalve de
 *    meldingen, en dat merk je pas als iemand klaagt dat hij niets krijgt.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/** De paden die een PWA in de root nodig heeft, met wat de server moet zeggen. */
export const VERPLICHTE_PADEN = [
  { pad: '/manifest.json', type: /application\/(manifest\+json|json)/ },
  { pad: '/sw.js', type: /(application|text)\/javascript/ },
];

/**
 * Het padgedeelte van de app-URL: `''` voor een root, `/iets` voor een
 * onderpad.
 *
 * ⚠️ `https://goalbuddies.q-projects.tech` levert `''` en niet `/`. Dat
 *    onderscheid is de hele bevinding: een subdomein met een eigen documentroot
 *    is iets anders dan een map op een domein, ook al heet die map hetzelfde.
 */
export function padVan(url) {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    return p === '' ? '' : p;
  } catch {
    return null;
  }
}

/**
 * Klopt het manifest met het adres waarop de app draait?
 *
 * ⚠️ Toetst de verhouding en niet een vaste waarde. Zou hier `scope === '/'`
 *    staan, dan is deze controle een tweede plek waar het antwoord vastligt — en
 *    dan gaat hij niet af bij een verhuizing maar bij de reparatie ervan.
 */
export function beoordeelManifest({ manifest, appUrl }) {
  const pad = padVan(appUrl);
  if (pad === null) return [`\`${appUrl}\` is geen geldige URL, dus er valt niets tegen te leggen.`];

  const verwacht = pad === '' ? '/' : `${pad}/`;
  const fouten = [];

  for (const sleutel of ['start_url', 'scope', 'id']) {
    const waarde = manifest[sleutel];
    if (typeof waarde !== 'string') {
      fouten.push(`\`${sleutel}\` ontbreekt in het manifest.`);
      continue;
    }
    if (!waarde.startsWith(verwacht)) {
      fouten.push(
        `\`${sleutel}\` is "${waarde}", maar de app draait op "${appUrl}" en dan hoort hij met ` +
          `"${verwacht}" te beginnen. Een servicewormer bedient nooit meer dan zijn eigen map.`,
      );
    }
  }

  for (const icoon of manifest.icons ?? []) {
    if (typeof icoon.src === 'string' && icoon.src.startsWith('/') && !icoon.src.startsWith(verwacht)) {
      fouten.push(`icoon "${icoon.src}" is absoluut en valt buiten "${verwacht}".`);
    }
  }

  return fouten;
}

/**
 * Beoordeelt wat de server na een deploy teruggaf op de verplichte paden.
 *
 * ⚠️ Een aparte functie en geen `fetch` erin, zodat hij te ijken is zonder
 *    netwerk. Deze werkplek kan `goalbuddies.q-projects.tech` niet bereiken — de
 *    agent-proxy geeft 403 op de CONNECT-tunnel — dus de netwerkhelft is hier
 *    alleen door zijn test bewezen en niet tegen de echte site.
 *
 * ⚠️ **Een 200 met de verkeerde content-type is óók fout, en dat is niet
 *    theoretisch.** Apache serveert een onbekende extensie als
 *    `application/octet-stream`, en een browser weigert dan een servicewormer te
 *    registreren zonder dat er iets zichtbaars stukgaat. Precies het soort
 *    verschil dat pas opvalt als iemand klaagt dat hij geen meldingen krijgt.
 */
export function beoordeelAntwoorden(antwoorden) {
  const fouten = [];

  for (const { pad, type } of VERPLICHTE_PADEN) {
    const antwoord = antwoorden.find((a) => a.pad === pad);
    if (!antwoord) {
      fouten.push(`${pad} is niet opgevraagd.`);
      continue;
    }
    if (antwoord.status !== 200) {
      fouten.push(`${pad} gaf ${antwoord.status} in plaats van 200.`);
      continue;
    }
    if (!type.test(antwoord.contentType ?? '')) {
      fouten.push(
        `${pad} gaf 200 maar met content-type "${antwoord.contentType ?? '(geen)'}". ` +
          'Een browser weigert dat, en stil.',
      );
    }
  }

  return fouten;
}

function hoofd() {
  const manifest = JSON.parse(readFileSync(join(WORTEL, 'public/manifest.json'), 'utf8'));

  // ⚠️ Uit `.env.example` en niet uit `.env`: dit draait in CI, waar geen `.env`
  //    staat, en het adres hoort een afspraak te zijn en geen lokale instelling.
  const voorbeeld = readFileSync(join(WORTEL, '.env.example'), 'utf8');
  const appUrl = /^EXPO_PUBLIC_APP_URL=(.+)$/m.exec(voorbeeld)?.[1]?.trim();

  if (!appUrl) {
    console.error('✗ `EXPO_PUBLIC_APP_URL` staat niet in `.env.example`.');
    return 1;
  }

  const fouten = beoordeelManifest({ manifest, appUrl });

  if (fouten.length === 0) {
    const pad = padVan(appUrl);
    console.log(
      `pwa-controle: het manifest en ${appUrl} wijzen naar hetzelfde` +
        `${pad === '' ? ' (de root van een eigen subdomein)' : ` (het pad ${pad}/)`}.`,
    );
    return 0;
  }

  for (const fout of fouten) console.error(`✗ ${fout}`);
  console.error(
    '\nZie de bevinding van 23-08 in docs/ENGINEER-REVIEW.md en §3 van docs/DEPLOY.md. ' +
      'Verhuist de app naar een pad, dan verhuizen het manifest, de iconen en de ' +
      'servicewormer mee — anders werkt alles behalve de meldingen.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
