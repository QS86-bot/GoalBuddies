import { useState } from 'react';
import { View } from 'react-native';

import {
  bewijseisVoorDoel,
  fetchVragen,
  maakAfvinkingOngedaan,
  opnieuwMetBewijs,
  rondAf,
  vinkDagAf,
  type Bewijseis,
} from '@/modules/completions';
import { useBewijsfotokeuze } from '@/modules/completions/react';
import {
  niveauUitDagen,
  sluitWeekdoelAf,
  verwijderWeekdoel,
  type Mijlpaaltip,
  type Weekdoel,
} from '@/modules/goals';
import { t, taal } from '@/shared/i18n';
import type { IsoDate } from '@/shared/time';
import {
  bevestigingen,
  Bevestiging,
  Body,
  Button,
  Caption,
  Card,
  Choice,
  Field,
  FloorCeiling,
  magVieren,
  Ritmestrook,
  Subheading,
  tipVoorWeek,
  useAsyncMetTerugval,
  useVieringenAan,
  Viering,
  weekdoelActies,
  type WeeklyGoalStatus,
} from '@/shared/ui';

import { GEEN_VRAGEN, STANDAARD_BEWIJSEIS } from './constanten';
import { styles } from './stijlen';

type KaartProps = {
  readonly weekdoel: Weekdoel;
  /**
   * De categorie van het bovenliggende doel — besluit A48, voor de weektip.
   *
   * ⚠️ Een `string` en geen `Categorie`, want dat is wat `Doel.category` is: de
   *    database kan er een waarde in hebben staan die deze build niet kent.
   *    `weektip()` zeeft dat zelf en valt terug op `other` — die set is met opzet
   *    de algemene, hij past overal en belooft niets over je vakgebied. Ook een
   *    doel dat nog niet geladen is komt daar terecht.
   */
  readonly categorie: string;
  /**
   * De gegenereerde Doelcoach-tip bij de volgende mijlpaal — QS8-137.
   *
   * ⚠️ `null` is de normale stand en geen storing: geen mijlpaal, nog geen tip,
   *    een mislukte generatie of een uitgeput dagquotum komen hier alle vier als
   *    `null` binnen. De kaart valt dan terug op `weektip()`, en die terugval is
   *    het hele punt van de gefaseerde volgorde in besluit A48.
   */
  readonly mijlpaaltip: Mijlpaaltip | null;
  /**
   * Hoeveel bevestigingen deze week al heeft en hoeveel er nodig zijn — QS8-174.
   *
   * ⚠️ `undefined` is de normale stand en geen storing: een week die niet op
   *    bevestiging wacht staat er niet in, en een mislukte ophaal ook niet. Het
   *    bijschrift valt dan terug op "wacht op je buddy".
   */
  readonly bevestigingsstand: { readonly gedaan: number; readonly nodig: number } | undefined;
  /**
   * Wélke dagen deze week al zijn afgevinkt — QS8-253, en sinds QS8-301 de
   * dagen zelf in plaats van alleen hun aantal.
   *
   * ⚠️ Komt van de ouder en wordt hier niet opgehaald. Het hoofdscherm toont
   *    alle weekdoelen, dus een verzoek per kaart is de klassieke N+1
   *    (onwrikbare regel 12). `fetchAfvinkingenPerWeekdoel()` haalt ze in één keer.
   *
   * ⚠️ De teller eronder is een afleiding hiervan en geen tweede gegeven. Twee
   *    tellingen die uiteen kunnen lopen zijn er één te veel.
   */
  readonly afgevinkteDagen: readonly string[];
  /**
   * De eerste dag van de cyclus van deze gebruiker, uit `shared/time`.
   *
   * ⚠️ `null` zolang het profiel nog niet geladen is. Dan is er geen week om te
   *    tekenen — en niet een week die op maandag begint. Welke dag de week
   *    begint is een voorkeur (domeinregel 1) en nooit een aanname.
   */
  readonly cyclusStart: IsoDate | null;
  readonly vandaagAfgevinkt: boolean;
  /** Vandaag in de tijdzone van de gebruiker, uit `shared/time`. */
  readonly localDate: string | null;
  readonly userId: string;
  readonly onKlaar: () => void;
};

type Melding = {
  readonly setBezig: (b: boolean) => void;
  readonly setFout: (f: string | null) => void;
};

type Niveau = 'floor' | 'ceiling';

/** De afleidingen uit het weekdoel en zijn afgevinkte dagen. */
function useAfleiding(weekdoel: Weekdoel, afgevinkteDagen: readonly string[]) {
  const heeftVloer = Boolean(weekdoel.floor_text);

  /**
   * ⚠️ **Een ritme-weekdoel kiest zijn niveau niet** — besluit A53. Bij zo'n week
   *    staat het antwoord al in de database: je hebt vier van de vijf dagen
   *    afgevinkt. `niveau_uit_dagen()` in 0140 overschrijft wat het formulier
   *    stuurt, dus een keuze tonen zou een keuze suggereren die er niet is.
   *
   *    Deze afleiding is de tweede uitvoering van die regel en bestaat alleen om
   *    te kunnen tónen wat je gaat indienen. De database is de waarheid; de test
   *    in `tests/rls/ritme.test.ts` legt de twee naast elkaar.
   */
  const telDagen = weekdoel.ceiling_days !== null;
  const afgevinkt = afgevinkteDagen.length;
  const afgeleidNiveau = telDagen
    ? niveauUitDagen(afgevinkt, weekdoel.floor_days, weekdoel.ceiling_days ?? 0)
    : null;
  const afgerond = weekdoel.status !== 'todo';
  const wachtOpOordeel = weekdoel.status === 'pending';

  // Wat dit weekdoel op grond van zijn status mag. Staat in `shared/ui/acties`
  // zodat het niet in elk scherm opnieuw bedacht wordt, en zodat er een test op
  // kan staan zonder renderer.
  const acties = weekdoelActies(weekdoel.status as WeeklyGoalStatus);

  return { heeftVloer, telDagen, afgevinkt, afgeleidNiveau, afgerond, wachtOpOordeel, acties };
}

type Afleiding = ReturnType<typeof useAfleiding>;

/**
 * Vandaag afvinken, of het weer ongedaan maken — QS8-253.
 *
 * ⚠️ Geen bevestiging en geen viering. Een afvinking is de kleinste handeling
 *    in de app en moet in één tik klaar zijn; alles wat je eromheen zet, maakt
 *    hem duurder dan hij is. De viering hoort bij de wéék, en die staat er al.
 */
function useWisselVandaag(p: KaartProps, melding: Melding) {
  const [vinkBezig, setVinkBezig] = useState(false);

  async function wisselVandaag() {
    if (p.localDate === null) return;
    setVinkBezig(true);
    melding.setFout(null);

    const uitkomst = p.vandaagAfgevinkt
      ? await maakAfvinkingOngedaan(p.weekdoel.id, p.localDate)
      : await vinkDagAf(p.weekdoel.id, p.localDate);

    setVinkBezig(false);
    if (!uitkomst.ok) {
      melding.setFout(uitkomst.melding);
      return;
    }

    p.onKlaar();
  }

  return { vinkBezig, wisselVandaag };
}

/** Het afrondformulier: niveau, notitie, bewijsfoto en het indienen zelf. */
function useAfronden(p: KaartProps, melding: Melding, afl: Afleiding, eis: Bewijseis) {
  const [open, setOpen] = useState(false);
  const [niveau, setNiveau] = useState<Niveau>('ceiling');
  const [notitie, setNotitie] = useState('');
  const bewijs = useBewijsfotokeuze();

  async function afronden() {
    melding.setBezig(true);
    melding.setFout(null);

    // ⚠️ Bij een ritme-week wint de afleiding uit de dagen van de keuze in het
    //    formulier. De database doet dat sowieso; hier meesturen wat er ook
    //    uitkomt, voorkomt dat de gebruiker een ander woord ziet dan er landt.
    const niveauKeuze = afl.telDagen
      ? (afl.afgeleidNiveau ?? 'floor')
      : afl.heeftVloer
        ? niveau
        : 'ceiling';

    // ⚠️ Opnieuw indienen loopt via een RPC: `completions` is append-only en
    //    heeft geen UPDATE-policy, dus de client kan `superseded_by` niet zelf
    //    zetten (domeinregel 6).
    // ⚠️ Opnieuw indienen uploadt zelf en geeft het **pad** mee; `rondAf()`
    //    krijgt de foto en uploadt hem. Dat verschil zit in de twee schrijvers:
    //    `dien_opnieuw_in()` is een RPC en kan geen bytes aannemen.
    const uitkomst = afl.wachtOpOordeel
      ? await opnieuwMetBewijs(p.weekdoel.id, p.userId, niveauKeuze, notitie, bewijs.foto)
      : await rondAf(
          p.weekdoel.id,
          p.userId,
          { achieved_level: niveauKeuze, note: notitie },
          eis,
          bewijs.foto ?? undefined,
        );

    if (!uitkomst.ok) melding.setFout(uitkomst.melding);
    else {
      setOpen(false);
      setNotitie('');
      bewijs.wis();
      p.onKlaar();
    }
    melding.setBezig(false);
  }

  return { open, setOpen, niveau, setNiveau, notitie, setNotitie, bewijs, afronden };
}

/**
 * Afsluiten en verwijderen lopen door dezelfde functie, want ze verschillen
 * alleen in welke RPC eronder zit.
 *
 * ⚠️ Bij een mislukking blijft het bevestigingsblok staan met de melding
 *    erin, en dat is met opzet. De reden `te_oud` zegt letterlijk "sluit hem
 *    af in plaats van te verwijderen"; die tekst wegklikken zou de gebruiker
 *    laten raden waarom er niets gebeurde.
 */
function useAfsluiten(p: KaartProps, melding: Melding) {
  const [vraagt, setVraagt] = useState<'afsluiten' | 'verwijderen' | null>(null);

  async function voerUit(wat: 'afsluiten' | 'verwijderen') {
    melding.setBezig(true);
    melding.setFout(null);

    const uitkomst =
      wat === 'afsluiten'
        ? await sluitWeekdoelAf(p.weekdoel.id)
        : await verwijderWeekdoel(p.weekdoel.id);

    if (!uitkomst.ok) {
      melding.setFout(uitkomst.melding);
      melding.setBezig(false);
      return;
    }

    melding.setBezig(false);
    setVraagt(null);
    p.onKlaar();
  }

  return { vraagt, setVraagt, voerUit };
}

/** Alle toestand en handelingen van één weekkaart. */
function useKaart(p: KaartProps) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const melding = { setBezig, setFout };
  const afl = useAfleiding(p.weekdoel, p.afgevinkteDagen);

  // ⚠️ De bewijseis komt uit de groep en niet uit een constante. Hij is hier
  //    alleen bedoeld om vooraf de juiste zin te tonen; afdwingen doet de
  //    trigger `enforce_evidence_policy` (migratie 0021).
  const eis = useAsyncMetTerugval(
    () => bewijseisVoorDoel(p.weekdoel.goal_id),
    STANDAARD_BEWIJSEIS,
    [p.weekdoel.goal_id],
  );

  // De vragen die buddy's gesteld hebben — zonder dit is "vertel me meer" een
  // dood spoor en denkt de beoordelaar dat hij iets gedaan heeft.
  const vragen = useAsyncMetTerugval(
    afl.wachtOpOordeel ? () => fetchVragen(p.weekdoel.id) : null,
    GEEN_VRAGEN,
    [afl.wachtOpOordeel, p.weekdoel.id],
  );

  return {
    ...afl,
    eis,
    vragen,
    bezig,
    fout,
    setFout,
    ...useWisselVandaag(p, melding),
    ...useAfronden(p, melding, afl, eis),
    ...useAfsluiten(p, melding),
  };
}

type Kaart = ReturnType<typeof useKaart>;

/**
 * Eén weekdoel, met de mogelijkheid het af te ronden — QS8-46.
 *
 * ⚠️ De status wordt `pending`, nooit direct `approved`. Zelf afvinken is geen
 *    goedkeuring, ook niet als je alleen werkt.
 */
export function WeekdoelKaart(p: KaartProps) {
  const [gevierd, setGevierd] = useState(false);
  const { aan: vieringenAan } = useVieringenAan();
  const k = useKaart(p);
  const { weekdoel } = p;

  // Het bevestigingsblok vervangt de kaart zolang het openstaat: twee schermen
  // met knoppen tegelijk maakt onduidelijk waar de vraag over gaat.
  if (k.vraagt !== null) return <AfsluitVraag vraagt={k.vraagt} k={k} />;

  return (
    <Card>
      {/*
        ⚠️ Het feestje hangt aan `approved` en niet aan het indienen. Zelf
           afvinken is geen goedkeuring (domeinregel 3), dus vieren op het moment
           dat jíj op "Indienen" drukt zou de peer-goedkeuring in de UI
           wegpoetsen — precies de grens die dit product overeind houdt.

        ⚠️ `gevierd` zorgt dat het één keer gebeurt en niet bij elke render van
           een week die al goedgekeurd is. Het is bewust componentstate en geen
           opslag: het feestje hoort bij dit bezoek aan het scherm.
      */}
      {weekdoel.status === 'approved' && magVieren({ aan: vieringenAan, alGezien: gevierd }) ? (
        <Viering soort="weekdoel" onKlaar={() => setGevierd(true)} />
      ) : null}

      <FloorCeiling
        title={weekdoel.title}
        floorText={weekdoel.floor_text}
        ceilingText={weekdoel.ceiling_text}
        status={weekdoel.status as WeeklyGoalStatus}
        achieved="none"
        viewer="owner"
        bevestigingen={p.bevestigingsstand}
      />

      <RitmeBlok p={p} k={k} />
      <WeekTip p={p} />
      <VragenBlok k={k} />
      <AfrondFormulier k={k} />
      <KaartKnoppen p={p} k={k} />
    </Card>
  );
}

function AfsluitVraag({
  vraagt,
  k,
}: {
  readonly vraagt: 'afsluiten' | 'verwijderen';
  readonly k: Kaart;
}) {
  return (
    <Bevestiging
      tekst={
        vraagt === 'afsluiten'
          ? bevestigingen().weekdoelAfsluiten
          : bevestigingen().weekdoelVerwijderen
      }
      bezig={k.bezig}
      fout={k.fout}
      onBevestig={() => void k.voerUit(vraagt)}
      onAnnuleer={() => {
        k.setVraagt(null);
        k.setFout(null);
      }}
    />
  );
}

/**
 * ⚠️ **De knop die van dit ritme meer maakt dan een kolom** — QS8-253. Een
 *    tabel met een RPC en een grant waar geen scherm bij kan, is dood hout
 *    dat geen enkele test ziet; dat is de les van QS8-113 en QS8-112.
 *
 * ⚠️ Alleen bij een ritme-weekdoel, en alleen zolang de week nog loopt. Een
 *    afgeronde week nog kunnen bijvinken zou betekenen dat je je eigen
 *    niveau achteraf omhoog schuift, en dat is precies wat
 *    `niveau_uit_dagen()` in de database voorkomt.
 */
function RitmeBlok({ p, k }: { readonly p: KaartProps; readonly k: Kaart }) {
  const { weekdoel } = p;
  if (!(k.telDagen && !k.afgerond && p.localDate !== null)) return null;

  return (
    <View style={styles.afvinken}>
      <Body>
        {t('ritme.dagen_gehaald', {
          gehaald: k.afgevinkt,
          plafond: weekdoel.ceiling_days ?? 0,
        })}
      </Body>

      {/*
        ⚠️ **De strook zegt wat de teller niet kan** — QS8-301. "3 van 5" is
           een getal zonder vorm: je ziet er niet aan of die drie achter
           elkaar zaten en of vandaag er al bij zit. De dagen kwamen al mee
           met dezelfde cyclusquery die de teller voedt, dus dit kost geen
           enkel extra verzoek.

        ⚠️ Alleen mét een cyclus. Zonder profiel is er geen week om te
           tekenen, en zeven vakjes vanaf een verzonnen maandag zijn erger
           dan geen vakjes (domeinregel 1).
      */}
      {p.cyclusStart === null ? null : (
        <Ritmestrook startDatum={p.cyclusStart} afgevinkt={p.afgevinkteDagen} />
      )}

      {/*
        ⚠️ De regel eronder zegt waar je staat ten opzichte van je vlóér, en
           niet ten opzichte van je plafond. De vloer is de belofte die telt
           (domeinregel 8); het plafond is de bonus. Andersom framen maakt van
           elke gehaalde week een half gehaalde week.
      */}
      <Caption>
        {k.afgeleidNiveau === 'ceiling'
          ? t('ritme.plafond_gehaald')
          : k.afgeleidNiveau === 'floor'
            ? t('ritme.vloer_gehaald')
            : t('ritme.vloer_nog_niet', {
                aantal: (weekdoel.floor_days ?? weekdoel.ceiling_days ?? 0) - k.afgevinkt,
              })}
      </Caption>

      <Button
        variant={p.vandaagAfgevinkt ? 'stil' : 'secundair'}
        busy={k.vinkBezig}
        accessibilityLabel={
          p.vandaagAfgevinkt
            ? t('ritme.maak_ongedaan_label', { titel: weekdoel.title })
            : t('ritme.vink_af_label', { titel: weekdoel.title })
        }
        onPress={() => void k.wisselVandaag()}
      >
        {p.vandaagAfgevinkt ? t('ritme.maak_ongedaan') : t('ritme.vink_af')}
      </Button>
    </View>
  );
}

/**
 * ⚠️ **De weektip — besluit A48, variant 3.** Tot nu toe kreeg je tussen je
 *    eerste weekpas en de volgende vijf keer niets, en dat zijn precies de
 *    weken waarin iemand afhaakt.
 *
 * ⚠️ Hij blijft stáán en verdwijnt niet met het feestje. Het feestmoment
 *    duurt 2,2 seconden — te kort om een zin te lezen die de moeite waard
 *    is. En hij hangt niet aan `vieringenAan`: wie de confetti uitzette,
 *    zette geen tekst uit.
 *
 * ⚠️ Aan `approved` en niet aan het indienen, om dezelfde reden als het
 *    feestje: zelf afvinken is geen goedkeuring (domeinregel 3).
 */
function WeekTip({ p }: { readonly p: KaartProps }) {
  if (p.weekdoel.status !== 'approved') return null;

  return (
    <Caption>
      {tipVoorWeek({
        gegenereerd: p.mijlpaaltip,
        taal: taal(),
        categorie: p.categorie,
        cycleStart: p.weekdoel.cycle_start_date,
      })}
    </Caption>
  );
}

/**
 * ⚠️ Een vraag van een buddy is geen afkeuring en de kaart zegt dat ook
 *    niet. "Vertel me meer" is een gelijkwaardige actie naast goedkeuren
 *    (6.2); de meeste onduidelijkheid is gewoon onduidelijkheid.
 */
function VragenBlok({ k }: { readonly k: Kaart }) {
  if (k.vragen.length === 0) return null;

  return (
    <Card nested>
      <Subheading>{t('vandaag.buddy_vraag')}</Subheading>
      {k.vragen.map((v) => (
        <Body key={v.id} muted>
          &ldquo;{v.comment}&rdquo;
        </Body>
      ))}
      {k.open ? null : (
        <Button onPress={() => k.setOpen(true)}>{t('vandaag.antwoord_opnieuw')}</Button>
      )}
    </Card>
  );
}

function NiveauKeuze({ k }: { readonly k: Kaart }) {
  if (!(k.heeftVloer && !k.telDagen)) return null;

  return (
    <Choice
      label={t('vandaag.niveau_label')}
      hint={t('vandaag.niveau_hint')}
      opties={[
        { waarde: 'floor', label: t('vandaag.vloer') },
        { waarde: 'ceiling', label: t('vandaag.plafond') },
      ]}
      waarde={k.niveau}
      onKies={k.setNiveau}
    />
  );
}

/**
 * Bewijs meesturen — QS8-391.
 *
 * ⚠️ **Een bevestigingszin en niet alleen een ander knoplabel.** Bij de
 *    chatfoto bleek een veranderde knop niet als "gelukt" te lezen; wie
 *    net een foto koos, wil zien dát hij eronder hangt.
 *
 * ⚠️ De knop staat altijd, ook als de eis `optional` is: bewijs mag
 *    altijd, het móet alleen soms. De hint zegt welk van de twee.
 */
function BewijsKeuze({ k }: { readonly k: Kaart }) {
  const { bewijs } = k;

  return (
    <>
      <View style={styles.knoppen}>
        <Button variant="stil" onPress={() => void bewijs.kies()}>
          {t('bewijsfoto.knop')}
        </Button>
        {bewijs.foto === null ? null : (
          <Button variant="stil" onPress={bewijs.haalWeg}>
            {t('bewijsfoto.weghalen')}
          </Button>
        )}
      </View>

      {k.eis === 'note_and_attachment' && bewijs.foto === null ? (
        <Caption>{t('bewijsfoto.vereist')}</Caption>
      ) : null}
      {bewijs.foto === null ? null : <Caption>{t('bewijsfoto.gekozen')}</Caption>}
      {bewijs.fout === null ? null : <Caption danger>{bewijs.fout}</Caption>}
    </>
  );
}

function AfrondFormulier({ k }: { readonly k: Kaart }) {
  if ((k.afgerond && !k.wachtOpOordeel) || !k.open) return null;

  return (
    <View style={styles.afrond}>
      <NiveauKeuze k={k} />

      <Field
        label={t('vandaag.notitie_label')}
        hint={
          k.eis === 'optional' ? t('vandaag.notitie_optioneel') : t('vandaag.notitie_verplicht')
        }
        value={k.notitie}
        onChangeText={k.setNotitie}
        multiline
        numberOfLines={3}
      />

      <BewijsKeuze k={k} />

      {k.fout === null ? null : <Caption danger>{k.fout}</Caption>}

      <View style={styles.knoppen}>
        <Button variant="primair" busy={k.bezig} onPress={() => void k.afronden()}>
          {k.wachtOpOordeel ? t('vandaag.opnieuw_indienen') : t('vandaag.indienen')}
        </Button>
        <Button variant="stil" onPress={() => k.setOpen(false)}>
          {t('vandaag.annuleren')}
        </Button>
      </View>
    </View>
  );
}

/**
 * ⚠️ Afronden staat als eerste en de rest ernaast in stille knoppen. Deze
 *    drie zijn geen gelijkwaardige keuzes: afronden is wat je wilt,
 *    afsluiten is wat je soms moet, en weggooien is voor een vergissing.
 *    Ze even zwaar maken zou de uitweg net zo aantrekkelijk maken als de
 *    week zelf.
 */
function KaartKnoppen({ p, k }: { readonly p: KaartProps; readonly k: Kaart }) {
  const { acties } = k;
  if (k.open || !(acties.afronden || acties.afsluiten || acties.verwijderen)) return null;

  return (
    <View style={styles.knoppen}>
      {/*
        Staat er een vraag van een buddy, dan zit de knop om opnieuw in te
        dienen al in het blok hierboven en met een beter label. Twee knoppen
        die hetzelfde doen laten de gebruiker zoeken naar het verschil.
      */}
      {acties.afronden && k.vragen.length === 0 ? (
        <Button onPress={() => k.setOpen(true)}>
          {k.wachtOpOordeel ? t('vandaag.opnieuw_indienen') : t('vandaag.afronden')}
        </Button>
      ) : null}

      {acties.afsluiten ? (
        <Button variant="stil" onPress={() => k.setVraagt('afsluiten')}>
          {t('vandaag.week_afsluiten')}
        </Button>
      ) : null}

      {acties.verwijderen ? (
        <Button
          variant="stil"
          onPress={() => k.setVraagt('verwijderen')}
          accessibilityLabel={t('vandaag.weggooien_label', { titel: p.weekdoel.title })}
        >
          {t('vandaag.weggooien')}
        </Button>
      ) : null}
    </View>
  );
}
