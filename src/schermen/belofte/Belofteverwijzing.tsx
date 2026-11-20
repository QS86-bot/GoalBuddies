import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { fetchBelofteBegunstigden } from '@/modules/commitments';
import { t } from '@/shared/i18n';
import { Body, Button, Card, useAsync } from '@/shared/ui';

import { toonBelofteverwijzing } from './verwijzing';
import { VERWIJZING_PARAM, verwijzingAangevraagd } from './verwijzingsparameter';

/**
 * De verwijzing naar de weekbelofte, boven de doelenlijst — QS8-762.
 *
 * ⚠️ **Dit schrijft niets.** Het is een regel met een link naar `/doel/belofte/[id]`
 *    (QS8-761), waar de aparte bevestigstap staat. De vragenlijst maakt nooit een
 *    commitment (besluit 3 van de poort QS8-744); deze verwijzing komt daarna en
 *    zegt alleen dat de mogelijkheid er is.
 * ⚠️ **Alleen direct na het afronden van de vragenlijst** (besluit van Quinten,
 *    20-11-2026): `aangevraagd` komt uit de parameter die `bewaar()` meegeeft. Zodra
 *    het scherm de focus verliest of de gebruiker "Niet nu" kiest, gaat de parameter
 *    weg, want een tabscherm onthoudt zijn parameters; zonder dat kwam de regel bij
 *    elk bezoek terug. Daarom ook geen opslag op het apparaat.
 * ⚠️ **Alleen bij precies één actief eigen doel** (besluit van Quinten, 20-11-2026):
 *    `doelId` is dat doel, anders `null`. Hier geen keuzescherm.
 * ⚠️ **Dezelfde bron als het beloftescherm** (`fetchBelofteBegunstigden()`), zodat
 *    de verwijzing en het scherm nooit iets anders zeggen over "is er een getuige".
 * ⚠️ **Een mislukte lezing toont niets.** De verwijzing is een extra; er is geen
 *    foutstaat voor iets dat de gebruiker niet gevraagd heeft.
 */
export function Belofteverwijzing({ doelId }: { readonly doelId: string | null }) {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const aangevraagd = verwijzingAangevraagd(params[VERWIJZING_PARAM]);
  const sluit = useCallback(() => router.setParams({ [VERWIJZING_PARAM]: undefined }), [router]);

  // Bij het verlaten van het scherm is de verwijzing "gehad".
  useFocusEffect(useCallback(() => sluit, [sluit]));

  const lijsten = useAsync(aangevraagd && doelId !== null ? fetchBelofteBegunstigden : null, [aangevraagd, doelId]);

  if (!aangevraagd || doelId === null || lijsten.data === undefined) return null;
  if (
    !toonBelofteverwijzing({
      aangevraagd,
      groepen: lijsten.data.groepen.length,
      getuigen: lijsten.data.getuigen.length,
    })
  ) {
    return null;
  }

  return (
    <Card flat>
      <Body>{t('belofte.verwijzing.tekst')}</Body>
      <Button variant="primair" onPress={() => router.push(`/doel/belofte/${doelId}`)}>
        {t('belofte.verwijzing.link')}
      </Button>
      <Button variant="stil" onPress={sluit}>
        {t('belofte.verwijzing.sluit')}
      </Button>
    </Card>
  );
}
