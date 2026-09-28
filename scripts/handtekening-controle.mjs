#!/usr/bin/env node
/**
 * handtekening-controle — een `drop function` onder een RPC die een edge-functie
 * aanroept, is een landmijn tot die functie opnieuw uit is (QS8-612).
 *
 * ## Het geval waar dit voor bestaat
 *
 * 📏 Migratie `0185` dropte `activeer_weekplanstap(uuid, date, integer)` terwijl
 *    de gedeployde `rollover` die driearguments vorm aanriep. PostgREST gaf
 *    `PGRST202`, en de rollover ving dat zacht af met `continue`: het inschuiven
 *    van weekplanstappen stopte **stil**, elk uur, voor iedereen.
 *
 * De volgorde staat sindsdien in de migratiekop, in `docs/DEPLOY.md` §2.3a en in
 * `docs/WERKVOORRAAD.md`. ⚠️ **Dat is een afspraak en geen grendel**, en rij 601
 * van `docs/ENGINEER-REVIEW.md` zegt dat met zoveel woorden. `edge:gedeployd`
 * ziet het wél, maar achteraf en alleen met een access token — in elke
 * cloudsessie dus ongemeten.
 *
 * ## Wat deze controle vraagt
 *
 * Twee dingen, en ze zijn niet even hard.
 *
 *   1. **Elke RPC die een edge-functie aanroept, lost op tegen de map.** Blijft er
 *      na alle drops geen handtekening over waar de meegegeven parameternamen op
 *      passen, dan is dat een `PGRST202` die op de uitrol wacht. Dat is een
 *      bevinding zonder uitweg.
 *
 *   2. **Is de oude handtekening weg, dan staat de reden in `VERDWENEN_VORM`.**
 *      Een drop waarna de aanroep tóch nog oplost, is niet vanzelf veilig: hij is
 *      veilig zolang de **gedeployde** functie dezelfde aanroepvorm gebruikt als
 *      de bron hier. Die twee lopen aantoonbaar uit elkaar. Zo'n geval is dus geen
 *      fout, maar het hoort een opgeschreven reden te hebben in plaats van geluk.
 *
 * ⚠️⚠️ **Punt 2 is de hele aanleiding.** 📏 Gemeten op 24-09-2026: van de drie
 *    functies die zowel gedropt zijn als door een edge-functie aangeroepen worden,
 *    draagt er één de wrapper die rij 601 voorschrijft (`0186`), en staan de
 *    andere twee goed om een reden die **nergens** stond — de ene doordat de
 *    aanroep geen argumenten meegeeft, de andere doordat `{ p_dagen }` toevallig
 *    ook de nieuwe vorm oplost.
 *
 * ## Wat hij niet is
 *
 * ⚠️ **Geen vervanging van `edge:gedeployd:controle`.** Die vergelijkt de
 *    gedéployde bundel met de repo en blijft het enige dat de werkelijke
 *    scheefstand ziet. Deze leest twee mappen en ziet de landmijn vóór hij gelegd
 *    wordt; de andere ziet of hij er ligt.
 *
 * ⚠️ **En hij leest de bron van de edge-functie, niet de gedeployde versie.** Wat
 *    daar draait kan een oudere aanroepvorm hebben; dat is precies het risico en
 *    niet iets wat deze controle kan wegnemen. Daarom is punt 2 een register en
 *    geen vinkje.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { zonderCommentaar } from './zonder-commentaar.mjs';
import { zonderCommentaarSql } from './zonder-sql-commentaar.mjs';

export const MIGRATIEMAP = 'supabase/migrations';
export const FUNCTIEMAP = 'supabase/functions';

/**
 * Drops waarvan de oude vorm niet meer bestaat, met de gemeten reden waarom dat
 * vandaag geen landmijn is.
 *
 * ⚠️ **Een rij hier is geen vrijstelling maar een meting.** Hij zegt waaróm de
 *    aanroep de nieuwe vorm oplost. Verandert die aanroep, dan klopt de reden
 *    niet meer — en dan meldt punt 1 hierboven het alsnog, want dat register
 *    dooft niets.
 */
export const VERDWENEN_VORM = [
  {
    functie: 'maak_seizoensrecaps',
    reden:
      '`0194` verving `(timestamptz)` door `(timestamptz, uuid[])` zonder wrapper. ' +
      '📏 De aanroep in `rollover` geeft **geen enkel argument** mee, en in de ' +
      'nieuwe vorm hebben beide parameters een default — dus hij lost op, en hij ' +
      'loste vóór 0194 net zo goed op. Er was hier geen venster.',
  },
  {
    functie: 'slaap_stille_groepen',
    reden:
      '`0194` verving `(integer)` door `(integer, uuid[])` zonder wrapper. ' +
      '📏 De aanroep in `rollover` geeft alleen `p_dagen` mee, en die parameter ' +
      'houdt in de nieuwe vorm dezelfde naam; `p_group_ids` heeft een default. ' +
      '⚠️ Dat is geluk en geen ontwerp: was de parameter hernoemd, dan had ' +
      'dezelfde migratie wél een venster geopend. De wrapper van `0186` is de ' +
      'vorm die dat niet aan naamgeving overlaat.',
  },
  {
    functie: 'keur_vastgelopen_goedkeuringen_goed',
    reden:
      '`0194` verving `(integer)` door `(integer, uuid[])` zonder wrapper. ' +
      '📏 De aanroep in `rollover` geeft alleen `p_termijn_dagen` mee, en die ' +
      'parameter houdt in de nieuwe vorm dezelfde naam; `p_owner_ids` heeft een ' +
      'default. ⚠️⚠️ **Deze rij is er alleen doordat de controle hem vond en ' +
      'de handmatige meting niet** — de aanroep staat over drie regels met de ' +
      'naam op de tweede, en een `grep` per regel ziet hem daarom niet. Zelfde ' +
      'les als QS8-414: een regel die je met de hand handhaaft, handhaaf je op ' +
      'de vorm die je toevallig intypt.',
  },
];

/**
 * Splitst een argumentlijst op komma's die niet in haakjes staan.
 *
 * ⚠️ **Accolades tellen mee, en dat is een gemeten reparatie.** Deze splitser
 *    dient twee bronnen: een SQL-argumentlijst (`numeric(10, 2)`) én het
 *    objectliteraal van een RPC-aanroep. In dat tweede geval mag een waarde zelf
 *    een object zijn, en zonder `{` in de telling valt zo'n aanroep uiteen in
 *    parameters die niet bestaan. De test voor die vorm ving dit.
 */
function splitsArgumenten(tekst) {
  const stukken = [];
  let diepte = 0;
  let huidig = '';
  for (const teken of tekst) {
    if (teken === '(' || teken === '[' || teken === '{') diepte += 1;
    if (teken === ')' || teken === ']' || teken === '}') diepte -= 1;
    if (teken === ',' && diepte === 0) {
      stukken.push(huidig);
      huidig = '';
      continue;
    }
    huidig += teken;
  }
  if (huidig.trim() !== '') stukken.push(huidig);
  return stukken.map((s) => s.trim()).filter((s) => s !== '');
}

/**
 * De parameters van één argumentlijst uit een `create function`.
 *
 * ⚠️ Een argument mag naamloos zijn (`f(uuid, integer)`), en dan is er geen naam
 *    om een aanroep op te matchen. Zo'n parameter telt als verplicht en
 *    naamloos — een RPC-aanroep kan hem niet zetten.
 */
export function parameters(argumentlijst) {
  return splitsArgumenten(argumentlijst).map((stuk) => {
    const heeftDefault = /\bdefault\b/i.test(stuk);
    const naam = /^([a-z_][a-z0-9_]*)\s+\S/i.exec(stuk);
    return { naam: naam ? naam[1].toLowerCase() : null, heeftDefault };
  });
}

/** Leest één migratiebestand: welke functies hij dropt en welke hij definieert. */
export function migratieFeiten(sql) {
  const schoon = zonderCommentaarSql(sql);
  const drops = [...schoon.matchAll(
    /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_0-9]+)\s*\(([^)]*)\)/gi,
  )].map((m) => ({ functie: m[1].toLowerCase(), argumenten: m[2].trim() }));

  const creates = [...schoon.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_0-9]+)\s*\(([\s\S]*?)\)\s*returns/gi,
  )].map((m) => ({ functie: m[1].toLowerCase(), parameters: parameters(m[2]) }));

  return { drops, creates };
}

/**
 * De inhoud van het objectliteraal dat op `start` begint, zonder de accolades.
 *
 * ⚠️ **Balanceren en niet tot de eerste `}` lezen.** Een RPC-aanroep mag een
 *    genest object als waarde hebben, en dan ligt de eerste sluitende accolade
 *    middenin. Leeg als het literaal niet gesloten wordt.
 */
function objectliteraal(bron, start) {
  let diepte = 0;
  for (let i = start; i < bron.length; i += 1) {
    if (bron[i] === '{') diepte += 1;
    if (bron[i] !== '}') continue;
    diepte -= 1;
    if (diepte === 0) return bron.slice(start + 1, i);
  }
  return '';
}

/**
 * De RPC-aanroepen in één edge-bron: de naam en de parameternamen die meegaan.
 *
 * ⚠️⚠️ **De knip is hier geen formaliteit.** 📏 `rollover/index.ts` bevat
 *    `db.rpc(emmer.rpc, …)` als voorbeeld in een comment én de zin
 *    `.rpc('naam')` in de uitleg daarboven. Een lezer zonder knip vindt dus een
 *    RPC die niet bestaat — en meldt hem als een functie zonder handtekening.
 */
export function edgeAanroepen(bron) {
  const schoon = zonderCommentaar(bron);
  const aanroepen = [];

  for (const m of schoon.matchAll(/\.rpc\(\s*'([a-z_0-9]+)'/gi)) {
    const na = schoon.slice(m.index + m[0].length);
    const komma = /^\s*,\s*\{/.exec(na);
    if (!komma) {
      aanroepen.push({ functie: m[1].toLowerCase(), parameters: [] });
      continue;
    }

    const object = objectliteraal(na, komma[0].length - 1);
    const namen = splitsArgumenten(object)
      .map((paar) => /^([a-z_][a-z0-9_]*)\s*:/i.exec(paar))
      .filter(Boolean)
      .map((paar) => paar[1].toLowerCase());

    aanroepen.push({ functie: m[1].toLowerCase(), parameters: namen });
  }

  return aanroepen;
}

/** Past deze aanroep op deze handtekening? */
export function lostOp(aanroep, handtekening) {
  const namen = handtekening.parameters.map((p) => p.naam);
  for (const meegegeven of aanroep.parameters) {
    if (!namen.includes(meegegeven)) return false;
  }
  return handtekening.parameters.every(
    (p) => p.heeftDefault || (p.naam !== null && aanroep.parameters.includes(p.naam)),
  );
}

/**
 * De eindstand van de map: welke handtekeningen bestaan er nog per functie, en
 * welke argumentlijsten zijn er onderweg gedropt.
 */
export function eindstand(bestanden) {
  const levend = new Map();
  const gedropt = new Map();

  for (const { naam, sql } of bestanden) {
    const { drops, creates } = migratieFeiten(sql);

    // ⚠️ Drops en creates worden per bestand in díé volgorde verwerkt: een
    //    migratie die een functie eerst dropt en daarna opnieuw neerzet (de
    //    enige manier om een returntype te wijzigen) laat hem dus bestaan.
    for (const drop of drops) {
      const sleutel = drop.functie;
      if (!gedropt.has(sleutel)) gedropt.set(sleutel, []);
      gedropt.get(sleutel).push({ migratie: naam, argumenten: drop.argumenten });

      const lijst = levend.get(sleutel) ?? [];
      const aantal = splitsArgumenten(drop.argumenten).length;
      levend.set(
        sleutel,
        lijst.filter((h) => h.parameters.length !== aantal),
      );
    }

    for (const create of creates) {
      const lijst = levend.get(create.functie) ?? [];
      const zonder = lijst.filter((h) => h.parameters.length !== create.parameters.length);
      zonder.push(create);
      levend.set(create.functie, zonder);
    }
  }

  return { levend, gedropt };
}

/**
 * ⚠️ **Het register is een parameter en geen vaste waarde**, want anders is deze
 *    functie niet te voeden: elke kleine fixture zou de drie echte rijen als
 *    verweesd melden. Een controle die je niet kunt voeden, kun je niet ijken.
 */
export function beoordeel(migraties, edgeBronnen, register = VERDWENEN_VORM) {
  const { levend, gedropt } = eindstand(migraties);
  const aanroepen = edgeBronnen.flatMap(({ naam, bron }) =>
    edgeAanroepen(bron).map((a) => ({ ...a, bestand: naam })),
  );

  const stuk = kanaries(aanroepen, levend);
  if (stuk.length > 0) return stuk;

  const gedekt = new Set(register.map((r) => r.functie));
  const klachten = aanroepen.flatMap((aanroep) =>
    overEenAanroep(aanroep, levend, gedropt, gedekt),
  );

  for (const rij of register) {
    if ((gedropt.get(rij.functie) ?? []).length > 0) continue;
    klachten.push(
      `\`${rij.functie}\` staat in \`VERDWENEN_VORM\` maar wordt nergens gedropt. ` +
        'Een register dat rijen houdt die niets meer dekken, rot stil — haal hem eruit.',
    );
  }

  return klachten;
}

/**
 * De twee kanaries.
 *
 * ⚠️⚠️ **Een lezer die niets vindt, ziet er per bron anders uit.** Nul aanroepen
 *    levert stil groen op — precies zoals een codebase waar alles klopt. Nul
 *    handtekeningen levert juist élke aanroep als bevinding op, en dat leest als
 *    een storm terwijl het een kapotte lezer is. Daarom twee eigen zinnen.
 */
function kanaries(aanroepen, levend) {
  if (aanroepen.length === 0) {
    return [
      `Geen enkele \`.rpc('…')\` gevonden in \`${FUNCTIEMAP}\`. Dat is geen groen: ` +
        'de edge-functies roepen er normaal veertien aan, dus deze lezer is stuk ' +
        'en niet de codebase.',
    ];
  }
  if (levend.size === 0) {
    return [
      `Geen enkele \`create function\` gevonden in \`${MIGRATIEMAP}\`. Dat is geen ` +
        'groen: dan zou élke aanroep een bevinding zijn, en dat is een kapotte ' +
        'lezer en geen storm.',
    ];
  }
  return [];
}

/** Wat er over één RPC-aanroep te zeggen valt. */
function overEenAanroep(aanroep, levend, gedropt, gedekt) {
  const vormen = levend.get(aanroep.functie) ?? [];

  if (!vormen.some((h) => lostOp(aanroep, h))) {
    return [
      `${aanroep.bestand} roept \`${aanroep.functie}(${aanroep.parameters.join(', ')})\` ` +
        'aan, en geen enkele handtekening die de migratiemap overhoudt past daarop. ' +
        'Dat is een `PGRST202` die op de eerstvolgende uitrol staat te wachten — ' +
        'en de rollover vangt die zacht af, dus het stopt stil.',
    ];
  }

  const drops = gedropt.get(aanroep.functie) ?? [];
  if (drops.length === 0 || gedekt.has(aanroep.functie)) return [];

  const laatste = drops[drops.length - 1];
  const aantal = splitsArgumenten(laatste.argumenten).length;
  if (vormen.some((h) => h.parameters.length === aantal)) return [];

  return [
    `\`${laatste.migratie}\` dropt \`${aanroep.functie}(${laatste.argumenten})\` en die ` +
      `vorm komt niet terug, terwijl ${aanroep.bestand} die functie aanroept. De aanroep ` +
      'in de repo lost op tegen de nieuwe vorm, maar de **gedeployde** functie kan een ' +
      'andere aanroepvorm hebben — dat is precies het venster van `0185`. Zet de oude ' +
      'handtekening één release als wrapper terug (zoals `0186`), of leg in ' +
      '`VERDWENEN_VORM` vast waaróm er hier geen venster is.',
  ];
}

function lees(map) {
  return readdirSync(map)
    .filter((naam) => naam.endsWith('.sql'))
    .sort()
    .map((naam) => ({ naam, sql: readFileSync(join(map, naam), 'utf8') }));
}

function edgeBronnen() {
  return readdirSync(FUNCTIEMAP, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(FUNCTIEMAP, d.name))
        .filter((naam) => naam.endsWith('.ts'))
        .map((naam) => ({
          naam: `${d.name}/${naam}`,
          bron: readFileSync(join(FUNCTIEMAP, d.name, naam), 'utf8'),
        })),
    );
}

export function hoofd() {
  const bronnen = edgeBronnen();
  const klachten = beoordeel(lees(MIGRATIEMAP), bronnen);

  if (klachten.length > 0) {
    console.error('✗ handtekening-controle:');
    for (const klacht of klachten) console.error(`  - ${klacht}`);
    return 1;
  }

  const aantal = bronnen.flatMap(({ bron }) => edgeAanroepen(bron)).length;
  console.log(
    `handtekening-controle: ${aantal} RPC-aanroepen in ${bronnen.length} edge-bron(nen) ` +
      `lossen op tegen de migratiemap; ${VERDWENEN_VORM.length} verdwenen vorm(en) met ` +
      'een gemeten reden.',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
