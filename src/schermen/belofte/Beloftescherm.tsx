import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import type { Sleutel } from '@/shared/i18n';
import { t } from '@/shared/i18n';
import { useTheme } from '@/shared/theme';
import { AsyncView, Body, Caption, Card, Subheading } from '@/shared/ui';

import { BelofteMaken } from './BelofteMaken';
import { BestaandeBelofte } from './BestaandeBelofte';
import { Uitslagregel } from './Uitslagregel';
import { useBelofte, type Beloftegegevens } from './useBelofte';

/**
 * Het beloftescherm van één doel — QS8-761 (x.4 van de poort QS8-744).
 *
 * ⚠️ **Leeg betekent: geen getuige, of geen doel. En leeg heeft geen
 *    verzendknop** (criterium 1), alleen de weg naar je groepen. Een lopende
 *    belofte is nooit leeg, ook als de groep intussen weg is: intrekken moet
 *    kunnen tot ze in werking gaat (`belofteaanbod()`).
 */
export function Beloftescherm({ goalId }: { readonly goalId: string }) {
  const router = useRouter();
  const { afstand } = useTheme();
  const { data, loading, error, herlaad } = useBelofte(goalId);
  const nietGevonden = data?.doelGevonden === false;
  // ⚠️ QS8-815, V4 = A: de melding blijft staan tot je het scherm verlaat, ook door
  //    het herladen heen. Bewaard per doel, zodat ze nooit bij een ander doel staat.
  const [ingetrokkenVoor, setIngetrokkenVoor] = useState<string | null>(null);
  const onIngetrokken = () => {
    setIngetrokkenVoor(goalId);
    herlaad();
  };

  return (
    <View style={{ gap: afstand.l }}>
      {ingetrokkenVoor === goalId ? (
        <Card nested>
          <Body accessibilityLiveRegion="polite">{t('belofte.ingetrokken_melding')}</Body>
        </Card>
      ) : null}
      <AsyncView
        loading={loading}
        error={error}
        data={data}
        isEmpty={(d) => !d.doelGevonden || d.aanbod.soort === 'geen_getuige'}
        onRetry={herlaad}
        empty={
          nietGevonden
            ? { title: t('belofte.niet_gevonden_titel'), body: t('belofte.niet_gevonden') }
            : {
                title: t('belofte.geen_getuige_titel'),
                body: t('belofte.geen_getuige'),
                action: { label: t('straf.naar_groepen'), onPress: () => router.push('/(tabs)/groep') },
              }
        }
      >
        {(d) => <Inhoud d={d} goalId={goalId} onKlaar={herlaad} onIngetrokken={onIngetrokken} />}
      </AsyncView>
    </View>
  );
}

/** De uitleg bij een aanbod dat de database zou weigeren: uitleg en geen knop. */
const UITLEG: Readonly<Record<string, Sleutel>> = {
  doel_niet_actief: 'belofte.doel_niet_actief',
  datum_voorbij: 'belofte.datum_voorbij',
  doelstraf: 'belofte.doelstraf',
};

/** De uitslag, als deze belofte de nieuwste beslissing is (QS8-815). */
function uitslagVan(d: Beloftegegevens, belofteId: string) {
  return d.uitslag !== null && d.uitslag.belofte.id === belofteId ? d.uitslag.soort : null;
}

/**
 * De uitslag van de vorige belofte, boven het formulier — QS8-761, QS8-815.
 *
 * ⚠️ `due` van een vorige week krijgt de kaart met de tekst van wat je beloofde, en
 *    de regel staat erin (V2 = A). Gehouden of ingetrokken krijgt alleen de regel:
 *    er valt niets meer te doen. De getuige hoorde een `due` al; de eigenaar hoort
 *    het hier (critical-user, punt 1).
 */
function Vorige({
  d,
  onKlaar,
  onIngetrokken,
}: {
  readonly d: Beloftegegevens;
  readonly onKlaar: () => void;
  readonly onIngetrokken: () => void;
}) {
  if (d.vorige !== undefined) {
    return (
      <BestaandeBelofte
        belofte={d.vorige}
        klok={d.klok}
        dezeWeek={d.dezeWeek}
        uitslag={uitslagVan(d, d.vorige.id)}
        onKlaar={onKlaar}
        onIngetrokken={onIngetrokken}
      />
    );
  }
  if (d.uitslag === null) return null;
  return (
    <Card nested>
      <Uitslagregel uitslag={d.uitslag.soort} periodeStart={d.uitslag.belofte.periode_start} klok={d.klok} />
    </Card>
  );
}

function Inhoud({
  d,
  goalId,
  onKlaar,
  onIngetrokken,
}: {
  readonly d: Beloftegegevens;
  readonly goalId: string;
  readonly onKlaar: () => void;
  readonly onIngetrokken: () => void;
}) {
  const { aanbod } = d;
  if (aanbod.soort === 'loopt' || aanbod.soort === 'deze_week_al') {
    return (
      <BestaandeBelofte
        belofte={aanbod.belofte}
        klok={d.klok}
        dezeWeek={d.dezeWeek}
        uitslag={uitslagVan(d, aanbod.belofte.id)}
        onKlaar={onKlaar}
        onIngetrokken={onIngetrokken}
      />
    );
  }
  const vorige = <Vorige d={d} onKlaar={onKlaar} onIngetrokken={onIngetrokken} />;
  if (aanbod.soort === 'kan') {
    return (
      <>
        {vorige}
        <BelofteMaken goalId={goalId} lijsten={d.lijsten} klok={d.klok} onKlaar={onKlaar} />
      </>
    );
  }
  const sleutel = UITLEG[aanbod.soort];
  return (
    <>
      {vorige}
      <Card nested>
        <Subheading>{t('belofte.titel')}</Subheading>
        {sleutel === undefined ? <Caption>{t('belofte.fout.laden')}</Caption> : <Body muted>{t(sleutel)}</Body>}
      </Card>
    </>
  );
}
