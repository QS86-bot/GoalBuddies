#!/usr/bin/env node
/**
 * pinuitzonderingen-controle — wie mag er langs `guard_group_update()`?
 *
 * ⚠️ **De bevinding van 16-08 vroeg of een beveiligingsbeslissing op een rolnaam
 *    mag leunen, en op 25-08-2026 is dat gemeten in plaats van beredeneerd.**
 *    `guard_group_update()` pint de uitnodigingscode, de oprichter, de status,
 *    de slaapstand en de zichtbaarheid van een groep vast, en stapt opzij zodra
 *    `current_user not in ('authenticated', 'anon')`. Dat werkt omdat PostgREST
 *    van rol wisselt — maar het betekent óók dat élke `SECURITY DEFINER`-functie
 *    die een client mag aanroepen langs die pin komt, want die draait als zijn
 *    eigenaar.
 *
 *    De vraag was of dat een gat is. Het antwoord: nee, maar alleen zolang
 *    iemand de lijst kent. Er zijn er vijf, alle vijf met opzet — een groep
 *    archiveren, toetreden, de code roteren, de code intrekken en de
 *    zichtbaarheid omzetten móéten die kolommen kunnen wijzigen. De zesde die
 *    er ooit bijkomt erft de uitzondering zonder dat iemand het merkt, en dát is
 *    wat dit script tegenhoudt.
 *
 * ⚠️ **Waarom geen herbouw naar een expliciete vlag.** Het alternatief is de
 *    kolommen onvoorwaardelijk pinnen en de vijf functies een sessievlag laten
 *    zetten. Dat draait de standaard om — uitzondering per statement in plaats
 *    van per rol — en dat is netter. Maar het raakt vijf beveiligingsfuncties
 *    die vandaag correct zijn, en een functie die de vlag vergeet faalt stíl:
 *    zijn wijziging wordt teruggedraaid zonder fout. Dat is een slechtere ruil
 *    dan een register. Komt er ooit een zesde uitzondering bij, dan is dát het
 *    moment om die afweging opnieuw te maken.
 *
 * ⚠️ Twee latere pin-triggers — `guard_group_member_update()` en
 *    `archief_blijft_archief()` — gelden voor élke rol en kennen deze
 *    uitzondering niet. Het patroon heeft zich dus niet verspreid, en dat is de
 *    reden dat dit script maar over één trigger gaat.
 */

import { execFileSync } from 'node:child_process';

/**
 * De functies die met opzet langs `guard_group_update()` mogen, met de reden.
 *
 * ⚠️ Alleen `SECURITY DEFINER`-functies die een client mag aanroepen staan hier.
 *    Een functie die alleen `service_role` mag aanroepen (de rollover, de
 *    slaapstand) is geen clientoppervlak en hoort er niet in.
 */
export const REGISTER = new Map([
  [
    'archiveer_groep',
    'Zet `status` op `archived`. Dat ís de pinned kolom, en de functie eist een ' +
      'actieve beheerder plus een expliciete bevestiging (0092).',
  ],
  [
    'join_group_with_code',
    'Werkt `last_activity_at` bij en wekt een slapende groep. Beide staan op de ' +
      'pin-lijst; de functie toetst de code, de limiet en de groepsgrootte zelf.',
  ],
  [
    'rotate_invite_code',
    'Vervangt `invite_code` — de enige bedoelde route daarnaartoe. Zonder deze ' +
      'uitzondering zou een gecompromitteerde code niet te vervangen zijn.',
  ],
  [
    'set_invite_revoked',
    'Zet `invite_revoked`. Zelfde reden: intrekken moet kunnen, en alleen hier.',
  ],
  [
    'zet_groepszichtbaarheid',
    'Zet `zichtbaarheid` (besluit A41). De zwaarste van de vijf — actieve ' +
      'beheerder, expliciete bevestiging, een rij in `group_events`, een ' +
      'systeembericht en een rem van 24 uur (0076).',
  ],
]);

const VRAAG = `
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  and pg_get_functiondef(p.oid) ~* 'update\\s+(public\\.)?groups\\M'
order by 1;
`;

/** De trigger die de uitzondering maakt. Verdwijnt hij, dan klopt dit script niet meer. */
const VRAAG_TRIGGER = `
select case when pg_get_functiondef(p.oid) ~ 'current_user' then 'ja' else 'nee' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'guard_group_update';
`;

export function ontleed(uitvoer) {
  return uitvoer.split('\n').map((r) => r.trim()).filter((r) => r.length > 0);
}

/**
 * Legt de gevonden schrijvers naast het register — tweezijdig.
 *
 * @param schrijvers functienamen, zoals `ontleed()` ze levert.
 */
export function beoordeel(schrijvers, register = REGISTER) {
  const gezien = new Set(schrijvers);
  return {
    onbekend: schrijvers.filter((f) => !register.has(f)),
    verdwenen: [...register.keys()].filter((f) => !gezien.has(f)),
  };
}

function psql(vraag) {
  const db = process.env.DB ?? 'goalbuddies_rls';
  const args = ['--quiet', '--no-psqlrc', '-At', '-d', db, '-c', vraag];
  if (process.env.PGHOST) args.unshift('-h', process.env.PGHOST);
  return execFileSync('psql', args, { encoding: 'utf8' });
}

function hoofd() {
  let schrijvers;
  let leuntOpRol;
  try {
    schrijvers = ontleed(psql(VRAAG));
    leuntOpRol = ontleed(psql(VRAAG_TRIGGER))[0];
  } catch (fout) {
    console.error(
      '✗ Geen database om tegen te meten.\n\n' +
        'Deze controle leest `pg_proc` en niet de migratiebestanden.\n' +
        'Start de lokale stack met `npm run rls:stack`.\n\n' +
        `psql zei: ${fout instanceof Error ? fout.message.split('\n')[0] : String(fout)}`,
    );
    return 1;
  }

  if (leuntOpRol !== 'ja') {
    console.log(
      'pinuitzonderingen-controle: `guard_group_update()` leunt niet meer op een rolnaam.\n\n' +
        'Dat is goed nieuws en het maakt dit script overbodig — de uitzondering die het\n' +
        'bewaakte bestaat niet meer. Haal hem weg, samen met zijn register.',
    );
    return 0;
  }

  const { onbekend, verdwenen } = beoordeel(schrijvers);

  if (onbekend.length > 0) {
    console.error(
      `✗ ${onbekend.length} functie(s) mogen langs \`guard_group_update()\` zonder reden:\n`,
    );
    for (const f of onbekend) console.error(`    ${f}()`);
    console.error(
      '\nEen SECURITY DEFINER-functie draait als zijn eigenaar, dus de pin op\n' +
        '`invite_code`, `created_by`, `status`, `last_activity_at` en `zichtbaarheid`\n' +
        'geldt daar niet. Kan deze functie die kolommen wijzigen, en hoort dat?\n' +
        'Zo ja: zet hem met de reden in REGISTER in scripts/pinuitzonderingen-controle.mjs.\n' +
        'Zo nee: laat hem de kolommen niet aanraken, of maak hem SECURITY INVOKER.',
    );
    return 1;
  }

  if (verdwenen.length > 0) {
    console.error(`✗ ${verdwenen.length} functie(s) in het register bestaan niet meer:\n`);
    for (const f of verdwenen) console.error(`    ${f}()`);
    console.error(
      '\nEen register dat achterloopt, geeft redenen voor code die weg is. Haal ze eruit.',
    );
    return 1;
  }

  console.log(
    `pinuitzonderingen-controle: ${schrijvers.length} functies mogen langs de pin op \`groups\`, ` +
      'allemaal met een reden.',
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(hoofd());
