import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useProfiel, useSession } from '@/modules/auth';
import {
  categorieLabels,
  fetchDoelen,
  fetchRisicos,
  type Categorie,
  type DoelMetVoortgang,
  type Risico,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import { space, useTheme } from '@/shared/theme';
import { localDateIn, now } from '@/shared/time';
import {
  AsyncView,
  useAsync,
  Body,
  Button,
  Caption,
  CategorieMerk,
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

  const [risicos, setRisicos] = useState<ReadonlyMap<string, Risico>>(new Map());

  /**
   * ⚠️ **De volgende pagina was er niet, en de tekst beloofde hem wel** —
   *    QS8-226. Onderaan stond *"Meer laden komt zodra er meer dan twintig
   *    zijn"*: een aantekening voor de bouwer, zichtbaar voor de gebruiker.
   *    Bij eenentwintig doelen was het eenentwintigste nergens te bereiken —
   *    "meerdere doelen kunnen wel, maar de app laat dat niet zien", precies de
   *    titel van dit issue.
   *
   * ⚠️ De opgehaalde pagina's stapelen in `rijen`; `pagina` is alleen de
   *    laatst opgehaalde. Zo blijft `fetchDoelen()` gepagineerd (regel 10) en
   *    ziet de gebruiker toch zijn hele lijst.
   */
  const [paginaNr, setPaginaNr] = useState(0);
  const [eerdere, setEerdere] = useState<readonly DoelMetVoortgang[]>([]);

  const {
    data: pagina,
    loading,
    error,
    herlaad,
  } = useAsync(
    userId ? () => fetchDoelen(userId, { pagina: paginaNr }) : null,
    [userId, paginaNr],
  );

  const rijen = [...eerdere, ...(pagina?.rijen ?? [])];
  const meer = pagina?.meer ?? false;

  // De risicostanden in één verzoek voor de hele pagina — niet één per doel
  // (regel 12). Faalt apart: een lijst zonder standen is bruikbaar, een lijst
  // die helemaal niet laadt niet.
  //
  // ⚠️ Alleen van jezelf. `goal_risk` is eigenaar-only sinds migratie 0050, dus
  //    dit levert per definitie niets op voor het doel van een ander.
  // ⚠️ **Een string en geen array als afhankelijkheid.** `rijen` is elke render
  //    een verse array, dus als dependency waardeloos — en met `setRisicos()`
  //    erin een oneindige laadlus. Dezelfde val die bevinding QS8-75 op het
  //    hoofdscherm opleverde; dat scherm doet het met `gehaaldeDoelen` net zo.
  const doelIds = rijen.map((d) => d.id).join(',');

  useEffect(() => {
    const ids = doelIds === '' ? [] : doelIds.split(',');
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
  }, [doelIds]);

  const vandaag = profiel ? localDateIn(profiel.tz, now()) : null;

  return (
    <Screen title={t('doelen.titel')}>
      {/*
        ⚠️ **Boven de lijst en niet eronder** — QS8-226, punt 2. Hij stond
           onderaan, ónder de paginering: bij drie doelen moest je ervoor
           scrollen, en juist wie er één heeft, moet zien dat er een tweede bij
           kan. Buiten `AsyncView`, zodat hij er ook staat terwijl de lijst nog
           laadt of stukliep.
      */}
      <Button variant="primair" block onPress={() => router.push('/doel/nieuw')}>
        {t('doelen.nieuw')}
      </Button>

      <AsyncView
        loading={loading}
        error={error}
        data={pagina}
        isEmpty={() => rijen.length === 0}
        onRetry={herlaad}
        empty={{
          title: t('doelen.leeg_titel'),
          body: t('doelen.leeg_tekst'),
        }}
      >
        {() => (
          <View style={styles.lijst}>
            {rijen.map((doel) => (
              <DoelKaart
                key={doel.id}
                doel={doel}
                vandaag={vandaag}
                risico={risicos.get(doel.id) ?? null}
                onOpen={() => router.push(`/doel/${doel.id}`)}
              />
            ))}

            {meer ? (
              <>
                <Caption>
                  {t('doelen.van_totaal', { aantal: rijen.length, totaal: pagina?.totaal ?? 0 })}
                </Caption>
                <Button
                  variant="secundair"
                  block
                  onPress={() => {
                    setEerdere(rijen);
                    setPaginaNr((n) => n + 1);
                  }}
                >
                  {t('doelen.meer_laden')}
                </Button>
              </>
            ) : null}
          </View>
        )}
      </AsyncView>
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
          {/*
            ⚠️ Het gebied als pictogram in de kleur van zijn familie — QS8-255.
               De kleur groepeert, het pictogram onderscheidt, en het label staat
               er nog steeds in tekst bij: de kleur draagt niets dat niet ook te
               lezen is.
          */}
          <CategorieMerk categorie={doel.category ?? 'other'} label={categorie} />
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
