#!/usr/bin/env node
/**
 * spiegeling-controle — de vrijstelling van `interview.ts → goals` rust op een
 * premisse, en die premisse wordt hier getoetst (QS8-610).
 *
 * ## Waarom dit bestaat
 *
 * `NIET_TE_LEZEN` in `scripts/kolomrechten-controle.mjs` is gesleuteld op
 * `(pad, tabel)`. Eén regel dooft daarmee **elke** onleesbare schrijfactie van
 * dat bestand naar die tabel, ook een toekomstige. De regel voor
 * `src/modules/goals/interview.ts → goals` draagt deze reden:
 *
 * > `update(patch)` waar `patch` uit `spiegelpatch()` komt — een functie en geen
 * > literaal. De velden die zij zet zijn een deelverzameling van wat
 * > `wijzigDoel()` schrijft, en die staat hier wél onder de controle.
 *
 * ⚠️ **Die laatste zin is de premisse, en tot vandaag was hij een bewering.**
 *    Dat is precies de vorm die dit project al betaald heeft: een grendel die
 *    alleen in een comment staat, is geen grendel (QS8-412).
 *
 * 📏 **Wat er misgaat als de premisse vervalt** (rij 444, 01-09-2026): zet
 *    iemand `ritme` in `SPIEGELING` — het commentaar daar nodigt uit tot
 *    uitbreiden — dan geeft elke spiegeling `42501`, want `goals` heeft met
 *    opzet geen UPDATE-recht op `ritme`. `kolomrechten:controle` zwijgt daarover
 *    omdat de hele combinatie vrijgesteld is.
 *
 * ## Waarom geen kolomsleutel, en waarom geen database
 *
 * ⚠️ **Een kolomsleutel op `NIET_TE_LEZEN` kan hier niet.** De vrijstelling
 *    bestáát omdat het pad onleesbaar is: welke kolommen `spiegelpatch()`
 *    schrijft is precies wat die controle niet kan zien. Een kolomlijst zou een
 *    lijst zijn die niemand kan verifiëren — een register dat stil rot.
 *
 * ⚠️ **En de premisse gaat over `wijzigDoel()`, niet over de grant.** Dat is de
 *    scherpere vorm én de goedkopere: de kolommen die `wijzigDoel()` schrijft
 *    staan als toewijzingen in de bron, dus deze controle heeft geen database
 *    nodig en draait dus ook in CI-baan `repo`. Dat de UPDATE-kolomgrant van
 *    `goals` dezelfde vijf kolommen draagt, is een gevolg en geen invoer —
 *    `kolomrechten:controle` bewaakt die kant al.
 *
 * ## Twee kanaries, en waarom ze er allebei zijn
 *
 * ⚠️⚠️ **Een lege uitkomst is hier gevaarlijker dan een verkeerde.** Vindt de
 *    lezer van `SPIEGELING` niets, dan is er niets om te toetsen en zou deze
 *    controle groen zijn — precies zoals wanneer alles klopt. Hetzelfde geldt
 *    voor de kolommen van `wijzigDoel()`: nul gevonden kolommen maakt élke
 *    spiegeling een bevinding, en dat leest als een storm in plaats van als een
 *    kapotte lezer. Beide gevallen zijn daarom een eigen, benoemde fout.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { zonderCommentaar } from './zonder-commentaar.mjs';

/** Het bestand met de spiegeltabel. */
export const SPIEGELBRON = 'src/modules/goals/interview-schemas.ts';

/** Het bestand met de schrijfactie waar de premisse naar verwijst. */
export const DEKKINGSBRON = 'src/modules/goals/api.ts';

/** De functie in `DEKKINGSBRON` die de premisse dekking noemt. */
export const DEKKENDE_FUNCTIE = 'wijzigDoel';

/**
 * De doelkolommen uit `SPIEGELING`.
 *
 * ⚠️ **De wáárden, niet de sleutels.** `SPIEGELING` mapt een antwoordveld op een
 *    kolom van `goals` (`identity → identity_statement`); de linkerkant is een
 *    vraagnaam en zegt niets over rechten.
 */
export function spiegelkolommen(bron) {
  const schoon = zonderCommentaar(bron);
  const blok = /export\s+const\s+SPIEGELING\s*=\s*\{([\s\S]*?)\}\s*as\s+const\s*;/.exec(schoon);
  if (!blok) return null;

  return [...blok[1].matchAll(/:\s*'([a-z_][a-z0-9_]*)'/gi)].map((m) => m[1]);
}

/**
 * De kolommen die `DEKKENDE_FUNCTIE` op zijn updateobject zet.
 *
 * ⚠️ **Begrensd tot het lichaam van die ene functie**, en niet tot het hele
 *    bestand. `api.ts` schrijft op meer plekken naar `goals` — `maakDoel()`,
 *    `zetStreefdatum()` — en die dekken de premisse niet: de reden noemt
 *    `wijzigDoel()` bij naam, en dat is de functie waarvan de velden een
 *    bovengrens vormen.
 */
export function dekkendeKolommen(bron, naam = DEKKENDE_FUNCTIE) {
  const schoon = zonderCommentaar(bron);
  const start = schoon.search(new RegExp(`export\\s+async\\s+function\\s+${naam}\\s*\\(`));
  if (start < 0) return null;

  const rest = schoon.slice(start);
  const volgende = rest.slice(1).search(/\nexport\s+(?:async\s+)?function\s/);
  const lichaam = volgende < 0 ? rest : rest.slice(0, volgende + 1);

  return [...lichaam.matchAll(/\bupdate\.([a-z_][a-z0-9_]*)\s*=/gi)].map((m) => m[1]);
}

/**
 * De bevindingen, als lijst met zinnen.
 *
 * ⚠️ Geëxporteerd zodat de test hem élke vorm los kan aanbieden — de vormen die
 *    hij moet vinden én de vormen die hij met rust moet laten. Een controle die
 *    je niet kunt voeden, kun je niet ijken.
 */
export function beoordeel(spiegelbron, dekkingsbron) {
  const spiegel = spiegelkolommen(spiegelbron);
  if (spiegel === null) {
    return [
      `\`SPIEGELING\` is niet gevonden in \`${SPIEGELBRON}\`. Dat is geen groen: ` +
        'zonder die tabel valt er niets te toetsen en zwijgt deze controle om de ' +
        'verkeerde reden. Is hij hernoemd of verhuisd, pas dan `spiegelkolommen()` aan.',
    ];
  }
  if (spiegel.length === 0) {
    return [
      `\`SPIEGELING\` in \`${SPIEGELBRON}\` levert nul kolommen op. Normaal zijn het ` +
        'er twee. Waarschijnlijk is de vorm van het object veranderd en leest deze ' +
        'controle hem niet meer.',
    ];
  }

  const dekking = dekkendeKolommen(dekkingsbron);
  if (dekking === null || dekking.length === 0) {
    return [
      `\`${DEKKENDE_FUNCTIE}()\` levert nul geschreven kolommen op in ` +
        `\`${DEKKINGSBRON}\`. Normaal zijn het er vijf. Zonder die lijst wordt élke ` +
        'spiegeling een bevinding, en dat is een kapotte lezer en geen storm.',
    ];
  }

  const buiten = spiegel.filter((kolom) => !dekking.includes(kolom));
  if (buiten.length === 0) return [];

  return buiten.map(
    (kolom) =>
      `\`SPIEGELING\` spiegelt naar \`goals.${kolom}\`, en ${DEKKENDE_FUNCTIE}() schrijft ` +
      `die kolom niet (wel: ${dekking.join(', ')}). Daarmee vervalt de reden onder de ` +
      `vrijstelling \`interview.ts → goals\` in \`NIET_TE_LEZEN\` — die leunt erop dat ` +
      `\`spiegelpatch()\` een deelverzameling schrijft van wat ${DEKKENDE_FUNCTIE}() ` +
      'schrijft. Zolang dat niet zo is, dooft die vrijstelling een schrijfactie die ' +
      'niemand meer toetst; `goals.ritme` levert dan een `42501` bij elke spiegeling.',
  );
}

export function hoofd() {
  const klachten = beoordeel(readFileSync(SPIEGELBRON, 'utf8'), readFileSync(DEKKINGSBRON, 'utf8'));

  if (klachten.length > 0) {
    console.error('✗ spiegeling-controle:');
    for (const klacht of klachten) console.error(`  - ${klacht}`);
    return 1;
  }

  const spiegel = spiegelkolommen(readFileSync(SPIEGELBRON, 'utf8'));
  const dekking = dekkendeKolommen(readFileSync(DEKKINGSBRON, 'utf8'));
  console.log(
    `spiegeling-controle: ${spiegel.length} gespiegelde kolom(men) ` +
      `(${spiegel.join(', ')}) vallen binnen de ${dekking.length} die ` +
      `${DEKKENDE_FUNCTIE}() schrijft.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
