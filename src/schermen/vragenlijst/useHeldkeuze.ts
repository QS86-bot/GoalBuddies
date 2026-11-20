import { useState } from 'react';

import {
  heldkeuze,
  heldprofiel,
  type Heldantwoorden,
  type Heldkeuze,
  type Heldsleutel,
  type Heldvraag,
} from '@/modules/helden';
import { useAsync } from '@/shared/ui';

import { bestaandeHeld, type BestaandeHeld } from './HeldUitslag';

/**
 * De heldenantwoorden en wat er van komt.
 *
 * ⚠️ De antwoorden staan naast de profielantwoorden en niet erin: die gaan naar
 *    `profiles`, en deze vier gaan daar nooit heen. Alleen de uitslag landt, in
 *    `hero_profiles`.
 *
 * ⚠️ De keuze wordt bij élke render afgeleid en niet in state gehouden:
 *    `heldkeuze()` laat een eerdere gelijkspelkeuze vallen zodra de antwoorden hem
 *    geen koploper meer maken.
 *
 * ⚠️ `useAsync` en geen eigen hook in `modules/helden`: de laadbeurt hoort in de
 *    schermlaag (`levend:controle`, QS8-207).
 */
export function useHeldkeuze(userId: string | null) {
  const [antwoorden, setAntwoorden] = useState<Heldantwoorden>({});
  const [gekozen, setGekozen] = useState<Heldsleutel | null>(null);
  const bestaand = useAsync(userId ? () => heldprofiel(userId) : null, [userId]);

  const keuze: Heldkeuze = heldkeuze(antwoorden, gekozen);
  const bestaande: BestaandeHeld = bestaandeHeld(bestaand);

  function kies(vraag: Heldvraag, held: Heldsleutel) {
    setAntwoorden((oud) => ({ ...oud, [vraag]: held }));
  }

  return { antwoorden, keuze, bestaande, kies, kiesGelijkspel: setGekozen };
}
