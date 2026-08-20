/**
 * De Risico-radar in gewone taal — QS8-93, QS8-94.
 *
 * Puur, zonder renderer. De berekening zelf staat in `herbereken_risico()` in
 * de database (migratie 0051), want die moet draaien bij de rollover én bij elke
 * goedkeuring en er hoort maar één implementatie te zijn. Dit bestand vertaalt
 * de uitkomst; het rekent niets opnieuw uit.
 *
 * ⚠️ **Rood mag hier, en alleen hier.** `shared/theme/tokens.ts` zegt het bij de
 *    kleur zelf: `red` is uitsluitend voor deadline-risico en nooit voor een
 *    gemiste week (domeinregel 7). De Risico-radar is precies waar die kleur
 *    voor bedoeld is — en dan nog alleen bij de zwaarste stand.
 *
 * ⚠️ **Uitsluitend voor de eigenaar.** QS8-94 zegt het met zoveel woorden en
 *    migratie 0050 dwingt het af: `goal_risk` is eigenaar-only. Kopieer deze
 *    labels nooit naar een groepsscherm — een risicostand is een afgeleide van
 *    gemiste weken, en dat is het soort signaal waar domeinregel 7 over gaat.
 */

/** Zoals `goal_risk.status` in de database. */
export type RisicoStand = 'on_track' | 'at_risk' | 'behind' | 'unreachable';

/**
 * De onderbouwing die `herbereken_risico()` meeschrijft in `goal_risk.reason`.
 *
 * ⚠️ Alles optioneel, en dat is geen slordigheid. De database schrijft `null`
 *    voor een tempo dat niet te berekenen is (geen geschiedenis) en laat het
 *    hele blok weg bij een niet-actief doel. Een scherm dat aanneemt dat de
 *    getallen er zijn, toont "NaN weken" op het moment dat iemand net begint.
 */
export interface RisicoReden {
  readonly weken_over?: number | null;
  readonly open_mijlpalen?: number | null;
  readonly mijlpalen_af?: number | null;
  readonly cycli_bekeken?: number | null;
  readonly cycli_gehaald?: number | null;
  readonly tempo?: number | null;
  readonly benodigd_tempo?: number | null;
  readonly vloeraandeel?: number | null;
}

/** Het label op de kaart. Kort — de uitleg staat achter "waarom?". */
export function risicoLabel(stand: RisicoStand): string {
  switch (stand) {
    case 'on_track':
      return 'Op koers';
    case 'at_risk':
      return 'Oppassen';
    case 'behind':
      return 'Achterstand';
    case 'unreachable':
      return 'Deadline onhaalbaar';
  }
}

/**
 * De kleurrol. Vorm én kleur dragen de betekenis (QS8-94, criterium 2), dus dit
 * gaat altijd samen met een eigen vorm — kleur alleen is onbruikbaar voor wie
 * hem niet onderscheidt.
 */
export function risicoToon(stand: RisicoStand): 'progress' | 'pending' | 'atRisk' | 'neutral' {
  switch (stand) {
    case 'on_track':
      return 'progress';
    case 'at_risk':
      return 'pending';
    case 'behind':
      return 'pending';
    case 'unreachable':
      return 'atRisk';
  }
}

/**
 * Het vormteken naast het label.
 *
 * ⚠️ Vier verschillende vormen en niet vier tinten van hetzelfde. Ongeveer één
 *    op de twaalf mannen ziet rood en groen niet uit elkaar; met alleen kleur is
 *    "op koers" dan niet te onderscheiden van "deadline onhaalbaar", en dat zijn
 *    net de twee die het verst uit elkaar liggen.
 */
export function risicoTeken(stand: RisicoStand): string {
  switch (stand) {
    case 'on_track':
      return '●';
    case 'at_risk':
      return '◐';
    case 'behind':
      return '◑';
    case 'unreachable':
      return '▲';
  }
}

function afgerond(getal: number): string {
  return (Math.round(getal * 10) / 10).toString().replace('.', ',');
}

/**
 * Waarom staat dit doel zo? — QS8-93 criterium 5, QS8-94 criterium 4.
 *
 * ⚠️ De toon is beschrijvend en niet bestraffend. "Je hebt drie van de vier
 *    weken gemist" is waar en het is precies de zin die iemand de app laat
 *    sluiten; "je haalde één van de vier weken" zegt hetzelfde zonder het
 *    verwijt. Dit scherm is privé, maar domeinregel 7 gaat ook over toon.
 *
 * ⚠️ Elke tak controleert of de getallen er zijn. Een doel zonder geschiedenis
 *    heeft geen tempo, en dan hoort er een zin te staan die dát uitlegt in
 *    plaats van een berekening met gaten erin.
 */
export function risicoUitleg(stand: RisicoStand, reden: RisicoReden | null): string {
  const r = reden ?? {};
  const weken = r.weken_over ?? null;
  const open = r.open_mijlpalen ?? null;
  const bekeken = r.cycli_bekeken ?? null;
  const gehaald = r.cycli_gehaald ?? null;

  if (stand === 'unreachable') {
    if (weken === 0 && open !== null && open > 0) {
      return `Je streefdatum is er, en er staan nog ${open} mijlpalen open. Verschuif je datum of haal er werk uit.`;
    }
    if (open !== null && weken !== null) {
      return `Er staan ${open} mijlpalen open en er zijn nog ${weken} weken. Zelfs met één mijlpaal per week red je dat niet.`;
    }
    return 'Er is meer werk over dan er tijd is tot je streefdatum.';
  }

  if (stand === 'behind') {
    if (bekeken !== null && gehaald !== null && gehaald === 0) {
      return `Je hebt de laatste ${bekeken} weken geen week afgerond, en er staat nog werk open. Dit is het moment om je doel kleiner te maken of je datum te verschuiven.`;
    }
    if (bekeken !== null && gehaald !== null && open !== null && weken !== null) {
      return `Je haalde ${gehaald} van je laatste ${bekeken} weken. Om ${open} mijlpalen in ${weken} weken af te ronden heb je een hoger tempo nodig dan dat.`;
    }
    return 'Je hebt een hoger tempo nodig dan je de laatste weken haalde.';
  }

  if (stand === 'at_risk') {
    const vloer = r.vloeraandeel ?? null;
    if (vloer !== null && vloer >= 0.75) {
      return 'Je haalt je weken, maar bijna altijd op de vloer. Dat telt volledig mee — alleen schuift je plafond zo wel steeds verder weg.';
    }
    if (open !== null && weken !== null && r.benodigd_tempo != null && r.tempo != null) {
      return `Je hebt ${open} mijlpalen in ${weken} weken te gaan. Dat vraagt ${afgerond(r.benodigd_tempo)} per week; je zit nu op ${afgerond(r.tempo)}.`;
    }
    return 'Je loopt nog binnen de lijnen, maar er is weinig ruimte over.';
  }

  // on_track
  if (bekeken === null || bekeken === 0) {
    return 'Nog geen geschiedenis om iets uit af te leiden — en dat is prima. Een nieuw doel begint op koers.';
  }
  if (gehaald !== null && open !== null && weken !== null) {
    return `Je haalde ${gehaald} van je laatste ${bekeken} weken, met ${open} mijlpalen in ${weken} weken te gaan. Dat gaat lukken.`;
  }
  return 'Je tempo is genoeg voor wat er nog ligt.';
}
