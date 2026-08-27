/**
 * Wanneer mag `register:controle` zwijgen, en wanneer niet? — bevinding 25-08-2026.
 *
 * ⚠️ **Waarom dit een eigen bestand is.** `migratieregister-controle.mjs` doet
 *    zijn werk op moduleniveau en eindigt met `process.exit()`. Importeren om één
 *    functie te toetsen zou dus het hele script uitvoeren. Zelfde scheiding als
 *    `migratieregister-vergelijk.mjs`, en om dezelfde reden: **een controle die
 *    je niet kunt voeden, kun je niet ijken** (CLAUDE.md, bij regel 18).
 *
 * @param {{url?: string, sleutel?: string, streng?: boolean}} omgeving
 * @returns {'draaien' | 'overslaan' | 'ontbreekt'}
 */
export function beoordeelOmgeving(omgeving) {
  if (omgeving.url && omgeving.sleutel) return 'draaien';
  return omgeving.streng ? 'ontbreekt' : 'overslaan';
}
