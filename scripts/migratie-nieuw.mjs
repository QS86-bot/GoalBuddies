#!/usr/bin/env node
/**
 * migratie-nieuw — een migratiebestand met een nummer dat niemand anders claimt.
 *
 * ⚠️ **Waarom dit bestaat, met de cijfers erbij.** Op 28-08-2026 botsten
 *    migratienummers **drie keer op één dag**: `0107`–`0109` moesten naar
 *    `0111`–`0113` omdat een parallelle sessie die nummers eerder had, `0119`
 *    lag stil achter een `0118` die nog niet geland was, en tijdens het schrijven
 *    van dít script stond `main` alweer op `0123` terwijl de werkbranch op
 *    `0121` zat.
 *
 * ⚠️ **De fout zit niet in het tellen maar in wáár je telt.** Wie `max + 1` neemt
 *    uit zijn eigen map, kiest het nummer dat de collega een uur geleden ook koos.
 *    Dit script kijkt daarom naar **elke branch die de remote kent**, niet alleen
 *    naar de werkkopie — inclusief branches waarvan de PR nog niet geland is,
 *    want juist díé dragen de nummers die nog niet in `main` staan.
 *
 * ⚠️ **Sinds QS8-247 fetcht dit script eerst zelf.** Op 31-08-2026 botste er
 *    opnieuw een nummer, mét deze tool — omdat de werkkopie niet wist wat er een
 *    uur eerder gepusht was. De scan zei dat eerlijk in zijn eigen commentaar,
 *    en dat is precies te weinig: een gereedschap dat bestaat om een botsing te
 *    voorkomen, mag zijn juistheid niet laten afhangen van een handeling die het
 *    zelf niet doet. Mislukt de fetch, dan telt hij dóór — zonder netwerk moet je
 *    een migratie kunnen beginnen — maar noemt hij hoe oud het beeld is.
 *
 * ⚠️ **Het is geen slot en dat kan het ook niet zijn.** Twee sessies die op
 *    dezelfde seconde beginnen, krijgen hetzelfde nummer — daar helpt alleen een
 *    reservering die je commit. Wat dit wél wegneemt is het gewone geval: iemand
 *    die begint terwijl er al werk elders ligt. Dat waren alle drie de botsingen
 *    van 28-08.
 *
 * Draaien: `npm run migratie:nieuw -- "korte naam met streepjes"`.
 * Met `--droog` schrijft hij niets en zegt hij alleen welk nummer vrij is.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  haalRemoteOp,
  nummersPerBranch as nummersPerBranchVolledig,
  versheidsmelding,
} from './migratiebranches.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAP = 'supabase/migrations';

/**
 * De vier cijfers uit een migratiebestandsnaam.
 *
 * ⚠️ Alleen aan het begin en precies vier. `0039a_...` telt als 39 — een
 *    achtervoegsel is nazorg op een bestaand nummer en claimt er geen nieuw.
 */
export function nummerUit(bestandsnaam) {
  const m = /^(\d{4})[a-z]?_/.exec(bestandsnaam);
  return m ? Number(m[1]) : null;
}

/** Het hoogste nummer in een lijst bestandsnamen; 0 als er geen enkel in zit. */
export function hoogsteIn(bestandsnamen) {
  const nummers = bestandsnamen.map(nummerUit).filter((n) => n !== null);
  return nummers.length === 0 ? 0 : Math.max(...nummers);
}

/**
 * Het volgende nummer: aansluitend op de éigen map, en niets anders.
 *
 * ⚠️⚠️ **Dit was tot QS8-365 het maximum over álle branches, en dat gaf een
 *    nummer dat CI weigert.** De redenering was "een gat betekent dat er nog
 *    iets moet landen, ga daar niet bovenop zitten". Die klopt over de intentie
 *    en niet over het gevolg: `migraties:controle` telt de gaten in de **eigen
 *    map**, en CI checkt met `actions/checkout@v4` één branch uit — daar zijn
 *    geen `origin/…`-refs, dus ook geen verzachting van de soort "branch X
 *    draagt 0208".
 *
 * 📏 Twee keer op één dag gemeten (QS8-363 en QS8-305), en op 08-09 nog een
 *    derde keer bij QS8-360: `main` op 0207, een branch op 0208, werkkopie op
 *    0207. Dit script gaf 0209, en met 0209 in de map is CI rood op een gat van
 *    één — vóór er ook maar iets aan de migratie mis was.
 *
 * ⚠️ **Het gat is erger dan de botsing, en dat is het hele besluit.** Een gat is
 *    onverwerkt: CI is meteen rood, op elke push, en de map kan het schema niet
 *    opbouwen. Een botsing is verwérkt — sinds QS8-318 hernummert wie als tweede
 *    merget, en dat is een handeling van een paar minuten op een moment dat je
 *    er toch bent. En het maximum-over-alles vóórkwam de botsing niet eens: het
 *    keek naar de branches die er nú zijn, terwijl de volgende branch morgen
 *    ontstaat.
 *
 * De branches verdwijnen niet uit beeld — ze bepalen alleen niet langer het
 * nummer maar de wáárschuwing. Zie `botsendeBranches()` hieronder.
 */
export function volgendVrijNummer({ lokaal }) {
  return hoogsteIn(lokaal) + 1;
}

/**
 * De branches die het nummer dragen dat dit script gaat uitdelen.
 *
 * ⚠️ Dit is de botsing waar je vanaf nu zelf naar kijkt: het nummer klopt met de
 *    eigen map, en of iemand anders het óók heeft, is een aparte vraag met een
 *    ander antwoord (QS8-318: wie als tweede merget, hernummert).
 */
export function botsendeBranches({ volledig, nummer }) {
  return Object.entries(volledig)
    .filter(([, nummers]) => nummers.includes(nummer))
    .map(([branch]) => branch)
    .sort();
}

/**
 * Loopt de hoofdbranch vóór op deze werkkopie?
 *
 * ⚠️ **Dit is de énige toestand waarin het nieuwe nummer echt fout is**, en hij
 *    ziet er van buiten hetzelfde uit als een botsing. Staat `origin/main` op
 *    0210 en je werkkopie op 0207, dan geeft dit script 0208 — een nummer dat op
 *    `main` al bezet is, en dat na een merge meteen dubbel staat. Er is niets te
 *    hernummeren: je werkkopie is verouderd, en `git pull` is het antwoord.
 *
 * ⚠️ Een féature-branch die vooroploopt is iets anders: die is niet geland en
 *    zijn nummer is nog geen feit. Vandaar twee meldingen en niet één met een
 *    lijstje — een lezer die ze op één hoop krijgt, leert ze allebei overslaan.
 */
export function hoofdbranchVoorop({ lokaal, perBranch, hoofd = 'origin/main' }) {
  const opMain = perBranch[hoofd] ?? 0;
  const hier = hoogsteIn(lokaal);
  return opMain > hier ? { hoofd, hoogste: opMain, hier } : null;
}

/*
 * ⚠️ **Hier stond `branchesVoorOp()`, en die is met QS8-365 vervallen.** Hij
 *    beantwoordde "welke branches zitten hoger dan deze werkkopie", en dat was
 *    één vraag voor twee gevallen die om verschillende handelingen vragen: een
 *    feature-branch die vooroploopt (een botsing, zie `botsendeBranches()`) en
 *    een hoofdbranch die vooroploopt (een verouderde werkkopie, zie
 *    `hoofdbranchVoorop()`).
 *
 *    Toen het nummer niet langer van de branches afhing, hield hij nul
 *    aanroepers over buiten zijn eigen test — de vorm die dit project als schuld
 *    telt (QS8-351). Weggehaald in plaats van bewaard "voor als het nog eens van
 *    pas komt".
 */

/**
 * Per branch het hoogste nummer, afgeleid uit de gedeelde scan.
 *
 * ⚠️ **De scan zelf staat sinds QS8-238 in `migratiebranches.mjs`**, want
 *    `migraties:controle` heeft hem óók nodig — en daar met de vólledige
 *    verzameling in plaats van alleen het hoogste. Twee bijna gelijke git-scans
 *    naast elkaar is precies hoe ze uit elkaar gaan lopen.
 *
 * ⚠️ Dit script had genoeg aan het hoogste nummer: het kiest er een vrij. De
 *    controle heeft alles nodig, want een branch die 0126 t/m 0130 draagt terwijl
 *    deze map op 0125 staat, geeft als hoogste 0130 — en dan weet je nog steeds
 *    niet dat 0126 t/m 0129 ook ontbreken.
 */
function nummersPerBranch() {
  const volledig = nummersPerBranchVolledig();
  if (volledig === null) return {};

  const perBranch = {};
  for (const [branch, nummers] of Object.entries(volledig)) {
    perBranch[branch] = nummers.length === 0 ? 0 : Math.max(...nummers);
  }
  return perBranch;
}

/** De kop die onwrikbare regel 20 eist: een rollback-pad, vanaf regel één. */
export function sjabloon({ nummer, naam }) {
  const bestand = `${String(nummer).padStart(4, '0')}_${naam}.sql`;
  return `-- ${bestand} — <waarom deze migratie bestaat, in één regel>
--
-- ROLLBACK-PAD:
--   <de SQL die dit terugdraait, of "n.v.t. — voegt alleen toe">
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- <de meting die deze migratie nodig maakte, niet de redenering>
--
-- ---------------------------------------------------------------------------

`;
}

function hoofd() {
  const argumenten = process.argv.slice(2).filter((a) => a !== '--droog');
  const droog = process.argv.includes('--droog');
  const naam = (argumenten[0] ?? '').trim().replace(/\s+/g, '_').toLowerCase();

  // ⚠️ Vóór de scan, niet erna: `nummersPerBranch()` leest `refs/remotes/origin`,
  //    en dat is precies wat de fetch bijwerkt.
  for (const regel of versheidsmelding({ ...haalRemoteOp(), nu: new Date() })) {
    process.stdout.write(`${regel}\n`);
  }

  const lokaal = readdirSync(join(WORTEL, MAP)).filter((n) => n.endsWith('.sql'));
  const volledig = nummersPerBranchVolledig() ?? {};
  const perBranch = nummersPerBranch();
  const nummer = volgendVrijNummer({ lokaal });

  // ⚠️ **De verouderde werkkopie eerst, want dat is de enige echte fout.** Zie
  //    `hoofdbranchVoorop()`: hier valt niets te hernummeren, er valt te pullen.
  const achter = hoofdbranchVoorop({ lokaal, perBranch });
  if (achter !== null) {
    process.stdout.write(
      `⚠ ${achter.hoofd} staat op ${String(achter.hoogste).padStart(4, '0')} en deze werkkopie op ` +
        `${String(achter.hier).padStart(4, '0')}.\n` +
        `  ${String(nummer).padStart(4, '0')} is daar al bezet. Haal eerst binnen:\n` +
        '      git pull origin main\n\n',
    );
  }

  // ⚠️ **En dan pas de botsing, die geen fout is maar een afspraak.** Een
  //    feature-branch is niet geland, dus zijn nummer is nog geen feit; QS8-318
  //    zegt wie er hernummert als jullie allebei landen.
  const botsend = botsendeBranches({ volledig, nummer });
  if (botsend.length > 0) {
    process.stdout.write(
      `⚠ ${String(nummer).padStart(4, '0')} staat ook op ${botsend.length} nog niet gelande branch(es):\n`,
    );
    for (const b of botsend) process.stdout.write(`    ${b}\n`);
    process.stdout.write(
      '  Dat is geen reden om een hoger nummer te nemen: een gat naar `main` maakt\n' +
        '  `migraties:controle` meteen rood, en CI ziet die branches niet. Wie als\n' +
        '  tweede merget, hernummert (QS8-318).\n\n',
    );
  }

  if (naam === '') {
    process.stdout.write(`Eerste vrije nummer: ${String(nummer).padStart(4, '0')}\n`);
    process.stdout.write('Geef een naam mee om het bestand te maken:\n');
    process.stdout.write('  npm run migratie:nieuw -- "de_klok_van_de_groep"\n');
    return;
  }

  const bestand = `${String(nummer).padStart(4, '0')}_${naam}.sql`;
  if (droog) {
    process.stdout.write(`(droog) zou aanmaken: ${MAP}/${bestand}\n`);
    return;
  }

  writeFileSync(join(WORTEL, MAP, bestand), sjabloon({ nummer, naam }), { flag: 'wx' });
  process.stdout.write(`✓ ${MAP}/${bestand}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
