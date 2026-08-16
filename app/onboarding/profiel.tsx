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
    <Screen title="Even over jou" eyebrow="NOG ÉÉN SCHERM">
      <Card>
        <View style={styles.naamrij}>
          <Avatar name={naam || 'Naamloos'} url={profiel?.avatar_url} size={44} />
          <View style={styles.naamveld}>
            <Field
              label="Hoe heet je?"
              hint="Dit zien je buddy's. Een voornaam is genoeg."
              value={naam}
              onChangeText={setNaam}
              autoCapitalize="words"
              autoComplete="name"
              placeholder="Quinten"
            />
          </View>
        </View>
        <Caption>
          Geen avatar? Dan tonen we je initialen. Een foto uploaden kan zodra we opslag hebben
          ingericht.
        </Caption>
      </Card>

      <Card>
        <WeekStartKeuze waarde={weekStart} onKies={setWeekStart} />
      </Card>

      <Card>
        <Field
          label="Tijdzone"
          hint="Overgenomen van je toestel. Klopt hij niet, pas hem dan aan — hij bepaalt wanneer jouw dag omslaat."
          value={tz}
          onChangeText={setTz}
          autoCapitalize="none"
          placeholder="Europe/Amsterdam"
        />
      </Card>

      <Card>
        <Subheading>Dagelijkse herinnering</Subheading>
        <Choice
          label="Herinnering"
          opties={[
            { waarde: 'aan', label: 'Aan' },
            { waarde: 'uit', label: 'Uit' },
          ]}
          waarde={herinneringAan ? 'aan' : 'uit'}
          onKies={(v) => setHerinneringAan(v === 'aan')}
        />

        {herinneringAan ? (
          <>
            <Field
              label="Hoe laat?"
              value={tijd}
              onChangeText={setTijd}
              placeholder="20:00"
              inputMode="numeric"
            />
            <Choice
              label="Toon"
              hint="Bepaalt hoe de tekst klinkt, niet hoe vaak je hem krijgt."
              opties={[
                { waarde: 'gentle', label: 'Zacht' },
                { waarde: 'firm', label: 'Streng' },
              ]}
              waarde={toon}
              onKies={setToon}
            />
          </>
        ) : (
          <Body muted>Uit blijft uit. We sturen je niets.</Body>
        )}
      </Card>

      <Card nested>
        <Choice
          label="Waarvoor kom je?"
          hint="Kwam je binnen om een vriend te helpen? Dan hoef je zelf geen doel. Je kunt er altijd later een starten."
          opties={[
            { waarde: 'eigen', label: 'Ik wil zelf een doel' },
            { waarde: 'buddy', label: 'Ik kom helpen' },
          ]}
          waarde={eigenDoel ? 'eigen' : 'buddy'}
          onKies={(v) => setEigenDoel(v === 'eigen')}
        />
      </Card>

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button variant="primair" block busy={bezig} onPress={() => void bewaar()}>
        Klaar
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  naamrij: { flexDirection: 'row', gap: space.blokGap, alignItems: 'flex-start' },
  naamveld: { flex: 1 },
});
