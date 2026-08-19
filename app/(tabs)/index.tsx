import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession, userClock } from '@/modules/auth';
import {
  bewijseisVoorDoel,
  dienOpnieuwIn,
  fetchDagzetten,
  fetchVragen,
  rondAf,
  zetDagzet,
  type Bewijseis,
  type DagZet,
  type Vraag,
} from '@/modules/completions';
import {
  afsluitbareCyclus,
  fetchDoelen,
  fetchDoelStanden,
  fetchWeekdoelen,
  huidigeCyclus,
  inCoulanceperiode,
  type DoelStand,
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
  DoelStandKaart,
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
  const [standen, setStanden] = useState<ReadonlyMap<string, DoelStand>>(new Map());
  const [doeltitels, setDoeltitels] = useState<ReadonlyMap<string, string>>(new Map());
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

    // ⚠️ Vier verzoeken naast elkaar en niet achter elkaar, en geen enkele
    //    per doel: `fetchDoelStanden` haalt reeksen, punten en weekpassen op
    //    voor álle doelen tegelijk (schaalbaarheidsregel 12).
    Promise.all([
      fetchWeekdoelen(userId, afTeSluiten),
      fetchDagzetten(userId, cyclus),
      fetchDoelStanden(userId),
      fetchDoelen(userId),
    ])
      .then(([doelen, zetten, gevondenStanden, doelenPagina]) => {
        if (!levend) return;
        setWeekdoelen(doelen);
        setDagzetten(zetten);
        setStanden(gevondenStanden);
        setDoeltitels(new Map(doelenPagina.rijen.map((d) => [d.id, d.title])));
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

      <StandBlok
        standen={standen}
        titels={doeltitels}
        afgeslotenCyclus={afTeSluitenStart}
        loading={loading}
      />

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
 * Je stand: reeks, punten en weekpassen per doel — QS8-75 en QS8-81.
 *
 * ⚠️ **Alles hier is privé en dat is een domeinregel, geen voorkeur.** Punten
 *    zijn alleen voor de eigenaar (domeinregel 10) omdat een dalend totaal
 *    zichtbaar bewijs is van een gemiste week, en een verbruikte weekpas is dat
 *    net zo goed. Dit blok hoort daarom op dít scherm en op geen enkel
 *    groepsscherm. Kopieer het niet naar `groep/[id]`.
 *
 * ⚠️ Rendert niets zolang er geen enkel doel is. Een leeg kader met "0 punten"
 *    is de eerste indruk van iemand die net begint, en dat is precies de
 *    verkeerde: er is nog niets gemist, er is nog niets te tellen.
 */
function StandBlok({
  standen,
  titels,
  afgeslotenCyclus,
  loading,
}: {
  readonly standen: ReadonlyMap<string, DoelStand>;
  readonly titels: ReadonlyMap<string, string>;
  readonly afgeslotenCyclus: string | null;
  readonly loading: boolean;
}) {
  // ⚠️ Alleen doelen waarvan we de titel kennen. Een stand zonder titel is een
  //    gearchiveerd of net verwijderd doel; die hoort niet op het dashboard van
  //    vandaag, en "Onbekend doel" is geen tekst die iemand vertrouwen geeft.
  const rijen = [...standen.values()]
    .map((stand) => ({ stand, titel: titels.get(stand.goalId) }))
    .filter((r): r is { stand: DoelStand; titel: string } => r.titel !== undefined)
    .sort((a, b) => a.titel.localeCompare(b.titel, 'nl'));

  if (loading || rijen.length === 0) return null;

  return (
    <Card nested>
      <Subheading>Je stand</Subheading>
      <Body muted>
        Je reeks telt weken, geen dagen. Een week telt zodra je vloer gehaald is.
      </Body>

      <View style={styles.standen}>
        {rijen.map(({ stand, titel }) => (
          <DoelStandKaart
            key={stand.goalId}
            titel={titel}
            huidigeReeks={stand.huidigeReeks}
            besteReeks={stand.besteReeks}
            punten={stand.punten}
            weekpas={stand.weekpas}
            afgeslotenCyclus={afgeslotenCyclus}
          />
        ))}
      </View>
    </Card>
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
  const [eis, setEis] = useState<Bewijseis>('note_required');
  const [vragen, setVragen] = useState<readonly Vraag[]>([]);

  const heeftVloer = Boolean(weekdoel.floor_text);
  const afgerond = weekdoel.status !== 'todo';
  const wachtOpOordeel = weekdoel.status === 'pending';

  // ⚠️ De bewijseis komt uit de groep en niet uit een constante. Hij is hier
  //    alleen bedoeld om vooraf de juiste zin te tonen; afdwingen doet de
  //    trigger `enforce_evidence_policy` (migratie 0021).
  useEffect(() => {
    let levend = true;

    bewijseisVoorDoel(weekdoel.goal_id)
      .then((gevonden) => {
        if (levend) setEis(gevonden);
      })
      .catch(() => {
        if (levend) setEis('note_required');
      });

    return () => {
      levend = false;
    };
  }, [weekdoel.goal_id]);

  // De vragen die buddy's gesteld hebben — zonder dit is "vertel me meer" een
  // dood spoor en denkt de beoordelaar dat hij iets gedaan heeft.
  useEffect(() => {
    if (!wachtOpOordeel) return;
    let levend = true;

    fetchVragen(weekdoel.id)
      .then((gevonden) => {
        if (levend) setVragen(gevonden);
      })
      .catch(() => {
        if (levend) setVragen([]);
      });

    return () => {
      levend = false;
    };
  }, [weekdoel.id, wachtOpOordeel]);

  async function afronden() {
    setBezig(true);
    setFout(null);

    const niveauKeuze = heeftVloer ? niveau : 'ceiling';

    // ⚠️ Opnieuw indienen loopt via een RPC: `completions` is append-only en
    //    heeft geen UPDATE-policy, dus de client kan `superseded_by` niet zelf
    //    zetten (domeinregel 6).
    const uitkomst = wachtOpOordeel
      ? await dienOpnieuwIn(weekdoel.id, niveauKeuze, notitie)
      : await rondAf(weekdoel.id, userId, { achieved_level: niveauKeuze, note: notitie }, eis);

    if (!uitkomst.ok) setFout(uitkomst.melding);
    else {
      setOpen(false);
      setNotitie('');
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

      {/*
        ⚠️ Een vraag van een buddy is geen afkeuring en de kaart zegt dat ook
           niet. "Vertel me meer" is een gelijkwaardige actie naast goedkeuren
           (6.2); de meeste onduidelijkheid is gewoon onduidelijkheid.
      */}
      {vragen.length === 0 ? null : (
        <Card nested>
          <Subheading>Je buddy heeft een vraag</Subheading>
          {vragen.map((v) => (
            <Body key={v.id} muted>
              &ldquo;{v.comment}&rdquo;
            </Body>
          ))}
          {open ? null : (
            <Button onPress={() => setOpen(true)}>Antwoorden en opnieuw indienen</Button>
          )}
        </Card>
      )}

      {(afgerond && !wachtOpOordeel) || !open ? null : (
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
            hint={
              eis === 'optional'
                ? 'Mag leeg blijven in deze groep. Eén zin geeft je buddy wel iets om op te reageren.'
                : 'Je groep vraagt hierom. Eén zin is genoeg.'
            }
            value={notitie}
            onChangeText={setNotitie}
            multiline
            numberOfLines={3}
          />

          {fout === null ? null : <Caption danger>{fout}</Caption>}

          <View style={styles.knoppen}>
            <Button variant="primair" busy={bezig} onPress={() => void afronden()}>
              {wachtOpOordeel ? 'Opnieuw indienen' : 'Indienen'}
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
  standen: { gap: space.blokGap + 3 },
  afrond: { gap: space.blokGap - 3, paddingTop: space.blokGap - 4 },
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, alignItems: 'center' },
  zetten: { gap: space.blokGap - 4, paddingTop: space.blokGap - 4 },
  zet: { gap: 2 },
});
