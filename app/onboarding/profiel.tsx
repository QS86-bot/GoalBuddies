import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  rondOnboardingAf,
  updateProfiel,
  useProfiel,
  useSession,
  voorgesteldeTijdzone,
} from '@/modules/auth';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import type { Weekday } from '@/shared/time';
import {
  Avatar,
  Body,
  Button,
  Caption,
  Card,
  Choice,
  Field,
  Screen,
  Subheading,
  WeekStartKeuze,
} from '@/shared/ui';

/**
 * Het profiel bij de onboarding — QS8-27, QS8-28, QS8-29 en QS8-30 samen.
 *
 * Eén scherm en geen vier stappen: dit zijn allemaal kleine keuzes met een goede
 * standaard, en vier keer "Verder" tikken is precies de trechter waar mensen op
 * afhaken.
 */
export default function OnboardingProfiel() {
  const router = useRouter();
  const { userId } = useSession();
  const { profiel, zetProfiel } = useProfiel();

  const [naam, setNaam] = useState(profiel?.display_name ?? '');
  const [tz, setTz] = useState(profiel?.tz ?? voorgesteldeTijdzone());
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
      week_start_day: weekStart,
      reminder_enabled: herinneringAan,
      // ⚠️ Uit is uit. Staat de schakelaar uit, dan wordt de tijd leeggemaakt en
      //    niet bewaard "voor als je hem weer aanzet". Leerpunt uit de Habit
      //    Huddle-analyse: een herinnering die terugkomt nadat je hem uitzette,
      //    is de snelste manier om een app van iemands telefoon te krijgen.
      reminder_time: herinneringAan ? tijd : null,
      reminder_tone: toon,
      share_moves_by_default: false,
    });

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
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
    router.replace(eigenDoel ? '/doelen' : '/groep');
  }

  return (
    <Screen title={t('onboarding.profiel_titel')} eyebrow={t('onboarding.eyebrow')}>
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

      <Card>
        <Field
          label={t('onboarding.tijdzone')}
          hint={t('onboarding.tijdzone_hint')}
          value={tz}
          onChangeText={setTz}
          autoCapitalize="none"
          // Blijft onvertaald: dit is een IANA-naam en geen tekst.
          placeholder="Europe/Amsterdam"
        />
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
