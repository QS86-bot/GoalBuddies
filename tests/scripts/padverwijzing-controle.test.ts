/**
 * IJking van `scripts/padverwijzing-controle.mjs` — QS8-412.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken.** Vandaar dat
 *    `verwijzingenIn()` en `beoordeel()` geëxporteerd zijn en `beoordeel()` zijn
 *    `bestaat` van de aanroeper krijgt: geen bestandssysteem, geen volgorde,
 *    geen toeval.
 *
 * ⚠️⚠️ **De helft die hieronder net zo zwaar weegt: wat hij met rust laat.** Een
 *    controle die proza meldt, leer je uitzetten — en dan bewaakt hij niets
 *    meer. De blok "laat met rust" is daarom even lang als de blok "vindt".
 */
import { describe, expect, it } from 'vitest';

import {
  beoordeel,
  binnenScope,
  verwijzingenIn,
  ZONDER_BESTAND,
} from '../../scripts/padverwijzing-controle.mjs';

/** Alles bestaat, behalve wat er expliciet in `WEG` staat. */
const bestaatBehalve =
  (weg: readonly string[]) =>
  (pad: string): boolean =>
    !weg.includes(pad);

describe('verwijzingenIn vindt wat een bewering over de repo is', () => {
  it('een backtick-geciteerd pad met een extensie', () => {
    expect(verwijzingenIn('zie `tests/beloftes/x.test.ts` hierboven')).toEqual([
      { pad: 'tests/beloftes/x.test.ts', regel: 1 },
    ]);
  });

  it('twee op één regel, allebei', () => {
    const uit = verwijzingenIn('`src/a.ts` en `app/b.tsx`');
    expect(uit.map((v: { pad: string }) => v.pad)).toEqual(['src/a.ts', 'app/b.tsx']);
  });

  it('telt het regelnummer vanaf één', () => {
    expect(verwijzingenIn('een\ntwee\n`scripts/x.mjs`')).toEqual([
      { pad: 'scripts/x.mjs', regel: 3 },
    ]);
  });

  /** Expo-routes dragen haakjes en blokhaken; die horen erbij. */
  it('een route met haakjes en blokhaken', () => {
    const uit = verwijzingenIn('`app/(tabs)/lijst.tsx` en `app/groep/chat/[id].tsx`');
    expect(uit.map((v: { pad: string }) => v.pad)).toEqual([
      'app/(tabs)/lijst.tsx',
      'app/groep/chat/[id].tsx',
    ]);
  });

  it('elke soort die je mag noemen zonder dat hij gescand wordt', () => {
    const uit = verwijzingenIn('`docs/a.md` `supabase/b.sql` `src/c.json` `.github/x.yml`');
    expect(uit.map((v: { pad: string }) => v.pad)).toEqual([
      'docs/a.md',
      'supabase/b.sql',
      'src/c.json',
    ]);
  });
});

describe('verwijzingenIn laat met rust wat geen bewering is', () => {
  it('een pad zonder aanhalingstekens', () => {
    expect(verwijzingenIn('zie tests/beloftes/x.test.ts hierboven')).toEqual([]);
  });

  it('een map zonder bestandsnaam', () => {
    expect(verwijzingenIn('alles in `src/shared/time` en `supabase/migrations`')).toEqual([]);
  });

  it('een pad dat niet in een repo-map begint', () => {
    expect(verwijzingenIn('`node_modules/expo/x.ts` en `./buur.ts` en `../boven.ts`')).toEqual([]);
  });

  /**
   * ⚠️ Een URL naar GitHub bevat een repo-map, maar de backtick staat er niet
   *    vlak vóór. Zou de controle die tóch pakken, dan meldt hij elke link naar
   *    de eigen repo — en dat is de vorm waarmee een controle zichzelf om zeep
   *    helpt.
   */
  it('een URL die toevallig een repo-map bevat', () => {
    expect(verwijzingenIn('`https://github.com/QS86-bot/GoalBuddies/blob/main/src/a.ts`')).toEqual(
      [],
    );
  });

  it('een gewone codenaam tussen backticks', () => {
    expect(verwijzingenIn('`useState`, `telTekens()` en `points_ledger`')).toEqual([]);
  });
});

/**
 * ⚠️⚠️ **De wortelloze vorm** (QS8-432). Binnen `src/` schrijft dit project een
 *    pad routineus zonder de wortel — `shared/kiezers/kiesFoto.ts` — omdat dat
 *    ook is wat er in de import staat. De controle van QS8-412 zag die vorm
 *    niet, en de verwijzing die dit issue opleverde stond precies daarin.
 *
 * ⚠️ **De grens is het eerste segment en niet de vorm.** 📏 Elk pad zonder
 *    wortel meenemen meldt er 139, vrijwel allemaal terecht: ze staan onder
 *    `public/`, onder `.github/` of relatief aan `supabase/functions/`. Alleen
 *    `shared/`, `modules/` en `lib/` bestaan nergens anders dan onder `src/`, en
 *    dáárom is die prefix een afleiding en geen gok.
 */
describe('verwijzingenIn vindt een pad zonder wortel onder src/', () => {
  it('zet er src/ voor en zegt erbij dat de wortel ontbrak', () => {
    expect(verwijzingenIn('zie `shared/kiezers/kiesFoto.ts`')).toEqual([
      { pad: 'src/shared/kiezers/kiesFoto.ts', regel: 1, wortelloos: 'shared/kiezers/kiesFoto.ts' },
    ]);
  });

  it('alle drie de submappen die alleen onder src/ bestaan', () => {
    const uit = verwijzingenIn('`shared/tekst/index.ts` `modules/goals/index.ts` `lib/supabase.ts`');
    expect(uit.map((v: { pad: string }) => v.pad)).toEqual([
      'src/shared/tekst/index.ts',
      'src/modules/goals/index.ts',
      'src/lib/supabase.ts',
    ]);
  });

  it('dezelfde extensies als een pad mét wortel', () => {
    const uit = verwijzingenIn('`shared/a.tsx` `modules/b.mjs` `lib/c.json` `shared/d.md`');
    expect(uit.map((v: { pad: string }) => v.pad)).toEqual([
      'src/shared/a.tsx',
      'src/modules/b.mjs',
      'src/lib/c.json',
      'src/shared/d.md',
    ]);
  });
});

describe('verwijzingenIn laat de wortelloze vormen met rust die geen src/-pad zijn', () => {
  /**
   * ⚠️⚠️ **De duurste valse treffer die deze vorm kan maken.** Een Edge Function
   *    importeert zijn buren relatief aan `supabase/functions/`, dus
   *    `_shared/sentry/index.ts` is dáár een kloppend pad. Zou de controle er
   *    `src/` voor zetten, dan meldt hij een bestand dat nooit heeft moeten
   *    bestaan — en dat is de vorm waarmee een controle zichzelf om zeep helpt.
   */
  it('een pad relatief aan supabase/functions/', () => {
    expect(verwijzingenIn('`_shared/sentry/index.ts` en `rollover/index.ts`')).toEqual([]);
  });

  it('een wortel die buiten de gescande mappen ligt', () => {
    expect(verwijzingenIn('`public/manifest.json` en `.github/workflows/ci.yml`')).toEqual([]);
  });

  /**
   * ⚠️ **Twee keer tellen is hier de valkuil**, want `src/shared/a.ts` bevat
   *    `shared/a.ts`. De backtick vlak vóór het eerste segment houdt dat tegen:
   *    in het volledige pad staat er een schuine streep. Breekt die anker, dan
   *    komt elk pad met wortel er dubbel uit — één keer goed en één keer als
   *    `src/src/…` — en meldt de controle bestanden die nooit bestaan hebben.
   */
  it('een pad mét wortel komt er één keer uit, niet twee', () => {
    expect(verwijzingenIn('`src/shared/a.ts`')).toEqual([{ pad: 'src/shared/a.ts', regel: 1 }]);
  });

  it('een map zonder bestandsnaam, ook zonder wortel', () => {
    expect(verwijzingenIn('alles in `shared/time` en `modules/goals`')).toEqual([]);
  });

  it('een pad zonder aanhalingstekens, ook zonder wortel', () => {
    expect(verwijzingenIn('zie shared/kiezers/kiesFoto.ts hierboven')).toEqual([]);
  });
});

describe('beoordeel scheidt kapot van bestaand', () => {
  it('meldt een pad dat niet bestaat, met bron en regel', () => {
    const { kapot } = beoordeel(
      [{ pad: 'src/a.ts', tekst: '/**\n * zie `tests/weg.test.ts`\n */' }],
      bestaatBehalve(['tests/weg.test.ts']),
      [],
    );
    expect(kapot).toEqual([{ bron: 'src/a.ts', regel: 2, pad: 'tests/weg.test.ts' }]);
  });

  it('zwijgt over een pad dat bestaat', () => {
    const { kapot } = beoordeel(
      [{ pad: 'src/a.ts', tekst: 'zie `tests/er.test.ts`' }],
      bestaatBehalve([]),
      [],
    );
    expect(kapot).toEqual([]);
  });
});

describe('het register dekt precies één paar en niet meer', () => {
  const register = [{ pad: 'tests/weg.test.ts', in: 'src/a.ts', reden: 'met opzet' }];

  it('een geregistreerd paar is geen bevinding', () => {
    const { kapot, ongebruikt } = beoordeel(
      [{ pad: 'src/a.ts', tekst: 'zie `tests/weg.test.ts`' }],
      bestaatBehalve(['tests/weg.test.ts']),
      register,
    );
    expect(kapot).toEqual([]);
    expect(ongebruikt).toEqual([]);
  });

  /**
   * ⚠️⚠️ **Dit is waarom de sleutel het páár is en niet het pad.** Een
   *    vrijbrief die op de bestandsnaam alleen zou werken, dekt stilzwijgend af
   *    dat een ánder bestand dezelfde dode verwijzing overneemt — en zo verspreidt
   *    een fout zich onder een uitzondering die voor iets anders bedoeld was.
   */
  it('hetzelfde kapotte pad in een ander bestand is wél een bevinding', () => {
    const { kapot } = beoordeel(
      [{ pad: 'src/b.ts', tekst: 'zie `tests/weg.test.ts`' }],
      bestaatBehalve(['tests/weg.test.ts']),
      register,
    );
    expect(kapot).toEqual([{ bron: 'src/b.ts', regel: 1, pad: 'tests/weg.test.ts' }]);
  });

  /**
   * ⚠️ De ratel slaat twee kanten op, zoals bij `levend:controle` en
   *    `regel15:controle`: een registerrij die niets meer dekt is óók rood.
   *    Anders blijft er een vrijbrief liggen voor een pad dat morgen om een heel
   *    andere reden weer opduikt.
   */
  it('meldt een registerrij die niets meer dekt', () => {
    const { kapot, ongebruikt } = beoordeel(
      [{ pad: 'src/a.ts', tekst: 'de zin is weg' }],
      bestaatBehalve([]),
      register,
    );
    expect(kapot).toEqual([]);
    expect(ongebruikt).toEqual(register);
  });

  it('en ook als het bestand weer bestaat', () => {
    const { ongebruikt } = beoordeel(
      [{ pad: 'src/a.ts', tekst: 'zie `tests/weg.test.ts`' }],
      bestaatBehalve([]),
      register,
    );
    expect(ongebruikt).toEqual(register);
  });
});

describe('het echte register', () => {
  it('draagt een reden per rij', () => {
    expect(ZONDER_BESTAND.length).toBeGreaterThan(0);
    for (const rij of ZONDER_BESTAND as readonly { pad: string; in: string; reden: string }[]) {
      expect(rij.pad, 'pad ontbreekt').toBeTruthy();
      expect(rij.in, `in ontbreekt bij ${rij.pad}`).toBeTruthy();
      expect(rij.reden.length, `reden te kort bij ${rij.pad}`).toBeGreaterThan(60);
    }
  });

  /**
   * ⚠️ Het bestand waarín de uitzondering staat, moet er wél zijn. Een rij die
   *    naar een verdwenen bronbestand wijst, kan nooit meer geraakt worden en is
   *    dus dood gewicht dat niemand opmerkt.
   */
  it('wijst naar bronbestanden die bestaan', async () => {
    const { existsSync } = await import('node:fs');
    for (const rij of ZONDER_BESTAND as readonly { in: string }[]) {
      expect(existsSync(rij.in), `${rij.in} bestaat niet`).toBe(true);
    }
  });
});

/**
 * ⚠️⚠️ **De scope is een besluit en geen bijkomstigheid.** Dat een
 *    beslisdocument erbuiten valt en `docs/DEPLOY.md` erbinnen, is de kern van
 *    deze controle: het eerste is een gedateerd verslag waarin een verdwenen
 *    bestand wáár is, het tweede beschrijft het heden en stuurt een mens langs
 *    een commando dat moet bestaan.
 */
describe('binnenScope', () => {
  it('neemt code, migraties, scripts, tests en de levende documenten mee', () => {
    for (const pad of [
      'src/shared/ui/Foto.tsx',
      'app/(tabs)/lijst.tsx',
      'scripts/poort.mjs',
      'supabase/migrations/0001_x.sql',
      'tests/rls/koppelbare-doelen.test.ts',
      'docs/DEPLOY.md',
      'docs/ENGINEER-REVIEW.md',
      'docs/WERKVOORRAAD.md',
    ]) {
      expect(binnenScope(pad), pad).toBe(true);
    }
  });

  it('laat een beslisdocument erbuiten', () => {
    expect(binnenScope('docs/decisions/002-domeinregel7-oppervlakken.md')).toBe(false);
  });

  it('laat de eigen ijking erbuiten en geen andere test', () => {
    expect(binnenScope('tests/scripts/padverwijzing-controle.test.ts')).toBe(false);
    expect(binnenScope('tests/scripts/migratie-fetch.test.ts')).toBe(true);
  });

  it('laat alles buiten de gescande mappen erbuiten', () => {
    for (const pad of ['CLAUDE.md', 'package.json', 'node_modules/expo/x.ts', '.github/ci.yml']) {
      expect(binnenScope(pad), pad).toBe(false);
    }
  });
});
