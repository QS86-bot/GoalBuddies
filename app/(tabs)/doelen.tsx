import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useProfiel, useSession } from '@/modules/auth';
import {
  CATEGORIE_LABELS,
  fetchDoelen,
  type Categorie,
  type DoelMetVoortgang,
  type Pagina,
} from '@/modules/goals';
import { space, useTheme } from '@/shared/theme';
import { localDateIn, now } from '@/shared/time';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  MilestoneProgress,
  Screen,
  Subheading,
} from '@/shared/ui';

/**
 * Het dashboard met alle actieve doelen — QS8-33.
 *
 * ⚠️ Eén query voor alles, via de view `goal_dashboard` (migratie 0013). De
 *    tellingen komen mee uit dezelfde ronde; per doel opnieuw bevragen zou de
 *    N+1 zijn die het beslisdocument met naam noemt.
 *
 * ⚠️ Gepagineerd, altijd. Ook als er drie doelen zijn — anders is de dag dat er
 *    tweehonderd staan de dag dat je het merkt (CLAUDE.md, regel 10).
 */
export default function Doelen() {
  const router = useRouter();
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const [pagina, setPagina] = useState<Pagina<DoelMetVoortgang> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let levend = true;

    fetchDoelen(userId)
      .then((uitkomst) => {
        if (!levend) return;
        setPagina(uitkomst);
        setError(null);
      })
      .catch((fout: unknown) => {
        if (levend) setError(fout);
      })
      .finally(() => {
        if (levend) setLoading(false);
      });

    return () => {
      levend = false;
    };
  }, [userId, ronde]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  const vandaag = profiel ? localDateIn(profiel.tz, now()) : null;

  return (
    <Screen title="Doelen">
      <AsyncView
        loading={loading}
        error={error}
        data={pagina ?? undefined}
        isEmpty={(p) => p.rijen.length === 0}
        onRetry={herlaad}
        empty={{
          title: 'Nog geen doel',
          body:
            'Begin met één doel met een datum erop. De Doelcoach hakt het daarna in mijlpalen, ' +
            'en die mijlpalen worden je weekdoelen.',
        }}
      >
        {(p) => (
          <View style={styles.lijst}>
            {p.rijen.map((doel) => (
              <DoelKaart
                key={doel.id}
                doel={doel}
                vandaag={vandaag}
                onOpen={() => router.push(`/doel/${doel.id}`)}
              />
            ))}

            {p.meer ? (
              <Caption>
                {p.rijen.length} van {p.totaal} doelen. Meer laden komt zodra er meer dan twintig
                zijn.
              </Caption>
            ) : null}
          </View>
        )}
      </AsyncView>

      <Button variant="primair" block onPress={() => router.push('/doel/nieuw')}>
        Nieuw doel
      </Button>
    </Screen>
  );
}

function DoelKaart({
  doel,
  vandaag,
  onOpen,
}: {
  readonly doel: DoelMetVoortgang;
  readonly vandaag: string | null;
  readonly onOpen: () => void;
}) {
  const theme = useTheme();

  const categorie = CATEGORIE_LABELS[(doel.category ?? 'other') as Categorie];
  const verstreken = vandaag !== null && doel.target_date !== null && doel.target_date < vandaag;

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={doel.title ?? 'Doel'}>
      <Card>
        <View style={styles.kop}>
          <Subheading>{doel.title}</Subheading>
          <Caption>{categorie}</Caption>
        </View>

        {doel.identity_statement ? (
          // ⚠️ Prominent en niet weggestopt (QS8-36). Bij een doel van zes
          //    maanden is identiteit de enige brandstof die zo lang meegaat.
          <Body muted>&ldquo;{doel.identity_statement}&rdquo;</Body>
        ) : null}

        <MilestoneProgress done={doel.milestones_done ?? 0} total={doel.milestones_total ?? 0} />

        <View style={styles.voet}>
          <Caption>Streefdatum {doel.target_date}</Caption>
          {verstreken ? (
            // Rood mag hier: dit is deadline-risico, het enige waar die kleur
            // voor is. Niet voor een gemiste week (domeinregel 7).
            <Caption muted={false} danger>
              Datum verstreken
            </Caption>
          ) : (
            <Caption>{doel.weekly_approved ?? 0} weken afgerond</Caption>
          )}
        </View>

        <View style={[styles.streep, { backgroundColor: theme.colors.border }]} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  kop: { gap: 2 },
  voet: { flexDirection: 'row', justifyContent: 'space-between', gap: space.blokGap },
  streep: { height: 1, marginTop: 2 },
});
