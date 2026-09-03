import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  rondOnboardingAf,
  updateProfiel,
  useProfiel,
  userClock,
  useSession,
  zetWeekStartdag,
} from '@/modules/auth';
import { herinneringStandaard } from '@/modules/notifications';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { apparaatTijdzone, type Weekday } from '@/shared/time';
import {
  AsyncView,
  Avatar,
  Body,
  Button,
  Caption,
  Card,
  Choice,
  Field,
  Screen,
  TijdzoneKeuze,
  WeekStartKeuze,
} from '@/shared/ui';

/**
 * Het profiel bij de onboarding — QS8-27, QS8-28, QS8-29 en QS8-30 samen.
 *
 * Eén scherm en geen vier stappen: dit zijn allemaal kleine keuzes met een goede
 * standaard, en vier keer "Verder" tikken is precies de trechter waar mensen op
 * afhaken.
 */
/**
 * Wacht tot het profiel bekend is, en laat het formulier daarna pas monteren.
 *
 * ⚠️ **Zonder deze wacht kon dit scherm de week-startdag terugzetten.** De
 *    `useState`-initialisatoren hieronder draaien één keer, bij de eerste
 *    render, en er is geen effect dat ze bijstelt. Rendert het formulier terwijl
 *    het profiel nog onbekend is, dan staan ze op hun standaardwaarden — en
 *    schrijft "Bewaren" `week_start_day = 1` en `tz = apparaatTijdzone()` over
 *    wat er stond. `display_name: ''` werd nog door `profielSchema`
 *    tegengehouden, de rest niet.
 *
 * ⚠️ **Sinds QS8-213 schrijft dit scherm minder velden, en dat is geen vervanging
 *    van deze wacht.** De twee die overblijven zijn precies de twee waar de
 *    initialisatoren toe doen.
 *
 * ⚠️ Dat is klok 1 van domeinregel 1, stilzwijgend verzet. Het pad ernaartoe is
 *    niet exotisch: `Routewacht` stuurde bij een mislukte profielophaling naar
 *    de onboarding (gedicht in dezelfde wijziging), en op web is elke diepe
 *    route rechtstreeks op te vragen — `scripts/deploy-web.mjs` schrijft daar
 *    juist een `.htaccess` voor.
 *
 * ⚠️ Een buitenste component en geen `if` in het formulier: alleen zo mónteren
 *    de initialisatoren pas als het profiel er is. Een vroege `return` in
 *    hetzelfde component zou de hooks-volgorde breken.
 */
export default function OnboardingProfiel() {
  const { profiel, loading, error, herlaad } = useProfiel();

  return (
    <AsyncView
      loading={loading}
      error={error}
      data={profiel ?? undefined}
      isEmpty={() => false}
      onRetry={herlaad}
      empty={{ title: t('onboarding.profiel_leeg_titel'), body: t('onboarding.profiel_leeg_tekst') }}
    >
      {() => <OnboardingProfielFormulier />}
    </AsyncView>
  );
}

function OnboardingProfielFormulier() {
  const router = useRouter();
  const { userId } = useSession();
  const { profiel, zetProfiel } = useProfiel();

  const [naam, setNaam] = useState(profiel?.display_name ?? '');
  const [tz, setTz] = useState(profiel?.tz ?? apparaatTijdzone());
  const [weekStart, setWeekStart] = useState<Weekday>((profiel?.week_start_day ?? 1) as Weekday);
  const [eigenDoel, setEigenDoel] = useState(profiel?.wants_own_goal ?? true);

  // Het correctiepad staat dicht tot iemand zegt dat de zone niet klopt. Zie de
  // kaart hieronder voor waarom dat de hele wijziging van QS8-213 is.
  const [zoneOpen, setZoneOpen] = useState(false);

  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    if (!userId) return;
    setBezig(true);
    setFout(null);

    // ⚠️ **Alleen wat dit scherm de gebruiker daadwerkelijk vraagt.** Elk veld
    //    dat hier met een vaste waarde in staat, is een veld dat iemand met een
    //    bestaand profiel kwijtraakt zodra hij hier per ongeluk belandt — en dat
    //    pad is niet exotisch, zie de kop van dit bestand.
    //    `share_moves_by_default: false` stond hier als zo'n constante. Nagemeten
    //    op 03-09: die kolom heeft geen enkele lezer en had hier zijn laatste
    //    schrijver, en de kolomstandaard is toch al `false`. Weghalen redt dus
    //    geen voorkeur — het haalt de vórm weg waarmee er ooit wél een kwijtraakt.
    //
    // ⚠️ De herinnering komt uit `herinneringStandaard()` en niet uit drie
    //    velden op dit scherm: die vraag hoort niet bij iemand die de app nog
    //    niet kent. Dat is óók de plek waar "uit is uit" bewaakt wordt — voor wie
    //    de onboarding al gehad heeft, geeft die functie niets terug.
    //    `tests/beloftes/onboarding-schrijft-niets-over.test.ts` houdt deze lijst
    //    kort.
    const uitkomst = await updateProfiel(userId, {
      display_name: naam,
      tz,
      ...herinneringStandaard({ onboarded_at: profiel?.onboarded_at ?? null }),
    });

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    // ⚠️ **De week-startdag gaat apart, want de kolom is sinds migratie 0139
    //    voor de client niet meer schrijfbaar.** Dat pad zet de dag én verhuist
    //    lopende `todo`-weekdoelen mee; hier is dat laatste per definitie een
    //    no-op, want een gebruiker die de onboarding doet heeft er nog geen.
    //
    //    De klok komt uit het net geschreven profiel, zodat de tijdzone die de
    //    gebruiker hierboven koos meteen meetelt bij het uitrekenen van de
    //    cyclus — met de oude zone zou de grens er in de verkeerde tijdzone
    //    liggen.
    const dag = await zetWeekStartdag(userId, userClock(uitkomst.profiel), weekStart);
    if (!dag.ok) {
      setFout(dag.melding);
      setBezig(false);
      return;
    }

    // Afronden is een tweede schrijfactie, met opzet. Wie halverwege wegklikt,
    // komt de volgende keer gewoon weer hier terecht in plaats van in een app
    // waarvan de helft nog niet is ingevuld.
    const afgerond = await rondOnboardingAf(userId, eigenDoel);
    if (!afgerond.ok) {
      setFout(afgerond.melding);
      setBezig(false);
      return;
    }

    zetProfiel(afgerond.profiel);

    // ⚠️ **De vragenlijst komt hierna en niet hiervóór** — besluit A56. Eerst
    //    het minimum dat de app nodig heeft om te werken (naam, tijdzone,
    //    week-startdag), dan pas de vier vragen die haar beter maken. Andersom is
    //    het een drempel vóór er iets te winnen valt.
    //
    // ⚠️ En de onboarding is op dit punt al afgerond: wie de vragenlijst
    //    wegklikt, belandt in een werkende app en niet opnieuw in de onboarding.
    //    Dat is wat "overslaan mag" betekent.
    router.replace('/onboarding/vragenlijst');
  }

  return (
    <Screen
      title={t('onboarding.profiel_titel')}
      eyebrow={t('onboarding.eyebrow')}
      terug={{ naar: '/onboarding/uitleg' }}
    >
      <Card>
        <View style={styles.naamrij}>
          <Avatar name={naam || t('onboarding.naamloos')} url={profiel?.avatar_url} size={44} />
          <View style={styles.naamveld}>
            <Field
              label={t('onboarding.naam')}
              hint={t('onboarding.naam_hint')}
              value={naam}
              onChangeText={setNaam}
              autoCapitalize="words"
              autoComplete="name"
              placeholder={t('onboarding.naam_plaatshouder')}
            />
          </View>
        </View>
        <Caption>{t('onboarding.geen_avatar')}</Caption>
      </Card>

      <Card>
        <WeekStartKeuze waarde={weekStart} onKies={setWeekStart} />
      </Card>

      {/*
        ⚠️ **De tijdzone is een regel tekst en geen veld** — QS8-213. Hij kwam al
           uit het apparaat (`apparaatTijdzone()` leest
           `Intl.DateTimeFormat().resolvedOptions().timeZone`), maar hij stond
           hier als volledig zoekveld met label, hint en plaatshouder. Dat leest
           als iets wat je moet invullen, terwijl het bedoeld is als correctiepad
           voor wie verhuisd is of wiens telefoon het mis heeft.

        ⚠️ **`TijdzoneKeuze` blijft er wél onder zitten, ongewijzigd.** Alleen de
           regel tonen zonder weg ernaartoe zou de keten van QS8-27 opnieuw
           doorknippen: zone verkeerd, en geen enkele knop om hem recht te
           zetten. Het is dezelfde component, in volle vorm, één tik verderop.
      */}
      <Card>
        <View style={styles.zonerij}>
          {/*
            ⚠️ De `View` eromheen en geen `style` op `Body`: die component zet
               `style` zelf en spreidt `...rest` daarná, dus een eigen `style`
               vervángt de typografie in plaats van hem aan te vullen.
          */}
          <View style={styles.zonetekst}>
            <Body>{t('onboarding.tijdzone_van_telefoon', { zone: tz })}</Body>
          </View>
          {zoneOpen ? null : (
            <Button variant="stil" onPress={() => setZoneOpen(true)}>
              {t('onboarding.tijdzone_klopt_niet')}
            </Button>
          )}
        </View>
        {zoneOpen ? <TijdzoneKeuze waarde={tz} onKies={setTz} /> : null}
      </Card>

      <Card nested>
        <Choice
          label={t('onboarding.waarvoor')}
          hint={t('onboarding.waarvoor_hint')}
          opties={[
            { waarde: 'eigen', label: t('onboarding.zelf_doel') },
            { waarde: 'buddy', label: t('onboarding.kom_helpen') },
          ]}
          waarde={eigenDoel ? 'eigen' : 'buddy'}
          onKies={(v) => setEigenDoel(v === 'eigen')}
        />
      </Card>

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button variant="primair" block busy={bezig} onPress={() => void bewaar()}>
        {t('onboarding.klaar')}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  naamrij: { flexDirection: 'row', gap: space.blokGap, alignItems: 'flex-start' },
  naamveld: { flex: 1 },
  zonerij: {
    flexDirection: 'row',
    gap: space.blokGap,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zonetekst: { flexShrink: 1 },
});
