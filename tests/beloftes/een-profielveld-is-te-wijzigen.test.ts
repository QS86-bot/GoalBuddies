import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');
const PROFIELTAB = join(WORTEL, 'app', '(tabs)', 'profiel.tsx');
const ONBOARDING = join(WORTEL, 'app', 'onboarding', 'profiel.tsx');

/**
 * Wat een ander van je ziet, kun je zelf wijzigen — QS8-473.
 *
 * ⚠️ **De belofte is niet "er staat een naamveld op het profielscherm".** Dat is
 *    een eigenschap van het onderdeel, en hij blijft kloppen terwijl de belofte
 *    breekt: een veld dat niets schrijft voldoet eraan. De belofte is dat elk
 *    profielveld dat *een ander te zien krijgt* door de eigenaar te wijzigen is
 *    **zonder de onboarding over te doen** — en dat laatste is precies wat er
 *    misging.
 *
 * ⚠️ **Waarom dit niet vanzelf rood werd.** `display_name` had een schema, een
 *    validatie, een normalisatie in twee talen (`schoneNaam()` en `schone_naam()`
 *    uit 0256), een CHECK in de database, een RLS-test en twee vertalingen. Er
 *    was niets kapot. Het enige invoerveld stond op een scherm dat je één keer
 *    ziet. Onwrikbare regel 18, vraag 5: elk schakeltje af, de keten nergens
 *    verbonden — en daar wordt per definitie geen enkele test rood van.
 *
 * ⚠️ **De onboarding telt niet mee, en dat is de hele grendel.** Zou deze toets
 *    "ergens in `app/` wordt `display_name` geschreven" luiden, dan was hij
 *    groen op de dag dat het issue geschreven werd. Het register hieronder
 *    noemt daarom expliciet het scherm waar de gebruiker *terug kan komen*.
 */

/**
 * De velden die je bezit en die een ander te zien krijgt — `profiles_select`
 * deelt precies deze twee met wie een groep met je deelt.
 *
 * ⚠️ **Een rij erbij is geen onderhoud maar het punt.** Komt er een derde veld
 *    dat groepsgenoten zien, dan hoort de vraag "en kan de eigenaar het
 *    wijzigen" er meteen bij — niet drie maanden later als klacht.
 */
/**
 * ⚠️ **De patronen eisen een identifier ná de dubbele punt, en dat is een
 *    ijkbevinding en geen netheid.** `/display_name:/` leek te werken en was
 *    blind: `app/onboarding/profiel.tsx` noemt `display_name: ''` in een
 *    **comment** op regel 50, dus de must-allow-helft hieronder bleef groen
 *    toen de échte schrijfregel weggehaald werd. Een grendel die op prozatekst
 *    matcht, bewaakt vanaf dat moment de proza. Zelfde klasse als QS8-412.
 *
 *    Geen comment-knipper ervoor: die is zélf een grendel en was in QS8-412 in
 *    twee bestanden blind voor `//` in een URL. Een patroon dat niet in proza
 *    kán voorkomen is hier het kortere pad.
 */
const GEDEELDE_VELDEN = [
  {
    veld: 'display_name',
    /** Hoe je ziet dát dit scherm hem schrijft. */
    schrijft: /display_name:\s*[A-Za-z_$]/,
    reden: 'profiles_select deelt display_name met elke groepsgenoot',
  },
  {
    veld: 'avatar_url',
    // Het schrijfpad loopt via `useAvatarKeuze()` (QS8-196), niet via een
    // letterlijke kolomnaam op dit scherm. De belofte is dezelfde.
    schrijft: /<Avatarkaart\b/,
    reden: 'profiles_select deelt avatar_url met elke groepsgenoot',
  },
] as const;

describe('elk gedeeld profielveld is te wijzigen zonder de onboarding over te doen', () => {
  it('vindt beide schermen — anders bewaakt de rest hier niets', () => {
    expect(
      () => statSync(PROFIELTAB),
      'app/(tabs)/profiel.tsx is verdwenen of hernoemd — verhuis deze grendel mee',
    ).not.toThrow();
    expect(
      () => statSync(ONBOARDING),
      'app/onboarding/profiel.tsx is verdwenen of hernoemd — verhuis deze grendel mee',
    ).not.toThrow();
  });

  it.each(GEDEELDE_VELDEN)('$veld is te wijzigen op het profieltabblad', ({ schrijft, reden }) => {
    const bron = readFileSync(PROFIELTAB, 'utf8');

    expect(
      schrijft.test(bron),
      `${reden} — maar het profieltabblad heeft er geen schrijfpad voor, dus je kunt het na de onboarding niet meer rechtzetten`,
    ).toBe(true);
  });

  /**
   * ⚠️ **De must-allow-helft.** Zonder deze toets is de bovenstaande te
   *    bevredigen door de onboarding leeg te trekken, en dan meet hij niets meer
   *    over de vraag die het issue stelde. De onboarding mág de naam blijven
   *    vragen; wat niet mag is dat hij de énige plek is.
   */
  it('laat de onboarding de naam gewoon blijven vragen', () => {
    const bron = readFileSync(ONBOARDING, 'utf8');

    expect(bron, 'de onboarding vraagt de naam niet meer — dan is dit een andere fout').toMatch(
      /display_name:\s*[A-Za-z_$]/,
    );
  });
});

/**
 * De teller onder het naamveld telt in codepunten — QS8-118, en hier opnieuw.
 *
 * ⚠️ **Een teller in een andere eenheid dan de grens is een nieuwe fout en geen
 *    reparatie.** `char_length` in Postgres telt codepunten en `.length` telt
 *    UTF-16-eenheden; een naam van tachtig emoji is er honderdzestig. Zou de
 *    teller `.length` gebruiken, dan zegt hij `160/80` over een naam die de
 *    database moeiteloos aanneemt.
 *
 * ⚠️ Dit toetst de **eenheid** en niet de plek: verhuist het naamveld naar een
 *    eigen bestand, dan hoort deze grendel mee te verhuizen en zegt de melding
 *    dat ook.
 */
describe('de naamteller telt in de eenheid van de grens', () => {
  it('gebruikt telTekens() en niet .length', () => {
    const bron = readFileSync(PROFIELTAB, 'utf8');

    const naamkaart = bron.slice(bron.indexOf('function Naamkaart'));
    expect(
      naamkaart,
      'function Naamkaart staat niet meer in app/(tabs)/profiel.tsx — verhuis deze grendel mee',
    ).not.toBe('');

    const tot = naamkaart.indexOf('\n}\n');
    const lichaam = tot > -1 ? naamkaart.slice(0, tot) : naamkaart;

    expect(lichaam, 'de naamteller moet telTekens() gebruiken').toMatch(/telTekens\(/);
    expect(
      /\.length\b/.test(lichaam),
      'de naamteller telt in UTF-16-eenheden en de database in codepunten',
    ).toBe(false);
  });
});
