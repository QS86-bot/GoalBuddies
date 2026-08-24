/**
 * De PWA-belofte waar push op iOS aan hangt — QS8-117.
 *
 * ⚠️ **Waarom deze test bestaat.** Safari levert geen meldingen aan een gewoon
 *    tabblad. Op iPhone en iPad werkt web push uitsluitend als de site via
 *    *Deel → Zet op beginscherm* is toegevoegd, en dat kán alleen met een geldig
 *    manifest, `display: standalone`, en een `apple-touch-icon` — iOS gebruikt
 *    het manifest-icoon níét voor de tegel op het beginscherm.
 *
 *    Gaat daar iets stuk, dan blijft de app werken, blijft de build groen, en
 *    stopt alleen de push op de helft van de telefoons. QS8-117 noemt dat
 *    zelf: *"precies het soort verschil dat niets zichtbaars stukmaakt behalve
 *    meldingen."* Dat is de reden om het te toetsen in plaats van het op te
 *    schrijven.
 *
 * ⚠️ **Getoetst op de bron en niet op** `dist/`. De export vraagt een volle
 *    `expo export` van tientallen seconden, en dat hoort niet in een suite die
 *    bij elke wijziging draait. Wat hier staat is het contract: het manifest,
 *    de bestanden waar het naar wijst, en de koptags in `+html.tsx`. Op 24-08 is
 *    één keer met een echte export nagelopen dat Expo dit alles ongewijzigd in
 *    `dist/` zet, in élke geëxporteerde route.
 *
 * ⚠️ Wat deze test **niet** kan bewijzen is het laatste acceptatiecriterium van
 *    QS8-117: één echte melding op een iPhone met de app op het beginscherm. Dat
 *    vraagt een fysiek toestel met iOS 16.4+; de simulator levert geen push.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Rechtstreeks uit `tokens.ts` en niet via `shared/theme`: die barrel
// re-exporteert `ThemeProvider` en trekt daarmee React Native mee in een test
// die in Node draait. Zelfde reden als in `tests/rls/epic7.test.ts`.
import { navy } from '../../src/shared/theme/tokens';

const WORTEL = join(import.meta.dirname, '..', '..');
const PUBLIEK = join(WORTEL, 'public');

interface Icoon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose?: string;
}

interface Manifest {
  readonly name: string;
  readonly short_name: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: string;
  readonly theme_color: string;
  readonly background_color: string;
  readonly icons: readonly Icoon[];
}

const manifest = JSON.parse(readFileSync(join(PUBLIEK, 'manifest.json'), 'utf8')) as Manifest;
const html = readFileSync(join(WORTEL, 'app', '+html.tsx'), 'utf8');

/** De echte afmetingen uit de PNG-kop, niet wat het manifest bewéért. */
function afmetingen(bestand: string): { breedte: number; hoogte: number } {
  const kop = readFileSync(join(PUBLIEK, bestand)).subarray(0, 24);

  expect(kop.subarray(0, 8).toString('hex'), `${bestand} is geen PNG`).toBe('89504e470d0a1a0a');

  return { breedte: kop.readUInt32BE(16), hoogte: kop.readUInt32BE(20) };
}

describe('het manifest maakt de app installeerbaar', () => {
  it('staat standalone, in de root', () => {
    // ⚠️ `display: standalone` is de hele voorwaarde op iOS. Zet iemand dit op
    //    `browser`, dan opent de tegel gewoon Safari en is er geen push.
    expect(manifest.display).toBe('standalone');

    // ⚠️ Root en niet een submap. Een service worker bedient alleen zijn eigen
    //    map: onder `/goalbuddies/` kan hij `/` niet meer bedienen en klopt geen
    //    van de absolute paden hieronder. Zie `docs/DEPLOY.md`.
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
  });

  it('heeft een naam die op een beginscherm past', () => {
    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.short_name.length).toBeGreaterThan(0);

    // iOS kapt de tegelnaam af rond twaalf tekens. Langer is niet fout, maar dan
    // is `short_name` geen korte naam meer en heeft hij geen functie.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });
});

describe('de iconen bestaan echt en hebben de maat die ze beloven', () => {
  it.each(
    // Het manifest is de bron; de test loopt erlangs in plaats van een tweede
    // lijst te onderhouden die ernaast kan gaan lopen.
    JSON.parse(readFileSync(join(PUBLIEK, 'manifest.json'), 'utf8')).icons as readonly Icoon[],
  )('$src is $sizes', (icoon) => {
    const bestand = icoon.src.replace(/^\//, '');

    expect(statSync(join(PUBLIEK, bestand)).isFile()).toBe(true);

    const [breed, hoog] = icoon.sizes.split('x').map(Number);
    expect(afmetingen(bestand)).toEqual({ breedte: breed, hoogte: hoog });
  });

  it('dekt de twee maten die een installatie nodig heeft, plus een maskable', () => {
    const maten = manifest.icons.map((i) => i.sizes);

    expect(maten).toContain('192x192');
    expect(maten).toContain('512x512');
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('heeft een apple-touch-icon van precies 180x180', () => {
    // ⚠️ iOS leest het manifest-icoon niet voor de tegel op het beginscherm.
    //    Ontbreekt dit bestand, dan zet het toestel een schermafdruk neer — en
    //    dat is het eerste wat iemand van deze app ziet.
    expect(afmetingen('apple-touch-icon.png')).toEqual({ breedte: 180, hoogte: 180 });
  });
});

describe('de HTML-kop wijst naar wat er staat', () => {
  it('linkt het manifest en het apple-touch-icon', () => {
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('href="/manifest.json"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('href="/apple-touch-icon.png"');
  });

  it('draagt de iOS-schakelaars voor oudere toestellen', () => {
    // Het manifest is sinds iOS 16.4 leidend, maar oudere toestellen kijken
    // hier nog naar en het kost niets.
    expect(html).toContain('name="apple-mobile-web-app-capable"');
    expect(html).toContain('name="apple-mobile-web-app-title"');
  });

  it('gebruikt overal dezelfde navy als het thema', () => {
    // ⚠️ `+html.tsx` zegt zelf dat dit de énige plek is waar een kleur hard in
    //    de code mag staan: het besturingssysteem leest `theme_color` vóórdat er
    //    één regel JavaScript draait. Deze test maakt van die uitzondering een
    //    afspraak — anders loopt de opstartkleur ooit stil uit de pas met het
    //    thema, en zie je dat alleen op het splash-scherm van een telefoon.
    expect(manifest.theme_color).toBe(navy.bg);
    expect(manifest.background_color).toBe(navy.bg);
    expect(html).toContain(`content="${navy.bg}"`);
  });
});

describe('de service worker staat waar de registratie hem zoekt', () => {
  it('staat als sw.js in de root van public', () => {
    // `maakWebPushBron()` registreert `/sw.js`. Verhuist dit bestand naar een
    // submap, dan is zijn scope die submap en ontvangt de app niets meer.
    expect(statSync(join(PUBLIEK, 'sw.js')).isFile()).toBe(true);
    expect(readFileSync(join(PUBLIEK, 'sw.js'), 'utf8')).toContain('push');
  });
});
