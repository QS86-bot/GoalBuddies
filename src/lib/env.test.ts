import { describe, expect, it } from 'vitest';

import { sentryOmgevingUit } from './env';

/**
 * IJking van de Sentry-omgeving — QS8-24, stap 2 van 30-08-2026.
 *
 * ⚠️ **De belofte die hier bewaakt wordt.** Sinds de DSN een standaard in
 *    `env.ts` heeft, rapporteert élke omgeving naar hetzelfde Sentry-project.
 *    Dat was de hele bedoeling — de DSN is geen secret en hem in één `.env` op
 *    één laptop houden was precies de reden dat er in vier dagen nooit een fout
 *    aankwam. Maar het levert een nieuw risico op: een fout uit `npm run dev` en
 *    een fout uit productie zijn dan niet uit elkaar te houden, en dan is de
 *    eerste echte productiefout zoek tussen het geknoei van de ontwikkelaar.
 *
 *    `environment` is het veld dat dat onderscheid draagt. Deze suite bewaakt
 *    dus niet "de functie geeft een string terug" maar: **productie is
 *    herkenbaar, en al het andere is dat óók.**
 *
 * ⚠️ Met de hand rood gemaakt door de functie altijd `'production'` te laten
 *    teruggeven: dan valt `noemt een ontwikkelbuild niet production` om. En door
 *    de expliciete waarde te negeren: dan vallen de twee overschrijftests om.
 */

describe('sentryOmgevingUit', () => {
  it('noemt een productiebuild production', () => {
    expect(sentryOmgevingUit(undefined, 'production')).toBe('production');
  });

  /**
   * ⚠️ **De belangrijkste van de suite.** Zou dit `'production'` opleveren, dan
   *    is het onderscheid weg en is de standaard-DSN een verslechtering in
   *    plaats van een verbetering.
   */
  it.each([
    ['development', 'development'],
    ['test', 'test'],
  ])('noemt %s niet production', (nodeEnv, verwacht) => {
    expect(sentryOmgevingUit(undefined, nodeEnv)).toBe(verwacht);
  });

  /**
   * ⚠️ Een onbekende of ontbrekende `NODE_ENV` is géén productie. Andersom
   *    raden zou een lokale run tussen de echte fouten zetten, en dat is de
   *    fout die je pas merkt als je hem al een week maakt.
   */
  it('valt bij een onbekende NODE_ENV terug op development', () => {
    expect(sentryOmgevingUit(undefined, undefined)).toBe('development');
  });

  it('houdt een eigen naam aan als die er is', () => {
    expect(sentryOmgevingUit('acceptatie', 'production')).toBe('acceptatie');
  });

  /** Een expliciete waarde wint ook van een lege NODE_ENV. */
  it('laat de expliciete waarde altijd winnen', () => {
    expect(sentryOmgevingUit('canary', undefined)).toBe('canary');
  });

  /** Witruimte is geen waarde; anders krijg je een omgeving die ' ' heet. */
  it.each([
    ['leeg', ''],
    ['alleen witruimte', '   '],
  ])('negeert een %s expliciete waarde', (_naam, expliciet) => {
    expect(sentryOmgevingUit(expliciet, 'production')).toBe('production');
  });

  it('trimt de expliciete waarde', () => {
    expect(sentryOmgevingUit('  acceptatie  ', 'production')).toBe('acceptatie');
  });
});
