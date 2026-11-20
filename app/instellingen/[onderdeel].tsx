import { useLocalSearchParams } from 'expo-router';

import { t } from '@/shared/i18n';
import { Screen } from '@/shared/ui';
import { Instellingenscherm } from '@/schermen/instellingen';

/** Eén onderdeel van Instellingen — QS8-754. Smal het detailscherm, breed het paneel naast de lijst. */
export default function InstellingenOnderdeel() {
  const { onderdeel } = useLocalSearchParams<{ onderdeel: string }>();
  return (
    <Screen title={t('instellingen.titel')} terug={{ naar: '/instellingen' }}>
      <Instellingenscherm onderdeel={onderdeel} />
    </Screen>
  );
}
