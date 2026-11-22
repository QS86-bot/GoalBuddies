import type { RpcRij } from '../../shared/api';

import type { Klassementsrij } from './klassement';

/**
 * De vorm van "Alle klassementen" — QS8-666 (A57b), deel 3c-ui, fase A.
 *
 * ⚠️ **Dit bestand kent de RPC `mijn_klassementen()` (0338) als vorm en roept hem niet aan.** De rijen komen plat binnen, één per
 *    (groep, lid), de bovenste vijf van elke groep plus de eigen rij als die er niet bij zit. Hier worden ze één kaart per groep.
 *
 * ⚠️ **De plek is die van de database en wordt hier nooit uitgerekend.** `positie` komt uit `rank()` in de RPC: bij een gelijke stand
 *    over de grens van vijf heen staan twee leden allebei op "4", en wie zelf `index + 1` toont, verzint een slechtere plek dan de
 *    database geeft. Er wordt hier niets gesorteerd, niets opgeteld over groepen heen en geen afstand tot een ander berekend:
 *    dat zou de afgewezen lezing B zijn (een ranglijst over groepen heen, `docs/decisions/2026-09-03-een-klassement-in-elke-groep.md`).
 *
 * ⚠️ **Geen delta en geen datum**: de RPC heeft die kolommen niet, en deze vorm voegt ze nooit toe.
 */
type RpcKlassementenRij = RpcRij<{
  group_id: string;
  group_name: string;
  user_id: string;
  display_name: string;
  punten: number;
  positie: number;
  total_members: number;
  total_groups: number;
}>;

export interface KlassementenRij extends Klassementsrij {
  readonly groupId: string;
  readonly groepnaam: string;
  readonly ledental: number;
  readonly totaalGroepen: number;
}

/** Eén regel op de kaart: een klassementsregel met de markering of hij van de kijker is. */
export interface Klassementregel extends Klassementsrij {
  readonly jij: boolean;
}

export interface Klassementkaart {
  readonly groupId: string;
  readonly groepnaam: string;
  /** De bovenste vijf, in de volgorde van de RPC. */
  readonly bovenste: readonly Klassementregel[];
  /** De eigen regel als die niet bij de bovenste vijf zit, anders `null`. */
  readonly eigen: Klassementregel | null;
  /** Het aantal leden dat meetelt, zoals `groep_klassement()` het telt. */
  readonly ledental: number;
  /** Staat iedereen op nul? Dan toont de kaart de bestaande lege tekst en geen vijf nullen. */
  readonly iedereenOpNul: boolean;
}

/** De RPC knipt op vijf regels per groep; een zesde is de eigen regel. */
export const KLASSEMENT_BOVENSTE = 5;

/**
 * Zet één RPC-rij om, of `null` als hij onbruikbaar is.
 *
 * ⚠️ Zelfde reden als `naarRij()` in `klassement.ts`: de typen beschrijven wat de functie belooft, niet wat er over de lijn komt. Een
 *    hernoemde kolom geeft hier `null` per rij, en dus een leeg scherm; `tests/beloftes/klassementen-kolommen.test.ts` legt de
 *    kolomnamen naast `RETURNS TABLE` van de migratie.
 */
export function naarKlassementenRij(rij: RpcKlassementenRij): KlassementenRij | null {
  if (typeof rij.group_id !== 'string') return null;
  if (typeof rij.user_id !== 'string') return null;
  if (typeof rij.punten !== 'number') return null;
  if (typeof rij.positie !== 'number') return null;

  return {
    groupId: rij.group_id,
    groepnaam: rij.group_name ?? '',
    userId: rij.user_id,
    naam: rij.display_name ?? '',
    punten: rij.punten,
    positie: Number(rij.positie),
    ledental: Number(rij.total_members ?? 0),
    totaalGroepen: Number(rij.total_groups ?? 0),
  };
}

function naarRegel(rij: KlassementenRij, mijnId: string): Klassementregel {
  return { userId: rij.userId, naam: rij.naam, punten: rij.punten, positie: rij.positie, jij: rij.userId === mijnId };
}

/**
 * Eén kaart per groep, in de volgorde waarin de groepen voor het eerst voorkomen (de RPC sorteert op de datum waarop je lid werd).
 *
 * Per groep: de eerste vijf rijen zijn de bovenste vijf; een zesde rij is alleen de eigen regel als hij van de kijker is, en wordt
 * anders genegeerd (verdedigend: de RPC geeft hem alleen aan de aanroeper). Alles daarna wordt genegeerd.
 */
export function groepeerKlassementen(rijen: readonly KlassementenRij[], mijnId: string): readonly Klassementkaart[] {
  const volgorde: string[] = [];
  const perGroep = new Map<string, KlassementenRij[]>();

  for (const rij of rijen) {
    const lijst = perGroep.get(rij.groupId);
    if (lijst === undefined) {
      volgorde.push(rij.groupId);
      perGroep.set(rij.groupId, [rij]);
    } else {
      lijst.push(rij);
    }
  }

  return volgorde.map((groupId) => {
    const lijst = perGroep.get(groupId) ?? [];
    const eerste = lijst[0];
    const bovenste = lijst.slice(0, KLASSEMENT_BOVENSTE).map((r) => naarRegel(r, mijnId));
    const zesde = lijst[KLASSEMENT_BOVENSTE];
    return {
      groupId,
      groepnaam: eerste?.groepnaam ?? '',
      bovenste,
      eigen: zesde !== undefined && zesde.userId === mijnId ? naarRegel(zesde, mijnId) : null,
      ledental: eerste?.ledental ?? 0,
      iedereenOpNul: lijst.every((r) => r.punten === 0),
    };
  });
}

/**
 * Voegt bladzijden samen zonder dubbele groepen: wie tussen twee bladzijden ergens lid wordt, verschuift de offset, en dan komt
 * een groep op twee bladzijden voor. De eerste wint.
 */
export function uniekeKaarten(kaarten: readonly Klassementkaart[]): readonly Klassementkaart[] {
  const gezien = new Set<string>();
  const uit: Klassementkaart[] = [];
  for (const kaart of kaarten) {
    if (gezien.has(kaart.groupId)) continue;
    gezien.add(kaart.groupId);
    uit.push(kaart);
  }
  return uit;
}

/** Staan er meer leden in de groep dan de kaart toont? Dan hoort er een link naar het hele klassement bij. */
export function toonAlleLeden(kaart: Klassementkaart): boolean {
  return kaart.ledental > kaart.bovenste.length + (kaart.eigen === null ? 0 : 1);
}
