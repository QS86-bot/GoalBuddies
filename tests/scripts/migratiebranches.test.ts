import { describe, expect, it } from 'vitest';

import {
  alsNummer,
  nummersUit,
  ontbrekendPerBranch,
} from '../../scripts/migratiebranches.mjs';

/**
 * De bovenkant van de migratiereeks — QS8-238.
 *
 * ⚠️ **Waarom dit bestaat.** `migraties:controle` telde de nummers tússen het
 *    laagste en het hoogste bestand. Ontbreekt er iets **boven** het hoogste,
 *    dan is de reeks netjes aaneengesloten tot waar hij ophoudt. Op 31-08-2026
 *    meldde hij letterlijk "De nummering is aaneengesloten" terwijl `0126` t/m
 *    `0130` op productie draaiden en hun bestanden op een branch zonder PR
 *    stonden — waaronder de migratie die het `auth.uid()`-lek in de
 *    uitnodigingslink dichtzette.
 *
 * ⚠️ **Juist de bovenkant is het gevaarlijkst.** Een gat in het midden komt van
 *    een oude fout. Een gat aan de bovenkant komt van de níeuwste migraties, die
 *    net op productie draaien en waarvan de bestanden nog op een branch staan —
 *    de normale gang van zaken in dit project, en dus precies waar het het
 *    vaakst misgaat.
 *
 * ⚠️ De git-scan zelf (`nummersPerBranch`) staat hier niet onder test: die praat
 *    met een echte remote. Wat hier staat is het oordeel, en dat is de helft die
 *    fout kan zijn zonder dat iemand het ziet.
 */

describe('nummersUit', () => {
  it('leest gewone migratienamen', () => {
    expect(nummersUit(['0001_schema.sql', '0131_iets.sql'])).toEqual([1, 131]);
  });

  it('telt een deelmigratie onder zijn eigen nummer', () => {
    // ⚠️ `0052a` is de tweede helft van 0052 — zelfde afspraak als in
    //    migraties-controle.mjs. Zou hij als een eigen nummer tellen, dan zou
    //    elke deelmigratie een vals gat opleveren.
    expect(nummersUit(['0052_a.sql', '0052a_b.sql'])).toEqual([52]);
  });

  it('accepteert volledige paden en losse namen door elkaar', () => {
    expect(nummersUit(['supabase/migrations/0007_x.sql', '0008_y.sql'])).toEqual([7, 8]);
  });

  it.each([
    ['een leeg pad', ''],
    ['een map zonder bestand', 'supabase/migrations/'],
    ['geen sql', '0009_iets.txt'],
    ['te weinig cijfers', '009_iets.sql'],
    ['hoofdletters in de naam', '0009_Iets.sql'],
    ['geen nummer', 'losse_notitie.sql'],
  ])('laat %s met rust', (_naam, invoer) => {
    // ⚠️ Niet meetellen én niet klagen. Een onleesbare naam wordt in stap 1 van
    //    migraties-controle al gemeld; hier nóg een keer klagen levert twee
    //    meldingen op voor één fout, en dat leert je de controle te negeren.
    expect(nummersUit([invoer])).toEqual([]);
  });

  it('ontdubbelt en sorteert', () => {
    expect(nummersUit(['0010_b.sql', '0002_a.sql', '0010_c.sql'])).toEqual([2, 10]);
  });
});

describe('ontbrekendPerBranch — wat er gevonden moet worden', () => {
  it('vindt het geval van QS8-237: vijf migraties boven het hoogste bestand', () => {
    // Dit is main zoals hij op 31-08 om 09:00 werkelijk was.
    const lokaal = Array.from({ length: 125 }, (_, i) => i + 1);
    const perBranch = { 'origin/anders': [...lokaal, 126, 127, 128, 129, 130] };

    const uit = ontbrekendPerBranch({ lokaal, perBranch });

    expect(uit).toEqual([{ branch: 'origin/anders', ontbreekt: [126, 127, 128, 129, 130] }]);
  });

  it('vindt ook een gat in het midden dat elders wél bestaat', () => {
    expect(
      ontbrekendPerBranch({ lokaal: [1, 2, 4], perBranch: { 'origin/x': [1, 2, 3, 4] } }),
    ).toEqual([{ branch: 'origin/x', ontbreekt: [3] }]);
  });

  it('noemt elke branch apart', () => {
    const uit = ontbrekendPerBranch({
      lokaal: [1],
      perBranch: { 'origin/b': [1, 3], 'origin/a': [1, 2] },
    });
    expect(uit.map((r) => r.branch)).toEqual(['origin/a', 'origin/b']);
  });
});

describe('ontbrekendPerBranch — wat er met rust gelaten moet worden', () => {
  it('zwijgt als elke branch precies hetzelfde draagt', () => {
    expect(
      ontbrekendPerBranch({ lokaal: [1, 2, 3], perBranch: { 'origin/main': [1, 2, 3] } }),
    ).toEqual([]);
  });

  it('zwijgt als deze map juist méér draagt dan de branch', () => {
    // De normale toestand op een branch die een nieuwe migratie toevoegt.
    expect(
      ontbrekendPerBranch({ lokaal: [1, 2, 3], perBranch: { 'origin/main': [1, 2] } }),
    ).toEqual([]);
  });

  it('telt een branch zonder migratiemap als nul en niet als "alles ontbreekt"', () => {
    // ⚠️ Zonder deze regel is elke docs-branch rood, en dan is de controle binnen
    //    een week uitgezet.
    expect(
      ontbrekendPerBranch({ lokaal: [1, 2], perBranch: { 'origin/docs': [] } }),
    ).toEqual([]);
  });

  it('zwijgt bij een lege werkkopie', () => {
    // ⚠️ Geen map is een ánder probleem, en dat wordt elders gevonden. Zou dit
    //    "134 migraties ontbreken" melden, dan verdrinkt de echte oorzaak.
    expect(
      ontbrekendPerBranch({ lokaal: [], perBranch: { 'origin/main': [1, 2, 3] } }),
    ).toEqual([]);
  });

  it('zwijgt zonder branches', () => {
    expect(ontbrekendPerBranch({ lokaal: [1, 2], perBranch: {} })).toEqual([]);
  });
});

describe('alsNummer', () => {
  it('schrijft vier cijfers, zoals de bestandsnamen', () => {
    expect(alsNummer(7)).toBe('0007');
    expect(alsNummer(131)).toBe('0131');
  });
});
