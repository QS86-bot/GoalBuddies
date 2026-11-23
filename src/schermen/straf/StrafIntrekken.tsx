import { useState } from 'react';
import { View } from 'react-native';

import { trekStrafIn } from '@/modules/commitments';
import { t } from '@/shared/i18n';
import { useTheme } from '@/shared/theme';
import { Body, Button, Caption, Subheading } from '@/shared/ui';

/**
 * Een straf op een doel intrekken, in twee stappen — QS8-814, in de vorm van
 * QS8-799 (besluit Quinten 23-11-2026, 16:55 UTC).
 *
 * ⚠️⚠️ **De eerste tik schrijft niets.** Hij opent alleen de vraag met de gevolgen:
 *    de straf vervalt, en de getuige krijgt er niets van te zien (0293: op `set`
 *    heeft de getuige nooit van de straf gehoord, en intrekken kan alleen vanuit
 *    `set`). Pas "Ja, trek mijn straf in" roept `trekStrafIn()` aan, en dat is de
 *    enige aanroep in de app (`tests/beloftes/straf-intrekken.test.ts`). Een
 *    commitment device gaat nooit stilzwijgend aan, en dus ook niet met één misser
 *    uit (domeinregel 5).
 *
 * ⚠️ **`metUitstelverzoek`: de ene plek waar intrekken wél iets verandert voor een ander.**
 *    Een groep die om uitstel gevraagd is, weet dát er een straf op dit doel staat
 *    (`straffen_bij_uitstelverzoek()`, 0218/0321), zolang het verzoek niet is
 *    ingetrokken, ook nadat erover beslist is. Dat bit verdwijnt stil zodra de straf
 *    `cancelled` is. De vraag zegt dat dan met zoveel woorden, en alleen dan
 *    (besluit Quinten, optie B, en voor "open óf beslist" optie A van 17:16 UTC).
 *    Wat "niet ingetrokken" is, bepaalt `uitstelGevraagd()` in `@/modules/goals`.
 *
 * ⚠️ Mét een busy-stand: twee keer tikken is anders twee verzoeken.
 */
export function StrafIntrekken({
  strafId,
  metUitstelverzoek,
  onKlaar,
}: {
  readonly strafId: string;
  readonly metUitstelverzoek: boolean;
  readonly onKlaar: () => void;
}) {
  const { afstand } = useTheme();
  const [vraagt, setVraagt] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<{ readonly melding: string; readonly beslist: boolean } | null>(null);

  async function bevestig() {
    setBezig(true);
    setFout(null);
    const uitkomst = await trekStrafIn(strafId);
    setBezig(false);
    if (uitkomst.ok) onKlaar();
    else setFout({ melding: uitkomst.melding, beslist: uitkomst.beslist });
  }

  if (!vraagt) {
    return (
      <Button variant="stil" onPress={() => setVraagt(true)}>
        {t('straf.intrekken')}
      </Button>
    );
  }
  // ⚠️ Is de straf intussen beslist, dan valt er niets meer in te trekken: geen
  //    intrekknop meer, alleen "Bekijk de uitslag", die het scherm herlaadt. Bij een
  //    storing blijft de intrekknop staan, want dan heeft opnieuw proberen zin.
  if (fout?.beslist === true) return <Beslist melding={fout.melding} onKlaar={onKlaar} />;
  return (
    <View style={{ gap: afstand.s }}>
      <Subheading>{t('straf.intrekken_kop')}</Subheading>
      <Body>{t('straf.intrekken_gevolg')}</Body>
      <Body muted>{t('straf.intrekken_getuige')}</Body>
      {metUitstelverzoek ? <Body muted>{t('straf.intrekken_uitstel')}</Body> : null}
      <Button variant="primair" busy={bezig} onPress={() => void bevestig()}>
        {t('straf.intrekken_ja')}
      </Button>
      <Button variant="stil" disabled={bezig} onPress={() => setVraagt(false)}>
        {t('straf.intrekken_nee')}
      </Button>
      {fout === null ? null : <Caption danger>{fout.melding}</Caption>}
    </View>
  );
}

/** De straf is intussen beslist: alleen de melding en "Bekijk de uitslag". */
function Beslist({ melding, onKlaar }: { readonly melding: string; readonly onKlaar: () => void }) {
  const { afstand } = useTheme();
  return (
    <View style={{ gap: afstand.s }}>
      <Caption danger>{melding}</Caption>
      <Button variant="stil" onPress={onKlaar}>
        {t('straf.intrekken_uitslag')}
      </Button>
    </View>
  );
}
