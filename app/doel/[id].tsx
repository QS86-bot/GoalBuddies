import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession, userClock } from '@/modules/auth';
import { fetchGroepenVanDoel, fetchMijnGroepen, type Groep } from '@/modules/buddies';
import { fetchCommitments, trekIn, zetBeloning, zetStraf, type Commitment } from '@/modules/commitments';
import {
  ARGUMENT_MAX,
  ARGUMENT_MIN,
  CATEGORIE_LABELS,
  eersteCyclusVanDoel,
  fetchDoel,
  fetchLaatsteBesluit,
  fetchMijlpalen,
  fetchOpenVerzoek,
  maakWeekdoel,
  trekDeadlineVerzoekIn,
  verwijderDoel,
  vraagDeadlineVerschuiving,
  zetArchief,
  zetStreefdatum,
  type Categorie,
  type DeadlineVerzoek,
  type DoelMetVoortgang,
  type Mijlpaal,
} from '@/modules/goals';
import { space } from '@/shared/theme';
import { localDateIn, now, type IsoDate, type UserClock } from '@/shared/time';
import {
  AsyncView,
  BEVESTIGING,
  Bevestiging,
  Body,
  Button,
  Caption,
  Card,
  Choice,
  Field,
  MilestoneProgress,
  Screen,
  Subheading,
} from '@/shared/ui';

/**
 * ⚠️ De waarde die "geen mijlpaal" betekent in de keuzelijst. Een lege string
 *    zou hier niet werken: `Choice` gebruikt de waarde als sleutel, en leeg is
 *    niet te onderscheiden van "nog niets gekozen".
 */
const LOS_VAN_MIJLPAAL = 'los';

/**
 * Eén doel: voortgang, deadline verzetten, archiveren, beloning en straf.
 *
 * ⚠️ De id in de URL geeft geen toegang. Wie hier komt zonder recht op dit doel,
 *    krijgt van de database nul rijen — RLS bepaalt dat, niet dit scherm. "Niet
 *    gevonden" en "mag je niet zien" tonen daarom hetzelfde: het verschil
 *    verraadt dat het doel bestaat.
 */
export default function DoelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const [doel, setDoel] = useState<DoelMetVoortgang | null>(null);
  const [commitments, setCommitments] = useState<readonly Commitment[]>([]);
  const [groepen, setGroepen] = useState<readonly Groep[]>([]);
  const [doelGroepen, setDoelGroepen] = useState<
    readonly { readonly group_id: string; readonly name: string }[]
  >([]);
  const [verzoek, setVerzoek] = useState<DeadlineVerzoek | null>(null);
  const [besluit, setBesluit] = useState<DeadlineVerzoek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    if (!id) return;
    let levend = true;

    Promise.all([
      fetchDoel(id),
      fetchCommitments(id),
      fetchMijnGroepen(),
      fetchGroepenVanDoel(id),
      fetchOpenVerzoek(id),
      fetchLaatsteBesluit(id),
    ])
      .then(([gevonden, vastgelegd, mijnGroepen, gekoppeld, lopend, laatste]) => {
        if (!levend) return;
        setDoel(gevonden);
        setCommitments(vastgelegd);
        setGroepen(mijnGroepen);
        setDoelGroepen(gekoppeld);
        setVerzoek(lopend);
        setBesluit(laatste);
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
  }, [id, ronde]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);
  const vandaag = profiel ? localDateIn(profiel.tz, now()) : null;
  const klok = profiel ? userClock(profiel) : null;

  return (
    <Screen title="Doel">
      <AsyncView
        loading={loading}
        error={error}
        data={doel ?? undefined}
        isEmpty={() => false}
        onRetry={herlaad}
        empty={{
          title: 'Dit doel bestaat niet',
          body: 'Of het is verwijderd, of het is niet van jou. Controleer de link.',
        }}
      >
        {(d) => (
          <View style={styles.blokken}>
            <Card>
              <Subheading>{d.title}</Subheading>
              <Caption>
                {CATEGORIE_LABELS[(d.category ?? 'other') as Categorie]} · streefdatum{' '}
                {d.target_date}
              </Caption>

              {d.identity_statement ? (
                <Body muted>&ldquo;{d.identity_statement}&rdquo;</Body>
              ) : null}
              {d.description ? <Body muted>{d.description}</Body> : null}

              <MilestoneProgress
                done={d.milestones_done ?? 0}
                total={d.milestones_total ?? 0}
              />
              <Caption>
                {d.weekly_approved ?? 0} van {d.weekly_total ?? 0} weekdoelen afgerond
              </Caption>
            </Card>

            {vandaag ? (
              <DeadlineVerzetten
                doel={d}
                vandaag={vandaag}
                groepen={doelGroepen}
                verzoek={verzoek}
                besluit={besluit}
                onKlaar={herlaad}
              />
            ) : null}

            <WeekdoelToevoegen doel={d} klok={klok} onKlaar={herlaad} />

            <Beloning
              goalId={d.id}
              bestaand={commitments.find((c) => c.type === 'reward')}
              onKlaar={herlaad}
            />

            <Straf
              goalId={d.id}
              groepen={groepen}
              bestaand={commitments.find((c) => c.type === 'penalty')}
              onKlaar={herlaad}
            />

            {userId ? <Archiveren doel={d} userId={userId} onKlaar={herlaad} /> : null}

            {/*
              Na het weggooien bestaat dit scherm niet meer — herladen zou een
              "niet gevonden" opleveren op een doel dat je zelf net hebt
              weggegooid. Terug naar de lijst is het enige zinnige vervolg.
            */}
            <Weggooien doel={d} onWeg={() => router.replace('/doelen')} />
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

/**
 * De deadline verzetten — QS8-32, en sinds Q-TODO A7 met twee routes.
 *
 * ⚠️ Deel je dit doel met een groep, dan verschuif je de datum niet alleen. Je
 *    dient een verzoek in met een argument, en een ander lid beslist. Deel je
 *    het met niemand, dan is er niemand om iets aan te vragen en zet je hem
 *    gewoon.
 *
 *    Het onderscheid wordt niet hier gemaakt maar in de database: `target_date`
 *    is sinds migratie 0032 niet meer client-schrijfbaar, en `zet_streefdatum()`
 *    weigert zodra het doel aan een groep hangt. Dit scherm kiest alleen welk
 *    formulier je ziet.
 *
 * ⚠️ Loopt er al een verzoek, dan staat dat er en kun je geen tweede indienen.
 *    Tien verzoeken openzetten tot er eentje langskomt die ja zegt, is het
 *    tegenovergestelde van een argument indienen; er staat ook een unieke index
 *    op.
 */
function DeadlineVerzetten({
  doel,
  vandaag,
  groepen,
  verzoek,
  besluit,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly vandaag: IsoDate;
  readonly groepen: readonly { readonly group_id: string; readonly name: string }[];
  readonly verzoek: DeadlineVerzoek | null;
  readonly besluit: DeadlineVerzoek | null;
  readonly onKlaar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [datum, setDatum] = useState(doel.target_date ?? '');
  const [argument, setArgument] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const gedeeld = groepen.length > 0;
  const groep = groepen[0];

  async function trekIn() {
    if (verzoek === null) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await trekDeadlineVerzoekIn(verzoek.id);
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    onKlaar();
  }

  async function bewaar() {
    setBezig(true);
    setFout(null);

    const uitkomst = gedeeld
      ? await vraagDeadlineVerschuiving(
          doel.id,
          groep?.group_id ?? '',
          { new_date: datum, reason: argument },
          vandaag,
        )
      : await zetStreefdatum(doel.id, datum, vandaag);

    if (!uitkomst.ok) setFout(uitkomst.melding);
    else {
      setOpen(false);
      setArgument('');
      onKlaar();
    }
    setBezig(false);
  }

  // ⚠️ Een lopend verzoek is geen wachtkamer maar een stand van zaken: je ziet
  //    wat je gevraagd hebt en wat je erbij geschreven hebt. Zonder dit is
  //    "verzonden" het laatste wat je hoort.
  //
  // ⚠️ Mét een knop om het in te trekken. Zonder die knop is een buddy die niet
  //    reageert een blokkade zonder uitweg: er kan geen tweede verzoek open
  //    staan, dus je streefdatum ligt vast tot iemand toevallig kijkt.
  if (verzoek !== null) {
    return (
      <Card nested>
        <Subheading>Je verzoek loopt</Subheading>
        <Body>
          Je vroeg om {verzoek.old_date} te verzetten naar {verzoek.new_date}.
        </Body>
        <Card nested>
          <Body muted>&ldquo;{verzoek.reason}&rdquo;</Body>
        </Card>
        <Caption>
          Een van je buddy&rsquo;s beslist hierover. Zolang dat niet gebeurd is, blijft de
          datum staan zoals hij was.
        </Caption>
        <Button variant="stil" busy={bezig} onPress={() => void trekIn()}>
          Verzoek intrekken
        </Button>
        {fout === null ? null : <Caption danger>{fout}</Caption>}
      </Card>
    );
  }

  if (!open) {
    return (
      <Card nested>
        <Subheading>Deadline</Subheading>

        {/*
          ⚠️ Een afgewezen verzoek moet je te zien krijgen. Zonder dit verdwijnt
             het gewoon van je scherm zodra iemand "Liever niet" kiest, staat er
             weer een leeg formulier alsof je nooit iets gevraagd hebt, en typ je
             het een tweede keer zonder te weten dat er al nee gezegd is.

             Dit staat uitsluitend op je eigen doelscherm. Een lijst met
             afgewezen verzoeken vóór de groep zou precies het tegenslagsignaal
             over een ander zijn dat domeinregel 7 verbiedt.
        */}
        {besluit === null ? null : (
          <Card nested>
            <Body>
              {besluit.status === 'approved'
                ? `Je buddy ging akkoord: de datum staat nu op ${besluit.new_date}.`
                : 'Je buddy vond het nog te vroeg om te verzetten. De datum is niet veranderd.'}
            </Body>
            {besluit.decision_note === null ? null : (
              <Body muted>&ldquo;{besluit.decision_note}&rdquo;</Body>
            )}
            {besluit.status === 'rejected' ? (
              <Caption>Je kunt het opnieuw vragen als er iets veranderd is.</Caption>
            ) : null}
          </Card>
        )}

        <Body muted>
          {gedeeld
            ? 'Je deelt dit doel met je groep, dus de datum verzet je samen. Schrijf ' +
              'erbij wat er veranderd is; een buddy beslist erover.'
            : 'Verzetten mag. Het wordt wel bijgehouden, zodat je later eerlijk kunt terugkijken.'}
        </Body>
        <Button onPress={() => setOpen(true)}>
          {gedeeld ? 'Vraag om te verzetten' : 'Deadline verzetten'}
        </Button>
      </Card>
    );
  }

  return (
    <Card nested>
      <Subheading>Nieuwe streefdatum</Subheading>
      <Field label="Datum" value={datum} onChangeText={setDatum} placeholder="2027-03-01" />

      {gedeeld ? (
        <>
          {/*
            ⚠️ "Wat is er veranderd" en niet "waarom haal je het niet". De vraag
               gaat over de omstandigheid en niet over de persoon — dezelfde
               toon als vraag 2 van de weekafsluiting, en om dezelfde reden.
          */}
          <Field
            label="Wat is er veranderd?"
            hint={`Je buddy's in ${groep?.name ?? 'je groep'} lezen dit en beslissen erop. Eén eerlijke zin is genoeg.`}
            value={argument}
            onChangeText={setArgument}
            multiline
            maxLength={ARGUMENT_MAX}
            placeholder="Het project op mijn werk is met zes weken uitgelopen en dat eet mijn avonden op."
          />
          <Caption>
            {argument.trim().length < ARGUMENT_MIN
              ? `Nog ${ARGUMENT_MIN - argument.trim().length} tekens te gaan.`
              : 'Lang genoeg.'}
          </Caption>
        </>
      ) : null}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <View style={styles.knoppen}>
        <Button variant="primair" busy={bezig} onPress={() => void bewaar()}>
          {gedeeld ? 'Verzoek versturen' : 'Vastleggen'}
        </Button>
        <Button variant="stil" onPress={() => setOpen(false)}>
          Annuleren
        </Button>
      </View>
    </Card>
  );
}

/** De beloning — QS8-34. Voor jezelf, dus geen groep en geen bevestigingsstap. */
function Beloning({
  goalId,
  bestaand,
  onKlaar,
}: {
  readonly goalId: string;
  readonly bestaand: Commitment | undefined;
  readonly onKlaar: () => void;
}) {
  const [tekst, setTekst] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  if (bestaand) {
    return (
      <Card>
        <Subheading>Je beloning</Subheading>
        <Body>{bestaand.body}</Body>
        <Caption>
          Komt vrij als je dit doel haalt. Vastgelegd op {bestaand.confirmed_at.slice(0, 10)}.
        </Caption>
      </Card>
    );
  }

  async function bewaar() {
    setBezig(true);
    setFout(null);
    const uitkomst = await zetBeloning(goalId, { body: tekst, image_url: null });
    if (!uitkomst.ok) setFout(uitkomst.melding);
    else onKlaar();
    setBezig(false);
  }

  return (
    <Card>
      <Subheading>Beloning</Subheading>
      <Body muted>Wat gun je jezelf als dit lukt? Optioneel, maar het werkt.</Body>
      <Field
        label="Mijn beloning"
        value={tekst}
        onChangeText={setTekst}
        placeholder="Een weekend weg zonder laptop"
      />
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <Button busy={bezig} onPress={() => void bewaar()}>
        Vastleggen
      </Button>
    </Card>
  );
}

/**
 * De straf — QS8-35.
 *
 * ⚠️ Domeinregel 5: nooit stilzwijgend geactiveerd. Er zit daarom een aparte
 *    bevestigingsstap tussen, waarin de consequentie letterlijk uitgeschreven
 *    staat. Eén knop die meteen vastlegt zou de regel technisch halen en
 *    inhoudelijk breken.
 *
 * ⚠️ De keuzelijst toont alleen groepen waar je lid van bent. Dat is
 *    gebruiksgemak — de echte grens ligt in `commitments_insert` (migratie 0006).
 */
function Straf({
  goalId,
  groepen,
  bestaand,
  onKlaar,
}: {
  readonly goalId: string;
  readonly groepen: readonly Groep[];
  readonly bestaand: Commitment | undefined;
  readonly onKlaar: () => void;
}) {
  const [tekst, setTekst] = useState('');
  const [groepId, setGroepId] = useState(groepen[0]?.id ?? '');
  const [bevestigen, setBevestigen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  if (bestaand) {
    return (
      <Card>
        <Subheading>Je straf</Subheading>
        <Body>{bestaand.body}</Body>
        <Caption>
          Wordt verschuldigd als de streefdatum verstrijkt zonder dat het doel af is. Een gemiste
          week doet hier niets — die kost een minpunt, meer niet.
        </Caption>
        <Button
          variant="stil"
          onPress={() => {
            void trekIn(bestaand.id).then(onKlaar);
          }}
        >
          Intrekken
        </Button>
      </Card>
    );
  }

  if (groepen.length === 0) {
    return (
      <Card nested>
        <Subheading>Straf</Subheading>
        <Body muted>
          Een straf gaat naar een van je groepen. Je zit nog nergens in, dus dit kan pas als je een
          buddy-groep hebt.
        </Body>
      </Card>
    );
  }

  const gekozenGroep = groepen.find((g) => g.id === groepId);

  async function bewaar() {
    setBezig(true);
    setFout(null);
    const uitkomst = await zetStraf(goalId, { body: tekst, image_url: null }, groepId);
    if (!uitkomst.ok) setFout(uitkomst.melding);
    else {
      setBevestigen(false);
      onKlaar();
    }
    setBezig(false);
  }

  if (bevestigen) {
    return (
      <Card>
        <Subheading>Weet je het zeker?</Subheading>
        <Body>
          Als <Body>{gekozenGroep?.name ?? 'je groep'}</Body> dit te zien krijgt, is dat omdat je
          streefdatum verstreken is zonder dat je doel af was.
        </Body>
        <Body muted>Dan geldt: {tekst}</Body>
        <Caption>
          Tot dat moment ziet niemand dit — ook je groep niet. Intrekken kan zolang het niet in
          werking is getreden.
        </Caption>
        {fout === null ? null : <Caption danger>{fout}</Caption>}
        <View style={styles.knoppen}>
          <Button variant="primair" busy={bezig} onPress={() => void bewaar()}>
            Ja, leg dit vast
          </Button>
          <Button variant="stil" onPress={() => setBevestigen(false)}>
            Terug
          </Button>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <Subheading>Straf</Subheading>
      <Body muted>
        Wat gebeurt er als je je streefdatum niet haalt? Optioneel, en je kunt hem intrekken zolang
        hij niet in werking is.
      </Body>

      <Field
        label="Mijn straf"
        value={tekst}
        onChangeText={setTekst}
        placeholder="Ik trakteer de groep op een etentje"
      />

      <Choice
        label="Welke groep profiteert?"
        opties={groepen.map((g) => ({ waarde: g.id, label: g.name }))}
        waarde={groepId}
        onKies={setGroepId}
      />

      <Button disabled={tekst.trim().length < 3} onPress={() => setBevestigen(true)}>
        Verder
      </Button>
    </Card>
  );
}

/** Archiveren — QS8-32. Omkeerbaar, en dat verschil moet zichtbaar zijn. */
function Archiveren({
  doel,
  userId,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly userId: string;
  readonly onKlaar: () => void;
}) {
  const [bezig, setBezig] = useState(false);
  const gearchiveerd = doel.status === 'archived';

  async function schakel() {
    setBezig(true);
    await zetArchief(doel.id, userId, !gearchiveerd);
    setBezig(false);
    onKlaar();
  }

  return (
    <Card nested>
      <Subheading>{gearchiveerd ? 'Uit het archief halen' : 'Archiveren'}</Subheading>
      <Body muted>
        {gearchiveerd
          ? 'Het doel komt weer op je dashboard en in je groepsoverzicht.'
          : 'Het doel verdwijnt van je dashboard en uit groepsoverzichten. Je geschiedenis blijft ' +
            'volledig staan: voltooiingen, goedkeuringen en punten. Je kunt dit altijd terugdraaien.'}
      </Body>
      <Button busy={bezig} onPress={() => void schakel()}>
        {gearchiveerd ? 'Terughalen' : 'Archiveren'}
      </Button>
    </Card>
  );
}

/**
 * Een weekdoel toevoegen — QS8-43, QS8-44, QS8-112.
 *
 * ⚠️ Dit scherm ontbrak, en dat is het soort gat dat een afgevinkt vakje
 *    verbergt: QS8-43 en QS8-44 stonden allebei op Done omdat de datalaag klaar
 *    was. `maakWeekdoel()` werd door niets aangeroepen, en daarmee was de
 *    kernlus van de app niet met de hand te doorlopen.
 *
 * ⚠️ De cyclus wordt hier **niet** berekend. `maakWeekdoel()` doet dat uit de
 *    klok van de gebruiker (correctheidsregel 7); dit formulier levert alleen
 *    tekst en een keuze aan.
 */
function WeekdoelToevoegen({
  doel,
  klok,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly klok: UserClock | null;
  readonly onKlaar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [titel, setTitel] = useState('');
  const [vloer, setVloer] = useState('');
  const [plafond, setPlafond] = useState('');
  const [mijlpaalId, setMijlpaalId] = useState<string>(LOS_VAN_MIJLPAAL);
  const [mijlpalen, setMijlpalen] = useState<readonly Mijlpaal[]>([]);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // De mijlpalen pas ophalen als het formulier open is: dit blok staat op een
  // scherm dat ook zonder weekdoel bruikbaar moet zijn.
  useEffect(() => {
    if (!open) return;
    let levend = true;

    fetchMijlpalen(doel.id)
      .then((gevonden) => {
        if (levend) setMijlpalen(gevonden);
      })
      .catch(() => {
        // Stil: zonder mijlpalen kun je nog steeds een los weekdoel maken, en
        // dat is de meest voorkomende situatie. De datalaag heeft al gemeld.
        if (levend) setMijlpalen([]);
      });

    return () => {
      levend = false;
    };
  }, [open, doel.id]);

  async function bewaar() {
    if (!klok) return;
    setBezig(true);
    setFout(null);

    // ⚠️ Zonder dit wordt élk weekdoel "week 1" van dit doel en klopt
    //    `cycle_index` niet meer — daar hangt de weekteller aan.
    const eerste = await eersteCyclusVanDoel(doel.id, klok);

    const uitkomst = await maakWeekdoel(
      klok,
      {
        goal_id: doel.id,
        milestone_id: mijlpaalId === LOS_VAN_MIJLPAAL ? null : mijlpaalId,
        title: titel,
        // Lege tekst is "niet ingevuld" en hoort als null de database in, niet
        // als lege string — anders lijkt er een vloer te zijn die er niet is.
        floor_text: vloer.trim() === '' ? null : vloer,
        ceiling_text: plafond.trim() === '' ? null : plafond,
      },
      eerste,
    );

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setOpen(false);
    setTitel('');
    setVloer('');
    setPlafond('');
    setMijlpaalId(LOS_VAN_MIJLPAAL);
    onKlaar();
  }

  if (!open) {
    return (
      <Button variant="primair" block onPress={() => setOpen(true)}>
        Weekdoel toevoegen
      </Button>
    );
  }

  return (
    <Card nested>
      <Subheading>Wat wil je deze week af hebben?</Subheading>

      <Field
        label="Weekdoel"
        hint="Eén ding, deze week. Bijvoorbeeld: drie klantgesprekken voeren."
        value={titel}
        onChangeText={setTitel}
        placeholder="3 klantgesprekken voeren"
      />

      {/*
        ⚠️ De vloer staat vóór het plafond en krijgt de uitleg, en dat is geen
           volgordekwestie. Domeinregel 8: de vloer is de belangrijkste import
           uit Habit Huddle, en hij is optioneel — dus als de UI hem niet actief
           aanmoedigt, vult niemand hem in en is een slechte week weer een
           verloren week.
      */}
      <Field
        label="De vloer (aanbevolen)"
        hint="Wat haal je ook in een rotweek? Dit halen laat je reeks doorlopen — alleen de punten verschillen."
        value={vloer}
        onChangeText={setVloer}
        placeholder="1 gesprek ingepland"
      />

      <Field
        label="Het plafond"
        hint="Waar ga je voor als de week meezit?"
        value={plafond}
        onChangeText={setPlafond}
        placeholder="3 gesprekken gevoerd"
      />

      {/*
        Alleen tonen als er iets te kiezen valt. Eén optie ("los van een
        mijlpaal") is geen keuze maar een verplicht veld dat niets doet.
      */}
      {mijlpalen.length === 0 ? null : (
        <Choice
          label="Hoort dit bij een mijlpaal?"
          hint="Mag ook los onder je doel hangen."
          opties={[
            { waarde: LOS_VAN_MIJLPAAL, label: 'Los onder dit doel' },
            ...mijlpalen.map((m) => ({ waarde: m.id, label: m.title })),
          ]}
          waarde={mijlpaalId}
          onKies={setMijlpaalId}
        />
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <View style={styles.knoppen}>
        <Button
          variant="primair"
          busy={bezig}
          disabled={titel.trim().length < 3 || klok === null}
          onPress={() => void bewaar()}
        >
          Toevoegen
        </Button>
        <Button
          variant="stil"
          disabled={bezig}
          onPress={() => {
            setOpen(false);
            setFout(null);
          }}
        >
          Annuleren
        </Button>
      </View>
    </Card>
  );
}

/**
 * Weggooien binnen de bedenktijd — QS8-105, migratie 0046.
 *
 * ⚠️ Staat bewust ónder archiveren en in een stille knop. Archiveren is de weg
 *    voor een doel dat je loslaat; weggooien is er alleen voor het doel dat je
 *    net verkeerd hebt aangemaakt. Zou dit even prominent staan, dan wordt het
 *    de standaardreflex om geschiedenis weg te gooien — en dat botst met
 *    domeinregel 6 (append-only: corrigeren doe je met een correctie, niet door
 *    de geschiedenis te wissen).
 *
 * ⚠️ Verdwijnt niet vanzelf als de bedenktijd voorbij is, en dat kan ook niet:
 *    `bedenktijd()` staat alleen in de database en heeft daar bewust geen kopie
 *    in TypeScript. De database weigert dan met `te_oud`, en die melding wijst
 *    naar archiveren. Zie `shared/ui/acties.ts` voor de onderbouwing.
 */
function Weggooien({ doel, onWeg }: { readonly doel: DoelMetVoortgang; readonly onWeg: () => void }) {
  const [vraagt, setVraagt] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // Een gearchiveerd doel heeft per definitie een verleden; daar is weggooien
  // niet voor.
  if (doel.status === 'archived') return null;

  async function weg() {
    setBezig(true);
    setFout(null);

    const uitkomst = await verwijderDoel(doel.id);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    onWeg();
  }

  if (vraagt) {
    return (
      <Bevestiging
        tekst={BEVESTIGING.doelVerwijderen}
        bezig={bezig}
        fout={fout}
        onBevestig={() => void weg()}
        onAnnuleer={() => {
          setVraagt(false);
          setFout(null);
        }}
      />
    );
  }

  return (
    <Button
      variant="stil"
      onPress={() => setVraagt(true)}
      accessibilityLabel={`Doel ${doel.title ?? ''} weggooien`}
    >
      Per ongeluk aangemaakt? Weggooien
    </Button>
  );
}

const styles = StyleSheet.create({
  blokken: { gap: space.blokGap + 3 },
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, alignItems: 'center' },
});
