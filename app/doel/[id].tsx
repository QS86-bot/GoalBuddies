import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession } from '@/modules/auth';
import { fetchGroepenVanDoel, fetchMijnGroepen, type Groep } from '@/modules/buddies';
import { fetchCommitments, trekIn, zetBeloning, zetStraf, type Commitment } from '@/modules/commitments';
import {
  ARGUMENT_MAX,
  ARGUMENT_MIN,
  CATEGORIE_LABELS,
  fetchDoel,
  fetchOpenVerzoek,
  vraagDeadlineVerschuiving,
  zetArchief,
  zetStreefdatum,
  type Categorie,
  type DeadlineVerzoek,
  type DoelMetVoortgang,
} from '@/modules/goals';
import { space } from '@/shared/theme';
import { localDateIn, now, type IsoDate } from '@/shared/time';
import {
  AsyncView,
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
 * Eén doel: voortgang, deadline verzetten, archiveren, beloning en straf.
 *
 * ⚠️ De id in de URL geeft geen toegang. Wie hier komt zonder recht op dit doel,
 *    krijgt van de database nul rijen — RLS bepaalt dat, niet dit scherm. "Niet
 *    gevonden" en "mag je niet zien" tonen daarom hetzelfde: het verschil
 *    verraadt dat het doel bestaat.
 */
export default function DoelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const [doel, setDoel] = useState<DoelMetVoortgang | null>(null);
  const [commitments, setCommitments] = useState<readonly Commitment[]>([]);
  const [groepen, setGroepen] = useState<readonly Groep[]>([]);
  const [doelGroepen, setDoelGroepen] = useState<
    readonly { readonly group_id: string; readonly name: string }[]
  >([]);
  const [verzoek, setVerzoek] = useState<DeadlineVerzoek | null>(null);
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
    ])
      .then(([gevonden, vastgelegd, mijnGroepen, gekoppeld, lopend]) => {
        if (!levend) return;
        setDoel(gevonden);
        setCommitments(vastgelegd);
        setGroepen(mijnGroepen);
        setDoelGroepen(gekoppeld);
        setVerzoek(lopend);
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
                onKlaar={herlaad}
              />
            ) : null}

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
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly vandaag: IsoDate;
  readonly groepen: readonly { readonly group_id: string; readonly name: string }[];
  readonly verzoek: DeadlineVerzoek | null;
  readonly onKlaar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [datum, setDatum] = useState(doel.target_date ?? '');
  const [argument, setArgument] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const gedeeld = groepen.length > 0;
  const groep = groepen[0];

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
      </Card>
    );
  }

  if (!open) {
    return (
      <Card nested>
        <Subheading>Deadline</Subheading>
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

const styles = StyleSheet.create({
  blokken: { gap: space.blokGap + 3 },
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, alignItems: 'center' },
});
