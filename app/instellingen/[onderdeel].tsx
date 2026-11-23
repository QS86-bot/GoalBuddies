import { useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { t } from '@/shared/i18n';
import { Screen } from '@/shared/ui';
import { Instellingenscherm, paneelNaastLijst, vindOnderdeel } from '@/schermen/instellingen';
import { useVolgTaal } from '@/shared/i18n/react';

/**
 * Eén onderdeel van Instellingen — QS8-754. Smal het detailscherm met de naam van het onderdeel als titel en
 * terug naar de lijst; breed het paneel naast de lijst, en dan gaat terug naar Profiel.
 */
export default function InstellingenOnderdeel() {
  useVolgTaal();
  const { onderdeel } = useLocalSearchParams<{ onderdeel: string }>();
  const { width } = useWindowDimensions();
  const breed = paneelNaastLijst(width);
  const gekozen = vindOnderdeel(onderdeel);
  return (
    <Screen
      title={!breed && gekozen !== null ? t(gekozen.titel) : t('instellingen.titel')}
      terug={
        breed ? { naar: '/profiel' } : { naar: '/instellingen', label: t('instellingen.titel') }
      }
    >
      <Instellingenscherm onderdeel={onderdeel} />
    </Screen>
  );
}
