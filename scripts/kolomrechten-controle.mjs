#!/usr/bin/env node
/**
 * kolomrechten-controle — vraagt de app kolommen terug die hij niet mag lezen?
 *
 * ⚠️ **Deze controle bestaat door een productiestoring die niemand zag, en die
 *    door twee verschillende reviewers op dezelfde dag gevonden werd.**
 *    Migratie 0089 trok de tabelbrede SELECT op `profiles` in — een groepsgenoot
 *    kon je dagritme uitlezen, en RLS kan geen kolommen beperken, dus het moest
 *    een kolomgrant worden. Correct, en getest: `policies.test.ts` toetst de
 *    lééskant uitgebreid.
 *
 *    Wat niemand toetste is dat `updateProfiel()` zijn rij terugvroeg met
 *    `.select('*')`. Een `returning *` vraagt leesrecht op élke kolom, dus vanaf
 *    0089 viel élke profielopslag om met 42501: tijdzone, week-startdag,
 *    herinneringen, taal — én `rondOnboardingAf()`, zodat niemand de onboarding
 *    kon afronden. Er was niets kapot aan de policy, niets kapot aan de grant en
 *    niets kapot aan de app. Alleen de combinatie deugde niet, en de combinatie
 *    was van niemand (onwrikbare regel 18).
 *
 * ⚠️ **De aanname die het in stand hield staat opgeschreven in een test.** Bij de
 *    0089-tests stond dat PostgREST bij `select=*` stilletjes de kolommen weglaat
 *    waar je geen recht op hebt. Dat doet hij niet: hij geeft 42501. Een
 *    aanname over gedrag van een ander systeem is geen bewijs — vandaar dat deze
 *    controle de échte grants leest en niet een verwachting.
 *
 * De regel: **elke kolom die `src/` of `app/` terugvraagt van een tabel of view,
 * moet in de SELECT-grant van `authenticated` zitten.** `select('*')` op een
 * tabel met een versmalde grant is per definitie fout.
 *
 * ⚠️ Draait tegen een opgebouwde database, want grants staan niet in de code.
 *    Zie `klokgrens-controle.mjs` voor hetzelfde patroon en dezelfde reden.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Kolommen die wél in een `select()` staan maar geen kolom van de tabel zijn.
 *
 * PostgREST kent ingebedde bronnen (`goals(title)`) en aliassen (`naam:title`).
 * Die beoordeelt deze controle niet — ze lopen over een relatie, en dan gelden
 * de rechten van de ándere tabel. Wordt dat ooit een gat, dan is dat een eigen
 * bevinding en geen uitbreiding van deze regex.
 */
function isIngebed(kolom) {
  return kolom.includes('(') || kolom.includes(')');
}

/** `naam:title` → `title`; `title` → `title`. */
export function kolomNaam(stuk) {
  const schoon = stuk.trim();
  const dubbelePunt = schoon.indexOf(':');
  return dubbelePunt === -1 ? schoon : schoon.slice(dubbelePunt + 1).trim();
}

/**
 * Alle `.from('X') … .select('…')`-paren in één bestand.
 *
 * @param inhoud de bestandsinhoud — als parameter zodat deze controle te voeden
 *   is zonder de codebase te wijzigen.
 */
export function selectiesIn(pad, inhoud) {
  const uit = [];
  const stukken = inhoud.split(".from('");

  for (let i = 1; i < stukken.length; i++) {
    const stuk = stukken[i];
    const eindeNaam = stuk.indexOf("'");
    if (eindeNaam === -1) continue;
    const tabel = stuk.slice(0, eindeNaam);

    // Alleen tot aan de volgende `.from(` kijken: daarna is het een andere keten.
    const venster = stuk.slice(eindeNaam);
    const select = /\.select\(\s*'([^']*)'/.exec(venster);
    if (select === null) continue;

    // ⚠️ `'*, goals!inner(owner_id)'` is een geldige selectie: een ster plús een
    //    ingebedde bron. De ster telt dan gewoon als "alle kolommen van déze
    //    tabel" — hem als kolomnaam behandelen leverde twee valse meldingen op,
    //    en een controle die valse meldingen geeft leer je te negeren.
    const delen = select[1].split(',').map(kolomNaam).filter((k) => k.length > 0);
    const alles = delen.includes('*');
    const kolommen = alles ? [] : delen.filter((k) => !isIngebed(k));

    uit.push({ pad, tabel, kolommen, alles });
  }

  return uit;
}

/**
 * Legt de gevraagde kolommen naast de rechten.
 *
 * @param rechten `{ [tabel]: { kolommen: string[], volledig: boolean } }`
 */
export function beoordeel(selecties, rechten) {
  const fouten = [];

  for (const s of selecties) {
    const recht = rechten[s.tabel];
    if (recht === undefined) {
      fouten.push({ ...s, reden: `\`authenticated\` heeft geen enkel leesrecht op \`${s.tabel}\`` });
      continue;
    }

    if (s.alles) {
      if (!recht.volledig) {
        fouten.push({
          ...s,
          reden:
            `\`select('*')\` op \`${s.tabel}\`, maar \`authenticated\` mag maar ` +
            `${recht.kolommen.length} van de ${recht.totaal} kolommen lezen`,
        });
      }
      continue;
    }

    const missend = s.kolommen.filter((k) => !recht.kolommen.includes(k));
    if (missend.length > 0) {
      fouten.push({ ...s, reden: `geen leesrecht op ${missend.map((k) => `\`${k}\``).join(', ')}` });
    }
  }

  return fouten;
}

const VRAAG = `
select c.table_name,
       count(*) filter (where p.grantee = 'authenticated'),
       count(*),
       coalesce(string_agg(c.column_name, ',') filter (where p.grantee = 'authenticated'), '')
from information_schema.columns c
left join information_schema.column_privileges p
  on p.table_schema = c.table_schema
 and p.table_name   = c.table_name
 and p.column_name  = c.column_name
 and p.grantee      = 'authenticated'
 and p.privilege_type = 'SELECT'
where c.table_schema = 'public'
group by c.table_name
order by c.table_name;
`;

/** Zet de uitvoer van `psql -At -F'|'` om in een rechtentabel. */
export function ontleedRechten(uitvoer) {
  const rechten = {};
  for (const regel of uitvoer.split('\n')) {
    if (regel.trim().length === 0) continue;
    const [tabel, mag, totaal, kolommen] = regel.split('|');
    if (Number(mag) === 0) continue;
    rechten[tabel] = {
      kolommen: kolommen.split(',').filter((k) => k.length > 0),
      totaal: Number(totaal),
      volledig: Number(mag) === Number(totaal),
    };
  }
  return rechten;
}

function bestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    if (naam === 'node_modules' || naam === '.git') continue;
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) bestanden(pad, uit);
    else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) uit.push(pad);
  }
  return uit;
}

function hoofd() {
  let rechten;
  try {
    const db = process.env.DB ?? 'goalbuddies_rls';
    const args = ['--quiet', '--no-psqlrc', '-At', '-d', db, '-c', VRAAG];
    if (process.env.PGHOST) args.unshift('-h', process.env.PGHOST);
    rechten = ontleedRechten(execFileSync('psql', args, { encoding: 'utf8' }));
  } catch (fout) {
    console.error(
      '✗ Geen database om de grants uit te lezen.\n\n' +
        'Deze controle leest `information_schema.column_privileges` en niet de\n' +
        'migratiebestanden. Start de lokale stack met `npm run rls:stack`.\n\n' +
        `psql zei: ${fout instanceof Error ? fout.message.split('\n')[0] : String(fout)}`,
    );
    return 1;
  }

  const selecties = ['src', 'app']
    .flatMap((m) => bestanden(join(WORTEL, m)))
    .flatMap((pad) => selectiesIn(relative(WORTEL, pad), readFileSync(pad, 'utf8')));

  const fouten = beoordeel(selecties, rechten);

  if (fouten.length > 0) {
    console.error(`✗ ${fouten.length} plek(ken) vragen kolommen terug die niet gelezen mogen worden:\n`);
    for (const f of fouten) console.error(`    ${f.pad}  —  ${f.reden}`);
    console.error(
      '\nPostgREST geeft hier 42501 en niet stilzwijgend minder kolommen. Vraag alleen\n' +
        'terug wat je mag lezen, en lees de rest desnoods via een view die met de rechten\n' +
        'van zijn eigenaar draait (zoals `mijn_profiel`).',
    );
    return 1;
  }

  console.log(
    `kolomrechten-controle: ${selecties.length} selecties, allemaal binnen de leesrechten.`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(hoofd());
