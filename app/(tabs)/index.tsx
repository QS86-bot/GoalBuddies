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
  eersteCyclusVanDoel,
  fetchDoelen,
  fetchDoelStanden,
  fetchDoorschuifbaar,
  fetchWeekdoelen,
  huidigeCyclus,
  inCoulanceperiode,
  schuifDoor,
  sluitWeekdoelAf,
  verwijderWeekdoel,
  zojuistAfgeslotenCyclus,
  type DoelStand,
  type Weekdoel,
} from '@/modules/goals';
import { space } from '@/shared/theme';
import { localDateIn, now, type UserClock } from '@/shared/time';
import {
  AsyncView,
  BEVESTIGING,
  Bevestiging,
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
  weekdoelActies,
  WEEKPAS_UITLEG,
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
  const [openstaand, setOpenstaand] = useState<readonly Weekdoel[]>([]);
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

  // ⚠️ De week die de rollover zojuist dichtzette, en dus níét `afTeSluiten`.
  //    Die twee zijn per definitie verschillend — zie `zojuistAfgeslotenCyclus`.
  const geslotenStart = klok ? zojuistAfgeslotenCyclus(klok).startDate : null;

  useEffect(() => {
    if (!userId || !afTeSluiten || !cyclus) return;
    let levend = true;

    // ⚠️ Het stand-blok hangt hier bewust níét in. Het is een blok onderaan het
    //    scherm, en een storing daarin hoort de weekdoelenlijst erboven niet mee
    //    te slepen: met alles in één `Promise.all` kreeg iemand met een slechte
    //    verbinding "Je weekpassen konden niet geladen worden" te zien in plaats
    //    van zijn week, terwijl die week gewoon binnen was. Bevinding van de
    //    gebruikersreview op QS8-75.
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

    // ⚠️ `afTeSluiten` en `cyclus` staan hier bewust NIET in, en dat is geen
    //    slordigheid maar de hele reden dat `afTeSluitenStart` en `cyclusStart`
    //    bestaan. `huidigeCyclus()` en `afsluitbareCyclus()` geven elke render
    //    een vers object terug, dus als afhankelijkheid zijn ze altijd
    //    "veranderd": ophalen → `setWeekdoelen` → render → nieuwe objecten →
    //    ophalen. Een oneindige lus die je aan het scherm niet ziet, want de
    //    gegevens zijn elke ronde hetzelfde en `loading` staat al uit — je ziet
    //    het alleen aan je Supabase-verbruik. De comment hierboven zei dit al en
    //    de lijst deed het tegenovergestelde. Gevonden door de code-review op
    //    QS8-75.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, afTeSluitenStart, cyclusStart, ronde]);

  // Het stand-blok laadt apart en faalt apart: lukt het niet, dan blijft het
  // blok gewoon weg en houdt de rest van het scherm zijn gegevens.
  useEffect(() => {
    if (!userId) return;
    let levend = true;

    Promise.all([fetchDoelStanden(userId), fetchDoelen(userId)])
      .then(([gevondenStanden, doelenPagina]) => {
        if (!levend) return;
        setStanden(gevondenStanden);
        setDoeltitels(new Map(doelenPagina.rijen.map((d) => [d.id, d.title])));
      })
      .catch(() => {
        // Bewust stil op het scherm, maar niet stil in de logboeken: de
        // datalaag heeft de fout al via `reportError` gemeld. Hier zou een
        // tweede foutmelding alleen maar over de weekdoelen heen vallen.
        if (levend) {
          setStanden(new Map());
          setDoeltitels(new Map());
        }
      });

    return () => {
      levend = false;
    };
  }, [userId, ronde]);

  // Gemiste weken uit eerdere cycli. Apart opgehaald en apart falend, om
  // dezelfde reden als het stand-blok: dit is een blok onder de lijst, en een
  // storing hier hoort je week van vandaag niet mee te slepen.
  //
  // ⚠️ `klok` staat hier niet in de afhankelijkheden en `cyclusStart` wel, om
  //    dezelfde reden als hierboven: `userClock(profiel)` geeft elke render een
  //    vers object en zou dus een oneindige lus opleveren.
  useEffect(() => {
    if (!userId || !klok) return;
    let levend = true;

    fetchDoorschuifbaar(userId, klok)
      .then((gevonden) => {
        if (levend) setOpenstaand(gevonden);
      })
      .catch(() => {
        if (levend) setOpenstaand([]);
      });

    return () => {
      levend = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cyclusStart, ronde]);

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
            'reeks loopt door. Je maakt hem aan op het doel waar hij bij hoort.',
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

      {/*
        ⚠️ Deze knop stuurde je naar de doelenlijst en daar hield het op: er was
           geen formulier, dus de route liep dood (QS8-112). Het formulier staat
           nu op het doelscherm, want een weekdoel hangt altijd aan een doel. De
           bijschrift zegt dat, anders is twee keer tikken zonder uitleg.
      */}
      <View style={styles.toevoegen}>
        <Button variant="primair" block onPress={() => router.push('/doelen')}>
          Weekdoel toevoegen
        </Button>
        <Caption>Je maakt een weekdoel aan op het doel waar hij bij hoort.</Caption>
      </View>

      <OpenstaandBlok weekdoelen={openstaand} klok={klok} onKlaar={herlaad} />

      <StandBlok
        standen={standen}
        titels={doeltitels}
        afgeslotenCyclus={geslotenStart}
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

  // ⚠️ Dag één is een eigen geval, en het pijnlijke geval is niet "nul doelen"
  //    maar "het eerste doel". Zonder deze tak krijgt iemand die net begonnen is
  //    vier keer nul te lezen ("Nog geen reeks", "Punten 0", "Nog geen weekpas")
  //    plus een uitleg over gemiste weken en minpunten — voordat hij één week
  //    gedaan heeft. Dat is geen stand maar een waarschuwing vooraf.
  const nogNietsTeTellen = rijen.every(
    ({ stand }) =>
      stand.huidigeReeks === 0 &&
      stand.besteReeks === 0 &&
      stand.punten === 0 &&
      (stand.weekpas?.voltooideCycli ?? 0) === 0,
  );

  if (nogNietsTeTellen) {
    return (
      <Card nested>
        <Subheading>Je stand</Subheading>
        <Body muted>
          Zodra je eerste week is goedgekeurd, staan je reeks en je punten hier.
        </Body>
      </Card>
    );
  }

  return (
    <Card nested>
      <Subheading>Je stand</Subheading>
      {/*
        ⚠️ Niet meer "een week telt zodra je vloer gehaald is". Dat gebruikt
           "vloer" als bekend woord, en het klopte bovendien niet voor een
           weekdoel zónder vloer — daar telt gewoon het plafond.
      */}
      <Body muted>Je reeks telt weken, geen dagen.</Body>

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

      {/*
        ⚠️ Eén keer onderaan, en niet bij elk doel. Bij vijf doelen stond deze
           tekst vijf keer onder elkaar en dan leest niemand hem meer — ook niet
           de ene keer dat het uitmaakt.
      */}
      {rijen.some(({ stand }) => stand.weekpas !== null) ? (
        <Caption>{WEEKPAS_UITLEG}</Caption>
      ) : null}
    </Card>
  );
}

/**
 * Weken die je gemist hebt en nog kunt meenemen — QS8-47, QS8-106.
 *
 * ⚠️ **Alleen voor jezelf.** Dit blok is een lijst gemiste weken, en dat is
 *    precies het gegeven dat migratie 0019 en 0020 voor groepsgenoten hebben
 *    dichtgezet. Het hoort op dit scherm en op geen enkel groepsscherm — zelfde
 *    waarschuwing als bij `StandBlok` hierboven.
 *
 * ⚠️ Rendert niets als er niets openstaat. Een leeg kader "geen gemiste weken"
 *    is een herinnering aan een probleem dat je niet hebt, en dat is precies de
 *    toon die domeinregel 7 uit de app wil houden — ook in je eigen scherm.
 */
function OpenstaandBlok({
  weekdoelen,
  klok,
  onKlaar,
}: {
  readonly weekdoelen: readonly Weekdoel[];
  readonly klok: UserClock | null;
  readonly onKlaar: () => void;
}) {
  if (weekdoelen.length === 0 || klok === null) return null;

  return (
    <Card nested>
      <Subheading>Nog open van eerdere weken</Subheading>
      {/*
        ⚠️ De tekst zegt wat doorschuiven wél en níét doet. Vóór migratie 0045
           repareerde doorschuiven je reeks, en wie dat nog denkt, komt bedrogen
           uit op een moment dat hij het niet controleert (Q-TODO A39).
      */}
      <Body muted>
        Je kunt deze meenemen naar de week die nu loopt. De week zelf blijft
        gemist — meenemen verhuist het werk, het herstelt je reeks niet.
      </Body>

      <View style={styles.lijst}>
        {weekdoelen.map((weekdoel) => (
          <DoorschuifKaart key={weekdoel.id} weekdoel={weekdoel} klok={klok} onKlaar={onKlaar} />
        ))}
      </View>
    </Card>
  );
}

function DoorschuifKaart({
  weekdoel,
  klok,
  onKlaar,
}: {
  readonly weekdoel: Weekdoel;
  readonly klok: UserClock;
  readonly onKlaar: () => void;
}) {
  const [vraagt, setVraagt] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function doorschuiven() {
    setBezig(true);
    setFout(null);

    // ⚠️ De eerste cyclus van het doel bepaalt `cycle_index` van de nieuwe rij.
    //    Zonder deze opzoeking wordt elke doorgeschoven week "week 1" van dat
    //    doel, en dan telt de weekteller in het doeloverzicht niet meer mee.
    const eerste = await eersteCyclusVanDoel(weekdoel.goal_id, klok);

    // ⚠️ `schuifDoor()` doet twee dingen die niet in één transactie zitten:
    //    `markeer_doorgeschoven()` zet de oude rij op `carried`, en daarna maakt
    //    hij de nieuwe week aan. Valt de verbinding daartussen weg, dan staat de
    //    oude week op `carried` zonder opvolger — en hij verdwijnt uit dit blok,
    //    want `fetchDoorschuifbaar()` haalt alleen `missed` op. Dat is geen
    //    verlies (de week telde al als gemist en het punt is geboekt) maar het
    //    weekdoel is dan wel weg zonder dat iemand het aanmaakte. Samenvoegen tot
    //    één RPC hoort bij het datamodel en niet bij dit scherm; het staat als
    //    aandachtspunt in ENGINEER-REVIEW.
    const uitkomst = await schuifDoor(weekdoel, klok, eerste);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setVraagt(false);
    onKlaar();
  }

  if (vraagt) {
    return (
      <Bevestiging
        tekst={BEVESTIGING.weekdoelDoorschuiven}
        bezig={bezig}
        fout={fout}
        onBevestig={() => void doorschuiven()}
        onAnnuleer={() => {
          setVraagt(false);
          setFout(null);
        }}
      />
    );
  }

  return (
    <Card flat>
      <View style={styles.kop}>
        <Body>{weekdoel.title}</Body>
        <Caption>Week van {weekdoel.cycle_start_date}</Caption>
      </View>

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button onPress={() => setVraagt(true)}>Meenemen naar deze week</Button>
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
  const [vraagt, setVraagt] = useState<'afsluiten' | 'verwijderen' | null>(null);

  const heeftVloer = Boolean(weekdoel.floor_text);
  const afgerond = weekdoel.status !== 'todo';
  const wachtOpOordeel = weekdoel.status === 'pending';

  // Wat dit weekdoel op grond van zijn status mag. Staat in `shared/ui/acties`
  // zodat het niet in elk scherm opnieuw bedacht wordt, en zodat er een test op
  // kan staan zonder renderer.
  const acties = weekdoelActies(weekdoel.status as WeeklyGoalStatus);

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

  /**
   * Afsluiten en verwijderen lopen door dezelfde functie, want ze verschillen
   * alleen in welke RPC eronder zit.
   *
   * ⚠️ Bij een mislukking blijft het bevestigingsblok staan met de melding
   *    erin, en dat is met opzet. De reden `te_oud` zegt letterlijk "sluit hem
   *    af in plaats van te verwijderen"; die tekst wegklikken zou de gebruiker
   *    laten raden waarom er niets gebeurde.
   */
  async function voerUit(wat: 'afsluiten' | 'verwijderen') {
    setBezig(true);
    setFout(null);

    const uitkomst =
      wat === 'afsluiten'
        ? await sluitWeekdoelAf(weekdoel.id)
        : await verwijderWeekdoel(weekdoel.id);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setVraagt(null);
    onKlaar();
  }

  // Het bevestigingsblok vervangt de kaart zolang het openstaat: twee schermen
  // met knoppen tegelijk maakt onduidelijk waar de vraag over gaat.
  if (vraagt !== null) {
    return (
      <Bevestiging
        tekst={
          vraagt === 'afsluiten'
            ? BEVESTIGING.weekdoelAfsluiten
            : BEVESTIGING.weekdoelVerwijderen
        }
        bezig={bezig}
        fout={fout}
        onBevestig={() => void voerUit(vraagt)}
        onAnnuleer={() => {
          setVraagt(null);
          setFout(null);
        }}
      />
    );
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

      {/*
        ⚠️ Afronden staat als eerste en de rest ernaast in stille knoppen. Deze
           drie zijn geen gelijkwaardige keuzes: afronden is wat je wilt,
           afsluiten is wat je soms moet, en weggooien is voor een vergissing.
           Ze even zwaar maken zou de uitweg net zo aantrekkelijk maken als de
           week zelf.
      */}
      {open || !(acties.afronden || acties.afsluiten || acties.verwijderen) ? null : (
        <View style={styles.knoppen}>
          {/*
            Staat er een vraag van een buddy, dan zit de knop om opnieuw in te
            dienen al in dat blok hierboven en met een beter label. Twee knoppen
            die hetzelfde doen laten de gebruiker zoeken naar het verschil.
          */}
          {acties.afronden && vragen.length === 0 ? (
            <Button onPress={() => setOpen(true)}>
              {wachtOpOordeel ? 'Opnieuw indienen' : 'Afronden'}
            </Button>
          ) : null}

          {acties.afsluiten ? (
            <Button variant="stil" onPress={() => setVraagt('afsluiten')}>
              Deze week afsluiten
            </Button>
          ) : null}

          {acties.verwijderen ? (
            <Button
              variant="stil"
              onPress={() => setVraagt('verwijderen')}
              accessibilityLabel={`Weekdoel ${weekdoel.title} weggooien`}
            >
              Weggooien
            </Button>
          ) : null}
        </View>
      )}
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
  kop: { gap: 2 },
  toevoegen: { gap: space.blokGap - 5 },
  // `wrap` omdat er nu drie knoppen naast elkaar kunnen staan; op een smalle
  // telefoon vallen ze anders buiten beeld in plaats van door te lopen.
  knoppen: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.blokGap - 3,
    alignItems: 'center',
  },
  zetten: { gap: space.blokGap - 4, paddingTop: space.blokGap - 4 },
  zet: { gap: 2 },
});
