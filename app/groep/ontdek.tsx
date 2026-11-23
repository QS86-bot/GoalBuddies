import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  fetchOntdekteGroepen,
  fetchVerzoekenOver,
  groepsKaartVan,
  type OntdekteGroep,
  vraagLidmaatschapAan,
  voertaalLabels,
  VOERTALEN,
  type Voertaal,
} from '@/modules/buddies';
import { categorieLabels } from '@/modules/goals';
import { CATEGORIEEN, type Categorie } from '@/shared/categorieen';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  Choice,
  OntdekGroepKaart,
  Screen,
  useAsync,
} from '@/shared/ui';
import { useVolgTaal } from '@/shared/i18n/react';

/**
 * Groepen ontdekken — QS8-231, migratie 0144.
 *
 * ⚠️ **Dit scherm kan de grens niet verruimen en dat is met opzet zo gebouwd.**
 *    Alles wat hier staat komt uit `ontdek_groepen()`, een SECURITY DEFINER met
 *    een expliciete kolomlijst. `groups_select` blijft dicht, dus een aangepaste
 *    client die dezelfde groeps-id's aan PostgREST voert, krijgt nul rijen
 *    terug. Zou dit scherm de bron van de regel zijn, dan was het geen regel.
 *
 * ⚠️ **Wat hier níét staat is de helft van het ontwerp.** Geen leden, geen
 *    doelen, geen reeks, geen activiteit, geen "deze groep is stil". Dat laatste
 *    is de meest verleidelijke: het helpt de zoeker en het is een uitspraak over
 *    drie mensen die er niets over te zeggen hebben gehad (domeinregel 7).
 *
 * ⚠️ **Een aanvraag belooft niets.** De tekst na het versturen zegt dat het
 *    verzoek bij de beheerder staat en dat die zelf bepaalt of hij reageert. Een
 *    "je hoort snel iets" zou de app iets laten toezeggen wat een mens moet doen.
 */
export default function GroepenOntdekken() {
  useVolgTaal();
  const router = useRouter();

  const [categorie, setCategorie] = useState<Categorie | 'alles'>('alles');
  const [taal, setTaal] = useState<Voertaal | 'alles'>('alles');

  /**
   * ⚠️ **De eerste pagina komt uit `useAsync`, de volgende uit een knop.** Dat
   *    scheelt de handgeschreven `levend`-vlag die dit scherm eerst twee keer
   *    had, en het is bovendien de enige vorm waarin de laadstaat bij een
   *    filterwissel klopt zonder een `setState` in een effect.
   */
  const {
    data: eerste,
    loading,
    error,
    herlaad,
  } = useAsync(
    () =>
      fetchOntdekteGroepen(categorie === 'alles' ? null : categorie, taal === 'alles' ? null : taal, {
        pagina: 0,
      }),
    [categorie, taal],
  );

  /**
   * De pagina's ná de eerste, met de filtercombinatie waar ze bij horen erin.
   *
   * ⚠️ **De sleutel staat in de state en niet in een effect dat hem leegmaakt.**
   *    Zou hij dat wel doen, dan is er een render waarin de tweede pagina van het
   *    ene onderwerp onder de eerste van het andere staat — en dan liegt de lijst
   *    over waar hij bij hoort. Nu is "hoort er niet bij" een vergelijking en
   *    geen opruimactie, en dus niet mis te lopen.
   */
  const sleutel = `${categorie}|${taal}`;
  const [vervolg, setVervolg] = useState<{
    readonly sleutel: string;
    readonly rijen: readonly OntdekteGroep[];
    readonly meer: boolean;
    readonly pagina: number;
  }>({ sleutel, rijen: [], meer: false, pagina: 0 });

  const [laadtMeer, setLaadtMeer] = useState(false);
  const [meerFout, setMeerFout] = useState<string | null>(null);

  const bijDitFilter = vervolg.sleutel === sleutel ? vervolg : null;
  const rijen = [...(eerste?.rijen ?? []), ...(bijDitFilter?.rijen ?? [])];
  const meer = bijDitFilter === null ? (eerste?.meer ?? false) : bijDitFilter.meer;

  /**
   * ⚠️ Per groep en niet één vlag voor het scherm. Wie twee groepen aanschrijft,
   *    moet bij de tweede niet de bevestiging van de eerste zien staan.
   */
  const [aangevraagd, setAangevraagd] = useState<readonly string[]>([]);

  /**
   * Hoeveel groepen je vandaag nog mag aanschrijven.
   *
   * ⚠️ `null` = niet te bepalen; dan zegt het scherm er niets over. Het
   *    afgetrokken aantal is afgeleid en geen tweede teller: één bron, en de
   *    database blijft hoe dan ook de rem.
   */
  const { data: ruimte } = useAsync(() => fetchVerzoekenOver(), []);
  const over = ruimte === null || ruimte === undefined ? null : Math.max(0, ruimte - aangevraagd.length);

  async function laadMeer() {
    const volgende = (bijDitFilter?.pagina ?? 0) + 1;
    setLaadtMeer(true);
    setMeerFout(null);

    try {
      const uitkomst = await fetchOntdekteGroepen(
        categorie === 'alles' ? null : categorie,
        taal === 'alles' ? null : taal,
        { pagina: volgende },
      );
      setVervolg({
        sleutel,
        rijen: [...(bijDitFilter?.rijen ?? []), ...uitkomst.rijen],
        meer: uitkomst.meer,
        pagina: volgende,
      });
    } catch (f: unknown) {
      setMeerFout(f instanceof Error ? f.message : t('ontdek.laden_mislukt'));
    } finally {
      setLaadtMeer(false);
    }
  }

  async function vraagAan(groep: OntdekteGroep, bericht: string): Promise<string | null> {
    const uitkomst = await vraagLidmaatschapAan(groep.groupId, bericht);
    if (!uitkomst.ok) return uitkomst.melding;
    setAangevraagd((huidig) => [...huidig, groep.groupId]);
    return null;
  }

  return (
    <Screen
      title={t('ontdek.titel')}
      eyebrow={t('ontdek.eyebrow')}
      terug={{ naar: '/groep' }}
    >
      <Card>
        <Body muted>{t('ontdek.uitleg')}</Body>

        <Choice
          label={t('ontdek.filter_categorie')}
          opties={[
            { waarde: 'alles' as const, label: t('ontdek.alles') },
            ...CATEGORIEEN.map((c) => ({ waarde: c, label: categorieLabels()[c] })),
          ]}
          waarde={categorie}
          onKies={(gekozen) => setCategorie(gekozen as Categorie | 'alles')}
        />

        <Choice
          label={t('ontdek.filter_taal')}
          opties={[
            { waarde: 'alles' as const, label: t('ontdek.alles') },
            ...VOERTALEN.map((v) => ({ waarde: v, label: voertaalLabels()[v] })),
          ]}
          waarde={taal}
          onKies={(gekozen) => setTaal(gekozen as Voertaal | 'alles')}
        />

        {over === null ? null : (
          <Caption>{over === 0 ? t('ontdek.over_op') : t('ontdek.over_nog', { aantal: over })}</Caption>
        )}
      </Card>

      <AsyncView
        loading={loading}
        error={error}
        data={rijen}
        isEmpty={(lijst) => lijst.length === 0}
        onRetry={herlaad}
        empty={{
          title: t('ontdek.leeg_titel'),
          body: t('ontdek.leeg_tekst'),
        }}
      >
        {(lijst) => (
          <View style={styles.lijst}>
            {lijst.map((groep) => (
              <OntdekGroepKaart
                key={groep.groupId}
                groep={groepsKaartVan(groep, categorieLabels()[groep.categorie as Categorie] ?? groep.categorie)}
                aangevraagd={aangevraagd.includes(groep.groupId)}
                geblokkeerd={over === 0}
                onVraagAan={(bericht) => vraagAan(groep, bericht)}
              />
            ))}
          </View>
        )}
      </AsyncView>

      {meerFout === null ? null : <Caption danger>{meerFout}</Caption>}

      {meer ? (
        <Button
          variant="secundair"
          block
          busy={laadtMeer}
          onPress={() => void laadMeer()}
        >
          {t('ontdek.meer')}
        </Button>
      ) : null}

      <Button variant="stil" block onPress={() => router.push('/groep/nieuw')}>
        {t('ontdek.zelf_beginnen')}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
});
