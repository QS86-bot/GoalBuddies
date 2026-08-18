import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession } from '@/modules/auth';
import {
  bewaarWeekafsluiting,
  fetchGroep,
  fetchWeekafsluiting,
  fetchWeekafsluitingReacties,
  groepeerReacties,
  heeftInhoud,
  huddledagLabel,
  huidigeGroepsperiode,
  reageerOpAntwoord,
  verwijderReactie,
  verwijderWeekafsluiting,
  voorstelUitDagzetten,
  VRAGEN,
  type Antwoord,
  type Groep,
  type Reactie,
} from '@/modules/buddies';
import { fetchDagzetten } from '@/modules/completions';
import { space } from '@/shared/theme';
import { klokTijd, type Cycle } from '@/shared/time';
import {
  AsyncView,
  Avatar,
  Body,
  Button,
  Caption,
  Card,
  Field,
  Screen,
  Subheading,
} from '@/shared/ui';

/**
 * De Weekafsluiting — QS8-73.
 *
 * ⚠️ Eén kaart, geen reeks losse berichten. Dat is een acceptatiecriterium en geen
 *    opmaakkeuze: het moet voelen als een vergadering. De antwoorden van iedereen
 *    staan daarom in één blok onder elkaar, met de reacties eronder — en niet als
 *    chatberichten die door de dag heen druppelen. De chat is een ander scherm.
 *
 * ⚠️ Overslaan mag, en overslaan laat niets achter. Wie niets invult heeft geen rij
 *    in `week_reviews` en staat dus niet op de kaart. Er is hier nergens een
 *    ledenlijst waar de antwoorden naast gelegd worden, want dan verschijnt er een
 *    "X heeft niet gereageerd" dat niemand geschreven heeft (domeinregel 7).
 *
 * ⚠️ Alleen de lópende groepsperiode. Binnen de periode betekent "nog geen
 *    antwoord" niets anders dan "nog niet"; over oude perioden zou afwezigheid een
 *    verslag worden. Zelfde grens als op het groepsoverzicht.
 *
 * ⚠️ De groepsperiode en niet je eigen cyclus (domeinregel 1). Sluit jij je week op
 *    donderdag af en is de huddledag zondag, dan hoort dit gesprek bij de periode
 *    die zondag begon.
 */
export default function Weekafsluiting() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const [stand, setStand] = useState<Stand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);
  const [reactiePagina, setReactiePagina] = useState(0);
  const [meerBezig, setMeerBezig] = useState(false);

  useEffect(() => {
    if (!id) return;
    let levend = true;

    laad(id, userId ?? null)
      .then((uitkomst) => {
        if (!levend) return;
        setStand(uitkomst);
        // ⚠️ Terug naar pagina nul bij een herlading. Blijft de teller staan, dan
        //    vraagt "meer reacties" na een verversing een pagina die er niet is.
        setReactiePagina(0);
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
  }, [id, userId, ronde]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);
  const tz = profiel?.tz ?? stand?.groep?.tz ?? 'UTC';

  /**
   * Meer reacties, als er meer zijn dan er in één ronde passen.
   *
   * ⚠️ Dit moest erbij. `weekafsluiting_reacties()` is gepagineerd (CLAUDE.md,
   *    schaalbaarheidsregel 10) en het scherm laadde alleen de eerste pagina —
   *    dus voorbij honderd reacties verdween de rest zonder dat er iets stond
   *    dat zei dat er meer was. Een gepagineerde query zonder knop is geen
   *    paginering maar een limiet.
   */
  async function laadMeerReacties() {
    if (stand === null || stand.groep === null || !id || meerBezig) return;

    setMeerBezig(true);
    try {
      const volgende = await fetchWeekafsluitingReacties(id, stand.periode, {
        pagina: reactiePagina + 1,
      });

      setStand((oud) =>
        oud === null
          ? oud
          : { ...oud, reacties: voegReactiesSamen(oud.reacties, volgende.rijen), reactiesMeer: volgende.meer },
      );
      setReactiePagina((p) => p + 1);
    } catch (fout: unknown) {
      setError(fout);
    } finally {
      setMeerBezig(false);
    }
  }

  return (
    <Screen
      title="De weekafsluiting"
      eyebrow={
        stand?.groep
          ? `HUDDLEDAG ${huddledagLabel(stand.groep.huddle_day).toUpperCase()}`
          : undefined
      }
    >
      <AsyncView
        loading={loading}
        error={error}
        data={stand ?? undefined}
        isEmpty={(s) => s.groep === null}
        onRetry={herlaad}
        empty={{
          title: 'Deze groep is er niet, of niet voor jou',
          body:
            'Je bent geen lid van deze groep, of hij bestaat niet meer. Vraag om een ' +
            'nieuwe uitnodigingslink als je erbij hoort.',
        }}
      >
        {(s) => (
          <View style={styles.lijst}>
            <MijnAntwoorden
              groupId={id ?? ''}
              userId={userId ?? null}
              periode={s.periode}
              mijnAntwoord={s.antwoorden.find((a) => a.user_id === userId) ?? null}
              voorstel={s.voorstel}
              onGewijzigd={herlaad}
            />

            <DeKaart
              antwoorden={s.antwoorden}
              reacties={s.reacties}
              userId={userId ?? null}
              tz={tz}
              onGewijzigd={herlaad}
            />

            {s.reactiesMeer ? (
              <Button variant="secundair" block busy={meerBezig} onPress={() => void laadMeerReacties()}>
                Meer reacties laden
              </Button>
            ) : null}
          </View>
        )}
      </AsyncView>

      <Button variant="stil" block onPress={() => router.replace(`/groep/${id}`)}>
        Terug naar de groep
      </Button>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Je eigen drie antwoorden
// ---------------------------------------------------------------------------

/**
 * ⚠️ Vraag 1 komt voorgevuld uit je eigen Dagzetten van deze periode, en het
 *    blijft een vóórstel in een veld dat jij moet bevestigen. De Dagzet is
 *    standaard privé (domeinregel 9) en de weekafsluiting is dat niet; zou dit
 *    ergens automatisch meegaan, dan had de app een privé dagboek stilzwijgend tot
 *    groepsbericht gemaakt. De hint onder het veld zegt daarom waar de tekst
 *    vandaan komt.
 */
function MijnAntwoorden({
  groupId,
  userId,
  periode,
  mijnAntwoord,
  voorstel,
  onGewijzigd,
}: {
  readonly groupId: string;
  readonly userId: string | null;
  readonly periode: Cycle;
  readonly mijnAntwoord: Antwoord | null;
  readonly voorstel: string;
  readonly onGewijzigd: () => void;
}) {
  const [open, setOpen] = useState(mijnAntwoord === null);
  const [did, setDid] = useState(mijnAntwoord?.did_text ?? voorstel);
  const [blocked, setBlocked] = useState(mijnAntwoord?.blocked_text ?? '');
  const [next, setNext] = useState(mijnAntwoord?.next_text ?? '');
  const [bezig, setBezig] = useState<'opslaan' | 'weg' | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const waarden: Record<string, { readonly waarde: string; readonly zet: (t: string) => void }> = {
    did_text: { waarde: did, zet: setDid },
    blocked_text: { waarde: blocked, zet: setBlocked },
    next_text: { waarde: next, zet: setNext },
  };

  async function bewaar() {
    if (userId === null || userId === '' || groupId === '') {
      setFout('Je sessie is nog aan het laden. Probeer het over een tel opnieuw.');
      return;
    }

    setBezig('opslaan');
    setFout(null);

    const uitkomst = await bewaarWeekafsluiting(userId, groupId, periode, {
      did_text: did.trim(),
      blocked_text: blocked.trim(),
      next_text: next.trim(),
    });

    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setOpen(false);
    onGewijzigd();
  }

  async function haalWeg() {
    if (userId === null || userId === '' || groupId === '') return;

    setBezig('weg');
    setFout(null);

    const uitkomst = await verwijderWeekafsluiting(userId, groupId, periode);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setDid(voorstel);
    setBlocked('');
    setNext('');
    setOpen(true);
    onGewijzigd();
  }

  if (!open) {
    return (
      <Card>
        <Subheading>Je hebt deze week gedeeld</Subheading>
        <Body muted>
          Je antwoorden staan op de kaart hieronder. Je kunt ze bijwerken of helemaal
          terugnemen — ook nadat er al op gereageerd is.
        </Body>
        <View style={styles.acties}>
          <Button variant="secundair" onPress={() => setOpen(true)}>
            Bijwerken
          </Button>
          <Button variant="stil" busy={bezig === 'weg'} onPress={() => void haalWeg()}>
            Terugnemen
          </Button>
        </View>
        {fout === null ? null : <Caption danger>{fout}</Caption>}
      </Card>
    );
  }

  return (
    <Card>
      <Subheading>Drie vragen</Subheading>
      <Body muted>
        Alle drie mogen leeg blijven. Wie niets invult, staat niet op de kaart — er komt
        nergens te staan dat je overgeslagen hebt.
      </Body>

      {VRAGEN.map((vraag) => {
        const veld = waarden[vraag.veld];
        if (veld === undefined) return null;

        return (
          <Field
            key={vraag.veld}
            label={vraag.label}
            hint={vraag.hint}
            value={veld.waarde}
            onChangeText={veld.zet}
            multiline
            maxLength={2000}
            placeholder={vraag.placeholder}
          />
        );
      })}

      <Button variant="primair" block busy={bezig === 'opslaan'} onPress={() => void bewaar()}>
        Delen met mijn groep
      </Button>

      {mijnAntwoord === null ? null : (
        <Button variant="stil" block onPress={() => setOpen(false)}>
          Toch niet bijwerken
        </Button>
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// De kaart van de groep
// ---------------------------------------------------------------------------

/**
 * ⚠️ Eén kaart met alles erin, en de leegstaat zegt "nog niemand" en niet "niemand".
 *    Dat woord is het hele verschil: binnen een lopende periode is er nog tijd, en
 *    een kaart die dat niet zegt maakt van stilte een oordeel.
 */
function DeKaart({
  antwoorden,
  reacties,
  userId,
  tz,
  onGewijzigd,
}: {
  readonly antwoorden: readonly Antwoord[];
  readonly reacties: readonly Reactie[];
  readonly userId: string | null;
  readonly tz: string;
  readonly onGewijzigd: () => void;
}) {
  const perAntwoord = groepeerReacties(reacties);
  const zichtbaar = antwoorden.filter(heeftInhoud);

  return (
    <Card>
      <Subheading>Wat de groep deelde</Subheading>

      {zichtbaar.length === 0 ? (
        <Body muted>
          Nog niemand heeft deze week iets gedeeld. Wie begint, maakt het voor de rest
          makkelijker.
        </Body>
      ) : (
        zichtbaar.map((antwoord) => (
          <AntwoordBlok
            key={antwoord.review_id}
            antwoord={antwoord}
            reacties={perAntwoord.get(antwoord.review_id) ?? []}
            userId={userId}
            tz={tz}
            onGewijzigd={onGewijzigd}
          />
        ))
      )}
    </Card>
  );
}

function AntwoordBlok({
  antwoord,
  reacties,
  userId,
  tz,
  onGewijzigd,
}: {
  readonly antwoord: Antwoord;
  readonly reacties: readonly Reactie[];
  readonly userId: string | null;
  readonly tz: string;
  readonly onGewijzigd: () => void;
}) {
  const [reactie, setReactie] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function stuur() {
    if (userId === null || userId === '') {
      setFout('Je sessie is nog aan het laden. Probeer het over een tel opnieuw.');
      return;
    }

    setBezig(true);
    setFout(null);

    const uitkomst = await reageerOpAntwoord(antwoord.review_id, userId, reactie);
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setReactie('');
    onGewijzigd();
  }

  async function weg(reactieId: string) {
    const uitkomst = await verwijderReactie(reactieId);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }
    onGewijzigd();
  }

  return (
    <Card nested>
      <View style={styles.kop}>
        <Avatar name={antwoord.display_name} url={antwoord.avatar_url} size={30} />
        <Subheading>{antwoord.display_name}</Subheading>
      </View>

      {VRAGEN.map((vraag) => {
        const tekst = antwoord[vraag.veld];
        if (tekst === null || tekst.trim() === '') return null;

        return (
          <View key={vraag.veld} style={styles.antwoord}>
            {/*
              ⚠️ Ook vraag 2 krijgt gewoon zijn kopje, in dezelfde stijl als de
                 andere twee. Geen waarschuwingskleur, geen apart kadertje, geen
                 icoon: dat zou er een uitzondering van maken, en dan is opschrijven
                 wat er in de weg zat opeens een bekentenis in plaats van het derde
                 punt van de agenda.
            */}
            <Caption>{vraag.label}</Caption>
            <Body>{tekst}</Body>
          </View>
        );
      })}

      {reacties.map((r) => (
        <View key={r.id} style={styles.reactie}>
          <Caption>
            {r.author_name} · {klokTijd(r.created_at, tz)}
          </Caption>
          <Body>{r.body}</Body>
          {r.author_id === userId ? (
            <Button variant="stil" onPress={() => void weg(r.id)}>
              Weghalen
            </Button>
          ) : null}
        </View>
      ))}

      <Field
        label={`Reageren op ${antwoord.display_name}`}
        hint="Een reactie is niet te bewerken. Weghalen kan wel."
        value={reactie}
        onChangeText={setReactie}
        multiline
        maxLength={1000}
        placeholder="Mooi dat je bent doorgegaan. Wat helpt je dinsdag?"
      />
      <Button
        variant="secundair"
        block
        busy={bezig}
        disabled={reactie.trim() === ''}
        onPress={() => void stuur()}
      >
        Reactie versturen
      </Button>

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------

interface Stand {
  readonly groep: Groep | null;
  readonly periode: Cycle;
  readonly antwoorden: readonly Antwoord[];
  readonly reacties: readonly Reactie[];
  /** Zijn er meer reacties dan er nu staan? */
  readonly reactiesMeer: boolean;
  /** Voorstel voor vraag 1, uit de eigen Dagzetten van deze periode. */
  readonly voorstel: string;
}

/**
 * Voegt een volgende pagina reacties toe, op tijd en dan op id.
 *
 * ⚠️ Ontdubbelen op id, want tussen twee pagina's kan er een reactie bijkomen en
 *    dan schuift de offset. Zonder dit staat dezelfde reactie twee keer op de
 *    kaart — en dat leest als iemand die zichzelf herhaalt.
 */
function voegReactiesSamen(
  bestaand: readonly Reactie[],
  nieuw: readonly Reactie[],
): readonly Reactie[] {
  const perId = new Map<string, Reactie>();
  for (const r of [...bestaand, ...nieuw]) perId.set(r.id, r);

  return [...perId.values()].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * ⚠️ Drie ronden voor het hele scherm en niet één per lid. Antwoorden, reacties en
 *    je eigen Dagzetten gaan parallel; de reacties worden hier plat opgehaald en in
 *    de browser gegroepeerd. Per antwoord bevragen is de N+1 die het beslisdocument
 *    voor het groepsoverzicht met naam noemt.
 *
 * ⚠️ De Dagzetten worden opgehaald over de gróepsperiode en niet over de eigen
 *    cyclus. `fetchDagzetten()` neemt een `Cycle`, en welke klok je erin stopt is
 *    hier de hele vraag: dit gesprek gaat over de week van de groep.
 */
async function laad(groupId: string, userId: string | null): Promise<Stand> {
  const groep = await fetchGroep(groupId);

  if (groep === null) {
    // ⚠️ Een niet-lid krijgt hetzelfde beeld als een groep die niet bestaat. Een
    //    lege periode is hier alleen een plaatshouder; er wordt niets mee gedaan.
    return {
      groep: null,
      periode: huidigeGroepsperiode({ huddle_day: 0, tz: 'UTC' }),
      antwoorden: [],
      reacties: [],
      reactiesMeer: false,
      voorstel: '',
    };
  }

  const periode = huidigeGroepsperiode(groep);

  const [antwoorden, reacties, dagzetten] = await Promise.all([
    fetchWeekafsluiting(groupId, periode),
    fetchWeekafsluitingReacties(groupId, periode),
    eigenDagzetten(userId, periode),
  ]);

  return {
    groep,
    periode,
    antwoorden,
    reacties: reacties.rijen,
    reactiesMeer: reacties.meer,
    voorstel: voorstelUitDagzetten(dagzetten),
  };
}

/**
 * ⚠️ Een mislukte ophaal van de Dagzetten mag het scherm niet slopen. Het voorstel
 *    is een gemak; de weekafsluiting is de feature. Zonder voorstel begint vraag 1
 *    gewoon leeg — en dat is beter dan een foutscherm voor iets dat optioneel is.
 */
async function eigenDagzetten(
  userId: string | null,
  periode: Cycle,
): Promise<readonly { readonly body: string; readonly local_date: string }[]> {
  if (userId === null || userId === '') return [];

  try {
    return await fetchDagzetten(userId, periode);
  } catch {
    return [];
  }
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  kop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  antwoord: { gap: 2 },
  reactie: { gap: 2, paddingTop: space.blokGap - 9 },
  acties: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
