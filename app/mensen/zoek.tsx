/**
 * Mensen zoeken buiten je eigen groepen — QS8-476.
 *
 * ⚠️⚠️ **Dit scherm kan de grens niet verruimen, en dat is met opzet zo
 *    gebouwd.** Alles wat hier staat komt uit `zoek_mensen()`, een SECURITY
 *    DEFINER met een expliciete kolomlijst: `id`, `display_name`, `avatar_url`.
 *    `profiles_select` blijft dicht, dus een aangepaste client die dezelfde
 *    id's aan PostgREST voert krijgt nul rijen. Zou dit scherm de bron van de
 *    regel zijn, dan was het geen regel.
 *
 * ⚠️ **Wat hier níét staat is de helft van het ontwerp.** Geen groepen, geen
 *    doelen, geen reeks, geen punten, geen "actief sinds". Vindbaarheid is
 *    identiteit en geen voortgang — domeinregel 7. Uit deze drie velden is geen
 *    gemiste week af te leiden, en dat moet zo blijven als er ooit een veld bij
 *    komt.
 *
 * ⚠️ **Drie lege staten en dat is niet overdreven.** "Nog niets getypt",
 *    "term te kort" en "niets gevonden" zijn drie verschillende dingen, en één
 *    zin voor alle drie liegt in twee ervan. ⚠️ De derde formulering doet er
 *    bovendien toe: hij mag niet suggereren dat de gezochte persoon geen account
 *    heeft — alleen dat niemand met die naam zichzelf vindbaar heeft gemaakt.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type GevondenPersoon, termIsLangGenoeg, zoekMensen, ZOEKTERM_MIN } from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  AsyncView,
  Avatar,
  Body,
  Button,
  Caption,
  Card,
  Field,
  Screen,
  Subheading,
  useAsync,
} from '@/shared/ui';

/**
 * De vervolgpagina's van één zoekterm.
 *
 * ⚠️ **De sleutel staat in de state en niet in een effect.** Zonder hem belandt
 *    pagina 2 van term A onder pagina 1 van term B — dezelfde val die
 *    `ontdek.tsx` beschrijft. Hij staat hier los omdat dit de enige plek is waar
 *    die koppeling tussen term en pagina leeft; in het scherm ernaast raakte hij
 *    ondergesneeuwd tussen de opmaak.
 */
function useVervolgpaginas(gezocht: string) {
  const [vervolg, setVervolg] = useState<{
    readonly sleutel: string;
    readonly rijen: readonly GevondenPersoon[];
    readonly meer: boolean;
    readonly pagina: number;
  }>({ sleutel: '', rijen: [], meer: false, pagina: 0 });

  const bijDezeTerm = vervolg.sleutel === gezocht ? vervolg : null;

  async function laadMeer() {
    const pagina = (bijDezeTerm?.pagina ?? 0) + 1;
    const volgende = await zoekMensen(gezocht, { pagina });
    setVervolg({
      sleutel: gezocht,
      rijen: [...(bijDezeTerm?.rijen ?? []), ...volgende.rijen],
      meer: volgende.meer,
      pagina,
    });
  }

  return {
    rijen: bijDezeTerm?.rijen ?? [],
    meer: bijDezeTerm?.meer ?? null,
    laadMeer,
    wis: () => setVervolg({ sleutel: '', rijen: [], meer: false, pagina: 0 }),
  };
}

/** De resultatenlijst: per persoon een naam en een foto, en verder niets. */
function Gevonden({ personen, meer, opMeer }: {
  readonly personen: readonly GevondenPersoon[];
  readonly meer: boolean;
  readonly opMeer: () => void;
}) {
  return (
    <View style={styles.lijst}>
      {personen.map((persoon) => (
        <Card key={persoon.userId}>
          <View style={styles.rij}>
            <Avatar name={persoon.naam} url={persoon.avatarUrl} />
            <Subheading>{persoon.naam}</Subheading>
          </View>
        </Card>
      ))}
      {meer ? <Button onPress={opMeer}>{t('mensen.meer')}</Button> : null}
    </View>
  );
}

export default function MensenZoeken() {
  const [term, setTerm] = useState('');

  /**
   * ⚠️ **Zoeken op een knop en niet op elke toetsaanslag.** De dagteller in
   *    `zoek_mensen()` telt per aanroep; zonder deze knop is "Jan" vier
   *    aanroepen en is de rem in een paar zoekopdrachten op. Dit is de naad
   *    tussen het scherm en die rem, en hij hoort hier zichtbaar te zijn en niet
   *    verstopt in een debounce die iemand later "even" korter zet.
   */
  const [gezocht, setGezocht] = useState('');

  const { data: eerste, error, loading, herlaad } = useAsync(() => zoekMensen(gezocht), [gezocht]);
  const volgende = useVervolgpaginas(gezocht);

  const rijen = [...(eerste?.rijen ?? []), ...volgende.rijen];
  const meer = volgende.meer ?? eerste?.meer ?? false;

  function zoek() {
    volgende.wis();
    setGezocht(term.trim());
  }

  return (
    <Screen title={t('mensen.titel')} terug={{ naar: '/groep' }}>
      <Card>
        <Field label={t('mensen.veld')} value={term} onChangeText={setTerm} />
        <Button onPress={zoek} disabled={!termIsLangGenoeg(term)}>
          {t('mensen.titel')}
        </Button>
        <Caption>{t('mensen.uitleg')}</Caption>
        {term !== '' && !termIsLangGenoeg(term) ? (
          <Caption>{t('mensen.te_kort', { aantal: ZOEKTERM_MIN })}</Caption>
        ) : null}
      </Card>

      {gezocht === '' ? (
        <Card>
          <Body muted>{t('mensen.begin')}</Body>
        </Card>
      ) : (
        <AsyncView
          loading={loading}
          error={error}
          data={eerste}
          isEmpty={() => rijen.length === 0}
          empty={{ title: t('mensen.niets_gevonden'), body: t('mensen.uitleg') }}
          onRetry={herlaad}
        >
          {() => <Gevonden personen={rijen} meer={meer} opMeer={() => void volgende.laadMeer()} />}
        </AsyncView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  rij: { alignItems: 'center', flexDirection: 'row', gap: space.blokGap },
});
