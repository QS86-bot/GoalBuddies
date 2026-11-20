import { useState } from 'react';
import { Platform } from 'react-native';

import { updateProfiel, type Profiel as ProfielRij } from '@/modules/auth';

import {
  herinneringVelden,
  huidigeMeldingenstand,
  registreerPushToken,
  tijdVoorInvoer,
  laatstePushWeigering,
  verwijderPushToken,
  zetMeldingenAan,
  zetMeldingenUit,
  type Meldingenstand,
  type Toon,
  MELDINGSOORTEN,
  VOORKEUR_PER_SOORT,
  type Melding,
  meldingsoortVelden,
  stilleUrenVelden,
  uurUit,
} from '@/modules/notifications';
import { clientEnv } from '@/lib/env';
import { huidigInstallatieadvies } from '@/shared/pwa';
import { opmaaktaal, t, type Sleutel } from '@/shared/i18n';

import { toonTijd, verschovenUur } from '@/shared/time';
import { Body, Button, Caption, Card, Choice, Field, Subheading } from '@/shared/ui';

/** Het opslaan van de herinnering: bezig, fout en "bewaard" op één plek. */
function useHerinneringBewaren(userId: string, onOpgeslagen: (profiel: ProfielRij) => void) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bewaard, setBewaard] = useState(false);

  async function bewaar(velden: ReturnType<typeof herinneringVelden>) {
    setBezig(true);
    setFout(null);
    setBewaard(false);

    const uitkomst = await updateProfiel(userId, velden);

    if (uitkomst.ok) {
      onOpgeslagen(uitkomst.profiel);
      setBewaard(true);
    } else {
      setFout(uitkomst.melding);
    }

    setBezig(false);
  }

  return { bezig, fout, bewaard, setBewaard, bewaar };
}

/** De tijd en toon van de herinnering; alleen zichtbaar zolang de herinnering aanstaat. */
function HerinneringDetails({
  tijd,
  toon,
  bezig,
  onTijd,
  onToon,
}: {
  readonly tijd: string;
  readonly toon: Toon;
  readonly bezig: boolean;
  readonly onTijd: (v: string) => void;
  readonly onToon: (v: Toon) => void;
}) {
  return (
    <>
      <Field
        label={t('profiel.herinnering_hoe_laat')}
        hint={t('profiel.herinnering_hoe_laat_hint')}
        value={tijd}
        onChangeText={(v) => onTijd(v)}
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
      <Caption>
        {t('profiel.herinnering_om', {
          tijd: toonTijd(tijd, opmaaktaal()),
        })}
      </Caption>
      <Choice
        label={t('profiel.herinnering_toon')}
        hint={t('profiel.herinnering_toon_hint')}
        opties={[
          { waarde: 'gentle', label: t('profiel.herinnering_zacht') },
          { waarde: 'firm', label: t('profiel.herinnering_streng') },
        ]}
        waarde={toon}
        onKies={(v) => onToon(v)}
        disabled={bezig}
      />
    </>
  );
}

/** De bewaarknop van de herinnering met wat daarna te lezen valt: bewaard, een fout, of de uitleg. */
function HerinneringBewaren({
  bezig,
  bewaard,
  fout,
  onBewaar,
}: {
  readonly bezig: boolean;
  readonly bewaard: boolean;
  readonly fout: string | null;
  readonly onBewaar: () => void;
}) {
  return (
    <>
      <Button busy={bezig} onPress={onBewaar}>
        {t('profiel.herinnering_bewaren')}
      </Button>

      {bewaard ? <Caption muted={false}>{t('profiel.herinnering_bewaard')}</Caption> : null}
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <Caption>{t('profiel.herinnering_geen_meldingen')}</Caption>
    </>
  );
}

/** Titel en uitleg van de herinnering, met je eigen woorden uit de vragenlijst als die er zijn. */
function HerinneringKop({ motto }: { readonly motto: string | null }) {
  return (
    <>
      <Subheading>{t('profiel.herinnering_titel')}</Subheading>
      <Body muted>{t('profiel.herinnering_uitleg')}</Body>
      {motto === null ? null : <Body>{t('profiel.motto', { tekst: motto })}</Body>}
    </>
  );
}

interface HerinneringProps {
  readonly aan: boolean;
  readonly tijd: string | null;
  readonly toon: Toon;
  /** Je eigen woorden uit de vragenlijst (QS8-733): alleen hier, nooit in een melding. */
  readonly motto: string | null;
  readonly userId: string;
  readonly onOpgeslagen: (profiel: ProfielRij) => void;
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
export function HerinneringInstelling({
  aan,
  tijd,
  toon,
  motto,
  userId,
  onOpgeslagen,
}: HerinneringProps) {
  const [wilAan, setWilAan] = useState(aan);
  const [wilTijd, setWilTijd] = useState(() => tijdVoorInvoer(tijd));
  const [wilToon, setWilToon] = useState<Toon>(toon);
  const { bezig, fout, bewaard, setBewaard, bewaar } = useHerinneringBewaren(userId, onOpgeslagen);

  function wijzig(verander: () => void) {
    verander();
    setBewaard(false);
  }

  return (
    <Card>
      <HerinneringKop motto={motto} />

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
        <HerinneringDetails
          tijd={wilTijd}
          toon={wilToon}
          bezig={bezig}
          onTijd={(v) => wijzig(() => setWilTijd(v))}
          onToon={(v) => wijzig(() => setWilToon(v))}
        />
      ) : (
        <Body muted>{t('profiel.herinnering_uit_blijft_uit')}</Body>
      )}

      <HerinneringBewaren
        bezig={bezig}
        bewaard={bewaard}
        fout={fout}
        onBewaar={() =>
          void bewaar(herinneringVelden({ aan: wilAan, tijd: wilTijd, toon: wilToon }))
        }
      />
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
 * ⚠️ **Alleen op web**, en de reden is sinds QS8-366 een andere dan hier stond.
 *    Niet `expo-notifications` — die staat er sinds Q-TODO B4 en `_layout` plugt
 *    op native `expoPush` in. Wat native mist is de tóestemmingsknop: `expoPush`
 *    vraagt zelf om toestemming bij het ophalen van een token, dus een tweede
 *    knop hier zou hetzelfde twee keer doen. Deze knop hoort bij web push, waar
 *    de toestemming per RFC uit een echte klik moet komen.
 */
/**
 * De tekstsleutel per soort die een eigen schakelaar heeft.
 *
 * ⚠️ **Exhaustief getypeerd en met opzet geen losse lijst.** Komt er een soort
 *    bij mét een eigen schakelaar, dan is een ontbrekende rij hier een typefout
 *    en geen scherm dat er stilletjes één mist. Zelfde gedachte als
 *    `VOORKEUR_PER_SOORT`, één laag hoger.
 *
 * ⚠️⚠️ **`commitment_reverted` staat hier met reden níet** (QS8-321). Die soort
 *    deelt `notify_commitment_witness` met `commitment_witness`, dus een rij
 *    hier zou een tweede schakelaar tonen voor dezelfde kolom — twee knoppen die
 *    elkaar overschrijven, en een gebruiker die niet kan zien welke telt.
 *    Daarom `Zichtbaar` en niet `Exclude<Melding, 'nudge'>`: dat de uitsluiting
 *    in het type staat, is precies waarom `tsc` hierover moest klagen toen de
 *    zesde soort erbij kwam. Die klacht was terecht en dit is het antwoord
 *    erop — niet een rij erbij.
 */
/**
 * ⚠️ `group_digest` (QS8-755) staat hier met opzet nog níét in: de functie staat
 *    uit (`groepsdigest_aan()` geeft false, 0310), en een schakelaar voor iets dat
 *    nooit komt liegt tegen de gebruiker (regel 18, vraag 5). De schakelaar landt
 *    in een vervolgissue, samen met het moment waarop Quinten de vlag aanzet. Let
 *    op: die kolom staat standaard UIT, en `!== false` hieronder zou een
 *    ontbrekend veld als aan tonen.
 */
type Zichtbaar = Exclude<Melding, 'nudge' | 'commitment_reverted' | 'group_digest'>;

const MELDINGSOORT_TEKST: Readonly<Record<Zichtbaar, Sleutel>> = {
  approval_request: 'meldingsoort.approval_request',
  approval_received: 'meldingsoort.approval_received',
  cycle_summary: 'meldingsoort.cycle_summary',
  commitment_witness: 'meldingsoort.commitment_witness',
};

/**
 * Eén schakelaar, en hij toont nooit een stand die niet opgeslagen is.
 *
 * ⚠️ **Geen optimistic update.** De andere kaarten op dit scherm doen het ook
 *    niet, en de reden staat bij `Meldingen`: een scherm dat "aan" toont terwijl
 *    de opslag mislukte, liegt tegen de gebruiker over iets dat hij later niet
 *    zal krijgen. De waarde komt uit het opgeslagen profiel en verandert pas als
 *    de database het bevestigt.
 */
function MeldingsoortRij({
  sleutel,
  aan,
  bezig,
  onZet,
}: {
  readonly sleutel: Sleutel;
  readonly aan: boolean;
  readonly bezig: boolean;
  readonly onZet: (nieuw: boolean) => void;
}) {
  return (
    <Choice
      label={t(sleutel)}
      opties={[
        { waarde: 'aan', label: t('profiel.aan') },
        { waarde: 'uit', label: t('profiel.uit') },
      ]}
      waarde={aan ? 'aan' : 'uit'}
      onKies={(v) => onZet(v === 'aan')}
      disabled={bezig}
    />
  );
}

/**
 * Per meldingsoort een schakelaar — QS8-92, criterium 1.
 *
 * ⚠️ **`nudge` staat hier niet bij, en de uitlegzin zegt waarom.** Die schakelaar
 *    is `HerinneringInstelling` hierboven, met zijn eigen tijd en toon. Zonder die
 *    zin lijkt deze lijst incompleet en gaat iemand een vijfde rij toevoegen —
 *    en dan staat hetzelfde feit op twee plekken (QS8-125).
 *
 * ⚠️ **Direct opslaan en geen bewaarknop.** `HerinneringInstelling` heeft er één
 *    omdat de tijd vrije tekst is die je halverwege kunt typen. Een schakelaar is
 *    een gesloten keuze — zelfde vorm als `TaalInstelling` en `TijdzoneInstelling`.
 */
export function MeldingsoortenInstelling({
  profiel,
  userId,
  onOpgeslagen,
}: {
  readonly profiel: ProfielRij;
  readonly userId: string;
  readonly onOpgeslagen: (profiel: ProfielRij) => void;
}) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function zet(soort: Exclude<Melding, 'nudge'>, aan: boolean) {
    setBezig(soort);
    setFout(null);

    const uitkomst = await updateProfiel(userId, meldingsoortVelden(soort, aan));

    if (uitkomst.ok) onOpgeslagen(uitkomst.profiel);
    else setFout(uitkomst.melding);

    setBezig(null);
  }

  return (
    <Card>
      <Subheading>{t('meldingsoort.titel')}</Subheading>
      <Body muted>{t('meldingsoort.uitleg')}</Body>

      {/* ⚠️ `commitment_reverted` valt hier ook af: hij deelt zijn kolom met
          `commitment_witness`, en twee schakelaars voor één kolom overschrijven
          elkaar (QS8-321). De uitsluiting staat in `Zichtbaar` hierboven, zodat
          `tsc` klaagt zodra iemand hem tóch als eigen soort wil tonen. */}
      {MELDINGSOORTEN.filter(
        (s): s is Zichtbaar => s !== 'nudge' && s !== 'commitment_reverted' && s !== 'group_digest',
      ).map((soort) => {
        // `Zichtbaar` sluit group_digest uit; de kolom ontbreekt in de types tot 0310 is uitgerold.
        const kolom = VOORKEUR_PER_SOORT[soort] as Exclude<
          (typeof VOORKEUR_PER_SOORT)[Melding],
          'notify_group_digest'
        >;
        return (
          <MeldingsoortRij
            key={soort}
            sleutel={MELDINGSOORT_TEKST[soort]}
            aan={profiel[kolom] !== false}
            bezig={bezig === soort}
            onZet={(nieuw) => void zet(soort, nieuw)}
          />
        );
      })}

      <Caption>{t('meldingsoort.getuige_uitleg')}</Caption>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/** De 24 uren als keuzeopties, zonder ze te hoeven uitschrijven. */
function uurOpties(): readonly {
  readonly waarde: number;
  readonly label: string;
}[] {
  return Array.from({ length: 24 }, (_, u) => ({
    waarde: u,
    label: `${String(u).padStart(2, '0')}:00`,
  }));
}

/**
 * Wat er met je herinnering gebeurt als hij in de stille uren valt.
 *
 * ⚠️ **Het getal komt uit `verschovenUur()` en niet uit een eigen som.** Dat is
 *    het verschil tussen een mededeling en een belofte: deze zin kan niet uit de
 *    pas lopen met wat de meldingenjob doet, want het is dezelfde functie.
 */
function HerinneringVerschoven({
  tijd,
  van,
  tot,
}: {
  readonly tijd: string | null;
  readonly van: number | null;
  readonly tot: number | null;
}) {
  const uur = uurUit(tijd);
  const nieuw = verschovenUur(uur, van, tot);
  if (uur === null || nieuw === null || nieuw === uur) return null;

  return (
    <Caption>
      {t('stilteuren.herinnering_verschoven', {
        oud: `${String(uur).padStart(2, '0')}:00`,
        nieuw: `${String(nieuw).padStart(2, '0')}:00`,
      })}
    </Caption>
  );
}

/**
 * Het opslaan van het stille venster, los van de opmaak.
 *
 * ⚠️ Staat apart sinds `StilleUrenInstelling` over de vijftig regels van
 *    coderegel 15 ging; `app/` staat onder een ratel, dus splitsen is hier het
 *    antwoord en niet het plafond ophogen.
 *
 * ⚠️ **Geen optimistic update.** De waarde die het scherm toont komt uit het
 *    opgeslagen profiel en verandert pas als de database het bevestigt — zelfde
 *    reden als bij `Meldingen`: een scherm dat "aan" toont terwijl de opslag
 *    mislukte, liegt over iets dat de gebruiker later niet krijgt.
 */
function useVensterOpslag(userId: string, onOpgeslagen: (profiel: ProfielRij) => void) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar(keuze: { aan: boolean; van: number; tot: number }) {
    setBezig(true);
    setFout(null);

    const uitkomst = await updateProfiel(userId, stilleUrenVelden(keuze));

    if (uitkomst.ok) onOpgeslagen(uitkomst.profiel);
    else setFout(uitkomst.melding);

    setBezig(false);
  }

  return { bezig, fout, bewaar };
}

/**
 * De twee uurkeuzes.
 *
 * ⚠️ Staat los sinds `StilleUrenInstelling` over de vijftig regels van
 *    coderegel 15 ging. `app/` staat onder een ratel: het aantal lange functies
 *    mag alleen dálen, dus splitsen is hier het antwoord en niet het plafond
 *    ophogen.
 *
 * ⚠️ Elke lijst laat het uur van de ánder weg. De database weigert
 *    `van === tot` (`profiles_stilte_is_geen_punt`), dus een scherm dat die
 *    keuze aanbiedt, biedt een databasefout aan.
 */
function StilteVenster({
  van,
  tot,
  bezig,
  onKies,
}: {
  readonly van: number;
  readonly tot: number;
  readonly bezig: boolean;
  readonly onKies: (keuze: { van: number; tot: number }) => void;
}) {
  return (
    <>
      <Choice
        label={t('stilteuren.van')}
        opties={uurOpties().filter((o) => o.waarde !== tot)}
        waarde={van}
        onKies={(v) => onKies({ van: v, tot })}
        disabled={bezig}
      />
      <Choice
        label={t('stilteuren.tot')}
        opties={uurOpties().filter((o) => o.waarde !== van)}
        waarde={tot}
        onKies={(v) => onKies({ van, tot: v })}
        disabled={bezig}
      />
    </>
  );
}

/** De stand van de pushmeldingen en de twee handelingen die hem veranderen. */
function useMeldingenstand(
  userId: string,
  sleutel: ReturnType<typeof clientEnv>['vapidPublicKey'],
) {
  const [stand, setStand] = useState<Meldingenstand>(() => huidigeMeldingenstand(sleutel));
  const [bezig, setBezig] = useState(false);
  // ⚠️ **De stille kant van QS8-377.** `Pushwacht` registreert bij elke start
  //    opnieuw en heeft geen scherm om iets op te tonen; een melding bij elke
  //    start zou erger zijn dan geen. Mislukte die registratie, dan onthoudt de
  //    datalaag de reden en leest hij hier mee — dit is de plek waar iemand
  //    kijkt als hij zich afvraagt waarom hij niets binnenkrijgt.
  const stilleWeigering = laatstePushWeigering();
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  async function zetAan() {
    setBezig(true);
    setFout(null);

    const uitkomst = await zetMeldingenAan(sleutel);
    if (uitkomst.ok) {
      // Pas hierna registreren: nu bestaat het abonnement en heeft
      // `haalToken()` iets te lezen.
      //
      // ⚠️⚠️ **Hier stond `await registreerPushToken(userId); setStand('aan');`,
      //    en dat tweede gebeurde ongeacht de uitkomst** (QS8-377). Het
      //    abonnement in de browser bestond dan wel, maar zonder geregistreerd
      //    token krijgt de gebruiker niets — en het scherm zei "meldingen staan
      //    aan". Dat is de ergste vorm van een ontbrekende error-staat: hij
      //    liegt in plaats van te zwijgen.
      const geregistreerd = await registreerPushToken(userId);
      if (geregistreerd.ok) {
        setStand('aan');
      } else {
        setFout(geregistreerd.melding);
      }
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

  return { stand, bezig, fout, melding, stilleWeigering, zetAan, zetUit };
}

/**
 * Het stille venster — QS8-406.
 *
 * ⚠️ **Hele uren en geen tekstveld.** De opslag is `smallint` en de job beslist
 *    per uur; een veld dat `22:30` accepteert liegt over wat er gebeurt.
 *
 * ⚠️ De database weigert `van === tot` (`profiles_stilte_is_geen_punt`), dus dat
 *    laat dit scherm niet toe: `tot` slaat het gekozen `van` over. Zonder die
 *    stap krijgt de gebruiker een databasefout te zien voor een keuze die het
 *    scherm zelf aanbood.
 */
export function StilleUrenInstelling({
  profiel,
  userId,
  onOpgeslagen,
}: {
  readonly profiel: ProfielRij;
  readonly userId: string;
  readonly onOpgeslagen: (profiel: ProfielRij) => void;
}) {
  const aan = profiel.quiet_from !== null && profiel.quiet_to !== null;
  const van = profiel.quiet_from ?? 22;
  const tot = profiel.quiet_to ?? 7;

  const { bezig, fout, bewaar } = useVensterOpslag(userId, onOpgeslagen);

  return (
    <Card>
      <Subheading>{t('stilteuren.titel')}</Subheading>
      <Body muted>{t('stilteuren.uitleg')}</Body>

      <Choice
        label={t('stilteuren.label')}
        opties={[
          { waarde: 'aan', label: t('profiel.aan') },
          { waarde: 'uit', label: t('profiel.uit') },
        ]}
        waarde={aan ? 'aan' : 'uit'}
        onKies={(v) => void bewaar({ aan: v === 'aan', van, tot })}
        disabled={bezig}
      />

      {aan ? (
        <StilteVenster
          van={van}
          tot={tot}
          bezig={bezig}
          onKies={(keuze) => void bewaar({ aan: true, ...keuze })}
        />
      ) : null}

      {aan ? (
        <HerinneringVerschoven
          tijd={profiel.reminder_time}
          van={profiel.quiet_from}
          tot={profiel.quiet_to}
        />
      ) : null}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

export function Meldingen({ userId }: { readonly userId: string }) {
  const sleutel = clientEnv().vapidPublicKey;
  const { stand, bezig, fout, melding, stilleWeigering, zetAan, zetUit } = useMeldingenstand(
    userId,
    sleutel,
  );

  if (Platform.OS !== 'web') return null;

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
      {/* ⚠️ De verse fout wint van de onthouden weigering: wie net op de knop
          drukte, hoort te lezen wat er nét gebeurde en niet wat er bij het
          opstarten misging. */}
      {(fout ?? stilleWeigering) === null ? null : (
        <Caption danger>{fout ?? stilleWeigering}</Caption>
      )}
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
