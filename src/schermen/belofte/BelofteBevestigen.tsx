import { useState } from 'react';
import { View } from 'react-native';

import { gaWeekbelofteAan } from '@/modules/commitments';
import { opmaaktaal, t } from '@/shared/i18n';
import { useTheme } from '@/shared/theme';
import { toonDatumLang, type UserClock } from '@/shared/time';
import { Body, Button, Caption, Card, Subheading } from '@/shared/ui';

import type { Bevestigstap } from './keuze';

/**
 * De aparte bevestigstap — QS8-761, criterium 2 en §4 van de poort QS8-744.
 *
 * ⚠️⚠️ **Drie dingen staan hier, en alle drie letterlijk:** het gevolg (de
 *    geschoonde tekst, wat er werkelijk opgeslagen wordt: QS8-507), de periode
 *    (de week van de stap, en `gaWeekbelofteAan()` weigert als die bij het tikken
 *    voorbij is), en wie het ziet en wanneer (alleen de getuige, alleen bij een
 *    gebroken belofte, en tot dan niemand). Plus wat het níet doet: geen geld,
 *    geen extra punten (A43), en de week-startdag zit vast zolang ze loopt (0313).
 *    Is er van de week minder dan één dag over, dan staat dat er ook (QS8-799).
 * ⚠️ **Dit is de enige plek die `gaWeekbelofteAan()` aanroept**, en alleen
 *    vanuit de knop hieronder; `tests/beloftes/belofte-bevestigen.test.ts` legt dat vast.
 */
export function BelofteBevestigen({
  goalId,
  stap,
  klok,
  onTerug,
  onKlaar,
}: {
  readonly goalId: string;
  readonly stap: Bevestigstap;
  readonly klok: UserClock;
  readonly onTerug: () => void;
  readonly onKlaar: () => void;
}) {
  const { afstand } = useTheme();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  async function beloof() {
    setBezig(true);
    setFout(null);
    const invoer = { body: stap.tekst, image_url: null };
    const uitkomst = await gaWeekbelofteAan(goalId, invoer, stap.begunstigde, klok, stap.periode.start);
    // ⚠️ Bij succes blijft de knop bezig tot het scherm herlaadt: anders gaf een
    //    tweede tik kort "staat al een belofte" terwijl het gelukt was.
    if (uitkomst.ok) {
      onKlaar();
      return;
    }
    setBezig(false);
    setFout(uitkomst.melding);
  }

  return (
    <Card>
      <Bevestigtekst stap={stap} />
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <View style={{ gap: afstand.s }}>
        <Button variant="primair" busy={bezig} onPress={() => void beloof()}>
          {t('belofte.ja')}
        </Button>
        <Button variant="stil" onPress={onTerug}>
          {t('straf.terug')}
        </Button>
      </View>
    </Card>
  );
}

/** Gevolg, periode, wie het ziet en wanneer, en wat het niet doet. */
function Bevestigtekst({ stap }: { readonly stap: Bevestigstap }) {
  const taal = opmaaktaal();
  return (
    <>
      <Subheading>{t('belofte.bevestig_kop')}</Subheading>
      <Body>{t('belofte.bevestig_gevolg', { tekst: stap.tekst })}</Body>
      <Body>
        {t('belofte.bevestig_periode', {
          start: toonDatumLang(stap.periode.start, taal),
          einde: toonDatumLang(stap.periode.laatsteDag, taal),
        })}
      </Body>
      {/* ⚠️ QS8-799: direct onder de periode, waar het oog de dagen leest. */}
      {stap.korteWeek ? <Body>{t('belofte.bevestig_kort')}</Body> : null}
      <Body muted>{t('belofte.bevestig_wanneer')}</Body>
      <Body muted>{t('belofte.bevestig_wie', { getuige: stap.naam })}</Body>
      <Caption>{t('belofte.bevestig_intrekken')}</Caption>
      <Caption>{t('belofte.bevestig_punten')}</Caption>
      <Caption>{t('belofte.bevestig_startdag')}</Caption>
      <Caption>{t('straf.geen_geld')}</Caption>
    </>
  );
}
