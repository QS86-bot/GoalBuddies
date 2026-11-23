import { useState } from 'react';
import { View } from 'react-native';

import {
  belofteTekstVoor,
  belofteweek,
  isOpenstaand,
  trekBelofteIn,
  wachtOpBeslissing,
  type Belofteuitslag,
  type Commitment,
} from '@/modules/commitments';
import { opmaaktaal, t } from '@/shared/i18n';
import { useTheme } from '@/shared/theme';
import { toonDatumLang, type UserClock } from '@/shared/time';
import { Body, Button, Caption, Card, Subheading } from '@/shared/ui';

import { Uitslagregel } from './Uitslagregel';

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
 * ⚠️ **QS8-815:** is deze kaart de nieuwste beslissing (`due`), dan staat de
 *    uitslagregel er in plaats van de standregel; zelfde feit, één zin (V2 = A).
 *    Na een gelukte intrekking roept hij `onIngetrokken` aan: het scherm toont dan
 *    de vaste melding en herlaadt (V4 = A).
 */
export function BestaandeBelofte({
  belofte,
  klok,
  dezeWeek,
  uitslag,
  onKlaar,
  onIngetrokken,
}: {
  readonly belofte: Commitment;
  readonly klok: UserClock;
  readonly dezeWeek: string;
  readonly uitslag: Belofteuitslag | null;
  readonly onKlaar: () => void;
  readonly onIngetrokken: () => void;
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
      {uitslag !== null ? (
        <Uitslagregel uitslag={uitslag} periodeStart={belofte.periode_start} klok={klok} />
      ) : wachtOpBeslissing(belofte, dezeWeek) ? (
        <Caption>{t('belofte.week_voorbij_wacht')}</Caption>
      ) : (
        <Caption>{t('commitment.stand', { titel: stand.titel, uitleg: stand.uitleg })}</Caption>
      )}
      {isOpenstaand(belofte) ? (
        <Intrekken key={belofte.id} belofteId={belofte.id} onKlaar={onKlaar} onIngetrokken={onIngetrokken} />
      ) : null}
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
type IntrekProps = { readonly belofteId: string; readonly onKlaar: () => void; readonly onIngetrokken: () => void };

function Intrekken({ belofteId, onKlaar, onIngetrokken }: IntrekProps) {
  const { afstand } = useTheme();
  const [vraagt, setVraagt] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<{ readonly melding: string; readonly beslist: boolean } | null>(null);

  async function bevestig() {
    setBezig(true);
    setFout(null);
    const uitkomst = await trekBelofteIn(belofteId);
    setBezig(false);
    if (uitkomst.ok) onIngetrokken();
    else setFout({ melding: uitkomst.melding, beslist: uitkomst.beslist });
  }

  if (!vraagt) {
    return (
      <Button variant="stil" onPress={() => setVraagt(true)}>
        {t('straf.intrekken')}
      </Button>
    );
  }
  // ⚠️ Besluit Quinten 23-11-2026 (twee rondes): is de belofte intussen beslist, dan
  //    valt er niets meer in te trekken. Geen intrekknop meer, alleen "Bekijk de
  //    uitslag", die het scherm herlaadt zodat de echte stand er staat. Bij een
  //    storing blijft de intrekknop staan.
  if (fout?.beslist === true) {
    return (
      <View style={{ gap: afstand.s }}>
        <Caption danger>{fout.melding}</Caption>
        <Button variant="stil" onPress={onKlaar}>
          {t('belofte.intrekken_uitslag')}
        </Button>
      </View>
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
      {fout === null ? null : <Caption danger>{fout.melding}</Caption>}
    </View>
  );
}
