import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { fetchMijnGroepen, huddledagLabel, type Groep } from '@/modules/buddies';
import { useTeBeoordelen } from '@/modules/completions';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  Screen,
  Subheading,
  TeBeoordelenKaart,
  useAsync,
} from '@/shared/ui';

/**
 * Groep — de ingang naar je buddy-groepen.
 *
 * ⚠️ Het gevaarlijkste scherm van de app voor domeinregel 7. Alles achter dit
 *    tabblad is zichtbaar over iemand ánders. Bij elk ding dat erbij komt: kan
 *    hieruit iemands gemiste week worden afgeleid? Zo ja, dan is het fout, ook
 *    als het technisch werkt.
 *
 *    Er zijn precies twee routes waarlangs tegenslag dit tabblad mag bereiken, en
 *    beide lopen via de gebruiker zelf: vraag 2 van de weekafsluiting, en de knop
 *    "vraag je groep om hulp" van de Risico-radar.
 *
 * ⚠️ Deze lijst toont per groep alleen de naam en de huddledag. Bewust geen
 *    ledenaantal met een "3 van 5"-gevoel erbij en geen activiteitsindicator:
 *    "deze groep is stil" over een groep waar drie mensen in zitten, is een
 *    uitspraak over die drie mensen.
 */
export default function GroepTab() {
  const router = useRouter();
  const teBeoordelen = useTeBeoordelen();

  const { data: groepen, loading, error, herlaad } = useAsync(() => fetchMijnGroepen(), []);

  return (
    <Screen title={t('groepen.titel')}>
      {/*
        ⚠️ Sinds QS8-148 staat deze kaart óók op het hoofdscherm, uit één
           component met één hook. Twee kopieën zouden na de eerste wijziging
           uiteenlopen — de fout van 0032/0034 in schermvorm.
      */}
      <TeBeoordelenKaart stand={teBeoordelen} onOpen={() => router.push('/beoordelen')} />

      <AsyncView
        loading={loading}
        error={error}
        data={groepen ?? undefined}
        isEmpty={(g) => g.length === 0}
        onRetry={herlaad}
        empty={{
          title: t('groepen.leeg_titel'),
          body: t('groepen.leeg_tekst'),
        }}
      >
        {(lijst) => (
          <View style={styles.lijst}>
            {lijst.map((groep) => (
              <GroepKaart
                key={groep.id}
                groep={groep}
                onOpen={() => router.push(`/groep/${groep.id}`)}
              />
            ))}
          </View>
        )}
      </AsyncView>

      <Button variant="primair" block onPress={() => router.push('/groep/nieuw')}>
        {t('groepen.aanmaken')}
      </Button>
      <Button variant="secundair" block onPress={() => router.push('/groep/deelnemen')}>
        {t('groepen.heb_code')}
      </Button>
      {/*
        ⚠️ QS8-231. Onderaan en niet bovenaan: wie hier komt heeft meestal al een
           groep of een link. Zoeken is de derde weg naar binnen en niet de
           eerste — en een lijst met vreemden bovenaan het scherm zou dit
           tabblad iets anders maken dan het is.
      */}
      <Button variant="stil" block onPress={() => router.push('/groep/ontdek')}>
        {t('groepen.ontdekken')}
      </Button>
    </Screen>
  );
}

function GroepKaart({ groep, onOpen }: { readonly groep: Groep; readonly onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={groep.name}>
      <Card>
        <Subheading>{groep.name}</Subheading>

        {/*
          ⚠️ "Slaapt" is een eigenschap van de groep en niet van een lid. Het
             beschuldigt niemand en het is de enige manier om uit te leggen waarom
             de herinneringen gestopt zijn (5.9).
        */}
        {groep.status === 'sleeping' ? (
          <Body muted>{t('groepen.slaapt')}</Body>
        ) : null}

        <Caption>{t('groepen.huddledag', { dag: huddledagLabel(groep.huddle_day) })}</Caption>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
});
