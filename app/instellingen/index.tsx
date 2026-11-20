import { t } from '@/shared/i18n';
import { Screen } from '@/shared/ui';
import { Instellingenscherm } from '@/schermen/instellingen';

/** Instellingen — QS8-754. De lijst; bereikbaar vanuit Profiel. */
export default function Instellingen() {
  return (
    <Screen title={t('instellingen.titel')} terug={{ naar: '/profiel' }}>
      <Instellingenscherm />
    </Screen>
  );
}
