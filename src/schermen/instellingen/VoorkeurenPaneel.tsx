import { useState } from 'react';
import {
  updateProfiel,
  userClock,
  zetWeekStartdag,
  type Profiel as ProfielRij,
} from '@/modules/auth';

import { t, taal, zetTaal, type Taal } from '@/shared/i18n';

import { apparaatTijdzone, type Weekday } from '@/shared/time';
import {
  Bevestiging,
  bevestigingen,
  Body,
  Caption,
  Card,
  Choice,
  Subheading,
  TaalKeuze,
  useVieringenAan,
  WeekStartKeuze,
} from '@/shared/ui';

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
 * ⚠️ Sinds QS8-796 ververst `zetTaal()` zelf elke route: hij meldt de wissel en
 *    `useVolgTaal()` (`src/shared/i18n/react.ts`) laat de route opnieuw renderen.
 *    De `onOpgeslagen` hierna is er voor het profiel in de provider, zodat de
 *    keuze op dit scherm meteen aangevinkt staat.
 *
 * ⚠️ `locale` is `null` zolang er geen keuze staat (migratie 0061). De lijst
 *    toont dan de taal die de app nú spreekt — afgeleid van het apparaat — zodat
 *    er altijd iets aanstaat. Dat is geen stille keuze: de kolom blijft leeg tot
 *    de gebruiker zelf iets aanwijst.
 */
export function TaalInstelling({
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
 * De tijdzone waarin deze app rekent — QS8-472.
 *
 * ⚠️⚠️ **Dit was een keuze en is een mededeling geworden.** Er stond een
 *    `TijdzoneKeuze` met een zoekveld en een opslagpad; `Tijdzonewacht` in
 *    `app/_layout.tsx` houdt de kolom nu gelijk aan het apparaat en er is geen
 *    handmatig pad meer. Quintens besluit van 14-09-2026.
 *
 * ⚠️ **De regel blijft staan, en dat is geen restant.** Domeinregel 2 hangt hier
 *    aan: "vandaag" en "deze week" worden in deze zone berekend, en een reeks die
 *    om middernacht verkeerd breekt kost je een gebruiker. Wie dát ziet gebeuren,
 *    hoort te kunnen nazien in welke zone er gerekend wordt — anders is het
 *    onverklaarbaar gedrag in plaats van een verkeerd ingestelde telefoon.
 *    Acceptatiecriterium 4 van het issue.
 *
 * ⚠️ Geen `onOpgeslagen` en geen `userId` meer: dit component schrijft niets. Zou
 *    het dat wel doen, dan was er een tweede schrijver naast de wacht en konden
 *    die twee elkaar overschrijven.
 */
export function TijdzoneInstelling({ waarde }: { readonly waarde: string }) {
  return (
    <Card>
      <Subheading>{t('tijdzone.label')}</Subheading>
      <Body>
        {t('tijdzone.nu', {
          zone: waarde === '' ? apparaatTijdzone() : waarde,
        })}
      </Body>
      <Caption>{t('tijdzone.van_het_apparaat')}</Caption>
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
export function WeekStartInstelling({
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
export function VieringKeuze() {
  const { aan, geladen, zet } = useVieringenAan();

  return (
    <Card>
      <Subheading>{t('profiel.viering_titel')}</Subheading>
      <Body muted>{t('profiel.viering_uitleg')}</Body>

      <Choice
        label={t('profiel.viering_titel')}
        subtiel
        opties={[
          { waarde: 'aan', label: t('profiel.aan') },
          { waarde: 'uit', label: t('profiel.uit') },
        ]}
        waarde={aan ? 'aan' : 'uit'}
        onKies={(v) => zet(v === 'aan')}
        disabled={!geladen}
      />

      <Caption>{t('profiel.viering_beweging')}</Caption>
    </Card>
  );
}
