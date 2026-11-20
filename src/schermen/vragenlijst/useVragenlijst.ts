import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { useProfiel, useSession } from '@/modules/auth';
import { eigenGevoelSchoon, type GevoelWissen, type VragenlijstInvoer } from '@/modules/goals';

import { useAntwoorden } from './antwoorden';
import { bewaarAlles, bewaarTussendoor } from './bewaar';
import { eigenTeLang } from './vragen/Gevoel';
import { beginStap, GEVOEL, isVraag, SAMENVATTING, type Stap } from './stappen';
import { useHeldkeuze } from './useHeldkeuze';

/**
 * De toestand van de vragenlijst: waar je bent, wat je antwoordde, en het bewaren.
 *
 * ⚠️ **Bij elke "Volgende" gaat wat er staat meteen naar het profiel**, zodat wie
 *    halverwege afhaakt zijn antwoorden terugvindt. Een mislukte tussentijdse
 *    bewaring blokkeert niets (offline blijf je niet hangen) maar toont de melding;
 *    alleen "Bewaren en verder" aan het eind moet slagen.
 */
export function useVragenlijst() {
  const router = useRouter();
  const { userId } = useSession();
  const { profiel, herlaad } = useProfiel();
  const a = useAntwoorden(profiel);
  const held = useHeldkeuze(userId ?? null);

  // ⚠️ Wat er al stond of al bewaard is: alleen dán is leegmaken een wisopdracht.
  const eerder = useRef({ feeling: profiel?.feeling != null, feeling_own: profiel?.feeling_own != null });
  const wis = (): GevoelWissen => wisUit(a.invoer, eerder.current);
  const [stap, setStap] = useState<Stap>(() => beginStap(beantwoord(a.invoer)));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  function volgende() {
    if (userId && isVraag(stap)) {
      void bewaarTussendoor(userId, a.invoer, wis()).then((u) => setFout(u.ok ? null : u.melding));
    }
    eerder.current = onthoud(a.invoer);
    setStap((s) => Math.min(s + 1, SAMENVATTING));
  }

  async function bewaar() {
    if (!userId) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await bewaarAlles(userId, a.invoer, held.keuze, wis());
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    herlaad();
    // ⚠️ Naar de doelen en niet naar Vandaag: wie net verteld heeft waar hij zich op
    //    wil richten, hoort meteen bij de plek te komen waar hij dat vastlegt.
    router.replace('/doelen');
  }

  return {
    ...a,
    held,
    profiel,
    stap,
    bezig,
    fout,
    geblokkeerd: stap === GEVOEL && eigenTeLang(a.invoer.feeling_own ?? null),
    volgende,
    vorige: () => setStap((s) => Math.max(s - 1, 0)),
    naar: setStap,
    overslaan: () => setStap(SAMENVATTING),
    bewaar,
  };
}

function beantwoord(invoer: ReturnType<typeof useAntwoorden>['invoer']) {
  return {
    focus: (invoer.focus_areas ?? []).length > 0,
    tijd: (invoer.minutes_per_day ?? null) !== null,
    moment: (invoer.when_i_do_it ?? null) !== null,
    valkuil: (invoer.what_breaks_it ?? []).length > 0,
    gevoel: (invoer.feeling ?? null) !== null || (invoer.feeling_own ?? null) !== null,
  };
}

/** Welke gevoelskolommen nu een waarde dragen. */
function onthoud(invoer: VragenlijstInvoer) {
  return { feeling: (invoer.feeling ?? null) !== null, feeling_own: eigenGevoelSchoon(invoer.feeling_own) !== null };
}

/** Eerder gezet en nu leeg: de gebruiker haalde het bewust weg. */
function wisUit(invoer: VragenlijstInvoer, eerder: { feeling: boolean; feeling_own: boolean }): GevoelWissen {
  const nu = onthoud(invoer);
  return { feeling: eerder.feeling && !nu.feeling, feeling_own: eerder.feeling_own && !nu.feeling_own };
}
