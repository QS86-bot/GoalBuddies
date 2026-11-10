import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings: zelfde patroon als `tekst-controle.test.ts`.
import { casingBotsingen } from '../../scripts/casing-controle.mjs';

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
    const uit = execFileSync('git', ['ls-files', '-z'], {
      cwd: join(__dirname, '..', '..'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(botsingen(...uit.split('\0').filter(Boolean))).toEqual([]);
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
    expect(botsingen('src/Ui/a.ts', 'src/ui/a.ts')).toHaveLength(1);
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
