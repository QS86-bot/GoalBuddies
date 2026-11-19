import { t } from '@/shared/i18n';
import { Screen } from '@/shared/ui';
import { Uiterlijkscherm } from '@/schermen/uiterlijk';

/** Uiterlijk — QS8-731. Bereikbaar vanuit Profiel; de inhoud staat in `src/schermen/uiterlijk`. */
export default function Uiterlijk() {
  return (
    <Screen title={t('uiterlijk.titel')} terug={{ naar: '/profiel' }}>
      <Uiterlijkscherm />
    </Screen>
  );
}
