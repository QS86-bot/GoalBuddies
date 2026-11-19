import { View } from 'react-native';

import { t } from '../i18n';

import { Caption } from './Text';

/**
 * Met welk account ben je ingelogd — QS8-708.
 *
 * ⚠️ Bestaat omdat een tester die twee accounts gebruikt (de maker van een groep
 *    en de genodigde) nergens kon zien in welke rol hij zat, en daardoor een
 *    toetreding deed met het account dat al lid was. Het adres staat erbij en niet
 *    alleen de naam: twee accounts van één persoon dragen dezelfde naam.
 */
export function Accountregel({
  naam,
  adres,
  ingelogd,
}: {
  readonly naam: string | null;
  readonly adres: string | null;
  readonly ingelogd: boolean;
}) {
  if (!ingelogd) return <Caption>{t('account.niet_ingelogd')}</Caption>;

  return (
    <View accessibilityRole="text">
      {naam ? <Caption>{t('account.ingelogd_als', { naam })}</Caption> : null}
      {adres ? <Caption>{t('account.ingelogd_adres', { adres })}</Caption> : null}
    </View>
  );
}
