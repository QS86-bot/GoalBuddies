import AsyncStorage from "@react-native-async-storage/async-storage";

import { reportError } from "../../lib/observability";
import { now, ouderDan } from "../../shared/time";
import { isCodeVorm, normaliseerCode } from "../buddies";

/**
 * De werkcode die nog op je wacht — QS8-663 (besluit van Quinten, 20-11-2026).
 *
 * Wie "Ik kom via mijn werk" kiest, is nog niet ingelogd en kan dus nog geen lid
 * worden (`word_organisatielid()` eist `auth.uid()`). De code wordt onthouden tot
 * na de onboarding; dan opent `/organisatie/deelnemen` met de code ingevuld.
 *
 * ⚠️ **Lid worden blijft een druk op de knop.** Dit bestand kent bewust geen
 *    "automatisch"-vlag zoals `buddies/pending.ts`: een organisatie is geen groep
 *    die je zelf gekozen hebt, en niets in deze opslag mag iemand stilzwijgend
 *    lid maken (domeinregel 5 in zijn geest, en het besluit van 20-11).
 *
 * ⚠️ Een code ouder dan 24 uur wordt niet meer ingevuld, naar het voorbeeld van
 *    A49: wie hem twee weken geleden intikte en afhaakte, hoort niet bij een
 *    latere aanmelding een code te zien die hij vergeten is. Hij kan hem
 *    opnieuw intypen.
 */

const SLEUTEL = "goalbuddies.openstaande-werkcode";

export const WERKCODE_GELDIG_UREN = 24;

interface Bewaard {
  readonly code: string;
  readonly op: string;
}

/** Onthoud de code. Geeft `false` als hij niet de vorm van een code heeft. */
export async function bewaarWerkcode(invoer: string): Promise<boolean> {
  const schoon = normaliseerCode(invoer);
  if (!isCodeVorm(schoon)) return false;

  try {
    const inhoud: Bewaard = { code: schoon, op: now().toISOString() };
    await AsyncStorage.setItem(SLEUTEL, JSON.stringify(inhoud));
    return true;
  } catch (fout) {
    reportError(fout, "organisatie.code_onthouden");
    return false;
  }
}

/** De bewaarde code (zonder streepjes) als hij nog vers is, anders `null`. */
export async function openstaandeWerkcode(): Promise<string | null> {
  try {
    const bewaard = await AsyncStorage.getItem(SLEUTEL);
    if (bewaard === null) return null;

    const gelezen = JSON.parse(bewaard) as Partial<Bewaard>;
    if (typeof gelezen.code !== "string" || !isCodeVorm(gelezen.code))
      return null;
    if (
      typeof gelezen.op !== "string" ||
      ouderDan(WERKCODE_GELDIG_UREN, gelezen.op)
    )
      return null;
    return gelezen.code;
  } catch (fout) {
    reportError(fout, "organisatie.code_lezen");
    return null;
  }
}

export async function vergeetWerkcode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SLEUTEL);
  } catch (fout) {
    reportError(fout, "organisatie.code_vergeten");
  }
}
