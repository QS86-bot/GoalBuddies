#!/usr/bin/env node
/**
 * Welke migratienummers de remote branches dragen — QS8-238.
 *
 * ⚠️ **Waarom dit een eigen module is.** `migratie-nieuw.mjs` deed deze scan al,
 *    maar hield per branch alleen het **hoogste** nummer bij. Dat is genoeg om
 *    een nieuw nummer te kiezen en te weinig om een gat te zien: een branch die
 *    `0126` t/m `0130` draagt terwijl deze map op `0125` staat, geeft als hoogste
 *    `0130` — en dan weet je nog steeds niet dat 0126 t/m 0129 óók ontbreken.
 *
 * ⚠️ **Waarom dat ertoe doet.** `migraties:controle` telt de nummers tussen het
 *    laagste en het hoogste bestand. Ontbreekt er iets **boven** het hoogste, dan
 *    is de reeks netjes aaneengesloten tot waar hij ophoudt en meldt hij niets.
 *    Op 31-08-2026 meldde hij letterlijk "De nummering is aaneengesloten" terwijl
 *    er vijf migraties ontbraken die wél op productie draaiden — waaronder de
 *    migratie die het `auth.uid()`-lek in de uitnodigingslink dichtzette. De
 *    RLS-suite bouwde daar dus een ánder schema op dan productie draait, en
 *    niets zei dat.
 *
 * ⚠️ **Juist de bovenkant is het gevaarlijkst.** Een gat in het midden komt van
 *    een oude fout die iemand ooit maakte. Een gat aan de bovenkant komt van de
 *    níeuwste migraties — die net op productie zijn gedraaid en waarvan de
 *    bestanden nog op een branch staan. In dit project is dat de normale gang van
 *    zaken (`docs/DEPLOY.md`: toepassen, dán landen), en dus precies de plek waar
 *    dit het vaakst misgaat.
 *
 * ⚠️ **Wat dit niet kan.** Het echte antwoord staat in
 *    `supabase_migrations.schema_migrations` op productie, en dat vraagt een
 *    service-role-key die niet in een controle hoort die op elke machine draait
 *    (beveiligingsregel 4). Dit is de goedkope helft: alles wat een branch draagt
 *    en deze map mist, is een gat — of het nu al toegepast is of nog niet.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAP = 'supabase/migrations';

/**
 * De nummers uit een lijst bestandsnamen, als gesorteerde array.
 *
 * ⚠️ Een letter achter het nummer (`0052a`) is een deelmigratie en telt mee
 *    onder dat nummer — zelfde afspraak als in `migraties-controle.mjs`. Een
 *    naam die niet aan de vorm voldoet, telt niet mee: die wordt elders al als
 *    onleesbaar gemeld, en hier twee keer klagen levert twee meldingen op voor
 *    één fout.
 */
export function nummersUit(bestandsnamen) {
  const nummers = new Set();
  for (const naam of bestandsnamen) {
    const kaal = naam.split('/').pop() ?? '';
    const m = /^(\d{4})[a-z]?_[a-z0-9_]+\.sql$/.exec(kaal);
    if (m !== null) nummers.add(Number(m[1]));
  }
  return [...nummers].sort((a, b) => a - b);
}

/**
 * Welke nummers een branch draagt die deze map níet heeft.
 *
 * `lokaal` is een array nummers, `perBranch` een object van branchnaam naar
 * array nummers. Geeft één regel per branch die iets draagt wat hier ontbreekt,
 * met de ontbrekende nummers erbij.
 *
 * ⚠️ **Beide kanten op leeg is geen bevinding.** Een branch zonder migratiemap
 *    telt als nul en niet als "alles ontbreekt" — anders is elke docs-branch
 *    rood. En een lege werkkopie meldt niets: dan is er geen map om iets over te
 *    zeggen, en dat is een ander probleem dat elders al gevonden wordt.
 */
export function ontbrekendPerBranch({ lokaal, perBranch }) {
  const hier = new Set(lokaal);
  if (hier.size === 0) return [];

  const uit = [];
  for (const [branch, nummers] of Object.entries(perBranch)) {
    const mist = nummers.filter((n) => !hier.has(n)).sort((a, b) => a - b);
    if (mist.length > 0) uit.push({ branch, ontbreekt: mist });
  }
  return uit.sort((a, b) => a.branch.localeCompare(b.branch));
}

/** Vier cijfers, zoals de bestandsnamen ze schrijven. */
export function alsNummer(n) {
  return String(n).padStart(4, '0');
}

function git(...argumenten) {
  return execFileSync('git', argumenten, { cwd: WORTEL, encoding: 'utf8' });
}

/**
 * Elke remote branch met de migratienummers die hij draagt.
 *
 * ⚠️ Werkt op `refs/remotes/origin` en niet op de werkkopie: de vraag is juist
 *    wat er élders staat. Zonder `git fetch` is dit beeld zo oud als je laatste
 *    fetch — daarom noemt de melding dat met zoveel woorden in plaats van te
 *    doen alsof hij de waarheid kent.
 */
export function nummersPerBranch() {
  let branches = [];
  try {
    branches = git('for-each-ref', '--format=%(refname)', 'refs/remotes/origin')
      .split('\n')
      .filter((r) => r.trim() !== '' && !r.endsWith('/HEAD'));
  } catch {
    // Geen git, geen remote, geen oordeel.
    return null;
  }

  const perBranch = {};
  for (const ref of branches) {
    let namen = [];
    try {
      namen = git('ls-tree', '-r', '--name-only', ref, `${MAP}/`).split('\n');
    } catch {
      // Een branch zonder migratiemap telt gewoon als nul.
    }
    perBranch[ref.replace('refs/remotes/', '')] = nummersUit(namen);
  }
  return perBranch;
}
