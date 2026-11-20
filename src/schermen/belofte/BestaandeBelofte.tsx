import { useState } from 'react';

import {
  belofteTekstVoor,
  belofteweek,
  isOpenstaand,
  trekIn,
  wachtOpBeslissing,
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
  dezeWeek,
  onKlaar,
}: {
  readonly belofte: Commitment;
  readonly klok: UserClock;
  readonly dezeWeek: string;
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
      <Subheading>{t(belofte.periode_start === dezeWeek ? 'belofte.jouw' : 'belofte.vorige_kop')}</Subheading>
      <Body>{belofte.body}</Body>
      {week === null ? null : (
        <Caption>
          {t('belofte.week', { start: toonDatumLang(week.start, taal), einde: toonDatumLang(week.laatsteDag, taal) })}
        </Caption>
      )}
      {/* ⚠️ Na de week en vóór de beslissing (0313 beslist één run later) zegt
          "geldt voor deze week" iets onwaars; intrekken mag dan nog (besloten op QS8-759). */}
      {wachtOpBeslissing(belofte, dezeWeek) ? (
        <Caption>{t('belofte.week_voorbij_wacht')}</Caption>
      ) : (
        <Caption>{t('commitment.stand', { titel: stand.titel, uitleg: stand.uitleg })}</Caption>
      )}
      {isOpenstaand(belofte) ? (
        <Button variant="stil" busy={bezig} onPress={() => void trekBelofteIn()}>
          {t('straf.intrekken')}
        </Button>
      ) : null}
      {!isOpenstaand(belofte) && belofte.periode_start === dezeWeek ? <Caption>{t('belofte.deze_week_al')}</Caption> : null}
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}
