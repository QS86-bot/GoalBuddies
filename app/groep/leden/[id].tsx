import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/modules/auth';
import {
  blokkeer,
  fetchGroep,
  fetchGroepsoverzicht,
  fetchMeldingenOver,
  fetchMijnLidmaatschap,
  huidigeGroepsperiode,
  meldPersoon,
  meldredenLabels,
  MELDREDENEN,
  type Groepslid,
  type Meldreden,
  verwijderLid,
} from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  AsyncView,
  Avatar,
  Bevestiging,
  bevestigingen,
  Button,
  Caption,
  Card,
  Meldpaneel,
  Screen,
  Subheading,
  useAsync,
} from '@/shared/ui';

/**
 * Wie er meedoen, en wat je kunt doen als het misgaat — QS8-232.
 *
 * ⚠️ **Een eigen scherm en geen blok op het groepsoverzicht, en dat is een keuze
 *    over vindbaarheid.** Wie iemand wil melden of blokkeren, zoekt op de plek
 *    waar die persoon stáát. Zou dit achter de beheerderinstellingen zitten, dan
 *    is het onbereikbaar voor precies de mensen die het het hardst nodig hebben:
 *    de leden die géén beheerder zijn.
 *
 * ⚠️ **De knoppen staan in oplopende zwaarte onder elkaar en niet naast elkaar
 *    op één rij:** melden (stil, gaat naar de beheerder), blokkeren (stil, werkt
 *    vooruit) en uitzetten (alleen een beheerder, en niet terug te draaien vanuit
 *    de app). De laatste twee hebben een `Bevestiging` met de prijs erin.
 *
 * ⚠️ **Niets hier laat zien of iemand al gemeld of geblokkeerd is door een
 *    ánder.** "Deze persoon is drie keer gemeld" zou van dit scherm een
 *    reputatiescherm maken, en een melding is geen stem.
 */
export default function GroepsLeden() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useSession();

  const {
    data: overzicht,
    loading,
    error,
    herlaad,
  } = useAsync(
    id
      ? async () => {
          // ⚠️ De groep eerst, want `huidigeGroepsperiode()` heeft de huddledag
          //    en de tijdzone van de groep nodig — correctheidsregel 7: geen
          //    weekberekening buiten `shared/time`, en dus ook geen aanname hier
          //    dat de periode van vandaag wel dezelfde zal zijn.
          const groep = await fetchGroep(id);
          if (groep === null) return { rijen: [], totaal: 0, meer: false };
          return await fetchGroepsoverzicht(id, huidigeGroepsperiode(groep));
        }
      : null,
    [id],
  );

  const { data: lidmaatschap } = useAsync(
    id && userId ? () => fetchMijnLidmaatschap(id, userId) : null,
    [id, userId],
  );
  const beheerder = lidmaatschap?.role === 'admin';

  const { data: meldingenOver } = useAsync(() => fetchMeldingenOver(), []);

  /**
   * ⚠️ Eén geopend paneel tegelijk, en het lid staat erin. Drie losse vlaggen
   *    zouden betekenen dat je bij lid B de melding van lid A kunt afmaken.
   */
  const [open, setOpen] = useState<{ userId: string; wat: 'melden' | 'blokkeren' | 'weg' } | null>(
    null,
  );
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [afgehandeld, setAfgehandeld] = useState<readonly string[]>([]);

  async function verstuurMelding(reden: string, toelichting: string) {
    if (open === null || !id) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await meldPersoon(id, open.userId, reden as Meldreden, toelichting);
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setOpen(null);
    setMelding(t('melden.verzonden'));
  }

  async function blokkeerLid(lidId: string) {
    setBezig(true);
    setFout(null);

    const uitkomst = await blokkeer(lidId);
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setOpen(null);
    setMelding(t('melden.blokkeer_stil'));
  }

  async function zetEruit(lidId: string) {
    if (!id) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await verwijderLid(id, lidId, true);
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setOpen(null);
    setAfgehandeld((huidig) => [...huidig, lidId]);
    setMelding(
      uitkomst.waarde === 0
        ? t('melden.verwijderd')
        : t('melden.verwijderd_doelen', { aantal: uitkomst.waarde }),
    );
    herlaad();
  }

  const redenen = meldredenOpties();

  return (
    <Screen title={t('leden.titel')} eyebrow={t('leden.eyebrow')} terug={{ naar: `/groep/${id}` }}>
      <AsyncView
        loading={loading}
        error={error}
        data={overzicht?.rijen}
        isEmpty={(rijen) => rijen.length === 0}
        onRetry={herlaad}
        empty={{ title: t('leden.leeg_titel'), body: t('leden.leeg_tekst') }}
      >
        {(rijen) => (
          <View style={styles.lijst}>
            {rijen
              .filter((lid) => !afgehandeld.includes(lid.user_id))
              .map((lid) => (
                <LidKaart
                  key={lid.user_id}
                  lid={lid}
                  ikZelf={lid.user_id === userId}
                  beheerder={beheerder}
                  open={open?.userId === lid.user_id ? open.wat : null}
                  bezig={bezig}
                  fout={fout}
                  redenen={redenen}
                  meldingenOver={meldingenOver ?? null}
                  onOpen={(wat) => {
                    setFout(null);
                    setMelding(null);
                    setOpen(wat === null ? null : { userId: lid.user_id, wat });
                  }}
                  onMeld={(reden, toelichting) => void verstuurMelding(reden, toelichting)}
                  onBlokkeer={() => void blokkeerLid(lid.user_id)}
                  onZetEruit={() => void zetEruit(lid.user_id)}
                />
              ))}
          </View>
        )}
      </AsyncView>

      {melding === null ? null : <Caption muted={false}>{melding}</Caption>}
    </Screen>
  );
}

/** De vijf redenen met hun labels; een functie, want de taal ligt niet vast op importtijd. */
function meldredenOpties(): readonly { readonly waarde: string; readonly label: string }[] {
  const labels = meldredenLabels();
  return MELDREDENEN.map((r) => ({ waarde: r, label: labels[r] }));
}

interface KaartProps {
  readonly lid: Groepslid;
  readonly ikZelf: boolean;
  readonly beheerder: boolean;
  readonly open: 'melden' | 'blokkeren' | 'weg' | null;
  readonly bezig: boolean;
  readonly fout: string | null;
  readonly redenen: readonly { readonly waarde: string; readonly label: string }[];
  readonly meldingenOver: number | null;
  readonly onOpen: (wat: 'melden' | 'blokkeren' | 'weg' | null) => void;
  readonly onMeld: (reden: string, toelichting: string) => void;
  readonly onBlokkeer: () => void;
  readonly onZetEruit: () => void;
}

function LidKaart({
  lid,
  ikZelf,
  beheerder,
  open,
  bezig,
  fout,
  redenen,
  meldingenOver,
  onOpen,
  onMeld,
  onBlokkeer,
  onZetEruit,
}: KaartProps) {
  return (
    <Card>
      <View style={styles.kop}>
        <Avatar name={lid.display_name} url={lid.avatar_url} size={32} />
        <Subheading>{lid.display_name}</Subheading>
      </View>

      {lid.role === 'admin' ? <Caption>{t('leden.beheerder')}</Caption> : null}

      {/*
        ⚠️ **Op je eigen rij staat geen enkele knop**, en dat is geen weggelaten
           functionaliteit: jezelf melden weigert de database (`self`), jezelf
           blokkeren ook, en jezelf uitzetten hoort via `verlaat_groep()` te
           lopen omdat daar de overdracht in zit. Drie knoppen die alle drie een
           foutmelding opleveren, is een slechter scherm dan geen knoppen.
      */}
      {ikZelf ? (
        <Caption>{t('leden.jijzelf')}</Caption>
      ) : open === 'melden' ? (
        <Meldpaneel
          redenen={redenen}
          bezig={bezig}
          fout={fout}
          over={meldingenOver}
          onVerstuur={onMeld}
          onAnnuleer={() => onOpen(null)}
        />
      ) : open === 'blokkeren' ? (
        <Bevestiging
          tekst={bevestigingen().persoonBlokkeren}
          bezig={bezig}
          onBevestig={onBlokkeer}
          onAnnuleer={() => onOpen(null)}
        />
      ) : open === 'weg' ? (
        <Bevestiging
          tekst={bevestigingen().lidVerwijderen}
          bezig={bezig}
          onBevestig={onZetEruit}
          onAnnuleer={() => onOpen(null)}
        />
      ) : (
        <>
          <Button variant="stil" block onPress={() => onOpen('melden')}>
            {t('melden.persoon_knop')}
          </Button>
          <Button variant="stil" block onPress={() => onOpen('blokkeren')}>
            {t('melden.blokkeer_knop')}
          </Button>
          {beheerder ? (
            <Button variant="stil" block onPress={() => onOpen('weg')}>
              {t('melden.verwijder_knop')}
            </Button>
          ) : null}
        </>
      )}

      {open === null && fout !== null ? <Caption danger>{fout}</Caption> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  kop: { flexDirection: 'row', alignItems: 'center', gap: space.blokGap },
});
