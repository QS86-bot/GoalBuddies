import { useState } from 'react';
import { Platform, Share } from 'react-native';

import { t } from '../i18n';

import { Button } from './Button';

/**
 * Iets delen met de app die de gebruiker daar zelf voor heeft.
 *
 * ⚠️ Waarom dit bestaat. De uitnodigingslink stond in een read-only tekstveld met
 *    de mededeling "selecteer en kopieer". Op iOS is een niet-bewerkbaar veld
 *    niet eens aan te tikken om te selecteren, en zelfs waar het lukt is het
 *    zeven handelingen voor de belangrijkste handeling van het hele product.
 *
 * ⚠️ Geen nieuwe dependency. `Share` zit in React Native zelf en
 *    `navigator.share` / `navigator.clipboard` in elke browser. Dat was de reden
 *    om het níét te bouwen (`expo-clipboard` toevoegen mag niet zonder overleg),
 *    en die reden gold hier dus nooit.
 *
 * ⚠️ De knop zegt wat er gaat gebeuren en liegt niet als het misgaat. Kan het
 *    apparaat niet delen én niet kopiëren, dan zegt hij dat — in plaats van te
 *    doen alsof er iets gelukt is.
 */

interface Props {
  readonly tekst: string;
  readonly titel: string;
  readonly label: string;
  readonly variant?: 'primair' | 'secundair';
}

export function Deelknop({ tekst, titel, label, variant = 'primair' }: Props) {
  const [stand, setStand] = useState<'rust' | 'gekopieerd' | 'mislukt'>('rust');

  async function deel() {
    setStand('rust');

    if (Platform.OS === 'web') {
      const gelukt = await deelOpWeb(tekst, titel);
      setStand(gelukt);
      return;
    }

    try {
      await Share.share({ message: tekst, title: titel });
    } catch {
      // De gebruiker die het deelvenster wegtikt komt hier ook terecht; dat is
      // geen fout en verdient dus geen foutmelding.
      setStand('rust');
    }
  }

  return (
    <Button variant={variant} block onPress={() => void deel()}>
      {stand === 'gekopieerd'
        ? t('delen.gekopieerd')
        : stand === 'mislukt'
          ? t('delen.mislukt')
          : label}
    </Button>
  );
}

/**
 * Op web eerst het deelvenster, dan het klembord.
 *
 * `navigator.share` bestaat op mobiel web en op recente desktopbrowsers;
 * `clipboard.writeText` overal daarna. Allebei vragen ze een gebruikersgebaar,
 * en dat hebben we hier — deze functie draait uit een druk op de knop.
 */
async function deelOpWeb(tekst: string, titel: string): Promise<'rust' | 'gekopieerd' | 'mislukt'> {
  const nav = globalThis.navigator as
    | (Navigator & { share?: (data: { title?: string; text?: string }) => Promise<void> })
    | undefined;

  if (nav?.share) {
    try {
      await nav.share({ title: titel, text: tekst });
      return 'rust';
    } catch {
      // Geweigerd of afgebroken: vallen door naar het klembord.
    }
  }

  try {
    await nav?.clipboard?.writeText(tekst);
    return nav?.clipboard ? 'gekopieerd' : 'mislukt';
  } catch {
    return 'mislukt';
  }
}
