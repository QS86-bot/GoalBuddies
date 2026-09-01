import { describe, expect, it } from 'vitest';

import {
  alsNummer,
  nummersUit,
  ontbrekendPerBranch,
  ouderdomInWoorden,
  versheidsmelding,
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

/**
 * De versheidsmelding — QS8-247.
 *
 * ⚠️ **De belofte is niet "er komt een waarschuwing".** Die stond er al: de scan
 *    zei in zijn eigen commentaar dat het beeld zo oud is als je laatste fetch,
 *    en op 31-08-2026 botste het nummer een **vierde** keer. De belofte is dat
 *    je aan de melding kunt **zien welk van de twee** het is — net opgehaald, of
 *    van gisteren. Eén tekst voor beide gevallen leest als een disclaimer, en
 *    een disclaimer leer je overslaan.
 *
 * ⚠️ Dat "doortellen na een mislukte fetch" mág is een keuze en geen omissie:
 *    zonder netwerk moet je een migratie kunnen beginnen, en weigeren maakt het
 *    werk niet af. Wat de melding dan moet doen is de zekerheid weghalen. Dat
 *    de fetch daadwerkelijk gebeurt, kan hier niet gemeten worden — dat doet
 *    `migratie-fetch.test.ts` met een echte remote op schijf.
 */
describe('ouderdomInWoorden', () => {
  it.each([
    ['van zojuist', 5_000],
    ['1 minuut oud', 61_000],
    ['42 minuten oud', 42 * 60_000],
    ['3 uur oud', 3 * 3_600_000],
    ['1 dag oud', 25 * 3_600_000],
    ['4 dagen oud', 4 * 86_400_000],
  ])('zegt %s', (verwacht, ms) => {
    expect(ouderdomInWoorden(ms)).toBe(verwacht);
  });

  /** Een klok die achteruit loopt is geen reden om "−2 minuten oud" te schrijven. */
  it.each([
    ['negatief', -1],
    ['NaN', Number.NaN],
  ])('houdt zich in bij %s', (_naam, ms) => {
    expect(ouderdomInWoorden(ms)).toBe('onbekend oud');
  });
});

describe('versheidsmelding', () => {
  it('meldt één regel als het beeld nét ververst is', () => {
    const regels = versheidsmelding({ vers: true, sinds: new Date(), fout: null });
    expect(regels).toHaveLength(1);
    expect(regels[0]).toContain('ververst');
  });

  /**
   * ⚠️ **Dit onderscheid ís de bevinding.** Zou hier dezelfde tekst staan als
   *    hierboven, dan bewaakt de melding niets.
   */
  it('noemt bij een mislukte fetch de leeftijd van het beeld', () => {
    const nu = new Date('2026-08-31T20:00:00Z');
    const regels = versheidsmelding({
      vers: false,
      sinds: new Date('2026-08-29T20:00:00Z'),
      nu,
      fout: 'fatal: could not read from remote repository',
    });

    expect(regels.join('\n')).toContain('Kon niet fetchen');
    expect(regels.join('\n')).toContain('2026-08-29 20:00');
    expect(regels.join('\n')).toContain('2 dagen oud');
    expect(regels.join('\n')).toContain('Controleer zelf');
  });

  /**
   * ⚠️ Een verse kloon heeft nog geen `FETCH_HEAD`, en dat is juist de toestand
   *    waarin het beeld het verst achterloopt — daar mag geen lege datum staan.
   */
  it('zegt het met zoveel woorden als er nog nooit gefetcht is', () => {
    const regels = versheidsmelding({ vers: false, sinds: null, fout: 'geen origin' });
    expect(regels.join('\n')).toContain('nog nooit ververst sinds de kloon');
  });

  it('valt niet om zonder foutmelding', () => {
    expect(versheidsmelding({ vers: false, sinds: null }).join('\n')).toContain('onbekende fout');
  });
});
