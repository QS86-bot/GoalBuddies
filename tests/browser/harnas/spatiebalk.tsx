/**
 * De harnas van `tests/browser/spatiebalk.test.ts` — QS8-804.
 *
 * Rendert de drie echte componenten met hun eigen stand, zodat een toetsaanslag in een echte browser de stand
 * kan laten wisselen. Daaronder een hoge lege ruimte: een spatie die de pagina laat scrollen, is dan te zien.
 *
 * ⚠️ Geen eigen kleuren en geen eigen stijl op de knoppen zelf: de harnas meet de componenten, niet zichzelf.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';

import { Afvinkcirkel } from '@/shared/ui/Afvinkcirkel';
import { Choice } from '@/shared/ui/Choice';
import { Schakelaar } from '@/shared/ui/Schakelaar';

/** Elke `onPress`, per component, zodat de test ook een dubbele activering ziet. */
const teller: Record<string, number> = { choice: 0, schakelaar: 0, uit: 0, cirkel: 0, bezig: 0 };
(window as unknown as { __drukken: typeof teller }).__drukken = teller;

function Harnas() {
  const [kleur, setKleur] = useState<'a' | 'b'>('a');
  const [aan, setAan] = useState(false);
  const [af, setAf] = useState(false);
  const tel = (naam: string) => {
    teller[naam] = (teller[naam] ?? 0) + 1;
  };

  return (
    <View style={{ padding: 16, gap: 16 }}>
      <Choice
        label="Keuze"
        opties={[
          { waarde: 'a', label: 'Optie A' },
          { waarde: 'b', label: 'Optie B' },
        ]}
        waarde={kleur}
        onKies={(w) => {
          tel('choice');
          setKleur(w);
        }}
      />
      <Schakelaar label="Schakelaar" aan={aan} onPress={() => (tel('schakelaar'), setAan((v) => !v))} />
      <Schakelaar label="Uitgeschakeld" aan={false} disabled onPress={() => tel('uit')} />
      <Afvinkcirkel label="Afvinken" niveau="ceiling" vandaagAfgevinkt={af} onPress={() => (tel('cirkel'), setAf((v) => !v))} />
      <Afvinkcirkel label="Bezig" niveau="ceiling" vandaagAfgevinkt={false} busy onPress={() => tel('bezig')} />
      <View style={{ height: 4000 }} />
    </View>
  );
}

createRoot(document.getElementById('root')!).render(<Harnas />);
