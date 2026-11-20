import { useRouter } from 'expo-router';

import { fetchBelofteBegunstigden } from '@/modules/commitments';
import { t } from '@/shared/i18n';
import { Body, Button, Card, useAsync, useBelofteverwijzingVerborgen } from '@/shared/ui';

import { toonBelofteverwijzing } from './verwijzing';

/**
 * De verwijzing naar de weekbelofte, boven de doelenlijst — QS8-762.
 *
 * ⚠️ **Dit schrijft niets.** Het is een regel met een link naar `/doel/belofte/[id]`
 *    (QS8-761), waar de aparte bevestigstap staat. De vragenlijst maakt nooit een
 *    commitment (besluit 3 van de poort QS8-744); deze verwijzing komt daarna en
 *    zegt alleen dat de mogelijkheid er is.
 * ⚠️ **Alleen bij precies één actief eigen doel** (besluit van Quinten, 20-11-2026):
 *    `doelId` is dat doel, anders `null`. Bij meer doelen is er geen doel om heen te
 *    wijzen, en de verwijzing blijft weg. Hier geen keuzescherm.
 * ⚠️ **Dezelfde bron als het beloftescherm** (`fetchBelofteBegunstigden()`), zodat
 *    de verwijzing en het scherm nooit iets anders zeggen over "is er een getuige".
 * ⚠️ **Een mislukte lezing toont niets.** De verwijzing is een extra: ze verdwijnen
 *    laat de lijst en de "Nieuw doel"-knop ongemoeid, en er is geen foutstaat voor
 *    iets dat de gebruiker niet gevraagd heeft.
 */
export function Belofteverwijzing({ doelId }: { readonly doelId: string | null }) {
  const router = useRouter();
  const { weg, geladen, verberg } = useBelofteverwijzingVerborgen();
  const lijsten = useAsync(doelId !== null && geladen && !weg ? fetchBelofteBegunstigden : null, [
    doelId,
    geladen,
    weg,
  ]);

  if (doelId === null || !geladen || weg || lijsten.data === undefined) return null;
  if (
    !toonBelofteverwijzing({
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
      <Button variant="stil" onPress={verberg}>
        {t('belofte.verwijzing.sluit')}
      </Button>
    </Card>
  );
}
