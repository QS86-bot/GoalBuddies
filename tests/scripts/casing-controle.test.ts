import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings: zelfde patroon als `tekst-controle.test.ts`.
import { casingBotsingen, trackedPaden } from '../../scripts/casing-controle.mjs';

/**
 * QS8-678 — de grendel op bestanden die alleen in hoofdletters verschillen.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel:** de repo draagt geen twee
 *    tracked paden die op een hoofdletterongevoelig filesystem samenvallen. De
 *    eerste test toetst die belofte op de echte index; de rest ijkt de functie
 *    met de vormen die hij moet vinden én die hij met rust moet laten.
 */

const botsingen = (...paden: string[]): string[][] => casingBotsingen(paden) as string[][];

describe('de belofte op de echte repo', () => {
  it('geen twee tracked bestanden verschillen alleen in hoofdletters', () => {
    expect(botsingen(...(trackedPaden() as string[]))).toEqual([]);
  });
});

describe('wat de controle moet vinden', () => {
  it('component en logica met dezelfde stam (het oorspronkelijke geval)', () => {
    expect(botsingen('src/shared/ui/Taakbalk.tsx', 'src/shared/ui/taakbalk.ts')).toEqual([
      ['src/shared/ui/Taakbalk.tsx', 'src/shared/ui/taakbalk.ts'],
    ]);
  });

  it('een exacte padbotsing met dezelfde extensie', () => {
    expect(botsingen('src/Foo.ts', 'src/foo.ts')).toHaveLength(1);
  });

  it('een map die alleen in hoofdletters verschilt', () => {
    expect(botsingen('src/Ui/a.ts', 'src/ui/a.ts')).toContainEqual(['src/Ui', 'src/ui']);
  });

  it('een map met verschillende bestanden erin', () => {
    expect(botsingen('src/Ui/a.ts', 'src/ui/b.ts')).toEqual([['src/Ui', 'src/ui']]);
  });

  it('een platformsuffix naast een component', () => {
    expect(botsingen('src/Foo.tsx', 'src/foo.web.ts')).toHaveLength(1);
  });

  it('Unicode in andere normalisatie', () => {
    expect(botsingen('a/caf\u00e9.ts', 'a/cafe\u0301.ts')).toHaveLength(1);
  });

  it('meldt elke groep apart', () => {
    const uit = botsingen('a/X.ts', 'a/x.tsx', 'b/Y.ts', 'b/y.ts', 'b/z.ts');
    expect(uit).toHaveLength(2);
  });
});

describe('wat de controle met rust moet laten', () => {
  it('een testbestand naast zijn bron (stam foo tegen foo.test)', () => {
    expect(botsingen('src/foo.ts', 'src/foo.test.ts')).toEqual([]);
  });

  it('dezelfde stam in verschillende mappen', () => {
    expect(botsingen('src/a/Foo.tsx', 'src/b/foo.ts')).toEqual([]);
  });

  it('een verschillende stam', () => {
    expect(botsingen('src/Taakbalk.tsx', 'src/tabbladen.ts')).toEqual([]);
  });

  it('hetzelfde pad twee keer aangeboden', () => {
    expect(botsingen('src/a.ts', 'src/a.ts')).toEqual([]);
  });

  it('een punt in een mapnaam is geen extensie', () => {
    expect(botsingen('a.b/Foo', 'a.b/foo')).toHaveLength(1);
    expect(botsingen('a.b/foo', 'a.c/foo')).toEqual([]);
  });
});
