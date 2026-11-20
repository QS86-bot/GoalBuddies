import { useLocalSearchParams } from 'expo-router';

import { Beloftescherm } from '@/schermen/belofte';
import { t } from '@/shared/i18n';
import { Screen } from '@/shared/ui';

/**
 * De weekbelofte van één doel — QS8-761. Bereikbaar vanuit het doelscherm
 * (`BelofteIngang`); de inhoud staat in `src/schermen/belofte`.
 *
 * ⚠️ De id in de URL geeft geen toegang: RLS geeft nul rijen voor een doel dat
 *    niet van jou is, en het scherm toont dan "niet gevonden".
 */
export default function Belofte() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen title={t('belofte.titel')} terug={{ naar: `/doel/${id ?? ''}` }}>
      <Beloftescherm goalId={id ?? ''} />
    </Screen>
  );
}
