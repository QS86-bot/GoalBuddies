import { useRouter } from 'expo-router';

import { t } from '@/shared/i18n';
import { Button } from '@/shared/ui';

/**
 * De knop naar het scherm "Alle klassementen" — QS8-666 (A57b), 3c-ui. Eén component voor beide ingangen (onder de klassementkaart van een groep en
 * bovenaan Mijn groepen), zodat de twee niet uit elkaar lopen.
 *
 * ⚠️ **Hij beslist niet of er een klassement is.** Dat bepaalt de database (de RPC); een scherm zonder klassementen legt zelf uit waarom het leeg is.
 *    Een eigen filter op `klassement_aan` in de client zou een tweede poort zijn die kan afwijken.
 */
export function AlleKlassementenKnop() {
  const router = useRouter();
  return (
    <Button variant="stil" onPress={() => router.push('/groep/klassementen')}>
      {t('klassementen.titel')}
    </Button>
  );
}
