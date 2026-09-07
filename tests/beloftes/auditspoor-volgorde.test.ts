import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');

/**
 * Wie het auditspoor leest, sorteert op de volgordesleutel — QS8-303.
 *
 * ⚠️ **De belofte is niet "de query in `api.ts` klopt".** Dat is het onderdeel.
 *    De belofte is: *de eigenaar ziet zijn auditspoor in de volgorde waarin het
 *    geschreven is.* En die belofte breekt op precies één manier — sorteren op
 *    een sleutel die kan knopen.
 *
 *    `commitment_events.created_at` knoopt: aan één UPDATE van `commitments`
 *    hangen twee AFTER-triggers die allebei schrijven, en `now()` is binnen een
 *    transactie constant. Migratie 0176 gaf de tabel daarom `seq`, een
 *    identity-kolom. Deze test bewaakt dat niemand teruggaat naar de klok.
 *
 * ⚠️ **Waarom uit de bron afgeleid en niet met een vaste bestandsnaam.** Regel 18
 *    vraag 4: een test die een zin in één schérmbestand zoekt, verhuist niet mee.
 *    Deze zoekt élke lezer van `commitment_events` in `src/` en `app/`, dus een
 *    tweede lezer die morgen ergens anders bijkomt, valt hier vanzelf onder.
 *
 * ⚠️ **De grens loopt bij het spoor en niet bij de tabel.** Er is niets mis met
 *    een query die op `created_at` fíltert of hem in het scherm tóónt — dat is
 *    wat die kolom betekent. Alleen sorteren mag er niet op.
 *
 * IJKING — met de hand gedraaid op 07-09-2026:
 *
 *   A  `.order('seq', …)` in `fetchCommitmentSpoor()` terug naar `created_at`
 *      → 1 rood, met bestand en regelnummer
 *   B  de afleiding leeg maken (zoek op een tabelnaam die niet bestaat)
 *      → 1 rood ("vindt geen enkele lezer")
 *   C  het wegknippen van commentaar eruit
 *      → 1 rood, en de vondst is de regel in `fetchCommitmentSpoor()` die de
 *      oude `.order('created_at', …)` citeert
 *
 * ⚠️ **C werkte eerst níét, en dat is het vermelden waard.** De eerste ijking
 *    ging ervan uit dat er wel érgens commentaar met `created_at` in stond;
 *    dat stond er, maar niet als `.order(`-aanroep binnen een keten, dus de
 *    controle vond niets en `zonderCommentaar()` bewaakte aantoonbaar niets.
 *    De regel in `fetchCommitmentSpoor()` die de oude aanroep citeert, is
 *    daarom blijven staan: hij houdt deze ijking waar. Zelfde valkuil als bij
 *    `tekst:controle` — een controle die zijn eigen uitleg als bevinding meldt,
 *    leer je uitzetten.
 *
 * ⚠️ B is de grendel die telt: haalt iemand de laatste lezer weg of hernoemt hij
 *    de tabel, dan vindt deze test niets meer en is hij groen om niets.
 */

/** Commentaar eruit, regelnummers erin — zelfde vorm als `uitkomst-niet-weggooien`. */
function zonderCommentaar(bron: string): string {
  const uit: string[] = [];
  let inBlok = false;

  for (const regel of bron.split('\n')) {
    let schoon = regel;
    if (inBlok) {
      const eind = schoon.indexOf('*/');
      if (eind === -1) {
        uit.push('');
        continue;
      }
      schoon = schoon.slice(eind + 2);
      inBlok = false;
    }
    schoon = schoon.replace(/\/\*.*?\*\//g, ' ');
    const start = schoon.indexOf('/*');
    if (start !== -1) {
      schoon = schoon.slice(0, start);
      inBlok = true;
    }
    uit.push(schoon.replace(/(^|[^:])\/\/.*$/, '$1'));
  }
  return uit.join('\n');
}

function bestanden(map: string, exts: readonly string[]): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad, exts));
    else if (exts.some((e) => naam.endsWith(e))) uit.push(pad);
  }
  return uit;
}

const TABEL = 'commitment_events';

interface Lezer {
  /** Pad ten opzichte van de projectwortel. */
  bestand: string;
  /** Regelnummer van de `.from(...)`, één-gebaseerd. */
  regel: number;
  /** De keten vanaf `.from(...)` tot het einde van het statement. */
  keten: string;
}

/**
 * Elke plek in `src/` en `app/` die `commitment_events` uitleest.
 *
 * De keten loopt van de `.from(...)` tot de eerste regel die op `;` eindigt —
 * dat is hoe elke query in dit project geschreven staat.
 */
function lezers(): Lezer[] {
  const uit: Lezer[] = [];

  for (const map of ['src', 'app']) {
    for (const pad of bestanden(join(WORTEL, map), ['.ts', '.tsx'])) {
      if (pad.includes('.test.')) continue;
      const regels = zonderCommentaar(readFileSync(pad, 'utf8')).split('\n');

      regels.forEach((regel, i) => {
        if (!new RegExp(`\\.from\\(['"]${TABEL}['"]\\)`).test(regel)) return;

        const stuk: string[] = [];
        for (let j = i; j < regels.length && j < i + 20; j += 1) {
          stuk.push(regels[j] as string);
          if ((regels[j] as string).trimEnd().endsWith(';')) break;
        }

        uit.push({ bestand: relative(WORTEL, pad), regel: i + 1, keten: stuk.join('\n') });
      });
    }
  }

  return uit;
}

describe('wie het auditspoor leest, sorteert op de volgordesleutel', () => {
  const gevonden = lezers();

  it('vindt de lezers van commitment_events', () => {
    expect(gevonden.length, `geen enkele lezer van ${TABEL} gevonden in src/ en app/`).toBeGreaterThan(0);
  });

  /**
   * ⚠️ **Eén assertie en niet twee, en dat is een keuze die één ijking gekost
   *    heeft.** Hier stonden eerst twee tests — "sorteert nergens op created_at"
   *    en "sorteert overal op seq" — en mutatie A maakte ze allebei rood. Dat is
   *    logisch: het is één eigenschap, twee keer opgeschreven. Een mutatie per
   *    grendel betekent dan ook een assertie per grendel.
   */
  it('sorteert op seq en nergens op de klok', () => {
    const fout = gevonden.flatMap((l) => {
      const opKlok = /\.order\(\s*['"]created_at['"]/.test(l.keten);
      const opSeq = /\.order\(\s*['"]seq['"]/.test(l.keten);
      if (opSeq && !opKlok) return [];
      return [`${l.bestand}:${l.regel} — ${opKlok ? 'sorteert op created_at' : "geen .order('seq')"}`];
    });

    expect(
      fout,
      `${TABEL} krijgt twee rijen per transactie en now() knoopt; sorteer op seq (migratie 0176, QS8-303)`,
    ).toEqual([]);
  });
});
