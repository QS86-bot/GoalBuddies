import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { taal, type Sleutel } from '../i18n';

import {
  spraakBeschikbaar,
  spraakfoutSleutel,
  spraakTaalTag,
  type Spraakvenster,
} from './spraakveld';

/**
 * De herkenner van de browser, ingepakt zodat één component hem bedient —
 * QS8-250.
 *
 * ⚠️ **Hier staat alles wat níet puur kan zijn**, en verder niets. De
 *    beslissingen — wanneer er een microfoon hoort, wat er met de tekst gebeurt,
 *    welke melding bij welke foutcode past — staan in `spraakveld.ts` en worden
 *    daar geijkt. Deze hook doet de bedrading en houdt zelf geen regel vast.
 *
 * ⚠️ **De DOM-typen staan hier met de hand.** React Native's `lib` kent
 *    `SpeechRecognition` niet, en `dom` erbij zetten in `tsconfig.json` zou de
 *    hele app toegang geven tot browser-API's die op native niet bestaan — dat
 *    is precies het platformverschil dat CLAUDE.md uit de gedeelde laag wil
 *    houden. Vandaar de smalle vorm hieronder: alleen wat we aanroepen.
 */

interface Herkenningsresultaat {
  readonly transcript: string;
}

interface Herkenningsalternatieven {
  readonly length: number;
  readonly [index: number]: Herkenningsresultaat;
}

interface Herkenningslijst {
  readonly length: number;
  readonly [index: number]: Herkenningsalternatieven;
}

interface Herkenningsgebeurtenis {
  readonly results: Herkenningslijst;
}

interface Foutgebeurtenis {
  readonly error: string;
}

interface Herkenner {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: Herkenningsgebeurtenis) => void) | null;
  onerror: ((e: Foutgebeurtenis) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type HerkennerBouwer = new () => Herkenner;

function bouwer(venster: Spraakvenster | null): HerkennerBouwer | null {
  if (venster === null) return null;

  const gevonden = venster.SpeechRecognition ?? venster.webkitSpeechRecognition;
  return typeof gevonden === 'function' ? (gevonden as HerkennerBouwer) : null;
}

/** Het globale object, of `null` op een platform dat er geen heeft. */
function venster(): Spraakvenster | null {
  return (globalThis as unknown as Spraakvenster | undefined) ?? null;
}

export interface Spraak {
  readonly beschikbaar: boolean;
  readonly luistert: boolean;
  readonly fout: Sleutel | null;
  readonly start: () => void;
  readonly stop: () => void;
  readonly wisFout: () => void;
}

/**
 * @param opTekst Wordt aangeroepen met elk herkend fragment. De aanroeper
 *                bepaalt wat ermee gebeurt — deze hook plakt niets zelf.
 */
export function useSpraak(opTekst: (herkend: string) => void): Spraak {
  const [luistert, setLuistert] = useState(false);
  const [fout, setFout] = useState<Sleutel | null>(null);

  const herkennerRef = useRef<Herkenner | null>(null);

  // ⚠️ De callback in een ref, zodat een nieuwe render de lopende herkenning niet
  //    afbreekt. Zonder dit stopt de microfoon bij elke toetsaanslag.
  const opTekstRef = useRef(opTekst);
  useEffect(() => {
    opTekstRef.current = opTekst;
  }, [opTekst]);

  const beschikbaar = spraakBeschikbaar(Platform.OS, venster());

  // ⚠️ Afbreken bij het verlaten van het scherm. Een herkenner die blijft staan,
  //    houdt de microfoon van het toestel bezet — en dat is precies het soort
  //    ding dat een gebruiker niet meer aan de app koppelt.
  useEffect(() => {
    return () => {
      herkennerRef.current?.abort();
      herkennerRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    herkennerRef.current?.stop();
  }, []);

  const wisFout = useCallback(() => setFout(null), []);

  const start = useCallback(() => {
    const Bouwer = bouwer(venster());
    if (Bouwer === null) return;

    herkennerRef.current?.abort();
    setFout(null);

    const herkenner = new Bouwer();
    herkenner.lang = spraakTaalTag(taal());

    // ⚠️ Eén zin per druk, en geen tussenresultaten. Tussenresultaten zouden het
    //    veld tijdens het spreken laten flikkeren, en `continuous` laat de
    //    microfoon aan staan tot de browser hem zelf sluit.
    herkenner.continuous = false;
    herkenner.interimResults = false;

    herkenner.onresult = (e) => {
      const eerste = e.results[0]?.[0];
      if (eerste !== undefined) opTekstRef.current(eerste.transcript);
    };

    herkenner.onerror = (e) => setFout(spraakfoutSleutel(e.error));
    herkenner.onend = () => setLuistert(false);

    herkennerRef.current = herkenner;
    herkenner.start();
    setLuistert(true);
  }, []);

  return { beschikbaar, luistert, fout, start, stop, wisFout };
}
