/**
 * Elke `disable trigger` in de testboom is geregistreerd — QS8-481.
 *
 * ⚠️⚠️ **Waarom dit een grendel nodig heeft.** `alter table … disable trigger`
 *    is geen sessie-instelling maar een schemawijziging: hij geldt voor de héle
 *    database. Staat hij in een losse `psql()`-aanroep, dan commit hij, en in dat
 *    venster schrijft **elke andere verbinding** ongegrendeld — ook een tweede
 *    suite-run. 📏 Gemeten op 14-09-2026: `lidmaatschapsgrens.test.ts` zette
 *    `group_members_guard` zo uit, en `rechten-zonder-aanroeper.test.ts` werd er
 *    in een gelijktijdige run twee keer rood van. De guard deed niets, en geen
 *    van beide bestanden kon zien waaróm.
 *
 * ⚠️⚠️ **En in-transactie sluit het commit-venster, niet het slot.** Dat is de
 *    correctie op wat hier eerst stond: dit bestand behandelde `in een
 *    transactie` als het antwoord, en dat is het maar half.
 *    `alter table … disable trigger` neemt een **ShareRowExclusiveLock** op die
 *    tabel en houdt hem tot het eind van de transactie — en die botst met de
 *    `RowExclusiveLock` van elke INSERT, UPDATE en DELETE. Een tweede run die
 *    naar diezelfde tabel schrijft, staat dus stil zolang jouw transactie leeft.
 *    📏 Gemeten op 14-09-2026 op de lokale stack: een houder met nog 10 s te
 *    gaan liet een schrijver **10058 ms** wachten — de wachttijd ís de looptijd
 *    van de transactie, niet een fractie ervan.
 *
 *    Een rij in `BEKEND` beantwoordt daarom **twee** vragen en niet één:
 *    *schrijft er in dit venster iets ongegrendeld* (het commit-venster), én
 *    *hoe kort leeft die transactie, en schrijft een ander bestand op dat moment
 *    naar dezelfde tabel* (het slot). `fileParallelism: false` dekt alleen het
 *    eerste soort binnen één run; twee runs zijn twee processen en die vlag zegt
 *    daar niets over.
 *
 * ⚠️ **De opstelling zelf moet blijven kunnen**, en dat is de must-allow. Twee
 *    sloten op één belofte toetsen vraagt dat het bovenste even weg kan — zonder
 *    die wereld bewaakt zo'n test niets. Deze controle verbiedt dus niets; hij
 *    eist dat er per geval opgeschreven staat **hoe het geïsoleerd is**.
 *
 * ⚠️⚠️ **Waarom een register en geen ontleder.** Een controle die zelf probeert
 *    te zien of de `disable` binnen een `begin … rollback` valt, moet
 *    template-literals volgen die als losse `const` worden samengesteld — 📏 twee
 *    van de zeven gevallen van vandaag doen precies dat
 *    (`goedkeuring-wijst-naar-de-eigenaar` en `seizoensrecap-per-groep`). Een
 *    ontleder die dát niet aankan, bewaakt vanaf dat moment de omweg en niet de
 *    belofte — de les van QS8-415. Een register kan het niet mislezen: het dwingt
 *    één zin per geval af, en een nieuw geval kan er niet stil bij.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { metSchuineStrepen } from './paden.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/**
 * De regels waarop een `disable trigger` als **code** staat, niet als proza.
 *
 * ⚠️ **De knip is "begint de regel met `*`, `//` of `/*`".** 📏 Gemeten over de
 *    testboom: dat scheidt de zeven echte statements van de vijf keer dat een
 *    kop of comment de term noemt, zonder valse treffer aan beide kanten. Een
 *    knip die álle `//` uit de bron haalt, eet een URL op — de val van QS8-412 —
 *    en die is hier dus met opzet niet gebruikt.
 */
export function vondsten(pad, inhoud) {
  const uit = [];
  inhoud.split('\n').forEach((regel, i) => {
    if (!regel.includes('disable trigger')) return;
    const kaal = regel.trim();
    if (kaal.startsWith('*') || kaal.startsWith('//') || kaal.startsWith('/*')) return;
    uit.push({ pad, regel: i + 1, tekst: kaal });
  });
  return uit;
}

/**
 * Elk bekend geval, met hoe het geïsoleerd is.
 *
 * ⚠️ Een rij die geen reden draagt is geen rij: schrijf op waaróm dit geval geen
 *    venster opent voor een andere verbinding (het commit-venster) én waarom
 *    zijn transactie kort genoeg is om geen tweede schrijver op te houden (het
 *    slot). In-transactie maken is het antwoord op de eerste vraag, niet op
 *    allebei.
 */
export const BEKEND = [
  {
    pad: 'tests/rls/lidmaatschapsgrens.test.ts',
    reden:
      'In-transactie: de `disable`, de poging als `authenticated` en de `rollback` ' +
      'zitten in één `psql()`-aanroep, dus er commit niets. Omgezet in QS8-481, ' +
      'nadat juist dit geval een gelijktijdige run twee keer rood maakte. Het slot ' +
      'leeft één `update` lang — er zit geen wachtmoment en geen tweede aanroep in.',
  },
  {
    pad: 'tests/rls/goedkeuring-wijst-naar-de-eigenaar.test.ts',
    reden:
      'In-transactie, dus geen commit-venster: de kop van dat bestand schrijft met ' +
      'zoveel woorden op dat de opstelling terugrolt. ⚠️ Het slot is hier het ' +
      'resterende risico en niet het venster: de `disable` staat vooraan in `OPZET` ' +
      'en houdt `completion_approvals` tot de `rollback` op ShareRowExclusive. Dat ' +
      'is vandaag kort — het hele bestand draait solo in 2,9 s — maar een tweede ' +
      'run die op datzelfde moment in `completion_approvals` schrijft, wacht erop. ' +
      '📏 Dat is één keer gezien: `dagplafond-batch-tien.test.ts` liep bij twee ' +
      'gelijktijdige runs op 14-09-2026 in zijn timeout van 240 s. ' +
      '⚠️ Afgehandeld in QS8-492, en niet door het slot weg te nemen: dat kan hier ' +
      'niet zonder de opstelling op te geven die de grendel eronder toetst. Wat er ' +
      'wél staat is een `lock_timeout` van 3 s op de PostgREST-verbindingen, zodat ' +
      'een botsing een fout van seconden wordt die zichzelf uitlegt in plaats van ' +
      'een timeout van 240 s op een onschuldig bestand. Bewaakt door ' +
      '`tests/rls/lock-timeout.test.ts`.',
  },
  {
    pad: 'tests/rls/opruiming.test.ts',
    reden:
      'Twee gevallen. Het tweede zit in een `begin … rollback`; het eerste niet. ' +
      '⚠️ Nog niet omgezet, en dat is een meting en geen aanname: bij twee ' +
      'gelijktijdige volledige runs op 14-09-2026 werd dit bestand niet rood en ' +
      'maakte het geen ander bestand rood. Zet het om zodra het dat wél doet.',
  },
  {
    pad: 'tests/rls/afvinkgrens.test.ts',
    reden:
      '⚠️ Losse `psql()`, nog niet omgezet. Zelfde meting als hierboven: geen van ' +
      'de twee gelijktijdige runs van 14-09-2026 viel hierop om. `day_checkins` ' +
      'draagt bovendien geen belofte die een ander bestand op datzelfde moment toetst.',
  },
  {
    pad: 'tests/rls/getuigemelding.test.ts',
    reden:
      '⚠️ Losse `psql()`, nog niet omgezet. Idem — niet rood geworden en niets ' +
      'rood gemaakt in de meting van 14-09-2026.',
  },
  {
    pad: 'tests/rls/seizoensrecap-per-groep.test.ts',
    reden:
      '⚠️ Losse `psql()` in een los SQL-fragment (`BREEK_DE_STUKKE`), nog niet ' +
      'omgezet. Idem gemeten. De trigger gaat hier één `update` lang uit en meteen ' +
      'weer aan, in dezelfde aanroep.',
  },
];

const bestanden = (map) =>
  readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) return bestanden(pad);
    return pad.endsWith('.ts') ? [pad] : [];
  });

/**
 * @returns {string[]} de klachten, leeg als alles klopt
 */
export function klachten(alle, register = BEKEND) {
  const bekend = new Map(register.map((r) => [r.pad, r.reden]));
  const gezien = new Set();
  const uit = [];

  for (const v of alle) {
    gezien.add(v.pad);
    if (bekend.has(v.pad)) continue;
    uit.push(
      `${v.pad}:${v.regel} zet een trigger uit zonder dat er een regel over staat — ` +
        'een `disable trigger` geldt voor de héle database. Commit hij, dan schrijft ' +
        'elke andere verbinding in dat venster ongegrendeld; commit hij niet, dan ' +
        'houdt hij tot het eind van de transactie een ShareRowExclusiveLock vast en ' +
        'staat elke andere schrijver op die tabel stil. Zet hem met een reden in ' +
        '`BEKEND` die allebei die vragen beantwoordt.',
    );
  }

  // ⚠️ De ratel slaat twee kanten op: een rij die nergens meer op slaat, zegt
  //    "dit is beoordeeld" over een toestand die niet meer bestaat.
  for (const r of register) {
    if (!gezien.has(r.pad)) {
      uit.push(
        `\`${r.pad}\` staat in \`BEKEND\` maar zet geen enkele trigger meer uit — ` +
          'haal de regel weg.',
      );
    }
  }

  return uit;
}

/**
 * ⚠️ **Alleen `tests/rls/`, en dat is gemeten en niet gekozen.** 📏 Op
 *    14-09-2026 staan álle twaalf treffers op `disable trigger` in die map —
 *    logisch, want daar leeft de SQL die via `psql()` de deur uit gaat. De map
 *    `tests/scripts/` valt er met opzet buiten: die toetst controles en draagt
 *    de term als **testgegeven**, niet als statement. Komt er ooit een echte
 *    `disable` buiten `tests/rls/`, dan ziet deze controle hem niet — schrijf
 *    dat hier op in plaats van de map stil te verbreden.
 */
export const BOOM = 'tests/rls';

function hoofd() {
  const alle = bestanden(join(WORTEL, BOOM)).flatMap((pad) =>
    vondsten(metSchuineStrepen(relative(WORTEL, pad)), readFileSync(pad, 'utf8')),
  );
  const fouten = klachten(alle);

  if (fouten.length === 0) {
    console.log(
      `triggeruitzetting-controle: ${alle.length} \`disable trigger\` in ${BOOM}, ` +
        'alle met een regel die zegt hoe ze geïsoleerd zijn.',
    );
    return;
  }

  console.error('triggeruitzetting-controle: er staat een trigger uit zonder uitleg.\n');
  for (const f of fouten) console.error(`  - ${f}`);
  console.error(
    '\nEen uitgezette trigger is uitgezet voor élke verbinding, ook voor een tweede\n' +
      'suite-run. Zie QS8-481 en\n' +
      '`docs/decisions/2026-09-14-een-uitgezette-trigger-is-van-iedereen.md`.',
  );
  process.exit(1);
}

// ⚠️ Alleen draaien als hij zelf aangeroepen is: de test importeert dit bestand,
//    en een controle die bij het importeren `process.exit()` doet, sloopt de run
//    die hem toetst.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
