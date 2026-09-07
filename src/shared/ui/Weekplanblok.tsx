import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { Button } from './Button';
import { Body, Caption, Subheading } from './Text';

/**
 * Het weekplan onder een doel — QS8-203, migratie 0138.
 *
 * "Deze week, daarna, daarna." Wat hier staat is nog géén weekdoel: het telt
 * niet mee in het puntenplafond, levert geen punten op en kan geen minpunt
 * kosten. Elke cyclus schuift de rollover de bovenste stap in.
 *
 * ⚠️ **Dit component is privé en hoort nooit in een groepsscherm.** Zelfde
 *    strekking als bij `Weekpas`: een weekplan is een vooruitblik op je eigen
 *    werk, en wie ziet dat er al twee weken niets ingeschoven is, weet iets over
 *    andermans weken (domeinregel 7). De policies in 0138 zijn eigenaar-only
 *    zonder tak voor groepsgenoten — ook in een open groep (A41) — maar leun
 *    daar niet op: geef dit component geen `viewer`-prop in de hoop dat het dan
 *    wel goedkomt.
 *
 * ⚠️ **De copy moet zeggen dat een geplande stap niets kost.** Zonder die zin
 *    leest een lijst van zes stappen als zes weekdoelen, en dan lijkt het alsof
 *    de gebruiker zes weken achterstand heeft opgelopen zodra hij er één haalt.
 *    Dat is precies de verwarring die dit hele ontwerp moet voorkomen.
 *
 * ⚠️ Presentatie en geen gegevens: dit component haalt niets op en schrijft
 *    niets. De aanroeper doet dat, want die kent de klok van de gebruiker en dit
 *    component hoort geen cyclus te kennen (correctheidsregel 7).
 */

/** Precies zoveel van een geplande stap als dit component nodig heeft. */
export interface WeekplanRegel {
  readonly id: string;
  readonly title: string;
  readonly floor_text: string | null;
  readonly ceiling_text: string | null;
}

interface Props {
  readonly stappen: readonly WeekplanRegel[];
  /** De stap waar nu een handeling op loopt; alle knoppen gaan dan op slot. */
  readonly bezig?: string | null;
  readonly onStartNu: (id: string) => void;
  /**
   * ⚠️ Bijstellen en niet alleen weghalen (QS8-301). Zonder deze knop moet een
   *    tikfout in een geplande stap via verwijderen-en-opnieuw-typen, en dan is
   *    de volgorde ook nog kwijt. `stelWeekplanstapBij()` bestond al; er zat
   *    alleen geen knop aan.
   */
  readonly onBewerk: (id: string) => void;
  readonly onVerwijder: (id: string) => void;
  readonly onSchuif: (id: string, richting: 'omhoog' | 'omlaag') => void;
}

export function Weekplanblok({
  stappen,
  bezig = null,
  onStartNu,
  onBewerk,
  onVerwijder,
  onSchuif,
}: Props) {
  return (
    <View style={styles.blok}>
      <Subheading>{t('weekplan.kop')}</Subheading>

      {stappen.length === 0 ? (
        // ⚠️ Onwrikbare regel 16: een lege staat en geen leeg vlak. En hij legt
        //    uit wat een plan ís, want dit is het enige scherm waar dat begrip
        //    voorkomt.
        <Body muted>{t('weekplan.leeg')}</Body>
      ) : (
        <>
          <Caption>{t('weekplan.uitleg')}</Caption>

          {stappen.map((stap, i) => (
            <View key={stap.id} style={styles.stap}>
              <Body>{stap.title}</Body>
              <Caption>
                {i === 0
                  ? t('weekplan.eerstvolgende')
                  : t('weekplan.over_weken', { weken: i })}
              </Caption>

              {stap.floor_text === null ? null : (
                <Caption>{t('weekdoel.vloer_regel', { tekst: stap.floor_text })}</Caption>
              )}
              {stap.ceiling_text === null ? null : (
                <Caption>{t('weekdoel.plafond_regel', { tekst: stap.ceiling_text })}</Caption>
              )}

              <Stapknoppen
                stap={stap}
                eerste={i === 0}
                laatste={i === stappen.length - 1}
                bezig={bezig !== null}
                onStartNu={onStartNu}
                onBewerk={onBewerk}
                onVerwijder={onVerwijder}
                onSchuif={onSchuif}
              />
            </View>
          ))}

          {/*
            ⚠️ Deze zin is de kern van het ontwerp en niet een geruststelling.
               Een gebruiker die denkt dat dit zes weekdoelen zijn, denkt ook dat
               hij er vijf gaat missen.
          */}
          <Caption>{t('weekplan.kost_niets')}</Caption>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: 7 },
  stap: { gap: 3 },
  knoppen: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});

/**
 * De knoppen bij één geplande stap.
 *
 * ⚠️ Een eigen component en geen blok in `Weekplanblok`, sinds er een vierde
 *    knop bij kwam (QS8-301). Coderegel 15: `src/shared/ui` staat op zijn
 *    plafond, en een rij van vier knoppen met twee voorwaarden erin is precies
 *    het soort blok dat je apart wilt kunnen lezen.
 */
function Stapknoppen({
  stap,
  eerste,
  laatste,
  bezig,
  onStartNu,
  onBewerk,
  onVerwijder,
  onSchuif,
}: {
  readonly stap: WeekplanRegel;
  readonly eerste: boolean;
  readonly laatste: boolean;
  readonly bezig: boolean;
  readonly onStartNu: (id: string) => void;
  readonly onBewerk: (id: string) => void;
  readonly onVerwijder: (id: string) => void;
  readonly onSchuif: (id: string, richting: 'omhoog' | 'omlaag') => void;
}) {
  return (
      <View style={styles.knoppen}>
        {/*
          ⚠️ "Start deze nu" op elke stap en niet alleen op de bovenste.
             Het plan is een voorstel van de coach, geen dienstregeling —
             wie deze week zin heeft in stap 4, hoort daar niet drie weken
             op te hoeven wachten. De rest schuift niet op; alleen deze
             rij is verbruikt.
        */}
        <Button
          variant="stil"
          disabled={bezig}
          accessibilityLabel={t('weekplan.start_nu_label', { titel: stap.title })}
          onPress={() => onStartNu(stap.id)}
        >
          {t('weekplan.start_nu')}
        </Button>

        {eerste ? null : (
          <Button
            variant="stil"
            disabled={bezig}
            accessibilityLabel={t('weekplan.omhoog_label', { titel: stap.title })}
            onPress={() => onSchuif(stap.id, 'omhoog')}
          >
            {t('weekplan.omhoog')}
          </Button>
        )}

        {laatste ? null : (
          <Button
            variant="stil"
            disabled={bezig}
            accessibilityLabel={t('weekplan.omlaag_label', { titel: stap.title })}
            onPress={() => onSchuif(stap.id, 'omlaag')}
          >
            {t('weekplan.omlaag')}
          </Button>
        )}

        <Button
          variant="stil"
          disabled={bezig}
          accessibilityLabel={t('weekplan.bijstellen_label', { titel: stap.title })}
          onPress={() => onBewerk(stap.id)}
        >
          {t('weekplan.bijstellen')}
        </Button>

        <Button
          variant="stil"
          disabled={bezig}
          accessibilityLabel={t('weekplan.verwijder_label', { titel: stap.title })}
          onPress={() => onVerwijder(stap.id)}
        >
          {t('weekplan.verwijder')}
        </Button>
      </View>
  );
}
