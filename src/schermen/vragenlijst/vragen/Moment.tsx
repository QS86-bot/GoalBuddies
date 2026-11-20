import { MOMENTEN, momentLabels, type Moment as MomentWaarde } from '@/modules/goals';
import { t } from '@/shared/i18n';
import { Card, Choice } from '@/shared/ui';

/** Vraag 3: wanneer ga je het echt doen? */
export function Moment({
  waarde,
  onKies,
}: {
  readonly waarde: MomentWaarde | null;
  readonly onKies: (moment: MomentWaarde) => void;
}) {
  return (
    <Card>
      <Choice
        label={t('vragenlijst.moment.vraag')}
        hint={t('vragenlijst.moment.toelichting')}
        opties={MOMENTEN.map((m) => ({ waarde: m, label: momentLabels()[m] }))}
        waarde={waarde ?? ''}
        onKies={(m) => onKies(m as MomentWaarde)}
      />
    </Card>
  );
}
