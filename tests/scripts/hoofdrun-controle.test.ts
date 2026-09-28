import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als de andere scriptijkingen.
import {
  afbrekingWordtRood,
  bevindingen,
  breektMainAf,
  cancelRegel,
  concurrencyBlok,
  deeltGroepOpMain,
  draaitOpMain,
  evalueerGroep,
  groepRegel,
  samenvattendeJobs,
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

    // ⚠️ **Dit is de eigen zeef van deze controle, en de reden dat hij met een
    //    meting in `ZONDER_KNIP` van `knip:controle` staat.** De gedeelde knip is
    //    een JS-knip en haalt uit YAML niets weg: 📏 gemeten op 22-09-2026 geeft
    //    `zonderCommentaar()` op deze invoer letterlijk dezelfde tekst terug.
    it('laat een uitgecommentarieerde regel binnen het blok liggen', () => {
      const yml = 'concurrency:\n  # group: ci-${{ github.ref }}\n  group: ci-goed\n';
      expect(groepRegel(yml)).toBe('ci-goed');
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

  describe('samenvattendeJobs: welke job vat de andere samen?', () => {
    const JOB =
      'jobs:\n' +
      '  poort:\n' +
      '    name: Alles groen\n' +
      '    needs: [controle, rls]\n' +
      '    if: always()\n' +
      '    steps:\n' +
      '      - run: echo\n';

    it('vindt een job met needs én een eigen if', () => {
      expect(samenvattendeJobs(JOB)).toEqual([{ naam: 'poort', conditie: 'always()' }]);
    });

    it('vindt ze allebei als er twee zijn — dan is "welke" het eerste wat je wilt weten', () => {
      const twee = JOB + '\n  tweede:\n    needs: [poort]\n    if: always()\n';
      expect(samenvattendeJobs(twee).map((j) => j.naam)).toEqual(['poort', 'tweede']);
    });

    // ⚠️⚠️ **De scherpste van dit blok, en hij staat écht in `ci.yml`.** Regel 575
    //    draagt een `if: always()` op een **stap**, en die is daar juist goed: zo
    //    verbergt één rode controle de volgende niet. Het verschil is
    //    inspringing 8 tegen 4, en een lezer die dat niet aanhoudt, meldt de
    //    hele poort als fout.
    it('leest een stap-if op inspringing 8 niet als de conditie van de job', () => {
      const metStap =
        'jobs:\n' +
        '  poort:\n' +
        '    needs: [controle]\n' +
        '    steps:\n' +
        '      - name: Uitslag\n' +
        '        if: always()\n' +
        '        run: echo\n';
      expect(samenvattendeJobs(metStap)).toEqual([]);
    });

    // ⚠️⚠️ **Deze toets is met de hand rood gemaakt en bléék niet rood te
    //    worden, en dat staat hier in plaats van dat hij stilletjes blijft
    //    staan.** Hij leest als de tegenhanger van de knip-toets hierboven —
    //    de kop van de poort noemt `always()` vier keer — maar hij bewaakt de
    //    overslag van commentaar niet: 📏 met `if (/^\s*#/) continue` eruit
    //    blijft hij groen, want `    # ... if: ...` matcht `^ {4}if:` toch niet.
    //    Wat die overslag wél draagt, staat in de toets hieronder over kolom 0.
    //    Deze blijft staan als must-allow op de vorm die in `ci.yml` staat, niet
    //    als grendel.
    it('trapt niet in een comment die de conditie noemt', () => {
      const metKop =
        'jobs:\n' +
        '  poort:\n' +
        '    needs: [controle]\n' +
        '    # ⚠️ met alleen `if: always()` wordt een afbreking rood\n' +
        '    if: always() && !cancelled()\n';
      expect(samenvattendeJobs(metKop)).toEqual([
        { naam: 'poort', conditie: 'always() && !cancelled()' },
      ]);
    });

    // ⚠️ Must-allow, en deze is de reden dat de scanner bij `jobs:` begint. Het
    //    `on:`-blok draagt sleutels op dezelfde inspringing als een job; zonder
    //    die grens is `push:` een job. Vandaag levert dat niets op omdat `push`
    //    geen `needs:` draagt — dat is toeval en geen eigenschap.
    it('laat de sleutels uit het on-blok met rust', () => {
      const yml =
        'on:\n  push:\n    needs: [x]\n    if: always()\n' +
        'jobs:\n  poort:\n    needs: [controle]\n    if: always()\n';
      expect(samenvattendeJobs(yml).map((j) => j.naam)).toEqual(['poort']);
    });

    // ⚠️⚠️ **Deze staat er omdat de ijking hem eiste, en niet andersom.** De
    //    scanner slaat commentaarregels over, en de eerste toets daarvoor keek
    //    naar een comment op inspringing 4 die `if:` noemt — die bleef groen
    //    mét én zónder de overslag, want `    # if:` matcht `^ {4}if:` toch
    //    niet. 📏 Waar het wél om gaat is kolom 0: zo'n regel telt als nieuwe
    //    topsleutel en sluit het `jobs:`-blok, waarna de controle groen is
    //    omdat hij niets meer vindt. Vandaag staan er 46 van die comments in
    //    `ci.yml` en 0 ervan ná `jobs:` — dat is de stand, geen eigenschap.
    it('laat een comment op kolom 0 het jobs-blok niet sluiten', () => {
      const yml =
        'jobs:\n' +
        '  controle:\n' +
        '    steps:\n' +
        '# ⚠️ hieronder de samenvatting\n' +
        '  poort:\n' +
        '    needs: [controle]\n' +
        '    if: always()\n';
      expect(samenvattendeJobs(yml).map((j) => j.naam)).toEqual(['poort']);
    });

    // ⚠️ Must-allows. Zonder deze twee is "alles is een treffer" ook groen.
    it('laat een job zonder needs met rust — die vat niets samen', () => {
      expect(samenvattendeJobs('jobs:\n  controle:\n    if: always()\n    steps:\n')).toEqual([]);
    });

    it('laat een job zonder eigen if met rust — die draait bij een afbreking niet', () => {
      expect(samenvattendeJobs('jobs:\n  poort:\n    needs: [controle]\n    steps:\n')).toEqual(
        [],
      );
    });
  });

  describe('afbrekingWordtRood: maakt deze conditie een afgebroken run rood?', () => {
    // ⚠️ Must-find. Dit was de vorm van vóór 22-09-2026, en 19 van de laatste
    //    100 runs liepen erin.
    it('vindt het kale always() — de vorm waaronder QS8-589 gebeurde', () => {
      expect(afbrekingWordtRood('always()')).toBe(true);
    });

    it('vindt always() met een ándere voorwaarde erachter', () => {
      expect(afbrekingWordtRood("always() && github.event_name == 'push'")).toBe(true);
    });

    it('leest de spatie-varianten die GitHub ook accepteert', () => {
      expect(afbrekingWordtRood('always ( )')).toBe(true);
    });

    // ⚠️ Must-allows.
    it('laat de gerepareerde vorm met rust', () => {
      expect(afbrekingWordtRood('always() && !cancelled()')).toBe(false);
    });

    it('laat de geschreven variant van diezelfde vorm met rust', () => {
      expect(afbrekingWordtRood('always() && cancelled() == false')).toBe(false);
    });

    // ⚠️⚠️ **Dit is de smalle kant, en die is met opzet smal.** Zonder `always()`
    //    draait de job bij een afbreking niet — er is dan niets te repareren, en
    //    een melding zou hier een controle zijn die alles meldt.
    it('laat success() met rust — die draait bij een afbreking niet', () => {
      expect(afbrekingWordtRood("success() && github.ref == 'refs/heads/main'")).toBe(false);
    });

    it('laat een lege conditie met rust', () => {
      expect(afbrekingWordtRood('')).toBe(false);
    });

    // ⚠️ Een conditie die het wóórd draagt zonder de aanroep is geen always().
    it('laat een conditie met alleen het woord in een string met rust', () => {
      expect(afbrekingWordtRood("github.head_ref == 'always'")).toBe(false);
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
      // ⚠️ En dezelfde kanarie voor QS8-589: vindt de lezer de poort nog? Zonder
      //    deze regel bewijst de lege lijst hierboven niets over de samenvatting.
      expect(
        samenvattendeJobs(ci).map((j) => j.naam),
        'ci.yml heeft geen samenvattende job meer die hier gelezen wordt',
      ).toContain('poort');
    });
  });
});

function readCi(): string {
  return readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');
}
