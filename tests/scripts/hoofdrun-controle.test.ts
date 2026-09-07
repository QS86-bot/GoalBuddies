import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als de andere scriptijkingen.
import {
  bevindingen,
  breektMainAf,
  cancelRegel,
  draaitOpMain,
} from '../../scripts/hoofdrun-controle.mjs';

/**
 * De ijking van `npm run hoofdrun:controle` — QS8-318.
 *
 * ⚠️ **Deze controle bestaat omdat de uitslag verdween, niet omdat de grendel
 *    faalde.** `migraties:controle` draait ná de merge op `main` en werd op
 *    07-09-2026 rood binnen drie minuten nadat de tweede migratie `0182` landde.
 *    De run over de commit ertússen is echter nooit afgerond — afgebroken door
 *    `cancel-in-progress: true` — en dus heeft die toestand van `main` nooit een
 *    uitslag gekregen.
 *
 * ⚠️ **De tweede helft is hier het punt.** Een controle die élke
 *    `cancel-in-progress` afkeurt, keurt ook `notificaties.yml` en
 *    `rollover.yml` af, en dat zijn geplande jobs die `main` niet raken. Een
 *    controle die alles meldt, leer je negeren — dus de must-allows staan er
 *    net zo hard in als de must-finds.
 */
describe('hoofdrun-controle — de ijking', () => {
  describe('draaitOpMain: raakt deze workflow main?', () => {
    it("vindt 'push: branches: [**]' — dat was de vorm van ci.yml", () => {
      expect(draaitOpMain("on:\n  push:\n    branches: ['**']\n  pull_request:\n")).toBe(true);
    });

    it('vindt een expliciete main', () => {
      expect(draaitOpMain('on:\n  push:\n    branches: [main]\n')).toBe(true);
    });

    it('vindt een push zonder branchfilter — die draait overal', () => {
      expect(draaitOpMain('on:\n  push:\n  workflow_dispatch:\n')).toBe(true);
    });

    // ⚠️ Must-allow. Zonder deze twee is "alles is een treffer" ook groen.
    it('laat een workflow die alleen op een andere branch draait met rust', () => {
      expect(draaitOpMain('on:\n  push:\n    branches: [develop, release]\n')).toBe(false);
    });

    it('laat een workflow zonder push met rust — een pull_request raakt main niet', () => {
      expect(draaitOpMain('on:\n  pull_request:\n    branches: [main]\n')).toBe(false);
    });

    it('laat een geplande job met rust — zo staan notificaties.yml en rollover.yml erin', () => {
      expect(draaitOpMain("on:\n  schedule:\n    - cron: '0 * * * *'\n  workflow_dispatch:\n")).toBe(
        false,
      );
    });
  });

  describe('cancelRegel: wat staat er letterlijk', () => {
    it('leest de waarde', () => {
      expect(cancelRegel('concurrency:\n  cancel-in-progress: true\n')).toBe('true');
    });

    it('geeft null als de sleutel ontbreekt — GitHub breekt dan niet af', () => {
      expect(cancelRegel('concurrency:\n  group: ci\n')).toBeNull();
    });

    it('leest een expressie in zijn geheel', () => {
      expect(
        cancelRegel("  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}\n"),
      ).toBe("${{ github.ref != 'refs/heads/main' }}");
    });
  });

  describe('breektMainAf: is deze waarde fout op main?', () => {
    it('true is onvoorwaardelijk en dus fout', () => {
      expect(breektMainAf('true')).toBe(true);
    });

    // ⚠️ Must-allows. Alle drie de vormen die goed zijn.
    it('false is altijd goed', () => {
      expect(breektMainAf('false')).toBe(false);
    });

    it('ontbreken is goed — de standaard van GitHub breekt niet af', () => {
      expect(breektMainAf(null)).toBe(false);
    });

    it('een expressie die main uitzondert is goed', () => {
      expect(breektMainAf("${{ github.ref != 'refs/heads/main' }}")).toBe(false);
    });

    // ⚠️ **De scherpste van de reeks.** Een expressie die main niet noemt, kán
    //    main niet uitzonderen — hoe plausibel hij verder ook leest. Zonder deze
    //    regel is elke expressie een vrijbrief.
    it('een expressie die main niet noemt telt als afbreken', () => {
      expect(breektMainAf("${{ github.event_name == 'pull_request' }}")).toBe(true);
    });
  });

  describe('de echte workflows', () => {
    it('geen enkele breekt een run op main af', () => {
      // ⚠️ Dit is de eigenlijke bewering van de controle, tegen de bestanden
      //    zoals ze nu op schijf staan.
      expect(bevindingen()).toEqual([]);
    });

    it('en de controle heeft daarbij echt iets gelezen', () => {
      // ⚠️ De kanarie, en die staat er om de les van QS8-323: een lege uitkomst
      //    is ook wat je krijgt als de lezer nooit een bestand vond. `ci.yml`
      //    moet herkend worden als "draait op main", anders bewijst de lege lijst
      //    hierboven niets.
      const ci = readCi();
      expect(draaitOpMain(ci), 'ci.yml wordt niet meer als main-workflow herkend').toBe(true);
      expect(cancelRegel(ci), 'ci.yml heeft geen cancel-in-progress meer').not.toBeNull();
    });
  });
});

function readCi(): string {
  return readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');
}
