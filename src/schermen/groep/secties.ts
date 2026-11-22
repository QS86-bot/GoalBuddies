import type { Lijstgroep } from '@/modules/buddies';
import { vergelijkTekst } from '@/shared/i18n';

/**
 * De groepenlijst in secties Privé en Werk — QS8-775 (besluit Quinten 20-11-2026, variant A; uitwerking 22-11-2026).
 *
 * ⚠️ **Geen nieuwe leesbron, en dat is besloten (22-11, optie A).** De indeling is een join van twee dingen die de app
 *    al mocht lezen: `organization_id` uit `fetchMijnGroepen()` (sinds QS8-651) en `organizations (id, name)` onder
 *    `organizations_select` (0316): alleen actieve organisaties waar jij actief lid van bent. Er komt dus niets over een
 *    ander bij, alleen de naam van je eigen organisatie als kop. `tests/rls/groepsecties.test.ts` toetst die naad.
 *
 * ⚠️ **`null` betekent: geen koppen.** Zonder één teamgroep ziet Groepen er precies uit als vóór dit issue (criterium
 *    1). Een lege sectie bestaat niet: Privé alleen als er een privégroep is, Werk alleen per organisatie met een groep.
 *
 * ⚠️ **Een teamgroep zonder leesbare organisatie staat onder "Werk" zonder naam, achteraan** (besloten 22-11). Dat is
 *    een organisatie die niet meer actief is: `organizations_select` geeft haar naam dan niet terug. Hij valt nooit stil
 *    weg en komt nooit onder Privé, want hij ís geen privégroep.
 *
 * ⚠️ De volgorde van de groepen binnen een sectie is die van de invoer (`created_at` oplopend); de Werk-secties staan
 *    op naam in de taal van de app, en bij gelijke naam op id, zodat de lijst niet per render verspringt.
 */
export type Groepsectie =
  | { readonly soort: 'prive'; readonly sleutel: 'prive'; readonly groepen: readonly Lijstgroep[] }
  | {
      readonly soort: 'werk';
      /** Het id van de organisatie, of `werk-onbekend` als haar naam niet leesbaar is. */
      readonly sleutel: string;
      readonly organisatienaam: string | null;
      readonly groepen: readonly Lijstgroep[];
    };

export interface LeesbareOrganisatie {
  readonly id: string;
  readonly naam: string;
}

const ONBEKEND = 'werk-onbekend';

export function groepSecties(
  groepen: readonly Lijstgroep[],
  organisaties: readonly LeesbareOrganisatie[],
): readonly Groepsectie[] | null {
  const prive = groepen.filter((g) => g.organization_id === null);
  if (prive.length === groepen.length) return null;

  const namen = new Map(organisaties.map((o) => [o.id, o.naam]));
  const perSleutel = new Map<string, Lijstgroep[]>();
  for (const groep of groepen) {
    if (groep.organization_id === null) continue;
    const sleutel = namen.has(groep.organization_id) ? groep.organization_id : ONBEKEND;
    perSleutel.set(sleutel, [...(perSleutel.get(sleutel) ?? []), groep]);
  }

  const werk = [...perSleutel.entries()]
    .map(([sleutel, lijst]) => ({
      soort: 'werk' as const,
      sleutel,
      organisatienaam: namen.get(sleutel) ?? null,
      groepen: lijst,
    }))
    .sort(werkVolgorde);

  return [...(prive.length > 0 ? [{ soort: 'prive' as const, sleutel: 'prive' as const, groepen: prive }] : []), ...werk];
}

function werkVolgorde(
  a: { readonly sleutel: string; readonly organisatienaam: string | null },
  b: { readonly sleutel: string; readonly organisatienaam: string | null },
): number {
  // Zonder naam achteraan; anders op naam, en bij gelijke naam op id.
  if (a.organisatienaam === null || b.organisatienaam === null) {
    return (a.organisatienaam === null ? 1 : 0) - (b.organisatienaam === null ? 1 : 0);
  }
  return vergelijkTekst(a.organisatienaam, b.organisatienaam) || (a.sleutel < b.sleutel ? -1 : a.sleutel > b.sleutel ? 1 : 0);
}
