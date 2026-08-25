import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `edge-tijd.test.ts`.
import {
  beoordeelAntwoorden,
  beoordeelManifest,
  padVan,
} from '../../scripts/pwa-controle.mjs';

/**
 * De ijking van `npm run pwa:controle`.
 *
 * ⚠️ **De netwerkhelft is hier alleen door deze test bewezen.** Deze werkplek kan
 *    `goalbuddies.q-projects.tech` niet bereiken — de agent-proxy geeft 403 op de
 *    CONNECT-tunnel — dus `beoordeelAntwoorden()` is nooit tegen de echte site
 *    gedraaid. Daarom staat hij als pure functie los van `fetch`: zo is elk geval
 *    hier te voeden, inclusief de gevallen die je op een goede dag nooit ziet.
 */

const MANIFEST = {
  id: '/',
  start_url: '/',
  scope: '/',
  icons: [{ src: '/icon-192.png' }],
};

describe('padVan — het onderscheid waar de hele bevinding om draait', () => {
  it('een subdomein met eigen documentroot levert geen pad op', () => {
    // ⚠️ `public_html/goalbuddies` is het pad op de schíjf; het adres is een
    //    subdomein. Dat verschil is precies wat de meting van 25-08 fout las.
    expect(padVan('https://goalbuddies.q-projects.tech')).toBe('');
    expect(padVan('https://goalbuddies.q-projects.tech/')).toBe('');
  });

  it('een app onder een pad levert dat pad op', () => {
    expect(padVan('https://q-projects.tech/goalbuddies')).toBe('/goalbuddies');
    expect(padVan('https://q-projects.tech/goalbuddies/')).toBe('/goalbuddies');
  });

  it('onzin is geen pad', () => {
    expect(padVan('niet-een-url')).toBeNull();
  });
});

describe('wat de controle moet vinden', () => {
  it('een manifest in de root terwijl de app onder een pad draait', () => {
    // Dit is de bevinding zelf, in zijn oorspronkelijke vorm.
    const fouten = beoordeelManifest({
      manifest: MANIFEST,
      appUrl: 'https://q-projects.tech/goalbuddies',
    });

    expect(fouten).toHaveLength(4); // start_url, scope, id en het icoon
    expect(fouten.join(' ')).toContain('/goalbuddies/');
  });

  it('een ontbrekende sleutel', () => {
    const fouten = beoordeelManifest({
      manifest: { start_url: '/', scope: '/' },
      appUrl: 'https://goalbuddies.q-projects.tech',
    });

    expect(fouten).toEqual(['`id` ontbreekt in het manifest.']);
  });

  it('een absoluut icoon buiten de scope', () => {
    const fouten = beoordeelManifest({
      manifest: { ...MANIFEST, id: '/app/', start_url: '/app/', scope: '/app/', icons: [{ src: '/icon.png' }] },
      appUrl: 'https://q-projects.tech/app',
    });

    expect(fouten).toEqual(['icoon "/icon.png" is absoluut en valt buiten "/app/".']);
  });
});

describe('wat hij met rust moet laten', () => {
  it('de stand van vandaag: root-manifest op een eigen subdomein', () => {
    expect(
      beoordeelManifest({ manifest: MANIFEST, appUrl: 'https://goalbuddies.q-projects.tech' }),
    ).toEqual([]);
  });

  it('een app onder een pad met een manifest dat meeverhuisd is', () => {
    const fouten = beoordeelManifest({
      manifest: {
        id: '/goalbuddies/',
        start_url: '/goalbuddies/',
        scope: '/goalbuddies/',
        icons: [{ src: '/goalbuddies/icon-192.png' }, { src: 'icon-512.png' }],
      },
      appUrl: 'https://q-projects.tech/goalbuddies',
    });

    expect(fouten).toEqual([]);
  });
});

describe('wat de server na een deploy moet zeggen', () => {
  const goed = [
    { pad: '/manifest.json', status: 200, contentType: 'application/manifest+json' },
    { pad: '/sw.js', status: 200, contentType: 'application/javascript; charset=utf-8' },
  ];

  it('twee keer 200 met het juiste type is goed', () => {
    expect(beoordeelAntwoorden(goed)).toEqual([]);
  });

  it('een 404 op de servicewormer', () => {
    const fouten = beoordeelAntwoorden([goed[0]!, { pad: '/sw.js', status: 404 }]);

    expect(fouten).toEqual(['/sw.js gaf 404 in plaats van 200.']);
  });

  it('een 200 met het verkeerde content-type', () => {
    // ⚠️ Dit is het geval waar de hele netwerkcontrole voor bestaat. Apache
    //    serveert een onbekende extensie als octet-stream, de browser weigert de
    //    registratie, en er gaat niets zichtbaars stuk behalve de meldingen.
    const fouten = beoordeelAntwoorden([
      goed[0]!,
      { pad: '/sw.js', status: 200, contentType: 'application/octet-stream' },
    ]);

    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toContain('octet-stream');
  });

  it('een pad dat helemaal niet opgevraagd is, telt als fout', () => {
    // Anders bewijst een lege lijst "alles goed", en dat is de vorm van een
    // controle die nul meldt omdat hij nergens keek.
    expect(beoordeelAntwoorden([])).toHaveLength(2);
  });
});
