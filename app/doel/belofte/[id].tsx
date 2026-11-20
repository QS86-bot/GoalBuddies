import { useLocalSearchParams } from 'expo-router';

import { Beloftescherm } from '@/schermen/belofte';
import { t } from '@/shared/i18n';
import { Screen } from '@/shared/ui';

/**
 * De weekbelofte van één doel — QS8-761. Bereikbaar vanuit het doelscherm
 * (`BelofteIngang`); de inhoud staat in `src/schermen/belofte`.
 *
 * ⚠️ De id in de URL geeft geen toegang. Een groepsgenoot léést het doel wel
 *    (`goals_select`), dus het scherm toetst de eigenaar en toont anders "niet
 *    gevonden"; een belofte op andermans doel weigert de database (42501).
 */
export default function Belofte() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen title={t('belofte.titel')} terug={{ naar: `/doel/${id ?? ''}` }}>
      <Beloftescherm goalId={id ?? ''} />
    </Screen>
  );
}
