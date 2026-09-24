#!/usr/bin/env node
/**
 * Meet hoe ver `src/lib/database.types.ts` van het schema af staat — QS8-541.
 *
 * ⚠️⚠️ **Dit script telt geen regels, en dat is de hele reden dat het bestaat.**
 *    Rij 571 van `docs/ENGINEER-REVIEW.md` en QS8-541 zelf noemen een getal:
 *    een generatie vanaf productie voegt **771** regels toe en haalt er **343**
 *    weg. 📏 Dat getal reproduceert (19-09-2026, opnieuw gemeten: exact 771 en
 *    343) — maar het meet de drift niet.
 *
 *    Wat er in die 1114 regels zit, nagelopen:
 *
 *      - `PostgrestVersion: "14.5"` tegen `"14.17"` — de versie van de
 *        generator, niet van het schema;
 *      - hele tabelblokken die aan **allebei** de kanten staan maar in een
 *        andere vololgorde, zoals `reports` — 📏 nagemeten op productie:
 *        `to_regclass('public.reports') is not null` = **true**;
 *      - `Relationships`-blokken die per generatorversie anders genest zijn.
 *
 *    Een regeldiff tussen twee gegenereerde bestanden meet dus vooral het
 *    verschil tussen twee **generatoren**. Dat is precies de vorm waar CLAUDE.md
 *    voor waarschuwt: een meting die een ander ding meet dan haar naam belooft,
 *    en die daarna als vaststaand geciteerd wordt.
 *
 * 📏 **Structureel vergeleken ziet dezelfde drift er zo uit** (19-09-2026,
 *    productie `0282` tegen `src/lib/database.types.ts`):
 *
 *      Tables      44 tegen 43   — `dagtellers` ontbreekt in de types
 *      Views        4 tegen  4   — gelijk
 *      Functions  192 tegen 145  — 47 ontbreken, 1 staat er te veel
 *
 *    Die ene is `ketting_schakel`, weg sinds 0133 en nog steeds in het bestand —
 *    precies het voorbeeld dat QS8-541 noemde, nu gemeten in plaats van
 *    vermoed.
 *
 * ⚠️⚠️ **De vorm die dit script met rust moet laten: een overload.** De
 *    generator schrijft een functie met meer dan één handtekening als een unie:
 *
 *      activeer_weekplanstap:
 *        | { Args: { … }; Returns: Json }
 *        | { Args: { … }; Returns: Json }
 *
 *    De regel draagt dan géén `{`. Een naamregex op `^      (\w+): \{` — de
 *    eerste die je schrijft — mist hem, en meldt élke overloaded functie als
 *    drift. 📏 Dat is bij het bouwen van dit script echt gebeurd:
 *    `activeer_weekplanstap` kwam eruit als "alleen in de repo" terwijl hij op
 *    productie **twee** overloads heeft en in béíde bestanden staat.
 *
 * ## Wat dit script wél en niet kan scheiden
 *
 * Een naam die in het bestand staat en niet in de generatie is óf handwerk dat
 * vooruitloopt op een nog niet uitgerolde migratie, óf rommel van iets dat
 * gedropt is. **Die twee zijn alleen te scheiden door tegen de map te
 * genereren**, niet tegen productie — vanaf productie meet je de
 * uitrolachterstand mee. Het script zegt daarom bij elke uitslag wélke bron hij
 * gebruikt heeft en wat die bron níet kan onderscheiden.
 *
 * ## Bronnen, in volgorde
 *
 *   1. `TYPES_GENERATIE=<pad>` — een generatie die al op schijf staat. Zo voedt
 *      een `/audit`-sessie de MCP-tool `generate_typescript_types` erin; die
 *      vraagt geen token en geen Docker.
 *   2. `SUPABASE_ACCESS_TOKEN` — dan haalt hij hem zelf op vanaf productie.
 *   3. Anders: **OVERGESLAGEN**, met de reden. Dat is ongemeten en niet groen;
 *      de poort telt het als zodanig.
 *
 * ## ⚠️⚠️ Waarom hij in een cloudsessie standaard niets meet — en wat dat kostte
 *
 * Een bouwsessie in de cloud heeft geen `SUPABASE_ACCESS_TOKEN` (Q-TODO C3) en
 * zet geen `TYPES_GENERATIE`, want dat bestand moet er eerst met de hand komen.
 * Bron 3 is dus **de standaard en niet de uitzondering**: deze controle telt bij
 * elke poortronde mee in de rij "hebben niets gemeten", en wie alleen naar de
 * exitcode kijkt, telt hem als groen.
 *
 * 📏 Wat dat gekost heeft, gemeten op 19-09-2026 en herhaald op 21-09-2026 (QS8-569):
 * de éérste keer dat hij gevoed werd, meldde hij **57** naamverschillen — 55
 * functienamen en de tabel `dagtellers` die het schema wel had en de types niet,
 * plus `ketting_schakel` die de types wel hadden en het schema niet. **Zes**
 * daarvan kwamen uit de uitrol van die dag; de andere **51** stonden er al, tot
 * `mijn_datum` sinds `0170` aan toe. Niet één ervan is ooit ergens rood geworden.
 *
 * ⚠️ **De route die hem wél meetbaar maakt, vraagt niets.** De Supabase-MCP-tool
 * `generate_typescript_types` werkt in een cloudsessie zonder token en zonder
 * Docker; schrijf zijn uitvoer naar een bestand en draai
 * `TYPES_GENERATIE=<pad> npm run typesdrift:controle`. Zo is de meting hierboven
 * gedaan en zo is QS8-569 gesloten. **Doe dat bij elke ronde waarin je de
 * migratiemap of productie aanraakt** — dat is het enige moment waarop dit gat
 * kan ontstaan, en de enige keer dat iemand keek stond het op 57.
 *
 * ⚠️ Hij vergelijkt sinds QS8-593 **namen én velden**. Tot dan zag hij alleen
 * namen: een handgeschreven `| null` op een bestaand argument of een kolom die
 * aan een handtekening ontbrak, kwam hier nooit uit. 📏 Op 21-09-2026 waren dat
 * er veertien, allemaal in namen die deze controle groen noemde. Een correctie
 * die de generator niet kán weten, hoort in `src/lib/database.types.correcties.ts`,
 * onder `tests/beloftes/typecorrecties.test.ts` — niet in het gegenereerde bestand.
 *
 * ⚠️ Een generatie vanaf de **map** vraagt `supabase gen types --db-url`, en dat
 *    commando start een Docker-container. 📏 Gemeten in een cloudsessie: de CLI
 *    is wél op te halen (`npx supabase@latest --version` geeft 2.117.0, dus
 *    Q-TODO C3 klopt niet meer als "de CLI ontbreekt"), maar de daemon niet —
 *    `dial unix /var/run/docker.sock: connect: no such file or directory`. De
 *    blokkade is dus de socket en niet het PATH.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const TYPESBESTAND = 'src/lib/database.types.ts';
const PROJECT_REF = 'wehgocadxehottiiyvsc';

/** Onder deze grens is het geen schema maar een foutmelding. */
const MINIMAAL_AANTAL_BYTES = 5000;

/** De secties die de generator op inspringing 4 neerzet. */
export const SECTIES = /** @type {const} */ ([
  'Tables',
  'Views',
  'Functions',
  'Enums',
  'CompositeTypes',
]);

/** @typedef {(typeof SECTIES)[number]} Sectie */
/** @typedef {Record<Sectie, Set<string>>} Namen */
/** @typedef {Record<Sectie, {alleenSchema: string[], alleenTypes: string[]}>} Verschillen */

/**
 * Haalt per sectie de namen op.
 *
 * ⚠️ Drie vormen, en de derde is de reden dat dit een functie is en geen regex:
 *
 *   `naam: {`                              — een blok over meer regels
 *   `naam: { Args: never; Returns: … }`    — hetzelfde op één regel
 *   `naam:` gevolgd door `| {`             — een overload-unie, zónder `{`
 *
 * @param {string} tekst de inhoud van een gegenereerd typesbestand
 * @returns {Namen} per sectie de namen die erin staan
 */
export function ontleed(tekst) {
  const uit = /** @type {Namen} */ ({
    Tables: new Set(),
    Views: new Set(),
    Functions: new Set(),
    Enums: new Set(),
    CompositeTypes: new Set(),
  });

  let huidig = null;
  for (const regel of String(tekst).split('\n')) {
    const sectie = /^ {4}(\w+): \{\s*$/.exec(regel);
    const naamVanSectie = /** @type {Sectie} */ (sectie?.[1] ?? '');
    if (sectie !== null && SECTIES.includes(naamVanSectie)) {
      huidig = naamVanSectie;
      continue;
    }
    if (huidig === null) continue;

    // Einde van de sectie: een sluitaccolade op inspringing 4.
    if (/^ {4}\}/.test(regel)) {
      huidig = null;
      continue;
    }

    // ⚠️ `: \{` én `:` zonder meer — de tweede is de overload-unie.
    const naam = /^ {6}(\w+):(?: \{.*)?\s*$/.exec(regel);
    if (naam !== null) uit[huidig].add(naam[1] ?? '');
  }
  return uit;
}

/**
 * Per sectie per naam het blok zoals het in het bestand staat — QS8-593.
 *
 * ⚠️⚠️ **Waarom dit naast `ontleed()` staat en er niet in zit.** `ontleed()`
 *    beantwoordt *welke namen staan er*, en dat is de vraag die de drift van 57
 *    vond (QS8-569). De vraag die daarnáást openbleef is *staat er achter die
 *    naam hetzelfde*, en die is met namen niet te beantwoorden: 📏 bij het
 *    sluiten van QS8-569 bleven er **37** veldverschillen onzichtbaar, waaronder
 *    veertien handedits en veertien regels waarmee `koppelbare_doelen` een vorm
 *    van `goal_dashboard` beschreef die niet meer bestond.
 *
 * ⚠️ Een blok loopt tot de volgende naam op de inspringing van een naam, en niet
 *    tot de sluitende accolade. Dat stond hier eerst andersom (*"de haakjes
 *    worden geteld"*), en 📏 die eerste vorm liet een overload-blok leeg: de
 *    generator schrijft een overload als unie zonder `{` op de naamregel. De
 *    ijking van QS8-593 vond dat, en de toets
 *    `vergelijkt ook de inhoud van een overload-unie` houdt het vast.
 *
 * @param {string} tekst
 * @returns {Record<Sectie, Map<string, string>>}
 */
export function blokken(tekst) {
  const uit = /** @type {Record<Sectie, Map<string, string>>} */ ({});
  for (const s of SECTIES) uit[s] = new Map();

  let sectie = null;
  let naam = null;
  let buffer = [];

  const sluit = () => {
    if (sectie !== null && naam !== null) uit[sectie].set(naam, buffer.join('\n').trim());
    naam = null;
    buffer = [];
  };

  for (const regel of String(tekst).split('\n')) {
    const kop = /^ {4}(\w+): \{\s*$/.exec(regel);
    const kopnaam = /** @type {Sectie} */ (kop?.[1] ?? '');
    if (kop !== null && SECTIES.includes(kopnaam)) {
      sluit();
      sectie = kopnaam;
      continue;
    }
    if (sectie === null) continue;

    // Einde van de sectie: een sluitaccolade op inspringing 4.
    if (/^ {4}\}/.test(regel)) {
      sluit();
      sectie = null;
      continue;
    }

    // ⚠️⚠️ **Een nieuwe naam sluit de vorige, en dát is wat een overload dekt.**
    //    Een blok liep hiervoor tot zijn accolades in balans waren, en bij een
    //    overload-unie (`f:` zónder `{`) was dat meteen: 📏 gemeten gaf
    //    `blokken()` voor zo'n functie een **lege** tekst terug, dus een handedit
    //    bínnen een overload was onzichtbaar — precies het gat dat deze
    //    vergelijking moest dichten, in zijn eigen reparatie. Er staan er vandaag
    //    **2** in `src/lib/database.types.ts`. Een naam staat altijd op
    //    inspringing 6 en genest veld op 8 of meer, dus "de volgende naam" is
    //    hier een betrouwbaardere grens dan de accoladestand.
    const begin = /^ {6}(\w+):(.*)$/.exec(regel);
    if (begin !== null) {
      sluit();
      naam = begin[1] ?? '';
      buffer = [(begin[2] ?? '').trim()];
      continue;
    }

    if (naam !== null) buffer.push(regel.trim());
  }

  sluit();
  return uit;
}

/**
 * Verschillen die de generator zelf maakt en die niets over het schema zeggen.
 *
 * ⚠️⚠️ **Een register en geen stille filter, en de reden staat in de rij die dit
 *    issue aankondigde:** `Relationships`-ruis en generatorverschillen horen deze
 *    controle niet rood te maken. Maar een filter dat niemand kan lezen, is een
 *    gat dat niemand kan vinden — dus staat hier per vorm wát er genegeerd wordt
 *    en waaróm.
 *
 * ⚠️ **`Relationships` is vandaag niet nodig en staat er toch.** 📏 Gemeten op
 *    22-09-2026 tegen productie `0294`: **nul** namen met een afwijkend blok, dus
 *    ook nul waarvan alleen dit deel verschilt. Hij staat er op grond van de
 *    meting van 21-09, waar **9** van de 37 verschillen precies deze vorm hadden:
 *    per generatorversie anders genest, over hetzelfde schema. Dat is een
 *    aanname over de toekomst en geen meting van vandaag, en zo hoort hij gelezen
 *    te worden.
 *
 * @type {{ naam: string, patroon: RegExp, reden: string }[]}
 */
export const GENERATORRUIS = [
  {
    naam: 'Relationships',
    patroon: /Relationships:[\s\S]*$/,
    reden:
      'de generator nest dit blok per versie anders over hetzelfde schema — 📏 9 van de ' +
      '37 verschillen van 21-09-2026 hadden deze vorm, en 0 van de 0 op 22-09-2026',
  },
];

/** Het blok zonder de delen die de generator zelf varieert. */
export function zonderRuis(blok) {
  let uit = String(blok);
  for (const { patroon } of GENERATORRUIS) uit = uit.replace(patroon, '');
  return uit.trimEnd();
}

/**
 * De namen die aan beide kanten staan maar iets anders beschrijven — QS8-593.
 *
 * ⚠️ Alleen namen die **beide** kanten kennen. Een naam die maar aan één kant
 *    staat, is al een naamverschil; die hier nog een keer melden maakt van één
 *    bevinding twee, en een controle die dubbel telt leer je wantrouwen.
 *
 * @returns {{ sectie: Sectie, naam: string }[]}
 */
export function veldverschillen(gegenereerd, huidig) {
  const g = blokken(gegenereerd);
  const h = blokken(huidig);
  const uit = [];

  for (const s of SECTIES) {
    for (const [naam, blok] of g[s]) {
      const ander = h[s].get(naam);
      if (ander === undefined) continue;
      if (zonderRuis(blok) !== zonderRuis(ander)) uit.push({ sectie: s, naam });
    }
  }
  return uit;
}

/**
 * Legt een generatie naast het bestand in de repo.
 *
 * @param {string} gegenereerd
 * @param {string} huidig
 * @returns {{ perSectie: Verschillen, totaal: number }}
 */
export function vergelijk(gegenereerd, huidig) {
  const g = ontleed(gegenereerd);
  const h = ontleed(huidig);

  const perSectie = /** @type {Verschillen} */ ({});
  let totaal = 0;

  for (const s of SECTIES) {
    const gs = g[s];
    const hs = h[s];
    const alleenSchema = [...gs].filter((n) => !hs.has(n)).sort();
    const alleenTypes = [...hs].filter((n) => !gs.has(n)).sort();
    perSectie[s] = { alleenSchema, alleenTypes };
    totaal += alleenSchema.length + alleenTypes.length;
  }
  return { perSectie, totaal };
}

/**
 * Bepaalt waar de generatie vandaan komt.
 *
 * @param {Record<string, string | undefined>} omgeving
 * @returns {{ soort: 'bestand'|'productie'|'geen', tekst?: string, reden?: string, bron?: string }}
 */
export function kiesBron(omgeving = process.env) {
  const pad = omgeving.TYPES_GENERATIE;
  if (typeof pad === 'string' && pad !== '') {
    if (!existsSync(pad)) {
      return { soort: 'geen', reden: `TYPES_GENERATIE wijst naar ${pad} en dat bestaat niet` };
    }
    return { soort: 'bestand', tekst: readFileSync(pad, 'utf8'), bron: pad };
  }

  if (typeof omgeving.SUPABASE_ACCESS_TOKEN === 'string' && omgeving.SUPABASE_ACCESS_TOKEN !== '') {
    const uit = spawnSync(
      'npx',
      ['supabase', 'gen', 'types', 'typescript', '--project-id', PROJECT_REF],
      { encoding: 'utf8', shell: true, maxBuffer: 32 * 1024 * 1024 },
    );
    const tekst = uit.stdout ?? '';
    if (uit.status !== 0 || !tekst.includes('export type Database')) {
      return {
        soort: 'geen',
        reden: `de CLI gaf geen schema terug (${(uit.stderr || '').trim().split('\n')[0] ?? 'geen uitleg'})`,
      };
    }
    if (tekst.length < MINIMAAL_AANTAL_BYTES) {
      return { soort: 'geen', reden: `de generatie is maar ${tekst.length} bytes en dus geen schema` };
    }
    return { soort: 'productie', tekst, bron: `productie (${PROJECT_REF})` };
  }

  return {
    soort: 'geen',
    reden:
      'er is geen generatie om mee te vergelijken — zet TYPES_GENERATIE naar een bestand ' +
      '(een /audit-sessie schrijft daar de uitvoer van de MCP-tool generate_typescript_types in) ' +
      'of zet SUPABASE_ACCESS_TOKEN',
  };
}

/**
 * Zet een uitslag om in regels tekst.
 *
 * @param {ReturnType<typeof vergelijk>} uitslag
 * @param {string} bron
 * @returns {string[]}
 */
export function rapport(uitslag, bron) {
  const regels = [];
  for (const s of SECTIES) {
    const r = uitslag.perSectie[s];
    if (r.alleenSchema.length === 0 && r.alleenTypes.length === 0) continue;
    regels.push(`  ${s}:`);
    if (r.alleenSchema.length > 0) {
      regels.push(`    alleen in het schema (${r.alleenSchema.length}): ${r.alleenSchema.join(', ')}`);
    }
    if (r.alleenTypes.length > 0) {
      regels.push(`    alleen in de types  (${r.alleenTypes.length}): ${r.alleenTypes.join(', ')}`);
    }
  }
  regels.push('');
  regels.push(`  bron: ${bron}`);
  if (bron.startsWith('productie')) {
    regels.push(
      '  ⚠️ Deze bron kan vooruitlopend handwerk niet van drift scheiden: een naam die',
      '     alleen in de types staat is óf rommel, óf een handtekening die wacht op een',
      '     migratie die nog niet uitgerold is. Alleen een generatie vanaf de map scheidt die twee.',
    );
  }
  return regels;
}

/**
 * ⚠️ Geeft een exitcode terug in plaats van hem te zetten — dezelfde vorm als
 *    `dml-controle` en `audit-controle`. Zo is de uitslag ook in een toets te
 *    lezen zonder het proces te beëindigen.
 *
 * ⚠️⚠️ **En hij krijgt zijn buitenwereld als parameter — QS8-601.** Een
 *    exitcode teruggeven was de helft: `hoofd()` las de omgeving en het
 *    typebestand zelf, dus geen toets kon hem voeden. 📏 Daardoor liet
 *    `const velden = []` hieronder 30 van 30 toetsen groen, en gaf de controle
 *    met een echte handedit exit 0 met *"dezelfde namen én dezelfde velden"*.
 *    `veldverschillen()` was goed getoetst; de regel die zijn uitslag in de
 *    exitcode zet niet.
 *
 * @param {object} [io]
 * @param {Record<string, string | undefined>} [io.omgeving]
 * @param {() => string} [io.leesHuidig] het typebestand van de repo
 * @param {(tekst: string) => void} [io.log]
 * @param {(tekst: string) => void} [io.fout]
 * @returns {number} 0 als er niets te melden is of niets te meten viel, 1 bij drift
 */
export function hoofd({
  omgeving = process.env,
  leesHuidig = () => readFileSync(TYPESBESTAND, 'utf8'),
  log = (tekst) => console.log(tekst),
  fout = (tekst) => console.error(tekst),
} = {}) {
  const bron = kiesBron(omgeving);
  if (bron.soort === 'geen') {
    log(`typesdrift-controle: OVERGESLAGEN — ${bron.reden}.`);
    log('  Dat is ongemeten en niet groen.');
    return 0;
  }

  const huidig = leesHuidig();
  const uitslag = vergelijk(bron.tekst ?? '', huidig);
  const velden = veldverschillen(bron.tekst ?? '', huidig);

  if (uitslag.totaal === 0 && velden.length === 0) {
    log(
      `typesdrift-controle: ${TYPESBESTAND} kent dezelfde namen én dezelfde velden als ` +
        `het schema (bron: ${bron.bron}).`,
    );
    return 0;
  }

  if (uitslag.totaal > 0) {
    fout(`✗ typesdrift-controle: ${uitslag.totaal} naam/namen verschillen.\n`);
    for (const r of rapport(uitslag, bron.bron ?? '?')) fout(r);
  }

  // ⚠️⚠️ **Apart gemeld en niet bij de namen opgeteld — QS8-593.** Dit is een
  //    andere vraag met een ander antwoord: bij een naamverschil hergenereer je,
  //    bij een veldverschil is de vraag eerst *wie heeft hier met de hand in
  //    geschreven*. 📏 Bij QS8-569 bleven er zo 37 onzichtbaar, waaronder
  //    veertien handedits die bij de eerste hergeneratie verdwenen zonder dat er
  //    iets rood van werd.
  if (velden.length > 0) {
    fout(
      `${uitslag.totaal > 0 ? '\n' : ''}✗ typesdrift-controle: ${velden.length} naam/namen ` +
        'staan aan beide kanten maar beschrijven iets anders.\n',
    );
    for (const { sectie, naam } of velden) fout(`    ${sectie}.${naam}`);
    // ⚠️ Eén tekst met regeleinden en niet losse argumenten: `console.error`
    //    zet losse argumenten met een spatie op één regel.
    fout(
      [
        '',
        '  Een veldverschil is geen naamverschil: hergenereren laat het verdwijnen zónder',
        '  dat iemand gezien heeft wát er weg ging. Kijk eerst of het handwerk is — een',
        '  correctie hoort in `src/lib/database.types.correcties.ts`, onder de toets in',
        '  `tests/beloftes/typecorrecties.test.ts`, en niet in het gegenereerde bestand.',
      ].join('\n'),
    );
  }

  if (uitslag.totaal > 0) {
    fout('\n  Hergenereer met `npm run types:db`, of leg per naam vast waarom hij afwijkt.');
  }
  return 1;
}

// ⚠️ `pathToFileURL` en niet `endsWith`: op Windows draait een script met
//    backslashes in `process.argv[1]`, en een padvergelijking op tekst gaat daar
//    stuk. `tests/scripts/padvormen.test.ts` bewaakt deze vorm — en hij vond
//    hier de naïeve variant.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
