// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderScherm, ruimAllesOp } from '../render/scherm';

import { roeptAan, zonderCommentaar } from './roept-aan';

/**
 * Een doelstraf intrekken vraagt een tweede bevestiging — QS8-814, in de vorm van
 * QS8-799 (besluit Quinten 23-11-2026, 16:55 UTC).
 *
 * ⚠️⚠️ **De belofte is "zonder de tweede bevestiging wordt er niets geschreven", en dat
 *    wordt gemeten aan de netwerkgrens**: de Supabase-client is hier de enige mock, en
 *    de test telt of er een `update` de deur uit ging. De echte `trekStrafIn()` en de
 *    echte component draaien (regel 18 vraag 2).
 * ⚠️ **De uitstelregel staat er alleen als er een niet-ingetrokken uitstelverzoek is**,
 *    open óf beslist (optie B, en optie A van 17:16 UTC). Wat dat is, bepaalt de pure
 *    `uitstelGevraagd()`, hier per geval getoetst. De component krijgt het als
 *    `metUitstelverzoek`; de naad met het doelscherm (dat `verzoek` en `besluit`
 *    doorgeeft) wordt onderaan op de bron getoetst, want er is geen testopzet die het
 *    hele doelscherm rendert.
 *
 * IJKING — met de hand, 23-11-2026 (zie de afleverreactie op QS8-814):
 *   A  `onPress={() => setVraagt(true)}` -> `onPress={() => void bevestig()}` -> rood: 'de eerste tik'
 *   B  `<Body muted>{t('straf.intrekken_getuige')}</Body>` weggehaald -> rood: 'noemt de gevolgen'
 *   C  `metUitstelverzoek ? … : null` -> altijd tonen -> rood: 'zonder uitstelverzoek'
 *   D  `uitstelGevraagd(verzoek, besluit)` -> `uitstelGevraagd(verzoek, null)` in `app/doel/[id].tsx` -> rood: 'de naad'
 *   H  `[lopend, laatsteBesluit]` -> `[lopend]` in `uitstelGevraagd()` -> rood: 'een beslist verzoek telt'
 *   E  de tak `if (fout?.beslist === true)` weggehaald -> rood: 'na "beslist"'
 *   F  `t('straf.fout.al_afgegaan')` -> `t('belofte.fout.al_afgegaan')` in `trekStrafIn()` -> rood: 'intussen beslist'
 *   G  `<StrafIntrekken …/>` in het doelscherm terug naar een knop met `trekIn(straf.id)` -> rood: grendel 2 en 'de naad'
 *   Vóór elke mutatie: 18 van 18 groen. Elke mutatie apart, en teruggezet vóór de volgende.
 */

vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const update = vi.fn();
const rijen = { waarde: [{ id: 's1' }] as readonly { id: string }[], fout: null as null | { message: string } };
vi.mock('../../src/lib/supabase', () => ({
  supabase: () => ({
    from: () => ({
      update: (waarden: unknown) => {
        update(waarden);
        return { eq: () => ({ select: async () => (rijen.fout ? { data: null, error: rijen.fout } : { data: rijen.waarde, error: null }) }) };
      },
    }),
  }),
}));
vi.mock('../../src/lib/observability', () => ({ reportError: () => undefined }));

const { StrafIntrekken } = await import('../../src/schermen/straf');
const { uitstelGevraagd } = await import('../../src/modules/goals');
const { t } = await import('../../src/shared/i18n');
const { nl } = await import('../../src/shared/i18n/nl');
const { en } = await import('../../src/shared/i18n/en');

const onKlaar = vi.fn();
const toon = (metUitstelverzoek = false) =>
  renderScherm(() => createElement(StrafIntrekken, { strafId: 's1', metUitstelverzoek, onKlaar }));

beforeEach(() => {
  update.mockReset();
  onKlaar.mockReset();
  rijen.waarde = [{ id: 's1' }];
  rijen.fout = null;
});
afterEach(() => ruimAllesOp());

describe('een doelstraf intrekken in twee stappen', () => {
  it('de eerste tik schrijft niets en vraagt het', async () => {
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    expect(update).not.toHaveBeenCalled();
    expect(onKlaar).not.toHaveBeenCalled();
    expect(scherm.knoppen()).toContain(t('straf.intrekken_ja'));
  });

  it('de vraag noemt de gevolgen: de straf vervalt, en de getuige ziet niets', async () => {
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    expect(scherm.tekst()).toContain(t('straf.intrekken_kop'));
    expect(scherm.tekst()).toContain(t('straf.intrekken_gevolg'));
    expect(scherm.tekst()).toContain(t('straf.intrekken_getuige'));
  });

  it('"Nee" gaat terug en schrijft ook niets', async () => {
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    await scherm.klik(t('straf.intrekken_nee'));
    expect(update).not.toHaveBeenCalled();
    expect(scherm.knoppen()).toContain(t('straf.intrekken'));
    expect(scherm.knoppen()).not.toContain(t('straf.intrekken_ja'));
  });

  it('pas de tweede bevestiging trekt in, precies één keer en alleen de stand', async () => {
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    await scherm.klik(t('straf.intrekken_ja'));
    await scherm.wacht();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(onKlaar).toHaveBeenCalledTimes(1);
  });
});

type Verzoek = Parameters<typeof uitstelGevraagd>[0];
const verzoek = (status: string) => ({ id: 'v1', goal_id: 'd1', status }) as unknown as Verzoek;

describe('wanneer weet de groep via een uitstelverzoek van de straf (besluit 17:16 UTC, optie A)', () => {
  it('een open verzoek telt', () => {
    expect(uitstelGevraagd(verzoek('open'), null)).toBe(true);
  });

  it('een beslist verzoek telt, goedgekeurd of afgewezen: de RPC filtert alleen withdrawn', () => {
    expect(uitstelGevraagd(null, verzoek('approved'))).toBe(true);
    expect(uitstelGevraagd(null, verzoek('rejected'))).toBe(true);
  });

  it('een ingetrokken verzoek telt niet, en geen verzoek ook niet', () => {
    expect(uitstelGevraagd(null, verzoek('withdrawn'))).toBe(false);
    expect(uitstelGevraagd(null, null)).toBe(false);
  });
});

describe('de uitstelregel staat er alleen als er een uitstelverzoek is (optie B)', () => {
  it('met een lopend uitstelverzoek noemt de vraag de groep', async () => {
    const scherm = await toon(true);
    await scherm.klik(t('straf.intrekken'));
    expect(scherm.tekst()).toContain(t('straf.intrekken_uitstel'));
    expect(scherm.tekst()).toContain(t('straf.intrekken_getuige'));
  });

  it('zonder uitstelverzoek staat die regel er niet', async () => {
    const scherm = await toon(false);
    await scherm.klik(t('straf.intrekken'));
    expect(scherm.tekst()).not.toContain(t('straf.intrekken_uitstel'));
  });

  it('vóór de eerste tik staat hij er in geen van beide gevallen', async () => {
    const scherm = await toon(true);
    expect(scherm.tekst()).not.toContain(t('straf.intrekken_uitstel'));
  });
});

describe('de straf is intussen beslist (nul rijen)', () => {
  it('de melding zegt "intussen beslist" en niet "in werking getreden"', async () => {
    rijen.waarde = [];
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    await scherm.klik(t('straf.intrekken_ja'));
    await scherm.wacht();
    expect(scherm.tekst()).toContain(t('straf.fout.al_afgegaan'));
    expect(scherm.tekst()).not.toMatch(/Dit commitment|in werking getreden/);
    expect(onKlaar).not.toHaveBeenCalled();
  });

  it('na "beslist" verdwijnt de intrekknop en komt er "Bekijk de uitslag", die het scherm herlaadt', async () => {
    rijen.waarde = [];
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    await scherm.klik(t('straf.intrekken_ja'));
    await scherm.wacht();
    expect(scherm.knoppen()).toEqual([t('straf.intrekken_uitslag')]);
    await scherm.klik(t('straf.intrekken_uitslag'));
    expect(onKlaar).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('bij een storing blijft de intrekknop staan: opnieuw proberen heeft dan wel zin', async () => {
    rijen.fout = { message: 'netwerk' };
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    await scherm.klik(t('straf.intrekken_ja'));
    await scherm.wacht();
    expect(scherm.tekst()).toContain(t('commitment.fout.intrekken'));
    expect(scherm.knoppen()).toContain(t('straf.intrekken_ja'));
    expect(scherm.knoppen()).not.toContain(t('straf.intrekken_uitslag'));
  });
});

describe('de woorden van het besluit, in beide talen', () => {
  it('nl', () => {
    expect(nl['straf.intrekken_kop']).toBe('Je straf intrekken?');
    expect(nl['straf.intrekken_gevolg']).toBe(
      'Je straf vervalt en gaat niet meer in werking, ook niet als je je streefdatum niet haalt.',
    );
    expect(nl['straf.intrekken_getuige']).toBe(nl['belofte.intrekken_getuige']);
    expect(nl['straf.intrekken_uitstel']).toBe(
      'De groep die je om uitstel vroeg, ziet dan niet meer dat er een straf op dit doel staat.',
    );
    expect(nl['straf.intrekken_ja']).toBe('Ja, trek mijn straf in');
    expect(nl['straf.intrekken_nee']).toBe('Nee, laat haar staan');
    expect(nl['straf.intrekken_uitslag']).toBe('Bekijk de uitslag');
    expect(nl['straf.fout.al_afgegaan']).toBe('Deze straf kan niet meer worden ingetrokken: ze is intussen beslist.');
  });

  it('en', () => {
    expect(en['straf.intrekken_kop']).toBe('Withdraw your penalty?');
    expect(en['straf.intrekken_gevolg']).toBe(
      'Your penalty lapses and will not take effect, not even if you miss your target date.',
    );
    expect(en['straf.intrekken_getuige']).toBe(en['belofte.intrekken_getuige']);
    expect(en['straf.intrekken_ja']).toBe('Yes, withdraw my penalty');
    expect(en['straf.intrekken_nee']).toBe('No, keep it');
    expect(en['straf.intrekken_uitslag']).toBe('See the outcome');
    expect(en['straf.fout.al_afgegaan']).toBe(
      'This penalty can no longer be withdrawn: it has been decided in the meantime.',
    );
  });
});

const WORTEL = join(import.meta.dirname, '..', '..');
const COMPONENT = 'src/schermen/straf/StrafIntrekken.tsx';
const DOELSCHERM = 'app/doel/[id].tsx';

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) return naam === 'node_modules' ? [] : bestanden(pad);
    return /\.(ts|tsx)$/.test(naam) && !/\.test\.tsx?$/.test(naam) ? [pad] : [];
  });
}

describe('de weg naar intrekken', () => {
  it('grendel 1: trekStrafIn() wordt alleen in StrafIntrekken aangeroepen', () => {
    const aanroepers = ['app', 'src']
      .flatMap((map) => bestanden(join(WORTEL, map)))
      .map((pad) => relative(WORTEL, pad).replaceAll('\\', '/'))
      .filter((pad) => pad !== 'src/modules/commitments/api.ts')
      .filter((pad) => roeptAan(readFileSync(join(WORTEL, pad), 'utf8'), 'trekStrafIn'));
    expect(aanroepers).toEqual([COMPONENT]);
  });

  it('grendel 2: het doelscherm roept de kale trekIn() nergens aan, en toont StrafIntrekken', () => {
    const bron = zonderCommentaar(readFileSync(join(WORTEL, DOELSCHERM), 'utf8'));
    expect(roeptAan(bron, 'trekIn')).toBe(false);
    expect(bron).toMatch(/<StrafIntrekken\b/);
  });

  it('de naad: het doelscherm geeft het lopende en het laatst beslote verzoek door', () => {
    const bron = zonderCommentaar(readFileSync(join(WORTEL, DOELSCHERM), 'utf8'));
    // `verzoek` komt uit `fetchOpenVerzoek()` (`open`), `besluit` uit `fetchLaatsteBesluit()`
    // (`approved`/`rejected`). Samen: elk niet-ingetrokken verzoek, zoals de RPC.
    expect(bron).toMatch(/fetchOpenVerzoek\(id\)/);
    expect(bron).toMatch(/fetchLaatsteBesluit\(id\)/);
    expect(bron).toMatch(/setVerzoek\(lopend\)/);
    expect(bron).toMatch(/setBesluit\(laatste\)/);
    expect(bron).toMatch(/<Straf\b[^>]*metUitstelverzoek=\{uitstelGevraagd\(verzoek, besluit\)\}/);
    expect(bron).toMatch(/<StrafIntrekken\b[^>]*metUitstelverzoek=\{metUitstelverzoek\}/);
  });
});
