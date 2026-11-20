import { View } from 'react-native';

import { gevoelLabels, GEVOELENS, MAX_EIGEN_GEVOEL, type Gevoel as GevoelWaarde } from '@/modules/goals';
import { t } from '@/shared/i18n';
import { telTekens } from '@/shared/tekst';
import { Button, Caption, Card, Field, Subheading } from '@/shared/ui';

import { stijlen } from '../stijlen';

/** Is de eigen omschrijving te lang? Geteld in codepunten, net als de CHECK. */
export function eigenTeLang(tekst: string | null): boolean {
  return telTekens((tekst ?? '').trim()) > MAX_EIGEN_GEVOEL;
}

/**
 * Vraag 5: hoe wil je je voelen? Zes voorstellen of je eigen woorden.
 *
 * ⚠️ **Alleen voor jezelf, en dat staat er ook.** Een voorstel stuurt de tekst van je
 *    herinnering; je eigen woorden staan alleen als motto op je eigen scherm en
 *    komen nooit in een melding (besluit Quinten, 19-11-2026). Nog eens op een
 *    gekozen voorstel tikken haalt de keuze weer weg.
 *
 * ⚠️ Geen `maxLength` op het veld: dat telt UTF-16-eenheden en kapt een emoji
 *    midden door. De teller en de weigering tellen codepunten, zoals de database.
 */
export function Gevoel({
  gevoel,
  eigen,
  onKies,
  onEigen,
}: {
  readonly gevoel: GevoelWaarde | null;
  readonly eigen: string | null;
  readonly onKies: (gevoel: GevoelWaarde | null) => void;
  readonly onEigen: (tekst: string | null) => void;
}) {
  const labels = gevoelLabels();
  const aantal = telTekens((eigen ?? '').trim());

  return (
    <Card>
      <Subheading>{t('vragenlijst.gevoel.vraag')}</Subheading>
      <Caption>{t('vragenlijst.gevoel.toelichting')}</Caption>

      <View style={stijlen.gevoelen}>
        {GEVOELENS.map((g) => (
          <Button
            key={g}
            variant={gevoel === g ? 'secundair' : 'stil'}
            selected={gevoel === g}
            block
            onPress={() => onKies(gevoel === g ? null : g)}
          >
            {labels[g]}
          </Button>
        ))}
      </View>

      <Field
        label={t('vragenlijst.gevoel.eigen_label')}
        hint={t('vragenlijst.gevoel.eigen_hint')}
        value={eigen ?? ''}
        onChangeText={(tekst) => onEigen(tekst === '' ? null : tekst)}
        placeholder={t('vragenlijst.gevoel.eigen_plaatshouder')}
        {...(eigenTeLang(eigen) ? { error: t('vragenlijst.gevoel.eigen_te_lang', { max: MAX_EIGEN_GEVOEL }) } : {})}
      />
      <Caption>{t('vragenlijst.gevoel.eigen_teller', { aantal, max: MAX_EIGEN_GEVOEL })}</Caption>
    </Card>
  );
}
