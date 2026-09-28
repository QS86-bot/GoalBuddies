#!/usr/bin/env node
/**
 * Lopen `supabase/migrations/` en het echte project nog gelijk? — QS8-122.
 *
 * ⚠️ **Dit is de andere helft van** `migraties:controle`. Die kijkt naar de map
 *    alleen: nummering aaneengesloten, geen duplicaten, rollback-pad in de kop.
 *    Wat hij per definitie niet kan zien, is of het project diezelfde migraties
 *    ook echt heeft. Dat gat stond met zoveel woorden in `/audit` en is precies
 *    waar QS8-122 over gaat.
 *
 * ⚠️ **Waarom dit ertoe doet.** Een lokale stack en een tweede cloudproject
 *    werken allebei door de migraties opnieuw af te spelen op een lege database.
 *    Ontbreekt er één bestand, dan bouwt dat een ánder schema dan productie — en
 *    dan toetst een RLS-suite daar een verzinsel. Groen zonder iets te bewijzen
 *    is erger dan tegen productie draaien.
 *
 * ⚠️ **Zonder credentials slaat hij zichzelf over in plaats van rood te worden.**
 *    Zelfde afspraak als de RLS-suite: de service-role-key hoort niet in CI. Een
 *    controle die in CI omvalt op een ontbrekende sleutel, leert je om rood te
 *    negeren — en dat is duurder dan de controle waard is.
 *
 * ⚠️ **Maar sinds 27-08-2026 is dat overslaan zichtbaar en heeft het een
 *    tegenhanger.** Het stond hier als een gewone regel op stdout, tussen de
 *    geslaagde controles in — en `overgeslagen` las daar als `gelukt`. Dat is de
 *    faalvorm die de Windows-job in CI ook al opleverde: een controle die niets
 *    deed en toch niets meldde. De skip gaat nu naar stderr met `⚠` ervoor, en
 *    met `--streng` (of `REGISTER_CONTROLE_STRENG=1`) is een ontbrekende sleutel
 *    een fout in plaats van een reden om te zwijgen.
 *
 * ⚠️ **`npm run db:push` draait hem streng**, en dat is waar de rij in
 *    `docs/ENGINEER-REVIEW.md` om vroeg: het gevaar was een migratie die op
 *    productie landt zonder dat er ooit iets naast legt. Op dát moment zijn de
 *    credentials er per definitie, dus daar is overslaan geen afspraak maar een
 *    gemiste controle.
 *
 * ⚠️⚠️ **En sinds 17-09-2026 (QS8-517) schrijft hij op wat hij gemeten heeft.**
 *    `supabase/uitgerold.json` is de neerslag van deze meting, en hij bestaat
 *    omdat dít script niet kan draaien op de plek waar gebouwd wordt: de
 *    uitrolstand stond daardoor alleen als met de hand overgetypt proza in
 *    `docs/WERKVOORRAAD.md`, en niets las dat na. 📏 Zo groeide de drift tot 52
 *    bestanden zonder dat er iets rood werd (QS8-505).
 *
 *    Het schrijven is een **bijproduct** en geen ceremonie: hier zijn de
 *    credentials per definitie, dus hier is de meting gratis. `uitrolstand:controle`
 *    leest het bestand daarna zónder sleutel, overal, ook in CI — die bewijst
 *    niet wat productie draait (dat kan alleen dit script), maar wel dat het
 *    opgeschreven getal intern klopt met de map, en hij zegt hoe oud het is.
 *
 * Leest het register via de RPC `migratieregister()` (migratie 0072). Die staat
 * alleen voor `service_role` open; `supabase_migrations` zelf zit niet in de API.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { beoordeelOmgeving } from './migratieregister-omgeving.mjs';
import { migratiesInMap, standUitRegister, vergelijk } from './migratieregister-vergelijk.mjs';
import { STANDBESTAND } from './uitrolstand-controle.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

// ⚠️ Het werk staat in een blok achter de main-guard, en niet in een
//    `hoofd()`: zo doet importeren niets (QS8-608) zonder dat er een lange
//    functie bijkomt die coderegel 15 zou breken. Top-level `await` mag
//    binnen dit blok — gemeten, niet aangenomen.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const streng =
    process.argv.includes('--streng') || process.env.REGISTER_CONTROLE_STRENG === '1';

  const ONTBREEKT =
    'geen EXPO_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in de omgeving.\n' +
    '  Dit is de enige controle die het échte project nodig heeft; zie docs/DEPLOY.md.';

  const oordeel = beoordeelOmgeving({ url, sleutel: serviceRoleKey, streng });

  if (oordeel === 'ontbreekt') {
    // ⚠️ Streng draaien betekent: hier hóórden credentials te zijn. Dat is het
    //    geval direct na `supabase db push`, en dan is zwijgen geen afspraak maar
    //    een gemiste controle.
    console.error(`✗ migratieregister-controle kon niet draaien — ${ONTBREEKT}`);
    process.exit(1);
  }

  if (oordeel === 'overslaan') {
    // ⚠️ Naar stderr en met een teken ervoor. Op stdout stond hij tussen de
    //    geslaagde controles en las `overgeslagen` als `gelukt`.
    console.error(`⚠ migratieregister-controle: OVERGESLAGEN — ${ONTBREEKT}`);
    process.exit(0);
  }

  /**
   * De meting opschrijven zodat een sessie zónder sleutel hem kan nalezen.
   *
   * ⚠️ **Ook als de vergelijking daarna rood wordt.** Wat er op productie staat
   *    is waar, ongeacht of het bevalt — en juist bij een verschil is dit getal
   *    het eerste dat iemand wil zien. Eerst schrijven, dan oordelen.
   *
   * ⚠️ De vórm komt uit `standUitRegister()` in `migratieregister-vergelijk.mjs`,
   *    en dat is met opzet: deze functie draait alleen mét de productiesleutel en
   *    is hier dus nooit te ijken. De naad tussen schrijver en lezer staat onder
   *    test in `tests/scripts/migratieregister.test.ts`.
   *
   * @param {readonly {versie: string, naam: string}[]} project
   */
  function schrijfStand(project) {
    const stand = standUitRegister(
      project,
      new URL(url).hostname.split('.')[0],
      new Date().toISOString().slice(0, 10),
    );
    writeFileSync(join(WORTEL, STANDBESTAND), `${JSON.stringify(stand, null, 2)}\n`);
    console.log(`migratieregister-controle: ${STANDBESTAND} bijgewerkt (${stand.hoogste}).`);
  }

  async function uitHetProject() {
    const antwoord = await fetch(`${url}/rest/v1/rpc/migratieregister`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      // ⚠️ Elke externe call heeft een timeout — CLAUDE.md, coderegel 14.
      signal: AbortSignal.timeout(15_000),
    });

    if (!antwoord.ok) {
      throw new Error(
        `Het register lezen lukte niet (${antwoord.status}). Bestaat migratie 0072 ` +
          'al op dit project, en draai je met de service-role-key?',
      );
    }

    return antwoord.json();
  }

  const repo = migratiesInMap(WORTEL);
  const project = await uitHetProject();

  schrijfStand(project);

  const klachten = vergelijk(repo, project);

  if (klachten.length === 0) {
    console.log(
      `migratieregister-controle: ${repo.length} migraties, repo en project zeggen hetzelfde.`,
    );
    process.exit(0);
  }

  console.error(`migratieregister-controle: ${klachten.length} verschil(len).\n`);
  for (const k of klachten) console.error(`  • ${k}`);
  console.error('\nZie QS8-122 en docs/DEPLOY.md.');
  process.exit(1);
}
