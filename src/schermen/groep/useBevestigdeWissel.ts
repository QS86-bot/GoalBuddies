import { useState } from 'react';

import { type Resultaat } from '@/shared/api';

/**
 * De toestand van een handeling die eerst een bevestigingsblad vraagt en dan één databaseaanroep doet.
 *
 * ⚠️ Gedeeld door `KlassementSchakelaar` en `OntdekKaart` (QS8-666): allebei zetten ze iets open of dicht namens álle
 *    leden, dus allebei hebben ze dezelfde vier toestanden en dezelfde regel: de tik opent het blad en roept niets
 *    aan, pas `bevestig()` roept aan. Eén plek voor die regel is beter dan twee kopieën die uit elkaar lopen.
 */
export function useBevestigdeWissel() {
  const [vraag, setVraag] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  async function bevestig<T>(
    aanroep: () => Promise<Resultaat<T>>,
    naSucces: (waarde: T) => string,
  ): Promise<T | null> {
    setBezig(true);
    setFout(null);
    setMelding(null);

    const uitkomst = await aanroep();
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return null;
    }

    setVraag(false);
    setMelding(naSucces(uitkomst.waarde));
    return uitkomst.waarde;
  }

  function annuleer() {
    setVraag(false);
    setFout(null);
  }

  return { vraag, open: () => setVraag(true), annuleer, bezig, fout, melding, bevestig };
}
