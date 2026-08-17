import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/modules/auth';
import {
  beoordeel,
  fetchBeoordelingen,
  volgBeoordelingen,
  type TeBeoordelen,
  type Wachtrij,
} from '@/modules/completions';
import { space } from '@/shared/theme';
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
 * Beoordelen — QS8-62 en QS8-63.
 *
 * ⚠️ Twee gelijkwaardige acties, en dat is een acceptatiecriterium en geen
 *    smaakkwestie. De PRD noemde de tweede "request changes"; dat woord maakt
 *    van een vraag een afwijzing. Zou "Goedkeuren" primair zijn en "Vertel me
 *    meer" een stille tekstlink, dan is doorvragen sociaal duurder dan
 *    doorklikken — en dan keurt iedereen alles goed en zegt de goedkeuring
 *    niets meer.
 *
 * ⚠️ Alles wat je nodig hebt om te oordelen staat er meteen bij: het weekdoel,
 *    de vloer en het plafond, wat er gehaald is en de notitie. Beoordelen mag
 *    geen tweede scherm en geen wachttijd kosten, anders zakt de
 *    goedkeuringssnelheid — en dat is de succesmetriek uit de PRD (≥80% binnen
 *    48 uur).
 *
 * ⚠️ Deze lijst bevat uitsluitend afgeronde weken. Er komt nooit iemand in voor
 *    wat hij níét gedaan heeft (domeinregel 7).
 */
export default function Beoordelen() {
  const router = useRouter();
  const { userId } = useSession();

  const [wachtrij, setWachtrij] = useState<Wachtrij | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    let levend = true;

    fetchBeoordelingen()
      .then((uitkomst) => {
        if (!levend) return;
        setWachtrij(uitkomst);
        setError(null);
      })
      .catch((f: unknown) => {
        if (levend) setError(f);
      })
      .finally(() => {
        if (levend) setLoading(false);
      });

    return () => {
      levend = false;
    };
  }, [ronde]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  // ⚠️ Realtime en geen polling: het acceptatiecriterium is twee seconden. De
  //    opzegfunctie moet echt aangeroepen worden — een abonnement dat blijft
  //    hangen, telt door op een gratis tier.
  useEffect(() => {
    const stop = volgBeoordelingen(herlaad);
    return stop;
  }, [herlaad]);

  return (
    <Screen title="Beoordelen" eyebrow="JE BUDDY WACHT">
      <AsyncView
        loading={loading}
        error={error}
        data={wachtrij ?? undefined}
        isEmpty={(w) => w.rijen.length === 0}
        onRetry={herlaad}
        empty={{
          title: 'Niets te beoordelen',
          body:
            'Zodra een buddy een week afrondt, staat hij hier. Eén zin terug is genoeg — ' +
            'daar gaat het om.',
        }}
      >
        {(w) => (
          <View style={styles.lijst}>
            {w.rijen.map((item) => (
              <BeoordeelKaart
                key={item.completion_id}
                item={item}
                approverId={userId ?? ''}
                onKlaar={herlaad}
              />
            ))}

            {w.meer ? (
              <Caption>
                {w.rijen.length} van {w.totaal} wachten op je oordeel.
              </Caption>
            ) : null}
          </View>
        )}
      </AsyncView>

      <Button variant="stil" block onPress={() => router.back()}>
        Terug
      </Button>
    </Screen>
  );
}

function BeoordeelKaart({
  item,
  approverId,
  onKlaar,
}: {
  readonly item: TeBeoordelen;
  readonly approverId: string;
  readonly onKlaar: () => void;
}) {
  const [vraagt, setVraagt] = useState(false);
  const [vraag, setVraag] = useState('');
  const [bezig, setBezig] = useState<'goed' | 'meer' | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function verstuur(status: 'approved' | 'more_info') {
    setBezig(status === 'approved' ? 'goed' : 'meer');
    setFout(null);

    const uitkomst = await beoordeel(item.completion_id, item.group_id, approverId, {
      status,
      comment: status === 'more_info' ? vraag : null,
    });

    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    onKlaar();
  }

  const gehaald = item.achieved_level === 'ceiling' ? item.ceiling_text : item.floor_text;

  return (
    <Card>
      <View style={styles.kop}>
        <Avatar name={item.owner_name} url={item.owner_avatar} />
        <View style={styles.kopTekst}>
          <Subheading>{item.owner_name}</Subheading>
          <Caption>{item.goal_title}</Caption>
        </View>
      </View>

      <Body>{item.weekly_title}</Body>

      {/*
        ⚠️ "Vloer gehaald" is geen halve prestatie en de tekst zegt dat ook niet.
           Domeinregel 8: vloer gehaald betekent dat de week telt, de reeks loopt
           door en de goedkeuring verloopt identiek. Alleen de punten verschillen,
           en die zijn privé.
      */}
      <Caption muted={false}>
        {item.achieved_level === 'ceiling' ? 'Volle week gehaald' : 'De vloer gehaald'}
        {gehaald === null ? '' : ` — ${gehaald}`}
      </Caption>

      {item.note === null ? null : (
        <Card nested>
          <Body muted>&ldquo;{item.note}&rdquo;</Body>
        </Card>
      )}

      {vraagt ? (
        <>
          <Field
            label="Wat wil je weten?"
            hint="Een vraag, geen oordeel. De meeste onduidelijkheid is gewoon onduidelijkheid."
            value={vraag}
            onChangeText={setVraag}
            multiline
            maxLength={1000}
            placeholder="Hoe ver ben je gekomen met het tweede hoofdstuk?"
          />
          <Button
            variant="primair"
            block
            busy={bezig === 'meer'}
            onPress={() => void verstuur('more_info')}
          >
            Vraag versturen
          </Button>
          <Button variant="stil" block onPress={() => setVraagt(false)}>
            Toch niet
          </Button>
        </>
      ) : (
        /*
          ⚠️ Allebei `secundair`. Geen primair/secundair-verhouding, want die
             maakt van de ene knop het goede antwoord en van de andere een
             uitzondering.
        */
        <View style={styles.acties}>
          <Button variant="secundair" busy={bezig === 'goed'} onPress={() => void verstuur('approved')}>
            Goedkeuren
          </Button>
          <Button variant="secundair" onPress={() => setVraagt(true)}>
            Vertel me meer
          </Button>
        </View>
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  kop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  kopTekst: { flex: 1, gap: 2 },
  acties: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
