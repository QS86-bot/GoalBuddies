import { useState } from 'react';

import {
  belofteTekstVoor,
  belofteweek,
  isOpenstaand,
  trekIn,
  type Commitment,
} from '@/modules/commitments';
import { opmaaktaal, t } from '@/shared/i18n';
import { toonDatumLang, type UserClock } from '@/shared/time';
import { Body, Button, Caption, Card, Subheading } from '@/shared/ui';

/**
 * Een belofte die er al is: de tekst, de week, de stand, en intrekken op `set`.
 *
 * ⚠️ **Intrekken via `trekIn()`, en de uitkomst wordt getoond** (criterium 5).
 *    Op `set` wordt het `cancelled` en hoort de getuige niets (0293 spreekt pas
 *    bij `due`). Werd de belofte `due` tussen renderen en tikken, dan geeft
 *    `commitments_update` nul rijen en toont dit `commitment.fout.al_afgegaan`;
 *    de les van QS8-340, waar die melding niemand bereikte.
 * ⚠️ Mét een busy-stand: twee keer tikken is anders twee verzoeken.
 */
export function BestaandeBelofte({
  belofte,
  klok,
  onKlaar,
}: {
  readonly belofte: Commitment;
  readonly klok: UserClock;
  readonly onKlaar: () => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const stand = belofteTekstVoor(belofte);
  const week = belofteweek(klok, belofte.periode_start ?? '');
  const taal = opmaaktaal();

  async function trekBelofteIn() {
    setBezig(true);
    setFout(null);
    const uitkomst = await trekIn(belofte.id);
    setBezig(false);
    if (uitkomst.ok) onKlaar();
    else setFout(uitkomst.melding);
  }

  return (
    <Card>
      <Subheading>{t('belofte.jouw')}</Subheading>
      <Body>{belofte.body}</Body>
      {week === null ? null : (
        <Caption>
          {t('belofte.week', { start: toonDatumLang(week.start, taal), einde: toonDatumLang(week.laatsteDag, taal) })}
        </Caption>
      )}
      <Caption>{t('commitment.stand', { titel: stand.titel, uitleg: stand.uitleg })}</Caption>
      {isOpenstaand(belofte) ? (
        <Button variant="stil" busy={bezig} onPress={() => void trekBelofteIn()}>
          {t('straf.intrekken')}
        </Button>
      ) : (
        <Caption>{t('belofte.deze_week_al')}</Caption>
      )}
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}
