import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useProfiel, useSession } from '@/modules/auth';
import {
  categorieLabels,
  fetchDoelen,
  fetchRisicos,
  type Categorie,
  type DoelMetVoortgang,
  type Pagina,
  type Risico,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import { space, useTheme } from '@/shared/theme';
import { localDateIn, now } from '@/shared/time';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  MilestoneProgress,
  RisicoBadge,
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
  const [risicos, setRisicos] = useState<ReadonlyMap<string, Risico>>(new Map());
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

  // De risicostanden in één verzoek voor de hele pagina — niet één per doel
  // (regel 12). Faalt apart: een lijst zonder standen is bruikbaar, een lijst
  // die helemaal niet laadt niet.
  //
  // ⚠️ Alleen van jezelf. `goal_risk` is eigenaar-only sinds migratie 0050, dus
  //    dit levert per definitie niets op voor het doel van een ander.
  useEffect(() => {
    const ids = pagina?.rijen.map((d) => d.id) ?? [];
    if (ids.length === 0) return;
    let levend = true;

    fetchRisicos(ids)
      .then((gevonden) => {
        if (levend) setRisicos(gevonden);
      })
      .catch(() => {
        if (levend) setRisicos(new Map());
      });

    return () => {
      levend = false;
    };
  }, [pagina]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  const vandaag = profiel ? localDateIn(profiel.tz, now()) : null;

  return (
    <Screen title={t('doelen.titel')}>
      <AsyncView
        loading={loading}
        error={error}
        data={pagina ?? undefined}
        isEmpty={(p) => p.rijen.length === 0}
        onRetry={herlaad}
        empty={{
          title: t('doelen.leeg_titel'),
          body: t('doelen.leeg_tekst'),
        }}
      >
        {(p) => (
          <View style={styles.lijst}>
            {p.rijen.map((doel) => (
              <DoelKaart
                key={doel.id}
                doel={doel}
                vandaag={vandaag}
                risico={risicos.get(doel.id) ?? null}
                onOpen={() => router.push(`/doel/${doel.id}`)}
              />
            ))}

            {p.meer ? (
              <Caption>
                {t('doelen.van_totaal', { aantal: p.rijen.length, totaal: p.totaal })}
              </Caption>
            ) : null}
          </View>
        )}
      </AsyncView>

      <Button variant="primair" block onPress={() => router.push('/doel/nieuw')}>
        {t('doelen.nieuw')}
      </Button>
    </Screen>
  );
}

function DoelKaart({
  doel,
  vandaag,
  risico,
  onOpen,
}: {
  readonly doel: DoelMetVoortgang;
  readonly vandaag: string | null;
  /** `null` betekent "nog niet berekend" en niet "op koers". */
  readonly risico: Risico | null;
  readonly onOpen: () => void;
}) {
  const theme = useTheme();

  const categorie = categorieLabels()[(doel.category ?? 'other') as Categorie];
  const verstreken = vandaag !== null && doel.target_date !== null && doel.target_date < vandaag;

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={doel.title ?? t('doelen.doel')}>
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

        {/*
          ⚠️ Zonder rij tonen we niets. Een doel dat vanmorgen is aangemaakt
             heeft nog geen stand — de radar draait bij de rollover en bij een
             goedkeuring — en een groen vinkje dat niets gemeten heeft is erger
             dan geen vinkje.
        */}
        {risico === null ? null : <RisicoBadge stand={risico.stand} />}

        <View style={styles.voet}>
          <Caption>{t('doelen.streefdatum', { datum: doel.target_date ?? '' })}</Caption>
          {verstreken ? (
            // Rood mag hier: dit is deadline-risico, het enige waar die kleur
            // voor is. Niet voor een gemiste week (domeinregel 7).
            <Caption muted={false} danger>
              {t('doelen.datum_verstreken')}
            </Caption>
          ) : (
            <Caption>{t('doelen.weken_afgerond', { n: doel.weekly_approved ?? 0 })}</Caption>
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
