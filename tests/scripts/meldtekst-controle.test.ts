import { describe, expect, it } from 'vitest';

import {
  beoordeel,
  eersteArgument,
  interpolaties,
  meldAanroepen,
} from '../../scripts/meldtekst-controle.mjs';

/**
 * De ijking van `meldtekst-controle` — QS8-315.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken.** Elke vorm komt
 *    hier los binnen: de vormen die hij moet vínden én de vormen die hij met
 *    rust moet laten. Die tweede helft weegt even zwaar — deze controle stáát in
 *    een codebase met 173 aanroepen die een foutobject rechtstreeks doorgeven,
 *    en als hij die meldt is hij binnen een week uitgezet.
 *
 * ⚠️ **Per grendel geijkt en niet één keer voor het geheel.** Deze controle
 *    heeft er vijf achter elkaar — de aanroep vinden, de declaratie overslaan,
 *    het eerste argument isoleren, de interpolaties eruit halen, en de vorm
 *    herkennen — en een ijking die zijn geval door een pad voert dat een
 *    eerdere grendel al afvangt, bewaakt niets van wat hij belooft.
 *
 * ⚠️ **Alle vijf met de hand gebroken, plus de vormtoets op `sqlstate` in
 *    `scrub.test.ts`. Zes mutaties, zes keer rood** — maar niet in één keer:
 *    de lookbehind van `AANROEPEN` bleef bij de eerste ronde groen, en dat was
 *    de bevinding die het geval hieronder heeft opgeleverd.
 */

describe('meldAanroepen', () => {
  it('leest een aanroep die over meerdere regels loopt in zijn geheel', () => {
    const bron = `
      await meld(
        new Error(\`profielen ophalen mislukte: \${fout.message}\`),
        'rollover.profielen',
      );
    `;
    const [eerste] = meldAanroepen(bron);

    expect(eerste?.tekst).toContain('fout.message');
  });

  it('vindt ook `reportError` uit de app', () => {
    // ⚠️ De app en de Edge Functions delen de envelope en de schoonmaak; ze
    //    horen ook dezelfde grens te hebben.
    const bron = 'reportError(new Error(`mislukt: ${error.message}`), "goals.create");';

    expect(beoordeel(bron)).toHaveLength(1);
  });

  it('laat de definitie van `meld()` zelf met rust', () => {
    // Zonder deze uitzondering is de controle rood op `_shared/melden.ts`, en dat
    // is de snelste manier om hem uitgezet te krijgen.
    const bron = 'export function meld(fout: unknown, waar: string) { return x; }';

    expect(meldAanroepen(bron)).toHaveLength(0);
  });

  it('laat `x.meld(` met rust — dat is een andere functie', () => {
    // ⚠️ **Dit geval is er bij de mutatietoets bijgekomen.** De eerste versie
    //    zette hier `log.meld(fout)` naast een echte treffer en verwachtte er
    //    één — maar `meld(fout)` geeft een object door en wordt sowieso niet
    //    gemeld, dus de lookbehind viel weg zonder dat er iets rood werd. Code
    //    zonder geval is óf overbodig óf onbewaakt; hier het tweede. Het geval
    //    moet dus een `.meld(` zijn die *wél* geflagd zou worden.
    const bron = 'logger.meld(new Error(`a: ${f.message}`), "w");';

    expect(beoordeel(bron)).toHaveLength(0);
  });

  it('ziet de eigen aanroep die ernaast staat wél', () => {
    const bron = [
      'logger.meld(new Error(`a: ${f.message}`), "w");',
      'await meld(new Error(`b: ${f.message}`), "w");',
    ].join('\n');

    expect(beoordeel(bron)).toHaveLength(1);
  });
});

describe('eersteArgument', () => {
  it('knipt niet op een komma binnen de tekst zelf', () => {
    // ⚠️ Een sjabloonliteral mag een komma bevatten. Een naïeve `split(',')`
    //    leest dan de verkeerde helft — en mist dus de melding erachter.
    const arg = eersteArgument('meld(new Error(`eerst dit, dan dat: ${f.message}`), "waar")');

    expect(arg).toContain('f.message');
  });

  it('houdt de context erbuiten', () => {
    // ⚠️ **Dit is de belangrijkste van de vier.** `{ sqlstate: fout.code }` is
    //    precies de reparatie die dit script moet afdwingen. Leest hij de hele
    //    aanroep, dan meldt hij de oplossing als de fout.
    const arg = eersteArgument("meld(new Error('vast'), 'waar', { sqlstate: fout.code })");

    expect(arg).not.toContain('sqlstate');
  });
});

describe('interpolaties', () => {
  it('telt accolades en stopt niet bij de eerste', () => {
    // ⚠️ Geen verzonnen geval: zó stond het in `rollover/index.ts`. Een
    //    `\$\{[^}]*\}` stopt bij de accolade van het type en ziet `.message` niet
    //    — een eerste meting telde die plek daardoor níét mee.
    const uit = interpolaties('`a: ${(fout as { message: string }).message}`');

    expect(uit).toEqual(['(fout as { message: string }).message']);
  });

  it('laat een niet-gesloten accolade vallen in plaats van de rest op te slokken', () => {
    expect(interpolaties('`a: ${fout.message')).toEqual([]);
  });
});

describe('beoordeel — de vormen die hij moet vinden', () => {
  const moetenRoodWorden: readonly (readonly [string, string])[] = [
    ['de kale melding', 'meld(new Error(`mislukt: ${fout.message}`), "w");'],
    [
      'de melding achter een typecast',
      'meld(new Error(`mislukt: ${(fout as { message: string }).message}`), "w");',
    ],
    ['de DETAIL-regel', 'meld(new Error(`mislukt: ${fout.details}`), "w");'],
    ['de hint', 'meld(new Error(`mislukt: ${fout.hint}`), "w");'],
    ['sqlerrm uit een RPC', 'meld(new Error(`mislukt: ${rij.sqlerrm}`), "w");'],
    // ⚠️ De drie hieronder komen uit de security-review op QS8-315, die ze alle
    //    drie als omzeiling heeft gemeten: nul treffers tegen één voor de
    //    referentievorm. De eerste is de gemeenste — er staat geen `message` in
    //    de code, maar `String(new Error(x))` geeft `Error: x`.
    ['een kaal foutobject', 'meld(new Error(`mislukt: ${fout}`), "w");'],
    ['een kaal foutobject onder een andere naam', 'meld(new Error(`x: ${profielFout}`), "w");'],
    ['concatenatie in plaats van een sjabloon', "meld(new Error('mislukt: ' + fout.message), 'w');"],
  ];

  it.each(moetenRoodWorden)('vindt %s', (_naam, bron) => {
    expect(beoordeel(bron)).toHaveLength(1);
  });
});

describe('beoordeel — de vormen die hij met rust moet laten', () => {
  const moetenGroenBlijven: readonly (readonly [string, string])[] = [
    // ⚠️ De grootste groep, en de reden dat deze controle smal is: 173 plekken
    //    geven een foutobject rechtstreeks door. Dat is een echte bevinding, maar
    //    een andere — die repareer je in `scrubMessage()` en niet per aanroeper.
    ['een foutobject dat rechtstreeks wordt doorgegeven', 'meld(fout, "rollover");'],
    ['een vaste zin', "meld(new Error('profielen ophalen mislukte'), 'w');"],
    // Een aantal is geen gebruikerstekst; dit staat zo in het recap-pad.
    ['een geïnterpoleerd aantal', 'meld(new Error(`overgeslagen voor ${n} groep(en)`), "w");'],
    ['de reparatie zelf', "meld(new Error('vast'), 'w', { code: 'x', sqlstate: fout.code });"],
    // `message` als eigen woord in de tekst is geen `.message`.
    ['het woord message in de zin', "meld(new Error('geen message ontvangen'), 'w');"],
    // ⚠️ De tegenhanger van de kaal-foutobject-gevallen hierboven: een gewone
    //    geïnterpoleerde waarde is geen fout, en die moet groen blijven —
    //    anders meldt hij het recap-pad en leer je hem te negeren.
    ['een geïnterpoleerd id', 'meld(new Error(`mislukt voor ${goalId}`), "w");'],
    ['een geïnterpoleerde reden-slug', 'meld(new Error(`geweigerd: ${reden}`), "w");'],
  ];

  it.each(moetenGroenBlijven)('laat %s met rust', (_naam, bron) => {
    expect(beoordeel(bron)).toHaveLength(0);
  });
});

describe('de echte bronbestanden', () => {
  it('draagt de vorm nergens meer', async () => {
    // ⚠️ De positieve controle hoort erbij: deze suite kan groen zijn omdat de
    //    vormen kloppen én omdat `beoordeel()` niets meer vindt. Dit is de naad
    //    naar de echte bestanden, en hij leest ze via dezelfde functie.
    const { readFileSync } = await import('node:fs');

    for (const pad of [
      'supabase/functions/rollover/index.ts',
      'supabase/functions/notificaties/index.ts',
    ]) {
      expect(beoordeel(readFileSync(pad, 'utf8'))).toEqual([]);
    }
  });
});
