import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession } from '@/modules/auth';
import {
  datumregel,
  laadTeamdoel,
  neemAandeel,
  toonAandeelkaart,
  type Datumregel,
  type Teambalk,
  type Teamdoelstand,
} from '@/modules/organisaties';
import { opmaaktaal, t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { localDateIn, now, toonDatum, type IsoDate } from '@/shared/time';
import { AsyncView, Body, Button, Caption, Card, Screen, Subheading, useAsync } from '@/shared/ui';
import { useVolgTaal } from '@/shared/i18n/react';

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
  useVolgTaal();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useSession();
  const stand = useAsync(id && userId ? () => laadTeamdoel(id, userId) : null, [id, userId]);
  const { profiel, loading: profielLaadt, error: profielFout, herlaad: herlaadProfiel } = useProfiel();
  // ⚠️ "Vandaag" in de tijdzone van de gebruiker, zoals `mijn_datum()` op de server.
  const vandaag = profiel ? localDateIn(profiel.tz, now()) : null;
  const klaar =
    stand.data !== undefined && stand.data !== null && vandaag !== null
      ? { stand: stand.data, vandaag }
      : undefined;

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
        loading={stand.loading || profielLaadt}
        error={stand.error ?? profielFout}
        data={klaar}
        isEmpty={() => false}
        onRetry={() => {
          stand.herlaad();
          herlaadProfiel();
        }}
        empty={{
          title: t('teamdoel.niet_gevonden_titel'),
          body: t('teamdoel.niet_gevonden_tekst'),
        }}
      >
        {(k) => <Inhoud stand={k.stand} vandaag={k.vandaag} onVerandert={stand.herlaad} />}
      </AsyncView>
    </Screen>
  );
}

function Inhoud({
  stand,
  vandaag,
  onVerandert,
}: {
  readonly stand: Teamdoelstand;
  readonly vandaag: IsoDate;
  readonly onVerandert: () => void;
}) {
  const { teamdoel } = stand;
  const regel = tekstVan(datumregel(teamdoel, vandaag));

  return (
    <View style={styles.blokken}>
      <Card>
        {regel === null ? null : <Caption>{regel}</Caption>}
        {teamdoel.beschrijving === null ? null : <Body>{teamdoel.beschrijving}</Body>}
      </Card>
      <BalkKaart balk={stand.balk} />
      {/*
        ⚠️ Zonder aandeel en zonder mogelijkheid er een te nemen (verlopen, afgerond
        of gearchiveerd) is er geen kaart: V21 = A en L1, besloten door Quinten,
        20-11-2026. Wie een aandeel heeft, houdt de kaart met de link ernaartoe.
      */}
      {!toonAandeelkaart(teamdoel, stand.aandeelDoelId, vandaag) ? null : (
        <AandeelKaart
          teamGoalId={teamdoel.id}
          aandeelDoelId={stand.aandeelDoelId}
          onGenomen={onVerandert}
        />
      )}
    </View>
  );
}

function tekstVan(regel: Datumregel): string | null {
  switch (regel.soort) {
    case 'streefdatum':
      return t('teamdoel.streefdatum', { datum: toonDatum(regel.datum, opmaaktaal()) });
    case 'loopt_nog':
      return t('teamdoel.loopt_nog');
    case 'afgerond':
      return t('teamdoel.afgerond');
    case 'geen':
      return null;
  }
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
