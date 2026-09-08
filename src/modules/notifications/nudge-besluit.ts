import {
  nudgeReden,
  nudgeVoorpoortReden,
  type Nudgevoorpoort,
  type NudgeSituatie,
} from './regels';

/**
 * De nudge-beslissing, met de dure vragen ná de gratis poort — QS8-341.
 *
 * ⚠️ **Waarom dit in `src/` staat en niet in de Edge Function.** Daar draait
 *    vitest, en de belofte van dit issue is precies iets wat je moet **uitvoeren**
 *    om te toetsen: *een profiel dat de gratis poort niet haalt, stelt nul
 *    databasevragen.* Dat is niet met een blik op de brontekst vast te stellen —
 *    een test die in `notificaties/index.ts` naar de vólgorde van regels kijkt,
 *    verhuist niet mee en bewaakt iets anders (regel 18 vraag 4). Met de vragen
 *    als parameters kan een tellende dubbel gewoon meten dat er nul gesteld zijn.
 *
 * ⚠️ Gaat via `npm run edge:sync` mee naar Deno, zoals `regels.ts` en
 *    `paginas()`.
 */

/**
 * De zes vragen die elk een databaseronde kosten.
 *
 * ⚠️ **Functies en geen waarden, want dát is het hele punt.** Het object-literal
 *    in de job evalueerde ze eager: `{ heeftDagzet: await …, … }` stelt alle zes
 *    de vragen vóórdat er iets beslist is. Als callback worden ze pas
 *    aangeroepen als hun antwoord nog iets kan veranderen.
 */
export interface DureNudgevragen {
  heeftDagzet: () => Promise<boolean>;
  heeftAfronding: () => Promise<boolean>;
  heeftOpenWeekdoel: () => Promise<boolean>;
  inAdempauze: () => Promise<boolean>;
  alleenSlapendeGroepen: () => Promise<boolean>;
  alVerstuurd: () => Promise<boolean>;
}

export interface Nudgebesluit {
  readonly mag: boolean;
  /** De reden dat er niets gaat, of `null` als er wél een nudge gaat. */
  readonly reden: string | null;
  /** Hoeveel van de zes dure vragen er daadwerkelijk gesteld zijn. */
  readonly gesteldeVragen: number;
}

/**
 * Beslist of deze gebruiker nu een nudge krijgt.
 *
 * ⚠️ **De beslissing zelf verandert niet, alleen wat hij kost.** De poort is
 *    letterlijk `nudgeVoorpoortReden()`, dezelfde functie waar `nudgeReden()`
 *    mee begint, en daarna gaat de volledige situatie alsnog door
 *    `nudgeReden()`. Er is dus geen tweede plek waar de regels staan — en
 *    daarmee geen tweede plek die kan gaan afwijken.
 *
 * ⚠️ **De zes overgebleven vragen gaan in één `Promise.all`.** Ze hangen niet van
 *    elkaar af; ze stonden alleen achter elkaar omdat een object-literal nu
 *    eenmaal van boven naar beneden leest. Zes ronden na elkaar is zes keer de
 *    latency van de database, en deze job draait elk uur voor elk profiel.
 */
export async function nudgeBesluit(
  voorpoort: Nudgevoorpoort,
  vragen: DureNudgevragen,
): Promise<Nudgebesluit> {
  const vroeg = nudgeVoorpoortReden(voorpoort);
  if (vroeg !== null) return { mag: false, reden: vroeg, gesteldeVragen: 0 };

  const [heeftDagzet, heeftAfronding, heeftOpenWeekdoel, inAdempauze, alleenSlapendeGroepen, alVerstuurd] =
    await Promise.all([
      vragen.heeftDagzet(),
      vragen.heeftAfronding(),
      vragen.heeftOpenWeekdoel(),
      vragen.inAdempauze(),
      vragen.alleenSlapendeGroepen(),
      vragen.alVerstuurd(),
    ]);

  const situatie: NudgeSituatie = {
    ...voorpoort,
    heeftDagzet,
    heeftAfronding,
    heeftOpenWeekdoel,
    inAdempauze,
    alleenSlapendeGroepen,
    alVerstuurd,
  };

  const reden = nudgeReden(situatie);
  return { mag: reden === null, reden, gesteldeVragen: 6 };
}
