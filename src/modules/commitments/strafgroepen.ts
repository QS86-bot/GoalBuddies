import type { MogelijkeBegunstigde } from './api';

/**
 * De ene beslissing van de keuzelijst van een straf: welke groepen gelden als
 * groep, en van welke groepen de leden in aanmerking komen — QS8-698.
 *
 * ⚠️ Puur, zonder imports: zo is de regel in een gewone Node-toets te
 *    bewijzen, zonder de app-laag mee te laden. `strafkeuzes.ts` haalt de
 *    gegevens op en roept deze functies aan.
 */

export interface StrafGroep {
  readonly id: string;
  readonly name: string;
}

export interface StrafKeuzes {
  /** Het aandeel zelf is een teamdoel, en dus is de groepslijst het team. */
  readonly aandeel: boolean;
  readonly groepen: readonly StrafGroep[];
  readonly personen: readonly MogelijkeBegunstigde[];
}

/**
 * PostgREST-codes voor "deze tabel of kolom bestaat er nog niet". Die betekenen
 * precies één ding: productie staat vóór de teamketen, en dan bestaat er geen
 * aandeel en geen organisatie. Elke andere fout blijft een fout.
 */
// PGRST205 is de schema-cache-variant van "tabel bestaat niet" in nieuwere PostgREST-versies.
// Niet tegen productie gemeten: zie het beslisdocument.
const TABEL_ONBEKEND = ['42P01', 'PGRST205'];
const KOLOM_ONBEKEND = '42703';

export function isTabelOnbekend(code: string | undefined): boolean {
  return code !== undefined && TABEL_ONBEKEND.includes(code);
}

export function isKolomOnbekend(code: string | undefined): boolean {
  return code === KOLOM_ONBEKEND;
}

/** Een groep van de gebruiker, met of hij van een organisatie is. */
export interface MijnGroep {
  readonly id: string;
  readonly name: string;
  readonly organization_id: string | null;
}

/**
 * De ene beslissing: welke groepen gelden als groep, en van welke groepen de
 * leden als persoon in aanmerking komen. Puur, zodat de regel zonder database te
 * toetsen is.
 */
export function strafGroepen(
  mijn: readonly MijnGroep[],
  teamGroepId: string | null,
): { groepen: readonly StrafGroep[]; ledenVan: readonly string[] } {
  if (teamGroepId !== null) {
    const team = mijn.find((g) => g.id === teamGroepId);
    // ⚠️ Geen lidmaatschap van het team: geen groep en geen leden. Dat is een
    //    gebruiker die het team verliet terwijl het aandeel nog van hem is.
    if (team === undefined) return { groepen: [], ledenVan: [] };
    return { groepen: [{ id: team.id, name: team.name }], ledenVan: [team.id] };
  }
  const privé = mijn.filter((g) => g.organization_id === null);
  return {
    groepen: privé.map((g) => ({ id: g.id, name: g.name })),
    ledenVan: privé.map((g) => g.id),
  };
}
