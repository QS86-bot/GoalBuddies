import { useEffect, useRef } from 'react';

import { isOnboarded, useProfiel, useSession } from '@/modules/auth';
import {
  fetchUitnodiging,
  neemDeel,
  routeVoorUitnodiging,
  vergeetOpenstaandeUitnodiging,
  vergeetToegetredenGroep,
  type OpenstaandeUitnodiging,
} from '@/modules/buddies';

import { leesInstap } from './instap';

/** Navigeren, met `router.replace` als echte invulling. Meegegeven zodat een test het kan vastleggen. */
export type Naar = (pad: string) => void;

/**
 * Stuurt na de onboarding naar de groep, de uitnodiging of het lid-worden-scherm —
 * QS8-805.
 *
 * ⚠️ **Dit stond als `Uitnodigingswacht` en `Werkcodewacht` in `app/_layout.tsx`**, en
 *    dat bestand laadt niet onder jsdom. Twee wachten die op dezelfde overgang startten
 *    en elk hun eigen opslag lazen, zijn nu één hook die `leesInstap()` volgt — dezelfde
 *    functie die het profielscherm bij Klaar leest. De naadtest staat in
 *    `src/schermen/onboarding/instap-naad.test.ts`.
 *
 * ⚠️ Pas ná de onboarding. Eerder zou de routewacht de navigatie meteen weer
 *    wegduwen, en dan is de code verzilverd zonder dat iemand de groep ziet.
 *
 * ⚠️ Eén poging per app-start, bewaakt met een ref. Elke toetreding kost er één
 *    van de twintig per dag, dus een lus die het bij elke render probeert, zet
 *    een nieuwe gebruiker binnen een seconde op slot.
 */
export function useInstapwacht(naar: Naar): void {
  const { session, loading: sessieLaadt } = useSession();
  const { profiel, loading: profielLaadt } = useProfiel();
  const geprobeerd = useRef(false);

  const userId = session?.user.id ?? null;
  const klaar = !sessieLaadt && !profielLaadt && userId !== null && isOnboarded(profiel);

  useEffect(() => {
    if (!klaar || userId === null || geprobeerd.current) return;
    geprobeerd.current = true;

    let levend = true;
    void volgInstap(userId, naar, () => levend);
    return () => {
      levend = false;
    };
  }, [klaar, userId, naar]);
}

/** Eén instap volgen. Geëxporteerd voor de naadtest; de hook hierboven is de enige aanroeper in de app. */
export async function volgInstap(userId: string, naar: Naar, levend: () => boolean): Promise<void> {
  const instap = await leesInstap(userId);
  if (!levend() || instap === null) return;

  switch (instap.soort) {
    case 'groep':
      // Eerst vergeten: wie de groep verlaat en de app herstart, hoort hier niet terug te komen.
      await vergeetToegetredenGroep(userId);
      if (levend()) naar(`/groep/${instap.groupId}`);
      return;
    case 'werkcode':
      // ⚠️ Alleen openen en invullen (QS8-663). Lid worden blijft een druk op de knop
      //    en de code blijft staan tot dat gelukt is of 24 uur om zijn.
      naar(`/organisatie/deelnemen?code=${instap.code}`);
      return;
    case 'uitnodiging':
      await volgUitnodiging(instap.wachtend, naar, levend);
  }
}

/**
 * Een bewaarde uitnodiging verzilveren, of het scherm tonen.
 *
 * ⚠️ **Besluit A49 (QS8-136).** Een bewaarde code verloopt, en een open groep gaat
 *    nooit vanzelf: toetreden tot een open groep maakt je gemiste weken, je beste
 *    reeks en je historische aanwezigheid zichtbaar. Niet weggooien maar tónen: de
 *    gebruiker landt op het uitnodigingsscherm en drukt zelf. De beslissing staat in
 *    `routeVoorUitnodiging()`; hier staat alleen wát er gebeurt.
 *
 * ⚠️ Kan de uitnodiging niet opgehaald worden (netwerk, ingetrokken link), dan ook
 *    naar het scherm. Onbekend is hier de kant waar niets stilzwijgend gebeurt.
 *
 * ⚠️ **Zwijgen is bij een mislukking het ergste antwoord** (24-08): dan naar het
 *    uitnodigingsscherm, dat de groep opnieuw laadt, zegt wat er aan de hand is en een
 *    knop heeft om het opnieuw te proberen. Bewust géén `reportError`: `neemDeel()`
 *    meldt een échte fout al zelf.
 */
async function volgUitnodiging(
  wachtend: OpenstaandeUitnodiging,
  naar: Naar,
  levend: () => boolean,
): Promise<void> {
  // Alleen ophalen als het ertoe doet: bij een verlopen code is de zichtbaarheid niet meer van belang.
  const uitnodiging = wachtend.automatisch
    ? await fetchUitnodiging(wachtend.code).catch(() => null)
    : null;
  if (!levend()) return;

  const route = routeVoorUitnodiging({
    automatisch: wachtend.automatisch,
    zichtbaarheid: uitnodiging?.zichtbaarheid ?? null,
  });
  if (route.soort === 'toon-scherm') {
    naar(`/uitnodiging/${wachtend.code}`);
    return;
  }

  const uitkomst = await neemDeel(wachtend.code);
  await vergeetOpenstaandeUitnodiging();
  if (!levend()) return;

  naar(uitkomst.ok ? `/groep/${uitkomst.waarde}` : `/uitnodiging/${wachtend.code}`);
}
