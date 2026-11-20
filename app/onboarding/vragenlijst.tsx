import { Vragenlijstscherm } from '@/schermen/vragenlijst';
import { t } from '@/shared/i18n';
import { Screen } from '@/shared/ui';

/**
 * De korte vragenlijst — QS8-257, herontworpen in QS8-733.
 *
 * ⚠️ De inhoud staat in `src/schermen/vragenlijst`, één bestand per vraag. De route
 *    blijft achter de aanmeldmuur: `Routewacht` stuurt wie geen sessie heeft naar
 *    inloggen (`src/modules/auth/routewacht.test.ts`).
 */
export default function Vragenlijst() {
  return (
    <Screen
      title={t('vragenlijst.titel')}
      eyebrow={t('vragenlijst.eyebrow')}
      terug={{ naar: '/doelen' }}
    >
      <Vragenlijstscherm />
    </Screen>
  );
}
