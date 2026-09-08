#!/usr/bin/env node
/**
 * Een herdefinitie mag geen registerrij laten vallen — QS8-358.
 *
 * ⚠️ **Waarom dit een controle is en geen afspraak.** Op 08-09-2026 breidden twee
 *    branches op dezelfde dag het register van `sleutelzetters()` uit: 0199 met
 *    drie sessiesleutels, 0200 met negen tellers. Allebei doen ze
 *    `create or replace function public.sleutelzetters()`, en het register staat
 *    in het functielichaam. De tweede die landde kopieerde het lichaam van vóór
 *    de eerste, dus na de merge stonden die drie sleutels er niet meer in.
 *
 * ⚠️⚠️ **Git ziet hier geen conflict.** De twee migraties zijn verschillende
 *    bestanden en de merge is schoon. Het conflict is semantisch: twee bestanden
 *    definiëren dezelfde functie opnieuw, en alleen de volgorde van de
 *    migratienummers bepaalt wie wint. Precies de vorm van het migratienummer
 *    zelf — twee branches delen stilzwijgend een naamruimte — en daar is de
 *    afspraak "wie als tweede merget, hernummert" met `migraties:controle` als
 *    alarm. Hier was er nog geen alarm.
 *
 * ⚠️ **Dat het die dag goed ging, was geluk met een goede grendel.**
 *    `sleutelzetters()` ving zichzelf op: zijn derde tak meldt elke `app.`-sleutel
 *    die in geen register staat, en die drie hádden nog een zetter. Verdwijnt een
 *    rij samen met zijn zetter, dan ziet die tak niets. En hij spreekt pas nádat
 *    het schema gebouwd is, met een database ernaast; deze controle leest de
 *    bestanden en draait in CI zonder database.
 *
 * ⚠️ **Wat hij níét doet is een verwijdering verbieden.** Een rij mag weg — 0204
 *    haalde `app.hervat_lidmaatschap` eruit omdat `paused` als lidmaatschapstand
 *    ophield te bestaan (QS8-325). Wat hij eist is dat zo'n verwijdering
 *    *bedoeld* is, en dat staat hieronder in `AANVAARD` met de reden erbij.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIEMAP = join(WORTEL, 'supabase', 'migrations');

/**
 * De verwijderingen die bewust zijn, met de reden.
 *
 * ⚠️ **Eén regel per verwijdering en geen vinkje per functie.** Een uitzondering
 *    op functieniveau zou de volgende verwijdering in diezelfde functie
 *    stilzwijgend meenemen, en dat is precies wat er hier fout ging.
 */
export const AANVAARD = [
  {
    migratie: '0204_paused_is_geen_lidmaatschapstoestand.sql',
    functie: 'sleutelzetters',
    sleutel: 'app.hervat_lidmaatschap',
    reden:
      'QS8-325 haalde `paused` uit de CHECK op `group_members.status`; er is geen ' +
      'hervatting meer om een sleutel voor te zetten.',
  },
];

/**
 * Elke functiedefinitie in `bron`, met de sleutels van zijn register.
 *
 * ⚠️ **Commentaar gaat eruit vóór het lezen**, om dezelfde reden als in
 *    `onveranderlijkheid_bewaking()` sinds 0208: een rij die alleen in een
 *    uitleg staat, staat niet in het register. Een uitgecommentarieerde rij
 *    hoort dus als verlies te tellen, en dat doet hij zo.
 *
 * ⚠️ **De sleutel is het eerste stringliteraal van een rij**, want zo zien de
 *    registers in dit project eruit: `('app.iets', array[...])`. Een register
 *    met een andere vorm valt hier buiten — dan vindt deze controle niets en
 *    meldt hij ook niets, en dát is de blinde vlek om te kennen.
 */
export function registersIn(bron) {
  const definitie = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi;
  const uit = [];

  for (const m of bron.matchAll(definitie)) {
    const rest = bron.slice(m.index + m[0].length);
    const opening = /\$(\w*)\$/.exec(rest);
    if (opening === null) continue;

    const merk = opening[0];
    const einde = rest.indexOf(merk, opening.index + merk.length);
    const lichaam = rest.slice(opening.index + merk.length, einde === -1 ? undefined : einde);
    const schoon = lichaam.replace(/--[^\n]*/g, '');

    const sleutels = [...schoon.matchAll(/^\s*\(\s*'([^']+)'/gm)].map((r) => r[1]);
    if (sleutels.length > 0) uit.push({ functie: m[1], sleutels: [...new Set(sleutels)] });
  }

  return uit;
}

/**
 * Welke sleutels een latere definitie laat vallen die een eerdere wél had.
 *
 * `definities` is op migratievolgorde gesorteerd: `{ migratie, functie, sleutels }`.
 */
export function verliezen(definities, aanvaard = AANVAARD) {
  const laatste = new Map();
  const uit = [];

  for (const { migratie, functie, sleutels } of definities) {
    const eerder = laatste.get(functie);
    if (eerder !== undefined) uit.push(...gemist(migratie, functie, eerder, sleutels, aanvaard));
    laatste.set(functie, sleutels);
  }

  return uit;
}

/** De sleutels uit `eerder` die `nu` niet meer heeft en die niet aanvaard zijn. */
function gemist(migratie, functie, eerder, nu, aanvaard) {
  return eerder
    .filter((sleutel) => !nu.includes(sleutel))
    .filter(
      (sleutel) =>
        !aanvaard.some(
          (a) => a.migratie === migratie && a.functie === functie && a.sleutel === sleutel,
        ),
    )
    .map((sleutel) => ({ migratie, functie, sleutel }));
}

/** Alle definities uit de migratiemap, op volgorde van bestandsnaam. */
export function definitiesUitDeMap(map = MIGRATIEMAP) {
  const uit = [];
  for (const naam of readdirSync(map).filter((n) => n.endsWith('.sql')).sort()) {
    for (const d of registersIn(readFileSync(join(map, naam), 'utf8'))) {
      uit.push({ migratie: naam, ...d });
    }
  }
  return uit;
}

function main() {
  const definities = definitiesUitDeMap();

  // ⚠️ Eerst bewijzen dát hij iets ziet. Nul definities betekent hier ook "de
  //    afleiding is stuk", en dan is groen een uitspraak over niets — dezelfde
  //    val als een controlescript dat nul meldt omdat het niets inleest.
  if (definities.length === 0) {
    console.error(
      'registerdrift-controle: geen enkel register gevonden in de migratiemap.\n\n' +
        'Dat is geen groen maar een kapotte afleiding: deze controle leest\n' +
        "rijen van de vorm ('sleutel', ...) uit een functielichaam.",
    );
    process.exit(1);
  }

  const gevonden = verliezen(definities);

  if (gevonden.length === 0) {
    const functies = new Set(definities.map((d) => d.functie));
    console.log(
      `registerdrift-controle: ${definities.length} registerdefinitie(s) in ` +
        `${functies.size} functie(s); geen enkele herdefinitie laat een rij vallen.`,
    );
    process.exit(0);
  }

  console.error('registerdrift-controle: een herdefinitie laat registerrijen vallen.\n');
  for (const { migratie, functie, sleutel } of gevonden) {
    console.error(`  - ${migratie}: ${functie}() verliest '${sleutel}'`);
  }
  console.error(
    '\nEen register in een functielichaam wordt door `create or replace` in zijn\n' +
      'geheel vervangen. Twee branches die het op dezelfde dag uitbreiden botsen\n' +
      'daarom zonder dat git een conflict ziet: de migratie met het hoogste nummer\n' +
      'wint, en de rijen van de ander verdwijnen zonder een woord. Zo verloor\n' +
      '`sleutelzetters()` op 08-09-2026 bijna drie sleutels (QS8-358).\n' +
      '\nHoort de rij er nog te zijn, zet hem dan terug. Is de verwijdering bedoeld,\n' +
      'zet hem dan met de reden in `AANVAARD` in dit script — één regel per\n' +
      'verwijdering, zodat de vólgende niet meelift op dezelfde uitzondering.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
