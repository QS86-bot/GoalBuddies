import type { DeelUitslag } from '@/modules/buddies';
import { t } from '@/shared/i18n';

/**
 * Wat de gebruiker te lezen krijgt na een poging te delen — QS8-736. Zuiver, zodat elke
 * uitslag zonder react-native te meten is. Elke weigering is gewone taal en geen code, en
 * geen enkele noemt een andere gebruiker of een groep waar je niet in zit.
 */
export function deelMelding(uitslag: DeelUitslag, groepsnaam: string): string {
  switch (uitslag) {
    case 'ok':
      return t('prestaties.deel_gelukt', { groep: groepsnaam });
    case 'already_shared':
      return t('prestaties.deel_al', { groep: groepsnaam });
    case 'rate_limited':
      return t('prestaties.deel_limiet');
    case 'team_off':
      return t('prestaties.deel_team_uit');
    case 'not_earned':
    case 'not_shareable':
    case 'not_member':
    case 'not_signed_in':
      return t('prestaties.deel_niet_mogelijk');
  }
}
