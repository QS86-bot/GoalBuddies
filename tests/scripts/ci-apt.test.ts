import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const CI = join(__dirname, '..', '..', '.github', 'workflows', 'ci.yml');

/**
 * Een derde partij mag `main` niet rood maken — QS8-400.
 *
 * ⚠️ **Wat er gebeurde.** `apt-get update` ververst élke APT-bron die op de
 *    runnerimage staat, ook die van derden waar deze CI niets van nodig heeft,
 *    en eindigt met exitcode 100 zodra er één inconsistent is. 📏 Op 09-09-2026
 *    gaf `dl.google.com` een `Packages.gz` van 09:41 bij een `Release` van
 *    17:16, en `main` stond rood na een merge waarvan de diff uit drie
 *    `.md`-bestanden, een script en een test bestond.
 *
 *    Bij een herstart kwam **bytegelijk dezelfde** foutmelding terug. Het was
 *    dus geen hapering die overwaait; wachten had niet geholpen.
 *
 * ⚠️⚠️ **De belofte is een verschil tussen twee regels, en dat is precies wat
 *    een volgende bewerking plat kan strijken.** Het verversen mag mislukken —
 *    APT gaat dan door met de indexen die hij al had. Het *installeren* mag dat
 *    niet: dat is de vraag die ertoe doet. Zet iemand `|| true` achter de
 *    installatie, dan draait de RLS-suite zonder `psql` en meldt de fout zich
 *    ergens verderop als iets anders — of helemaal niet.
 *
 *    Daarom toetst dit bestand beide regels apart, en niet "er staat ergens een
 *    `|| true`".
 *
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel:
 *
 *   A  `|| true` weg bij `update`                       → 1 rood
 *   B  `|| true` erbij achter `install`                 → 1 rood
 *   C  de hele stap uit `ci.yml`                        → 2 rood
 */

interface AptStap {
  readonly update: string | null;
  readonly install: string | null;
}

/**
 * De twee `apt-get`-regels uit een workflow, los.
 *
 * ⚠️ Commentaarregels eruit vóór er gezocht wordt: de kop van deze stap noemt
 *    `apt-get update` in zijn uitleg, en een controle die zijn eigen toelichting
 *    meeleest, meet de toelichting.
 */
function aptRegels(yaml: string): AptStap {
  const regels = yaml
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => !r.startsWith('#'));

  return {
    update: regels.find((r) => r.includes('apt-get update')) ?? null,
    install: regels.find((r) => r.includes('apt-get install')) ?? null,
  };
}

describe('aptRegels — de twee regels los', () => {
  it('vindt ze allebei', () => {
    const uit = aptRegels(['          sudo apt-get update -qq || true', '          sudo apt-get install -y foo'].join('\n'));

    expect(uit.update).toContain('|| true');
    expect(uit.install).not.toContain('|| true');
  });

  it('leest de uitleg in commentaar niet mee', () => {
    // ⚠️ De vorm die deze controle zou laten liegen: de kop van de stap noemt
    //    `apt-get update` zónder `|| true`, en dat is gewoon proza.
    const uit = aptRegels(
      ['          # apt-get update ververst élke bron', '          sudo apt-get update -qq || true'].join('\n'),
    );

    expect(uit.update).toBe('sudo apt-get update -qq || true');
  });

  it('geeft null als de stap er niet is', () => {
    expect(aptRegels('geen apt hier')).toEqual({ update: null, install: null });
  });
});

describe('ci.yml laat een derde partij main niet rood maken', () => {
  const uit = aptRegels(readFileSync(CI, 'utf8'));

  /**
   * ⚠️ **Grendel 1.** Zonder dit valt de hele run om zodra één APT-bron van een
   *    derde partij een inconsistente index serveert — en dat is niet iets wat
   *    deze repo kan repareren of afwachten.
   */
  it('laat het verversen mislukken zonder de stap te laten vallen', () => {
    expect(uit.update, 'de apt-get-update-regel is uit ci.yml verdwenen').not.toBeNull();
    expect(
      uit.update,
      'zonder `|| true` maakt een kapotte APT-bron van een derde partij `main` rood — QS8-400',
    ).toContain('|| true');
  });

  /**
   * ⚠️ **Grendel 2, en de belangrijkste.** Dit is de helft die géén `|| true`
   *    mag krijgen. Zonder `psql` draait de RLS-suite niet, en dat hoort luid te
   *    falen op de plek waar het misgaat.
   */
  it('laat het installeren wél hard falen', () => {
    expect(uit.install, 'de apt-get-install-regel is uit ci.yml verdwenen').not.toBeNull();
    expect(
      uit.install,
      'de installatie mag niet weggemoffeld worden: zonder psql draait de RLS-suite niet',
    ).not.toContain('|| true');
  });
});
