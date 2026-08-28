import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isPushdienst,
  PUSHDIENST_ACHTERVOEGSELS,
  PUSHDIENST_HOSTS,
} from '../../src/modules/notifications/webpush-verzenden';

const MIGRATIE = join(__dirname, '..', '..', 'supabase', 'migrations', '0117_een_pushadres_is_geen_vrij_veld.sql');

/**
 * Het pushadres is geen vrij veld — en de twee sloten zeggen hetzelfde.
 *
 * ⚠️ **Waarom dit een grendel nodig heeft.** `push_tokens.token` ís bij een
 *    webabonnement de endpoint-URL waar de meldingenjob elk uur een `fetch()`
 *    op doet, onder `service_role`, vanuit het Supabase-netwerk. Tot 0117 stond
 *    daar geen enkele toets op: een ingelogde gebruiker kon er elk willekeurig
 *    adres in zetten, en omdat 404 en 410 de rij opruimen terwijl elke andere
 *    uitkomst hem laat staan, was het bovendien een bestaat-of-niet-orakel.
 *
 * ⚠️ **Twee sloten, dus twee lijsten, dus een naad.** De database toetst bij het
 *    registreren en de verzender toetst vlak vóór de `fetch()` — die tweede is
 *    er voor rijen van vóór 0117 en voor een toekomstig tweede schrijfpad. Lopen
 *    de lijsten uiteen, dan weigert de één wat de ander doorlaat. Deze test legt
 *    ze naast elkaar; dat is dezelfde vorm als de CHECK-kopie in
 *    `chat-schemas.ts` (regel 18, vraag 1).
 */
describe('de pushdienst-allowlist', () => {
  const sql = readFileSync(MIGRATIE, 'utf8')
    .split('\n')
    .filter((regel) => !regel.trimStart().startsWith('--'))
    .join('\n');

  it('kent in de database exact dezelfde hosts als in de app', () => {
    for (const host of PUSHDIENST_HOSTS) {
      expect(sql, `${host} ontbreekt in 0117`).toContain(`'${host}'`);
    }
    for (const achtervoegsel of PUSHDIENST_ACHTERVOEGSELS) {
      expect(sql, `${achtervoegsel} ontbreekt in 0117`).toContain(`%${achtervoegsel}`);
    }
  });

  it('laat de vier echte pushdiensten door', () => {
    expect(isPushdienst('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushdienst('https://android.googleapis.com/gcm/send/abc')).toBe(true);
    expect(isPushdienst('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushdienst('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isPushdienst('https://web.push.apple.com/abc')).toBe(true);
  });

  it('weigert het adres uit het aanvalsscenario', () => {
    expect(isPushdienst('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isPushdienst('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isPushdienst('http://127.0.0.1:54321/rest/v1/')).toBe(false);
  });

  /**
   * ⚠️ **Deze test bestaat omdat de vorige hem niet dekte, en dat is gemeten.**
   *    De https-eis met de hand weghalen liet álle andere gevallen groen: elk
   *    `http`-adres hierboven valt namelijk al af op zijn host. Een geval dat
   *    alléén door de protocoltoets wordt tegengehouden, is een echte host over
   *    `http` — en dat is precies de vorm waarmee je een allowlist omzeilt als
   *    er ergens een transparante proxy of een DNS-truc tussen zit. Regel 18,
   *    vraag 3: kan deze test groen blijven terwijl de belofte breekt?
   */
  it('weigert een échte pushdienst-host over http', () => {
    expect(isPushdienst('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isPushdienst('http://updates.push.services.mozilla.com/wpush/v2/x')).toBe(false);
  });

  /**
   * ⚠️ Dit is de vorm die een naïeve `endsWith` of `includes` doorlaat, en de
   *    reden dat de toets op de hóst kijkt en niet op de string.
   */
  it('trapt niet in een host die er alleen op lijkt', () => {
    expect(isPushdienst('https://fcm.googleapis.com.aanvaller.test/x')).toBe(false);
    expect(isPushdienst('https://aanvaller.test/fcm.googleapis.com/x')).toBe(false);
    expect(isPushdienst('https://notify.windows.com.aanvaller.test/x')).toBe(false);
  });

  it('weigert een poort, userinfo en een leeg of onleesbaar adres', () => {
    expect(isPushdienst('https://fcm.googleapis.com:8080/x')).toBe(false);
    expect(isPushdienst('https://user:pw@fcm.googleapis.com/x')).toBe(false);
    expect(isPushdienst('')).toBe(false);
    expect(isPushdienst('ExponentPushToken[xxxxxxxxxxxx]')).toBe(false);
  });
});
