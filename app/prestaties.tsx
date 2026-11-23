import { t } from '@/shared/i18n';
import { Screen } from '@/shared/ui';
import { Prestatiescherm } from '@/schermen/prestaties';
import { useVolgTaal } from '@/shared/i18n/react';

/** Je prestaties — QS8-735. Bereikbaar vanuit Profiel; alleen voor jezelf, de inhoud staat in `src/schermen/prestaties`. */
export default function Prestaties() {
  useVolgTaal();
  return (
    <Screen title={t('prestaties.titel')} terug={{ naar: '/profiel' }}>
      <Prestatiescherm />
    </Screen>
  );
}
