import { getal, t, type Sleutel } from '../i18n';

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
  return t(`risico.label.${stand}` as Sleutel);
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

/**
 * Een aantal mét zijn zelfstandig naamwoord: "1 mijlpaal" of "9 mijlpalen".
 *
 * ⚠️ **Tot QS8-115 stond er onvoorwaardelijk "mijlpalen"**, dus "1 mijlpalen"
 *    bestond gewoon. Dat is geen fout die de catalogus introduceert — hij stond
 *    er al — maar het overzetten was het moment om hem te repareren.
 *
 * ⚠️ Twee vormen en niet meer, want dat is wat het Nederlands en het Engels
 *    nodig hebben. Komt er een taal bij met drie (Pools), dan is dit de functie
 *    die stukgaat, en dat is expres: `t()` kent geen meervoudsregels en dat hoort
 *    zichtbaar te zijn. Zie de kop van `shared/i18n`.
 */
function aantal(woord: 'mijlpaal' | 'week', n: number): string {
  return n === 1
    ? t(`eenheid.${woord}_een` as Sleutel)
    : t(`eenheid.${woord}_meer` as Sleutel, { n });
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
 *    plaats van een berekening met gaten erin. Er staat een test op die voor
 *    élke stand met een lege onderbouwing eist dat er geen "NaN", "null" of
 *    "undefined" in de tekst staat.
 */
export function risicoUitleg(stand: RisicoStand, reden: RisicoReden | null): string {
  const r = reden ?? {};
  const weken = r.weken_over ?? null;
  const open = r.open_mijlpalen ?? null;
  const bekeken = r.cycli_bekeken ?? null;
  const gehaald = r.cycli_gehaald ?? null;

  if (stand === 'unreachable') {
    if (weken === 0 && open !== null && open > 0) {
      return t('risico.unreachable.datum_is_er', { mijlpalen: aantal('mijlpaal', open) });
    }
    if (open !== null && weken !== null) {
      return t('risico.unreachable.te_veel_werk', {
        mijlpalen: aantal('mijlpaal', open),
        weken: aantal('week', weken),
      });
    }
    return t('risico.unreachable.kaal');
  }

  if (stand === 'behind') {
    if (bekeken !== null && gehaald !== null && gehaald === 0) {
      return t('risico.behind.niets_afgerond', { weken_bekeken: aantal('week', bekeken) });
    }
    if (bekeken !== null && gehaald !== null && open !== null && weken !== null) {
      return t('risico.behind.tempo', {
        gehaald,
        weken_bekeken: aantal('week', bekeken),
        mijlpalen: aantal('mijlpaal', open),
        weken: aantal('week', weken),
      });
    }
    return t('risico.behind.kaal');
  }

  if (stand === 'at_risk') {
    const vloer = r.vloeraandeel ?? null;
    if (vloer !== null && vloer >= 0.75) {
      return t('risico.at_risk.vloer');
    }
    if (open !== null && weken !== null && r.benodigd_tempo != null && r.tempo != null) {
      return t('risico.at_risk.tempo', {
        mijlpalen: aantal('mijlpaal', open),
        weken: aantal('week', weken),
        benodigd: getal(r.benodigd_tempo),
        tempo: getal(r.tempo),
      });
    }
    return t('risico.at_risk.kaal');
  }

  // on_track
  if (bekeken === null || bekeken === 0) {
    return t('risico.on_track.geen_geschiedenis');
  }
  if (gehaald !== null && open !== null && weken !== null) {
    return t('risico.on_track.tempo', {
      gehaald,
      weken_bekeken: aantal('week', bekeken),
      mijlpalen: aantal('mijlpaal', open),
      weken: aantal('week', weken),
    });
  }
  return t('risico.on_track.kaal');
}
