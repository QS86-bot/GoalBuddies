import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { updateProfiel, useProfiel, useSession } from '@/modules/auth';
import {
  bewaarHeld,
  heldkeuze,
  heldoptieTekstSleutel,
  heldTekstSleutel,
  HELDVRAAGOPTIES,
  HELDVRAGEN,
  heldvraagTekstSleutel,
  heldprofiel,
  teBewarenHeld,
  type Heldantwoorden,
  type Heldkeuze,
  type Heldsleutel,
  type Heldvraag,
} from '@/modules/helden';
import {
  CATEGORIE_GROEPEN,
  categorieLabels,
  MAX_FOCUSGEBIEDEN,
  MINUTEN_OPTIES,
  minutenLabels,
  MOMENTEN,
  momentLabels,
  patchUitVragenlijst,
  urenPerWeekUitMinuten,
  valkuilAntwoord,
  valkuilLabels,
  VALKUILEN,
  type Categorie,
  type Minuten,
  type Moment,
  type Valkuil,
  type VragenlijstInvoer,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  CategorieMerk,
  Choice,
  Screen,
  Subheading,
  useAsync,
} from '@/shared/ui';

/**
 * De korte vragenlijst — QS8-257, besluit A56.
 *
 * ⚠️ **Ná de aanmeldmuur en niet ervoor.** Habit Huddle zet hem ervóór als
 *    acquisitiekanaal; dat is voorgelegd en afgewezen, want het vraagt een
 *    uitgelogd AI-eindpunt met een limiet, een misbruikvector en een rekening
 *    zonder gebruiker erachter.
 *
 * ⚠️ **Alles overslaan mag en wist niets.** Acceptatiecriterium 4 van QS8-37,
 *    en het staat er niet alleen als knop: `patchUitVragenlijst()` laat een
 *    overgeslagen antwoord met rust in plaats van het op `null` te zetten. Wie
 *    dit scherm een tweede keer opent en één vraag beantwoordt, houdt de andere
 *    drie.
 *
 * ⚠️ **Het samenvattingsscherm is het punt van dit issue en niet de vier
 *    vragen.** "Dit heb je me verteld — tik een antwoord aan om het te wijzigen"
 *    maakt het plan van de gebruiker in plaats van van de app, en het is de
 *    goedkoopste vertrouwenswinst in de hele flow. Wij sprongen tot nu toe van
 *    invullen meteen naar het resultaat.
 *
 * ⚠️⚠️ **Sinds QS8-474 zijn het acht vragen met één samenvatting, en die ene
 *    samenvatting is de reden dat besluit A56 overeind blijft.** QS8-257 ging er
 *    expliciet over dat het samenvattingsscherm het punt was en niet de vier
 *    vragen; acht vragen met twéé samenvattingen zou dat besluit stil omdraaien.
 *    Besluit 6 van QS8-468: één vragenlijst, geen tweede quiz ernaast. Uitleg in
 *    `docs/decisions/2026-09-14-acht-vragen-en-een-samenvatting.md`.
 *
 * ⚠️ **De vier heldenantwoorden worden nergens bewaard — alleen de uitslag.**
 *    Dat is geen omissie: `hero_profiles` draagt de gekozen held, niet de weg
 *    ernaartoe. Gevolg is wel dat dit scherm bij een tweede bezoek de
 *    heldenvragen leeg toont terwijl de andere vier ingevuld staan. Dat is de
 *    goede kant op: wie ze dan opnieuw overslaat, houdt de held die hij had —
 *    `teBewarenHeld()` geeft `null` en er wordt niets geschreven. Overslaan wist
 *    ook hier niets.
 */

type Stap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** De vier heldenvragen beginnen na de vier vragen van A56. */
const EERSTE_HELDVRAAG = 4;

/** De laatste stap is de samenvatting en geen vraag. */
const SAMENVATTING: Stap = 8;

/**
 * Wacht tot het profiel bekend is, en laat het formulier daarna pas monteren.
 *
 * ⚠️ **Exact dezelfde wacht als in `app/onboarding/profiel.tsx`, en om exact
 *    dezelfde reden.** De `useState`-initialisator hieronder draait één keer, bij
 *    de eerste render, en er is geen effect dat hem bijstelt. Monteert het
 *    formulier terwijl het profiel nog onbekend is, dan staan de vier antwoorden
 *    op leeg — het scherm vertelt de gebruiker dus dat hij niets ingevuld heeft —
 *    en vervangt "Bewaren" zijn eerdere antwoorden door wat hij daarna aanvinkt.
 *
 * ⚠️ **Deze wacht ontbrak tot 03-09, en dat kon niemand zien: het scherm was
 *    onbereikbaar** (QS8-266). De reparatie die het bereikbaar maakte, maakte
 *    deze fout voor het eerst bereikbaar — de kopieerfout waar onwrikbare regel
 *    19 voor waarschuwt: de oplossing stond ernaast en was niet meegenomen.
 *
 * ⚠️ Een buitenste component en geen `if` in het formulier: alleen zo monteren de
 *    initialisatoren pas als het profiel er is. Een vroege `return` in hetzelfde
 *    component zou de hooks-volgorde breken.
 */
export default function Vragenlijst() {
  const { profiel, loading, error, herlaad } = useProfiel();

  return (
    <AsyncView
      loading={loading}
      error={error}
      data={profiel ?? undefined}
      isEmpty={() => false}
      onRetry={herlaad}
      empty={{ title: t('onboarding.profiel_leeg_titel'), body: t('onboarding.profiel_leeg_tekst') }}
    >
      {() => <VragenlijstFormulier />}
    </AsyncView>
  );
}

function VragenlijstFormulier() {
  const router = useRouter();
  const { userId } = useSession();
  const { profiel, herlaad } = useProfiel();

  const [stap, setStap] = useState<Stap>(0);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // ⚠️ De heldenantwoorden staan naast `invoer` en niet erin: `invoer` is wat er
  //    naar `profiles` gaat, en deze vier gaan daar nooit heen. Alleen de
  //    uitslag landt, en die landt in `hero_profiles`.
  const [heldantwoorden, setHeldantwoorden] = useState<Heldantwoorden>({});
  const [gekozenHeld, setGekozenHeld] = useState<Heldsleutel | null>(null);

  // ⚠️ **De held die er al is, en dat is geen luxe.** Dit scherm is een tweede
  //    keer te openen, en de heldenantwoorden worden nergens bewaard — alleen de
  //    uitslag. Zonder deze regel leest iemand die zijn vragenlijst komt
  //    bijstellen dat hij "de heldenvragen overgeslagen" heeft, terwijl hij
  //    gewoon een held hééft. Dat is de app die iets onwaars tegen hem zegt.
  //
  // ⚠️ **`useAsync` en geen eigen hook in `modules/helden`.** Die stond er eerst,
  //    met een `let levend = true` erin, en werd op twee manieren rood: de ratel
  //    van `levend:controle` (22 vlaggen, dit was de drieëntwintigste) en de
  //    laagregel van QS8-207 — de datalaag importeert niets uit `shared/ui`, ook
  //    geen `useAsync`. Die twee wijzen dezelfde kant op: de laadbeurt hoort in
  //    de schermlaag, en de module levert de functie.
  const bestaand = useAsync(userId ? () => heldprofiel(userId) : null, [userId]);

  // ⚠️ Wat er al op het profiel staat is het startpunt, niet een lege lijst.
  //    Wie dit scherm opnieuw opent, ziet zijn eigen antwoorden terug.
  const [invoer, setInvoer] = useState<VragenlijstInvoer>({
    focus_areas: (profiel?.focus_areas ?? []) as Categorie[],
    minutes_per_day: (profiel?.minutes_per_day ?? null) as Minuten | null,
    when_i_do_it: (profiel?.when_i_do_it ?? null) as Moment | null,
    what_breaks_it: (profiel?.what_breaks_it ?? []) as Valkuil[],
  });

  function wisselFocus(gebied: Categorie) {
    setInvoer((oud) => {
      const huidig = (oud.focus_areas ?? []) as Categorie[];
      if (huidig.includes(gebied)) {
        return { ...oud, focus_areas: huidig.filter((g) => g !== gebied) };
      }
      // ⚠️ Stil weigeren en niet stil de oudste eruit gooien: dat tweede laat de
      //    gebruiker een keuze verliezen die hij net gemaakt heeft. De bijtekst
      //    zegt wat er aan de hand is.
      if (huidig.length >= MAX_FOCUSGEBIEDEN) return oud;
      return { ...oud, focus_areas: [...huidig, gebied] };
    });
  }

  function wisselValkuil(valkuil: Valkuil) {
    setInvoer((oud) => {
      const huidig = (oud.what_breaks_it ?? []) as Valkuil[];
      return {
        ...oud,
        what_breaks_it: huidig.includes(valkuil)
          ? huidig.filter((v) => v !== valkuil)
          : [...huidig, valkuil],
      };
    });
  }

  function kiesHeldantwoord(vraag: Heldvraag, held: Heldsleutel) {
    setHeldantwoorden((oud) => ({ ...oud, [vraag]: held }));
  }

  // ⚠️ De keuze wordt hier bij élke render opnieuw afgeleid en niet in state
  //    gehouden. `heldkeuze()` laat een eerdere gelijkspelkeuze vallen zodra de
  //    antwoorden hem geen koploper meer maken; zou de uitslag in state staan,
  //    dan overleeft een achterhaalde keuze precies de wijziging die hem
  //    ongeldig maakte.
  const keuze = heldkeuze(heldantwoorden, gekozenHeld);

  async function bewaar() {
    if (!userId) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await updateProfiel(userId, patchUitVragenlijst(invoer));

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    // ⚠️ **`null` betekent hier "niets te bewaren" en niet "wis de held".** Wie
    //    de heldenvragen overslaat of een gelijkspel onbeslist laat, houdt de
    //    held die hij al had. Overslaan wist niets, ook hier niet.
    const teBewaren = teBewarenHeld(keuze);
    if (teBewaren !== null) {
      const held = await bewaarHeld(userId, teBewaren.held, teBewaren.bron);
      if (!held.ok) {
        setFout(held.melding);
        setBezig(false);
        return;
      }
    }

    herlaad();
    // ⚠️ Naar de doelen en niet naar Vandaag: wie net verteld heeft waar hij zich
    //    op wil richten, hoort meteen bij de plek te komen waar hij dat vastlegt.
    router.replace('/doelen');
  }

  return (
    <Screen
      title={t('vragenlijst.titel')}
      eyebrow={t('vragenlijst.eyebrow')}
      terug={{ naar: '/doelen' }}
    >
      {stap === 0 ? (
        <FocusVraag
          gekozen={(invoer.focus_areas ?? []) as Categorie[]}
          onWissel={wisselFocus}
        />
      ) : null}

      {stap === 1 ? (
        <TijdVraag
          waarde={(invoer.minutes_per_day ?? null) as Minuten | null}
          onKies={(minuten) => setInvoer((oud) => ({ ...oud, minutes_per_day: minuten }))}
        />
      ) : null}

      {stap === 2 ? (
        <MomentVraag
          waarde={(invoer.when_i_do_it ?? null) as Moment | null}
          onKies={(moment) => setInvoer((oud) => ({ ...oud, when_i_do_it: moment }))}
        />
      ) : null}

      {stap === 3 ? (
        <ValkuilVraag
          gekozen={(invoer.what_breaks_it ?? []) as Valkuil[]}
          onWissel={wisselValkuil}
        />
      ) : null}

      {/*
        ⚠️ De vier heldenvragen komen uit `HELDVRAGEN` en staan hier niet als
           vier blokken. Niet uit netheid: `app/` staat precies op het plafond
           van regel 15, en vier handgeschreven vragen duwen deze functie er
           overheen. De vorm van de vraag is bovendien elke keer dezelfde, en het
           enige wat verschilt is data die de module al bezit.
      */}
      {HELDVRAGEN.map((vraag, i) =>
        stap === EERSTE_HELDVRAAG + i ? (
          <HeldVraag
            key={vraag}
            vraag={vraag}
            waarde={heldantwoorden[vraag] ?? null}
            onKies={(held) => kiesHeldantwoord(vraag, held)}
          />
        ) : null,
      )}

      {stap === SAMENVATTING ? (
        <Samenvatting
          invoer={invoer}
          keuze={keuze}
          bestaandeHeld={bestaandeHeld(bestaand)}
          onKiesHeld={setGekozenHeld}
          onWijzig={(naar) => setStap(naar)}
        />
      ) : null}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <View style={styles.knoppen}>
        {stap === SAMENVATTING ? (
          <Button variant="primair" block busy={bezig} onPress={() => void bewaar()}>
            {t('vragenlijst.samenvatting.bewaren')}
          </Button>
        ) : (
          <Button variant="primair" block onPress={() => setStap((s) => (s + 1) as Stap)}>
            {t('vragenlijst.volgende')}
          </Button>
        )}

        {stap === 0 ? null : (
          <Button variant="stil" block onPress={() => setStap((s) => (s - 1) as Stap)}>
            {t('vragenlijst.vorige')}
          </Button>
        )}

        {/*
          ⚠️ Overslaan staat op élke stap en niet alleen op de eerste. Wie bij
             vraag drie besluit dat het genoeg is, hoort niet nog twee schermen
             te moeten doorklikken om weg te komen.
        */}
        {stap === SAMENVATTING ? null : (
          <Button variant="stil" block onPress={() => setStap(SAMENVATTING)}>
            {t('vragenlijst.overslaan')}
          </Button>
        )}
      </View>

      <Caption>{t('vragenlijst.alles_overslaan')}</Caption>
    </Screen>
  );
}

function FocusVraag({
  gekozen,
  onWissel,
}: {
  readonly gekozen: readonly Categorie[];
  readonly onWissel: (gebied: Categorie) => void;
}) {
  const labels = categorieLabels();
  const vol = gekozen.length >= MAX_FOCUSGEBIEDEN;

  return (
    <Card>
      <Subheading>{t('vragenlijst.focus.vraag')}</Subheading>
      <Caption>{t('vragenlijst.focus.toelichting')}</Caption>

      {CATEGORIE_GROEPEN.map((groep) => (
        <View key={groep.sleutel} style={styles.gebieden}>
          {groep.leden.map((gebied) => (
            <Button
              key={gebied}
              variant={gekozen.includes(gebied) ? 'secundair' : 'stil'}
              onPress={() => onWissel(gebied)}
            >
              {labels[gebied]}
            </Button>
          ))}
        </View>
      ))}

      {vol ? <Caption>{t('vragenlijst.focus.vol')}</Caption> : null}
    </Card>
  );
}

function TijdVraag({
  waarde,
  onKies,
}: {
  readonly waarde: Minuten | null;
  readonly onKies: (minuten: Minuten) => void;
}) {
  const uren = urenPerWeekUitMinuten(waarde);

  return (
    <Card>
      <Choice
        label={t('vragenlijst.tijd.vraag')}
        hint={t('vragenlijst.tijd.toelichting')}
        opties={MINUTEN_OPTIES.map((m) => ({ waarde: m, label: minutenLabels()[m] }))}
        waarde={waarde ?? 0}
        onKies={(m) => onKies(m as Minuten)}
      />

      {/*
        ⚠️ De omrekening staat op het scherm en gebeurt niet stil. Het interview
           vult straks uren per week voor; die waarde namens iemand verzinnen
           zonder het te laten zien, is een getal invullen dat hij niet gegeven
           heeft.
      */}
      {uren === null ? null : <Caption>{t('vragenlijst.uren_per_week', { uren })}</Caption>}
    </Card>
  );
}

/**
 * Eén heldenvraag: zes knoppen, één antwoord.
 *
 * ⚠️ **Dit component is de vier vragen samen en niet één ervan.** Welke vraag
 *    het is en in welke volgorde de opties staan, bezit `modules/helden`; hier
 *    staat alleen hoe een vraag eruitziet. Zou elke vraag zijn eigen component
 *    krijgen, dan staan de zes helden vier keer in de schermlaag en loopt die
 *    lijst uit elkaar met het register zonder dat iets rood wordt.
 *
 * ⚠️ Geen letters A t/m F op het scherm. Het brondocument nummert de opties zo,
 *    maar dat is een scoringshulp: de gebruiker kiest een antwoord, geen letter.
 */
function HeldVraag({
  vraag,
  waarde,
  onKies,
}: {
  readonly vraag: Heldvraag;
  readonly waarde: Heldsleutel | null;
  readonly onKies: (held: Heldsleutel) => void;
}) {
  return (
    <Card>
      <Subheading>{t(heldvraagTekstSleutel(vraag, 'vraag'))}</Subheading>
      <Caption>{t(heldvraagTekstSleutel(vraag, 'toelichting'))}</Caption>

      {HELDVRAAGOPTIES[vraag].map((held) => (
        <Button
          key={held}
          variant={waarde === held ? 'secundair' : 'stil'}
          block
          onPress={() => onKies(held)}
        >
          {t(heldoptieTekstSleutel(vraag, held))}
        </Button>
      ))}
    </Card>
  );
}

/**
 * De uitslag van de vier heldenvragen, op de samenvatting.
 *
 * ⚠️⚠️ **Bij gelijkspel staan hier álle gedeelde koplopers en niet de top 2.**
 *    Vier vragen over zes helden geeft maximaal 4 punten, en 1-1-1-1 over vier
 *    verschillende helden is een normale uitslag — "de top 2" is dan niet
 *    gedefinieerd. Besluit 7 van QS8-468. Het aantal kaarten komt daarom uit
 *    `keuze.koplopers` en er staat nergens een getal dat er twee afsnijdt.
 *
 * ⚠️ **De lege staat is een gewoon antwoord en geen fout.** Wie alle vier de
 *    vragen overslaat leest hier dat hij geen held krijgt en dat de rest van de
 *    app gewoon werkt. Geen waarschuwing, geen rode tekst.
 */
/**
 * De held die er al stond, met de drie staten die onwrikbare regel 16 eist.
 *
 * ⚠️ **`laadt` en `fout` zijn hier geen decoratie maar het verschil tussen twee
 *    ware en twee onware zinnen.** Zonder ze rendert het scherm "je hebt geen
 *    held" aan iemand van wie de leesactie nog onderweg is of net mislukt — en
 *    dat is precies wat het comment bij de leesactie verbiedt.
 */
type BestaandeHeld =
  | { readonly soort: 'laadt' }
  | { readonly soort: 'fout' }
  | { readonly soort: 'geen' }
  | { readonly soort: 'held'; readonly held: Heldsleutel };

function bestaandeHeld(uitkomst: {
  readonly data: { readonly held: Heldsleutel } | null | undefined;
  readonly loading: boolean;
  readonly error: unknown;
}): BestaandeHeld {
  if (uitkomst.loading) return { soort: 'laadt' };
  if (uitkomst.error !== null && uitkomst.error !== undefined) return { soort: 'fout' };
  if (uitkomst.data === undefined || uitkomst.data === null) return { soort: 'geen' };
  return { soort: 'held', held: uitkomst.data.held };
}

function HeldUitslag({
  keuze,
  bestaande,
  onKies,
}: {
  readonly keuze: Heldkeuze;
  readonly bestaande: BestaandeHeld;
  readonly onKies: (held: Heldsleutel) => void;
}) {
  return (
    <View style={styles.held}>
      <Caption>{t('vragenlijst.held.kop')}</Caption>

      {keuze.soort === 'geen' ? <HeldGeen bestaande={bestaande} /> : null}
      {keuze.soort === 'quiz' ? <HeldEen held={keuze.held} /> : null}
      {keuze.soort === 'gelijkspel' ? <HeldGelijkspel keuze={keuze} onKies={onKies} /> : null}
    </View>
  );
}

/**
 * Geen uitslag uit de vier vragen.
 *
 * ⚠️ **Twee heel verschillende situaties, en het verschil is de hele reden dat
 *    `huidigeHeld` hier binnenkomt.** Wie nooit een held koos, leest dat hij er
 *    geen krijgt en dat de rest gewoon werkt. Wie er al een heeft en de vragen
 *    deze keer oversloeg, houdt die held — en dan is "je hebt de heldenvragen
 *    overgeslagen" een ware zin met een onware strekking.
 */
function HeldGeen({ bestaande }: { readonly bestaande: BestaandeHeld }) {
  if (bestaande.soort === 'laadt') return <Body muted>{t('vragenlijst.held.laadt')}</Body>;
  if (bestaande.soort === 'fout') return <Body muted>{t('vragenlijst.held.fout')}</Body>;
  if (bestaande.soort === 'geen') return <Body muted>{t('vragenlijst.held.geen')}</Body>;

  return (
    <>
      <Body>{t(heldTekstSleutel(bestaande.held, 'naam'))}</Body>
      <Caption>{t(heldTekstSleutel(bestaande.held, 'ondertitel'))}</Caption>
      <Body muted>{t('vragenlijst.held.blijft')}</Body>
    </>
  );
}

function HeldEen({ held }: { readonly held: Heldsleutel }) {
  return (
    <>
      <Body>{t(heldTekstSleutel(held, 'naam'))}</Body>
      <Caption>{t(heldTekstSleutel(held, 'ondertitel'))}</Caption>
      <Body muted>{t('vragenlijst.held.een')}</Body>
    </>
  );
}

/**
 * ⚠️⚠️ **Hier staan álle gedeelde koplopers en niet de top 2.** Vier vragen over
 *    zes helden geeft maximaal 4 punten, en 1-1-1-1 over vier verschillende
 *    helden is een normale uitslag — "de top 2" is dan niet gedefinieerd.
 *    Besluit 7 van QS8-468. Het aantal kaarten komt uit `keuze.koplopers`, en er
 *    staat nergens een getal dat er twee afsnijdt;
 *    `tests/beloftes/alle-gedeelde-koplopers.test.ts` wordt rood zodra dat wel
 *    gebeurt.
 */
function HeldGelijkspel({
  keuze,
  onKies,
}: {
  readonly keuze: Extract<Heldkeuze, { soort: 'gelijkspel' }>;
  readonly onKies: (held: Heldsleutel) => void;
}) {
  return (
    <>
      <Body muted>{t('vragenlijst.held.gelijk', { aantal: keuze.koplopers.length })}</Body>

      {keuze.koplopers.map((held) => (
        <HeldKaart
          key={held}
          held={held}
          gekozen={keuze.gekozen === held}
          onKies={() => onKies(held)}
        />
      ))}

      <Caption>
        {keuze.gekozen === null
          ? t('vragenlijst.held.kies_een')
          : t('vragenlijst.held.gekozen')}
      </Caption>
    </>
  );
}

function HeldKaart({
  held,
  gekozen,
  onKies,
}: {
  readonly held: Heldsleutel;
  readonly gekozen: boolean;
  readonly onKies: () => void;
}) {
  return (
    <View style={styles.heldkaart}>
      <Button variant={gekozen ? 'secundair' : 'stil'} block onPress={onKies}>
        {`${t(heldTekstSleutel(held, 'naam'))} · ${t(heldTekstSleutel(held, 'ondertitel'))}`}
      </Button>
      <Body muted>{t(heldTekstSleutel(held, 'persoonlijkheid'))}</Body>
    </View>
  );
}

function MomentVraag({
  waarde,
  onKies,
}: {
  readonly waarde: Moment | null;
  readonly onKies: (moment: Moment) => void;
}) {
  return (
    <Card>
      <Choice
        label={t('vragenlijst.moment.vraag')}
        hint={t('vragenlijst.moment.toelichting')}
        opties={MOMENTEN.map((m) => ({ waarde: m, label: momentLabels()[m] }))}
        waarde={waarde ?? ''}
        onKies={(m) => onKies(m as Moment)}
      />
    </Card>
  );
}

/**
 * ⚠️ **Hier zit de waarde van deze vragenlijst.** Elk aangevinkt antwoord krijgt
 *    meteen te zien wat de app ertegen heeft — en dat is machinerie die al
 *    bestaat: de vloer, de weekpas, peer-goedkeuring, de adempauze. Dit is de
 *    plek waar we uitleggen wat ons anders maakt, in de woorden van de gebruiker
 *    zelf.
 *
 * ⚠️ **Er wordt niets aangezet.** Aanvinken slaat een antwoord op en laat zien
 *    wat er al is; het zet geen gedrag aan dat de gebruiker niet gevraagd heeft.
 */
function ValkuilVraag({
  gekozen,
  onWissel,
}: {
  readonly gekozen: readonly Valkuil[];
  readonly onWissel: (valkuil: Valkuil) => void;
}) {
  const labels = valkuilLabels();

  return (
    <Card>
      <Subheading>{t('vragenlijst.valkuil.vraag')}</Subheading>
      <Caption>{t('vragenlijst.valkuil.toelichting')}</Caption>

      {VALKUILEN.map((valkuil) => (
        <View key={valkuil} style={styles.valkuil}>
          <Button
            variant={gekozen.includes(valkuil) ? 'secundair' : 'stil'}
            block
            onPress={() => onWissel(valkuil)}
          >
            {labels[valkuil]}
          </Button>

          {gekozen.includes(valkuil) ? (
            <Body muted>{valkuilAntwoord(valkuil).antwoord}</Body>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

/**
 * "Dit heb je me verteld — tik een antwoord aan om het te wijzigen."
 *
 * ⚠️ Elke regel is een knop naar zijn eigen vraag. Een samenvatting die je
 *    alleen kunt lezen, is een bevestigingsscherm; een samenvatting die je kunt
 *    bijstellen, maakt het plan van de gebruiker.
 */
function Samenvatting({
  invoer,
  keuze,
  bestaandeHeld: bestaande,
  onKiesHeld,
  onWijzig,
}: {
  readonly invoer: VragenlijstInvoer;
  readonly keuze: Heldkeuze;
  readonly bestaandeHeld: BestaandeHeld;
  readonly onKiesHeld: (held: Heldsleutel) => void;
  readonly onWijzig: (naar: Stap) => void;
}) {
  const gebieden = (invoer.focus_areas ?? []) as Categorie[];
  const valkuilen = (invoer.what_breaks_it ?? []) as Valkuil[];
  const minuten = (invoer.minutes_per_day ?? null) as Minuten | null;
  const moment = (invoer.when_i_do_it ?? null) as Moment | null;

  const niets = t('vragenlijst.samenvatting.niets');
  // ⚠️ Ook de heldenvragen tellen mee voor "je hebt niets ingevuld". Zonder dat
  //    leest iemand die alleen de heldenvragen beantwoordde dat hij niets
  //    verteld heeft, terwijl er onder deze zin een held staat.
  const alles =
    gebieden.length === 0 &&
    valkuilen.length === 0 &&
    minuten === null &&
    moment === null &&
    keuze.soort === 'geen' &&
    bestaande.soort !== 'held';

  return (
    <Card>
      <Subheading>{t('vragenlijst.samenvatting.kop')}</Subheading>
      <Caption>{t('vragenlijst.samenvatting.uitleg')}</Caption>

      {alles ? <Body muted>{t('vragenlijst.samenvatting.leeg')}</Body> : null}

      <Regel
        vraag={t('vragenlijst.focus.vraag')}
        antwoord={
          gebieden.length === 0
            ? niets
            : gebieden.map((g) => categorieLabels()[g]).join(' · ')
        }
        onWijzig={() => onWijzig(0)}
      />
      {gebieden.length === 0 ? null : (
        <View style={styles.gebieden}>
          {gebieden.map((gebied) => (
            <CategorieMerk key={gebied} categorie={gebied} label={categorieLabels()[gebied]} />
          ))}
        </View>
      )}

      <Regel
        vraag={t('vragenlijst.tijd.vraag')}
        antwoord={minuten === null ? niets : minutenLabels()[minuten]}
        onWijzig={() => onWijzig(1)}
      />

      <Regel
        vraag={t('vragenlijst.moment.vraag')}
        antwoord={moment === null ? niets : momentLabels()[moment]}
        onWijzig={() => onWijzig(2)}
      />

      <Regel
        vraag={t('vragenlijst.valkuil.vraag')}
        antwoord={
          valkuilen.length === 0
            ? niets
            : valkuilen.map((v) => valkuilLabels()[v]).join(' · ')
        }
        onWijzig={() => onWijzig(3)}
      />

      <Regel
        vraag={t('vragenlijst.held.vraag')}
        antwoord={
          keuze.soort === 'geen'
            ? bestaande.soort === 'held'
              ? t(heldTekstSleutel(bestaande.held, 'naam'))
              : niets
            : keuze.soort === 'quiz'
              ? t(heldTekstSleutel(keuze.held, 'naam'))
              : t('vragenlijst.held.kies_een')
        }
        onWijzig={() => onWijzig(EERSTE_HELDVRAAG as Stap)}
      />

      <HeldUitslag keuze={keuze} bestaande={bestaande} onKies={onKiesHeld} />

      {valkuilen.length === 0 ? null : (
        <View style={styles.helpt}>
          <Caption>{t('vragenlijst.samenvatting.dit_helpt')}</Caption>
          {valkuilen.map((valkuil) => (
            <Body key={valkuil} muted>
              {valkuilAntwoord(valkuil).antwoord}
            </Body>
          ))}
        </View>
      )}
    </Card>
  );
}

function Regel({
  vraag,
  antwoord,
  onWijzig,
}: {
  readonly vraag: string;
  readonly antwoord: string;
  readonly onWijzig: () => void;
}) {
  return (
    <View style={styles.regel}>
      <Caption>{vraag}</Caption>
      <Button variant="stil" block onPress={onWijzig}>
        {antwoord}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  knoppen: { gap: space.blokGap - 4 },
  gebieden: { flexDirection: 'row', flexWrap: 'wrap', gap: space.blokGap - 5 },
  valkuil: { gap: 4 },
  held: { gap: 4 },
  heldkaart: { gap: 2 },
  regel: { gap: 2 },
  helpt: { gap: 4 },
});
