/**
 * Genereert de PWA-iconen — QS8-117.
 *
 * ⚠️ Waarom een script en geen aangeleverde PNG's. Een binair bestand in de repo
 *    zonder herkomst is niet te controleren en niet opnieuw te maken op een
 *    andere maat. Dit script is de bron; de PNG's zijn het verslag. Draai
 *    `node scripts/maak-iconen.mjs` om ze opnieuw te bouwen.
 *
 * ⚠️ Uitsluitend kleuren uit het Q-Projects navy-stelsel (`src/shared/theme/
 *    tokens.ts`). CLAUDE.md: verzin hier nooit een kleur bij.
 *
 * ⚠️ **Dit is een plaatshouder.** Het merk is bewust geometrisch: twee gekoppelde
 *    ringen, naar De Ketting — het groepsbegrip waar dit product op draait.
 *    Zodra QS8-109 een mascotte oplevert hoort dit vervangen te worden. Beter een
 *    eerlijke plaatshouder die de installatiestroom af maakt dan een ontbrekend
 *    icoon dat iOS met een schermafdruk invult.
 *
 * Geen dependencies: PNG-codering met de ingebouwde zlib.
 */
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HIER, '..', 'public');

// src/shared/theme/tokens.ts — thema `navy`.
const BG = [0x0e, 0x17, 0x30];
const GOUD = [0xe8, 0xb6, 0x48];

// --- PNG ---------------------------------------------------------------------

const crcTabel = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTabel[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const lengte = Buffer.alloc(4);
  lengte.writeUInt32BE(data.length, 0);
  const romp = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(romp), 0);
  return Buffer.concat([lengte, romp, crc]);
}

function pngUitRgba(breedte, hoogte, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breedte, 0);
  ihdr.writeUInt32BE(hoogte, 4);
  ihdr[8] = 8; // bitdiepte
  ihdr[9] = 6; // RGBA
  // 10–12: compressie, filter en interlace staan alle drie op 0.

  // Elke scanlijn krijgt filtertype 0 ervoor.
  const rauw = Buffer.alloc(hoogte * (1 + breedte * 4));
  for (let y = 0; y < hoogte; y += 1) {
    const van = y * breedte * 4;
    rauw[y * (1 + breedte * 4)] = 0;
    rgba.copy(rauw, y * (1 + breedte * 4) + 1, van, van + breedte * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rauw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Het merk ----------------------------------------------------------------

/**
 * Twee gekoppelde ringen. `dekking(x, y)` geeft per punt hoeveel goud er ligt;
 * de aanroeper bemonstert elk beeldpunt 4×4 keer, want zonder dat is een ronde
 * vorm op 72 pixels een trapje.
 */
function merkDekking(x, y, maat, schaal) {
  const straal = maat * 0.19 * schaal;
  const dikte = maat * 0.062 * schaal;
  const verschuiving = straal * 0.72;
  const mx = maat / 2;
  const my = maat / 2;

  for (const cx of [mx - verschuiving, mx + verschuiving]) {
    const d = Math.hypot(x - cx, y - my);
    if (Math.abs(d - straal) <= dikte / 2) return true;
  }
  return false;
}

function tekenIcoon(maat, { transparant = false, schaal = 1 } = {}) {
  const rgba = Buffer.alloc(maat * maat * 4);
  const MONSTERS = 4;

  for (let y = 0; y < maat; y += 1) {
    for (let x = 0; x < maat; x += 1) {
      let raak = 0;
      for (let sy = 0; sy < MONSTERS; sy += 1) {
        for (let sx = 0; sx < MONSTERS; sx += 1) {
          const px = x + (sx + 0.5) / MONSTERS;
          const py = y + (sy + 0.5) / MONSTERS;
          if (merkDekking(px, py, maat, schaal)) raak += 1;
        }
      }
      const dekking = raak / (MONSTERS * MONSTERS);
      const i = (y * maat + x) * 4;

      if (transparant) {
        // Badge: alleen de vorm. Android maskeert hem toch naar één kleur.
        rgba[i] = GOUD[0];
        rgba[i + 1] = GOUD[1];
        rgba[i + 2] = GOUD[2];
        rgba[i + 3] = Math.round(dekking * 255);
      } else {
        for (let k = 0; k < 3; k += 1) {
          rgba[i + k] = Math.round(BG[k] + (GOUD[k] - BG[k]) * dekking);
        }
        rgba[i + 3] = 255;
      }
    }
  }

  return pngUitRgba(maat, maat, rgba);
}

// --- Uitvoeren ---------------------------------------------------------------

mkdirSync(PUBLIC, { recursive: true });

const bestanden = [
  // `purpose: any` — het merk mag tot de rand komen.
  ['icon-192.png', tekenIcoon(192)],
  ['icon-512.png', tekenIcoon(512)],
  // ⚠️ `purpose: maskable` — Android snijdt hier een vorm uit. Het merk staat
  //    daarom op 62%, ruim binnen de veilige zone van 80%.
  ['icon-512-maskable.png', tekenIcoon(512, { schaal: 0.62 })],
  // ⚠️ iOS gebruikt het manifest-icoon níét voor het beginscherm; die wil een
  //    apple-touch-icon van 180×180. Zonder dit vult iOS een schermafdruk in.
  ['apple-touch-icon.png', tekenIcoon(180)],
  ['favicon.png', tekenIcoon(32)],
  // De badge in de service worker.
  ['badge-72.png', tekenIcoon(72, { transparant: true })],
];

for (const [naam, data] of bestanden) {
  writeFileSync(join(PUBLIC, naam), data);
  console.log(`${naam.padEnd(26)} ${String(data.length).padStart(7)} bytes`);
}
