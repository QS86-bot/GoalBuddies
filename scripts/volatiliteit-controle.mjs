#!/usr/bin/env node
/**
 * volatiliteit-controle — een grant is geen slot zodra de aanroep uit het plan
 * verdwijnt.
 *
 * ⚠️⚠️ **De catalogus zegt nee en de API zegt ja.** 📏 Gemeten op 11-09-2026
 *    (QS8-433) tegen de lokale PostgREST op `berichten_plafond()` — een functie
 *    waar `anon` het uitvoerrecht níet heeft — met de **bevoorrechte rol als
 *    eerste aanroeper op een verse pool**:
 *
 *    | stand van de functie | service_role 20x | daarna anon 25x |
 *    |----------------------|------------------|-----------------|
 *    | `immutable`          | 200 x 20         | **200 x 25**    |
 *    | `stable` (na 0254)   | 200 x 20         | **401 x 25**    |
 *
 * ⚠️⚠️ **De volgorde is zelf een meetinstrument.** Begin je met mislukte
 *    anon-aanroepen, dan cachet dát plan mét de functieaanroep erin en is alles
 *    erna per ongeluk dicht. Zo mat het issue *2 van de 25* waar het er 25 van
 *    de 25 zijn. Wie deze klasse nameet en met `anon` begint, meet zijn eigen
 *    beschermlaag.
 *
 * ## Twee routes, en pas als béide dicht zijn sluit de grant
 *
 *   **A. Constant folding.** Een `immutable` functie waarvan alle argumenten
 *   constant zijn — nul argumenten, óf allemaal een default — wordt bij het
 *   plannen uitgerekend. 📏 `SET search_path` helpt hier **niet**: `immutable` +
 *   zoekpad + nul argumenten lekt gewoon `200 x 25`.
 *
 *   **B. SQL-inlining.** Een functie in `language sql` zonder `proconfig` en
 *   zonder `security definer` wordt door `inline_function()` in het plan
 *   opgenomen — óók als `stable`, en óók mét argumenten. 📏 `stable` + `sql` +
 *   géén zoekpad lekt `200 x 25`; dezelfde functie mét zoekpad geeft `401 x 25`.
 *   📏 `plpgsql` is immuun: die wordt niet ingelined.
 *
 * ⚠️⚠️ **Route B is in dit project al dicht, en niet door deze controle.** Elke
 *    functie in `public` draagt een `SET search_path`, afgedwongen door de tak
 *    `'geen set search_path'` in `definer_bewaking()` (0106/0167). 📏 Nul
 *    functies zonder `proconfig`. Dat is een grendel die er voor iets ánders
 *    staat en deze klasse toevallig meedekt — de naad uit onwrikbare regel 18
 *    vraag 1. **Wie ooit een uitzondering aan die zoekpadregel toevoegt,
 *    heropent route B**, en daarom meet deze controle hem zélf mee in plaats van
 *    erop te vertrouwen.
 *
 * ⚠️ **De argumentgrens is "aanroepbaar zónder argumenten" en niet "nul
 *    argumenten".** 📏 Een `immutable` functie met één default-argument,
 *    aangeroepen als `{}`, lekt net zo goed — parse analysis zet de default als
 *    `Const` neer. Vandaar `pronargs = pronargdefaults`.
 *
 * ⚠️ **Het register is bewust leeg.** `stable` is een zwakkere belofte dan
 *    `immutable`, dus waar `immutable` mocht mag `stable` ook. De enige echte
 *    eis voor `immutable` komt van indexexpressies en gegenereerde kolommen, en
 *    📏 geen enkele functie hier staat daarin. Komt er ooit een rij bij, dan
 *    draagt die een meting.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { psqlArgumenten, verbindingsmelding } from './psql.mjs';

/**
 * Functies die `immutable` met nul argumenten mogen blijven, met de reden.
 *
 * De sleutel is de kale functienaam; de waarde is waaróm het hier mag.
 *
 * @type {Record<string, string>}
 */
export const MAG_IMMUTABLE_BLIJVEN = {};

/**
 * De klasse: functies waarvan de aanroep uit het plan kan verdwijnen.
 *
 * ⚠️ Geëxporteerd omdat dit de enige grendel is die de klasse definieert. Een
 *    ijking die alleen `ontleed()` en `beoordeel()` muteert, raakt hem niet —
 *    zie `tests/rls/volatiliteit-predicaat.test.ts`, dat élke vorm in een
 *    terugrollende transactie aanmaakt en het predicaat erop loslaat.
 */
export const KLASSE = `
    n.nspname = 'public'
    and (
      -- route A: gevouwen bij het plannen
      (p.provolatile = 'i' and p.pronargs = p.pronargdefaults)
      -- route B: ingelined in het plan
      or (l.lanname = 'sql' and p.proconfig is null and not p.prosecdef)
    )`;

const VRAAG = `
select coalesce(string_agg(p.proname || '|' ||
         has_function_privilege('anon', p.oid, 'execute')::text || '|' ||
         has_function_privilege('authenticated', p.oid, 'execute')::text || '|' ||
         case when p.provolatile = 'i' and p.pronargs = p.pronargdefaults
              then 'vouwbaar' else 'inlinebaar' end,
         E'\\n' order by p.proname), '')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where ${KLASSE};
`;
/**
 * Leest de uitvoer van de vraag hierboven.
 *
 * ⚠️ Geeft ook terug wíe het recht heeft, want dat is wat de melding bruikbaar
 *    maakt: een functie die `anon` mag uitvoeren is een heel ander gesprek dan
 *    een die alleen `service_role` mag.
 */
export function ontleed(uitvoer) {
  return uitvoer
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '')
    .map((rij) => {
      const [naam, anon, auth, route] = rij.split('|');
      return {
        naam,
        anon: anon === 't' || anon === 'true',
        auth: auth === 't' || auth === 'true',
        route,
      };
    });
}

/**
 * Wat er mis is en wat er verlopen is.
 *
 * ⚠️ **Twee kanten, zoals elke ratel in dit project.** Een functie die hier
 *    opduikt en niet in het register staat, is een gat. Een registerrij die naar
 *    een functie wijst die de klasse verlaten heeft, is een reden voor iets dat
 *    er niet meer is — en die hoort weg, anders dekt hij ooit stilletjes een
 *    nieuwe functie met dezelfde naam.
 */
export function beoordeel(gevonden, register = MAG_IMMUTABLE_BLIJVEN) {
  const namen = gevonden.map((f) => f.naam);

  return {
    nieuw: gevonden.filter((f) => !(f.naam in register)),
    verdwenen: Object.keys(register)
      .filter((naam) => !namen.includes(naam))
      .sort(),
  };
}

function psql(vraag) {
  return execFileSync('psql', psqlArgumenten(vraag), { encoding: 'utf8' });
}

function meld(nieuw) {
  console.error(
    `✗ ${nieuw.length} functie(s) in \`public\` kunnen uit het plan verdwijnen:\n`,
  );
  for (const f of nieuw) {
    const rollen = [f.anon && 'anon', f.auth && 'authenticated'].filter(Boolean).join(', ');
    const route = f.route === 'vouwbaar' ? 'route A, gevouwen' : 'route B, ingelined';
    console.error(
      `    ${f.naam}()  [${route}]${rollen ? `  — uitvoerbaar door: ${rollen}` : ''}`,
    );
  }
  console.error(
    '\nPostgREST hergebruikt het plan per poolverbinding. Staat de aanroep daar\n' +
      'niet meer in, dan komt de EXECUTE-toets er nooit meer aan te pas: één\n' +
      'aanroep door een bevoorrechte rol, en de grant is weg voor iedereen op die\n' +
      'verbinding.\n\n' +
      '  route A (gevouwen)   — zet hem op `stable`:\n' +
      '                         alter function public.<naam>() stable;\n' +
      '  route B (ingelined)  — geef hem een zoekpad:\n' +
      '                         alter function public.<naam>() set search_path = public, pg_temp;\n\n' +
      'Allebei zijn zwakkere beloftes dan wat er stond, dus altijd veilig. Kan het\n' +
      'echt niet, dan hoort hij met de meting erbij in MAG_IMMUTABLE_BLIJVEN.\n\n' +
      'Meting en mechanisme: QS8-433, migratie 0254.',
  );
}

function hoofd() {
  let gevonden;
  try {
    gevonden = ontleed(psql(VRAAG));
  } catch (fout) {
    console.error(
      verbindingsmelding({
        naam: 'volatiliteit-controle',
        leest: 'Deze controle leest `pg_proc` en niet de migratiebestanden.',
        melding: fout instanceof Error ? fout.message : String(fout),
      }),
    );
    return 1;
  }

  const { nieuw, verdwenen } = beoordeel(gevonden);

  if (nieuw.length > 0) {
    meld(nieuw);
    return 1;
  }

  if (verdwenen.length > 0) {
    console.error(`✗ ${verdwenen.length} registerrij(en) wijzen naar een functie die de klasse\n` +
      'verlaten heeft:\n');
    for (const naam of verdwenen) console.error(`    ${naam}()`);
    console.error(
      '\nEen reden voor iets dat er niet meer is, dekt ooit stilletjes een nieuwe\n' +
        'functie met dezelfde naam. Haal de rij weg.',
    );
    return 1;
  }

  const rijen = Object.keys(MAG_IMMUTABLE_BLIJVEN).length;
  console.log(
    'volatiliteit-controle: geen enkele functie in `public` kan uit het plan ' +
      `verdwijnen${rijen > 0 ? `, op ${rijen} met een reden na` : ''}.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
