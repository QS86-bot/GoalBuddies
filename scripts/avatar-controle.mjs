#!/usr/bin/env node
/**
 * avatar-controle — één ondertekening per ophaalpad, en geen pad dat het vergeet.
 *
 * ⚠️ **Waar dit vandaan komt.** Migratie 0126 maakt de avatar-bucket **privé**,
 *    want een openbare bucket omzeilt RLS volledig (zie `storage-controle.mjs`).
 *    Gevolg: `avatar_url` en zijn broertjes dragen sindsdien een **pad** en geen
 *    URL. Een pad in een `<Image>` is geen foutmelding maar een leeg vlak, en
 *    `Avatar` valt alleen terug op initialen — dus het scherm ziet er *bijna*
 *    goed uit en niemand merkt het.
 *
 * ⚠️ **Dit is de naad, niet het onderdeel** (CLAUDE.md regel 18). Elk ophaalpad
 *    op zich is te testen en klopt; wat je niet ziet is het zésde ophaalpad dat
 *    er over een maand bij komt en het tekenen vergeet. Er zijn er vandaag vijf:
 *    de chat, de weekafsluiting en haar reacties, de groepsleden, de
 *    beoordelingswachtrij en je eigen profiel. Elk daarvan mapt een kolom met
 *    `avatar` in de naam uit een databaserij naar iets dat een scherm krijgt.
 *
 *    De controle is daarom: **mapt een bestand een avatar-kolom uit een rij, dan
 *    tekent datzelfde bestand hem ook.** Niet "de app tekent ergens" — dat is een
 *    eigenschap van het gehéél die groen blijft terwijl één pad breekt.
 *
 * ⚠️ **Wat hij niet kan zien.** Een ophaalpad dat de kolom onder een naam zónder
 *    `avatar` doorgeeft, of dat hem via een tussenlaag doorschuift. Dat is
 *    dezelfde blinde vlek als bij `tekst-controle`: een heuristiek vindt wat een
 *    vorm heeft. De vormen die hij wél moet vinden en met rust moet laten, staan
 *    los onder test in `tests/scripts/avatar-controle.test.ts` — een controle die
 *    je niet kunt voeden, kun je niet ijken.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Mappen waarin een ophaalpad als "productie" telt. */
export const PRODUCTIEMAPPEN = ['src', 'app'];

/**
 * Een sleutel met `avatar` erin die een waarde uit een rij overneemt.
 *
 * ⚠️ De rechterkant moet een véldtoegang zijn (`iets.iets`). Daarmee valt een
 *    testfixture (`avatar_url: null`) er buiten en een echte mapping erbinnen —
 *    en dat onderscheid is het verschil tussen een bruikbare controle en eentje
 *    die je leert wegklikken.
 */
const MAPPING = /(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$]*\s*(?:\.|\?\.)/g;

/**
 * ⚠️ De sleutelnaam wordt apart getoetst en zit níét in het patroon hierboven.
 *    Dat stond er eerst wel, als `[A-Za-z_$][\w$]*avatar[\w$]*`, en dat eist
 *    stilzwijgend een teken vóór `avatar` — waardoor `author_avatar` gevonden
 *    werd en `avatar_url` niet. Twee van de vier ophaalpaden vielen erbuiten en
 *    de controle meldde vrolijk groen. Vandaar de ijking in
 *    `tests/scripts/avatar-controle.test.ts`, met beide vormen erin.
 */
const AVATARSLEUTEL = /avatar/i;

/** De twee manieren waarop een pad een ondertekende URL wordt. */
const TEKENT = /\b(metGetekendeAvatars|tekenAvatars)\b/;

/** Bestanden die geen ophaalpad zijn: tests en fixtures. */
export function isBron(pad) {
  return /\.(ts|tsx)$/.test(pad) && !/\.test\.tsx?$/.test(pad) && !/\.d\.ts$/.test(pad);
}

/**
 * Beoordeelt één bestand.
 *
 * Geeft `null` als er niets te beoordelen valt, anders de regelnummers van de
 * mappings en of het bestand tekent.
 */
export function beoordeelBestand(inhoud) {
  const regels = inhoud.split('\n');
  const mappings = [];

  regels.forEach((regel, i) => {
    // Commentaar telt niet mee: de uitleg hierboven noemt zelf `avatar_url: rij.`
    const zonderCommentaar = regel.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
    for (const m of zonderCommentaar.matchAll(MAPPING)) {
      if (AVATARSLEUTEL.test(m[1])) {
        mappings.push(i + 1);
        break;
      }
    }
  });

  if (mappings.length === 0) return null;
  return { mappings, tekent: TEKENT.test(inhoud) };
}

/** @param {ReadonlyArray<{pad: string, inhoud: string}>} bestanden */
export function controleer(bestanden) {
  const gezien = [];
  const gemist = [];

  for (const { pad, inhoud } of bestanden) {
    if (!isBron(pad)) continue;
    const uitkomst = beoordeelBestand(inhoud);
    if (uitkomst === null) continue;

    gezien.push({ pad, ...uitkomst });
    if (!uitkomst.tekent) gemist.push({ pad, regels: uitkomst.mappings });
  }

  return { gezien, gemist };
}

function bronbestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    if (naam === 'node_modules' || naam === '.git') continue;
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) bronbestanden(pad, uit);
    else uit.push(pad);
  }
  return uit;
}

function hoofd() {
  const bestanden = PRODUCTIEMAPPEN.flatMap((m) => bronbestanden(join(WORTEL, m)))
    .filter(isBron)
    .map((pad) => ({ pad: relative(WORTEL, pad), inhoud: readFileSync(pad, 'utf8') }));

  const { gezien, gemist } = controleer(bestanden);

  if (gemist.length === 0) {
    console.log(
      `avatar-controle: ${gezien.length} ophaalpad(en) met een avatar-kolom, allemaal ondertekend.`,
    );
    return 0;
  }

  for (const { pad, regels } of gemist) {
    console.error(
      `✗ ${pad} (regel ${regels.join(', ')}) mapt een avatar-kolom uit een rij, maar tekent hem ` +
        'niet. Sinds migratie 0126 is de bucket privé en draagt die kolom een pad — een pad in ' +
        'een <Image> is een leeg vlak zonder foutmelding.',
    );
  }

  console.error(
    '\nRoep `metGetekendeAvatars(rijen, veld)` aan op het ophaalpad zelf (één ronde voor de hele ' +
      'lijst — schaalbaarheidsregel 12), of `tekenAvatars` voor één rij. Zie ' +
      'src/modules/auth/avatar.ts en de kop van migratie 0126.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
