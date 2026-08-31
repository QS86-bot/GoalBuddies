import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession } from '@/modules/auth';
import {
  bewaarWeekafsluiting,
  fetchGroep,
  fetchWeekafsluiting,
  fetchWeekafsluitingReacties,
  type ReactieCursor,
  groepeerReacties,
  heeftInhoud,
  huddledagLabel,
  huidigeGroepsperiode,
  reageerOpAntwoord,
  verwijderReactie,
  verwijderWeekafsluiting,
  voegReactiesSamen,
  beginwaardeVraag1,
  magOvernemenUitDagzetten,
  voorstelUitDagzetten,
  vragen,
  type Antwoord,
  type AntwoordVeld,
  type Groep,
  type Reactie,
} from '@/modules/buddies';
import { fetchDagzetten } from '@/modules/completions';
import { t } from '@/shared/i18n';
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
  useVertrekwacht,
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
  const [reactieCursor, setReactieCursor] = useState<ReactieCursor | null>(null);
  const [meerBezig, setMeerBezig] = useState(false);
  const [vuil, setVuil] = useState(false);
  const [tegengehouden, setTegengehouden] = useState(false);

  /**
   * ⚠️ **De uitgangen die niet van de app zijn** — verversen, het tabblad
   *    sluiten, de hardwareknop op Android. De knop hieronder was sinds EPIC 7
   *    gedekt, deze niet, en juist vraag 2 is de enige plek in de app waar
   *    iemand zijn eigen tegenslag opschrijft. Zie
   *    `docs/decisions/2026-08-27-de-uitgangen-van-de-weekafsluiting.md`.
   */
  useVertrekwacht(vuil, () => setTegengehouden(true));

  useEffect(() => {
    if (!id) return;
    let levend = true;

    laad(id, userId ?? null)
      .then((uitkomst) => {
        if (!levend) return;
        setStand(uitkomst);
        // ⚠️ De cursor komt uit de zojuist geladen eerste pagina en wordt niet op
        //    null gezet. Dat stond hier wél toen dit een paginateller was — daar
        //    was nul de eerste pagina. Een cursor van null betekent iets anders:
        //    "begin opnieuw vooraan", en dan haalt "meer reacties" dezelfde
        //    honderd rijen nog een keer op.
        setReactieCursor(uitkomst.reactiesCursor);
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
      // ⚠️ Geen cursor betekent "opnieuw de eerste pagina", en dat zou de knop
      //    in een lus zetten. Er is er altijd een zolang `meer` waar is, maar
      //    dat is een aanname over een andere functie en geen garantie.
      if (reactieCursor === null) return;

      const volgende = await fetchWeekafsluitingReacties(id, stand.periode, {
        na: reactieCursor,
      });

      setStand((oud) =>
        oud === null
          ? oud
          : { ...oud, reacties: voegReactiesSamen(oud.reacties, volgende.rijen), reactiesMeer: volgende.meer },
      );
      setReactieCursor(volgende.volgende);
    } catch (fout: unknown) {
      setError(fout);
    } finally {
      setMeerBezig(false);
    }
  }

  return (
    <Screen
      terug={{ naar: `/groep/${id}` }}
      title={t('weekafsluiting.titel')}
      eyebrow={
        stand?.groep
          ? t('weekafsluiting.eyebrow', {
              dag: huddledagLabel(stand.groep.huddle_day).toUpperCase(),
            })
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
          title: t('weekafsluiting.geen_lid_titel'),
          body: t('weekafsluiting.geen_lid_tekst'),
        }}
      >
        {(s) => {
          const mijnAntwoord = s.antwoorden.find((a) => a.user_id === userId) ?? null;

          return (
          <View style={styles.lijst}>
            {/*
              ⚠️ De `key` is geen sleutel voor een lijst maar een vers begin.
                 `MijnAntwoorden` zet zijn invoervelden en zijn open/dicht-stand in
                 `useState`-initializers, en die lopen één keer. Zonder deze key
                 blijft die stand staan als het onderliggende antwoord verandert —
                 dan zie je na "Bijwerken" nog de oude tekst, en overschrijf je met
                 opslaan stilzwijgend een nieuwere versie. Bevinding van de
                 code-review op EPIC 7.

                 De key verandert bij een andere groep, een andere periode, en bij de
                 overgang tussen "nog geen antwoord" en "wel een antwoord" — dus ook
                 na opslaan en na terugnemen. Hij verandert níet als er alleen een
                 reactie bijkomt, want dan mag getypte tekst juist blijven staan.
            */}
            <MijnAntwoorden
              key={`${id ?? ''}:${s.periode.startDate}:${mijnAntwoord?.review_id ?? 'nieuw'}`}
              groupId={id ?? ''}
              userId={userId ?? null}
              periode={s.periode}
              mijnAntwoord={mijnAntwoord}
              voorstel={s.voorstel}
              reactiesOpMij={
                mijnAntwoord === null
                  ? 0
                  : s.reacties.filter((r) => r.week_review_id === mijnAntwoord.review_id).length
              }
              // ⚠️ Is de tekst gedeeld, dan is er niets meer tegen te houden en
              //    hoort de uitleg ook weg te zijn. Hier en niet in een effect:
              //    dit ís de gebeurtenis waar het van afhangt.
              onVuil={(nu: boolean) => {
                setVuil(nu);
                if (!nu) setTegengehouden(false);
              }}
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
                {t('weekafsluiting.meer_reacties')}
              </Button>
            ) : null}
          </View>
          );
        }}
      </AsyncView>

      {/*
        ⚠️ Weg navigeren met onopgeslagen tekst vraagt eerst een tweede tik. Deze knop
           dekt de uitgang binnen de app; `useVertrekwacht` hierboven dekt sinds
           27-08-2026 het verversen, het sluiten van het tabblad en de hardwareknop
           op Android. De terugknop van de browser blijft over — expo-router 57
           exporteert geen manier om die tegen te houden, en dat staat als bevinding
           in `docs/ENGINEER-REVIEW.md`.
      */}
      {vuil ? (
        <>
          <Caption danger>{t('weekafsluiting.niet_gedeeld')}</Caption>
          {tegengehouden ? <Caption>{t('weekafsluiting.terugknop_tegengehouden')}</Caption> : null}
          <Button variant="stil" block onPress={() => router.replace(`/groep/${id}`)}>
            {t('weekafsluiting.toch_weg')}
          </Button>
        </>
      ) : (
        <Button variant="stil" block onPress={() => router.replace(`/groep/${id}`)}>
          {t('weekafsluiting.terug')}
        </Button>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Je eigen drie antwoorden
// ---------------------------------------------------------------------------

/**
 * ⚠️ **Vraag 1 begint leeg, en dat is sinds 27-08-2026 zo.** Hij stond
 *    voorgevuld met je eigen Dagzetten van deze periode, met een hint eronder
 *    die zei waar die tekst vandaan kwam. Dat was de énige plek in de app waar
 *    privé tekst zonder tweede handeling in een niet-privé veld terechtkwam.
 *
 *    De Dagzet is standaard privé (domeinregel 9); de weekafsluiting is dat
 *    niet. Met een voorinvulling is de standaard dus "delen" en moet de
 *    gebruiker actief wegkijken en wissen om dat níét te doen. Dat is de
 *    omgekeerde volgorde van wat dit project overal elders aanhoudt: een
 *    commitment device wordt nooit stilzwijgend geactiveerd (domeinregel 5), en
 *    voor elk nieuw groepszichtbaar oppervlak is beschermd het antwoord tot
 *    iemand het tegendeel besluit (A41).
 *
 *    Een hint repareert dat niet. Hij beschermt alleen wie hem leest vóór hij op
 *    "Delen met mijn groep" drukt, en hij stond er bovendien óók als er
 *    helemaal geen Dagzetten waren — dan beweerde hij iets dat niet klopte.
 *
 * ⚠️ Het gemak blijft: staan er Dagzetten, dan verschijnt er een knop die ze
 *    overneemt. Eén tik in plaats van nul, en de standaard is weer privé.
 */
function MijnAntwoorden({
  groupId,
  userId,
  periode,
  mijnAntwoord,
  voorstel,
  reactiesOpMij,
  onVuil,
  onGewijzigd,
}: {
  readonly groupId: string;
  readonly userId: string | null;
  readonly periode: Cycle;
  readonly mijnAntwoord: Antwoord | null;
  readonly voorstel: string;
  /** Hoeveel reacties er onder je antwoord staan. Nodig voor de waarschuwing. */
  readonly reactiesOpMij: number;
  /** Meldt of er onopgeslagen tekst staat, zodat het scherm kan waarschuwen. */
  readonly onVuil: (vuil: boolean) => void;
  readonly onGewijzigd: () => void;
}) {
  const [open, setOpen] = useState(mijnAntwoord === null);
  const [did, setDid] = useState(beginwaardeVraag1(mijnAntwoord?.did_text));
  const [blocked, setBlocked] = useState(mijnAntwoord?.blocked_text ?? '');
  const [next, setNext] = useState(mijnAntwoord?.next_text ?? '');
  const [bezig, setBezig] = useState<'opslaan' | 'weg' | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [wilWeg, setWilWeg] = useState(false);

  /**
   * ⚠️ Staat er tekst die nog niet verstuurd is? Het scherm gebruikt dat om te
   *    waarschuwen voordat je weg navigeert. Zonder die waarschuwing kost één
   *    misplaatste tik je hele weekafsluiting — inclusief vraag 2, de enige plek
   *    waar je je tegenslag mag opschrijven, en precies de tekst die je niet
   *    nog een keer wil typen. Bevinding van de gebruikersreview op EPIC 7.
   */
  const vuil =
    open &&
    (did.trim() !== (mijnAntwoord?.did_text ?? '').trim() ||
      blocked.trim() !== (mijnAntwoord?.blocked_text ?? '').trim() ||
      next.trim() !== (mijnAntwoord?.next_text ?? '').trim());

  useEffect(() => {
    onVuil(vuil);
  }, [vuil, onVuil]);

  // ⚠️ Getypeerd op `AntwoordVeld` en niet op `string`: zo vangt de compiler een
  //    veld dat in vragen() staat maar hier niet, in plaats van het stil over te slaan.
  const waarden: Record<
    AntwoordVeld,
    { readonly waarde: string; readonly zet: (t: string) => void }
  > = {
    did_text: { waarde: did, zet: setDid },
    blocked_text: { waarde: blocked, zet: setBlocked },
    next_text: { waarde: next, zet: setNext },
  };

  async function bewaar() {
    if (userId === null || userId === '' || groupId === '') {
      setFout(t('weekafsluiting.sessie_laadt'));
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
    setWilWeg(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    // ⚠️ Geen handmatige reset van de velden: de `key` op deze component maakt hem
    //    vers zodra `review_id` van uuid naar 'nieuw' gaat. Twee bronnen van
    //    waarheid voor dezelfde stand is precies hoe dit soort formulieren scheef
    //    gaat staan.
    onGewijzigd();
  }

  if (!open) {
    return (
      <Card>
        <Subheading>{t('weekafsluiting.je_hebt_gedeeld')}</Subheading>
        <Body muted>{t('weekafsluiting.staat_op_kaart')}</Body>

        {/*
          ⚠️ Terugnemen ging met één tik, en dat kon niet blijven. `week_reviews`
             cascadeert naar `week_review_replies`, dus je haalt niet alleen je eigen
             tekst weg maar ook de aanmoediging die je buddy eronder zette — zonder
             dat zij dat weet en zonder dat jij het zag aankomen. In een groep van
             drie is dat precies het soort moment dat vertrouwen kost. Bevinding van
             de gebruikersreview op EPIC 7.

             Een tweestap en geen `Alert`: die is op react-native-web niet
             betrouwbaar, en dit werkt op web en native hetzelfde.
        */}
        {wilWeg ? (
          <>
            <Body>
              {reactiesOpMij === 0
                ? t('weekafsluiting.terugnemen_uitleg')
                : reactiesOpMij === 1
                  ? t('weekafsluiting.terugnemen_een_reactie')
                  : t('weekafsluiting.terugnemen_reacties', { n: reactiesOpMij })}
            </Body>
            <View style={styles.acties}>
              <Button variant="secundair" busy={bezig === 'weg'} onPress={() => void haalWeg()}>
                {t('weekafsluiting.ja_terugnemen')}
              </Button>
              <Button variant="stil" onPress={() => setWilWeg(false)}>
                {t('weekafsluiting.toch_niet')}
              </Button>
            </View>
          </>
        ) : (
          <View style={styles.acties}>
            <Button variant="secundair" onPress={() => setOpen(true)}>
              {t('weekafsluiting.bijwerken')}
            </Button>
            <Button variant="stil" onPress={() => setWilWeg(true)}>
              {t('weekafsluiting.terugnemen')}
            </Button>
          </View>
        )}

        {fout === null ? null : <Caption danger>{fout}</Caption>}
      </Card>
    );
  }

  return (
    <Card>
      <Subheading>{t('weekafsluiting.drie_vragen')}</Subheading>
      <Body muted>{t('weekafsluiting.mogen_leeg')}</Body>

      {vragen().map((vraag) => {
        const veld = waarden[vraag.veld];
        if (veld === undefined) return null;

        return (
          <View key={vraag.veld} style={styles.antwoord}>
            <Field
              label={vraag.label}
              hint={vraag.hint}
              value={veld.waarde}
              onChangeText={veld.zet}
              multiline
              maxLength={2000}
              placeholder={vraag.placeholder}
            />

            {/*
              ⚠️ Alleen bij vraag 1, alleen als er Dagzetten zijn, en alleen
                 zolang het veld leeg is. Die derde voorwaarde is er om te
                 voorkomen dat één tik getypte tekst overschrijft — overnemen is
                 een gemak en mag nooit iets weggooien.
            */}
            {vraag.veld === 'did_text' &&
            magOvernemenUitDagzetten({ voorstel, huidig: did }) ? (
              <>
                <Button variant="secundair" onPress={() => setDid(voorstel)}>
                  {t('weekafsluiting.v1.uit_dagzetten')}
                </Button>
                <Caption>{t('weekafsluiting.v1.uit_dagzetten_uitleg')}</Caption>
              </>
            ) : null}
          </View>
        );
      })}

      <Button variant="primair" block busy={bezig === 'opslaan'} onPress={() => void bewaar()}>
        {t('weekafsluiting.delen')}
      </Button>

      {mijnAntwoord === null ? null : (
        <Button variant="stil" block onPress={() => setOpen(false)}>
          {t('weekafsluiting.toch_niet_bijwerken')}
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
      <Subheading>{t('weekafsluiting.wat_gedeeld')}</Subheading>

      {zichtbaar.length === 0 ? (
        <Body muted>{t('weekafsluiting.nog_niemand')}</Body>
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
      setFout(t('weekafsluiting.sessie_laadt'));
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

      {vragen().map((vraag) => {
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
              {t('weekafsluiting.weghalen')}
            </Button>
          ) : null}
        </View>
      ))}

      <Field
        label={t('weekafsluiting.reageren_op', { naam: antwoord.display_name })}
        hint={t('weekafsluiting.reactie_hint')}
        value={reactie}
        onChangeText={setReactie}
        multiline
        maxLength={1000}
        placeholder={t('weekafsluiting.reactie_voorbeeld')}
      />
      <Button
        variant="secundair"
        block
        busy={bezig}
        disabled={reactie.trim() === ''}
        onPress={() => void stuur()}
      >
        {t('weekafsluiting.reactie_versturen')}
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
  /** Waar de volgende pagina begint — null als er niets meer volgt. */
  readonly reactiesCursor: ReactieCursor | null;
  /** Voorstel voor vraag 1, uit de eigen Dagzetten van deze periode. */
  readonly voorstel: string;
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
      reactiesCursor: null,
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
    reactiesCursor: reacties.volgende,
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
