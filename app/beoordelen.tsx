import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/modules/auth';
import {
  beoordeel,
  fetchBeoordelingen,
  INTREKVENSTER_MINUTEN,
  trekGoedkeuringIn,
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
  const [pagina, setPagina] = useState(0);
  const [aanHetTypen, setAanHetTypen] = useState(false);
  const [verouderd, setVerouderd] = useState(false);
  /**
   * ⚠️ Een lijst en niet één regel. Het scherm moedigt aan om drie buddy's
   *    achter elkaar te beoordelen, en met één plek werd de strook van de eerste
   *    stilzwijgend vervangen door die van de tweede — terwijl het venster van
   *    vijftien minuten op de server gewoon doorliep. Je kon dus niets meer
   *    terugdraaien wat je nog wél mocht terugdraaien, zonder dat iets dat zei.
   */
  const [terug, setTerug] = useState<readonly { id: string; naam: string }[]>([]);

  useEffect(() => {
    let levend = true;

    fetchBeoordelingen({ pagina })
      .then((uitkomst) => {
        if (!levend) return;
        setWachtrij(uitkomst);
        setVerouderd(false);
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
  }, [ronde, pagina]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  /**
   * ⚠️ Realtime en geen polling: het acceptatiecriterium is twee seconden. Maar
   *    níét herladen terwijl iemand een vraag zit te typen — dan verdwijnt zijn
   *    half getypte zin met de kaart mee, zonder een woord uitleg, en denkt hij
   *    dat hij iets kapot heeft gemaakt.
   *
   *    In plaats daarvan komt er een regel te staan dat er iets veranderd is,
   *    met een knop. Verversen is dan zijn keuze.
   *
   * ⚠️ De opzegfunctie moet echt aangeroepen worden: een abonnement dat blijft
   *    hangen, telt door op een gratis tier.
   */
  useEffect(() => {
    const stop = volgBeoordelingen(() => {
      if (aanHetTypen) setVerouderd(true);
      else herlaad();
    });
    return stop;
  }, [herlaad, aanHetTypen]);

  return (
    <Screen title="Beoordelen">
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
            {/*
              ⚠️ Niet stilzwijgend herladen terwijl er getypt wordt. Deze regel
                 is de vervanging: er is iets veranderd, en verversen is jouw
                 keuze in plaats van iets dat je zin opeet.
            */}
            {verouderd ? (
              <Card nested>
                <Body muted>Er is intussen iets veranderd in de lijst.</Body>
                <Button onPress={herlaad}>Lijst verversen</Button>
              </Card>
            ) : null}

            {terug.map((item) => (
              <Terugdraaien
                key={item.id}
                approvalId={item.id}
                naam={item.naam}
                onWeg={() => setTerug((r) => r.filter((x) => x.id !== item.id))}
                onTeruggedraaid={() => {
                  setTerug((r) => r.filter((x) => x.id !== item.id));
                  herlaad();
                }}
              />
            ))}

            {w.rijen.map((item) => (
              <BeoordeelKaart
                key={item.completion_id}
                item={item}
                approverId={userId ?? null}
                onKlaar={(approvalId, status) => {
                  if (status === 'approved') {
                    setTerug((r) => [...r, { id: approvalId, naam: item.owner_name }]);
                  }
                  herlaad();
                }}
                onTypen={setAanHetTypen}
              />
            ))}

            {w.meer || pagina > 0 ? (
              <View style={styles.acties}>
                {pagina > 0 ? (
                  <Button onPress={() => setPagina((p) => Math.max(0, p - 1))}>Vorige</Button>
                ) : null}
                {w.meer ? (
                  <Button onPress={() => setPagina((p) => p + 1)}>Meer laden</Button>
                ) : null}
              </View>
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

/**
 * De strook waarmee je een goedkeuring terugdraait — Q-TODO A19.
 *
 * ⚠️ Gekozen boven een bevestigingsstap vóór het boeken. Twee gelijkwaardige
 *    knoppen zonder tussenstap is een acceptatiecriterium van 6.1; een
 *    bevestiging kost die vlotheid bij élke goedkeuring, terwijl de vergissing
 *    zeldzaam is. Deze strook kost niets tot je hem nodig hebt.
 *
 * ⚠️ Verdwijnt niet vanzelf na een paar seconden. Een strook die wegtikt terwijl
 *    je nog leest wat er staat, is precies zo bruikbaar als geen strook — en dit
 *    is het enige pad terug.
 */
function Terugdraaien({
  approvalId,
  naam,
  onWeg,
  onTeruggedraaid,
}: {
  readonly approvalId: string;
  readonly naam: string;
  readonly onWeg: () => void;
  readonly onTeruggedraaid: () => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function draaiTerug() {
    setBezig(true);
    setFout(null);

    const uitkomst = await trekGoedkeuringIn(approvalId);
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    onTeruggedraaid();
  }

  return (
    <Card nested>
      <Body>Je hebt de week van {naam} bevestigd.</Body>
      {/*
        ⚠️ "Verkeerde buddy?" en niet "weet je het zeker?". De vergissing die dit
           opvangt is een dikke duim op een klein scherm, en die benoem je zonder
           iemand het gevoel te geven dat hij iets ergs gedaan heeft.
      */}
      <Caption>
        Verkeerde buddy? Je kunt dit nog {INTREKVENSTER_MINUTEN} minuten terugdraaien.
      </Caption>
      <View style={styles.acties}>
        <Button variant="secundair" busy={bezig} onPress={() => void draaiTerug()}>
          Terugdraaien
        </Button>
        <Button variant="stil" disabled={bezig} onPress={onWeg}>
          Klopt zo
        </Button>
      </View>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

function BeoordeelKaart({
  item,
  approverId,
  onKlaar,
  onTypen,
}: {
  readonly item: TeBeoordelen;
  readonly approverId: string | null;
  readonly onKlaar: (approvalId: string, status: 'approved' | 'more_info') => void;
  readonly onTypen: (bezig: boolean) => void;
}) {
  const [vraagt, setVraagt] = useState(false);
  const [vraag, setVraag] = useState('');
  const [bezig, setBezig] = useState<'goed' | 'meer' | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  function zetVraagt(aan: boolean) {
    setVraagt(aan);
    onTypen(aan);
  }

  async function verstuur(status: 'approved' | 'more_info') {
    // ⚠️ Zonder sessie helemaal niet versturen. Een lege `approverId` liep de
    //    server in en kwam terug als een weigering van RLS, waarna het scherm
    //    zei dat je misschien geen lid meer was van de groep. Dat is een
    //    beschuldiging voor iets dat gewoon een sessie is die nog laadt.
    if (approverId === null || approverId === '') {
      setFout('Je sessie is nog aan het laden. Probeer het over een tel opnieuw.');
      return;
    }

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

    onTypen(false);
    onKlaar(uitkomst.waarde, status);
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
        ⚠️ "Week afgerond" voor allebei, en dat is geen slordigheid maar
           domeinregel 8. Hier stond "Volle week gehaald" tegenover "De vloer
           gehaald", en het woord "volle" doet dan al het werk: dan is die van
           jou dus niet vol. Dat is een oordeel over iemands slechtste week,
           zichtbaar voor een ander.

           Vloer gehaald betekent dat de week telt: de reeks loopt door en de
           goedkeuring verloopt identiek. Alleen de punten verschillen, en die
           zijn privé. Wát er gehaald is staat er wel bij — de beoordelaar moet
           weten waar hij ja tegen zegt — maar zonder waardeoordeel ervoor.
      */}
      <Caption muted={false}>
        Week afgerond{gehaald === null ? '' : ` — ${gehaald}`}
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
          <Button variant="stil" block onPress={() => zetVraagt(false)}>
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
          {/* Niet aanklikbaar terwijl de goedkeuring onderweg is: anders klapt
              het formulier open bovenop een verzoek dat al loopt. */}
          <Button variant="secundair" disabled={bezig !== null} onPress={() => zetVraagt(true)}>
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
