import AsyncStorage from '@react-native-async-storage/async-storage';

import { reportError } from '../../lib/observability';

import { isCodeVorm, normaliseerCode } from './schemas';

/**
 * De uitnodiging die nog op je wacht — QS8-59.
 *
 * ⚠️ Waarom dit bestaat. Iemand tikt een uitnodigingslink aan, drukt op "account
 *    maken", krijgt een bevestigingsmail, tikt die aan — en landt in een verse
 *    app-sessie. Het scherm met de code is dan allang weg. Zonder deze opslag
 *    komt zo iemand níét in de groep terecht, terwijl de uitnodigingspagina hem
 *    letterlijk belooft dat dat wél gebeurt.
 *
 *    Dat is geen randgeval: met e-mailbevestiging aan is het het hoofdpad, en het
 *    is precies de kapotte uitnodigingslink die in de Habit Huddle-analyse stil
 *    elke uitnodiging doodde.
 *
 * ⚠️ Bewust dezelfde opslag als de sessie (AsyncStorage op native, localStorage
 *    op web) en geen nieuwe dependency: `@react-native-async-storage/async-storage`
 *    zit er al voor de Supabase-client.
 *
 * ⚠️ Er staat alleen een code in, en die is niets waard zonder een sessie:
 *    `join_group_with_code` eist `auth.uid()`. Er lekt hier dus niets als iemand
 *    anders de telefoon oppakt.
 */

const SLEUTEL = 'goalbuddies.openstaande-uitnodiging';

/** Onthoud de code tot hij verzilverd is. */
export async function bewaarOpenstaandeUitnodiging(code: string): Promise<void> {
  const schoon = normaliseerCode(code);
  if (!isCodeVorm(schoon)) return;

  try {
    await AsyncStorage.setItem(SLEUTEL, schoon);
  } catch (fout) {
    // Niet gooien: de uitnodiging kwijtraken is vervelend, maar het mag het
    // aanmelden zelf niet blokkeren.
    reportError(fout, 'invite.remember');
  }
}

/** De code die nog wacht, of `null`. */
export async function openstaandeUitnodiging(): Promise<string | null> {
  try {
    const bewaard = await AsyncStorage.getItem(SLEUTEL);
    return bewaard !== null && isCodeVorm(bewaard) ? bewaard : null;
  } catch (fout) {
    reportError(fout, 'invite.recall');
    return null;
  }
}

/**
 * Vergeet de code.
 *
 * ⚠️ Ook aanroepen als toetreden mislukt met een reden die niet overgaat
 *    (ingetrokken code, volle groep). Blijft hij staan, dan probeert de app hem
 *    bij elke start opnieuw — en elke poging kost er één van de twintig per dag.
 */
export async function vergeetOpenstaandeUitnodiging(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SLEUTEL);
  } catch (fout) {
    reportError(fout, 'invite.forget');
  }
}
