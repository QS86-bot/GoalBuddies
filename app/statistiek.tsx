import { t } from '@/shared/i18n';
import { Screen } from '@/shared/ui';
import { Statistiekscherm } from '@/schermen/statistiek';

/** Je statistieken — QS8-749. Bereikbaar vanuit Profiel; de inhoud staat in `src/schermen/statistiek`. */
export default function Statistiek() {
  return (
    <Screen title={t('statistiek.titel')} terug={{ naar: '/profiel' }}>
      <Statistiekscherm />
    </Screen>
  );
}
