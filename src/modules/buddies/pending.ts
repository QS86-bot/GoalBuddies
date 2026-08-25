import AsyncStorage from '@react-native-async-storage/async-storage';

import { reportError } from '../../lib/observability';
import { now, ouderDan } from '../../shared/time';

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

/**
 * Hoe lang een bewaarde code vanzelf verzilverd mag worden — besluit A49.
 *
 * ⚠️ **Waarom hier een termijn op staat.** Deze opslag is gebouwd toen meedoen
 *    aan een groep geen privacygevolgen had. Sinds besluit A41 heeft het die wel:
 *    toetreden tot een **open** groep maakt je gemiste weken zichtbaar voor de
 *    anderen — dezelfde overgang als het ópenzetten, waar een beheerder een
 *    volledig bevestigingsblok voor doorloopt.
 *
 *    Zonder termijn kon iemand die de link twee weken geleden opende en toen
 *    besloot niet mee te doen, alsnog in die groep belanden zodra hij een account
 *    aanmaakte. Vierentwintig uur dekt het hoofdpad waar deze opslag voor bestaat
 *    — een bevestigingsmail aantikken — en laat de rest niet meer stilzwijgend
 *    doorlopen.
 */
export const UITNODIGING_GELDIG_UREN = 24;

/** Wat er in de opslag staat. */
interface Bewaard {
  readonly code: string;
  /** ISO-tijdstip. Ontbreekt in de vorm van vóór besluit A49. */
  readonly op?: string;
}

export interface OpenstaandeUitnodiging {
  readonly code: string;
  /**
   * Mag deze code nog vanzelf verzilverd worden?
   *
   * ⚠️ `false` betekent níét "gooi hem weg": de gebruiker landt dan op het
   *    uitnodigingsscherm en kan zelf drukken. Weggooien zou de uitnodiging
   *    doodmaken, en dat is precies wat deze opslag moest voorkomen.
   */
  readonly automatisch: boolean;
}

/** Onthoud de code tot hij verzilverd is. */
export async function bewaarOpenstaandeUitnodiging(code: string): Promise<void> {
  const schoon = normaliseerCode(code);
  if (!isCodeVorm(schoon)) return;

  try {
    const inhoud: Bewaard = { code: schoon, op: now().toISOString() };
    await AsyncStorage.setItem(SLEUTEL, JSON.stringify(inhoud));
  } catch (fout) {
    // Niet gooien: de uitnodiging kwijtraken is vervelend, maar het mag het
    // aanmelden zelf niet blokkeren.
    reportError(fout, 'invite.remember');
  }
}

/**
 * De uitnodiging die nog wacht, of `null`.
 *
 * ⚠️ **De oude opslagvorm was een kale code zonder tijdstip**, en die telt als
 *    verlopen: zonder tijdstip is de leeftijd onbekend, en onbekend is hier de
 *    kant waar niets vanzelf gebeurt. De code gaat wél mee terug, zodat de
 *    gebruiker op het uitnodigingsscherm landt in plaats van met lege handen.
 */
export async function openstaandeUitnodiging(): Promise<OpenstaandeUitnodiging | null> {
  try {
    const bewaard = await AsyncStorage.getItem(SLEUTEL);
    if (bewaard === null) return null;

    // De vorm van vóór A49: een kale code.
    if (isCodeVorm(bewaard)) return { code: bewaard, automatisch: false };

    const gelezen = JSON.parse(bewaard) as Bewaard;
    if (!isCodeVorm(gelezen.code)) return null;

    return {
      code: gelezen.code,
      automatisch: !ouderDan(UITNODIGING_GELDIG_UREN, gelezen.op ?? null),
    };
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
