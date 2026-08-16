import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession, userClock } from '@/modules/auth';
import {
  fetchDagzetten,
  rondAf,
  zetDagzet,
  type DagZet,
} from '@/modules/completions';
import {
  afsluitbareCyclus,
  fetchWeekdoelen,
  huidigeCyclus,
  inCoulanceperiode,
  type Weekdoel,
} from '@/modules/goals';
import { space } from '@/shared/theme';
import { localDateIn, now } from '@/shared/time';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  Choice,
  Field,
  FloorCeiling,
  Screen,
  Subheading,
  type WeeklyGoalStatus,
} from '@/shared/ui';

/**
 * Vandaag — de huidige cyclus, de weekdoelen met vloer en plafond, de Dagzet.
 *
 * ⚠️ Dit scherm is de enige plek waar de coulanceperiode zichtbaar wordt
 *    (QS8-51). Zit je erin, dan sluit je nog de vórige week af, en dat moet er
 *    letterlijk staan — anders denkt iemand dat hij per ongeluk de verkeerde
 *    week aan het afronden is.
 */
export default function Vandaag() {
  const router = useRouter();
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const [weekdoelen, setWeekdoelen] = useState<readonly Weekdoel[]>([]);
  const [dagzetten, setDagzetten] = useState<readonly DagZet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);

  const klok = profiel ? userClock(profiel) : null;
  const cyclus = klok ? huidigeCyclus(klok) : null;
  const afTeSluiten = klok ? afsluitbareCyclus(klok) : null;
  const coulance = klok ? inCoulanceperiode(klok) : false;

  // ⚠️ De cyclusobjecten worden elke render opnieuw gebouwd, dus als
  //    afhankelijkheid zijn ze waardeloos: het effect zou eindeloos herhalen.
  //    De startdatum is wat er werkelijk verandert, en die is een string.
  const afTeSluitenStart = afTeSluiten?.startDate ?? null;
  const cyclusStart = cyclus?.startDate ?? null;

  useEffect(() => {
    if (!userId || !afTeSluiten || !cyclus) return;
    let levend = true;

    Promise.all([fetchWeekdoelen(userId, afTeSluiten), fetchDagzetten(userId, cyclus)])
      .then(([doelen, zetten]) => {
        if (!levend) return;
        setWeekdoelen(doelen);
        setDagzetten(zetten);
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

  }, [userId, afTeSluiten, cyclus, afTeSluitenStart, cyclusStart, ronde]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  return (
    <Screen
      title="Vandaag"
      eyebrow={afTeSluiten ? `WEEK VAN ${afTeSluiten.startDate}` : 'DEZE WEEK'}
    >
      {coulance && afTeSluiten ? (
        <Card nested>
          <Subheading>Je vorige week loopt nog even door</Subheading>
          <Body muted>
            Je nieuwe week is begonnen, maar je kunt de week van {afTeSluiten.startDate} nog
            afsluiten. Dat venster duurt twaalf uur — zondagavond klaar, maandagochtend gelogd.
          </Body>
        </Card>
      ) : null}

      <AsyncView
        loading={loading}
        error={error}
        data={weekdoelen}
        isEmpty={(d) => d.length === 0}
        onRetry={herlaad}
        empty={{
          title: 'Nog geen weekdoelen',
          body:
            'Een weekdoel is wat je deze week af wilt hebben. Geef het een vloer — de versie ' +
            'die je op je slechtste week nog haalt — en een plafond. De vloer halen telt: je ' +
            'reeks loopt door.',
        }}
      >
        {(doelen) => (
          <View style={styles.lijst}>
            {doelen.map((weekdoel) => (
              <WeekdoelKaart
                key={weekdoel.id}
                weekdoel={weekdoel}
                userId={userId ?? ''}
                onKlaar={herlaad}
              />
            ))}
          </View>
        )}
      </AsyncView>

      <Button variant="primair" block onPress={() => router.push('/doelen')}>
        Weekdoel toevoegen
      </Button>

      <DagzetBlok
        userId={userId ?? ''}
        localDate={profiel ? localDateIn(profiel.tz, now()) : null}
        zetten={dagzetten}
        onKlaar={herlaad}
      />
    </Screen>
  );
}

/**
 * Eén weekdoel, met de mogelijkheid het af te ronden — QS8-46.
 *
 * ⚠️ De status wordt `pending`, nooit direct `approved`. Zelf afvinken is geen
 *    goedkeuring, ook niet als je alleen werkt.
 */
function WeekdoelKaart({
  weekdoel,
  userId,
  onKlaar,
}: {
  readonly weekdoel: Weekdoel;
  readonly userId: string;
  readonly onKlaar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [niveau, setNiveau] = useState<'floor' | 'ceiling'>('ceiling');
  const [notitie, setNotitie] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const heeftVloer = Boolean(weekdoel.floor_text);
  const afgerond = weekdoel.status !== 'todo';

  async function afronden() {
    setBezig(true);
    setFout(null);

    // De bewijseis komt straks per groep uit `groups.evidence_policy` (6.5).
    // Tot EPIC 6 er is, geldt de standaard: een notitie is verplicht.
    const uitkomst = await rondAf(weekdoel.id, userId, {
      achieved_level: heeftVloer ? niveau : 'ceiling',
      note: notitie,
    }, 'note_required');

    if (!uitkomst.ok) setFout(uitkomst.melding);
    else {
      setOpen(false);
      onKlaar();
    }
    setBezig(false);
  }

  return (
    <Card>
      <FloorCeiling
        title={weekdoel.title}
        floorText={weekdoel.floor_text}
        ceilingText={weekdoel.ceiling_text}
        status={weekdoel.status as WeeklyGoalStatus}
        achieved="none"
        viewer="owner"
      />

      {afgerond || !open ? null : (
        <View style={styles.afrond}>
          {heeftVloer ? (
            <Choice
              label="Wat heb je gehaald?"
              hint="De vloer halen telt. Je reeks loopt door; alleen de punten verschillen."
              opties={[
                { waarde: 'floor', label: 'De vloer' },
                { waarde: 'ceiling', label: 'Het plafond' },
              ]}
              waarde={niveau}
              onKies={setNiveau}
            />
          ) : null}

          <Field
            label="Wat heb je gedaan?"
            hint="Je buddy heeft iets nodig om op te reageren. Eén zin is genoeg."
            value={notitie}
            onChangeText={setNotitie}
            multiline
            numberOfLines={3}
          />

          {fout === null ? null : <Caption danger>{fout}</Caption>}

          <View style={styles.knoppen}>
            <Button variant="primair" busy={bezig} onPress={() => void afronden()}>
              Indienen
            </Button>
            <Button variant="stil" onPress={() => setOpen(false)}>
              Annuleren
            </Button>
          </View>
        </View>
      )}

      {afgerond || open ? null : <Button onPress={() => setOpen(true)}>Afronden</Button>}
    </Card>
  );
}

/**
 * De Dagzet — QS8-50.
 *
 * ⚠️ Domeinregel 9: standaard privé, nooit punten, nooit goedkeuring. Een dag
 *    overslaan heeft geen enkel gevolg — er staat dus ook geen teller, geen
 *    reeks en geen inhaalprikkel.
 */
function DagzetBlok({
  userId,
  localDate,
  zetten,
  onKlaar,
}: {
  readonly userId: string;
  readonly localDate: string | null;
  readonly zetten: readonly DagZet[];
  readonly onKlaar: () => void;
}) {
  const [tekst, setTekst] = useState('');
  const [delen, setDelen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    if (!localDate) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await zetDagzet(
      userId,
      { body: tekst, weekly_goal_id: null, visibility: delen ? 'group' : 'private' },
      localDate,
    );

    if (!uitkomst.ok) setFout(uitkomst.melding);
    else {
      setTekst('');
      onKlaar();
    }
    setBezig(false);
  }

  return (
    <Card nested>
      <Subheading>De Dagzet</Subheading>
      <Body muted>
        Eén regel over wat je vandaag gedaan hebt. Tien seconden, geen punten, niemand hoeft hem
        goed te keuren.
      </Body>

      <Field
        label="Vandaag"
        value={tekst}
        onChangeText={setTekst}
        placeholder="Twee uur aan hoofdstuk 3 gewerkt"
      />

      <Choice
        label="Zichtbaarheid"
        hint="Standaard alleen voor jezelf."
        opties={[
          { waarde: 'prive', label: 'Alleen ik' },
          { waarde: 'groep', label: 'Deel met mijn groep' },
        ]}
        waarde={delen ? 'groep' : 'prive'}
        onKies={(v) => setDelen(v === 'groep')}
      />

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button disabled={tekst.trim() === ''} busy={bezig} onPress={() => void bewaar()}>
        Vastleggen
      </Button>

      {zetten.length === 0 ? null : (
        <View style={styles.zetten}>
          {zetten.map((zet) => (
            <View key={zet.id} style={styles.zet}>
              <Caption>{zet.local_date}</Caption>
              <Body>{zet.body}</Body>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  afrond: { gap: space.blokGap - 3, paddingTop: space.blokGap - 4 },
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, alignItems: 'center' },
  zetten: { gap: space.blokGap - 4, paddingTop: space.blokGap - 4 },
  zet: { gap: 2 },
});
