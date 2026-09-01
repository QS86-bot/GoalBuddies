import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import {
  categorieKeuzegroepen,
  fetchDoel,
  wijzigDoel,
  type Categorie,
  type DoelMetVoortgang,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  GegroepeerdeKeuze,
  Field,
  Screen,
  Subheading,
  useAsync,
  useTerug,
} from '@/shared/ui';

/**
 * Een bestaand doel bewerken — de knop die bij `wijzigDoel()` ontbrak.
 *
 * ⚠️ **Deze functie stond er sinds QS8-106 en had nul aanroepers.** De
 *    controleronde van 28-08 vond hem als onbereikbare feature: een doel was na
 *    aanmaken niet meer te wijzigen, ook geen typefout in de titel. Dat is de
 *    variant van onwrikbare regel 18 zonder kapot onderdeel — elk schakeltje
 *    was af en de keten was nergens verbonden, dus geen enkele test kón het zien.
 *
 * ⚠️ **De streefdatum staat hier niet, en dat is een domeinregel en geen
 *    omissie.** `doelPatchSchema` is `doelSchema.omit({ target_date: true })`:
 *    een datum verschuiven loopt via het verzoek aan een buddy (A7), want anders
 *    is elke afspraak eenzijdig op te rekken. Het scherm zegt dat met zoveel
 *    woorden in plaats van het veld stilzwijgend weg te laten — een ontbrekend
 *    veld leest als een bug, een uitgelegd veld als een keuze.
 *
 * ⚠️ **Een eigen scherm en geen blok in `app/doel/[id].tsx`.** Dat bestand is
 *    ruim vijftienhonderd regels; hetzelfde argument als bij het weekdoelscherm.
 */
export default function DoelBewerken() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const terug = useTerug(`/doel/${id}`);

  const {
    data: doel,
    loading,
    error,
    herlaad,
  } = useAsync(id ? () => fetchDoel(id) : null, [id]);

  return (
    <Screen
      title={t('doelbewerken.titel')}
      eyebrow={t('doelbewerken.eyebrow')}
      terug={{ naar: `/doel/${id}` }}
    >
      <AsyncView
        loading={loading}
        error={error}
        data={doel ?? undefined}
        isEmpty={(d) => d === null}
        onRetry={herlaad}
        empty={{
          title: t('doelbewerken.leeg_titel'),
          body: t('doelbewerken.leeg_tekst'),
        }}
      >
        {(geladen) =>
          geladen === null ? null : (
            // ⚠️ De sleutel remount het formulier zodra er een ánder doel geladen
            //    is. Zonder hem houden de `useState`-beginwaarden het eerste doel
            //    vast — dezelfde val als op het onboardingscherm (28-08).
            <Formulier key={geladen.id} doel={geladen} onKlaar={() => router.replace(`/doel/${geladen.id}`)} />
          )
        }
      </AsyncView>

      <Button variant="stil" block onPress={terug}>
        {t('doelbewerken.annuleren')}
      </Button>
    </Screen>
  );
}

interface FormulierProps {
  readonly doel: DoelMetVoortgang;
  readonly onKlaar: () => void;
}

function Formulier({ doel, onKlaar }: FormulierProps) {
  const [titel, setTitel] = useState(doel.title);
  const [identiteit, setIdentiteit] = useState(doel.identity_statement ?? '');
  const [beschrijving, setBeschrijving] = useState(doel.description ?? '');
  const [categorie, setCategorie] = useState<Categorie>((doel.category ?? 'other') as Categorie);
  const [uren, setUren] = useState(
    doel.available_hours_per_week === null ? '' : String(doel.available_hours_per_week),
  );

  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    setBezig(true);
    setFout(null);

    const uitkomst = await wijzigDoel(doel.id, {
      title: titel,
      description: beschrijving.trim() === '' ? null : beschrijving,
      category: categorie,
      identity_statement: identiteit.trim() === '' ? null : identiteit,
      available_hours_per_week: uren.trim() === '' ? null : Number(uren),
    });

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    onKlaar();
  }

  return (
    <>
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

        {/* ⚠️ Geen datumveld, maar wel uitleg. Zie de kop van dit bestand. */}
        <Subheading>{t('doelbewerken.streefdatum_kop')}</Subheading>
        <Body muted>{t('doelbewerken.streefdatum_uitleg', { datum: doel.target_date })}</Body>
      </Card>

      <Card nested>
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
        {t('doelbewerken.bewaren')}
      </Button>
    </>
  );
}
