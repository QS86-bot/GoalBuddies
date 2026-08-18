import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { useProfiel, useSession } from '@/modules/auth';
import {
  bewaarChatCache,
  chatUitCache,
  cursorVan,
  fetchChat,
  fetchGroep,
  huidigeGroepsperiode,
  isSysteembericht,
  stuurBericht,
  verwijderBericht,
  voegSamen,
  volgChat,
  type ChatBericht,
  type Groep,
} from '@/modules/buddies';
import { space } from '@/shared/theme';
import { klokTijd } from '@/shared/time';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  ChatRegel,
  Field,
  Screen,
} from '@/shared/ui';

/**
 * De groepschat — QS8-69.
 *
 * ⚠️ Realtime en geen polling: het acceptatiecriterium is aflevering binnen twee
 *    seconden. Bij een signaal haalt dit scherm de nieuwste pagina op en voegt hem
 *    samen met wat er al staat (`voegSamen`). Het losse bericht uit de payload
 *    invoegen zou goedkoper zijn, maar die payload heeft geen naam en geen avatar —
 *    die staan in `profiles` — en dan heet een nieuw bericht "Een buddy" tot de
 *    volgende verversing.
 *
 * ⚠️ De chat leest bij een slechte verbinding uit de cache van de lopende
 *    groepsperiode. Een cache van een oudere periode wordt weggegooid en niet
 *    getoond: een gesprek van drie weken terug tonen als "de groep nu" is erger
 *    dan een leeg scherm, want dan denk je dat er niets gebeurd is.
 *
 * ⚠️ Wat hier staat, staat er omdat mensen het zelf getypt hebben, plus
 *    systeemberichten van de allowlist uit migratie 0025. Er is geen enkel
 *    berichttype dat een gemiste week, een verbroken reeks of een achterstand van
 *    iemand anders kan bevatten — de database laat het niet bestaan
 *    (domeinregel 7).
 */
export default function GroepChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const [groep, setGroep] = useState<Groep | null>(null);
  const [berichten, setBerichten] = useState<readonly ChatBericht[] | null>(null);
  const [meer, setMeer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [uitCache, setUitCache] = useState(false);
  const [ouderBezig, setOuderBezig] = useState(false);
  const [wegFout, setWegFout] = useState<string | null>(null);

  const lijst = useRef<FlatList<ChatBericht> | null>(null);

  /**
   * Het nieuwste bericht dat we al naar beneden gescrold hebben.
   *
   * ⚠️ Zonder dit springt "Ouder laden" je terug naar de onderkant. De lijst
   *    scrolt op `onContentSizeChange`, en die vuurt ook als er bovenaan iets
   *    bíjkomt — dus dan lees je precies niet wat je net opvroeg.
   */
  const laatstGezien = useRef<string | null>(null);

  const periodeStart = groep === null ? null : huidigeGroepsperiode(groep).startDate;

  // ---------------------------------------------------------------------------
  // Eerste lading: de groep, dan de cache, dan de server
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!id) return;
    let levend = true;

    (async () => {
      try {
        const g = await fetchGroep(id);
        if (!levend) return;
        setGroep(g);

        if (g === null) {
          setBerichten([]);
          return;
        }

        const start = huidigeGroepsperiode(g).startDate;

        // ⚠️ Eerst de cache op het scherm en dán de server. Bij een trage
        //    verbinding staat er zo binnen een oogwenk iets in plaats van een
        //    spinner, en de server overschrijft het zodra hij antwoordt.
        const bewaard = await chatUitCache(id, start);
        if (levend && bewaard !== null && bewaard.length > 0) {
          setBerichten(bewaard);
          setUitCache(true);
          setLoading(false);
        }

        const pagina = await fetchChat(id);
        if (!levend) return;

        setBerichten(pagina.berichten);
        setMeer(pagina.meer);
        setUitCache(false);
        setError(null);
        void bewaarChatCache(id, start, pagina.berichten);
      } catch (fout: unknown) {
        // ⚠️ Staat er al iets uit de cache, dan is dit geen foutscherm maar een
        //    regel erboven. Het gesprek dat je al las weghalen voor een melding
        //    dat het internet weg is, is precies het tegenovergestelde van wat een
        //    cache moet doen.
        if (levend) setError(fout);
      } finally {
        if (levend) setLoading(false);
      }
    })();

    return () => {
      levend = false;
    };
  }, [id]);

  // ---------------------------------------------------------------------------
  // Realtime
  // ---------------------------------------------------------------------------
  const verversNieuwste = useCallback(() => {
    if (!id) return;

    fetchChat(id)
      .then((pagina) => {
        setBerichten((oud) => {
          const samen = voegSamen(oud ?? [], pagina.berichten);
          if (periodeStart !== null) void bewaarChatCache(id, periodeStart, samen);
          return samen;
        });
        setUitCache(false);
        setError(null);
      })
      .catch(() => {
        // Stil: een mislukte verversing mag het gesprek dat er staat niet
        // vervangen door een foutscherm. De volgende gebeurtenis of het
        // heropenen van het scherm probeert het opnieuw.
      });
  }, [id, periodeStart]);

  useEffect(() => {
    if (!id) return;
    // ⚠️ De opzegfunctie moet echt aangeroepen worden: een abonnement dat blijft
    //    hangen, telt door op een gratis tier.
    return volgChat(id, verversNieuwste);
  }, [id, verversNieuwste]);

  // ---------------------------------------------------------------------------
  // Terug in de tijd
  // ---------------------------------------------------------------------------
  async function laadOuder() {
    if (!id || berichten === null || ouderBezig) return;

    const cursor = cursorVan(berichten);
    if (cursor === null) return;

    setOuderBezig(true);
    try {
      const pagina = await fetchChat(id, cursor);
      setBerichten((oud) => voegSamen(oud ?? [], pagina.berichten));
      setMeer(pagina.meer);
    } catch (fout: unknown) {
      setError(fout);
    } finally {
      setOuderBezig(false);
    }
  }

  /**
   * Een eigen bericht weghalen.
   *
   * ⚠️ Meteen uit de lijst en niet wachten op de server, want de eigen
   *    DELETE-gebeurtenis komt hier niet terug: het abonnement staat bewust
   *    alleen op INSERT. Mislukt het, dan komt de melding en zet de volgende
   *    verversing hem terug — dat is beter dan een regel die blijft staan zonder
   *    dat iemand weet waarom.
   */
  async function haalWeg(berichtId: string) {
    setBerichten((oud) => (oud ?? []).filter((b) => b.id !== berichtId));

    const uitkomst = await verwijderBericht(berichtId);
    if (!uitkomst.ok) {
      setWegFout(uitkomst.melding);
      verversNieuwste();
      return;
    }

    setWegFout(null);
    if (periodeStart !== null && id) {
      void bewaarChatCache(id, periodeStart, (berichten ?? []).filter((b) => b.id !== berichtId));
    }
  }

  const tz = profiel?.tz ?? groep?.tz ?? 'UTC';

  return (
    <Screen
      title={groep?.name ?? 'Groepschat'}
      eyebrow="GROEPSCHAT"
      scroll={false}
    >
      {/*
        ⚠️ `data` is de groep plús de berichten, en `isEmpty` kijkt naar de groep.
           Met alleen de berichtenlijst erin kreeg een niet-lid "Nog geen
           berichten" te zien plus een invoerveld dat bij elke poging weigert —
           en dat is precies het orakel dat `fetchGroep()` juist vermijdt: een
           groep waar je niet in zit hoort er hetzelfde uit te zien als een groep
           die niet bestaat.

           Een lege lijst in een groep waar je wél in zit is géén leegstaat: dan
           hoort de invoerbalk er te staan. Vandaar de `ListEmptyComponent`.
      */}
      <AsyncView
        loading={loading}
        error={berichten === null ? error : null}
        data={berichten === null ? undefined : { groep, rijen: berichten }}
        isEmpty={(s) => s.groep === null}
        onRetry={verversNieuwste}
        empty={{
          title: 'Deze groep is er niet, of niet voor jou',
          body:
            'Je bent geen lid van deze groep, of hij bestaat niet meer. Vraag om een ' +
            'nieuwe uitnodigingslink als je erbij hoort.',
        }}
      >
        {({ rijen }) => (
          <View style={styles.vult}>
            {uitCache ? (
              <Caption>
                Je leest de bewaarde berichten van deze week. Zodra er weer verbinding is,
                vult de rest zich aan.
              </Caption>
            ) : null}

            {wegFout === null ? null : <Caption danger>{wegFout}</Caption>}

            <FlatList
              ref={lijst}
              style={styles.vult}
              data={rijen}
              keyExtractor={(bericht) => bericht.id}
              contentContainerStyle={styles.rijen}
              // ⚠️ Alleen naar beneden als er onderaan iets nieuws is bijgekomen.
              //    Zonder deze vergelijking springt "Ouder laden" je terug naar de
              //    onderkant, want dan verandert de inhoudshoogte ook.
              onContentSizeChange={() => {
                const nieuwste = rijen.at(-1)?.id ?? null;
                if (nieuwste === laatstGezien.current) return;
                laatstGezien.current = nieuwste;
                lijst.current?.scrollToEnd({ animated: false });
              }}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                meer ? (
                  <Button variant="stil" block busy={ouderBezig} onPress={() => void laadOuder()}>
                    Ouder laden
                  </Button>
                ) : null
              }
              ListEmptyComponent={
                <Card nested>
                  <Body muted>
                    Nog geen berichten. Eén zin is genoeg — &ldquo;wat ga je deze week
                    doen?&rdquo; werkt beter dan een lange inleiding.
                  </Body>
                </Card>
              }
              renderItem={({ item }) =>
                isSysteembericht(item) ? (
                  <ChatRegel body={item.body} />
                ) : (
                  <ChatRegel
                    body={item.body}
                    senderName={item.sender_name}
                    senderAvatar={item.sender_avatar}
                    vanMij={item.sender_id === userId}
                    tijd={klokTijd(item.created_at, tz)}
                    {...(item.sender_id === userId
                      ? { onWeghalen: () => void haalWeg(item.id) }
                      : {})}
                  />
                )
              }
            />

            <Invoer
              groupId={id ?? ''}
              senderId={userId ?? null}
              onVerstuurd={verversNieuwste}
            />
          </View>
        )}
      </AsyncView>

      <Button variant="stil" block onPress={() => router.replace(`/groep/${id}`)}>
        Terug naar de groep
      </Button>
    </Screen>
  );
}

/**
 * De invoerbalk.
 *
 * ⚠️ Het veld wordt pas geleegd nadat de server het bericht heeft aangenomen. Een
 *    optimistische leging voelt sneller, maar bij een mislukte verzending is je
 *    zin dan weg én is er niets verstuurd — en dat is de ergste van de twee.
 */
function Invoer({
  groupId,
  senderId,
  onVerstuurd,
}: {
  readonly groupId: string;
  readonly senderId: string | null;
  readonly onVerstuurd: () => void;
}) {
  const [tekst, setTekst] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function verstuur() {
    // ⚠️ Zonder sessie helemaal niet versturen. Een lege afzender liep de server
    //    in en kwam terug als een weigering van RLS, waarna het scherm zei dat je
    //    misschien geen lid meer was van de groep — een beschuldiging voor iets
    //    dat gewoon een sessie is die nog laadt. Zelfde les als in EPIC 6.
    if (senderId === null || senderId === '' || groupId === '') {
      setFout('Je sessie is nog aan het laden. Probeer het over een tel opnieuw.');
      return;
    }

    setBezig(true);
    setFout(null);

    const uitkomst = await stuurBericht(groupId, senderId, tekst);
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setTekst('');
    onVerstuurd();
  }

  return (
    <View style={styles.invoer}>
      <Field
        label="Nieuw bericht"
        value={tekst}
        onChangeText={setTekst}
        multiline
        maxLength={4000}
        placeholder="Zeg iets tegen je groep"
        {...(fout === null ? {} : { error: fout })}
      />
      <Button
        variant="primair"
        block
        busy={bezig}
        disabled={tekst.trim() === ''}
        onPress={() => void verstuur()}
      >
        Versturen
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  vult: { flex: 1 },
  rijen: { gap: space.blokGap - 6, paddingBottom: space.blokGap },
  invoer: { gap: space.blokGap - 6, paddingTop: space.blokGap - 6 },
});
