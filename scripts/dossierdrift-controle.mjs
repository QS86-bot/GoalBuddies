/**
 * dossierdrift:controle — een dossierrij waarvan de meting achterhaald is (QS8-452)
 *
 * ---------------------------------------------------------------------------
 * Wat deze controle bewaakt
 * ---------------------------------------------------------------------------
 *
 * Een rij in `docs/ENGINEER-REVIEW.md` draagt een 📏-meting: "zo staat dit
 * object er vandaag bij". Wordt datzelfde object daarná door een migratie
 * herschreven, dan is die meting een uitspraak over een versie die niet meer
 * bestaat — en niets merkte dat. De rij blijft staan en leest als actueel.
 *
 * De uitslag is **"deze rij is verdacht"** en nooit "deze rij is opgelost".
 * Een aanraking bewijst niet dat de bevinding vervallen is; hij bewijst dat
 * iemand moet kijken. Deze controle sluit daarom nooit zelf een rij — zou hij
 * dat doen, dan verplaatst het probleem zich naar een stillere plek.
 *
 * ---------------------------------------------------------------------------
 * Waarom dit de vijfde kandidaatregel is en de eerste die het haalt
 * ---------------------------------------------------------------------------
 *
 * QS8-452 vroeg om een controle die Linear naast de code legt. Vier regels zijn
 * daarvoor gemeten en alle vier afgevallen, want ze leunen op een issuenummer —
 * en in dit project is een issuenummer een **citaat** en geen structurele
 * verwijzing. 📏 De getallen, op de open rijen met risico Kritiek/Hoog/Middel:
 *
 *   | regel                                   | vuurt        |
 *   |-----------------------------------------|--------------|
 *   | A "noemt een Done issue"                | 48/55  (87%) |
 *   | B "Done ná de datum van de rij"         | 27/49  (55%) |
 *   | richting 1, gelande merge               |  7/18  (39%) |
 *   | C "de gemeten objecten zijn aangeraakt" | 19/43  (44%) |
 *   | **C met de twee verfijningen hieronder**|  **4/43 (9%)** |
 *
 * ⚠️⚠️ **En regel C valt op een ándere as dan A en B, wat de reden is dat hij
 *    het wél haalt.** Regel B bleek te meten hoe goed een rij ONDERHOUDEN werd:
 *    hij vlagde de rijen die net waren bijgewerkt, want een vervolgissue noemen
 *    is hoe een verzorgde rij eruitziet. Diezelfde toets op regel C: 📏 mediane
 *    rijdatum 2026-09-07 voor de rijen die vuren tegen 2026-09-08 voor de rijen
 *    die niet vuren, met in beide groepen 2026-08-15 als oudste. Regel C is
 *    dus géén verkapte ouderdomsmeter.
 *
 * ---------------------------------------------------------------------------
 * De twee verfijningen, en waar ze vandaan komen
 * ---------------------------------------------------------------------------
 *
 * Allebei komen ze uit het met de hand nalopen van de valse meldingen, niet uit
 * het draaien aan een drempel tot het getal bevalt.
 *
 * 1. **Alleen objecten die de rij in zijn TITEL noemt.** De rompkolom noemt
 *    van alles in het voorbijgaan; de titel zegt waar de rij óver gaat.
 *    📏 Dat alleen brengt 19 terug naar 6.
 *
 * 2. **Een migratie die de rij zélf noemt, is geen drift.** 📏 Het zuiverste
 *    geval was r650: de titel eindigt op *"(QS8-333, 0244)"* en de aanraking
 *    wás `0244`. De rij beschrijft die migratie; hij loopt er niet op achter.
 *    Zo'n rij is te herkennen zonder oordeel — hij draagt het nummer. 6 → 4.
 *
 * ⚠️ **Een derde verfijning is gemeten en bewust NIET ingevoerd.** De
 *    Datum-kolom is wanneer de bevinding gevónden is, en rijen dragen latere
 *    hermetingen als datum in hun tekst; peilen op de jóngste datum in de rij
 *    brengt 4 → 1. Maar die ene die overblijft is niet de scherpste — het is de
 *    enige die overleeft. 📏 Hij liet r788 vallen, en die was aantoonbaar terecht
 *    gevlagd: `0289` herschreef `schone_naam()` op 17-09 en de rij beschrijft de
 *    stand daarvóór. De rij was óók op 17-09 bijgewerkt, alleen eerder op de dag.
 *    **Datums hebben hier dagkorrel, en die korrel is grover dan het verschil dat
 *    de verfijning moet zien.** Een verfijning die een bewezen echte melding
 *    wegneemt om het getal te drukken, is het getal aan het optimaliseren en niet
 *    de bevinding.
 *
 * ---------------------------------------------------------------------------
 * Wat deze controle NIET ziet
 * ---------------------------------------------------------------------------
 *
 * ⚠️ Alleen objecten in de database. Een rij die `notificaties/index.ts` meet
 *    loopt net zo goed achter, en daar is een migratie geen signaal voor.
 * ⚠️ Alleen rijen die een object **in backticks** noemen. Wie de naam in proza
 *    schrijft, ontsnapt eraan.
 * ⚠️ Alleen risico Kritiek/Hoog/Middel. De Laag-rijen zijn er ~280 en die
 *    hebben hun eigen grendel (`review:controle` op *"Wordt zwaarder als"*).
 *
 * Dat zijn grenzen en geen gebreken: de controle zegt wat hij meet.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { cellenVanRij } from './review-controle.mjs';

const DOSSIER = 'docs/ENGINEER-REVIEW.md';
const MIGRATIES = 'supabase/migrations';
const KOLOMMEN = 4;

/**
 * ⚠️ **Dit filter hoort bij `objectenInTitel()` en niet bij de migratiekant.**
 *    Dat is met een mutatie vastgesteld en niet beredeneerd: de SCHEMAS-toets
 *    stond eerst in allebei, en hem uit `objectenVanMigratie()` halen liet de
 *    hele suite groen. 📏 De reden is dat élk schemavoorvoegsel daar in een
 *    niet-vangende groep staat — `(?:[a-z_]+\.)?` — dus er kan nooit een
 *    schemanaam in een capture landen. Een toets die niet kan vuren is de vorm
 *    van een grendel die er wel staat en niets bewaakt, dus hij staat er niet
 *    meer. Aan de títelkant vuurt hij wél: een rij die `public` tussen
 *    backticks schrijft matchte anders elke `alter`-migratie.
 */
const SCHEMAS = new Set(['public', 'storage', 'auth', 'extensions', 'pg_temp', 'pg_catalog']);

/**
 * De objecten die een migratie DEFINIEERT of WIJZIGT — niet die hij noemt.
 *
 * ⚠️ **Geen tabelnamen.** Een tabel wordt door tientallen migraties aangeraakt;
 *    "`commitments` is sinds je meting aangeraakt" is altijd waar en zegt dus
 *    niets. 📏 Tabellen meetellen bracht de uitslag van 19 naar 24.
 */
export function objectenVanMigratie(sql) {
  const uit = new Set();
  const patronen = [
    /create\s+(?:or\s+replace\s+)?function\s+(?:[a-z_]+\.)?"?([a-z0-9_]+)"?\s*\(/gi,
    /drop\s+function\s+(?:if\s+exists\s+)?(?:[a-z_]+\.)?"?([a-z0-9_]+)"?/gi,
    /add\s+constraint\s+"?([a-z0-9_]+)"?/gi,
    /create\s+policy\s+"?([a-z0-9_ ]+?)"?\s+on/gi,
    /create\s+(?:constraint\s+)?trigger\s+"?([a-z0-9_]+)"?/gi,
    /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi,
  ];
  for (const p of patronen) {
    for (const m of sql.matchAll(p)) {
      const naam = m[1].toLowerCase().trim();
      if (naam !== '') uit.add(naam);
    }
  }
  return uit;
}

/**
 * De objecten die een dossierrij in zijn titel noemt.
 *
 * ⚠️ `schone_naam()` en `public.schone_naam` zijn hetzelfde object; de haakjes
 *    en het schema gaan eraf. Een codespan met een spatie of een punt erin is
 *    geen identifier en valt af.
 */
export function objectenInTitel(titel) {
  const uit = new Set();
  for (const m of titel.matchAll(/`([^`]+)`/g)) {
    const kaal = m[1].replace(/\(\)$/, '').replace(/^[a-z_]+\./, '').trim().toLowerCase();
    if (/^[a-z0-9_]+$/.test(kaal) && !SCHEMAS.has(kaal)) uit.add(kaal);
  }
  return uit;
}

/** De migratienummers die de rij zelf noemt — verfijning 2. */
export function eigenMigraties(rij) {
  return new Set([...`${rij.titel} ${rij.romp}`.matchAll(/\b(0\d{3})\b/g)].map((m) => m[1]));
}

/** De rijen van de dossiertabel, met regelnummer. */
export function dossierRijen(regels) {
  const uit = [];
  for (let i = 0; i < regels.length; i += 1) {
    if (!regels[i].startsWith('|')) continue;
    const c = cellenVanRij(regels[i]);
    if (c.length !== KOLOMMEN) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c[0])) continue;
    uit.push({ regel: i + 1, datum: c[0], titel: c[1], romp: c[2], risico: c[3] });
  }
  return uit;
}

/** Komt deze rij in aanmerking? Open, zwaar, en met een meting erin. */
export function komtInAanmerking(rij) {
  if (rij.risico.includes('~~')) return false;
  if (!/Kritiek|Hoog|Middel/i.test(rij.risico)) return false;
  return /📏/.test(`${rij.titel} ${rij.romp}`);
}

/**
 * De bevindingen.
 *
 * @param {string[]} regels            de regels van het dossier
 * @param {{nummer: string, datum: string, objecten: Set<string>}[]} migraties
 */
export function controleer(regels, migraties) {
  const perObject = new Map();
  for (const m of migraties) {
    for (const obj of m.objecten) {
      if (!perObject.has(obj)) perObject.set(obj, []);
      perObject.get(obj).push(m);
    }
  }

  const uit = [];
  for (const rij of dossierRijen(regels).filter(komtInAanmerking)) {
    const treffers = treffersVoor(rij, perObject);
    if (treffers.length > 0) uit.push({ ...rij, treffers });
  }
  return uit;
}

/**
 * De aanrakingen die ná de meting van deze rij vielen.
 *
 * ⚠️ Een eigen functie en geen derde lus in `controleer()`: dat was vier lagen
 *    diep en `max-depth` staat op drie (coderegel 15). Zelfde reden als
 *    `rijen()` in `src/shared/bladeren` — een lus in een lus in een lus is
 *    precies de vorm waarin QS8-422 achttien overtredingen vond die niemand
 *    geschreven had.
 */
function treffersVoor(rij, perObject) {
  const eigen = eigenMigraties(rij);
  const uit = [];
  for (const obj of objectenInTitel(rij.titel)) {
    const raakt = (perObject.get(obj) ?? []).filter(
      (m) => m.datum > rij.datum && !eigen.has(m.nummer),
    );
    for (const m of raakt) uit.push({ object: obj, nummer: m.nummer, datum: m.datum });
  }
  return uit;
}

/**
 * De datum waarop dit pad voor het eerst in de geschiedenis voorkomt.
 *
 * ⚠️⚠️ **Met opzet zónder `--diff-filter=A`, en dat is met de hand gemeten.**
 *    Die vlag lijkt het juiste gereedschap — "toen dit bestand werd
 *    toegevoegd" — maar `git log` merkt een hernoeming op een enkel pad niet
 *    als `A` aan. 📏 Elf van de 292 migraties kwamen er zo zonder datum uit,
 *    en het waren precies de **hernummerde**: `0176`–`0180`, `0236`, `0237`,
 *    `0239`, `0245`, `0248` en `0269`. Hernummeren gebeurt bij een botsing,
 *    dus dat is de jongste klasse — juist de migraties die drift veroorzaken.
 *
 * ⚠️ De eerste versie sloeg een datumloze migratie stil over. Dat faalt **open**:
 *    een aanraking die niemand ziet is een groene controle, en dat is precies de
 *    richting die deze controle niet mag hebben. Nu is het een harde fout.
 */
function oudsteCommitdatum(pad) {
  const regels = execFileSync('git', ['log', '--format=%ad', '--date=short', '--', pad], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((r) => r !== '');

  if (regels.length === 0) {
    console.error(
      `dossierdrift-controle: ${pad} komt niet in de git-geschiedenis voor, dus er is\n` +
        '  geen datum om de dossierrijen tegen af te zetten. Commit hem eerst.',
    );
    process.exit(1);
  }
  return regels.at(-1);
}

/** De migraties van schijf, met hun aanmaakdatum uit git. */
function migratiesVanSchijf() {
  return readdirSync(MIGRATIES)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((naam) => ({
      nummer: naam.slice(0, 4),
      datum: oudsteCommitdatum(`${MIGRATIES}/${naam}`),
      objecten: objectenVanMigratie(readFileSync(`${MIGRATIES}/${naam}`, 'utf8')),
    }));
}

export function rapport(bevindingen) {
  const regels = [
    `dossierdrift-controle: ${bevindingen.length} verdachte rij(en) in ${DOSSIER}.\n`,
    '  Elke rij hieronder draagt een 📏-meting over een object dat ná de datum',
    '  van die rij nog door een migratie herschreven is. Dat bewijst niet dat de',
    '  bevinding vervallen is — het bewijst dat de meting over een oudere versie',
    '  gaat dan wat er nu in de map staat.\n',
  ];
  for (const b of bevindingen) {
    regels.push(`  ${DOSSIER}:${b.regel}  [${b.risico.replace(/\*/g, '')}]  gemeten ${b.datum}`);
    regels.push(`    ${b.titel.slice(0, 110)}`);
    const uniek = [...new Set(b.treffers.map((t) => `${t.object} → ${t.nummer} (${t.datum})`))];
    regels.push(`    aangeraakt door: ${uniek.join(', ')}\n`);
  }
  regels.push('  Hermeet de rij en schrijf erbij tegen welke stand — of leg vast');
  regels.push('  waarom de aanraking de meting niet raakt. Sluit hem niet op grond');
  regels.push('  van deze melding alleen.');
  return regels.join('\n');
}

function main() {
  const regels = readFileSync(DOSSIER, 'utf8').split('\n');
  const migraties = migratiesVanSchijf();

  // ⚠️ **Nul migraties betekent dat de lezer stuk is, niet dat alles klopt.**
  //    Zonder deze tak is een verkeerd pad of een lege git-geschiedenis een
  //    groene controle — de vorm van een grendel die niets bewaakt.
  if (migraties.length === 0) {
    console.error(`dossierdrift-controle: geen enkele migratie gelezen uit ${MIGRATIES}/.`);
    process.exit(1);
  }

  const bevindingen = controleer(regels, migraties);
  if (bevindingen.length === 0) {
    console.log(
      `dossierdrift-controle: geen enkele zware open dossierrij meet een object dat ` +
        `sindsdien herschreven is (${migraties.length} migraties gelezen).`,
    );
    process.exit(0);
  }

  console.error(rapport(bevindingen));
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
