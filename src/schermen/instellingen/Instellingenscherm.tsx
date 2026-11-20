import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useProfiel, type Profiel } from '@/modules/auth';
import { t } from '@/shared/i18n';
import { radius, space, useTheme } from '@/shared/theme';
import { AsyncView, Body, Caption, Subheading } from '@/shared/ui';
import { focusRing } from '@/shared/ui/a11y';
import { Uiterlijkscherm } from '@/schermen/uiterlijk';

import { AccountVerwijderen, Avatarkaart, Naamkaart } from './AccountPaneel';
import { Blokkades, BuddyBijdrage, VindbaarInstelling } from './PrivacyPaneel';
import {
  HerinneringInstelling,
  Meldingen,
  MeldingsoortenInstelling,
  StilleUrenInstelling,
} from './MeldingenPaneel';
import {
  TaalInstelling,
  TijdzoneInstelling,
  VieringKeuze,
  WeekStartInstelling,
} from './VoorkeurenPaneel';
import {
  ONDERDELEN,
  paneelNaastLijst,
  vindOnderdeel,
  type Onderdeel,
  type OnderdeelId,
} from './onderdelen';
import { useState } from 'react';

interface PaneelProps {
  readonly p: Profiel;
  readonly zet: (p: Profiel) => void;
}

function AccountPaneel({ p, zet }: PaneelProps) {
  return (
    <>
      <Naamkaart naam={p.display_name} userId={p.id} onOpgeslagen={zet} />
      <Avatarkaart profiel={p} onGewijzigd={zet} />
      <AccountVerwijderen />
    </>
  );
}

function VoorkeurenPaneel({ p, zet }: PaneelProps) {
  return (
    <>
      <TaalInstelling waarde={p.locale} userId={p.id} onOpgeslagen={zet} />
      <WeekStartInstelling profiel={p} onOpgeslagen={zet} />
      <TijdzoneInstelling waarde={p.tz} />
      <VieringKeuze />
    </>
  );
}

function MeldingenPaneel({ p, zet }: PaneelProps) {
  return (
    <>
      <Meldingen userId={p.id} />
      <HerinneringInstelling
        aan={p.reminder_enabled}
        tijd={p.reminder_time}
        toon={p.reminder_tone === 'firm' ? 'firm' : 'gentle'}
        userId={p.id}
        onOpgeslagen={zet}
      />
      <MeldingsoortenInstelling profiel={p} userId={p.id} onOpgeslagen={zet} />
      <StilleUrenInstelling profiel={p} userId={p.id} onOpgeslagen={zet} />
    </>
  );
}

function PrivacyPaneel({ p, zet }: PaneelProps) {
  return (
    <>
      <VindbaarInstelling profiel={p} userId={p.id} onOpgeslagen={zet} />
      <BuddyBijdrage userId={p.id} />
      <Blokkades />
    </>
  );
}

/**
 * Eén onderdeel → zijn paneel.
 *
 * ⚠️ **Een functie met een `switch` en geen record van componenten.** `dode-exports-controle` volgt aanroepen
 *    door functielichamen; een record op moduleniveau is voor hem een doodlopende schakel, en dan lijkt elke
 *    datalaagfunctie onder een paneel onbereikbaar. De `never` onderaan houdt de uitputtendheid: een id zonder
 *    paneel is een typefout.
 */
function PaneelInhoud({ id, p, zet }: PaneelProps & { readonly id: OnderdeelId }) {
  switch (id) {
    case 'account':
      return <AccountPaneel p={p} zet={zet} />;
    case 'voorkeuren':
      return <VoorkeurenPaneel p={p} zet={zet} />;
    case 'meldingen':
      return <MeldingenPaneel p={p} zet={zet} />;
    case 'privacy':
      return <PrivacyPaneel p={p} zet={zet} />;
    case 'uiterlijk':
      return <Uiterlijkscherm />;
    default:
      return assertNever(id);
  }
}

function assertNever(id: never): never {
  throw new Error(`Instellingen: onderdeel zonder paneel: ${String(id)}`);
}

function Lijstrij({
  onderdeel,
  actief,
  onKies,
}: {
  readonly onderdeel: Onderdeel;
  readonly actief: boolean;
  readonly onKies: () => void;
}) {
  const theme = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <Pressable
      onPress={onKies}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      accessibilityRole="button"
      accessibilityState={{ selected: actief }}
      accessibilityLabel={t(onderdeel.titel)}
      style={({ pressed }) => [
        styles.rij,
        {
          borderColor: actief ? theme.colors.accent : theme.colors.border,
          backgroundColor: theme.colors.panel,
          opacity: pressed ? 0.7 : 1,
        },
        focusRing(theme, focus),
      ]}
    >
      <Subheading>{t(onderdeel.titel)}</Subheading>
      <Caption>{t(onderdeel.uitleg)}</Caption>
    </Pressable>
  );
}

function Lijst({ actief }: { readonly actief: OnderdeelId | null }) {
  const router = useRouter();
  return (
    <View
      style={styles.lijst}
      accessibilityRole="list"
      accessibilityLabel={t('instellingen.lijst_label')}
    >
      {ONDERDELEN.map((o) => (
        <Lijstrij
          key={o.id}
          onderdeel={o}
          actief={o.id === actief}
          onKies={() => router.push(`/instellingen/${o.id}`)}
        />
      ))}
    </View>
  );
}

function Paneel({ onderdeel }: { readonly onderdeel: Onderdeel }) {
  const { profiel, loading, error, zetProfiel, herlaad } = useProfiel();
  return (
    <View style={styles.paneel} accessibilityLabel={t(onderdeel.titel)}>
      <Body muted>{t(onderdeel.uitleg)}</Body>
      <AsyncView
        loading={loading}
        error={error}
        data={profiel ?? undefined}
        isEmpty={() => false}
        onRetry={herlaad}
        empty={{
          title: t('profiel.leeg_titel'),
          body: t('profiel.leeg_tekst'),
        }}
      >
        {(p) => (
          <View style={styles.paneel}>
            <PaneelInhoud id={onderdeel.id} p={p} zet={zetProfiel} />
          </View>
        )}
      </AsyncView>
    </View>
  );
}

/**
 * Instellingen: breed een lijst met paneel, smal een lijst die naar een detailscherm gaat — QS8-754.
 *
 * ⚠️ Eén component voor beide routes (`/instellingen` en `/instellingen/[onderdeel]`): breed toont `onderdeel`
 *    of anders het eerste onderdeel naast de lijst, smal toont óf de lijst óf het paneel. Elk paneel haalt zijn
 *    eigen laad-, fout- en lege staat uit `AsyncView`.
 */
export function Instellingenscherm({ onderdeel }: { readonly onderdeel?: string | undefined }) {
  const { width } = useWindowDimensions();
  const gekozen = vindOnderdeel(onderdeel);
  const breed = paneelNaastLijst(width);

  if (breed) {
    const getoond = gekozen ?? ONDERDELEN[0]!;
    return (
      <View style={styles.naast}>
        <Lijst actief={getoond.id} />
        <Paneel onderdeel={getoond} />
      </View>
    );
  }
  return gekozen === null ? <Lijst actief={null} /> : <Paneel onderdeel={gekozen} />;
}

const styles = StyleSheet.create({
  naast: { flexDirection: 'row', gap: space.blokGap, alignItems: 'flex-start' },
  lijst: { gap: space.blokGap, minWidth: 200, flexShrink: 0 },
  paneel: { gap: space.blokGap + 3, flex: 1 },
  rij: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.blokGap,
    gap: 2,
    minHeight: 44,
  },
});
