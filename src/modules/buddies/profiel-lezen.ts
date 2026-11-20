/**
 * De zuivere helft van het profiel van een groepsgenoot — QS8-750: tabs en
 * parsers, zonder netwerk en zonder React Native, zodat ze met de hand te
 * voeden zijn (`profiel.test.ts`). De aanroepen staan in `profiel.ts`.
 */
export const PROFIEL_TABS_ANDER = ['voltooiingen', 'groepen'] as const;
export const PROFIEL_TABS_EIGEN = [
  'voltooiingen',
  'groepen',
  'statistieken',
  'prestaties',
] as const;

export type ProfielTab = (typeof PROFIEL_TABS_EIGEN)[number];

/**
 * De tabs die bij dit profiel horen.
 *
 * ⚠️ Een lijst per soort kijker en geen filter over één lijst: een tab die er
 *    voor een ander niet is, staat niet in zijn lijst en kan dus ook niet
 *    "per ongeluk" zichtbaar worden door een vergeten voorwaarde.
 */
export function profielTabs(ikZelf: boolean): readonly ProfielTab[] {
  return ikZelf ? PROFIEL_TABS_EIGEN : PROFIEL_TABS_ANDER;
}

/** Tabs die alleen op je eigen profiel bestaan: ze leiden naar eigen schermen. */
export function isEigenTab(tab: ProfielTab): boolean {
  return !(PROFIEL_TABS_ANDER as readonly string[]).includes(tab);
}

export const PROFIEL_DOELEN_PER_PAGINA = 50;

export interface LidProfiel {
  readonly userId: string;
  readonly naam: string;
  readonly avatarUrl: string | null;
  readonly benIk: boolean;
}

export interface ProfielDoel {
  readonly goalId: string;
  readonly titel: string;
  readonly categorie: string;
  readonly voltooid: boolean;
  readonly mijlpalenTotaal: number;
  readonly mijlpalenKlaar: number;
}

export interface GedeeldeGroep {
  readonly groupId: string;
  readonly naam: string;
  readonly icoon: string | null;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/** Postgres geeft `bigint` als getal of als tekst terug, afhankelijk van de laag. */
function alsGetal(x: unknown): number | null {
  const n = typeof x === 'string' ? Number(x) : x;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null;
}

/** Eén profielrij, of `null` als er niets (geldigs) is. */
export function leesProfiel(data: unknown): LidProfiel | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const rij: unknown = data[0];
  if (!isRecord(rij)) return null;
  if (typeof rij.id !== 'string' || typeof rij.display_name !== 'string') return null;
  return {
    userId: rij.id,
    naam: rij.display_name,
    avatarUrl: typeof rij.avatar_url === 'string' ? rij.avatar_url : null,
    benIk: rij.ben_ik === true,
  };
}

/** Een rij die er niet uitziet zoals beloofd wordt overgeslagen, niet geraden. */
export function leesDoelen(data: unknown): readonly ProfielDoel[] {
  if (!Array.isArray(data)) return [];
  const uit: ProfielDoel[] = [];
  for (const rij of data as readonly unknown[]) {
    if (!isRecord(rij)) continue;
    const totaal = alsGetal(rij.mijlpalen_totaal);
    const klaar = alsGetal(rij.mijlpalen_klaar);
    if (
      typeof rij.goal_id !== 'string' ||
      typeof rij.titel !== 'string' ||
      typeof rij.categorie !== 'string' ||
      typeof rij.voltooid !== 'boolean' ||
      totaal === null ||
      klaar === null
    ) {
      continue;
    }
    uit.push({
      goalId: rij.goal_id,
      titel: rij.titel,
      categorie: rij.categorie,
      voltooid: rij.voltooid,
      mijlpalenTotaal: totaal,
      mijlpalenKlaar: Math.min(klaar, totaal),
    });
  }
  return uit;
}

export function leesGroepen(data: unknown): readonly GedeeldeGroep[] {
  if (!Array.isArray(data)) return [];
  const uit: GedeeldeGroep[] = [];
  for (const rij of data as readonly unknown[]) {
    if (!isRecord(rij)) continue;
    if (typeof rij.group_id !== 'string' || typeof rij.naam !== 'string') continue;
    uit.push({
      groupId: rij.group_id,
      naam: rij.naam,
      icoon: typeof rij.icoon === 'string' ? rij.icoon : null,
    });
  }
  return uit;
}
