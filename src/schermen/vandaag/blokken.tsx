import { useState } from 'react';
import { View } from 'react-native';

import type { Getuigenis } from '@/modules/commitments';
import {
  heldTekstSleutel,
  quoteVoorVerschijning,
  type Verschijning,
} from '@/modules/helden';
import {
  badgeLabels,
  badgeUitleg,
  schuifDoor,
  type VerdiendeBadge,
  type Weekdoel,
} from '@/modules/goals';
import { opmaaktaal, t } from '@/shared/i18n';
import { localDateOf, toonDatum, type IsoDate, type UserClock } from '@/shared/time';
import { Bevestiging, bevestigingen, Body, Button, Caption, Card, Subheading } from '@/shared/ui';

import { styles } from './stijlen';

/**
 * Wat je tot nu toe gedaan hebt — QS8-78 (PRD 8.4).
 *
 * ⚠️ **Dit blok staat op *Vandaag* en nergens anders, en dat is de hele
 *    ontwerpkeuze.** Badges zijn privé: `badges_select` is `user_id =
 *    auth.uid()`. Een badgemuur naast een ledenlijst is de zuiverste vorm van
 *    het probleem dat domeinregel 7 beschrijft — **de badge die er níét staat,
 *    is het signaal.** Wie na twaalf weken geen `streak_12` heeft, heeft
 *    zichtbaar een week gemist.
 *
 *    Geef dit component dus nooit een `viewer`-prop en zet het nooit op een
 *    groepsscherm. Dezelfde afspraak als bij `Weekpas` en `DoelStandKaart`.
 *
 * ⚠️ **Op Vandaag alleen verdiende badges, geen grijze vakjes voor wat je nog niet hebt.**
 *    (Sinds 19-11-2026, QS8-735, toont het eigen Prestatiescherm ze wél: besluit van Quinten,
 *    alleen voor jezelf; zie `docs/decisions/2026-11-19-het-prestatiescherm-toont-ook-wat-je-nog-niet-hebt.md`.)
 *    Een lijst met vijf slots waarvan er één gevuld is, is een lijst van wat je
 *    níét gehaald hebt — met een vrolijk randje eromheen. Dat is precies het
 *    beeld dat dit product bij de groep verbiedt, en er is geen reden om het bij
 *    jezelf wél te doen.
 */
/**
 * De straffen waarvan jij persoonlijk de getuige bent — QS8-292.
 *
 * ⚠️ **Dit blok bestond niet terwijl het recht er sinds 0168 wél was.** De
 *    getuige kreeg leesrecht op het moment dat een straf verschuldigd werd, maar
 *    er was geen enkele plek waar hij het tegenkwam: de énige lezing van
 *    `commitments` vraagt per doel en staat op het scherm van de eigenaar, dat
 *    de getuige niet eens kan openen. Regel 18 vraag 5 — elk schakeltje af, de
 *    keten onderbroken.
 *
 * ⚠️ **Leeg betekent wég, en dat is anders dan bij `BadgeBlok`.** Getuige zijn
 *    is de uitzondering en niet de regel; een kop "Jij bent getuige" met
 *    daaronder "nog niets" zou op bijna elk scherm staan en niets betekenen.
 *
 * ⚠️ **Geen doeltitel, en dat is geen omissie.** 0168 sluit het doel voor de
 *    getuige af — titel, streefdatum en voortgang gaan hem niet aan. Wat hij ziet
 *    is de inzet die de ander zichzelf oplegde, en van wie. Zie migratie 0169.
 */
/**
 * De held die vandaag gesproken heeft, met zijn quote — QS8-475.
 *
 * ⚠️⚠️ **Alleen vandáág, en de dag is die van de gebruiker.** `hero_appearances`
 *    draagt alleen `shown_at`, dus de grens wordt hier met `localDateOf()` uit
 *    `shared/time` getrokken — correctheidsregel 7 laat geen tweede plek toe
 *    waar een dag begint. Zonder die toets staat de quote van vorige week hier
 *    nog, en dan is het geen "wie er vandaag met je meeliep" meer maar een
 *    willekeurige spreuk.
 *
 * ⚠️ **De quote draagt zijn bron, en dat is besluit 3 van QS8-468.** De
 *    historische figuur is uit de hoofd-UI gehaald; de bronvermelding onder een
 *    citaat is iets anders dan een personage vernoemen, en zonder haar leest een
 *    echt citaat als verzonnen app-copy.
 *
 * ⚠️ Geen verschijning, geen profiel of een verschijning van gisteren: dan staat
 *    er niets. Dat is de lege staat, en die is hier stilte en geen kaart met
 *    "er is vandaag nog geen held geweest" — dat zou een melding zijn over de
 *    afwezigheid van een melding.
 */
export function HeldBlok({
  verschijning,
  vandaag,
  tz,
}: {
  readonly verschijning: Verschijning | null;
  readonly vandaag: IsoDate | null;
  readonly tz: string | null;
}) {
  if (verschijning === null || vandaag === null || tz === null) return null;
  if (localDateOf(verschijning.wanneer, tz as never) !== vandaag) return null;

  const quote = quoteVoorVerschijning(verschijning.held, verschijning.wanneer);

  return (
    <Card>
      <Subheading>{t(heldTekstSleutel(verschijning.held, 'naam'))}</Subheading>
      <Caption>{t(heldTekstSleutel(verschijning.held, 'ondertitel'))}</Caption>

      <Body>{t(quote.tekst)}</Body>
      <Caption>{t(quote.bron)}</Caption>
    </Card>
  );
}

export function GetuigenisBlok({ getuigenissen }: { readonly getuigenissen: readonly Getuigenis[] }) {
  if (getuigenissen.length === 0) return null;

  return (
    <Card>
      <Subheading>{t('getuigenis.titel')}</Subheading>
      <Body muted>{t('getuigenis.uitleg')}</Body>

      {getuigenissen.map((g) => (
        <Card nested key={g.id}>
          <Subheading>
            {t('getuigenis.van', { naam: g.eigenaar_naam || t('commitment.begunstigde.naamloos') })}
          </Subheading>
          <Body>{g.body}</Body>
          <Caption>
            {g.status === 'resolved' ? t('getuigenis.afgehandeld') : t('getuigenis.verschuldigd')}
          </Caption>
        </Card>
      ))}
    </Card>
  );
}

export function BadgeBlok({ badges }: { readonly badges: readonly VerdiendeBadge[] }) {
  const namen = badgeLabels();
  const uitleg = badgeUitleg();

  return (
    <Card>
      <Subheading>{t('badge.kop')}</Subheading>

      {badges.length === 0 ? (
        <Body muted>{t('badge.nog_geen')}</Body>
      ) : (
        <>
          {badges.map((verdiend) => (
            <Card nested key={verdiend.badge}>
              <Subheading>{namen[verdiend.badge]}</Subheading>
              <Caption>{uitleg[verdiend.badge]}</Caption>
            </Card>
          ))}

          {/*
            ⚠️ Onderaan en alleen als er iets staat. Deze zin legt uit waaróm een
               badge blijft staan als een reeks breekt — precies het moment waarop
               iemand anders zou denken dat hij hem kwijt is.
          */}
          <Caption>{t('badge.blijven_staan')}</Caption>
        </>
      )}
    </Card>
  );
}

/**
 * Weken die je gemist hebt en nog kunt meenemen — QS8-47, QS8-106.
 *
 * ⚠️ **Alleen voor jezelf.** Dit blok is een lijst gemiste weken, en dat is
 *    precies het gegeven dat migratie 0019 en 0020 voor groepsgenoten hebben
 *    dichtgezet. Het hoort op dit scherm en op geen enkel groepsscherm — zelfde
 *    waarschuwing als bij `StandBlok` hierboven.
 *
 * ⚠️ Rendert niets als er niets openstaat. Een leeg kader "geen gemiste weken"
 *    is een herinnering aan een probleem dat je niet hebt, en dat is precies de
 *    toon die domeinregel 7 uit de app wil houden — ook in je eigen scherm.
 */
export function OpenstaandBlok({
  weekdoelen,
  klok,
  onKlaar,
}: {
  readonly weekdoelen: readonly Weekdoel[];
  readonly klok: UserClock | null;
  readonly onKlaar: () => void;
}) {
  if (weekdoelen.length === 0 || klok === null) return null;

  return (
    <Card nested>
      <Subheading>{t('vandaag.openstaand')}</Subheading>
      {/*
        ⚠️ De tekst zegt wat doorschuiven wél en níét doet. Vóór migratie 0045
           repareerde doorschuiven je reeks, en wie dat nog denkt, komt bedrogen
           uit op een moment dat hij het niet controleert (Q-TODO A39).
      */}
      <Body muted>{t('vandaag.meenemen_uitleg')}</Body>

      <View style={styles.lijst}>
        {weekdoelen.map((weekdoel) => (
          <DoorschuifKaart key={weekdoel.id} weekdoel={weekdoel} klok={klok} onKlaar={onKlaar} />
        ))}
      </View>
    </Card>
  );
}

function DoorschuifKaart({
  weekdoel,
  klok,
  onKlaar,
}: {
  readonly weekdoel: Weekdoel;
  readonly klok: UserClock;
  readonly onKlaar: () => void;
}) {
  const [vraagt, setVraagt] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function doorschuiven() {
    setBezig(true);
    setFout(null);

    // ⚠️ `schuifDoor()` was tot 0091 twee aanroepen zonder transactie eromheen,
    //    en viel de verbinding daartussen weg dan stond de oude week op `carried`
    //    zonder opvolger — weg uit dit blok, want `fetchDoorschuifbaar()` haalt
    //    alleen `missed` op. Sinds 0091 doet één RPC beide, dus dat gat is dicht.
    //    De cyclus wordt nog steeds hier uitgerekend en meegegeven: de database
    //    kent de week-startdag van deze gebruiker niet (correctheidsregel 7).
    const uitkomst = await schuifDoor(weekdoel, klok);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setVraagt(false);
    onKlaar();
  }

  if (vraagt) {
    return (
      <Bevestiging
        tekst={bevestigingen().weekdoelDoorschuiven}
        bezig={bezig}
        fout={fout}
        onBevestig={() => void doorschuiven()}
        onAnnuleer={() => {
          setVraagt(false);
          setFout(null);
        }}
      />
    );
  }

  return (
    <Card flat>
      <View style={styles.kop}>
        <Body>{weekdoel.title}</Body>
        <Caption>{t('dashboard.week_van', { datum: toonDatum(weekdoel.cycle_start_date, opmaaktaal()) })}</Caption>
      </View>

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button onPress={() => setVraagt(true)}>{t('vandaag.meenemen_knop')}</Button>
    </Card>
  );
}
