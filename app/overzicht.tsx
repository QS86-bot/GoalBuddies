import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useProfiel, userClock, useSession } from '@/modules/auth';
import { fetchAfvinkdagen } from '@/modules/completions';
import {
  categorieLabels,
  fetchDoelen,
  fetchDoelStanden,
  fetchWeekbalken,
  laatsteCycli,
  WEKEN_IN_OVERZICHT,
  type Categorie,
  type Weekbalk,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { addDays, now, userCycle } from '@/shared/time';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  CategorieMerk,
  Kalender,
  Screen,
  Subheading,
  useAsync,
  Weekbalken,
  type KalenderDag,
} from '@/shared/ui';

/**
 * Je eigen terugblik — QS8-256.
 *
 * ⚠️ **Geen vijfde tabblad.** `app/(tabs)/_layout.tsx` legt vast dat het er vier
 *    zijn en waarom: elk tabblad erbij verdunt de andere. Dit scherm hangt
 *    daarom onder Vandaag, waar de knop ernaartoe staat.
 *
 * ⚠️ **Dit scherm is van jou alleen en dat is een ontwerpuitgangspunt en geen
 *    detail.** Alles wat hier staat — twaalf weken inclusief de weken die niet
 *    telden, je dagen, je punten — is privé per policy. CLAUDE.md staat dat
 *    toe: "eigen tegenvallers zijn privé zichtbaar voor jezelf". Geef geen enkel
 *    type van dit scherm door aan een component dat een ánder lid toont.
 *
 * ⚠️ **De groepsstand staat hier niet, en dat is met opzet.** Een persoonlijk
 *    scherm zou moeten kiezen wélke groep, en die keuze is precies de bug van
 *    QS8-56: het scherm pakte toen stilzwijgend `groepen[0]`. De stand van een
 *    groep hoort op het groepsscherm, waar de app weet om welke groep het gaat.
 *    Hier staat een verwijzing.
 *
 * ⚠️ **De dagreeks ontbreekt, en dat is geen omissie maar QS8-253.** Die zegt
 *    met zoveel woorden dat een dagreeks met zijn vergeving meekomt of niet
 *    komt: nachtuil-marge en dagpassen in dezelfde migratie. Zonder die twee is
 *    een dagreeks een strafmechanisme.
 */

/** Hoeveel dagen de kalender toont. Twaalf weken, gelijk aan de balken. */
const DAGEN_IN_KALENDER = WEKEN_IN_OVERZICHT * 7;

interface Stand {
  readonly balken: readonly Weekbalk[];
  readonly dagen: readonly KalenderDag[];
  readonly besteReeks: number;
  readonly huidigeReeks: number;
  readonly punten: number;
  readonly perGebied: readonly { readonly categorie: string; readonly aantal: number }[];
}

export default function Overzicht() {
  const router = useRouter();
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const { data, loading, error, herlaad } = useAsync(
    userId && profiel ? () => laadOverzicht(userId, profiel) : null,
    [userId, profiel],
  );

  return (
    <Screen
      title={t('overzicht.titel')}
      eyebrow={t('overzicht.eyebrow')}
      terug={{ naar: '/' }}
    >
      <AsyncView
        data={data}
        loading={loading}
        error={error}
        onRetry={herlaad}
        // ⚠️ De lege staat is hier het nórmale geval bij een vers account, en
        //    niet een randgeval. Vandaar een uitnodiging en geen storing.
        isEmpty={(s) => s.balken.length === 0}
        empty={{ title: t('overzicht.weken_kop'), body: t('overzicht.weken_leeg') }}
      >
        {(s) => (
          <View style={styles.blokken}>
            <Card>
              <Subheading>{t('overzicht.weken_kop')}</Subheading>
              <Weekbalken regels={s.balken} />
            </Card>

            {/*
              ⚠️ Een blok dat bij dit ritme niets betekent, wordt niet getoond in
                 plaats van leeg getekend — acceptatiecriterium van QS8-256. Wie
                 geen enkel ritme-doel heeft, heeft geen afvinkingen, en een leeg
                 raster van vierentachtig vakjes zou dan suggereren dat hij iets
                 verzuimd heeft.
            */}
            {s.dagen.length === 0 ? null : (
              <Card>
                <Subheading>{t('overzicht.kalender_kop')}</Subheading>
                <Kalender dagen={s.dagen} />
              </Card>
            )}

            <View style={styles.tegels}>
              <Card nested>
                <Caption>{t('overzicht.reeks_kop')}</Caption>
                <Subheading>
                  {s.besteReeks === 1
                    ? t('overzicht.reeks_week')
                    : t('overzicht.reeks_weken', { n: s.besteReeks })}
                </Subheading>
                <Caption>{t('overzicht.reeks_nu', { n: s.huidigeReeks })}</Caption>
              </Card>

              <Card nested>
                <Caption>{t('overzicht.punten_kop')}</Caption>
                <Subheading>{s.punten}</Subheading>
                {/*
                  ⚠️ Het scherm zegt zélf dat dit privé is. Domeinregel 10 maakt
                     `points_ledger` eigenaar-only, en een gebruiker die dat niet
                     weet, houdt zich in over wat hij hier neerzet.
                */}
                <Caption>{t('overzicht.punten_prive')}</Caption>
              </Card>
            </View>

            <Card>
              <Subheading>{t('overzicht.gebieden_kop')}</Subheading>
              {s.perGebied.length === 0 ? (
                <Body muted>{t('overzicht.gebieden_leeg')}</Body>
              ) : (
                <View style={styles.gebieden}>
                  {s.perGebied.map((rij) => (
                    <CategorieMerk
                      key={rij.categorie}
                      categorie={rij.categorie}
                      label={t('overzicht.gebied_label', {
                        gebied: categorieLabels()[rij.categorie as Categorie] ?? rij.categorie,
                        aantal: rij.aantal,
                      })}
                    />
                  ))}
                </View>
              )}
            </Card>

            <Card nested>
              <Subheading>{t('overzicht.groep_kop')}</Subheading>
              <Body muted>{t('overzicht.groep_uitleg')}</Body>
              <Button variant="stil" onPress={() => router.push('/groep')}>
                {t('overzicht.groep_open')}
              </Button>
            </Card>
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

/**
 * Vier verzoeken, ongeacht het aantal doelen of weken.
 *
 * ⚠️ Geen lus over doelen en geen lus over weken (onwrikbare regel 12). De
 *    weekbalken zijn één query over twaalf cycli, de kalender één over
 *    vierentachtig dagen, en `fetchDoelStanden()` doet er zelf twee voor álle
 *    doelen samen.
 */
async function laadOverzicht(
  userId: string,
  profiel: { readonly week_start_day: number; readonly tz: string },
): Promise<Stand> {
  const klok = userClock(profiel);
  const cycli = laatsteCycli(userCycle(klok, now()));

  const eerste = cycli[0];
  const laatste = cycli[cycli.length - 1];
  if (eerste === undefined || laatste === undefined) {
    return { balken: [], dagen: [], besteReeks: 0, huidigeReeks: 0, punten: 0, perGebied: [] };
  }

  // ⚠️ De kalender loopt tot het einde van de lopende cyclus en niet tot
  //    "vandaag": anders krimpt het raster gedurende de week en lijkt het alsof
  //    er dagen verdwijnen.
  const [balken, afvinkingen, standen, doelen] = await Promise.all([
    fetchWeekbalken(userId, cycli),
    fetchAfvinkdagen(eerste.startDate, laatste.endDate),
    fetchDoelStanden(userId),
    fetchDoelen(userId),
  ]);

  const dagen: KalenderDag[] = [];
  if (afvinkingen.size > 0) {
    for (let i = 0; i < DAGEN_IN_KALENDER; i += 1) {
      const datum = addDays(eerste.startDate, i);
      dagen.push({ datum, aantal: afvinkingen.get(datum) ?? 0 });
    }
  }

  let besteReeks = 0;
  let huidigeReeks = 0;
  let punten = 0;
  for (const stand of standen.values()) {
    besteReeks = Math.max(besteReeks, stand.besteReeks);
    huidigeReeks = Math.max(huidigeReeks, stand.huidigeReeks);
    punten += stand.punten;
  }

  const perGebied = new Map<string, number>();
  for (const doel of doelen.rijen) {
    const categorie = doel.category ?? 'other';
    perGebied.set(categorie, (perGebied.get(categorie) ?? 0) + 1);
  }

  return {
    balken,
    dagen,
    besteReeks,
    huidigeReeks,
    punten,
    perGebied: [...perGebied.entries()]
      .map(([categorie, aantal]) => ({ categorie, aantal }))
      .sort((a, b) => b.aantal - a.aantal || a.categorie.localeCompare(b.categorie)),
  };
}

const styles = StyleSheet.create({
  blokken: { gap: space.blokGap },
  tegels: { flexDirection: 'row', gap: space.blokGap - 3 },
  gebieden: { flexDirection: 'row', flexWrap: 'wrap', gap: space.blokGap - 4 },
});
