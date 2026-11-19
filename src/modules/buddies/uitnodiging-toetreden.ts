/**
 * Wat er gebeurt met de uitkomst van een toetreding — QS8-712.
 *
 * ⚠️ Waarom dit een eigen functie is. Het uitnodigingsscherm verwerkte de
 *    uitkomst op twee plekken (de knop en het automatische toetreden), en de
 *    tweede gooide hem weg zodra een dep van het effect wisselde: `levend` gold
 *    per effectronde, dus een `profiel` dat binnenkwam terwijl `neemDeel` liep
 *    liet een gebruiker achter die lid was, met een scherm dat nog "Deelnemen"
 *    zei en een bewaarde code die bij de volgende start nog een poging kostte.
 *
 * ⚠️ De vraag is nu of het scherm er nog ís, en niet of dit effect nog dezelfde
 *    ronde is. Een toetreding die geslaagd is, is geslaagd; wat de gebruiker
 *    daarvan te zien krijgt moet daar niet van afhangen.
 *
 * ⚠️ `onboarded()` wordt pas hier gevraagd en niet bij het starten: het profiel
 *    kan tussen die twee momenten binnenkomen.
 */

import type { Resultaat } from '../../shared/api';
import { t } from '../../shared/i18n';

export interface ToetredenUitvoer {
  /** Staat het scherm er nog? Alleen `false` na het verlaten ervan. */
  readonly gemount: () => boolean;
  readonly onboarded: () => boolean;
  readonly vergeetCode: () => void;
  readonly zetFout: (melding: string) => void;
  readonly zetBinnen: (groupId: string) => void;
  readonly naarGroep: (groupId: string) => void;
}

/**
 * Eén slot voor elke route naar `neemDeel` — QS8-716.
 *
 * ⚠️ Het scherm kent twee routes: de knop en het vanzelf toetreden na aanmelden. De
 *    knop beschermde zich alleen tegen zichzelf (`bezig`), en het vanzelf toetreden
 *    zette bewust geen `bezig`, dus een tik in dat venster gaf een tweede `neemDeel`:
 *    nog een poging uit de twintig per dag, en twee keer `verwerkToetreding`.
 *
 * ⚠️ `lopend` staat in een closure en niet in state: state is pas bij de volgende
 *    render bijgewerkt, en twee tikken vlak na elkaar komen daar vóór. `zetBezig`
 *    is alleen wat de gebruiker te zien krijgt; het slot zelf is `lopend`.
 */
export interface ToetredenSlot {
  /** `false` als er al een toetreding loopt; dan doet de aanroeper niets. */
  readonly begin: () => boolean;
  readonly einde: () => void;
}

export function maakToetredenSlot(zetBezig: (bezig: boolean) => void): ToetredenSlot {
  let lopend = false;

  return {
    begin: () => {
      if (lopend) return false;
      lopend = true;
      zetBezig(true);
      return true;
    },
    einde: () => {
      lopend = false;
      zetBezig(false);
    },
  };
}

/**
 * Eén toetreding, achter het slot — voor de knop én het vanzelf toetreden.
 *
 * ⚠️ Eén functie voor beide routes, zodat ze niet verschillend reageren op dezelfde
 *    fout: een `neemDeel` die werpt gaf bij de knop een ongevangen rejection en bij
 *    het vanzelf toetreden een melding. Het slot komt altijd vrij.
 *
 * @returns `false` als het slot bezet was en er dus niets is gedaan.
 */
export async function toetredenMetSlot(
  code: string,
  deel: {
    readonly slot: ToetredenSlot;
    readonly uitvoer: ToetredenUitvoer;
    readonly toetreden: (code: string) => Promise<Resultaat<string>>;
  },
): Promise<boolean> {
  if (!deel.slot.begin()) return false;

  try {
    verwerkToetreding(await deel.toetreden(code), deel.uitvoer);
  } catch {
    if (deel.uitvoer.gemount()) deel.uitvoer.zetFout(t('uitnodiging.deelnemen_mislukt'));
  } finally {
    deel.slot.einde();
  }

  return true;
}

export function verwerkToetreding(uitkomst: Resultaat<string>, uit: ToetredenUitvoer): void {
  // ⚠️ Eerst de code, dan pas de vraag of het scherm er nog is. Wissen is opslag en
  //    heeft het scherm niet nodig; wie het scherm verlaat terwijl hij lid wordt,
  //    houdt anders een bewaarde code over die de app bij de volgende start nog een
  //    keer verzilvert — een poging uit de twintig per dag. Ook bij een fout wissen
  //    (zelfde volgorde als `Uitnodigingswacht` in `app/_layout.tsx`).
  uit.vergeetCode();
  if (!uit.gemount()) return;

  if (!uitkomst.ok) {
    uit.zetFout(uitkomst.melding);
    return;
  }

  uit.zetBinnen(uitkomst.waarde);
  if (uit.onboarded()) uit.naarGroep(uitkomst.waarde);
}
