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
 * ⚠️ **Per functie en niet per bestand, en dat is een reparatie van 28-08.** De
 *    eerste versie deed `TEKENT.test(inhoud)` — één regex over het hele bestand.
 *    `src/modules/buddies/api.ts` telde daardoor als "tekent" omdat
 *    `fetchGroepsoverzicht` op regel 376 tekent, terwijl `fetchUitnodiging` op
 *    regel 786 het niet deed. **Eén tekenende functie immuniseerde negenhonderd
 *    regels.** Dat is scherper dan de blinde vlek die hieronder al beschreven
 *    stond, want de vorm was er wél en werd toch niet gezien.
 *
 * ⚠️ **Wat hij nog steeds niet kan zien**, en dat hoort hier te staan omdat het
 *    de manier is waarop hij de vólgende keer misleidt: een ophaalpad dat de
 *    kolom onder een naam zónder `avatar` doorgeeft, en een pad dat een heel
 *    RPC-resultaat met een spread doorschuift (`return { ...gelezen }`) zonder de
 *    sleutel ooit te noemen. Dat laatste is precies hoe `fetchUitnodiging`
 *    hieraan ontsnapte; die is op 28-08 bij de bron opgelost — migratie 0128 laat
 *    `invite_preview` geen pad meer teruggeven — en niet door dit script slimmer
 *    te maken. Een heuristiek vindt wat een vorm heeft.
 *
 *    De vormen die hij wél moet vinden en met rust moet laten, staan los onder
 *    test in `tests/scripts/avatar-controle.test.ts` — een controle die je niet
 *    kunt voeden, kun je niet ijken.
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
 * Waar een functie op het hoogste niveau begint.
 *
 * ⚠️ Ruw, en dat mag: het gaat er alleen om waar het ene ophaalpad ophoudt en het
 *    volgende begint. Een geneste functie start hier geen nieuw blok omdat de
 *    regel dan inspringt — en dat is gewenst, want een hulpfunctie binnen een
 *    ophaalpad hoort bij datzelfde pad.
 */
const BLOKSTART = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s|^(?:export\s+)?(?:const|let)\s+[\w$]+\s*=\s*(?:async\s*)?[({]|^(?:export\s+)?class\s/;

/**
 * Knipt een bestand in blokken op de functiegrenzen van het hoogste niveau.
 *
 * Geeft per blok de eerste en laatste regel (1-geïndexeerd, beide inclusief).
 */
export function blokkenVan(inhoud) {
  const regels = inhoud.split('\n');
  const starts = [0];

  regels.forEach((regel, i) => {
    if (i > 0 && BLOKSTART.test(regel)) starts.push(i);
  });

  return starts.map((start, n) => ({
    van: start + 1,
    tot: n + 1 < starts.length ? starts[n + 1] : regels.length,
  }));
}

/**
 * Beoordeelt één bestand.
 *
 * Geeft `null` als er niets te beoordelen valt, anders de regelnummers van de
 * mappings die niét in een tekenend blok staan.
 *
 * ⚠️ **De vraag is per blok en niet per bestand.** Zie de kop: één tekenende
 *    functie hoort niet de rest van het bestand vrij te pleiten.
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

  const blokken = blokkenVan(inhoud).map((b) => ({
    ...b,
    naam: naamVan(regels[b.van - 1] ?? ''),
    tekst: regels.slice(b.van - 1, b.tot).join('\n'),
  }));

  /**
   * ⚠️ **Eén hop door de aanroepgraaf, en die is nodig.** De vorm in dit project
   *    is een kleine `naarX(rij)` die mapt en een `fetchX()` die tekent —
   *    `naarGroepslid` naast `fetchGroepsleden`, `naarBericht` naast `fetchChat`.
   *    Eisen dat het mappende blok zélf tekent, maakt alle vier de goede
   *    ophaalpaden rood; alleen naar het bestand kijken, pleit negenhonderd
   *    regels vrij. De grens ligt dus bij het mappende blok plus de blokken die
   *    het aanroepen.
   */
  const tekentVoor = (nummer) => {
    const blok = blokken.find((b) => nummer >= b.van && nummer <= b.tot);
    if (blok === undefined) return false;
    if (TEKENT.test(blok.tekst)) return true;
    if (blok.naam === null) return false;

    const aanroep = new RegExp(`\\b${blok.naam}\\b`);
    return blokken.some((b) => b !== blok && aanroep.test(b.tekst) && TEKENT.test(b.tekst));
  };

  const kaal = mappings.filter((nummer) => !tekentVoor(nummer));
  return { mappings, kaal, tekent: kaal.length === 0 };
}

/** De naam die een blok declareert, of `null`. */
export function naamVan(regel) {
  const m = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([\w$]+)|^(?:export\s+)?(?:const|let)\s+([\w$]+)\s*=|^(?:export\s+)?class\s+([\w$]+)/.exec(regel);
  return m === null ? null : (m[1] ?? m[2] ?? m[3] ?? null);
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
    if (!uitkomst.tekent) gemist.push({ pad, regels: uitkomst.kaal });
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
      `✗ ${pad} (regel ${regels.join(', ')}) mapt een avatar-kolom uit een rij, maar de functie ` +
        'eromheen tekent hem niet. Sinds migratie 0126 is de bucket privé en draagt die kolom ' +
        'een pad — een pad in een <Image> is een leeg vlak zonder foutmelding. Tekent een ' +
        'ándere functie in hetzelfde bestand wél, dan telt dat niet: dat immuniseerde op 28-08 ' +
        'negenhonderd regels.',
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
