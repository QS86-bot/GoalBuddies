/**
 * Vrije datums naar hele weken — QS8-227.
 *
 * ⚠️ **Een eigen bestand, en dat is geen ordelijkheid maar een voorwaarde.**
 *    `adempauze.ts` importeert de Supabase-client, en die trekt React Native
 *    mee; een test in Node kan dat bestand daarom niet laden. Reken- en
 *    schermlogica die je wilt kunnen toetsen, hoort niet in hetzelfde bestand
 *    als de netwerkaanroep. Zelfde scheiding als `overzicht-stand.ts`.
 */
import { t } from '../../shared/i18n';

import { cyclesBetween, userCycleOn, type Cycle, type UserClock } from '../../shared/time';

import type { Resultaat } from '../../shared/api';

/**
 * De langste adempauze die `plan_adempauze()` accepteert, in hele cycli.
 *
 * ⚠️ **Dit getal staat ook in de database**, als `c_max_cycli` in
 *    `supabase/migrations/0165_...sql`. Daar hoort het thuis — een grens die
 *    alleen in de client staat, is geen grens. Deze kopie bestaat zodat het
 *    scherm hem kan tónen, en er staat een test op die de twee naast elkaar
 *    legt.
 *
 * ⚠️ **Waarom er überhaupt een grens is**, terwijl QS8-227 "elke lengte" zegt:
 *    `annuleer_adempauze()` weigert alles waarvan `starts_cycle <= vandaag`, dus
 *    een pauze die in het verleden begint is nooit meer te annuleren. Zonder
 *    plafond zet één verkeerd getypt jaartal het doel permanent op pauze.
 *    Afweging in `docs/decisions/2026-09-06-de-adempauze-wordt-vrij.md` §7.
 */
export const MAX_ADEMPAUZE_CYCLI = 52;

/** De hele weken waar twee vrij ingetypte datums op uitkomen. */
export interface AdempauzePeriode {
  readonly start: Cycle;
  readonly eind: Cycle;
  /** Aantal hele cycli, inclusief begin en eind. Altijd minstens 1. */
  readonly weken: number;
}

/**
 * Wat twee vrij ingetypte datums als adempauze betekenen — QS8-227.
 *
 * ⚠️ **Dit rondt af, en dat is geen schoonheidsfoutje maar de vertaling tussen
 *    twee eenheden.** De gebruiker denkt in datums, de rollover werkt in cycli.
 *    `breathers_hele_cycli` en de weekdagtoets in `plan_adempauze()` blijven
 *    daarom staan (QS8-227 punt 2): een pauze van woensdag tot woensdag dekt
 *    twee hálve cycli, en dan doet de rollover iets anders dan het scherm
 *    belooft. Het scherm laat vrije datums toe en **toont** wat ze worden;
 *    zonder dat tonen is afronden stilzwijgend iets anders doen dan gevraagd.
 *
 * ⚠️ **Rekent zelf niets uit.** `userCycleOn` en `cyclesBetween` komen uit
 *    `shared/time` (correctheidsregel 7). Een eigen `- (dow - startDag)` hier is
 *    de tweede kopie van de weekgrens, en dan is er geen bron van waarheid meer.
 *
 * ⚠️ **Een lege einddatum betekent één week en niet "ongeldig".** Eén week is
 *    het gewone geval; twee keer dezelfde datum overtypen is werk zonder reden.
 *
 * ⚠️ **Dit oordeelt bijna nergens over.** Overlap, eigenaarschap en de weekdag
 *    blijven van `plan_adempauze()`. Eén uitzondering: de bovengrens van
 *    `MAX_ADEMPAUZE_CYCLI`, want die moet je zíen voordat je op inplannen drukt
 *    — een veld waarin `9999` mag en dat daarna weigert, is geen vrije invoer
 *    maar een val.
 *
 * ⚠️ **En dat is dus een regel die op twee plekken woont.** Precies de vorm die
 *    stil uit de pas gaat lopen, dus er staat een test op de naad:
 *    `tests/rls/epic8.test.ts` leest `c_max_cycli` uit de gedéployde functie en
 *    legt hem naast deze constante. Gaan ze uiteen, dan wordt die test rood en
 *    niet de gebruiker.
 */
export function periodeUitDatums(
  klok: UserClock,
  vanaf: string,
  tot: string,
): Resultaat<AdempauzePeriode> {
  const start = userCycleOn(klok, vanaf.trim());
  if (start === null) {
    return { ok: false, melding: t('adempauze.datum_ongeldig') };
  }

  const eindInvoer = tot.trim() === '' ? vanaf.trim() : tot.trim();
  const eind = userCycleOn(klok, eindInvoer);
  if (eind === null) {
    return { ok: false, melding: t('adempauze.datum_ongeldig') };
  }

  const weken = cyclesBetween(start, eind) + 1;
  if (weken < 1) {
    return { ok: false, melding: t('adempauze.eind_voor_start') };
  }

  if (weken > MAX_ADEMPAUZE_CYCLI) {
    return { ok: false, melding: t('adempauze.te_lang', { max: MAX_ADEMPAUZE_CYCLI }) };
  }

  return { ok: true, waarde: { start, eind, weken } };
}
