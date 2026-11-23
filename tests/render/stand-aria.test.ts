// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/shared/i18n';

import { renderScherm, ruimAllesOp } from './scherm';

/**
 * Een knop zegt zijn stand tegen een schermlezer, ook op web — QS8-803.
 *
 * ⚠️ **De belofte is wat er in de DOM staat, niet wat er in de props staat.** react-native-web 0.21 negeert
 *    `accessibilityState` voor élke sleutel (gemeten in QS8-803 voor `selected`, `checked`, `expanded` en
 *    `busy`). Een test op de props bleef dus groen terwijl een schermlezer niets hoorde. Daarom rendert deze
 *    test de echte componenten en leest hij `document`.
 *
 * ⚠️ **Elke stand wordt in beide richtingen getoetst.** Een attribuut dat altijd `true` is, of altijd
 *    ontbreekt, zegt even weinig als geen attribuut.
 *
 * IJKING — met de hand, 23-11-2026, één mutatie tegelijk, samen met `keuzeknop.test.ts` gedraaid. De uitslag
 * is wat er werkelijk omviel, niet wat verwacht werd:
 *   A  in `ARIA` checked -> 'aria-pressed'                 -> 4 rood: Choice, Schakelaar, Afvinkcirkel (afgevinkt),
 *                                                            'helper: elke stand'; keuzeknop.test.ts groen
 *   B  in `ARIA` selected -> 'aria-checked'                -> 8 rood: zes in keuzeknop.test.ts, 'helper: elke stand',
 *                                                            'helper: selected'
 *   C1 de `aria`-spread weg uit Choice                     -> 1 rood: 'Choice'
 *   C2 idem Schakelaar                                     -> 1 rood: 'Schakelaar'
 *   C3 idem Afvinkcirkel                                   -> 2 rood: beide Afvinkcirkel-toetsen
 *   C4 idem MeerKnop                                       -> 1 rood: 'MeerKnop'
 *   C5 idem Microfoon                                      -> 1 rood: 'Microfoon'
 *   D  Choice geeft `selected` door in plaats van `checked` -> 1 rood: 'Choice'
 *   E  `busy` weg uit de aanroep in Afvinkcirkel            -> 2 rood: beide Afvinkcirkel-toetsen (ook "niet bezig"
 *                                                            moet expliciet false zijn)
 *   G  `web` genegeerd in de helper (altijd aria)          -> 2 rood: 'helper: op native geen aria' en de native-toets
 *                                                            in keuzeknop.test.ts
 *   H  een `undefined`-stand toch in `aria` en `state`     -> 3 rood: 'helper: alleen wat meegegeven is', 'helper: op
 *                                                            native', 'helper: selected'
 *   I1 `aria-expanded` weg uit Taakbalk                    -> 2 rood: beide Taakbalk-toetsen (de tweede vindt de kop
 *                                                            via aria-expanded om het menu te openen)
 *   I2 `aria-current` weg uit Taakbalk                     -> 1 rood: 'Taakbalk: het actieve tabblad'
 *   J1 de `aria`-spread weg uit Field                      -> 1 rood: 'Field'
 *   J2 idem DatumKeuze                                     -> 1 rood: 'DatumKeuze'
 */
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const { standEigenschappen } = await import('@/shared/ui/keuze-aria');
const { UiterlijkProvider } = await import('@/modules/uiterlijk/react');
const { Choice, Schakelaar, Afvinkcirkel, MeerKnop, Taakbalk, Field, DatumKeuze } = await import('@/shared/ui');
const { Microfoon } = await import('@/shared/ui/Microfoon');

const toon = (kind: ReturnType<typeof createElement>) =>
  renderScherm(() => createElement(UiterlijkProvider, null, kind));
const alle = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const een = (sel: string) => {
  const e = alle(sel);
  expect(e).toHaveLength(1);
  return e[0]!;
};
const attr = (e: HTMLElement, naam: string) => e.getAttribute(naam);
const noop = () => {};

afterEach(() => ruimAllesOp());

describe('helper: standEigenschappen', () => {
  it('helper: elke stand krijgt zijn eigen aria-eigenschap op web', () => {
    const { aria } = standEigenschappen({ selected: true, checked: false, expanded: true, busy: false }, true);
    expect(aria).toStrictEqual({
      'aria-pressed': true,
      'aria-checked': false,
      'aria-expanded': true,
      'aria-busy': false,
    });
  });

  it('helper: selected is aria-pressed en nooit aria-selected', () => {
    const { aria } = standEigenschappen({ selected: true }, true);
    expect(Object.keys(aria)).toStrictEqual(['aria-pressed']);
  });

  it('helper: op native geen aria, en de stand in state', () => {
    const r = standEigenschappen({ checked: true, busy: false }, false);
    expect(Object.keys(r.aria)).toHaveLength(0);
    expect(r.state).toStrictEqual({ checked: true, busy: false });
  });

  it('helper: alleen wat meegegeven is, geen undefined-sleutels', () => {
    const r = standEigenschappen({ expanded: false, busy: undefined }, true);
    expect(Object.keys(r.aria)).toStrictEqual(['aria-expanded']);
    expect(Object.keys(r.state)).toStrictEqual(['expanded']);
  });
});

describe('checked: radio, schakelaar en vinkje', () => {
  it('Choice: de gekozen optie is aria-checked, de rest false, en geen aria-pressed', async () => {
    const opties = [
      { waarde: 'a', label: 'A' },
      { waarde: 'b', label: 'B' },
      { waarde: 'c', label: 'C' },
    ] as const;
    await toon(createElement(Choice<string>, { label: 'Kies', opties, waarde: 'b', onKies: noop }));
    const radios = alle('[role="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios.map((e) => attr(e, 'aria-checked'))).toStrictEqual(['false', 'true', 'false']);
    expect(radios.some((e) => e.hasAttribute('aria-pressed'))).toBe(false);
  });

  it('Schakelaar: aan is aria-checked true, uit is false', async () => {
    await toon(createElement(Schakelaar, { aan: true, onPress: noop, label: 'Aan' }));
    await toon(createElement(Schakelaar, { aan: false, onPress: noop, label: 'Uit' }));
    const s = alle('[role="switch"]');
    expect(s.map((e) => [attr(e, 'aria-label'), attr(e, 'aria-checked')])).toStrictEqual([
      ['Aan', 'true'],
      ['Uit', 'false'],
    ]);
  });

  it('Afvinkcirkel: afgevinkt is aria-checked true, niet afgevinkt false', async () => {
    const basis = { niveau: null, onPress: noop };
    await toon(createElement(Afvinkcirkel, { ...basis, label: 'Ja', vandaagAfgevinkt: true }));
    await toon(createElement(Afvinkcirkel, { ...basis, label: 'Nee', vandaagAfgevinkt: false }));
    const c = alle('[role="checkbox"]');
    expect(c.map((e) => attr(e, 'aria-checked'))).toStrictEqual(['true', 'false']);
    expect(c.map((e) => attr(e, 'aria-busy'))).toStrictEqual(['false', 'false']);
  });

  it('Afvinkcirkel: bezig is aria-busy true', async () => {
    await toon(
      createElement(Afvinkcirkel, { label: 'X', niveau: null, vandaagAfgevinkt: false, busy: true, onPress: noop }),
    );
    expect(attr(een('[role="checkbox"]'), 'aria-busy')).toBe('true');
  });
});

describe('expanded: een knop die iets opent', () => {
  it('MeerKnop: aria-expanded volgt open, en wisselt bij een tik', async () => {
    function Houder() {
      const [open, zet] = useState(false);
      return createElement(MeerKnop, { onPress: () => zet((o) => !o), accessibilityLabel: 'Meer', open });
    }
    await toon(createElement(Houder));
    const knop = () => een('[aria-label="Meer"]');
    expect(attr(knop(), 'aria-expanded')).toBe('false');
    await act(async () => knop().click());
    expect(attr(knop(), 'aria-expanded')).toBe('true');
  });

  it('Taakbalk: de kop draagt aria-expanded en wisselt bij een tik', async () => {
    await toon(createElement(Taakbalk));
    const kop = () => een('button[aria-expanded]');
    const voor = attr(kop(), 'aria-expanded');
    expect(['true', 'false']).toContain(voor);
    await act(async () => kop().click());
    expect(attr(kop(), 'aria-expanded')).toBe(voor === 'true' ? 'false' : 'true');
  });

  it('Taakbalk: het actieve tabblad draagt aria-current=page, de andere niet', async () => {
    await toon(createElement(Taakbalk));
    const kop = een('button[aria-expanded]');
    if (attr(kop, 'aria-expanded') === 'false') await act(async () => kop.click());
    const links = alle('[role="link"]');
    expect(links.length).toBeGreaterThanOrEqual(5);
    expect(links.filter((e) => attr(e, 'aria-current') === 'page')).toHaveLength(1);
    expect(links.filter((e) => e.hasAttribute('aria-current'))).toHaveLength(1);
  });
});

describe('busy: een knop die bezig is', () => {
  class NepHerkenner {
    static laatste: NepHerkenner | null = null;
    lang = '';
    continuous = false;
    interimResults = false;
    onresult: unknown = null;
    onerror: unknown = null;
    onend: (() => void) | null = null;
    constructor() {
      NepHerkenner.laatste = this;
    }
    start() {}
    stop() {
      this.onend?.();
    }
    abort() {}
  }

  afterEach(() => {
    delete (globalThis as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    NepHerkenner.laatste = null;
  });

  it('Microfoon: aria-busy is false tot hij luistert, en dan true', async () => {
    (globalThis as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = NepHerkenner;
    const scherm = await toon(
      createElement(Microfoon, { veldlabel: 'Notitie', veld: { value: '', onChangeText: noop } }),
    );
    await scherm.wacht();
    const knop = () => een('[aria-label$=": Notitie"]');
    expect(attr(knop(), 'aria-busy')).toBe('false');
    await act(async () => knop().click());
    await scherm.klik(t('spraak.uitleg_akkoord'));
    expect(NepHerkenner.laatste).not.toBeNull();
    expect(attr(knop(), 'aria-busy')).toBe('true');
    await act(async () => knop().click());
    expect(attr(knop(), 'aria-busy')).toBe('false');
  });
});

describe('selected: een gekozen knop is een wisselknop (aria-pressed)', () => {
  it('Field: de wachtwoordknop is aria-pressed false, en true na een tik', async () => {
    await toon(createElement(Field, { label: 'Wachtwoord', wachtwoord: true, value: '', onChangeText: noop }));
    const knop = () => een('[aria-pressed]');
    expect(attr(knop(), 'aria-pressed')).toBe('false');
    expect(attr(knop(), 'aria-label')).toBe(t('veld.wachtwoord_tonen'));
    await act(async () => knop().click());
    expect(attr(knop(), 'aria-pressed')).toBe('true');
    expect(attr(knop(), 'aria-label')).toBe(t('veld.wachtwoord_verbergen'));
  });

  it('DatumKeuze: precies de gekozen dag is aria-pressed true, elke andere dag false', async () => {
    const s = await toon(
      createElement(DatumKeuze, {
        label: 'Streefdatum',
        waarde: '2026-11-18',
        onKies: noop,
        startDag: 1,
        vandaag: '2026-11-10',
      }),
    );
    expect(alle('[aria-pressed]')).toHaveLength(0);
    const open = alle('button').find((e) => (attr(e, 'aria-label') ?? '').startsWith('Streefdatum: '));
    expect(open).toBeDefined();
    await act(async () => open!.click());
    await s.wacht();
    const dagen = alle('[aria-pressed]');
    expect(dagen.length).toBeGreaterThanOrEqual(28);
    const gekozen = dagen.filter((e) => attr(e, 'aria-pressed') === 'true');
    expect(gekozen).toHaveLength(1);
    expect(gekozen[0]!.textContent).toBe('18');
    expect(dagen.every((e) => ['true', 'false'].includes(attr(e, 'aria-pressed')!))).toBe(true);
  });
});

/**
 * ⚠️ **Nergens `aria-selected`.** Het komt wel in de DOM, maar op `role="button"` of `"link"` is het geen geldige
 *    ARIA en zegt een schermlezer het niet: een test die er naar zoekt is dan groen terwijl niemand iets hoort.
 *    Een gekozen knop is `aria-pressed`, een plek is `aria-current` (besluit orchestrator, 23-11-2026).
 *
 * De toets leest de bron, omdat de belofte "nergens" is en geen enkel scherm alles rendert. Hij zoekt de vorm
 * waarin de prop gezet wordt (`aria-selected=`, `'aria-selected':`), zodat een uitleg in commentaar mag blijven.
 *
 * IJKING — met de hand, 23-11-2026: `aria-selected={actief}` aan `Lijstrij` toegevoegd -> rood, met het pad (en ook de
 * vijf DOM-toetsen in `instellingenpanelen.test.ts`, die nergens `[aria-selected]` toestaan).
 */
describe('nergens aria-selected', () => {
  it('geen bestand in src/ of app/ zet aria-selected', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const bestanden = (map: string): string[] =>
      readdirSync(map, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? bestanden(join(map, d.name)) : /\.tsx?$/.test(d.name) ? [join(map, d.name)] : [],
      );
    const alleBestanden = [...bestanden('src'), ...bestanden('app')];
    expect(alleBestanden.length).toBeGreaterThan(100);
    const zetten = alleBestanden.filter((f) => /aria-selected['"]?\s*[=:]/.test(readFileSync(f, 'utf8')));
    expect(zetten).toStrictEqual([]);
  });
});
