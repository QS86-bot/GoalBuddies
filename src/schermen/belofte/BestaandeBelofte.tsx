import { useState } from 'react';
import { View } from 'react-native';

import {
  belofteTekstVoor,
  belofteweek,
  isOpenstaand,
  trekBelofteIn,
  wachtOpBeslissing,
  type Commitment,
} from '@/modules/commitments';
import { opmaaktaal, t } from '@/shared/i18n';
import { useTheme } from '@/shared/theme';
import { toonDatumLang, type UserClock } from '@/shared/time';
import { Body, Button, Caption, Card, Subheading } from '@/shared/ui';

/**
 * Een belofte die er al is: de tekst, de week, de stand, en intrekken op `set`.
 *
 * ⚠️ **Intrekken via `trekBelofteIn()`, en de uitkomst wordt getoond** (criterium 5).
 *    Op `set` wordt het `cancelled` en hoort de getuige niets (0293 spreekt pas
 *    bij `due`). Werd de belofte `due` tussen renderen en tikken, dan geeft
 *    `commitments_update` nul rijen en toont dit `belofte.fout.al_afgegaan`;
 *    de les van QS8-340, waar die melding niemand bereikte. ⚠️ Die tekst zegt
 *    "intussen beslist" en niet "in werking getreden": nul rijen is ook een
 *    belofte die 0313 als gehouden op `cancelled` zette (security-review QS8-799).
 * ⚠️ `key` op `Intrekken`: een openstaande vraag hoort nooit bij een andere belofte.
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
  const stand = belofteTekstVoor(belofte);
  const week = belofteweek(klok, belofte.periode_start ?? '');
  const taal = opmaaktaal();

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
      {isOpenstaand(belofte) ? <Intrekken key={belofte.id} belofteId={belofte.id} onKlaar={onKlaar} /> : null}
      {!isOpenstaand(belofte) && belofte.periode_start === dezeWeek ? <Caption>{t('belofte.deze_week_al')}</Caption> : null}
    </Card>
  );
}

/**
 * Intrekken in twee stappen — QS8-799, besluit Quinten 23-11-2026.
 *
 * ⚠️⚠️ **De eerste tik schrijft niets.** Hij opent alleen de vraag met de gevolgen:
 *    de belofte vervalt, en de getuige krijgt er niets van te zien (domeinregel 7,
 *    en 0293: op `set` heeft de getuige nooit van de belofte gehoord). Pas
 *    "Ja, trek mijn belofte in" roept `trekBelofteIn()` aan, en dat is de enige
 *    aanroep in de app (`tests/beloftes/belofte-intrekken.test.ts`). Een commitment
 *    device gaat nooit stilzwijgend aan, en dus ook niet met één misser uit.
 * ⚠️ Mét een busy-stand: twee keer tikken is anders twee verzoeken.
 */
function Intrekken({ belofteId, onKlaar }: { readonly belofteId: string; readonly onKlaar: () => void }) {
  const { afstand } = useTheme();
  const [vraagt, setVraagt] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bevestig() {
    setBezig(true);
    setFout(null);
    const uitkomst = await trekBelofteIn(belofteId);
    setBezig(false);
    if (uitkomst.ok) onKlaar();
    else setFout(uitkomst.melding);
  }

  if (!vraagt) {
    return (
      <Button variant="stil" onPress={() => setVraagt(true)}>
        {t('straf.intrekken')}
      </Button>
    );
  }
  return (
    <View style={{ gap: afstand.s }}>
      <Subheading>{t('belofte.intrekken_kop')}</Subheading>
      <Body>{t('belofte.intrekken_gevolg')}</Body>
      <Body muted>{t('belofte.intrekken_getuige')}</Body>
      <Button variant="primair" busy={bezig} onPress={() => void bevestig()}>
        {t('belofte.intrekken_ja')}
      </Button>
      <Button variant="stil" disabled={bezig} onPress={() => setVraagt(false)}>
        {t('belofte.intrekken_nee')}
      </Button>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </View>
  );
}
