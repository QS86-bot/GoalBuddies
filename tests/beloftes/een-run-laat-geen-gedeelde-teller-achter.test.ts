/**
 * De belofte: **een run van de RLS-suite laat geen tellerrij achter die de
 * vólgende run beïnvloedt** — QS8-442, acceptatiecriterium 1.
 *
 * ⚠️⚠️ **Waarom dit oordeel apart staat van de database.** De toets zelf draait
 *    in de teardown van `tests/rls/globaal.ts` — daar, en niet in een van de
 *    honderdvierenzestig testbestanden, want geen van die bestanden kan zien wat
 *    er ná de hele run nog staat. Maar een toets die alleen dáár leeft, is
 *    alleen te ijken door een volle suite-run van twintig minuten. Het óórdeel
 *    staat daarom in `tests/rls/tellerrest.ts` als gewone functie, en dit bestand
 *    voedt hem elke vorm los.
 *
 * ⚠️ **De helft die hem met rust laat is even belangrijk.** Een sleutel mét een
 *    uuid is rommel en geen gif: de volgende run maakt een andere uuid en botst
 *    er nooit mee. Zou deze toets die óók melden, dan is hij na één volle run
 *    rood op eenentwintig rijen waarvan er twintig niets doen — en dan leer je
 *    hem uit te zetten.
 *
 * 📏 De ijking staat in
 *    `docs/decisions/2026-09-13-de-waarschuwing-stond-bij-het-verkeerde-werkwoord.md` §6.
 */
import { describe, expect, it } from 'vitest';

import { restMelding, vasteSleutels } from '../rls/tellerrest';

describe('een sleutel zonder uuid is er de volgende run nog', () => {
  /** 📏 Het gemeten geval: dit stond er na élke volle run. */
  it('vindt de groep die `g` heet', () => {
    expect(vasteSleutels(['g'])).toEqual(['g']);
  });

  it.each(['chatdocs', 'vaste-map', 'groep1', 'mijnmap/submap', ''])('vindt %o', (sleutel) => {
    expect(vasteSleutels([sleutel])).toEqual([sleutel]);
  });

  /**
   * ⚠️⚠️ **`mijnmap/submap` hierboven is geen bedacht geval.** 📏 Het stond in
   *    `chatfotobucket.test.ts`, en het is de tweede vaste sleutel die déze
   *    toets in zijn eerste échte teardown vond — nadat `g` al weg was. Dat
   *    bestand toetst met opzet een pad **zonder** uuid, dus het viel buiten de
   *    eerste vorm van de markering.
   */
  it('en dat geval kwam uit de teardown zelf, niet uit een bedachte lijst', () => {
    expect(vasteSleutels(['mijnmap', 'mijnmap/submap'])).toHaveLength(2);
  });
});

describe('een sleutel met een uuid laat hij met rust', () => {
  /**
   * ⚠️ Alle vier de vormen komen uit een échte meting — de eenentwintig rijen
   *    die een volle run op 13-09-2026 achterliet.
   */
  /**
   * ⚠️ `proefCode()` staat er met opzet bij: die is per run uniek zónder uuid te
   *    zijn, en de eerste vorm van deze markering (de uuid-vorm) meldde hem
   *    onterecht. Een controle die een juist opgeloste fixture blijft melden,
   *    leer je uitzetten.
   */
  it.each([
    '1cd9c0c5-b21c-464b-839b-a39d9af6d7f9',
    'map74b4d2963836/submap',
    'd0afd9b7-ed9c-4210-a3b3-59e3e92aa884/c0de37ce-561b-4939-8fe7-8daac82e910b',
    'map-74b4d296-3836-4ef7-8578-a116fa263d33',
    '62398E45-2817-4003-B05C-1CC97B80DE33',
  ])('zwijgt over %s', (sleutel) => {
    expect(vasteSleutels([sleutel])).toEqual([]);
  });

  it('en over een lege tabel', () => {
    expect(restMelding([])).toBeNull();
  });
});

describe('de melding zegt wat er staat en wat je eraan doet', () => {
  it('noemt elke vaste sleutel', () => {
    const melding = restMelding(['g', '1cd9c0c5-b21c-464b-839b-a39d9af6d7f9', 'chatdocs']);

    expect(melding).not.toBeNull();
    expect(melding).toContain('  g');
    expect(melding).toContain('  chatdocs');
    expect(melding, 'een uuid-sleutel hoort niet in de melding').not.toContain('1cd9c0c5');
  });

  it('wijst naar het hulpmiddel en niet alleen naar het probleem', () => {
    const melding = restMelding(['g']) ?? '';

    expect(melding).toContain('proefId()');
    expect(melding).toContain('truncate dagtellers');
  });
});
