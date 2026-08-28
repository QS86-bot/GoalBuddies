/**
 * Het woord van de Doelcoach bij een tegenvallende stand — besluit 28-08-2026.
 *
 * ⚠️ **Wat er besloten is, en waar de spanning zit.** Er lag een regel dat de
 *    coach *"nooit ongevraagd bij stilstand"* spreekt: een coach die uit zichzelf
 *    begint als je een week overslaat, is een controleur. Quinten heeft dat
 *    afgewogen en gekozen voor **variant B** — ongevraagd aanmoedigen — met de
 *    testronde als ijkpunt. Valt het verkeerd, dan gaat het alsnog naar variant A
 *    (alleen als je de coach zélf aanspreekt). Zie `docs/GROENE-NOTITIES.md` §3b.
 *
 *    Precies omdát die keuze een spanning draagt, staat de toon hier onder test
 *    en niet in een comment. Een ongevraagde zin die verwijt, is de fout die de
 *    oude regel wilde voorkomen — en dat is de fout die deze suite moet vangen.
 *
 * ⚠️ **Domeinregel 7 wordt hier niet geraakt, en dat is gemeten.** Het blok hangt
 *    aan `goal_risk`, en die tabel draagt sinds 0050 één policy:
 *    `goal_risk_select` met `owner_id = auth.uid()`. Een groepsgenoot krijgt
 *    `null` en ziet niets. De grens ligt in de database, niet in het scherm.
 *
 * ⚠️ **Wat deze suite níet dekt.** Dat het scherm het blok daadwerkelijk
 *    verbergt bij `on_track` staat in `app/doel/[id].tsx`, en er is in dit
 *    project geen test in `app/`. Wat hier bewaakt wordt is de **catalogus**: er
 *    ís geen zin voor `on_track`, dus er valt niets te tonen. Dat is de helft
 *    die overleeft als iemand het component verplaatst.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, t, zetTaal } from '../../src/shared/i18n';

/** De standen waarop de coach iets zegt. `on_track` staat er bewust niet bij. */
const TEGENVALLEND = ['at_risk', 'behind', 'unreachable'] as const;

const TALEN = ['nl', 'en'] as const;

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

describe('het woord van de Doelcoach', () => {
  it('heeft een zin voor elke tegenvallende stand, in beide talen', () => {
    for (const taal of TALEN) {
      zetTaal(taal);
      for (const stand of TEGENVALLEND) {
        const sleutel = `coach.woord.${stand}` as never;
        const zin = t(sleutel);
        // ⚠️ `t()` valt bij een onbekende sleutel terug op de sleutel zélf. Een
        //    test die alleen op "niet leeg" toetst, is dus groen op een
        //    ontbrekende vertaling. Vandaar deze vergelijking.
        expect(zin, `${taal}:${stand}`).not.toBe(sleutel);
        expect(zin.length, `${taal}:${stand}`).toBeGreaterThan(20);
      }
    }
  });

  // ⚠️ **De structurele helft van de belofte.** Op koers zegt de coach niets;
  //    een coach die ook dán iets roept, wordt behang en dan leert de gebruiker
  //    het blok over te slaan. Dat is hier geen afspraak maar een ontbrekende
  //    sleutel: er valt niets te tonen omdat er niets is.
  it('zegt niets als je op koers ligt — er is geen zin voor', () => {
    for (const taal of TALEN) {
      zetTaal(taal);
      const sleutel = 'coach.woord.on_track' as never;
      expect(t(sleutel), taal).toBe(sleutel);
    }
  });

  // ⚠️ Zelfde vorm als de toon-test op `STATUS_TEKST` (QS8-84). Een vertaler die
  //    de code niet kent, kent het criterium ook niet — dus het hoort bewaakt te
  //    worden en niet in een comment te staan.
  it('verwijt niets, roept niets uit en dreigt niet', () => {
    const verboden =
      /helaas|jammer|mislukt|gefaald|niet gelukt|sorry|te laat|achterstand loopt op|unfortunately|failed|sadly|too late|falling behind|!/i;

    for (const taal of TALEN) {
      zetTaal(taal);
      for (const stand of TEGENVALLEND) {
        const zin = t(`coach.woord.${stand}` as never);
        expect(zin, `${taal}:${stand}`).not.toMatch(verboden);
      }
    }
  });

  // ⚠️ **Aanmoedigen zonder handvat is een dooddoener.** Elke zin hoort naar iets
  //    te wijzen wat de app écht kan — de vloer (domeinregel 8), de adempauze, of
  //    het bijstellen van de streefdatum. "Je kunt het!" haalt deze test niet, en
  //    dat is de bedoeling.
  it('wijst in elke zin naar iets wat de app kan', () => {
    const handvatten: Record<(typeof TALEN)[number], RegExp> = {
      nl: /vloer|adempauze|streefdatum/i,
      en: /floor|breather|target date/i,
    };

    for (const taal of TALEN) {
      zetTaal(taal);
      for (const stand of TEGENVALLEND) {
        const zin = t(`coach.woord.${stand}` as never);
        expect(zin, `${taal}:${stand} noemt geen enkel mechanisme van de app`).toMatch(
          handvatten[taal],
        );
      }
    }
  });
});
