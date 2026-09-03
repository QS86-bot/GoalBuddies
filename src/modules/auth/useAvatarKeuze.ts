import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

import { t } from '../../shared/i18n';

import { base64NaarBytes, uploadAvatar, verwijderAvatar } from './avatar';
import { fetchProfiel, type Profiel } from './profile';

/**
 * De profielfoto kiezen, uploaden en weghalen — QS8-196, migratie 0126.
 *
 * ⚠️ **Waarom dit een hook in de module is en de knop in `shared/ui` staat.** De
 *    keuze hangt sinds QS8-196 op twee schermen: het profieltabblad en de
 *    onboarding. Eén component met de datalaag erin zou in `modules/` moeten
 *    wonen, en daar mag niets uit `shared/ui` geïmporteerd worden — dat is een
 *    lintregel met een eigen dossierrij van 19-08, want anders wijst de datalaag
 *    naar de schermlaag. Dezelfde driedeling als bij `useTeBeoordelen()`.
 *
 * ⚠️ **`base64: true` en geen `fetch(uri)`.** De kiezer geeft op native een
 *    `file://`-uri en op web een `data:`-uri; `fetch()` op de eerste is in React
 *    Native niet betrouwbaar. Base64 werkt op beide platformen hetzelfde, en dat
 *    is hier meer waard dan de paar honderd kilobyte die het onderweg kost.
 *
 * ⚠️ **De grens staat op drie plekken en dat is met opzet.** `allowsEditing` plus
 *    `quality` houdt de meeste foto's onder de 2 MB, `keurBestand()` vangt de
 *    rest vóór er iets de deur uit gaat, en de bucket zelf is de grendel
 *    (onwrikbare regel 3). De eerste twee zijn gemak; alleen de derde is
 *    beveiliging.
 */
export interface Avatarkeuze {
  readonly bezig: boolean;
  readonly fout: string | null;
  readonly kies: () => Promise<void>;
  readonly weghalen: () => Promise<void>;
}

export function useAvatarKeuze(
  profiel: Profiel,
  onGewijzigd: (profiel: Profiel) => void,
): Avatarkeuze {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function herlaad() {
    // ⚠️ Opnieuw ophalen en niet het pad zelf in de state zetten: `fetchProfiel`
    //    tekent de avatar, en een ongetekend pad in een `<Image>` is een leeg
    //    vlak zonder foutmelding.
    const vers = await fetchProfiel(profiel.id);
    if (vers !== null) onGewijzigd(vers);
  }

  async function kies() {
    setFout(null);

    const toestemming = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!toestemming.granted) {
      setFout(t('avatar.geen_toegang'));
      return;
    }

    const keuze = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    const gekozen = keuze.canceled ? null : (keuze.assets[0] ?? null);
    if (gekozen === null) return;

    const base64 = gekozen.base64 ?? null;
    if (base64 === null) {
      setFout(t('avatar.uploaden_mislukt'));
      return;
    }

    const bytes = base64NaarBytes(base64);
    if (bytes === null) {
      setFout(t('avatar.uploaden_mislukt'));
      return;
    }

    setBezig(true);
    const uitkomst = await uploadAvatar(profiel.id, {
      data: bytes,
      mime: gekozen.mimeType ?? 'image/jpeg',
    });

    if (uitkomst.ok) await herlaad();
    else setFout(uitkomst.melding);

    setBezig(false);
  }

  async function weghalen() {
    setFout(null);
    setBezig(true);

    const uitkomst = await verwijderAvatar(profiel.id);
    if (uitkomst.ok) await herlaad();
    else setFout(uitkomst.melding);

    setBezig(false);
  }

  return { bezig, fout, kies, weghalen };
}
