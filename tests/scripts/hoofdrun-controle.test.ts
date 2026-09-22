import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als de andere scriptijkingen.
import {
  bevindingen,
  breektMainAf,
  cancelRegel,
  concurrencyBlok,
  deeltGroepOpMain,
  draaitOpMain,
  evalueerGroep,
  groepRegel,
  splitstGroepBuitenMain,
  tokeniseer,
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
 *
 * ⚠️⚠️ **Sinds 22-09-2026 ijkt dit bestand drie grendels en niet één — QS8-582.**
 *    `cancel-in-progress` beschermt de lopende run; de wáchtende beschermt hij
 *    niet, en die blinde vlek kostte op 21-09-2026 drie commits op `main` hun
 *    uitslag. De groep draagt die tweede belofte, en tweezijdig: op `main` moet
 *    hij per commit splitsen, daarbuiten juist niet.
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
        cancelRegel(
          "concurrency:\n  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}\n",
        ),
      ).toBe("${{ github.ref != 'refs/heads/main' }}");
    });

    // ⚠️⚠️ **De scherpste van dit blok, en hij is gemeten en niet bedacht.**
    //    Deze lezer las tot 22-09-2026 het hele bestand. Toen `ci.yml` in deze
    //    ronde een kop kreeg die de sleutel uitlegt, werd de controle rood op
    //    zijn eigen uitleg. Zelfde klasse als QS8-412: de knip die een controle
    //    scherp houdt, is zelf een grendel.
    it('trapt niet in een comment die de sleutel noemt', () => {
      const ci =
        '# `cancel-in-progress: true` is op main fout, en daarom staat er:\n' +
        'concurrency:\n' +
        '  # ook hier niet: cancel-in-progress: true\n' +
        '  cancel-in-progress: false\n';
      expect(cancelRegel(ci)).toBe('false');
    });

    it('geeft null zonder concurrency-blok — dan valt er niets af te breken', () => {
      expect(cancelRegel('on:\n  push:\n')).toBeNull();
    });
  });

  describe('concurrencyBlok: wat hoort bij het blok', () => {
    it('neemt de ingesprongen regels en laat de rest liggen', () => {
      const yml = 'name: CI\nconcurrency:\n  group: ci\n\npermissions:\n  group: nee\n';
      expect(concurrencyBlok(yml)).toContain('group: ci');
      expect(concurrencyBlok(yml)).not.toContain('nee');
    });

    it('geeft null als het blok er niet is', () => {
      expect(concurrencyBlok('name: CI\non:\n  push:\n')).toBeNull();
    });
  });

  describe('tokeniseer: wat is leesbaar', () => {
    it('leest de vorm die in ci.yml staat', () => {
      expect(tokeniseer(" github.ref == 'refs/heads/main' && format('-{0}', github.sha) || '' ")).
        toEqual([
          'github.ref',
          '==',
          "'refs/heads/main'",
          '&&',
          'format',
          '(',
          "'-{0}'",
          ',',
          'github.sha',
          ')',
          '||',
          "''",
        ]);
    });

    // ⚠️ Must-find. Een vorm die dit gereedschap niet kent, mag geen groen
    //    opleveren — `null` betekent hier "onbekend" en wordt verderop een
    //    bevinding.
    it('geeft null bij een operator die we niet kennen', () => {
      expect(tokeniseer('github.run_number > 3')).toBeNull();
    });
  });

  describe('evalueerGroep: wat zou GitHub uitrekenen', () => {
    const ECHT =
      "ci-${{ github.ref }}${{ github.ref == 'refs/heads/main' && format('-{0}', github.sha) || '' }}";

    it('zet er op main de sha achter', () => {
      expect(evalueerGroep(ECHT, { 'github.ref': 'refs/heads/main', 'github.sha': 'abc' })).toBe(
        'ci-refs/heads/main-abc',
      );
    });

    it('laat een featurebranch kaal', () => {
      expect(evalueerGroep(ECHT, { 'github.ref': 'refs/heads/tak', 'github.sha': 'abc' })).toBe(
        'ci-refs/heads/tak',
      );
    });

    it('geeft null bij een contextpad dat we niet invullen', () => {
      expect(evalueerGroep('ci-${{ github.actor }}', { 'github.ref': 'x' })).toBeNull();
    });
  });

  describe('deeltGroepOpMain: is de wachtrij één plek diep?', () => {
    // ⚠️ Must-find. Dit was de vorm van 21-09-2026, en drie commits verloren
    //    daaronder hun uitslag.
    it('vindt de groep per ref — de vorm waaronder QS8-582 gebeurde', () => {
      expect(deeltGroepOpMain('ci-${{ github.ref }}')).toBe(true);
    });

    it('vindt een vaste naam', () => {
      expect(deeltGroepOpMain('ci')).toBe(true);
    });

    // ⚠️⚠️ **De scherpste van de reeks.** Deze noemt `github.sha` en splitst
    //    overál behalve op `main` — precies verkeerd om. Een controle die op het
    //    wóórd `github.sha` zou zoeken, laat hem door, en dat is geen bedacht
    //    randgeval: de `!=` staat in ci.yml één regel lager.
    it('vindt een expressie die juist buiten main splitst', () => {
      expect(
        deeltGroepOpMain("ci-${{ github.ref != 'refs/heads/main' && github.sha || '' }}"),
      ).toBe(true);
    });

    it('vindt een onleesbare expressie — onbekend is geen groen', () => {
      expect(deeltGroepOpMain('ci-${{ github.run_number > 3 }}')).toBe(true);
    });

    // ⚠️ Must-allows.
    it('laat de vorm die in ci.yml staat met rust', () => {
      expect(
        deeltGroepOpMain(
          "ci-${{ github.ref }}${{ github.ref == 'refs/heads/main' && format('-{0}', github.sha) || '' }}",
        ),
      ).toBe(false);
    });

    it('laat een ontbrekend blok met rust — zonder groep is er geen wachtrij', () => {
      expect(deeltGroepOpMain(null)).toBe(false);
    });
  });

  describe('splitstGroepBuitenMain: blijft cancel-in-progress daar levend?', () => {
    // ⚠️ Must-find. De andere kant van de ratel: zo is afbreken dode letter.
    it('vindt een groep die overal per commit splitst', () => {
      expect(splitstGroepBuitenMain('ci-${{ github.sha }}')).toBe(true);
    });

    it('vindt een onleesbare expressie', () => {
      expect(splitstGroepBuitenMain('ci-${{ github.run_number > 3 }}')).toBe(true);
    });

    // ⚠️ Must-allows.
    it('laat de groep per ref met rust', () => {
      expect(splitstGroepBuitenMain('ci-${{ github.ref }}')).toBe(false);
    });

    it('laat de vorm die in ci.yml staat met rust', () => {
      expect(
        splitstGroepBuitenMain(
          "ci-${{ github.ref }}${{ github.ref == 'refs/heads/main' && format('-{0}', github.sha) || '' }}",
        ),
      ).toBe(false);
    });

    it('laat een ontbrekend blok met rust', () => {
      expect(splitstGroepBuitenMain(null)).toBe(false);
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
      expect(groepRegel(ci), 'ci.yml heeft geen concurrency-groep meer').not.toBeNull();
    });
  });
});

function readCi(): string {
  return readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');
}
