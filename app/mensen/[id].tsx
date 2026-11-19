import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/modules/auth';
import {
  fetchProfielDoelen,
  fetchProfielGroepen,
  fetchProfielVanLid,
  isEigenTab,
  profielTabs,
  type GedeeldeGroep,
  type LidProfiel,
  type ProfielDoel,
  type ProfielTab,
} from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  AsyncView,
  Avatar,
  Body,
  Button,
  Caption,
  Card,
  Choice,
  MilestoneProgress,
  Screen,
  Subheading,
  useAsync,
} from '@/shared/ui';

/**
 * Het profiel van een groepsgenoot, met tabs — QS8-750, migratie 0306.
 *
 * ⚠️⚠️ **Dit scherm beslist niets over wie wat mag zien.** De drie RPC's geven
 *    nul rijen aan wie geen groep met de persoon deelt, en nooit meer kolommen
 *    dan de tabs tonen. `ikZelf` bepaalt alleen welke tabs er zijn.
 *
 * ⚠️ **Statistieken en prestaties bestaan voor een ander niet** — `profielTabs(false)`
 *    bevat ze niet, ze zijn dus geen verborgen tab maar afwezig. Voor jezelf
 *    openen ze de eigen schermen; die lezen de sessie en negeren parameters.
 *
 * ⚠️ Geen reeks, punten, datums of weekstatus op dit scherm, ook in een open
 *    groep: een lijst met een gat is een gemiste week (domeinregel 7).
 */
export default function LidProfielScherm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useSession();
  const ikZelf = id !== undefined && id === userId;
  const [tab, setTab] = useState<ProfielTab>('voltooiingen');

  const kop = useAsync(id ? () => fetchProfielVanLid(id) : null, [id]);
  const tabs = profielTabs(ikZelf);
  const actief = tabs.includes(tab) ? tab : 'voltooiingen';

  return (
    <Screen
      title={ikZelf ? t('profiel_ander.titel_zelf') : t('profiel_ander.titel')}
      eyebrow={ikZelf ? t('profiel_ander.eyebrow_zelf') : t('profiel_ander.eyebrow')}
      terug={{ naar: '/' }}
    >
      <AsyncView
        loading={kop.loading}
        error={kop.error}
        data={kop.data ?? undefined}
        isEmpty={() => kop.data === null}
        onRetry={kop.herlaad}
        empty={{
          title: t('profiel_ander.niet_beschikbaar_titel'),
          body: t('profiel_ander.niet_beschikbaar_tekst'),
        }}
      >
        {(profiel) => (
          <View style={styles.lijst}>
            <Kop profiel={profiel} ikZelf={ikZelf} />
            <Choice
              label={t('profiel_ander.tabs_label')}
              opties={tabs.map((w) => ({ waarde: w, label: t(`profiel_ander.tab_${w}`) }))}
              waarde={actief}
              onKies={setTab}
              subtiel
            />
            {id === undefined ? null : <TabInhoud tab={actief} id={id} />}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

function Kop({ profiel, ikZelf }: { readonly profiel: LidProfiel; readonly ikZelf: boolean }) {
  return (
    <Card>
      <View style={styles.kop}>
        <Avatar name={profiel.naam} url={profiel.avatarUrl} size={48} />
        <Subheading>{profiel.naam}</Subheading>
      </View>
      <Caption>{ikZelf ? t('profiel_ander.uitleg_zelf') : t('profiel_ander.uitleg_ander')}</Caption>
    </Card>
  );
}

function TabInhoud({ tab, id }: { readonly tab: ProfielTab; readonly id: string }) {
  if (isEigenTab(tab)) return <EigenTab tab={tab} />;
  return tab === 'groepen' ? <GroepenTab id={id} /> : <VoltooiingenTab id={id} />;
}

function EigenTab({ tab }: { readonly tab: ProfielTab }) {
  const router = useRouter();
  return (
    <Card>
      <Caption>{t('profiel_ander.eigen_tab_uitleg')}</Caption>
      <Button
        variant="stil"
        block
        onPress={() => router.push(tab === 'statistieken' ? '/statistiek' : '/prestaties')}
      >
        {t('profiel_ander.eigen_tab_open')}
      </Button>
    </Card>
  );
}

function VoltooiingenTab({ id }: { readonly id: string }) {
  const { data, loading, error, herlaad } = useAsync(() => fetchProfielDoelen(id), [id]);
  return (
    <AsyncView
      loading={loading}
      error={error}
      data={data?.rijen}
      isEmpty={(rijen) => rijen.length === 0}
      onRetry={herlaad}
      empty={{
        title: t('profiel_ander.leeg_doelen_titel'),
        body: t('profiel_ander.leeg_doelen_tekst'),
      }}
    >
      {(rijen) => (
        <View style={styles.lijst}>
          {rijen.map((doel) => (
            <DoelKaart key={doel.goalId} doel={doel} />
          ))}
        </View>
      )}
    </AsyncView>
  );
}

function DoelKaart({ doel }: { readonly doel: ProfielDoel }) {
  return (
    <Card>
      <Subheading>{doel.titel}</Subheading>
      {doel.voltooid ? <Caption muted={false}>{t('profiel_ander.voltooid')}</Caption> : null}
      <MilestoneProgress done={doel.mijlpalenKlaar} total={doel.mijlpalenTotaal} />
      <Caption>
        {t('profiel_ander.mijlpalen', { klaar: doel.mijlpalenKlaar, totaal: doel.mijlpalenTotaal })}
      </Caption>
    </Card>
  );
}

function GroepenTab({ id }: { readonly id: string }) {
  const { data, loading, error, herlaad } = useAsync(() => fetchProfielGroepen(id), [id]);
  return (
    <AsyncView
      loading={loading}
      error={error}
      data={data}
      isEmpty={(rijen: readonly GedeeldeGroep[]) => rijen.length === 0}
      onRetry={herlaad}
      empty={{
        title: t('profiel_ander.leeg_groepen_titel'),
        body: t('profiel_ander.leeg_groepen_tekst'),
      }}
    >
      {(rijen) => (
        <View style={styles.lijst}>
          {rijen.map((g) => (
            <Card key={g.groupId}>
              <Body>{g.naam}</Body>
            </Card>
          ))}
        </View>
      )}
    </AsyncView>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  kop: { flexDirection: 'row', alignItems: 'center', gap: space.blokGap },
});
