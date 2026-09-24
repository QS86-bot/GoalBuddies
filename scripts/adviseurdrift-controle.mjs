#!/usr/bin/env node
/**
 * Elk object dat de Supabase-adviseur zál melden, staat vooraf op de allowlist
 * — QS8-597.
 *
 * ⚠️⚠️ **Waarom dit naast `adviseur:controle` staat en hem niet vervangt.** Die
 *    haalt de échte adviseur op en is daarmee de enige controle in dit project
 *    die iets kan vinden waar niemand hier aan gedacht heeft. Hij vraagt een
 *    `SUPABASE_ACCESS_TOKEN`, staat daarom met reden in `ZONDER_CI`, en is in
 *    een cloudsessie **ongemeten**. 📏 Gevolg, gemeten in de audit van
 *    24-09-2026: `public.mijn_doelvelden` (0236) en `public.dagtellers`
 *    (0233/0234) landden op 17-09 en stonden een week later nog steeds niet op
 *    de allowlist. Er was niets dat daar rood van kón worden.
 *
 *    Deze controle dekt de twee klassen die **zonder token** uit
 *    `supabase/migrations/` af te leiden zijn. Hij vervangt het oordeel niet —
 *    hij zorgt dat een nieuw object niet kan landen zonder dat iemand de
 *    allowlist aanraakt.
 *
 * 📏 **Dat de afleiding klopt is gemeten en niet aangenomen** (24-09-2026):
 *    beide klassen uit de map geven exact wat productie zegt.
 *
 *    | klasse | uit de map | productie |
 *    |---|---|---|
 *    | definer views | `group_visible_streaks`, `mijn_doelvelden`, `mijn_profiel` | idem |
 *    | RLS zonder policy | `dagtellers`, `invite_events`, `invite_preview_limits` | idem |
 *    | invoker views (moeten juist níet gemeld) | `goal_dashboard` | idem |
 *
 * ⚠️⚠️ **Een view is definer tenzij hij expliciet `security_invoker = true`
 *    zet, en die richting is met opzet.** Postgres draait een view standaard
 *    als zijn eigenaar, dus de default ís de gemelde vorm. 📏 Vandaag zetten
 *    alle vier de views in dit schema de optie expliciet, dus een regel die
 *    zoekt naar het wóórd `false` geeft hier hetzelfde antwoord — maar die
 *    faalt **open** op de eerste view die de optie weglaat. Deze faalt dicht.
 *
 * ⚠️ **Wat hij niet ziet.** Een bucketpolicy, een `auth`-instelling, of welke
 *    andere adviesregel dan ook. Dit zijn de twee klassen die uit DDL volgen;
 *    de rest blijft van `adviseur:controle` en dus van een mens met een token.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ALLOWLIST } from './adviseur-controle.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIEMAP = join(WORTEL, 'supabase/migrations');

/**
 * Commentaar uit SQL, met de stringgrens erin.
 *
 * ⚠️⚠️ **Een eigen knip, en hij staat met reden in het register van
 *    `knip:controle`.** De gedeelde `zonderCommentaar()` is een JS-knip en kent
 *    `--` niet; op SQL haalt hij niets weg.
 *
 * 📏 **En dat dit nodig is, is gemeten en niet bedacht.** Het prototype van dit
 *    issue las de hernoeming uit het **rollback-pad in de kop** van `0234` mee:
 *    `-- alter table dagtellers rename to opslag_dagtellers;`. Het gaf daar
 *    toevallig het juiste antwoord omdat de echte hernoeming de andere kant op
 *    gaat — precies de klasse van QS8-412, waar een knip een controle stil
 *    scheef zet.
 *
 * ⚠️ De stringgrens is er omdat `--` binnen `'…'` gewoon tekst is. Dollar-quoted
 *    functielichamen worden juist **wel** doorzocht: commentaar daarbinnen is
 *    echt commentaar.
 */
export function zonderSqlCommentaar(bron) {
  const uit = [];
  let i = 0;
  let inString = false;
  while (i < bron.length) {
    const teken = bron[i];
    if (inString) {
      uit.push(teken);
      if (teken === "'") inString = false;
      i += 1;
    } else if (teken === "'") {
      inString = true;
      uit.push(teken);
      i += 1;
    } else if (bron.startsWith('--', i)) {
      const einde = bron.indexOf('\n', i);
      i = einde === -1 ? bron.length : einde;
    } else if (bron.startsWith('/*', i)) {
      const einde = bron.indexOf('*/', i + 2);
      uit.push(' ');
      i = einde === -1 ? bron.length : einde + 2;
    } else {
      uit.push(teken);
      i += 1;
    }
  }
  return uit.join('');
}

const NAAM = '(?:"[^"]+"|\\w+)';
const VIEW = new RegExp(
  `create\\s+(?:or\\s+replace\\s+)?view\\s+(?:public\\.)?(\\w+)((?:\\s+with\\s*\\([^)]*\\))?)`,
  'g',
);
const DROP_VIEW = /drop\s+view\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/g;
const RLS_AAN = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+enable\s+row\s+level\s+security/g;
const POLICY = new RegExp(`create\\s+policy\\s+${NAAM}\\s+on\\s+(?:public\\.)?(\\w+)`, 'g');
const HERNOEM = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+rename\s+to\s+(?:public\.)?(\w+)/g;

/**
 * Verwerkt één migratie; `staat` draagt het beeld tot nu toe.
 *
 * ⚠️⚠️ **Op tekstvolgorde en niet per soort, en dat is gemeten en niet bedacht.**
 *    De eerste versie paste elke regex over het hele bestand toe en verwerkte ze
 *    daarna op soort. 📏 Gevolg op `0236`, dat `drop view if exists
 *    public.mijn_doelvelden;` bóven zijn `create view` heeft staan — de gewone
 *    vorm in dit project: de drop werd ná de create toegepast en wiste hem.
 *    De controle miste daardoor precies één van de twee objecten waarvan ik wíst
 *    dat ze ontbraken.
 */
function verwerk(staat, sql) {
  const stappen = [
    ...[...sql.matchAll(HERNOEM)].map((m) => ({ i: m.index ?? 0, doe: () => hernoem(staat, m[1] ?? '', m[2] ?? '') })),
    ...[...sql.matchAll(VIEW)].map((m) => ({
      i: m.index ?? 0,
      doe: () => staat.views.set(m[1] ?? '', !/security_invoker\s*=\s*true/.test(m[2] ?? '')),
    })),
    ...[...sql.matchAll(DROP_VIEW)].map((m) => ({ i: m.index ?? 0, doe: () => staat.views.delete(m[1] ?? '') })),
    ...[...sql.matchAll(RLS_AAN)].map((m) => ({ i: m.index ?? 0, doe: () => staat.rls.add(m[1] ?? '') })),
    ...[...sql.matchAll(POLICY)].map((m) => ({ i: m.index ?? 0, doe: () => staat.policies.add(m[1] ?? '') })),
  ];
  stappen.sort((a, b) => a.i - b.i);
  for (const stap of stappen) stap.doe();
}

function hernoem(staat, oud, nieuw) {
  if (staat.views.has(oud)) staat.views.set(nieuw, staat.views.get(oud) ?? true);
  staat.views.delete(oud);
  for (const verzameling of [staat.rls, staat.policies]) {
    if (verzameling.delete(oud)) verzameling.add(nieuw);
  }
}

/**
 * De twee klassen, afgeleid uit de migratiemap in nummervolgorde.
 *
 * ⚠️ Bestanden op nummervolgorde, statements binnen een bestand op
 *    tekstvolgorde. De laatste schrijver wint — zie `verwerk()`.
 *
 * @returns {{ definerViews: string[], rlsZonderPolicy: string[], bestanden: number }}
 */
export function objectenUitDeMap(map = MIGRATIEMAP) {
  const staat = { views: new Map(), rls: new Set(), policies: new Set() };
  const namen = readdirSync(map)
    .filter((n) => n.endsWith('.sql'))
    .sort();
  for (const naam of namen) {
    verwerk(staat, zonderSqlCommentaar(readFileSync(join(map, naam), 'utf8')).toLowerCase());
  }
  return {
    definerViews: [...staat.views].filter(([, d]) => d).map(([n]) => n).sort(),
    rlsZonderPolicy: [...staat.rls].filter((t) => !staat.policies.has(t)).sort(),
    bestanden: namen.length,
  };
}

/** De sleutel zoals de adviseur hem zou noemen. */
export function sleutelVoor(regel, object) {
  return `${regel}_public_${object}`;
}

/**
 * Legt de afgeleide objecten naast de allowlist — tweezijdig.
 *
 * ⚠️ De tweede richting is even belangrijk als de eerste: een allowlist-regel
 *    die naar een object wijst dat niet meer bestaat, houdt een uitzondering in
 *    leven die niemand meer kan beoordelen. Zelfde vorm als `verouderd` in
 *    `adviseur-controle.mjs` zelf.
 */
export function beoordeelDrift(objecten, allowlist = ALLOWLIST) {
  const sleutels = new Set(allowlist.filter((r) => r.sleutel).map((r) => r.sleutel));
  const verwacht = [
    ...objecten.definerViews.map((v) => sleutelVoor('security_definer_view', v)),
    ...objecten.rlsZonderPolicy.map((t) => sleutelVoor('rls_enabled_no_policy', t)),
  ];

  const ontbreekt = verwacht.filter((s) => !sleutels.has(s));
  const gedekt = new Set(verwacht);
  const overbodig = [...sleutels].filter(
    (s) =>
      (s.startsWith('security_definer_view_public_') ||
        s.startsWith('rls_enabled_no_policy_public_')) &&
      !gedekt.has(s),
  );
  return { ontbreekt, overbodig };
}

/* c8 ignore start */
function main() {
  const objecten = objectenUitDeMap();

  // ⚠️ Eerst bewijzen dát hij iets ziet. Nul is hier ook wat je krijgt als de
  //    knip of de regexen stuk zijn, en dan is groen een uitspraak over niets.
  //    Twee keer deze week was een controle groen omdat hij niets vond.
  if (objecten.definerViews.length === 0 || objecten.rlsZonderPolicy.length === 0) {
    console.error(
      'adviseurdrift-controle: nul objecten in een van beide klassen, en dat kan niet kloppen.\n' +
        `  ${objecten.bestanden} migraties gelezen. Controleer de knip en de regexen.`,
    );
    process.exit(1);
  }

  const { ontbreekt, overbodig } = beoordeelDrift(objecten);
  if (ontbreekt.length === 0 && overbodig.length === 0) {
    console.log(
      `adviseurdrift-controle: ${objecten.definerViews.length} definer-view(s) en ` +
        `${objecten.rlsZonderPolicy.length} tabel(len) met RLS zonder policy — ` +
        'alle op de allowlist van adviseur-controle.',
    );
    process.exit(0);
  }

  console.error('\nadviseurdrift-controle: de migratiemap en de adviseur-allowlist lopen uiteen.\n');
  for (const s of ontbreekt) console.error(`  ontbreekt op de allowlist:  ${s}`);
  for (const s of overbodig) console.error(`  wijst nergens meer naar:    ${s}`);
  console.error(
    '\n  De Supabase-adviseur zal elk object hierboven melden, en `adviseur:controle`\n' +
      '  wordt daar rood van — maar die vraagt een token en draait niet in CI. Zet elk\n' +
      '  nieuw object met een **gemeten** reden op de ALLOWLIST in\n' +
      '  scripts/adviseur-controle.mjs, of haal het object weg. Zie QS8-597.\n',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
/* c8 ignore stop */
