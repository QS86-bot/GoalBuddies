import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  AVATAR_MAX_BYTES,
  base64NaarBytes,
  fetchProfiel,
  signOut,
  uploadAvatar,
  verwijderAvatar,
  updateProfiel,
  userClock,
  zetWeekStartdag,
  useProfiel,
  verwijderMijnAccount,
  type Profiel as ProfielRij,
} from '@/modules/auth';
import { deblokkeer, fetchBlokkades } from '@/modules/buddies';
import { fetchBuddyBijdrage } from '@/modules/completions';
import {
  herinneringVelden,
  huidigeMeldingenstand,
  registreerPushToken,
  tijdVoorInvoer,
  verwijderPushToken,
  zetMeldingenAan,
  zetMeldingenUit,
  type Meldingenstand,
  type Toon,
} from '@/modules/notifications';
import { clientEnv } from '@/lib/env';
import { huidigInstallatieadvies } from '@/shared/pwa';
import { opmaaktaal, t, taal, zetTaal, type Taal } from '@/shared/i18n';
import { space, useThemePreference, type ThemePreference } from '@/shared/theme';
import { apparaatTijdzone, toonTijd, type Weekday } from '@/shared/time';
import {
  AsyncView,
  Avatar,
  Bevestiging,
  bevestigingen,
  Body,
  Button,
  Caption,
  Card,
  Choice,
  Field,
  Screen,
  Subheading,
  TaalKeuze,
  TijdzoneKeuze,
  useAsync,
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
  const { profiel, loading, error, zetProfiel, herlaad } = useProfiel();

  return (
    <Screen title={t('profiel.titel')}>
      {/*
        ⚠️ `onRetry` stond hier niet, en dat maakte dit scherm bij een laadfout
           volledig dood: álle inhoud staat binnen deze AsyncView, inclusief de
           uitlogknop. Er was geen enkele uitweg behalve de app herstarten.
      */}
      <AsyncView
        loading={loading}
        error={error}
        data={profiel ?? undefined}
        isEmpty={() => false}
        onRetry={herlaad}
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
              ⚠️ **Uitloggen staat hier en niet onderaan, en dat is een gemeten
                 bevinding** (QS8-245). Het was het twáalfde blok op dit scherm,
                 onder taal, tijdzone, meldingen, herinnering, thema en viering —
                 een halve minuut scrollen langs instellingen die je niet zocht.
                 De eigenaar van het product vond hem zelf niet.

                 Het kostte bovendien echt iets: `routewacht.ts` stuurt je van
                 `/aanmelden` naar `/` zodra je een sessie hebt, en het
                 aanmeldscherm is de enige plek met de Apple- en Google-knop.
                 Uitloggen is dus de enige route daarheen, en die route was niet
                 te vinden.

                 ⚠️ Account verwijderen blijft wél onderaan, met zijn
                 overtyp-bevestiging. Dat is met opzet moeilijk bereikbaar.
            */}
            <Uitloggen />

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

            <AvatarKeuze profiel={p} onGewijzigd={zetProfiel} />

            <BuddyBijdrage userId={p.id} />

            <Blokkades />

            <TaalInstelling
              waarde={p.locale}
              userId={p.id}
              onOpgeslagen={zetProfiel}
            />

            <WeekStartInstelling profiel={p} onOpgeslagen={zetProfiel} />

            <TijdzoneInstelling waarde={p.tz} userId={p.id} onOpgeslagen={zetProfiel} />

            <Meldingen userId={p.id} />

            <HerinneringInstelling
              aan={p.reminder_enabled}
              tijd={p.reminder_time}
              toon={(p.reminder_tone === 'firm' ? 'firm' : 'gentle') as Toon}
              userId={p.id}
              onOpgeslagen={zetProfiel}
            />

            <ThemaKeuze />

            <VieringKeuze />

            <AccountVerwijderen />
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

/**
 * Uitloggen — QS8-245.
 *
 * ⚠️ **Waarom dit een component is en geen drie regels in het scherm.** Hier
 *    stond `void signOut()`, en dat gooit de `Uitkomst` weg. `signOut()` bouwt
 *    netjes `auth.fout.uitloggen` op ("Uitloggen lukte niet. Probeer het
 *    opnieuw."), die melding staat in beide catalogi en is op inhoud getest —
 *    en geen enkel scherm liet hem ooit zien. Mislukte het uitloggen, dan
 *    gebeurde er zichtbaar niets en dacht je dat de knop stuk was.
 *
 *    Dat is onwrikbare regel 18 vraag 5: elk schakeltje af, de keten nergens
 *    verbonden. Er was niets kapot te maken, dus geen enkele test kon het zien.
 *    `tests/beloftes/uitkomst-niet-weggooien.test.ts` bewaakt voortaan de hele
 *    klasse in plaats van dit ene geval.
 */
function Uitloggen() {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function uitloggen() {
    setBezig(true);
    setFout(null);

    const uitkomst = await signOut();

    // ⚠️ Alleen bij een fout terug naar rust. Lukt het wél, dan haalt de
    //    routewacht dit scherm weg en hoort de knop bezig te blijven tot dat
    //    gebeurd is — anders flikkert hij nog even terug naar klikbaar.
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
    }
  }

  return (
    <Card nested>
      <Subheading>{t('profiel.uitloggen_kop')}</Subheading>
      <Body muted>{t('profiel.uitloggen_uitleg')}</Body>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <Button busy={bezig} onPress={() => void uitloggen()}>
        {t('profiel.uitloggen_knop')}
      </Button>
    </Card>
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
 * De taalkeuze — QS8-115, criterium 4.
 *
 * ⚠️ **Twee dingen moeten gebeuren en in deze volgorde.** Eerst de kolom, dan
 *    `zetTaal()`. De catalogus is procesbreed en geen React-context, dus zonder
 *    die tweede aanroep verandert er niets op het scherm tot de app herstart —
 *    de gebruiker klikt op Engels, het blijft Nederlands, en hij concludeert dat
 *    de knop stuk is. Zetten we hem eerst en faalt de opslag daarna, dan staat
 *    de app in een taal die het profiel niet kent en is hij na een herstart weer
 *    terug. Vandaar: opslaan, en pas bij `ok` schakelen.
 *
 * ⚠️ `zetTaal()` alleen ververst het scherm niet — het is geen state. De
 *    `onOpgeslagen` hierna zet het profiel in de provider, en dát is de render
 *    die de nieuwe taal zichtbaar maakt. De twee horen dus bij elkaar; laat er
 *    geen van beide weg.
 *
 * ⚠️ `locale` is `null` zolang er geen keuze staat (migratie 0061). De lijst
 *    toont dan de taal die de app nú spreekt — afgeleid van het apparaat — zodat
 *    er altijd iets aanstaat. Dat is geen stille keuze: de kolom blijft leeg tot
 *    de gebruiker zelf iets aanwijst.
 */
function TaalInstelling({
  waarde,
  userId,
  onOpgeslagen,
}: {
  readonly waarde: string | null;
  readonly userId: string;
  readonly onOpgeslagen: (profiel: ProfielRij) => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function kies(nieuw: Taal) {
    setBezig(true);
    setFout(null);

    const uitkomst = await updateProfiel(userId, { locale: nieuw });

    if (uitkomst.ok) {
      zetTaal(nieuw);
      onOpgeslagen(uitkomst.profiel);
    } else {
      setFout(uitkomst.melding);
    }

    setBezig(false);
  }

  return (
    <Card>
      <TaalKeuze
        waarde={waarde === null ? taal() : (waarde as Taal)}
        onKies={(nieuw) => void kies(nieuw)}
        disabled={bezig}
      />
      <Caption>{t('taal.uitleg')}</Caption>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/**
 * De tijdzone, met de hand te overschrijven — QS8-27, criterium 1.
 *
 * ⚠️ **Waarom dit criterium er is en niet weggelaten kon worden.** De tijdzone
 *    komt uit het apparaat, en dat is meestal goed. Twee gevallen waarin het dat
 *    niet is: wie in Lissabon woont met een telefoon die op Amsterdam blijft
 *    staan, en wie reist. Voor de tweede is dit veld juist een *rem*: zonder
 *    handmatige zone verspringt je week omdat je twee weken in Bangkok zat, en
 *    dan breekt je reeks op een moment dat niets met je gedrag te maken heeft.
 *
 * ⚠️ **Dit raakt `currentUserCycle()` en dus domeinregel 1.** De zone bepaalt
 *    wanneer "vandaag" omslaat en dus wanneer een weekdoel gemist heet. Daarom
 *    gaat de waarde door `updateProfiel()` en dus door `tijdzoneSchema`, en niet
 *    rechtstreeks naar de kolom: een onbekende zone laat `Intl` gooien en dan
 *    hangt élk scherm dat een week uitrekent.
 *
 * ⚠️ Zelfde volgorde als bij de week-startdag: opslaan, en pas bij `ok` het
 *    profiel in de provider zetten. Er is hier géén procesbrede tegenhanger van
 *    `zetTaal()` — `shared/time` leest de zone per aanroep uit het profiel — dus
 *    één stap volstaat.
 */
function TijdzoneInstelling({
  waarde,
  userId,
  onOpgeslagen,
}: {
  readonly waarde: string;
  readonly userId: string;
  readonly onOpgeslagen: (profiel: ProfielRij) => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function kies(zone: string) {
    setBezig(true);
    setFout(null);
    setMelding(null);

    const uitkomst = await updateProfiel(userId, { tz: zone });

    if (uitkomst.ok) {
      onOpgeslagen(uitkomst.profiel);
      setMelding(t('tijdzone.opgeslagen'));
    } else {
      setFout(uitkomst.melding);
    }

    setBezig(false);
  }

  return (
    <Card>
      <TijdzoneKeuze
        waarde={waarde === '' ? apparaatTijdzone() : waarde}
        onKies={(zone) => void kies(zone)}
        disabled={bezig}
      />
      <Caption>{t('tijdzone.uitleg')}</Caption>
      {melding === null ? null : <Caption muted={false}>{melding}</Caption>}
      {fout === null ? null : <Caption danger>{fout}</Caption>}
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
  profiel,
  onOpgeslagen,
}: {
  // ⚠️ De hele rij en niet losse velden: `zetWeekStartdag()` heeft de klok
  //    nodig om de oude én de nieuwe cyclus uit te rekenen, en die komt uit
  //    `userClock()`. Zou dit scherm `week_start_day` en `tz` los doorgeven en
  //    er zelf iets mee rekenen, dan is dat precies de tweede klok waar
  //    correctheidsregel 7 tegen is.
  readonly profiel: ProfielRij;
  readonly onOpgeslagen: (profiel: ProfielRij) => void;
}) {
  const waarde = profiel.week_start_day as Weekday;
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gevraagd, setGevraagd] = useState<Weekday | null>(null);

  async function kies(dag: Weekday) {
    setBezig(true);
    setFout(null);

    // ⚠️ Niet meer `updateProfiel()`: `week_start_day` is sinds migratie 0139
    //    voor de client niet schrijfbaar. De RPC zet de dag én verhuist de
    //    lopende `todo`-weekdoelen mee, in één transactie.
    const uitkomst = await zetWeekStartdag(profiel.id, userClock(profiel), dag);
    if (uitkomst.ok) {
      onOpgeslagen(uitkomst.profiel);
      setGevraagd(null);
    } else setFout(uitkomst.melding);

    setBezig(false);
  }

  // ⚠️ **Eén tik was te goedkoop voor wat dit kost.** Tot 28-08 sloeg deze
  //    keuze meteen op, met een hint eronder die beloofde dat je punten en je
  //    reeks bleven staan. Dat is niet waar zolang weekdoelen van de lopende
  //    week niet meeverhuizen: `fetchWeekdoelen()` matcht exact op
  //    `cycle_start_date`, dus ze raken uit beeld en de rollover stempelt ze
  //    daarna als gemist. De hint zegt nu wat er echt gebeurt en de bevestiging
  //    zorgt dat je het gelezen hebt. Zie de rij van 28-08 in
  //    `docs/ENGINEER-REVIEW.md` voor de reparatie die hier onder ligt.
  if (gevraagd !== null) {
    return (
      <Bevestiging
        tekst={bevestigingen().weekStartVerzetten}
        bezig={bezig}
        fout={fout}
        onBevestig={() => void kies(gevraagd)}
        onAnnuleer={() => {
          setGevraagd(null);
          setFout(null);
        }}
      />
    );
  }

  return (
    <Card>
      <WeekStartKeuze
        waarde={waarde}
        onKies={(dag) => {
          if (dag !== waarde) setGevraagd(dag);
        }}
        disabled={bezig}
      />
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
 * De dagelijkse herinnering — QS8-77, alsnog bereikbaar op 26-08-2026.
 *
 * ⚠️ **Waarom dit er niet was, en waarom dat erger was dan het leek.**
 *    `reminder_time`, `reminder_enabled` en `reminder_tone` waren alleen in
 *    `app/onboarding/profiel.tsx` te zetten, en dat scherm zie je één keer.
 *    Daarna kon je ze nergens meer wijzigen. Elk schakeltje was af — de kolom,
 *    het schema, `updateProfiel()`, de policy, de meldingenjob — maar er was na
 *    de eerste dag geen knop meer die erbij kwam. Dat is de vorm van QS8-113 en
 *    van regel 18, vraag 5: de keten onderbroken terwijl er niets kapot is.
 *
 *    Het viel op omdat het enige profiel op productie `reminder_time = NULL`
 *    had. `nudgeReden()` antwoordt daar "geen tijdstip ingesteld" en er gaat
 *    dus nóóit een nudge — de best geteste meldingssoort van de app kon voor
 *    die gebruiker niet één keer vuren.
 *
 * ⚠️ **Eén bewaarknop en geen opslaan-per-toets.** De tijd is vrije tekst, en
 *    tussen `2` en `20:00` staan vier ongeldige waarden. De andere kaarten op
 *    dit scherm bewaren wél direct, maar die hebben allemaal een gesloten
 *    keuzelijst. Zie `validatie.tijd` voor wat er terugkomt als het toch niet
 *    klopt: `updateProfiel()` valideert serverzijdig met hetzelfde schema.
 *
 * ⚠️ **"Uit is uit" staat in `herinneringVelden()` en niet hier.** Dezelfde
 *    belofte geldt in het onboardingscherm, en twee kopieën van één belofte is
 *    precies de naad die regel 18 beschrijft.
 */
function HerinneringInstelling({
  aan,
  tijd,
  toon,
  userId,
  onOpgeslagen,
}: {
  readonly aan: boolean;
  readonly tijd: string | null;
  readonly toon: Toon;
  readonly userId: string;
  readonly onOpgeslagen: (profiel: ProfielRij) => void;
}) {
  const [wilAan, setWilAan] = useState(aan);
  const [wilTijd, setWilTijd] = useState(() => tijdVoorInvoer(tijd));
  const [wilToon, setWilToon] = useState<Toon>(toon);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bewaard, setBewaard] = useState(false);

  async function bewaar() {
    setBezig(true);
    setFout(null);
    setBewaard(false);

    const uitkomst = await updateProfiel(
      userId,
      herinneringVelden({ aan: wilAan, tijd: wilTijd, toon: wilToon }),
    );

    if (uitkomst.ok) {
      onOpgeslagen(uitkomst.profiel);
      setBewaard(true);
    } else {
      setFout(uitkomst.melding);
    }

    setBezig(false);
  }

  function wijzig(verander: () => void) {
    verander();
    setBewaard(false);
  }

  return (
    <Card>
      <Subheading>{t('profiel.herinnering_titel')}</Subheading>
      <Body muted>{t('profiel.herinnering_uitleg')}</Body>

      <Choice
        label={t('profiel.herinnering_label')}
        opties={[
          { waarde: 'aan', label: t('profiel.aan') },
          { waarde: 'uit', label: t('profiel.uit') },
        ]}
        waarde={wilAan ? 'aan' : 'uit'}
        onKies={(v) => wijzig(() => setWilAan(v === 'aan'))}
        disabled={bezig}
      />

      {wilAan ? (
        <>
          <Field
            label={t('profiel.herinnering_hoe_laat')}
            hint={t('profiel.herinnering_hoe_laat_hint')}
            value={wilTijd}
            onChangeText={(v) => wijzig(() => setWilTijd(v))}
            placeholder="20:00"
            inputMode="numeric"
          />
          {/*
            ⚠️ **Het veld blijft `HH:MM` en de regel eronder volgt de klok van het
               toestel** — QS8-221. Dat is precies de naad die het issue noemt:
               weergave en opslag mogen niet door elkaar lopen. `20:00` gaat de
               database in en `8:00 PM` komt er nooit in; wie een 12-uursklok
               heeft, moet wél kunnen zien wat hij net heeft ingesteld.
               `tests/beloftes/datumopmaak.test.ts` bewaakt dat een opmaakhelper
               nooit aan de invoerkant terechtkomt.
          */}
          <Caption>{t('profiel.herinnering_om', { tijd: toonTijd(wilTijd, opmaaktaal()) })}</Caption>
          <Choice
            label={t('profiel.herinnering_toon')}
            hint={t('profiel.herinnering_toon_hint')}
            opties={[
              { waarde: 'gentle', label: t('profiel.herinnering_zacht') },
              { waarde: 'firm', label: t('profiel.herinnering_streng') },
            ]}
            waarde={wilToon}
            onKies={(v) => wijzig(() => setWilToon(v))}
            disabled={bezig}
          />
        </>
      ) : (
        <Body muted>{t('profiel.herinnering_uit_blijft_uit')}</Body>
      )}

      <Button busy={bezig} onPress={() => void bewaar()}>
        {t('profiel.herinnering_bewaren')}
      </Button>

      {bewaard ? <Caption muted={false}>{t('profiel.herinnering_bewaard')}</Caption> : null}
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <Caption>{t('profiel.herinnering_geen_meldingen')}</Caption>
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
  const [melding, setMelding] = useState<string | null>(null);

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

  /**
   * ⚠️ **`stand` wordt hierna met de hand op `uit` gezet en niet opnieuw uit de
   *    browser gelezen.** De toestemming blijft namelijk `granted` — die kan
   *    alleen de gebruiker zelf intrekken in zijn browserinstellingen — dus
   *    `huidigeMeldingenstand()` zou hier `aan` blijven zeggen terwijl er geen
   *    abonnement meer is. Het scherm zou dan liegen over wat de knop net deed.
   */
  async function zetUit() {
    setBezig(true);
    setFout(null);
    setMelding(null);

    const uitkomst = await zetMeldingenUit(verwijderPushToken);
    if (uitkomst.ok) {
      setStand('uit');
      setMelding(t('profiel.meldingen_uit_gelukt'));
    } else {
      setFout(t('profiel.meldingen_uit_mislukt'));
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
      {stand === 'aan' ? (
        <Button busy={bezig} onPress={() => void zetUit()}>
          {t('profiel.meldingen_uitzetten')}
        </Button>
      ) : null}
      {melding === null ? null : <Caption muted={false}>{melding}</Caption>}
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

/**
 * De profielfoto kiezen — migratie 0126.
 *
 * ⚠️ **Hij staat op het scherm en niet in `modules/auth`, en dat is een regel.**
 *    De datalaag mag uit `shared/ui` alleen een type lenen, geen component —
 *    anders wijst `modules/` naar de schermlaag (zie de rij van 19-08 in
 *    `docs/ENGINEER-REVIEW.md`). Alles wat hieronder géén UI is, staat daarom in
 *    `src/modules/auth/avatar.ts` en is daar los getest.
 *
 * ⚠️ **Dit was het ontbrekende schrijfpad**, en het is precies dezelfde vorm als
 *    `profiles.locale` vóór QS8-115 (CLAUDE.md regel 18, vraag 5): de kolom
 *    `avatar_url` bestond vanaf migratie 0001, `Avatar` las hem, en er was geen
 *    enkele knop die hem ooit kon vullen. Elk schakeltje af, de keten dood — de
 *    variant die geen test vindt, want er is niets kapot.
 *
 * ⚠️ **`base64: true` en geen `fetch(uri)`.** De kiezer geeft op native een
 *    `file://`-uri en op web een `data:`-uri; `fetch()` op de eerste is in React
 *    Native niet betrouwbaar. Base64 werkt op beide platformen hetzelfde, en dat
 *    is hier meer waard dan de paar honderd kilobyte die het onderweg kost.
 *
 * ⚠️ **De grens staat op drie plekken en dat is met opzet.** `allowsEditing` plus
 *    `quality` houdt de meeste foto's onder de 2 MB, `keurBestand()` vangt de
 *    rest vóór er iets de deur uit gaat, en de bucket zelf is de grendel
 *    (onwrikbare regel 3). De eerste twee zijn gemak; alleen de derde is
 *    beveiliging.
 */

function AvatarKeuze({
  profiel,
  onGewijzigd,
}: {
  readonly profiel: ProfielRij;
  readonly onGewijzigd: (profiel: ProfielRij) => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function herlaad() {
    // ⚠️ Opnieuw ophalen en niet het pad zelf in de state zetten: `fetchProfiel`
    //    tekent de avatar, en een ongetekend pad in een `<Image>` is een leeg
    //    vlak zonder foutmelding.
    const vers = await fetchProfiel(profiel.id);
    if (vers !== null) onGewijzigd(vers);
  }

  async function kies() {
    setFout(null);

    const toestemming = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!toestemming.granted) {
      setFout(t('avatar.geen_toegang'));
      return;
    }

    const keuze = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    const gekozen = keuze.canceled ? null : (keuze.assets[0] ?? null);
    if (gekozen === null) return;

    const base64 = gekozen.base64 ?? null;
    if (base64 === null) {
      setFout(t('avatar.uploaden_mislukt'));
      return;
    }

    const bytes = base64NaarBytes(base64);
    if (bytes === null) {
      setFout(t('avatar.uploaden_mislukt'));
      return;
    }

    setBezig(true);
    const uitkomst = await uploadAvatar(profiel.id, {
      data: bytes,
      mime: gekozen.mimeType ?? 'image/jpeg',
    });

    if (uitkomst.ok) await herlaad();
    else setFout(uitkomst.melding);

    setBezig(false);
  }

  async function weghalen() {
    setFout(null);
    setBezig(true);

    const uitkomst = await verwijderAvatar(profiel.id);
    if (uitkomst.ok) await herlaad();
    else setFout(uitkomst.melding);

    setBezig(false);
  }

  const heeftFoto = profiel.avatar_url !== null;

  return (
    <Card>
      <Subheading>{t('avatar.kop')}</Subheading>
      <View style={styles.avatarRij}>
        <Avatar name={profiel.display_name} url={profiel.avatar_url} size={56} />
        <Body muted>{t('avatar.uitleg')}</Body>
      </View>

      <Button onPress={() => void kies()} busy={bezig} variant="secundair">
        {heeftFoto ? t('avatar.vervangen') : t('avatar.kiezen')}
      </Button>

      {heeftFoto ? (
        <Button onPress={() => void weghalen()} disabled={bezig} variant="stil">
          {t('avatar.verwijderen')}
        </Button>
      ) : null}

      <Caption>{t('avatar.grens', { mb: String(Math.round(AVATAR_MAX_BYTES / 1024 / 1024)) })}</Caption>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/**
 * Wie jij geblokkeerd hebt — QS8-232.
 *
 * ⚠️ **Zonder dit blok is blokkeren een handeling zonder weg terug**, en dan is
 *    het geen instelling maar een straf. De knop staat in de groep, de lijst
 *    staat hier: dit is de enige plek die niet aan één groep hangt, en een
 *    blokkade hangt dat ook niet.
 *
 * ⚠️ **De kaart verdwijnt als je niemand geblokkeerd hebt.** Een lege lijst
 *    "Geblokkeerd" op ieders profiel suggereert dat dit een normaal onderdeel van
 *    de app is waar je iets mee moet.
 *
 * ⚠️ De namen komen uit `mijn_blokkades()` en niet uit een join op `profiles`:
 *    die laat `display_name` alleen door voor wie een groep met je deelt, en een
 *    geblokkeerde deelt er meestal geen meer. Zie de module.
 */
function Blokkades() {
  const { data, loading, error, herlaad } = useAsync(() => fetchBlokkades(), []);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function hef(userId: string) {
    setBezig(userId);
    setFout(null);

    const uitkomst = await deblokkeer(userId);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    herlaad();
  }

  // ⚠️ Bij een storing blijft de kaart weg en niet met een foutbalk staan. Dit is
  //    een blok naast de instellingen, geen hoofdinhoud; wie hier komt, kwam voor
  //    iets anders.
  if (loading || error !== null || data === undefined || data.length === 0) return null;

  return (
    <Card>
      <Subheading>{t('melden.geblokkeerd_titel')}</Subheading>

      {data.map((blokkade) => (
        <View key={blokkade.userId}>
          <Body>{blokkade.naam}</Body>
          <Button
            variant="stil"
            busy={bezig === blokkade.userId}
            onPress={() => void hef(blokkade.userId)}
          >
            {t('melden.deblokkeer_knop')}
          </Button>
        </View>
      ))}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

const styles = StyleSheet.create({
  blokken: { gap: space.blokGap + 3 },
  kop: { flexDirection: 'row', gap: space.blokGap, alignItems: 'center' },
  kopTekst: { gap: 2, flex: 1 },
  keuzes: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
  avatarRij: { flexDirection: 'row', alignItems: 'center', gap: space.blokGap },
});
