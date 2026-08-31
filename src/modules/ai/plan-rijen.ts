/**
 * Van een voorgesteld plan naar de rijen die eronder moeten — QS8-201.
 *
 * ⚠️ **Dit is de naad die QS8-201 aanwijst** (onwrikbare regel 18, vraag 1):
 *    "waar het gegenereerde plan wordt omgezet naar échte rijen. Dat is de plek
 *    waar 'de AI stelde zes mijlpalen voor' en 'er staan zes mijlpalen in de
 *    database met de goede volgorde en één weekdoel in de goede cyclus' uit
 *    elkaar kunnen lopen."
 *
 * ⚠️ **Puur, en importeert de Supabase-client niet.** Zelfde reden als
 *    `uitvoer.ts`: het schrijven staat in `plan-toepassen.ts`, het rékenwerk
 *    hier. Anders trekt elke test die deze regels raakt React Native mee in een
 *    Node-test — en dat is in deze codebase al drie keer misgegaan.
 */

import type { VoorstelMijlpaal, VoorstelPlan } from './uitvoer';

/** Een mijlpaalrij zoals hij de database in gaat. */
export interface MijlpaalRij {
  readonly title: string;
  readonly description: string | null;
  readonly target_date: string | null;
  readonly order_index: number;
}

/** Wat er uit één plan aan rijen volgt. */
export interface PlanRijen {
  readonly doel: {
    readonly title: string;
    readonly category: VoorstelPlan['category'];
    readonly identity_statement: string | null;
    readonly target_date: string;
  };
  readonly mijlpalen: readonly MijlpaalRij[];
  /**
   * Het eerste weekdoel, of `null`.
   *
   * ⚠️ `milestone_index` en niet `milestone_id`: het doel bestaat nog niet, dus
   *    de mijlpalen hebben nog geen id. `plan-toepassen.ts` vult het echte id in
   *    ná het aanmaken. Zou hier een id staan, dan zou dit bestand moeten weten
   *    hoe de database heet.
   */
  readonly weekdoel: {
    readonly title: string;
    readonly floor_text: string;
    readonly ceiling_text: string;
    readonly milestone_index: number;
  } | null;
}

/**
 * Hoeveel mijlpalen er hoogstens uit één plan komen.
 *
 * ⚠️ Niet omdat het model er meer zou verzinnen, maar omdat één plan één
 *    schermvullend voorstel moet blijven dat je kunt overzien vóór je
 *    bevestigt. Wat erboven komt, valt af — en dat is zichtbaar, want het scherm
 *    toont wat er staat.
 */
export const MAX_MIJLPALEN = 12;

/**
 * Zet een voorstel om in de rijen die eronder moeten.
 *
 * `streefdatum` is de datum die de gebruiker zelf invulde, niet iets uit het
 * model — dat is het tweede van de twee velden op het scherm.
 */
export function rijenUitPlan(plan: VoorstelPlan, streefdatum: string): PlanRijen {
  const mijlpalen = bruikbareMijlpalen(plan.milestones, streefdatum).slice(0, MAX_MIJLPALEN);

  return {
    doel: {
      title: plan.title,
      category: plan.category,
      identity_statement: plan.identity_statement,
      target_date: streefdatum,
    },
    mijlpalen,
    weekdoel:
      plan.first_weekly_goal === null || mijlpalen.length === 0
        ? null
        : {
            title: plan.first_weekly_goal.title,
            floor_text: plan.first_weekly_goal.floor_text,
            ceiling_text: plan.first_weekly_goal.ceiling_text,
            // ⚠️ Onder de eerste mijlpaal, en dat is het acceptatiecriterium:
            //    "het eerste weekdoel onder mijlpaal 1". Zijn er geen mijlpalen,
            //    dan is er niets om hem onder te hangen en valt hij weg — een
            //    weekdoel zonder mijlpaal is een rij die nergens bij hoort.
            milestone_index: 0,
          },
  };
}

/**
 * De mijlpalen die de database aankan, in volgorde en genummerd.
 *
 * ⚠️ **`order_index` telt vanaf 1 en is aaneengesloten, ook als er rijen
 *    afvallen.** `maakMijlpaal()` doet `(laatste ?? 0) + 1`, dus 1 is waar de
 *    database zelf begint. Zou de index de plek in de ónbewerkte lijst volgen,
 *    dan ontstaat er een gat zodra er één mijlpaal wegvalt — en dan klopt de
 *    volgorde op het scherm niet meer met de nummering eronder.
 *
 * ⚠️ **Een streefdatum ná die van het doel wordt `null` en gooit de mijlpaal
 *    niet weg.** Het model schat de tussendatums; dat het er eentje voorbij de
 *    einddatum legt, maakt de stap zelf niet onzinnig. Een mijlpaal zonder datum
 *    is een bestaande, geldige toestand — een mijlpaal ná het einde van het doel
 *    is dat niet.
 */
function bruikbareMijlpalen(
  voorstellen: readonly VoorstelMijlpaal[],
  streefdatum: string,
): readonly MijlpaalRij[] {
  return voorstellen
    .filter((m) => m.title.trim() !== '')
    .map((m, i) => ({
      title: m.title.trim(),
      description: m.description,
      target_date: bruikbareDatum(m.target_date, streefdatum),
      order_index: i + 1,
    }));
}

/**
 * De datum als hij bruikbaar is, anders `null`.
 *
 * ⚠️ Vergelijkt als tekst en niet als `Date`, en dat is hier de juiste keuze:
 *    beide zijn ISO-datums (`YYYY-MM-DD`) en die sorteren lexicografisch gelijk
 *    aan chronologisch. Een `new Date()` erbij zou een tijdzone introduceren op
 *    een plek waar geen klok hoort — correctheidsregel 7.
 */
function bruikbareDatum(datum: string | null, streefdatum: string): string | null {
  if (datum === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
  return datum > streefdatum ? null : datum;
}
