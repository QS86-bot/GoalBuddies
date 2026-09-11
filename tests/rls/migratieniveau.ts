import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { migratiesInMap, vergelijk } from '../../scripts/migratieregister-vergelijk.mjs';

import { PSQL_DB, PSQL_OMGEVING, psqlBasisArgumenten } from './psql-stack';

/**
 * Staat de testdatabase op hetzelfde migratieniveau als `supabase/migrations/`?
 *
 * ⚠️⚠️ **Dit bestaat omdat de suite groen werd over een schema van twee dagen
 *    oud** (QS8-426). 📏 Tijdens de audit van 11-09-2026 stond `goalbuddies_rls`
 *    op ongeveer `0232` terwijl de map op `0252` stond: geen `chatdocs`-bucket,
 *    geen `todo_items`, en nog mét de `*_update`-policies op `storage.objects`
 *    die 0239 juist intrekt. De suite zei niet "ik meet iets ouds"; hij zei
 *    niets.
 *
 * ⚠️ **De klasse van QS8-270, één laag hoger.** Die reparatie zorgde dat de
 *    suite niet meer stil zichzelf **overslaat**; deze gaat over een suite die
 *    stil **iets ouds meet**. Allebei geven ze exitcode 0, en de tweede is de
 *    gevaarlijkere: bij overslaan mist er een uitslag, hier lijkt er een te
 *    zijn.
 *
 * ⚠️ **Waarom dit niet aan `stackBeschikbaarOfFaal()` genoeg had.** Die werpt
 *    óók bij een achterlopend schema — maar alleen als de **proef van dát
 *    bestand** het gezochte object mist. Of een achterstand opvalt, hangt er dan
 *    van af wat een testbestand toevallig opvraagt: de bestanden die ouder zijn
 *    dan de ontbrekende migraties draaien vrolijk door. Deze controle stelt de
 *    vraag één keer, voor de hele suite, en over het register in plaats van over
 *    één object.
 *
 * ⚠️ **Hergebruikt `vergelijk()` uit `scripts/migratieregister-vergelijk.mjs`.**
 *    Dat is dezelfde vergelijking die de repo naast **productie** legt, en hij
 *    staat al los onder test. Een tweede vergelijking ernaast zou een tweede
 *    plek zijn waar de letterversies (`0039a`) en de tijdstempelvorm vastliggen.
 */

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));

/**
 * De naam zonder het nummer ervoor.
 *
 * ⚠️⚠️ **Gemeten en niet aangenomen, en zonder dit was de controle 255 keer
 *    rood geweest.** De lokale stack schrijft in `schema_migrations.name` de
 *    **hele stam** — `0252_de_goedkeuring_wijst_naar_de_eigenaar_van_de_voltooiing` —
 *    terwijl `migratiesInMap()` alleen het deel ná het eerste liggend streepje
 *    teruggeeft. De naamvergelijking in `vergelijk()` zou dan op élke migratie
 *    afgaan.
 *
 *    Productie doet dat níét zo: `migratieregister()` geeft de naam al zonder
 *    nummer terug, en daarom is `migratieregister-controle` altijd groen
 *    geweest. Dezelfde vergelijking, twee bronnen met een andere vorm — precies
 *    de klasse die je alleen vindt door hem één keer echt te draaien.
 *
 * ⚠️ Draagt de naam geen nummer, dan blijft hij zoals hij is. Een `name` die
 *    door iets anders gevuld is, hoort niet stilzwijgend ingekort te worden.
 */
export function zonderNummer(naam: string): string {
  const m = /^\d{4}[a-z]?_(.*)$/.exec(naam);
  return m?.[1] ?? naam;
}

/** Eén rij per toegepaste migratie, in de vorm die `vergelijk()` verwacht. */
export interface Registerrij {
  readonly versie: string;
  readonly naam: string;
}

/**
 * Leest het register van de doeldatabase.
 *
 * Geeft `null` als de database niet te bereiken is of het register niet bestaat.
 * ⚠️ **Dat is met opzet stil.** Een onbereikbare stack is het werkterrein van
 *    `stackBeschikbaarOfFaal()`, dat er een uitgewerkte melding voor heeft die
 *    de twee gevallen (geen server, wel server maar oud schema) uit elkaar
 *    houdt. Die hier overdoen zou twee meldingen voor één zaak geven, en de
 *    slechtste van de twee wint dan op volgorde.
 */
export function registerVanDatabase(): Registerrij[] | null {
  try {
    const uitvoer = execFileSync(
      'psql',
      [
        ...psqlBasisArgumenten(),
        '-d',
        PSQL_DB,
        '-tAc',
        "select version || '|' || coalesce(name, '') from supabase_migrations.schema_migrations",
      ],
      { env: PSQL_OMGEVING, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return uitvoer
      .split('\n')
      .map((regel) => regel.trim())
      .filter((regel) => regel.length > 0)
      .map((regel) => {
        const streep = regel.indexOf('|');
        return {
          versie: regel.slice(0, streep),
          naam: zonderNummer(regel.slice(streep + 1)),
        };
      });
  } catch {
    // ⚠️ Geen lege catch: `null` ís de afhandeling — zie de kop hierboven.
    return null;
  }
}

/**
 * De klachten over het niveau van de doeldatabase. Lege lijst is goed nieuws.
 *
 * @param register `null` betekent onbereikbaar; dan valt er niets te zeggen.
 */
export function niveauKlachten(register: Registerrij[] | null): readonly string[] {
  if (register === null) return [];

  // ⚠️ **Hier ook normaliseren, en niet alleen in `registerVanDatabase()`.** Dat
  //    is een naad: twee correcte onderdelen die op één plek aan elkaar knopen,
  //    en als de normalisatie alleen aan de leeskant staat is die knoop enkel
  //    mét een echte database te toetsen. `zonderNummer()` is idempotent, dus
  //    dit kost niets en maakt de hele weg los te voeden. Gevonden bij het
  //    ijken van de test zelf: de mutatie op `zonderNummer` liet dit geval groen.
  const genormaliseerd = register.map((m) => ({ ...m, naam: zonderNummer(m.naam) }));
  return vergelijk(migratiesInMap(WORTEL), genormaliseerd) as string[];
}

/**
 * De melding die de suite afbreekt, of `null` als er niets aan de hand is.
 *
 * ⚠️ Hij noemt beide standen én het commando dat het repareert. Een melding die
 *    alleen zegt dát er iets scheef staat, laat de lezer zelf uitzoeken wat —
 *    en dat is precies het moment waarop iemand de controle uitzet.
 */
export function niveauMelding(register: Registerrij[] | null): string | null {
  const klachten = niveauKlachten(register);
  if (klachten.length === 0) return null;

  const inMap = migratiesInMap(WORTEL);
  const hoogsteMap = inMap.at(-1)?.versie ?? '(geen)';
  const hoogsteDb = [...(register ?? [])].sort((a, b) => a.versie.localeCompare(b.versie)).at(-1);

  return (
    `De RLS-suite zou meten tegen een database die niet op het niveau van ` +
    `\`supabase/migrations/\` staat.\n\n` +
    `  map:       ${inMap.length} migraties, hoogste ${hoogsteMap}\n` +
    `  database:  ${register?.length ?? 0} migraties, hoogste ${hoogsteDb?.versie ?? '(geen)'} ` +
    `(${PSQL_DB})\n\n` +
    `Bouw hem opnieuw op met \`npm run rls:stack\`.\n\n` +
    `Groen worden op een ouder schema telt als bewijs dat er niet is. Wat er scheef staat:\n` +
    klachten.map((k) => `  - ${k}`).join('\n')
  );
}
