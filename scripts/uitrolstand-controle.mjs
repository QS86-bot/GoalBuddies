#!/usr/bin/env node
/**
 * Klopt `supabase/uitgerold.json` met de map? — QS8-517.
 *
 * ⚠️⚠️ **Waarom dit bestaat, en waarom het géén derde variant van
 *    `register:controle` is.** Die legt de map naast het echte project en is
 *    daarmee de enige die de waarheid kent — maar hij vraagt de
 *    productiesleutel, en die zit per definitie niet in een cloudsessie en
 *    hoort niet in CI. Hij print daar `OVERGESLAGEN`, en de poort telt hem
 *    *ongemeten*. 📏 Zo liep de drift op tot **52** bestanden zonder dat er
 *    ooit iets rood werd, tot een deploy er gebruikers mee raakte (QS8-505).
 *
 *    Deze controle draait juist **zonder sleutel**, overal, ook in CI. Dat kan
 *    doordat de meting is opgeschreven in plaats van elke keer opnieuw gedaan:
 *    `register:controle` schrijft `supabase/uitgerold.json` wanneer hij draait,
 *    en dit script leest dat bestand naast `supabase/migrations/`.
 *
 * ⚠️ **Wat hij dus níet is: een tweede bron van waarheid.** Hij bewijst niet
 *    dat productie op `hoogste` staat — dat kan alleen `register:controle`. Hij
 *    bewijst dat het opgeschreven getal **intern klopt** met de map, en hij
 *    zegt hoe oud het is. Wie hem als bewijs van de productiestand leest, heeft
 *    hetzelfde gedaan als wie `OVERGESLAGEN` voor groen aanziet.
 *
 * ⚠️⚠️ **Het gat zelf is geen fout, en dat is de kern van het ontwerp.** Tussen
 *    twee uitrollen loopt de map vóór; dat is de normale toestand en niet een
 *    defect. Een controle die rood is in de normale toestand, leer je te
 *    negeren — dezelfde reden waarom `regel15:controle` een ratel is en geen
 *    verbod. Het gat wordt daarom **genoemd** met de leeftijd van de meting
 *    erbij, in drie gevallen met drie teksten, precies zoals QS8-435 dat voor
 *    de branchbevinding van `migraties:controle` afdwong: een waarschuwing die
 *    er altijd hetzelfde uitziet, leest als een disclaimer.
 *
 * ⚠️⚠️ **Rood is hij op wat nooit normaal is**, en de scherpste daarvan is
 *    `registerrijen`. Een vergelijking op het hoogste nummer alleen ziet een
 *    gat **ónder** de lijn niet: productie kan op `0282` staan en `0150` missen,
 *    en dan lijkt alles te kloppen terwijl er een ander schema draait. Dat is de
 *    vorm van QS8-237 en QS8-238, en het is de enige klasse die dit script vangt
 *    die `migraties:controle` (de map alleen) en een hoogste-nummer-blik allebei
 *    missen.
 *
 * Draaien: `npm run uitrolstand:controle`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** Het bestand met de opgeschreven meting, als pad vanaf de repo-wortel. */
export const STANDBESTAND = 'supabase/uitgerold.json';

/** Eén nummering, dezelfde als in `migratieregister-vergelijk.mjs`: `0052`, `0052a`. */
const VERSIE = /^\d{4}[a-z]?$/;

/** Een datum zonder tijd, want dit is een dagmeting en geen tijdstip. */
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * De versies in `supabase/migrations/`, gesorteerd.
 *
 * ⚠️ Bewust dezelfde vorm als `migratiesInMap()` en niet die functie zelf: die
 *    splitst op de eerste `_` en geeft ook de naam terug, en een lezer die
 *    alleen versies nodig heeft, hoort geen naamvergelijking te erven.
 *
 * @param {string} wortel
 * @returns {string[]}
 */
export function versiesInMap(wortel) {
  return readdirSync(join(wortel, 'supabase', 'migrations'))
    .filter((naam) => naam.endsWith('.sql'))
    .map((naam) => naam.slice(0, naam.indexOf('_')))
    .sort();
}

/**
 * Hoeveel hele dagen liggen er tussen twee ISO-datums.
 *
 * ⚠️ `Date.UTC` en geen `new Date(tekst)`: die tweede leest een kale datum als
 *    UTC maar een datum-met-tijd als lokale tijd, en dat verschil kruipt er
 *    binnen zodra iemand hier een tijdstip in zet.
 *
 * @param {string} van
 * @param {string} tot
 * @returns {number}
 */
export function dagenTussen(van, tot) {
  const ms = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((ms(tot) - ms(van)) / 86_400_000);
}

/**
 * De leeftijd van de meting in woorden — drie gevallen, drie teksten.
 *
 * ⚠️ Eén tekst voor alle leeftijden is precies de fout die QS8-435 repareerde:
 *    de vaste zin *"dit beeld is zo oud als je laatste fetch"* stond er ook bij
 *    een meting van tien seconden oud, en deed daardoor niets.
 *
 * @param {number} dagen
 * @returns {{ toon: 'vers' | 'oud' | 'stoffig', zin: string }}
 */
export function leeftijd(dagen) {
  if (dagen <= 7) {
    return { toon: 'vers', zin: `gemeten ${dagen === 0 ? 'vandaag' : `${dagen} dag(en) geleden`}` };
  }
  if (dagen <= 30) {
    return {
      toon: 'oud',
      zin: `gemeten ${dagen} dagen geleden — productie kan intussen verder zijn dan dit getal`,
    };
  }
  return {
    toon: 'stoffig',
    zin:
      `gemeten ${dagen} dagen geleden, en dat is geen meting meer maar een herinnering. ` +
      'Draai `npm run register:controle` op een plek mét de productiesleutel',
  };
}

/**
 * Wat er niet klopt aan de opgeschreven stand. Lege `fouten` is goed nieuws.
 *
 * @param {unknown} stand De inhoud van `supabase/uitgerold.json`.
 * @param {readonly string[]} versies De versies in de map.
 * @param {string} vandaag ISO-datum; meegegeven en niet zelf bepaald, anders
 *   verandert de uitslag van een test met de dag.
 * @returns {{ fouten: string[], gat: string[], onder: number, leeftijd: ReturnType<typeof leeftijd> | null }}
 */
export function beoordeel(stand, versies, vandaag) {
  const fouten = veldfouten(stand);
  if (fouten.length > 0) return { fouten, gat: [], onder: 0, leeftijd: null };

  const { hoogste, registerrijen, gemeten } = /** @type {any} */ (stand);
  const onder = versies.filter((v) => v <= hoogste);
  const gat = versies.filter((v) => v > hoogste);

  fouten.push(...standfouten({ hoogste, registerrijen, gemeten }, versies, onder, vandaag));

  return {
    fouten,
    gat,
    onder: onder.length,
    leeftijd: fouten.length === 0 ? leeftijd(dagenTussen(gemeten, vandaag)) : null,
  };
}

/**
 * De velden zelf: aanwezig, van de goede soort, van de goede vorm.
 *
 * ⚠️ `bron` telt mee. Een getal zonder herkomst is niet na te meten, en dan is
 *    dit bestand een bewering in plaats van een meting.
 *
 * @param {unknown} stand
 * @returns {string[]}
 */
function veldfouten(stand) {
  if (stand === null || typeof stand !== 'object') {
    return [`${STANDBESTAND} is geen object — een onleesbare stand is geen stand`];
  }
  const s = /** @type {Record<string, unknown>} */ (stand);
  const fouten = [];
  if (typeof s.hoogste !== 'string' || !VERSIE.test(s.hoogste)) {
    fouten.push(`\`hoogste\` (${JSON.stringify(s.hoogste)}) is geen versie van de vorm 0282 of 0039a`);
  }
  if (!Number.isInteger(s.registerrijen) || Number(s.registerrijen) < 1) {
    fouten.push(`\`registerrijen\` (${JSON.stringify(s.registerrijen)}) is geen positief geheel getal`);
  }
  if (typeof s.gemeten !== 'string' || !DATUM.test(s.gemeten)) {
    fouten.push(`\`gemeten\` (${JSON.stringify(s.gemeten)}) is geen datum van de vorm 2026-09-16`);
  }
  if (typeof s.bron !== 'string' || s.bron.trim() === '') {
    fouten.push('`bron` ontbreekt — een getal zonder herkomst is niet na te meten');
  }
  return fouten;
}

/**
 * De vergelijking met de map, als de velden kloppen.
 *
 * @param {{ hoogste: string, registerrijen: number, gemeten: string }} s
 * @param {readonly string[]} versies
 * @param {readonly string[]} onder
 * @param {string} vandaag
 * @returns {string[]}
 */
function standfouten(s, versies, onder, vandaag) {
  const fouten = [];
  if (!versies.includes(s.hoogste)) {
    fouten.push(
      `\`hoogste\` is ${s.hoogste} en daar hoort geen bestand bij in supabase/migrations/ — ` +
        'productie draagt een migratie die de map niet kan opbouwen (de vorm van QS8-237)',
    );
  }
  const hoogsteInMap = versies[versies.length - 1];
  if (hoogsteInMap !== undefined && s.hoogste > hoogsteInMap) {
    fouten.push(
      `\`hoogste\` (${s.hoogste}) ligt boven het hoogste bestand in de map (${hoogsteInMap})`,
    );
  }
  if (s.registerrijen !== onder.length) {
    fouten.push(rijenfout(s, onder.length));
  }
  if (dagenTussen(s.gemeten, vandaag) < 0) {
    fouten.push(`\`gemeten\` (${s.gemeten}) ligt in de toekomst`);
  }
  return fouten;
}

/**
 * Twee richtingen, twee reparaties — dus twee teksten.
 *
 * ⚠️ **Dít is de vangst die een hoogste-nummer-vergelijking niet heeft.** Te
 *    wéinig rijen betekent dat er onder de lijn iets ontbreekt: productie meldt
 *    `0282` en mist `0150`, en dan draait er een ánder schema dan de map
 *    beschrijft terwijl de bovenkant klopt.
 *
 * @param {{ hoogste: string, registerrijen: number }} s
 * @param {number} verwacht
 * @returns {string}
 */
function rijenfout(s, verwacht) {
  const kop = `\`registerrijen\` is ${s.registerrijen} en de map telt ${verwacht} bestand(en) t/m ${s.hoogste}`;
  return s.registerrijen < verwacht
    ? `${kop} — productie mist er ${verwacht - s.registerrijen} ónder de lijn; dat is het gat dat ` +
        'een hoogste-nummer-vergelijking niet ziet'
    : `${kop} — productie heeft ${s.registerrijen - verwacht} rij(en) zonder bestand in de map; ` +
        'lijn ze uit zoals docs/DEPLOY.md beschrijft';
}

/** @returns {number} De exitcode. */
export function hoofd(vandaag = new Date().toISOString().slice(0, 10)) {
  const pad = join(WORTEL, STANDBESTAND);
  if (!existsSync(pad)) {
    console.error(`✗ uitrolstand-controle: ${STANDBESTAND} ontbreekt.`);
    console.error('  Draai `npm run register:controle` op een plek mét de productiesleutel.');
    return 1;
  }

  const stand = leesStand(pad);
  const uitslag = beoordeel(stand, versiesInMap(WORTEL), vandaag);

  if (uitslag.fouten.length > 0) {
    console.error(`uitrolstand-controle: ${uitslag.fouten.length} probleem(en) met ${STANDBESTAND}.\n`);
    for (const f of uitslag.fouten) console.error(`  • ${f}`);
    console.error('\nZie QS8-517 en docs/DEPLOY.md.');
    return 1;
  }

  meldGat(uitslag);
  return 0;
}

/** @param {string} pad */
function leesStand(pad) {
  try {
    return JSON.parse(readFileSync(pad, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Het gat is nieuws en geen fout — maar nieuws dat zegt hoe oud het is.
 *
 * @param {ReturnType<typeof beoordeel>} uitslag
 */
function meldGat(uitslag) {
  const zin = uitslag.leeftijd?.zin ?? '';
  const kop = `uitrolstand-controle: productie op ${uitslag.onder} migratie(s), ${zin}.`;
  if (uitslag.gat.length === 0) {
    console.log(`${kop} De map loopt niet voor.`);
    return;
  }
  const staart = `De map loopt ${uitslag.gat.length} bestand(en) voor: ${uitslag.gat.join(', ')}.`;
  // ⚠️ Stoffig én een gat gaat naar stderr met een teken ervoor. Niet rood: het
  //    gat mag er zijn. Wel zichtbaar, want op stdout verdwijnt het tussen de
  //    geslaagde controles — de faalvorm van QS8-122's `overgeslagen`.
  if (uitslag.leeftijd?.toon === 'stoffig') console.error(`⚠ ${kop} ${staart}`);
  else console.log(`${kop} ${staart}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
