import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  signOut,
  updateProfiel,
  useProfiel,
  verwijderMijnAccount,
  type Profiel as ProfielRij,
} from '@/modules/auth';
import { fetchBuddyBijdrage } from '@/modules/completions';
import {
  huidigeMeldingenstand,
  registreerPushToken,
  zetMeldingenAan,
  type Meldingenstand,
} from '@/modules/notifications';
import { clientEnv } from '@/lib/env';
import { huidigInstallatieadvies } from '@/shared/pwa';
import { t } from '@/shared/i18n';
import { space, useThemePreference, type ThemePreference } from '@/shared/theme';
import type { Weekday } from '@/shared/time';
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
  useVieringenAan,
  WeekStartKeuze,
} from '@/shared/ui';

/**
 * Profiel — reeks, punten, weekpassen en instellingen.
 *
 * ⚠️ Dit is de enige plek waar punten mogen staan. `points_ledger` en het
 *    puntentotaal zijn uitsluitend voor de eigenaar leesbaar (domeinregel 10):
 *    een dalend totaal is zichtbaar bewijs van een gemiste week, en dat botst
 *    met domeinregel 7. De groep ziet De Ketting en mijlpalen, nooit dit scherm.
 */
export default function Profiel() {
  const { profiel, loading, error, zetProfiel } = useProfiel();

  return (
    <Screen title={t('profiel.titel')}>
      <AsyncView
        loading={loading}
        error={error}
        data={profiel ?? undefined}
        isEmpty={() => false}
        empty={{
          title: t('profiel.leeg_titel'),
          body: t('profiel.leeg_tekst'),
        }}
      >
        {(p) => (
          <View style={styles.blokken}>
            <Card>
              <View style={styles.kop}>
                <Avatar name={p.display_name} url={p.avatar_url} size={44} />
                <View style={styles.kopTekst}>
                  <Subheading>{p.display_name}</Subheading>
                  <Caption>
                    {p.wants_own_goal ? t('profiel.eigen_doel') : t('profiel.als_buddy')}
                  </Caption>
                </View>
              </View>
            </Card>

            {/*
              ⚠️ Hier stond een `StreakCounter` met een hardgecodeerde `cycles={0}`.
                 Zolang nergens anders een reeks stond, was dat een plaatshouder.
                 Sinds QS8-75 toont "Vandaag" de échte reeks per doel, en dan is
                 dit geen plaatshouder meer maar een tegenspraak: acht weken op
                 rij op het ene scherm, "Nog geen reeks" op het andere. Een
                 gebruiker leest dat niet als een halfafgemaakte functie maar als
                 een rekenfout.

                 Een teller hoort hier ook inhoudelijk niet: een reeks is per
                 dóél (`user_streaks` heeft de sleutel `(user_id, goal_id)`), dus
                 één getal op een profielpagina zou moeten kiezen wélk doel — en
                 die keuze bestaat niet. De uitleg blijft, de tegenspraak gaat weg.
            */}
            <Card>
              <Subheading>{t('profiel.reeks_titel')}</Subheading>
              <Caption>{t('profiel.reeks_uitleg')}</Caption>
            </Card>

            <BuddyBijdrage userId={p.id} />

            <WeekStartInstelling
              waarde={p.week_start_day as Weekday}
              userId={p.id}
              onOpgeslagen={zetProfiel}
            />

            <Meldingen userId={p.id} />

            <ThemaKeuze />

            <VieringKeuze />

            <Card nested>
              <Subheading>{t('profiel.uitloggen_kop')}</Subheading>
              <Body muted>{t('profiel.uitloggen_uitleg')}</Body>
              <Button onPress={() => void signOut()}>{t('profiel.uitloggen_knop')}</Button>
            </Card>

            <AccountVerwijderen />
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

/**
 * Je account verwijderen — Q-TODO A3, en een AVG-verplichting.
 *
 * ⚠️ Onomkeerbaar, dus met een tussenstap die je moet uittypen. Een knop met
 *    "weet je het zeker?" ernaast is op een telefoon één duimbeweging van een
 *    account dat weg is; het woord overtypen kost drie seconden en die drie
 *    seconden zijn hier het hele punt. Dit is precies het tegenovergestelde van
 *    de keuze op het beoordeelscherm, en om precies dezelfde reden: dáár is de
 *    vergissing goedkoop terug te draaien, hier niet.
 *
 * ⚠️ Wat er gebeurt staat er letterlijk bij, ook het deel dat blijft staan. Zou
 *    hier alleen "alles wordt verwijderd" staan, dan is dat niet waar: je
 *    goedkeuringen en je chatberichten blijven bestaan zonder je naam, want die
 *    zijn van je buddy's (migratie 0031).
 */
function AccountVerwijderen() {
  const [open, setOpen] = useState(false);
  const [bevestiging, setBevestiging] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const WOORD = 'VERWIJDER';

  async function verwijder() {
    setBezig(true);
    setFout(null);

    const uitkomst = await verwijderMijnAccount();
    setBezig(false);

    // Bij succes is de sessie al weg en stuurt de router je naar het inlogscherm;
    // er valt hier niets meer te tonen.
    if (!uitkomst.ok) setFout(uitkomst.melding);
  }

  if (!open) {
    return (
      <Card nested>
        <Subheading>{t('profiel.verwijder_titel')}</Subheading>
        <Body muted>{t('profiel.verwijder_uitleg')}</Body>
        <Button variant="stil" onPress={() => setOpen(true)}>
          {t('profiel.verwijder_knop')}
        </Button>
      </Card>
    );
  }

  return (
    <Card nested>
      <Subheading>{t('profiel.zeker_weten')}</Subheading>
      <Body>{t('profiel.geen_backup')}</Body>
      <Field
        label={t('profiel.typ_woord', { woord: WOORD })}
        value={bevestiging}
        onChangeText={setBevestiging}
        autoCapitalize="characters"
        placeholder={WOORD}
      />
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <View style={styles.keuzes}>
        <Button
          variant="secundair"
          busy={bezig}
          disabled={bevestiging.trim().toUpperCase() !== WOORD}
          onPress={() => void verwijder()}
        >
          {t('profiel.definitief')}
        </Button>
        <Button
          variant="stil"
          disabled={bezig}
          onPress={() => {
            setOpen(false);
            setBevestiging('');
            setFout(null);
          }}
        >
          {t('profiel.toch_niet')}
        </Button>
      </View>
    </Card>
  );
}

/**
 * De week-startdag, aanpasbaar na de onboarding — QS8-28.
 *
 * ⚠️ Wijzigen midden in een cyclus laat punten en reeks met rust. De reeks en het
 *    grootboek staan vast op `cycle_start_date` van de rijen die er al zijn; die
 *    worden niet herschreven. In de praktijk betekent dat: de lopende week telt
 *    uit op de oude dag, de volgende begint op de nieuwe. Dat staat ook in de
 *    hint, want anders durft niemand het aan te raken.
 */
function WeekStartInstelling({
  waarde,
  userId,
  onOpgeslagen,
}: {
  readonly waarde: Weekday;
  readonly userId: string;
  readonly onOpgeslagen: (profiel: ProfielRij) => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function kies(dag: Weekday) {
    setBezig(true);
    setFout(null);

    const uitkomst = await updateProfiel(userId, { week_start_day: dag });
    if (uitkomst.ok) onOpgeslagen(uitkomst.profiel);
    else setFout(uitkomst.melding);

    setBezig(false);
  }

  return (
    <Card>
      <WeekStartKeuze waarde={waarde} onKies={(dag) => void kies(dag)} disabled={bezig} />
      <Caption>{t('profiel.weekstart_uitleg')}</Caption>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/**
 * ⚠️ Een functie en geen constante: een module-constante met `t()` erin bevriest
 *    de taal op importtijd, vóórdat het profiel geladen is. Zie QS8-115.
 */
function themaOpties(): readonly { readonly waarde: ThemePreference; readonly label: string }[] {
  return [
    { waarde: 'systeem', label: t('profiel.thema_systeem') },
    { waarde: 'navy', label: t('profiel.thema_donker') },
    { waarde: 'navy-licht', label: t('profiel.thema_licht') },
  ];
}

function ThemaKeuze() {
  const { preference, setPreference, ready } = useThemePreference();

  return (
    <Card>
      <Subheading>{t('profiel.weergave')}</Subheading>
      <Body muted>{t('profiel.weergave_uitleg')}</Body>

      <View style={styles.keuzes}>
        {themaOpties().map(({ waarde, label }) => (
          <Button
            key={waarde}
            variant={preference === waarde ? 'primair' : 'secundair'}
            disabled={!ready}
            onPress={() => setPreference(waarde)}
            accessibilityLabel={t('profiel.weergave_label', { stand: label })}
          >
            {label}
          </Button>
        ))}
      </View>
    </Card>
  );
}

/**
 * Feestelijke momenten aan of uit — QS8-76, acceptatiecriterium 3.
 *
 * ⚠️ Deze voorkeur staat op het apparaat en niet in je profiel. Een animatie
 *    aan- of uitzetten hoort bij het scherm waarop je kijkt, net als
 *    `prefers-reduced-motion` zelf. Gevolg dat je moet weten: hij reist niet
 *    mee naar een nieuwe telefoon. Zie `shared/ui/voorkeuren.ts`.
 *
 * ⚠️ Los van `prefers-reduced-motion`, en die wint altijd. Deze schakelaar gaat
 *    over "wil ik dit soort momenten"; die systeemvoorkeur over "kan ik
 *    beweging aan". Wie om minder beweging vraagt, hoort zijn felicitatie niet
 *    kwijt te raken — alleen de confetti.
 */
function VieringKeuze() {
  const { aan, geladen, zet } = useVieringenAan();

  return (
    <Card>
      <Subheading>{t('profiel.viering_titel')}</Subheading>
      <Body muted>{t('profiel.viering_uitleg')}</Body>

      <View style={styles.keuzes}>
        <Button
          variant={aan ? 'primair' : 'secundair'}
          disabled={!geladen}
          onPress={() => zet(true)}
          accessibilityLabel={t('profiel.viering_aan_label')}
        >
          {t('profiel.aan')}
        </Button>
        <Button
          variant={aan ? 'secundair' : 'primair'}
          disabled={!geladen}
          onPress={() => zet(false)}
          accessibilityLabel={t('profiel.viering_uit_label')}
        >
          {t('profiel.uit')}
        </Button>
      </View>

      <Caption>{t('profiel.viering_beweging')}</Caption>
    </Card>
  );
}

/**
 * Buddy-bijdrage — QS8-67.
 *
 * ⚠️ Los van je eigen doelvoortgang, en dat is een acceptatiecriterium. Het zijn
 *    punten in hetzelfde grootboek maar zonder `goal_id`, zodat ze niet
 *    meetellen in de reeks of het totaal van een doel waar ze niets mee te maken
 *    hebben. Score en voortgang zijn twee dingen (domeinregel 10) en dit is nog
 *    een derde.
 *
 * ⚠️ Alleen van jezelf. `points_ledger` laat uitsluitend je eigen rijen door, dus
 *    dit getal kan niet per ongeluk dat van een ander zijn.
 */
function BuddyBijdrage({ userId }: { readonly userId: string }) {
  const [aantal, setAantal] = useState<number | null>(null);
  const [mislukt, setMislukt] = useState(false);

  useEffect(() => {
    let levend = true;

    fetchBuddyBijdrage(userId)
      .then((n) => {
        if (levend) setAantal(n);
      })
      // ⚠️ Een fout is geen nul. "Je hebt nog geen week beoordeeld" tegen iemand
      //    die er veertig deed, is precies de demotivatie waar deze teller tegen
      //    is bedoeld.
      .catch(() => {
        if (levend) setMislukt(true);
      });

    return () => {
      levend = false;
    };
  }, [userId]);

  return (
    <Card>
      <Subheading>{t('profiel.bijdrage_titel')}</Subheading>
      <Body>
        {mislukt
          ? t('profiel.bijdrage_mislukt')
          : aantal === null
            ? '—'
            : aantal === 0
              ? t('profiel.bijdrage_geen')
              : aantal === 1
                ? t('profiel.bijdrage_een')
                : t('profiel.bijdrage_meer', { n: aantal })}
      </Body>
      <Caption>{t('profiel.bijdrage_uitleg')}</Caption>
    </Card>
  );
}

/**
 * Meldingen aanzetten — QS8-124.
 *
 * ⚠️ **De knop is het hele punt.** `Notification.requestPermission()` mag alleen
 *    uit een echte gebruikersklik komen. Vraag je het bij het opstarten, dan
 *    klikt de gebruiker het weg zonder te weten waarvoor, en dan staat het recht
 *    op `denied` — alleen nog terug te draaien in de browserinstellingen. Eén
 *    ongevraagde prompt kost je het kanaal permanent.
 *
 * ⚠️ **Alleen op web.** Native wacht op `expo-notifications` (Q-TODO B4); een
 *    knop tonen die daar niets doet is erger dan geen knop.
 */
function Meldingen({ userId }: { readonly userId: string }) {
  const sleutel = clientEnv().vapidPublicKey;
  const [stand, setStand] = useState<Meldingenstand>(() => huidigeMeldingenstand(sleutel));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  if (Platform.OS !== 'web') return null;

  async function zetAan() {
    setBezig(true);
    setFout(null);

    const uitkomst = await zetMeldingenAan(sleutel);
    if (uitkomst.ok) {
      // Pas hierna registreren: nu bestaat het abonnement en heeft
      // `haalToken()` iets te lezen.
      await registreerPushToken(userId);
      setStand('aan');
    } else if (uitkomst.reden === 'mislukt') {
      setFout(t('profiel.meldingen_mislukt'));
    } else {
      setStand(uitkomst.reden);
    }

    setBezig(false);
  }

  return (
    <Card>
      <Subheading>{t('profiel.meldingen')}</Subheading>
      <Body muted>{uitlegBij(stand)}</Body>
      {stand === 'uit' ? (
        <Button busy={bezig} onPress={() => void zetAan()}>
          {t('profiel.meldingen_aanzetten')}
        </Button>
      ) : null}
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <Beginschermuitleg />
    </Card>
  );
}

function uitlegBij(stand: Meldingenstand): string {
  switch (stand) {
    case 'aan':
      return t('profiel.meldingen_aan');
    case 'uit':
      return t('profiel.meldingen_uit');
    case 'geweigerd':
      return t('profiel.meldingen_geweigerd');
    case 'niet-ondersteund':
      return t('profiel.meldingen_niet_ondersteund');
    case 'geen-sleutel':
      return t('profiel.meldingen_geen_sleutel');
  }
}

/**
 * De uitleg over "Zet op je beginscherm" — QS8-117, hier ingehangen.
 *
 * ⚠️ Op iOS levert Safari géén meldingen aan een gewoon tabblad. Zonder deze
 *    uitleg krijgt een iPhone-gebruiker een knop die het nooit gaat doen, en
 *    hoort hij nergens waarom. De drie voorwaarden (alleen iOS, alleen buiten
 *    standalone, alleen hier) zitten in `installatieadvies()` en staan daar
 *    onder test.
 */
function Beginschermuitleg() {
  const advies = Platform.OS === 'web' ? huidigInstallatieadvies() : 'verbergen';
  if (advies === 'verbergen') return null;

  return (
    <Caption>
      {advies === 'toon-beginscherm-uitleg'
        ? t('profiel.beginscherm_ios')
        : t('profiel.beginscherm_safari')}
    </Caption>
  );
}

const styles = StyleSheet.create({
  blokken: { gap: space.blokGap + 3 },
  kop: { flexDirection: 'row', gap: space.blokGap, alignItems: 'center' },
  kopTekst: { gap: 2, flex: 1 },
  keuzes: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
