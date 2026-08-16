/**
 * WCAG-contrastberekening. Staat hier zodat de contrasteisen uit het design
 * system in een test kunnen worden vastgelegd in plaats van in een belofte.
 */

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (hex?.[1]) {
    const raw = hex[1];
    const full =
      raw.length === 3
        ? raw
            .split('')
            .map((c) => c + c)
            .join('')
        : raw;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (rgba?.[1]) {
    const parts = rgba[1].split(',').map((p) => Number(p.trim()));
    const [r, g, b, a] = parts;
    if (r === undefined || g === undefined || b === undefined) {
      throw new Error(`Onvolledige rgb-kleur: ${value}`);
    }
    return { r, g, b, a: a ?? 1 };
  }

  throw new Error(`Onbekend kleurformaat: ${value}`);
}

/** Legt een half-transparante kleur op een ondoorzichtige ondergrond. */
export function composite(front: string, back: string): Rgba {
  const f = parseColor(front);
  const b = parseColor(back);
  if (f.a >= 1) return f;

  return {
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
    a: 1,
  };
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }: Rgba): number {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/**
 * De contrastverhouding tussen voor- en achtergrond, van 1 (identiek) tot 21
 * (zwart op wit). Transparantie in de voorgrond wordt eerst op de achtergrond
 * samengesteld.
 */
export function contrastRatio(foreground: string, background: string): number {
  const front = relativeLuminance(composite(foreground, background));
  const back = relativeLuminance(parseColor(background));

  const lighter = Math.max(front, back);
  const darker = Math.min(front, back);

  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG-drempels. */
export const WCAG = {
  /** AA voor gewone tekst. */
  AA_TEXT: 4.5,
  /** AA voor grote tekst (18pt, of 14pt vet) en voor UI-componenten en randen. */
  AA_LARGE: 3,
  /** AAA voor gewone tekst. */
  AAA_TEXT: 7,
} as const;
