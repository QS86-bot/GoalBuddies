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

export interface ToetredenUitvoer {
  /** Staat het scherm er nog? Alleen `false` na het verlaten ervan. */
  readonly gemount: () => boolean;
  readonly onboarded: () => boolean;
  readonly vergeetCode: () => void;
  readonly zetFout: (melding: string) => void;
  readonly zetBinnen: (groupId: string) => void;
  readonly naarGroep: (groupId: string) => void;
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
