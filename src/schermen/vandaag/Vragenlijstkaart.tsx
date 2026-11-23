import { useRouter } from 'expo-router';

import { useProfiel, useSession } from '@/modules/auth';
import { t } from '@/shared/i18n';
import { Body, Button, Card, Subheading, useVragenlijstkaartWeg } from '@/shared/ui';

import { toonVragenlijstkaart } from './vragenlijstkaart-vorm';

/**
 * De kaart die de vragenlijst opent, voor wie hem oversloeg — QS8-805.
 *
 * ⚠️ Een tweede ingang naar `/onboarding/vragenlijst`, naast het afronden van het
 *    profiel. De routewacht laat die route na de onboarding met rust
 *    (`NA_ONBOARDING_BEREIKBAAR`), dus de knop komt er ook aan.
 *
 * ⚠️ Op Vandaag onder de weekstrook en de tellers, boven de meldingen en de
 *    weekdoelen: hij is een aanbod, geen stand van je week.
 *
 * ⚠️ Leeg betekent weg: geen kaart en geen ruimte. Wie op "Niet nu" tikt, ziet hem op
 *    dit apparaat niet meer terug; wie de vragenlijst invult ook niet, want dan staat
 *    er een antwoord op het profiel.
 */
export function Vragenlijstkaart() {
  const router = useRouter();
  const { userId } = useSession();
  const { profiel } = useProfiel();
  const { weg, geladen, verberg } = useVragenlijstkaartWeg(userId ?? null);

  if (!toonVragenlijstkaart({ profiel, geladen, weg })) return null;

  return (
    <Card>
      <Subheading>{t('vandaag.vragenlijst_kaart_titel')}</Subheading>
      <Body muted>{t('vandaag.vragenlijst_kaart_tekst')}</Body>
      <Button variant="primair" block onPress={() => router.push('/onboarding/vragenlijst')}>
        {t('vandaag.vragenlijst_kaart_knop')}
      </Button>
      <Button variant="stil" block onPress={verberg}>
        {t('vandaag.vragenlijst_kaart_niet_nu')}
      </Button>
    </Card>
  );
}
