import { t } from '@/shared/i18n';
import { Screen } from '@/shared/ui';
import { Prestatiescherm } from '@/schermen/prestaties';

/** Je prestaties — QS8-735. Bereikbaar vanuit Profiel; alleen voor jezelf, de inhoud staat in `src/schermen/prestaties`. */
export default function Prestaties() {
  return (
    <Screen title={t('prestaties.titel')} terug={{ naar: '/profiel' }}>
      <Prestatiescherm />
    </Screen>
  );
}
