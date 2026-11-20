import { useState } from 'react';

import type { Profiel } from '@/modules/auth';
import {
  MAX_FOCUSGEBIEDEN,
  type Categorie,
  type Gevoel,
  type Minuten,
  type Moment,
  type Valkuil,
  type VragenlijstInvoer,
} from '@/modules/goals';

/** Wat er al op het profiel staat is het startpunt en geen lege lijst. */
export function invoerUitProfiel(profiel: Profiel | null): VragenlijstInvoer {
  return {
    focus_areas: (profiel?.focus_areas ?? []) as Categorie[],
    minutes_per_day: (profiel?.minutes_per_day ?? null) as Minuten | null,
    when_i_do_it: (profiel?.when_i_do_it ?? null) as Moment | null,
    what_breaks_it: (profiel?.what_breaks_it ?? []) as Valkuil[],
    feeling: (profiel?.feeling ?? null) as Gevoel | null,
    feeling_own: profiel?.feeling_own ?? null,
  };
}

/**
 * Alle antwoorden op één plek.
 *
 * ⚠️ **Eén state voor alle stappen, en dat is hoe "terug gaan verliest geen
 *    antwoord" waar is.** Een stap die zijn eigen state hield, verloor hem bij
 *    het verlaten (QS8-733, criterium 2).
 */
export function useAntwoorden(profiel: Profiel | null) {
  const [invoer, setInvoer] = useState<VragenlijstInvoer>(() => invoerUitProfiel(profiel));

  const zet = (deel: Partial<VragenlijstInvoer>) => setInvoer((oud) => ({ ...oud, ...deel }));

  function wisselFocus(gebied: Categorie) {
    setInvoer((oud) => {
      const huidig = (oud.focus_areas ?? []) as Categorie[];
      if (huidig.includes(gebied)) return { ...oud, focus_areas: huidig.filter((g) => g !== gebied) };
      // ⚠️ Stil weigeren en niet stil de oudste eruit gooien: dat tweede laat de
      //    gebruiker een keuze verliezen die hij net gemaakt heeft.
      if (huidig.length >= MAX_FOCUSGEBIEDEN) return oud;
      return { ...oud, focus_areas: [...huidig, gebied] };
    });
  }

  function wisselValkuil(valkuil: Valkuil) {
    setInvoer((oud) => {
      const huidig = (oud.what_breaks_it ?? []) as Valkuil[];
      const nieuw = huidig.includes(valkuil) ? huidig.filter((v) => v !== valkuil) : [...huidig, valkuil];
      return { ...oud, what_breaks_it: nieuw };
    });
  }

  return { invoer, zet, wisselFocus, wisselValkuil };
}

export type Antwoorden = ReturnType<typeof useAntwoorden>;
