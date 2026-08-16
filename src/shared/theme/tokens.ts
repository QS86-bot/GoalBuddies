/**
 * Het Q-Projects navy-stelsel, gedeeld met de Status Tracker.
 *
 * ⚠️ Waarden zijn letterlijk overgenomen uit `tracker.q-projects.tech`, thema's
 *    `navy` en `navy-licht`. **Verzin hier nooit een kleur bij.** Heb je een
 *    tint nodig die er niet in zit, neem hem dan eerst op in het Q-Projects-
 *    stelsel — anders lopen de twee apps uit elkaar.
 *
 * Navy is de ondergrond. Het accent is goud.
 */

export interface Palette {
  /** Achtergrond van het scherm. */
  readonly bg: string;
  /** Vlak waarop inhoud staat: kaarten, panelen. */
  readonly panel: string;
  /** Iets dieper vlak, voor nesting binnen een paneel. */
  readonly panelDark: string;
  readonly border: string;
  /** Merkkleur. Goud, geen blauw. */
  readonly accent: string;
  readonly accentDim: string;
  /** Voortgang: afgerond, goedgekeurd, vloer of plafond gehaald. */
  readonly green: string;
  /** Wacht op actie: goedkeuring pending, week nog niet gestart. */
  readonly orange: string;
  /** ⚠️ Uitsluitend deadline-risico. Nooit voor een gemiste week (domeinregel 7). */
  readonly red: string;
  readonly grey: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly gridLine: string;
}

export const navy: Palette = {
  bg: '#0e1730',
  panel: '#17224a',
  panelDark: '#121b3b',
  border: 'rgba(255,255,255,0.09)',
  accent: '#e8b648',
  accentDim: '#cd9d34',
  green: '#3fbf8f',
  orange: '#f0803c',
  red: '#f05a54',
  grey: '#6e7fa8',
  text: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.68)',
  gridLine: 'rgba(232,182,72,0.028)',
};

export const navyLight: Palette = {
  bg: '#f4f5f8',
  panel: '#ffffff',
  panelDark: '#eef0f5',
  border: '#d8dde8',
  accent: '#a87a22',
  accentDim: '#8a6620',
  green: '#1f7a56',
  orange: '#b3541c',
  red: '#b8352f',
  grey: '#6b7793',
  text: '#141e3c',
  textSecondary: '#55607a',
  gridLine: 'rgba(20,30,60,0.035)',
};

/**
 * Betekenisrollen. Componenten praten in rollen, niet in kleuren — dan blijft
 * "wat betekent deze kleur" op één plek staan.
 */
export function roles(p: Palette) {
  return {
    brand: p.accent,
    progress: p.green,
    pending: p.orange,
    atRisk: p.red,
    neutral: p.grey,
  } as const;
}

export const radius = {
  sm: 4,
  base: 8,
  md: 14,
  pill: 999,
} as const;

/** Ruimte in `[verticaal, horizontaal]`, exact zoals in het Q-Projects-stelsel. */
export const space = {
  paneel: { paddingVertical: 10, paddingHorizontal: 13 },
  sectie: { paddingVertical: 10, paddingHorizontal: 14 },
  rij: { paddingVertical: 5, paddingHorizontal: 0 },
  kaart: { paddingVertical: 9, paddingHorizontal: 12 },
  cel: { paddingVertical: 5, paddingHorizontal: 9 },
  veld: { paddingVertical: 6, paddingHorizontal: 10 },
  blokGap: 11,
  shell: 14,
} as const;

/**
 * Lato, met dezelfde terugvalstack als de Status Tracker. In het navy-thema is
 * er geen aparte monospace: mono verwijst naar dezelfde stack.
 */
export const fontSans =
  'Lato, system-ui, -apple-system, "Segoe UI", sans-serif';
export const fontMono = fontSans;

/**
 * Schaduw als React Native-stijl. De CSS-equivalenten uit het Q-Projects-stelsel
 * staan erbij, zodat web en native niet uit elkaar lopen.
 */
export const shadow = {
  /** CSS: `0 4px 12px rgba(0,0,0,.3)` */
  navy: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  /** CSS: `0 1px 2px rgba(20,30,60,.06), 0 4px 12px rgba(20,30,60,.08)` */
  navyLight: {
    shadowColor: '#141e3c',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;
