import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REDACTED, scrubContext } from '../../src/lib/observability/scrub';

/**
 * Een overgeslagen groep verlaat de job — QS8-171, migratie 0158.
 *
 * ⚠️ **De belofte is niet "`maak_seizoensrecaps()` telt zijn mislukkingen".** Dat
 *    is een eigenschap van één onderdeel, en die staat onder test in
 *    `tests/rls/seizoensrecap-per-groep.test.ts`. De belofte is: *een groep die
 *    zijn recap misloopt, wordt door iemand gezien.*
 *
 * ⚠️ **Dit is de naad, en het is de naad die de reparatie zelf maakt.** Vóór 0158
 *    brak de job in zijn geheel af — luidruchtig, en de rollover kreeg een
 *    `error` terug. Ná 0158 gaat hij netjes door en geeft `ok: true`. Als de
 *    rollover dan niet naar `mislukt` kijkt, heeft deze migratie het afbreken
 *    geruild voor stil falen — precies waar QS8-140 op stukliep en precies de
 *    reden die de dossierrij gaf om dit te laten liggen. **De twee helften zijn
 *    ieder voor zich correct en de belofte hangt ertussen.**
 *
 * ⚠️ **De sleutel wordt uit de migratie gelezen en niet overgetypt.** Een tweede
 *    handgeschreven lijst hier zou de derde kopie zijn, en dan toetst deze test
 *    alleen nog of ik twee dingen consistent heb overgetypt — de fout van
 *    0032/0034.
 *
 * IJKING — met de hand gedraaid op 04-09-2026:
 *
 *   A  `'mislukt', mislukt` uit de teruggave van 0158 halen   → 2 rood
 *   B  het `meld()`-blok in de rollover weghalen              → 1 rood
 *   C  `recapsOvergeslagen` uit het antwoord van de rollover  → 1 rood
 *   D  de afleiding uit de migratie naar een naam die niet
 *      bestaat wijzen                                         → 1 rood ("vindt geen")
 *   E  `count` in de Sentry-context terug naar `groepen`      → 1 rood
 *
 * ⚠️ **E is er pas na de security-review van 04-09**, en het is de vorm van regel
 *    18 vraag 5: de melding werd verstuurd, het veld heette alleen anders dan
 *    `scrubContext()` doorlaat, dus het getal kwam als `[weggelaten]` aan. Elk
 *    onderdeel klopte en het geheel zei niets.
 */

const WORTEL = join(__dirname, '..', '..');
const MIGRATIES = join(WORTEL, 'supabase', 'migrations');
const ROLLOVER = join(WORTEL, 'supabase', 'functions', 'rollover', 'index.ts');

/** Commentaar eruit, zodat een uitleg die de sleutel noemt niet als bewijs telt. */
function zonderCommentaar(bron: string): string {
  return bron
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((regel) => regel.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

/**
 * De sleutels die `maak_seizoensrecaps()` in zijn laatste vorm teruggeeft.
 *
 * ⚠️ **De láátste migratie die hem definieert, en niet een vast bestandsnummer.**
 *    Wie de functie in 0203 opnieuw schrijft, hoort deze test mee te nemen —
 *    niet hem stilletjes naar een oude vorm te laten kijken.
 */
function sleutelsVanDeTeruggave(): string[] {
  const bestanden = readdirSync(MIGRATIES)
    .filter((naam) => naam.endsWith('.sql'))
    .sort();

  let laatste: string | null = null;
  for (const naam of bestanden) {
    const sql = readFileSync(join(MIGRATIES, naam), 'utf8');
    if (/create\s+or\s+replace\s+function\s+public\.maak_seizoensrecaps\s*\(/i.test(sql)) {
      laatste = sql;
    }
  }

  if (laatste === null) {
    throw new Error(
      'geen enkele migratie definieert maak_seizoensrecaps(). Hernoemd of verplaatst? ' +
        'Dan kijkt deze test naar niets en bewaakt hij niets.',
    );
  }

  // De laatste `return jsonb_build_object(...)` in dat bestand — dat is de
  // teruggave van de job zelf; de `forbidden`-tak erboven telt niet mee.
  const blokken = [...laatste.matchAll(/return\s+jsonb_build_object\s*\(([\s\S]*?)\);/g)];
  const laatsteBlok = blokken.at(-1)?.[1];
  if (laatsteBlok === undefined) {
    throw new Error(
      'de teruggave van maak_seizoensrecaps() is geen `return jsonb_build_object(...)` meer. ' +
        'Deze afleiding vindt dan geen sleutels en de test hieronder is groen om niets.',
    );
  }

  return [...laatsteBlok.matchAll(/'([a-z_]+)'\s*,/g)].map((m) => m[1] as string);
}

describe('een overgeslagen groep verlaat de recapjob', () => {
  const sleutels = sleutelsVanDeTeruggave();

  it('telt zijn overgeslagen groepen in de teruggave', () => {
    // ⚠️ Eerst: vindt de afleiding überhaupt iets? Zonder deze regel is elke
    //    assertie hieronder groen zodra de vorm van de teruggave verandert.
    expect(sleutels.length, 'de afleiding vond geen enkele sleutel').toBeGreaterThan(2);
    expect(sleutels).toContain('mislukt');
  });

  const bron = zonderCommentaar(readFileSync(ROLLOVER, 'utf8'));

  it('en de rollover leest dat getal in plaats van het te laten liggen', () => {
    expect(bron, 'de rollover kijkt niet naar `mislukt`').toMatch(/\bmislukt\b/);
  });

  it('meldt het aan Sentry zodra het boven nul staat', () => {
    // De variabele waarin de rollover het getal opvangt, plus wat hij ermee doet.
    const opvang = /const\s+(\w+)\s*=[^;]*\bmislukt\b[^;]*;([\s\S]*)/.exec(bron);
    expect(
      opvang,
      'de rollover vangt `mislukt` niet meer in een const op — verhuisd of hernoemd? ' +
        'Dan wijst deze test naar de verkeerde plek en bewaakt hij niets.',
    ).not.toBeNull();

    const naam = opvang?.[1] as string;
    const daarna = opvang?.[2] as string;

    // ⚠️ `meld()` en niet alleen `console.error`. Een console-regel in de
    //    Supabase-logs leest niemand uit zichzelf — dezelfde reden als bij
    //    `rollover.cyclus` een paar honderd regels hoger.
    expect(daarna, 'een deels mislukte recapjob bereikt niemand').toMatch(
      new RegExp(`if\\s*\\(\\s*${naam}\\s*>\\s*0\\s*\\)[\\s\\S]{0,600}?meld\\(`),
    );
  });

  it('en zet het in zijn eigen uitvoer, zodat het log het naleest', () => {
    const opvang = /const\s+(\w+)\s*=[^;]*\bmislukt\b[^;]*;/.exec(bron);
    const naam = opvang?.[1] as string;

    // ⚠️ De láátste, en niet de eerste. Bovenin staat de 403-tak van de
    //    autorisatie, en die draagt dit getal terecht niet.
    const antwoord = [
      ...bron.matchAll(/return\s+new\s+Response\s*\(\s*JSON\.stringify\s*\(\s*\{([\s\S]*?)\}\s*\)/g),
    ].at(-1);
    expect(
      antwoord,
      'het antwoord van de rollover is geen `JSON.stringify({…})` meer — deze test ' +
        'kijkt dan naar niets.',
    ).not.toBeNull();

    expect(
      antwoord?.[1],
      'een deels mislukte recapjob is in de uitvoer niet van een geslaagde te onderscheiden',
    ).toContain(naam);
  });
});

describe('en wat er mee naar Sentry gaat, komt daar ook aan', () => {
  const bron = zonderCommentaar(readFileSync(ROLLOVER, 'utf8'));

  /**
   * ⚠️ **`scrubContext()` laat alleen de sleutels uit zijn eigen lijst door en
   *    vervangt de rest door `[weggelaten]`.** Een zelfbedachte veldnaam
   *    verdwijnt dus stil: de melding komt aan, het getal niet. Deze test voert
   *    de context uit de bron door de échte functie in plaats van de lijst over
   *    te typen.
   */
  it('stuurt het aantal overgeslagen groepen mee in een sleutel die overleeft', () => {
    // Élke `meld()` met tag `rollover.recap`, want er zijn er meer dan één en
    // ze horen allemaal aan te komen.
    const contexten = [...bron.matchAll(/'rollover\.recap',\s*\{([^}]*)\}/g)].map(
      (m) => [...(m[1] ?? '').matchAll(/(\w+)\s*:/g)].map((k) => k[1] as string),
    );

    expect(
      contexten.length,
      'geen `meld(…, \'rollover.recap\', { … })` met een context gevonden — ' +
        'verhuisd of hernoemd? Dan bewaakt deze test niets.',
    ).toBeGreaterThan(0);

    // ⚠️ Minstens één ervan draagt méér dan alleen een `code`: het getal zelf.
    //    Zonder deze regel is de test groen bij drie lege contexten.
    expect(
      contexten.some((sleutels) => sleutels.some((k) => k !== 'code')),
      'geen enkele melding draagt het aantal overgeslagen groepen',
    ).toBe(true);

    // Een proefwaarde per sleutel; het gaat om de naam, niet om de inhoud.
    const weggelaten = contexten.flatMap((sleutels) => {
      const proef = Object.fromEntries(sleutels.map((k) => [k, k === 'code' ? 'proef' : 1]));
      return Object.entries(scrubContext(proef))
        .filter(([, waarde]) => waarde === REDACTED)
        .map(([sleutel]) => sleutel);
    });

    expect(weggelaten, 'deze sleutel komt niet in Sentry aan').toEqual([]);
  });
});
