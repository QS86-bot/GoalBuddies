import { useState } from 'react';

import { t } from '../i18n';
import { telTekens } from '../tekst';

import { Body, Caption } from './Text';
import { Button } from './Button';
import { Card } from './Card';
import { Choice } from './Choice';
import { Field } from './Field';

/**
 * Het meldformulier — QS8-232.
 *
 * ⚠️ **Eén component voor een bericht en voor een persoon**, want het is
 *    hetzelfde formulier en de verschillen zitten in de aanroeper. Twee kopieën
 *    zouden betekenen dat de zin over wat er met een melding gebeurt op twee
 *    plekken staat, en dat is precies de zin die niet uit elkaar mag lopen.
 *
 * ⚠️ **De uitleg staat vóór het versturen en niet erna.** Wie meldt, doet dat om
 *    een probleem kwijt te raken; hij moet vóór hij drukt weten dat er geen team
 *    naar kijkt, want anders wacht hij op een uitkomst die niet komt en doet in
 *    de tussentijd niets anders om zichzelf te helpen. Vandaar ook de verwijzing
 *    naar blokkeren in diezelfde zin.
 *
 * ⚠️ **Dit component kiest de redenen niet zelf.** `MELDREDENEN` is een kopie van
 *    de CHECK `reports_reden_geldig` en woont in de module; een lijst hier zou de
 *    derde kopie zijn.
 */

export interface MeldpaneelProps {
  /** De vijf redenen, met hun labels. Uit `meldredenLabels()` in de module. */
  readonly redenen: readonly { readonly waarde: string; readonly label: string }[];
  readonly bezig: boolean;
  readonly fout: string | null;
  readonly onVerstuur: (reden: string, toelichting: string) => void;
  readonly onAnnuleer: () => void;
  /** Zoveel meldingen mag je vandaag nog. `null` = niet te bepalen. */
  readonly over?: number | null;
}

/** Dezelfde grens als `reports_toelichting_len`. */
const TOELICHTING_MAX = 1000;

export function Meldpaneel({
  redenen,
  bezig,
  fout,
  onVerstuur,
  onAnnuleer,
  over = null,
}: MeldpaneelProps) {
  const [reden, setReden] = useState(redenen[0]?.waarde ?? 'other');
  const [toelichting, setToelichting] = useState('');

  const teLang = telTekens(toelichting) > TOELICHTING_MAX;

  return (
    <Card nested>
      <Body muted>{t('melden.wat_gebeurt_er')}</Body>
      <Caption>{t('melden.niet_zichtbaar')}</Caption>

      <Choice
        label={t('melden.reden_label')}
        opties={redenen.map((r) => ({ waarde: r.waarde, label: r.label }))}
        waarde={reden}
        onKies={setReden}
      />

      <Field
        label={t('melden.toelichting_label')}
        hint={t('melden.toelichting_hint')}
        value={toelichting}
        onChangeText={setToelichting}
        multiline
      />
      {/*
        ⚠️ `telTekens()` en niet `.length`: Postgres telt codepunten en
           JavaScript UTF-16-eenheden (CLAUDE.md).
      */}
      <Caption>{`${telTekens(toelichting)}/${TOELICHTING_MAX}`}</Caption>

      {over === null || over > 3 ? null : <Caption danger>{t('melden.te_veel')}</Caption>}

      <Button
        variant="primair"
        block
        busy={bezig}
        disabled={teLang || over === 0}
        onPress={() => onVerstuur(reden, toelichting)}
      >
        {t('melden.versturen')}
      </Button>
      <Button variant="stil" block onPress={onAnnuleer}>
        {t('melden.annuleren')}
      </Button>

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}
