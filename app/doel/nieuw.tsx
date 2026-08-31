import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useProfiel, useSession } from '@/modules/auth';
import { CATEGORIEEN, categorieLabels, maakDoel, type Categorie } from '@/modules/goals';
import { t } from '@/shared/i18n';
import { localDateIn, now } from '@/shared/time';
import {
  Body,
  Button,
  Caption,
  Card,
  Choice,
  Field,
  Screen,
  Subheading,
  useTerug,
} from '@/shared/ui';

/**
 * Een hoofddoel aanmaken — QS8-31, met de identiteitsvraag uit QS8-36.
 *
 * ⚠️ De identiteitszin staat bewust bóven de beschrijving en niet onderaan bij
 *    de optionele velden. Habit Huddle heeft precies die vraag van een veldje
 *    naar de kop van de kaart gepromoveerd, en dat is de reden dat dit scherm zo
 *    is opgebouwd (voorstel §1.5).
 */
export default function NieuwDoel() {
  const router = useRouter();
  const terug = useTerug('/doelen');
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const [titel, setTitel] = useState('');
  const [identiteit, setIdentiteit] = useState('');
  const [beschrijving, setBeschrijving] = useState('');
  const [categorie, setCategorie] = useState<Categorie>('other');
  const [datum, setDatum] = useState('');
  const [uren, setUren] = useState('');

  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    if (!userId || !profiel) return;
    setBezig(true);
    setFout(null);

    // ⚠️ "Vandaag" komt uit shared/time, in de tijdzone van deze gebruiker. Een
    //    doel voor morgen mag niet worden geweigerd omdat de server al over is.
    const vandaag = localDateIn(profiel.tz, now());

    const uitkomst = await maakDoel(
      userId,
      {
        title: titel,
        description: beschrijving.trim() === '' ? null : beschrijving,
        category: categorie,
        target_date: datum,
        identity_statement: identiteit.trim() === '' ? null : identiteit,
        available_hours_per_week: uren.trim() === '' ? null : Number(uren),
      },
      vandaag,
    );

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    router.replace(`/doel/${uitkomst.waarde.id}`);
  }

  return (
    <Screen title={t('nieuwdoel.titel')} eyebrow={t('nieuwdoel.eyebrow')} terug={{ naar: '/doelen' }}>
      <Card>
        <Field
          label={t('nieuwdoel.wat')}
          hint={t('nieuwdoel.wat_hint')}
          value={titel}
          onChangeText={setTitel}
          placeholder={t('nieuwdoel.wat_voorbeeld')}
        />

        <Field
          label={t('nieuwdoel.identiteit')}
          hint={t('nieuwdoel.identiteit_hint')}
          value={identiteit}
          onChangeText={setIdentiteit}
          placeholder={t('nieuwdoel.identiteit_voorbeeld')}
        />
      </Card>

      <Card>
        <Field
          label={t('nieuwdoel.streefdatum')}
          hint={t('nieuwdoel.streefdatum_hint')}
          value={datum}
          onChangeText={setDatum}
          placeholder="2026-12-31"
          autoCapitalize="none"
          inputMode="numeric"
        />

        <Choice
          label={t('nieuwdoel.categorie')}
          opties={CATEGORIEEN.map((c) => ({ waarde: c, label: categorieLabels()[c] }))}
          waarde={categorie}
          onKies={setCategorie}
        />
      </Card>

      <Card nested>
        <Subheading>{t('nieuwdoel.meer_details')}</Subheading>
        <Body muted>{t('nieuwdoel.meer_details_uitleg')}</Body>

        <Field
          label={t('nieuwdoel.beschrijving')}
          value={beschrijving}
          onChangeText={setBeschrijving}
          multiline
          numberOfLines={4}
          placeholder={t('nieuwdoel.beschrijving_voorbeeld')}
        />

        <Field
          label={t('nieuwdoel.uren')}
          hint={t('nieuwdoel.uren_hint')}
          value={uren}
          onChangeText={setUren}
          inputMode="numeric"
          placeholder="6"
        />
      </Card>

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button variant="primair" block busy={bezig} onPress={() => void bewaar()}>
        {t('nieuwdoel.aanmaken')}
      </Button>
      <Button variant="stil" block onPress={terug}>
        {t('nieuwdoel.annuleren')}
      </Button>
    </Screen>
  );
}
