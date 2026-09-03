import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useProfiel, useSession } from '@/modules/auth';
import {
  categorieKeuzegroepen,
  maakDoel,
  RITMES,
  ritmeLabels,
  ritmeUitleg,
  type Categorie,
  type Ritme,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import { localDateIn, now } from '@/shared/time';
import {
  Body,
  Button,
  Caption,
  Card,
  Choice,
  GegroepeerdeKeuze,
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
  /**
   * ⚠️ `weekly` is de standaard en dat is de hele migratiestrategie van A53:
   *    wie het veld niet aanraakt, krijgt precies het gedrag van vóór dit
   *    besluit. Een doel is niet ineens iets waar je elke dag aan moet.
   */
  const [ritme, setRitme] = useState<Ritme>('weekly');
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
        ritme,
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

        {/*
          ⚠️ Vijftien gebieden in vier groepen — QS8-224. Een enkele `Choice` met
             vijftien knoppen is geen keuze maar een muur; zie de kop van
             `GegroepeerdeKeuze`.
        */}
        <GegroepeerdeKeuze
          label={t('nieuwdoel.categorie')}
          hint={t('nieuwdoel.categorie_hint')}
          groepen={categorieKeuzegroepen()}
          waarde={categorie}
          onKies={setCategorie}
        />

        {/*
          ⚠️ **Het ritme — besluit A53.** De uitleg onder de keuze zegt wat elke
             optie kóst en niet wat hij is: "dagelijks" klinkt als de serieuze
             keuze, en dan kiest iedereen hem terwijl het de enige is die zeven
             momenten per week vraagt.

          ⚠️ Dit veld stuurt alleen het vóórstel voor je weekdoelen. Wat er
             werkelijk beoordeeld wordt staat op het weekdoel zelf
             (`ceiling_days`), zodat een afgelopen week niet van betekenis
             verandert als je hier later iets anders kiest.
        */}
        <Choice
          label={t('ritme.kop')}
          hint={ritmeUitleg()[ritme]}
          opties={RITMES.map((r) => ({ waarde: r, label: ritmeLabels()[r] }))}
          waarde={ritme}
          onKies={setRitme}
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
