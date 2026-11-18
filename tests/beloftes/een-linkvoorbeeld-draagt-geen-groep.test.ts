/**
 * De belofte van QS8-706: **een linkvoorbeeld toont het logo en een algemene
 * zin, en nooit iets over een groep of een persoon.**
 *
 * ⚠️ Waarom een eigen belofte. De crawler van WhatsApp of een mailprovider haalt
 *    de pagina op, leest de metatags en cachet het resultaat — publiek, voor
 *    iedereen die de link ooit ontvangt, en niet meer terug te halen. De
 *    uitnodigingslink draagt de code; wat de pagina erbij zegt mag dus niets
 *    over de groep zijn (domeinregel 7 en 4).
 *
 * ⚠️ Wat hier getoetst wordt is de naad: de tags komen uit één functie die alleen
 *    het adres van de app kent, de tekst komt uit de catalogus zonder
 *    invulplek, en `app/+html.tsx` bouwt zelf geen tag erbij. Elk van die vier
 *    is een eigen grendel met een eigen ijking (zie het commit-bericht).
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { en } from '../../src/shared/i18n/en';
import { nl } from '../../src/shared/i18n/nl';
import { LOGO_PAD, linkvoorbeeldTags } from '../../src/shared/web/linkvoorbeeld';
import { uitnodigingsBericht } from '../../src/modules/buddies/samen';

const APP = 'https://goalbuddies.q-projects.tech';
const lees = (pad: string) => readFileSync(new URL(`../../${pad}`, import.meta.url), 'utf8');

describe('linkvoorbeeldTags', () => {
  const tags = linkvoorbeeldTags(APP);

  it('is een functie van het adres en van niets anders (grendel 1)', () => {
    // Een tweede parameter is de weg waarlangs een groepsgegeven naar binnen kan.
    // `.length` telt een parameter met standaardwaarde niet mee (gemeten bij de
    // ijking), dus de handtekening wordt uit de bron gelezen.
    expect(linkvoorbeeldTags.length).toBe(1);
    expect(lees('src/shared/web/linkvoorbeeld.ts')).toMatch(
      /export function linkvoorbeeldTags\(appUrl: string\)/,
    );
  });

  it('draagt alleen logo, titel en algemene beschrijving (grendel 2)', () => {
    const toegestaan = new Set<string>([
      'website',
      nl['linkvoorbeeld.titel'],
      nl['linkvoorbeeld.beschrijving'],
      `${APP}${LOGO_PAD}`,
      '512',
      'summary',
    ]);
    const vreemd = tags.filter((tag) => !toegestaan.has(tag.inhoud));
    expect(vreemd).toEqual([]);
  });

  it('heeft og:image als absoluut adres op het adres van de app', () => {
    const logo = tags.find((tag) => tag.sleutel === 'og:image');
    expect(logo?.inhoud).toBe(`${APP}/icon-512.png`);
    expect(tags.find((tag) => tag.sleutel === 'twitter:image')?.inhoud).toBe(logo?.inhoud);
  });

  it('volgt het adres uit de omgeving en niet een vaste waarde', () => {
    const test = linkvoorbeeldTags('https://test.example/');
    expect(test.find((tag) => tag.sleutel === 'og:image')?.inhoud).toBe(
      'https://test.example/icon-512.png',
    );
  });

  it('heeft in nl en en een tekst zonder invulplek (grendel 3)', () => {
    for (const catalogus of [nl, en] as const) {
      for (const sleutel of ['linkvoorbeeld.titel', 'linkvoorbeeld.beschrijving'] as const) {
        expect(catalogus[sleutel]).not.toMatch(/\{[^}]*\}/);
      }
    }
  });
});

describe('de naad tussen de tags en de webexport', () => {
  it('bouwt app/+html.tsx geen eigen og- of twitter-tag (grendel 4)', () => {
    const html = lees('app/+html.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(html).toContain('linkvoorbeeldTags(');
    expect(html).not.toMatch(/og:|twitter:/);
  });

  it('importeert linkvoorbeeld.ts niets dat een groep kan kennen (grendel 5)', () => {
    const bron = lees('src/shared/web/linkvoorbeeld.ts');
    const imports = [...bron.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    expect(imports).toEqual(['../i18n/nl']);
  });
});

describe('uitnodigingsBericht', () => {
  it('noemt de afzender, de app en de link, en geen groep', () => {
    const b = uitnodigingsBericht(`${APP}/uitnodiging/ABC`, 'Quinten');
    expect(b.tekst).toContain('Quinten');
    expect(b.tekst).toContain('GoalBuddies');
    expect(b.tekst).toContain(`${APP}/uitnodiging/ABC`);
    expect(b.onderwerp).toContain('GoalBuddies');
  });

  it('valt netjes terug zonder weergavenaam', () => {
    for (const naam of [null, undefined, '', '   ']) {
      const b = uitnodigingsBericht(`${APP}/uitnodiging/ABC`, naam);
      expect(b.tekst).not.toContain('{');
      expect(b.tekst).toContain(`${APP}/uitnodiging/ABC`);
      expect(b.onderwerp).toBe(nl['delen.uitnodiging_onderwerp_zonder_naam']);
    }
  });

  it('heeft in beide talen dezelfde invulplekken', () => {
    const plekken = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const sleutel of [
      'delen.uitnodiging_onderwerp',
      'delen.uitnodiging_onderwerp_zonder_naam',
      'delen.uitnodiging_tekst',
      'delen.uitnodiging_tekst_zonder_naam',
    ] as const) {
      expect(plekken(en[sleutel])).toEqual(plekken(nl[sleutel]));
    }
  });
});
