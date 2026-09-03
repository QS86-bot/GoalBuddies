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
import { herinneringVelden } from '@/modules/notifications';
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
  Subheading,
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
 * ⚠️ **Zonder deze wacht kon dit scherm de week-startdag terugzetten.** De zeven
 *    `useState`-initialisatoren hieronder draaien één keer, bij de eerste
 *    render, en er is geen effect dat ze bijstelt. Rendert het formulier terwijl
 *    het profiel nog onbekend is, dan staan ze op hun standaardwaarden — en
 *    schrijft "Bewaren" `week_start_day = 1`, `tz = apparaatTijdzone()` en de
 *    herinneringsinstellingen over wat er stond. `display_name: ''` werd nog
 *    door `profielSchema` tegengehouden, de andere zes niet.
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
  const [herinneringAan, setHerinneringAan] = useState(profiel?.reminder_enabled ?? true);
  const [tijd, setTijd] = useState(profiel?.reminder_time?.slice(0, 5) ?? '20:00');
  const [toon, setToon] = useState<'gentle' | 'firm'>(
    (profiel?.reminder_tone as 'gentle' | 'firm') ?? 'gentle',
  );
  const [eigenDoel, setEigenDoel] = useState(profiel?.wants_own_goal ?? true);

  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    if (!userId) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await updateProfiel(userId, {
      display_name: naam,
      tz,
      // ⚠️ "Uit is uit" zit in `herinneringVelden()` en niet hier: sinds
      //    26-08-2026 kan het profieltabblad hetzelfde, en dezelfde belofte op
      //    twee schermen is de naad uit regel 18.
      ...herinneringVelden({ aan: herinneringAan, tijd, toon }),
      share_moves_by_default: false,
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
        ⚠️ **Hetzelfde component als op het profielscherm, en dat is geen
           luiheid** — precies het argument dat `WeekStartKeuze` al maakt. Hier
           stond een kaal invoerveld, en dat vraagt van iemand die net begint dat
           hij de IANA-naam van zijn zone uit zijn hoofd kent. `TijdzoneKeuze`
           zoekt op plaatsnaam en heeft de knop "de tijdzone van dit apparaat"
           erbij; twee schermen die dezelfde keuze anders aanbieden, is twee
           plekken waar een onbekende zone binnen kan komen.
      */}
      <Card>
        <TijdzoneKeuze waarde={tz} onKies={setTz} />
      </Card>

      <Card>
        <Subheading>{t('onboarding.dagelijkse_herinnering')}</Subheading>
        <Choice
          label={t('onboarding.herinnering')}
          opties={[
            { waarde: 'aan', label: t('onboarding.aan') },
            { waarde: 'uit', label: t('onboarding.uit') },
          ]}
          waarde={herinneringAan ? 'aan' : 'uit'}
          onKies={(v) => setHerinneringAan(v === 'aan')}
        />

        {herinneringAan ? (
          <>
            <Field
              label={t('onboarding.hoe_laat')}
              value={tijd}
              onChangeText={setTijd}
              placeholder="20:00"
              inputMode="numeric"
            />
            <Choice
              label={t('onboarding.toon')}
              hint={t('onboarding.toon_hint')}
              opties={[
                { waarde: 'gentle', label: t('onboarding.zacht') },
                { waarde: 'firm', label: t('onboarding.streng') },
              ]}
              waarde={toon}
              onKies={setToon}
            />
          </>
        ) : (
          <Body muted>{t('onboarding.uit_blijft_uit')}</Body>
        )}
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
});
