import { MINUTEN_OPTIES, minutenLabels, urenPerWeekUitMinuten, type Minuten } from '@/modules/goals';
import { t } from '@/shared/i18n';
import { Caption, Card, Choice } from '@/shared/ui';

/** Vraag 2: hoeveel tijd kun je eerlijk geven op een gewone dag? */
export function Tijd({
  waarde,
  onKies,
}: {
  readonly waarde: Minuten | null;
  readonly onKies: (minuten: Minuten) => void;
}) {
  const uren = urenPerWeekUitMinuten(waarde);

  return (
    <Card>
      <Choice
        label={t('vragenlijst.tijd.vraag')}
        hint={t('vragenlijst.tijd.toelichting')}
        opties={MINUTEN_OPTIES.map((m) => ({ waarde: m, label: minutenLabels()[m] }))}
        waarde={waarde ?? 0}
        onKies={(m) => onKies(m as Minuten)}
      />

      {/* ⚠️ De omrekening staat op het scherm en gebeurt niet stil: een getal invullen
          dat de gebruiker niet gegeven heeft, is verzinnen. */}
      {uren === null ? null : <Caption>{t('vragenlijst.uren_per_week', { uren })}</Caption>}
    </Card>
  );
}
