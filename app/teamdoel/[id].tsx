import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/modules/auth';
import {
  laadTeamdoel,
  neemAandeel,
  type Teambalk,
  type Teamdoelstand,
} from '@/modules/organisaties';
import { opmaaktaal, t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { toonDatum } from '@/shared/time';
import { AsyncView, Body, Button, Caption, Card, Screen, Subheading, useAsync } from '@/shared/ui';

/**
 * Een teamdoel met zijn teambalk en jouw aandeel — QS8-658.
 *
 * ⚠️ **De balk is een getal en geen voortgangsbalk** (besluit 16): geen noemer,
 *    geen percentage, niets dat vol kan raken. Hij komt uit `laadTeamdoel()` en
 *    nergens anders vandaan (`Teambalk` is een merktype), en na een aandeel
 *    herlaadt dit scherm in plaats van een getal bij te tellen: een balk die
 *    lokaal meeloopt kan van de server afwijken, en een balk die daalt is het
 *    signaal dat domeinregel 7 verbiedt.
 *
 * ⚠️ **Geen punten en geen score ernaast** (domeinregel 10: score en voortgang
 *    zijn twee dingen). En geen lijst van wie er een aandeel heeft of hoe ver een
 *    ander is (besluit 11 en 21): `team_goal_shares` geeft alleen jouw rij.
 *
 * ⚠️ **Niet gevonden en geen toegang is één zin.** De server maakt die twee niet
 *    te onderscheiden, en dit scherm moet dat ook niet doen.
 *
 * Afronden is een ander issue (QS8-662): er is hier geen afrondknop.
 */
export default function TeamdoelScherm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useSession();
  const stand = useAsync(id && userId ? () => laadTeamdoel(id, userId) : null, [id, userId]);

  return (
    <Screen
      title={stand.data?.teamdoel.titel ?? t('teamdoel.lijst_titel')}
      eyebrow={t('teamdoel.lijst_eyebrow')}
      terug={
        stand.data === undefined || stand.data === null
          ? { naar: '/groep' }
          : { naar: `/groep/teamdoelen/${stand.data.teamdoel.groepId}` }
      }
    >
      <AsyncView
        loading={stand.loading}
        error={stand.error}
        data={stand.data ?? undefined}
        isEmpty={() => false}
        onRetry={stand.herlaad}
        empty={{
          title: t('teamdoel.niet_gevonden_titel'),
          body: t('teamdoel.niet_gevonden_tekst'),
        }}
      >
        {(s) => <Inhoud stand={s} onVerandert={stand.herlaad} />}
      </AsyncView>
    </Screen>
  );
}

function Inhoud({
  stand,
  onVerandert,
}: {
  readonly stand: Teamdoelstand;
  readonly onVerandert: () => void;
}) {
  const { teamdoel } = stand;

  return (
    <View style={styles.blokken}>
      <Card>
        <Caption>
          {t('teamdoel.streefdatum', { datum: toonDatum(teamdoel.streefdatum, opmaaktaal()) })}
        </Caption>
        {teamdoel.beschrijving === null ? null : <Body>{teamdoel.beschrijving}</Body>}
      </Card>
      <BalkKaart balk={stand.balk} />
      <AandeelKaart
        teamGoalId={teamdoel.id}
        aandeelDoelId={stand.aandeelDoelId}
        onGenomen={onVerandert}
      />
    </View>
  );
}

function BalkKaart({ balk }: { readonly balk: Teambalk }) {
  return (
    <Card>
      <Subheading>{t('teamdoel.balk_kop')}</Subheading>
      <Body>
        {balk.aantal === 1
          ? t('teamdoel.balk_een')
          : t('teamdoel.balk_meer', { n: balk.aantal })}
      </Body>
      <Caption>{t('teamdoel.balk_uitleg')}</Caption>
    </Card>
  );
}

function AandeelKaart({
  teamGoalId,
  aandeelDoelId,
  onGenomen,
}: {
  readonly teamGoalId: string;
  readonly aandeelDoelId: string | null;
  readonly onGenomen: () => void;
}) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function nemen() {
    setBezig(true);
    setFout(null);
    const uitkomst = await neemAandeel(teamGoalId);
    setBezig(false);
    if (uitkomst.ok) onGenomen();
    else setFout(uitkomst.melding);
  }

  return (
    <Card>
      <Subheading>{t('teamdoel.aandeel_kop')}</Subheading>
      <Caption>{t('teamdoel.aandeel_uitleg')}</Caption>
      {aandeelDoelId === null ? (
        <>
          {fout === null ? null : <Caption danger>{fout}</Caption>}
          <Button variant="primair" block busy={bezig} onPress={() => void nemen()}>
            {t('teamdoel.aandeel_nemen')}
          </Button>
        </>
      ) : (
        <>
          <Body>{t('teamdoel.aandeel_heb')}</Body>
          <Button
            variant="secundair"
            block
            onPress={() => router.push(`/doel/${aandeelDoelId}`)}
          >
            {t('teamdoel.aandeel_bekijk')}
          </Button>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  blokken: { gap: space.blokGap },
});
