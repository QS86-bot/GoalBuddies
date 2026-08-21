import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession, userClock } from '@/modules/auth';
import { fetchGroepenVanDoel, fetchMijnGroepen, stuurBericht, type Groep } from '@/modules/buddies';
import {
  fetchCommitments,
  isOpenstaand,
  tekstVoor,
  trekIn,
  zetBeloning,
  zetStraf,
  type Commitment,
} from '@/modules/commitments';
import {
  annuleerAdempauze,
  ARGUMENT_MAX,
  ARGUMENT_MIN,
  CATEGORIE_LABELS,
  eersteCyclusVanDoel,
  fetchAdempauzes,
  fetchDoel,
  fetchLaatsteBesluit,
  fetchMijlpalen,
  fetchOpenVerzoek,
  fetchRisico,
  herordenMijlpalen,
  maakMijlpaal,
  maakWeekdoel,
  planAdempauze,
  planbareCycli,
  trekDeadlineVerzoekIn,
  verplaats,
  verwijderDoel,
  verwijderMijlpaal,
  vraagDeadlineVerschuiving,
  rondDoelAf,
  zetArchief,
  zetMijlpaalStatus,
  zetStreefdatum,
  type Adempauze,
  type Categorie,
  type DeadlineVerzoek,
  type DoelMetVoortgang,
  type Mijlpaal,
  type Risico,
} from '@/modules/goals';
import { space } from '@/shared/theme';
import { localDateIn, nextCycle, now, type IsoDate, type UserClock } from '@/shared/time';
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
  HULPVRAAG_MAX,
  hulpvraagVoorstel,
  MilestoneProgress,
  RisicoBadge,
  risicoUitleg,
  Screen,
  Subheading,
  useHulpvraagVerborgen,
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
  const [risico, setRisico] = useState<Risico | null>(null);
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

  // ⚠️ Apart opgehaald en apart falend: de Risico-radar is een blok op dit
  //    scherm, en een storing daarin hoort het doel zelf niet mee te slepen.
  //    Staat hier en niet in het radarblok, omdat de hulpvraag-kaart (QS8-95)
  //    dezelfde stand nodig heeft — twee keer ophalen zou twee keer hetzelfde
  //    verzoek zijn.
  useEffect(() => {
    if (!id) return;
    let levend = true;

    fetchRisico(id)
      .then((gevonden) => {
        if (levend) setRisico(gevonden);
      })
      .catch(() => {
        if (levend) setRisico(null);
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

            <Risicoradar risico={risico} />

            <Herplannen
              risico={risico}
              heeftStraf={commitments.some((c) => c.type === 'penalty' && c.status !== 'cancelled')}
            />

            <HulpVragen doel={d} risico={risico} groepen={doelGroepen} userId={userId} />

            <Mijlpalen
              doel={d}
              onKlaar={herlaad}
              onCoach={() => router.push(`/doel/coach/${d.id}`)}
            />

            <WeekdoelToevoegen doel={d} klok={klok} onKlaar={herlaad} />

            <Adempauzes
              doel={d}
              klok={klok}
              gedeeld={doelGroepen.length > 0}
              onKlaar={herlaad}
            />

            {userId ? <Afronden doel={d} userId={userId} onKlaar={herlaad} /> : null}

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
    // ⚠️ De uitleg komt uit `tekstVoor()` en staat niet hier. Dat is geen
    //    netheid: de toon bij een straf die afgegaan is, is een
    //    acceptatiecriterium van QS8-84, en teksten die verspreid door schermen
    //    staan, lopen uit elkaar zodra er een tweede scherm bijkomt.
    const stand = tekstVoor(bestaand);

    return (
      <Card>
        <Subheading>Je beloning</Subheading>
        <Body>{bestaand.body}</Body>
        <Caption>
          {stand.titel} — {stand.uitleg}
        </Caption>
        <Caption>Vastgelegd op {bestaand.confirmed_at.slice(0, 10)}.</Caption>
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
      {/*
        ⚠️ QS8-85: dit moet er letterlijk staan. Iemand die een bedrag invult,
           hoort niet te hoeven raden of de app zijn rekening gaat plunderen.
           Er staat een test op deze zin.
      */}
      <Caption>De app rekent niets af. Dit wordt alleen bijgehouden.</Caption>
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
    const stand = tekstVoor(bestaand);
    const magIntrekken = isOpenstaand(bestaand);

    return (
      <Card>
        <Subheading>Je straf</Subheading>
        <Body>{bestaand.body}</Body>
        <Caption>
          {stand.titel} — {stand.uitleg}
        </Caption>
        {/*
          ⚠️ De knop verdwijnt zodra de straf verschuldigd is, en dat is geen
             cosmetiek: `commitments_update` weigert het dan sowieso (0057). Een
             knop tonen die de server afwijst, leert iemand alleen dat de app
             onbetrouwbaar is — en hier is het juist de bedoeling dat je merkt
             dat je er niet meer onderuit komt.
        */}
        {magIntrekken ? (
          <Button
            variant="stil"
            onPress={() => {
              void trekIn(bestaand.id).then(onKlaar);
            }}
          >
            Intrekken
          </Button>
        ) : null}
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
      <Caption>
        De app rekent niets af en verwerkt geen geld. Je legt hier vast wat je met je groep
        afspreekt; het uitvoeren doen jullie zelf.
      </Caption>

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

/**
 * Een doel afronden — QS8-83.
 *
 * ⚠️ **Dit is het moment waar EPIC 9 op wachtte.** Vóór migratie 0057 kon een
 *    doel nooit `completed` worden, en dus kwam er ook nooit een beloning vrij.
 *
 * ⚠️ Onomkeerbaar, met een bevestiging die zegt wát het kost — dezelfde eis als
 *    bij afsluiten en weggooien (QS8-106). De tekst staat in `BEVESTIGING` en
 *    staat daar onder test.
 *
 * ⚠️ De knop verschijnt niet zolang er een mijlpaal openstaat. De server weigert
 *    het dan óók (`open_milestones`), en dat is de echte grens; dit is het
 *    vriendelijke gezicht ervan. Dat er dan een uitleg staat in plaats van niets,
 *    is met opzet: "de knop is er niet" laat iemand raden waarom.
 */
function Afronden({
  doel,
  userId,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly userId: string;
  readonly onKlaar: () => void;
}) {
  const [vraagt, setVraagt] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const open = (doel.milestones_total ?? 0) - (doel.milestones_done ?? 0);

  if (doel.status === 'completed') {
    return (
      <Card>
        <Subheading>Afgerond</Subheading>
        <Body muted>
          Je hebt dit doel afgerond. Je groepen hebben het gezien en je beloning is vrijgekomen.
        </Body>
      </Card>
    );
  }

  // Gearchiveerd: eerst terughalen. De server zegt hetzelfde (`not_active`).
  if (doel.status !== 'active') return null;

  async function rond() {
    setBezig(true);
    setFout(null);

    const uitkomst = await rondDoelAf(doel.id, userId);

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
        tekst={BEVESTIGING.doelAfronden}
        bezig={bezig}
        fout={fout}
        onBevestig={() => void rond()}
        onAnnuleer={() => {
          setVraagt(false);
          setFout(null);
        }}
      />
    );
  }

  if (open > 0) {
    return (
      <Card nested>
        <Subheading>Afronden</Subheading>
        <Body muted>
          {open === 1
            ? 'Er staat nog één mijlpaal open. Vink hem af, of laat hem vallen als hij niet meer nodig is — dan kun je dit doel afronden.'
            : `Er staan nog ${open} mijlpalen open. Vink ze af, of laat vallen wat niet meer nodig is — dan kun je dit doel afronden.`}
        </Body>
      </Card>
    );
  }

  return (
    <Card>
      <Subheading>Afronden</Subheading>
      <Body muted>
        Alle mijlpalen staan af. Rond je doel af, dan weet je groep het en komt je beloning vrij.
      </Body>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <Button
        onPress={() => setVraagt(true)}
        accessibilityLabel={`Doel ${doel.title ?? ''} afronden`}
      >
        Dit doel is af
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
 * Herplannen bij een onhaalbare deadline — QS8-96.
 *
 * ⚠️ Dit is het moment waarop mensen apps als deze weggooien: het doel is dood,
 *    de app blijft herinneringen sturen, en de gebruiker verwijdert hem. De
 *    issue zegt het zo, en dat is de hele reden dat dit blok bestaat — een uitweg
 *    in plaats van stilte.
 *
 * ⚠️ **Toon: nuchter en behulpzaam, geen verwijt** (acceptatiecriterium 6). Er
 *    staat nergens dat je iets fout hebt gedaan. Een deadline die niet meer
 *    klopt, is informatie en geen oordeel.
 *
 * ⚠️ Bijstellen breekt je reeks niet en wist niets (criterium 3). Dat kán ook
 *    niet: een deadline verzetten raakt `goals.target_date` en niet
 *    `weekly_goals`, mijlpalen laten vallen zet ze op `dropped` in plaats van ze
 *    te verwijderen, en `goal_events` legt elke wijziging append-only vast
 *    (criterium 4). Deze kaart wijst alleen de weg naar bestaande handelingen;
 *    hij voert zelf niets uit. Dat scheelt een tweede plek waar dezelfde
 *    wijziging langs kan.
 */
function Herplannen({
  risico,
  heeftStraf,
}: {
  readonly risico: Risico | null;
  readonly heeftStraf: boolean;
}) {
  if (risico?.stand !== 'unreachable') return null;

  const weken = risico.reden?.weken_over ?? null;
  const open = risico.reden?.open_mijlpalen ?? null;

  return (
    <Card nested>
      <Subheading>Deze datum gaat niet meer lukken</Subheading>

      <Body muted>
        {open !== null && weken !== null
          ? `Er staan ${open} mijlpalen open en er ${weken === 1 ? 'is' : 'zijn'} nog ${weken} ${weken === 1 ? 'week' : 'weken'}. `
          : ''}
        Dat is geen ramp en het zegt niets over jou — het zegt dat het plan niet
        meer klopt. Een doel bijstellen werkt beter dan het stilletjes laten
        doodbloeden.
      </Body>

      <Body>Drie dingen die je kunt doen:</Body>

      <View style={styles.uitwegen}>
        <View style={styles.uitweg}>
          <Body>Verzet je streefdatum</Body>
          <Caption>
            Hierboven bij &ldquo;Deadline&rdquo;. Deel je dit doel met een groep, dan vraag je er
            akkoord voor — dat kost je geen punten.
          </Caption>
        </View>

        <View style={styles.uitweg}>
          <Body>Laat mijlpalen vallen</Body>
          <Caption>
            Bij &ldquo;Mijlpalen&rdquo;. Wat je laat vallen telt niet meer mee, en je
            geschiedenis blijft staan.
          </Caption>
        </View>

        <View style={styles.uitweg}>
          <Body>Maak het doel kleiner</Body>
          <Caption>
            Pas de mijlpalen aan naar wat er wél in past. Liever een doel dat je haalt dan een
            plan dat klopte in maart.
          </Caption>
        </View>
      </View>

      {/*
        ⚠️ Acceptatiecriterium 5: is er een straf ingesteld, dan hoort de
           gebruiker vóór het verzetten te weten wat dat daarvoor betekent.
           Domeinregel 11 zegt dat een straf pas in werking treedt bij een
           verstreken deadline — dus de datum verzetten is precies de handeling
           die dat moment verschuift, en dat mag geen verrassing zijn.
      */}
      {heeftStraf ? (
        <Caption danger>
          Let op: je hebt een straf ingesteld op dit doel. Die treedt in werking als je
          streefdatum verstrijkt zonder dat het doel af is. Verzet je de datum, dan verschuift
          dat moment mee.
        </Caption>
      ) : null}

      <Caption>Je reeks en je geschiedenis blijven bij alle drie gewoon staan.</Caption>
    </Card>
  );
}

/**
 * "Vraag je groep om hulp" — QS8-95, het scharnierpunt van EPIC 12.
 *
 * ⚠️ **Nooit automatisch** (acceptatiecriterium 1). De kaart verschijnt bij
 *    stand "achterstand" en verder gebeurt er niets: er gaat pas iets naar de
 *    groep als de gebruiker de tekst gelezen heeft, hem eventueel aangepast
 *    heeft, en op verzenden drukt. Dat is wat deze functie tot een geldige
 *    uitzondering op domeinregel 7 maakt — de route loopt via de persoon.
 *
 * ⚠️ Het bericht is een **gewoon chatbericht**, geen systeembericht. Dat scheelt
 *    een migratie (de allowlist hoeft niet open), reageren werkt vanzelf, en het
 *    klopt inhoudelijk: een systeembericht is iets dat de app zegt, dit is iets
 *    dat de gebruiker zegt.
 *
 * ⚠️ Wegklikken blijft weg (acceptatiecriterium 5). De keuze staat op het
 *    apparaat en niet in de database: het is een schermvoorkeur, en een kolom
 *    toevoegen vraagt eerst toestemming. Gevolg: op een nieuwe telefoon komt de
 *    kaart één keer terug.
 */
function HulpVragen({
  doel,
  risico,
  groepen,
  userId,
}: {
  readonly doel: DoelMetVoortgang;
  readonly risico: Risico | null;
  readonly groepen: readonly { readonly group_id: string; readonly name: string }[];
  readonly userId: string | null;
}) {
  const [tekst, setTekst] = useState('');
  const [groepId, setGroepId] = useState('');
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [verstuurd, setVerstuurd] = useState(false);
  const { weg, verberg, geladen } = useHulpvraagVerborgen(doel.id);

  // ⚠️ Afgeleid en niet in een effect gezet. De eerste groep is de standaard
  //    zolang de gebruiker niets gekozen heeft; dat in een effect naar state
  //    schrijven levert een extra render op zonder dat er iets verandert, en de
  //    lint-regel vangt het af.
  const gekozenGroep = groepId === '' ? (groepen[0]?.group_id ?? '') : groepId;

  // Alleen bij achterstand, alleen met een groep om het aan te vragen, en
  // alleen als hij niet weggeklikt is.
  if (risico?.stand !== 'behind' || groepen.length === 0 || !geladen || weg || userId === null) {
    return null;
  }

  if (verstuurd) {
    return (
      <Card nested>
        <Subheading>Je vraag staat in de groep</Subheading>
        <Body muted>
          Je buddy&apos;s kunnen erop reageren in de groepschat. Dat is precies waar ze voor zijn.
        </Body>
      </Card>
    );
  }

  async function verstuur() {
    if (userId === null) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await stuurBericht(gekozenGroep, userId, tekst);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setVerstuurd(true);
  }

  if (!open) {
    return (
      <Card nested>
        <Subheading>Vastgelopen? Vraag je groep</Subheading>
        <Body muted>
          Je loopt achter op dit doel. Daar is je groep voor — twee zinnen en iemand denkt met je
          mee. Je ziet precies wat je verstuurt voordat het weggaat.
        </Body>

        <View style={styles.knoppen}>
          <Button
            variant="primair"
            onPress={() => {
              setTekst(
                hulpvraagVoorstel({
                  doeltitel: doel.title,
                  wekenOver: risico?.reden?.weken_over ?? null,
                }),
              );
              setOpen(true);
            }}
          >
            Vraag om hulp
          </Button>
          <Button variant="stil" onPress={verberg}>
            Nu even niet
          </Button>
        </View>
      </Card>
    );
  }

  return (
    <Card nested>
      <Subheading>Wat wil je vragen?</Subheading>

      <Field
        label="Je bericht"
        hint="Pas het gerust aan. Dit gaat als jouw bericht naar de groepschat."
        value={tekst}
        onChangeText={setTekst}
        multiline
        numberOfLines={4}
        maxLength={HULPVRAAG_MAX}
      />

      {groepen.length === 1 ? null : (
        <Choice
          label="Naar welke groep?"
          opties={groepen.map((g) => ({ waarde: g.group_id, label: g.name }))}
          waarde={gekozenGroep}
          onKies={setGroepId}
        />
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <View style={styles.knoppen}>
        <Button
          variant="primair"
          busy={bezig}
          disabled={tekst.trim().length < 3}
          onPress={() => void verstuur()}
        >
          Versturen
        </Button>
        <Button variant="stil" disabled={bezig} onPress={() => setOpen(false)}>
          Annuleren
        </Button>
      </View>
    </Card>
  );
}

/**
 * De Risico-radar op het doelscherm — QS8-94.
 *
 * ⚠️ **Uitsluitend voor de eigenaar**, en dat is criterium 3 van de issue. De
 *    afdwinging zit in de database: `goal_risk` is eigenaar-only sinds migratie
 *    0050. Dit scherm is sowieso van de eigenaar, maar het component staat
 *    bewust niet in een gedeelde kaart die ooit op een groepsscherm kan belanden
 *    — dat is de valkuil "een component dat op het verkeerde scherm kan
 *    belanden" uit de overdracht.
 *
 * ⚠️ Rendert niets zonder rij. Een doel dat net is aangemaakt heeft nog geen
 *    stand: de radar draait bij de rollover en bij elke goedkeuring, niet bij
 *    het openen van een scherm (criterium 2 van QS8-93).
 */
function Risicoradar({ risico }: { readonly risico: Risico | null }) {
  const [waarom, setWaarom] = useState(false);

  if (risico === null) return null;

  return (
    <Card nested>
      <Subheading>Haalbaarheid</Subheading>

      <RisicoBadge
        stand={risico.stand}
        uitleg={waarom ? risicoUitleg(risico.stand, risico.reden) : undefined}
      />

      {waarom ? (
        <Button variant="stil" onPress={() => setWaarom(false)}>
          Verbergen
        </Button>
      ) : (
        <Button variant="stil" onPress={() => setWaarom(true)}>
          Waarom?
        </Button>
      )}

      {/*
        ⚠️ Deze zin staat er omdat de gebruiker anders moet raden hoeveel hij
           deelt. Een risicostand is een afgeleide van gemiste weken, en dat is
           precies waar domeinregel 7 over gaat — vandaar dat hij nergens in de
           groep terechtkomt. Wil je je groep om hulp vragen, dan is dat een
           knop die jij indrukt (QS8-95).
      */}
      <Caption>Alleen jij ziet dit. Je groep krijgt je haalbaarheid nooit te zien.</Caption>
    </Card>
  );
}

/**
 * Mijlpalen beheren — QS8-39, migratie 0049.
 *
 * ⚠️ Het handmatige pad moet volledig zijn, ook als er nooit AI gebruikt is
 *    (acceptatiecriterium 1). De Doelcoach vult mijlpalen in; hij is er geen
 *    voorwaarde voor. Daarom staat dit blok er altijd, ook bij een doel dat
 *    nooit door de Doelcoach is gegaan.
 *
 * ⚠️ Herordenen gaat via één RPC en niet via losse updates per rij. De unieke
 *    index `(goal_id, order_index)` is DEFERRABLE: schuiven mag binnen één
 *    transactie, en PostgREST geeft je er per verzoek precies één.
 */
function Mijlpalen({
  doel,
  onKlaar,
  onCoach,
}: {
  readonly doel: DoelMetVoortgang;
  readonly onKlaar: () => void;
  readonly onCoach: () => void;
}) {
  const [mijlpalen, setMijlpalen] = useState<readonly Mijlpaal[]>([]);
  const [open, setOpen] = useState(false);
  const [titel, setTitel] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    let levend = true;

    fetchMijlpalen(doel.id)
      .then((gevonden) => {
        if (levend) setMijlpalen(gevonden);
      })
      .catch(() => {
        if (levend) setMijlpalen([]);
      });

    return () => {
      levend = false;
    };
  }, [doel.id, ronde]);

  const ververs = () => {
    setRonde((n) => n + 1);
    onKlaar();
  };

  async function voegToe() {
    setBezig(true);
    setFout(null);

    const uitkomst = await maakMijlpaal(doel.id, {
      title: titel,
      description: null,
      target_date: null,
    });

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setTitel('');
    setOpen(false);
    ververs();
  }

  async function schuif(id: string, richting: 'omhoog' | 'omlaag') {
    const nieuweVolgorde = verplaats(
      mijlpalen.map((m) => m.id),
      id,
      richting,
    );

    // ⚠️ De volledige lijst, want de RPC weigert een deelverzameling — daarmee
    //    zijn dubbele posities en gaten te maken.
    const uitkomst = await herordenMijlpalen(doel.id, nieuweVolgorde);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    ververs();
  }

  async function zetStatus(id: string, status: 'todo' | 'done' | 'dropped') {
    const uitkomst = await zetMijlpaalStatus(id, status);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }
    ververs();
  }

  async function weg(id: string) {
    const uitkomst = await verwijderMijlpaal(id);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }
    ververs();
  }

  return (
    <Card nested>
      <Subheading>Mijlpalen</Subheading>

      {mijlpalen.length === 0 ? (
        <>
          <Body muted>
            Nog geen mijlpalen. Knip je doel op in tussenresultaten die je kunt aanwijzen — dan
            weet je elke week waar je aan werkt.
          </Body>
          {/*
            ⚠️ De Doelcoach staat hier en niet bovenaan het scherm, en alleen bij
               een doel zónder mijlpalen. Hij is een hulpmiddel bij een leeg doel,
               geen knop die je elke keer ziet — en het handmatige pad hoort
               ernaast te blijven bestaan (QS8-39, criterium 1).
          */}
          <Button variant="primair" onPress={onCoach}>
            Laat de Doelcoach ze voorstellen
          </Button>
        </>
      ) : (
        <View style={styles.mijlpalen}>
          {mijlpalen.map((m, i) => (
            <View key={m.id} style={styles.mijlpaal}>
              <Body>{m.title}</Body>
              <Caption>
                {m.status === 'done' ? 'Gehaald' : `Stap ${i + 1} van ${mijlpalen.length}`}
                {m.target_date === null ? '' : ` · streefdatum ${m.target_date}`}
              </Caption>

              <View style={styles.knoppen}>
                {/*
                  ⚠️ Op "gehaald" zetten plaatst een systeembericht in elke
                     gekoppelde groep, en een chatbericht is een onveranderlijke
                     kopie. Terugzetten haalt dat bericht niet weg. De knop zegt
                     dat, want anders ontdekt iemand het pas in de groepschat.
                */}
                {m.status === 'done' ? (
                  <Button variant="stil" onPress={() => void zetStatus(m.id, 'todo')}>
                    Toch niet gehaald
                  </Button>
                ) : (
                  <Button onPress={() => void zetStatus(m.id, 'done')}>Gehaald</Button>
                )}

                {i === 0 ? null : (
                  <Button
                    variant="stil"
                    accessibilityLabel={`${m.title} omhoog`}
                    onPress={() => void schuif(m.id, 'omhoog')}
                  >
                    Omhoog
                  </Button>
                )}

                {i === mijlpalen.length - 1 ? null : (
                  <Button
                    variant="stil"
                    accessibilityLabel={`${m.title} omlaag`}
                    onPress={() => void schuif(m.id, 'omlaag')}
                  >
                    Omlaag
                  </Button>
                )}

                <Button
                  variant="stil"
                  accessibilityLabel={`${m.title} verwijderen`}
                  onPress={() => void weg(m.id)}
                >
                  Verwijderen
                </Button>
              </View>
            </View>
          ))}
        </View>
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      {open ? (
        <View style={styles.pauzeForm}>
          <Field
            label="Nieuwe mijlpaal"
            hint="Een tussenresultaat dat je kunt aanwijzen. Bijvoorbeeld: eerste tienduizend woorden."
            value={titel}
            onChangeText={setTitel}
            placeholder="Eerste tienduizend woorden"
          />

          <View style={styles.knoppen}>
            <Button
              variant="primair"
              busy={bezig}
              disabled={titel.trim().length < 3}
              onPress={() => void voegToe()}
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
        </View>
      ) : (
        <Button onPress={() => setOpen(true)}>Mijlpaal toevoegen</Button>
      )}
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
 * De adempauze — QS8-82, migratie 0048.
 *
 * ⚠️ Vakantie, ziekte, een piek op het werk. Een reis hoort je niet terug naar
 *    nul te zetten. Tijdens een adempauze krijgt een onvoltooid weekdoel
 *    `excused` in plaats van `missed`: geen minpunt, en je reeks wacht in plaats
 *    van te breken.
 *
 * ⚠️ **Wat de groep ziet is de aankondiging, niet je weken.** `breathers` is
 *    leesbaar voor groepsgenoten van een gekoppeld doel — dat is het punt van
 *    "vooraf aangekondigd", en het is domeinregel 7's eigen uitzondering: dit
 *    loopt via jou. De statuskolom per week is sinds migratie 0047 juist dicht.
 *    De copy zegt dat met zoveel woorden, want anders moet de gebruiker raden
 *    hoeveel hij deelt.
 */
function Adempauzes({
  doel,
  klok,
  gedeeld,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly klok: UserClock | null;
  readonly gedeeld: boolean;
  readonly onKlaar: () => void;
}) {
  const [pauzes, setPauzes] = useState<readonly Adempauze[]>([]);
  const [open, setOpen] = useState(false);
  const [lengte, setLengte] = useState<'een' | 'twee'>('een');
  const [startIndex, setStartIndex] = useState<'0' | '1'>('0');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let levend = true;

    fetchAdempauzes(doel.id)
      .then((gevonden) => {
        if (levend) setPauzes(gevonden);
      })
      .catch(() => {
        if (levend) setPauzes([]);
      });

    return () => {
      levend = false;
    };
  }, [doel.id]);

  if (!klok) return null;

  const kandidaten = planbareCycli(klok, now());
  const start = kandidaten[startIndex === '0' ? 0 : 1];

  async function plan() {
    if (!klok || !start) return;
    setBezig(true);
    setFout(null);

    // Eén cyclus: begin en eind zijn dezelfde week. Twee: de week erna.
    const eind = lengte === 'een' ? start : nextCycle(start, klok.weekStartDay);
    const uitkomst = await planAdempauze(doel.id, start, eind);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setOpen(false);
    setPauzes(await fetchAdempauzes(doel.id));
    onKlaar();
  }

  async function annuleer(id: string) {
    const uitkomst = await annuleerAdempauze(id);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }
    setPauzes(await fetchAdempauzes(doel.id));
    onKlaar();
  }

  const vandaag = localDateIn(klok.tz, now());

  return (
    <Card nested>
      <Subheading>Adempauze</Subheading>
      <Body muted>
        Ga je op vakantie, ben je ziek, of is het gewoon een gekke maand? Zet dan een of twee
        weken stil. Die weken kosten je geen punt en je reeks blijft staan waar hij staat —
        hij groeit alleen niet mee.
      </Body>

      {/*
        ⚠️ Alleen zeggen dat de groep het ziet als er ook echt een groep is. Bij
           een ongekoppeld doel is er niemand om iets aan te kondigen, en dan is
           deze zin een waarschuwing over een risico dat niet bestaat.
      */}
      {gedeeld ? (
        <Caption>
          Je groep ziet dát je een adempauze hebt en van wanneer tot wanneer. Ze zien niet welke
          weekdoelen je wel of niet gehaald hebt.
        </Caption>
      ) : null}

      {pauzes.length === 0 ? null : (
        <View style={styles.pauzes}>
          {pauzes.map((p) => {
            const begonnen = p.starts_cycle <= vandaag;
            const voorbij = p.ends_cycle < vandaag;

            return (
              <View key={p.id} style={styles.pauze}>
                <Body>
                  Week van {p.starts_cycle}
                  {p.ends_cycle === p.starts_cycle ? '' : ` tot en met de week van ${p.ends_cycle}`}
                </Body>
                <Caption>{voorbij ? 'Voorbij' : begonnen ? 'Loopt nu' : 'Ingepland'}</Caption>

                {/* Annuleren kan alleen zolang hij nog niet begonnen is — de RPC
                    weigert de rest, en dan is de knop tonen een belofte die de
                    database niet nakomt. */}
                {begonnen ? null : (
                  <Button variant="stil" onPress={() => void annuleer(p.id)}>
                    Annuleren
                  </Button>
                )}
              </View>
            );
          })}
        </View>
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      {open ? (
        <View style={styles.pauzeForm}>
          <Choice
            label="Vanaf welke week?"
            hint="Een adempauze kondig je vooraf aan, dus de week die nu loopt kan niet meer."
            opties={kandidaten.map((c, i) => ({
              waarde: String(i) as '0' | '1',
              label: `Week van ${c.startDate}`,
            }))}
            waarde={startIndex}
            onKies={setStartIndex}
          />

          <Choice
            label="Hoe lang?"
            opties={[
              { waarde: 'een', label: 'Eén week' },
              { waarde: 'twee', label: 'Twee weken' },
            ]}
            waarde={lengte}
            onKies={setLengte}
          />

          <View style={styles.knoppen}>
            <Button variant="primair" busy={bezig} onPress={() => void plan()}>
              Inplannen
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
        </View>
      ) : (
        <Button onPress={() => setOpen(true)}>Adempauze inplannen</Button>
      )}
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
  mijlpalen: { gap: space.blokGap - 2 },
  uitwegen: { gap: space.blokGap - 3 },
  uitweg: { gap: 2 },
  mijlpaal: { gap: 3 },
  pauzes: { gap: space.blokGap - 3 },
  pauze: { gap: 2 },
  pauzeForm: { gap: space.blokGap - 3 },
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, alignItems: 'center' },
});
