import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');

/**
 * Een weggelegde bevinding zegt wanneer hij terugkomt — en dit merkt dat op.
 *
 * ⚠️ **QS8-123 heeft de helft van dit probleem opgelost, en dit is de andere
 *    helft.** Elke Laag-rij in `docs/ENGINEER-REVIEW.md` draagt de zin
 *    `**Wordt zwaarder als:** …`, en `review:controle` wordt rood zodra er een
 *    zonder staat. Dat bewaakt dat de voorwaarde **opgeschreven** is.
 *
 *    Niets bewaakte of hij **ingetreden** is. Dat hing aan een mens die zich de
 *    zin herinnert op het moment dat de wereld verandert — en dat is precies de
 *    vorm die in dit project stil verrot: waar op het moment van schrijven, en
 *    vanzelf onwaar wordend zonder dat er iets rood van gaat. Zie de
 *    prijsconstante van QS8-187 en de zin over de weekpasvoorraad van QS8-204.
 *
 * ⚠️ **Alleen voorwaarden die mechanisch te toetsen zijn.** *"Er zijn echte
 *    gebruikers"* staat niet in dit register en hoort er niet in: die is van
 *    buiten de repo en zou hier een vinkje worden zonder meting. Wat hier hoort,
 *    is een voorwaarde waarvan de code zelf kan zien dat hij vervuld is.
 *
 * ⚠️ **Rood is hier goed nieuws.** Wordt deze suite rood, dan is er niets kapot —
 *    dan is de wereld veranderd en hoort iemand de rij te herwegen. De melding
 *    zegt welke rij, welke voorwaarde en wat het gevolg is.
 *
 * IJKING — met de hand, 10-09-2026. Eén mutatie per grendel:
 *
 *   A  `eas.json` aanmaken in de repowortel
 *      -> 1 rood: 'QS8-179 … de voorwaarde is niet ingetreden', met de rij en
 *         het gevolg in de melding
 *   B  `eas-cli` aan `devDependencies` toevoegen zónder `eas.json`
 *      -> 1 rood: dezelfde test. Twee onafhankelijke sporen, want een
 *         EAS-project begint niet altijd met dat bestand
 */

/**
 * Ziet de repo een native build?
 *
 * ⚠️ **`app.json` telt niet mee, en dat is de belangrijkste regel hier.** Die
 *    staat er vanaf dag één — het is de Expo-configuratie van een webbundel. Zou
 *    hij meetellen, dan staat deze test vanaf zijn eerste dag rood en leert
 *    iedereen hem uit te zetten.
 */
export function nativeBouwAanwezig({
  paden,
  deps,
}: {
  readonly paden: readonly string[];
  readonly deps: readonly string[];
}): boolean {
  const bestanden = ['eas.json', 'ios', 'android'];
  const pakketten = ['eas-cli', 'expo-dev-client'];

  return paden.some((p) => bestanden.includes(p)) || deps.some((d) => pakketten.includes(d));
}

/**
 * De weggelegde bevindingen waarvan de voorwaarde te meten is.
 *
 * ⚠️ Een gevolg en geen vinkje. Wie hier een rij neerzet zonder op te schrijven
 *    wát er dan opnieuw gewogen moet worden, heeft de controle beantwoord in
 *    plaats van de vraag.
 */
const VOORWAARDEN = [
  {
    rij: 'QS8-179 — geen native crash-rapportage (26-08-2026, Laag)',
    voorwaarde: 'er komt een EAS-project en de app draait op een echt toestel',
    gevolg:
      'vanaf dat moment is er een native helft die daadwerkelijk uitgevoerd wordt, ' +
      'en die kan een JS-laag per definitie niet zien. De SDK-afweging uit ' +
      'docs/decisions/2026-08-26-sentry-in-de-app.md is dan opnieuw open; inruilen ' +
      'is één setErrorSink().',
    ingetreden: () =>
      nativeBouwAanwezig({
        paden: ['eas.json', 'ios', 'android'].filter((p) => existsSync(join(WORTEL, p))),
        deps: Object.keys({
          ...(JSON.parse(readFileSync(join(WORTEL, 'package.json'), 'utf8')).dependencies ?? {}),
          ...(JSON.parse(readFileSync(join(WORTEL, 'package.json'), 'utf8')).devDependencies ?? {}),
        }),
      }),
  },
] as const;

describe('een weggelegde bevinding merkt op dat zijn voorwaarde intreedt', () => {
  for (const v of VOORWAARDEN) {
    it(`${v.rij} — de voorwaarde is niet ingetreden`, () => {
      expect(
        v.ingetreden(),
        `De voorwaarde is ingetreden: ${v.voorwaarde}.\n\n${v.gevolg}\n\n` +
          'Herweeg de rij in docs/ENGINEER-REVIEW.md en haal hem hier weg zodra dat gedaan is.',
      ).toBe(false);
    });
  }

  it('elke rij zegt wat er dan opnieuw gewogen moet worden', () => {
    for (const v of VOORWAARDEN) {
      expect(v.gevolg.length, `${v.rij} heeft geen gevolg`).toBeGreaterThan(80);
    }
  });
});

describe('nativeBouwAanwezig — de vormen die hij moet raken', () => {
  it('ziet eas.json', () => {
    expect(nativeBouwAanwezig({ paden: ['eas.json'], deps: [] })).toBe(true);
  });

  it('ziet een native map', () => {
    expect(nativeBouwAanwezig({ paden: ['ios'], deps: [] })).toBe(true);
    expect(nativeBouwAanwezig({ paden: ['android'], deps: [] })).toBe(true);
  });

  /** ⚠️ Een EAS-project begint niet altijd met dat bestand. */
  it('ziet eas-cli of expo-dev-client in de afhankelijkheden', () => {
    expect(nativeBouwAanwezig({ paden: [], deps: ['eas-cli'] })).toBe(true);
    expect(nativeBouwAanwezig({ paden: [], deps: ['expo-dev-client'] })).toBe(true);
  });
});

describe('nativeBouwAanwezig — de vormen die hij met rust moet laten', () => {
  /** ⚠️ De belangrijkste must-allow: `app.json` is de webconfiguratie. */
  it('trapt niet in app.json', () => {
    expect(nativeBouwAanwezig({ paden: ['app.json'], deps: [] })).toBe(false);
  });

  it('trapt niet in expo zelf', () => {
    expect(nativeBouwAanwezig({ paden: [], deps: ['expo', 'expo-router', 'react-native'] })).toBe(
      false,
    );
  });

  it('meldt niets bij een lege repo', () => {
    expect(nativeBouwAanwezig({ paden: [], deps: [] })).toBe(false);
  });
});
