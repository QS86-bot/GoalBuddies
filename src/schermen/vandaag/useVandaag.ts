import { useCallback, useEffect, useRef, useState } from 'react';

import { useProfiel, useSession, userClock } from '@/modules/auth';
import { fetchGetuigenissen } from '@/modules/commitments';
import { laatsteVerschijning } from '@/modules/helden';
import {
  fetchAfgevinktOp,
  fetchAfvinkingenPerWeekdoel,
  fetchBevestigingsstanden,
  fetchDagzetten,
  type DagZet,
} from '@/modules/completions';
import {
  afsluitbareCyclus,
  doelIdsInBeeld,
  fetchBadges,
  fetchDoelnamen,
  fetchDoelStanden,
  fetchDoorschuifbaar,
  fetchIngeschovenDezeCyclus,
  fetchWeekdoelen,
  huidigeCyclus,
  inCoulanceperiode,
  zojuistAfgeslotenCyclus,
  type DoelStand,
  type Doelnaam,
  type Weekdoel,
} from '@/modules/goals';
import { localDateIn, now } from '@/shared/time';
import { useAsync, useAsyncMetTerugval } from '@/shared/ui';

import { GEEN_WEEKDOELEN } from './constanten';
import { laadTips } from './tips';

/**
 * De gegevens van het Vandaag-scherm — QS8-748.
 *
 * ⚠️ **Verhuisd uit `app/(tabs)/index.tsx`, zonder gedragsverandering.** De
 *    afhankelijkheidslijsten, de `levend`-vlaggen en de volgorde van de
 *    effecten zijn woordelijk overgenomen: dit scherm heeft al een keer een
 *    oneindige laadlus gekost (QS8-75), en een splitsing is geen reden om die
 *    lijsten opnieuw te bedenken.
 *
 * ⚠️ Elke hook hieronder is één ophaalronde met zijn eigen faalgedrag. Wat
 *    apart laadde en apart faalde, blijft dat — zie de kop bij elk blok.
 */

type Profiel = ReturnType<typeof useProfiel>['profiel'];

/** De klok en de cycli van deze gebruiker, allemaal uit `shared/time`. */
function useTijd(profiel: Profiel) {
  const klok = profiel ? userClock(profiel) : null;
  const cyclus = klok ? huidigeCyclus(klok) : null;
  const afTeSluiten = klok ? afsluitbareCyclus(klok) : null;
  const coulance = klok ? inCoulanceperiode(klok) : false;

  // ⚠️ De cyclusobjecten worden elke render opnieuw gebouwd, dus als
  //    afhankelijkheid zijn ze waardeloos: het effect zou eindeloos herhalen.
  //    De startdatum is wat er werkelijk verandert, en die is een string.
  const afTeSluitenStart = afTeSluiten?.startDate ?? null;
  const cyclusStart = cyclus?.startDate ?? null;

  // ⚠️ De week die de rollover zojuist dichtzette, en dus níét `afTeSluiten`.
  //    Die twee zijn per definitie verschillend — zie `zojuistAfgeslotenCyclus`.
  const geslotenStart = klok ? zojuistAfgeslotenCyclus(klok).startDate : null;

  /**
   * De datum van vandaag in de tijdzone van de gebruiker — QS8-253.
   *
   * ⚠️ Uit `shared/time` en nergens anders (correctheidsregel 7). Welke dag het
   *    "hier" is, bepaalt of een afvinking van vandaag is; de server toetst
   *    alleen nog dat die datum binnen de week van het weekdoel valt.
   */
  const vandaagLokaal = profiel ? localDateIn(profiel.tz, now()) : null;

  return {
    klok,
    cyclus,
    afTeSluiten,
    coulance,
    afTeSluitenStart,
    cyclusStart,
    geslotenStart,
    vandaagLokaal,
  };
}

type Tijd = ReturnType<typeof useTijd>;

/** De weekdoelen en de Dagzetten van de week: het deel dat het scherm nodig heeft. */
function useWeek(userId: string | null, tijd: Tijd, ronde: number) {
  const { afTeSluiten, cyclus, afTeSluitenStart, cyclusStart } = tijd;
  const [weekdoelen, setWeekdoelen] = useState<readonly Weekdoel[]>([]);
  const [dagzetten, setDagzetten] = useState<readonly DagZet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!userId || !afTeSluiten || !cyclus) return;
    let levend = true;

    // ⚠️ Het stand-blok hangt hier bewust níét in. Het is een blok onderaan het
    //    scherm, en een storing daarin hoort de weekdoelenlijst erboven niet mee
    //    te slepen: met alles in één `Promise.all` kreeg iemand met een slechte
    //    verbinding "Je weekpassen konden niet geladen worden" te zien in plaats
    //    van zijn week, terwijl die week gewoon binnen was. Bevinding van de
    //    gebruikersreview op QS8-75.
    Promise.all([fetchWeekdoelen(userId, afTeSluiten), fetchDagzetten(userId, cyclus)])
      .then(([doelen, zetten]) => {
        if (!levend) return;
        setWeekdoelen(doelen);
        setDagzetten(zetten);
        setError(null);
      })
      .catch((fout: unknown) => {
        if (levend) setError(fout);
      })
      .finally(() => {
        if (levend) setLoading(false);
      });

    return () => {
      levend = false;
    };

    // ⚠️ `afTeSluiten` en `cyclus` staan hier bewust NIET in, en dat is geen
    //    slordigheid maar de hele reden dat `afTeSluitenStart` en `cyclusStart`
    //    bestaan. `huidigeCyclus()` en `afsluitbareCyclus()` geven elke render
    //    een vers object terug, dus als afhankelijkheid zijn ze altijd
    //    "veranderd": ophalen → `setWeekdoelen` → render → nieuwe objecten →
    //    ophalen. Een oneindige lus die je aan het scherm niet ziet, want de
    //    gegevens zijn elke ronde hetzelfde en `loading` staat al uit — je ziet
    //    het alleen aan je Supabase-verbruik. De comment hierboven zei dit al en
    //    de lijst deed het tegenovergestelde. Gevonden door de code-review op
    //    QS8-75.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, afTeSluitenStart, cyclusStart, ronde]);

  return { weekdoelen, dagzetten, loading, error };
}

/**
 * Het stand-blok: standen, titels en categorieën per doel.
 *
 * Het laadt apart en faalt apart: lukt het niet, dan blijft het blok gewoon
 * weg en houdt de rest van het scherm zijn gegevens.
 */
function useStanden(userId: string | null, ronde: number, weekdoelen: readonly Weekdoel[]) {
  const [standen, setStanden] = useState<ReadonlyMap<string, DoelStand>>(new Map());
  const [doeltitels, setDoeltitels] = useState<ReadonlyMap<string, string>>(new Map());
  /**
   * De categorie per doel — besluit A48, voor de weektip.
   *
   * ⚠️ Uit dezelfde `fetchDoelnamen()` als de titels hierboven, en dus zonder
   *    één extra verzoek. Een aparte query per kaart zou hier de N+1 zijn die
   *    onwrikbare regel 12 met naam noemt, en dat voor een regel tekst.
   */
  const [doelcategorieen, setDoelcategorieen] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    if (!userId) return;
    let levend = true;

    // ⚠️ **Twee ronden, en de tweede vraagt naar wat er op het scherm staat —
    //    QS8-226.** Hier stond `fetchDoelen(userId)`, en die geeft pagina 0: de
    //    eerste twintig doelen. `StandBlok` filtert vervolgens elke stand weg
    //    waarvan hij de titel niet kent, met als reden "dat is een gearchiveerd
    //    of verwijderd doel". Bij eenentwintig actieve doelen klopte die reden
    //    niet meer en verdween een levend doel stilzwijgend van het dashboard.
    //
    //    `doelIdsInBeeld()` levert precies de doelen waar dit scherm naar
    //    verwijst — de standen én de weekdoelen — en `fetchDoelnamen()` haalt
    //    daar de titels bij. Begrensd, want de lijst komt uit wat er getoond
    //    wordt.
    fetchDoelStanden(userId)
      .then(async (gevondenStanden) => {
        if (!levend) return { gevondenStanden, namen: new Map() as ReadonlyMap<string, Doelnaam> };
        const namen = await fetchDoelnamen(doelIdsInBeeld(gevondenStanden, weekdoelen));
        return { gevondenStanden, namen };
      })
      .then(({ gevondenStanden, namen }) => {
        if (!levend) return;
        setStanden(gevondenStanden);
        setDoeltitels(new Map([...namen].map(([id, n]) => [id, n.title])));
        setDoelcategorieen(new Map([...namen].map(([id, n]) => [id, n.category])));
      })
      .catch(() => {
        // Bewust stil op het scherm, maar niet stil in de logboeken: de
        // datalaag heeft de fout al via `reportError` gemeld. Hier zou een
        // tweede foutmelding alleen maar over de weekdoelen heen vallen.
        if (levend) {
          setStanden(new Map());
          setDoeltitels(new Map());
          setDoelcategorieen(new Map());
        }
      });

    return () => {
      levend = false;
    };
  }, [userId, ronde, weekdoelen]);

  return { standen, doeltitels, doelcategorieen };
}

/** De Doelcoach-tips bij de volgende mijlpaal — QS8-137, besluit A48 variant 2. */
function useTips(userId: string | null, ronde: number, weekdoelen: readonly Weekdoel[]) {
  /**
   * De mijlpalen waarvoor deze sessie al een tip is aangevraagd.
   *
   * ⚠️ In een ref en niet in state: het mag geen render uitlokken, en het moet
   *    de herlaadrondes overleven. Zonder deze rem vraagt elke ronde opnieuw —
   *    en dan is "één keer per mijlpaal" een belofte die alleen de database nog
   *    waarmaakt.
   */
  const gevraagd = useRef<Set<string>>(new Set());

  /**
   * De sleutel van de doelen met een gehaalde week — QS8-137.
   *
   * ⚠️ Een string en geen array, want een verse array is elke render een andere
   *    waarde en dus als afhankelijkheid waardeloos. Precies dezelfde val als bij
   *    `afTeSluitenStart` en `cyclusStart` hierboven, en die heeft dit scherm al
   *    een keer een oneindige laadlus gekost (bevinding QS8-75).
   */
  const gehaaldeDoelen = [
    ...new Set(weekdoelen.filter((w) => w.status === 'approved').map((w) => w.goal_id)),
  ]
    .sort()
    .join(',');

  // ⚠️ **`useAsync` en geen eigen `levend`-vlag.** Die vlag stond op 25-08 nog 32
  //    keer woordelijk in deze codebase; `npm run levend:controle` telt af.
  //
  // ⚠️ **Twee verzoeken voor alle kaarten samen, niet twee per kaart.** Dat is
  //    onwrikbare regel 12.
  //
  // ⚠️ **Falen is stil en dat is hier het goede gedrag.** Elke route die geen tip
  //    oplevert — geen mijlpaal, nog niets gegenereerd, quotum op, een storing —
  //    komt als een lege Map binnen, en dan toont de kaart de vaste regel uit
  //    variant 3. De gebruiker heeft niets gevraagd en hoort dus niets te missen.
  const { data: mijlpaaltips } = useAsync(
    userId && gehaaldeDoelen !== '' ? () => laadTips(gehaaldeDoelen.split(','), gevraagd) : null,
    [userId, gehaaldeDoelen, ronde],
  );

  return mijlpaaltips;
}

/**
 * De blokken onder de lijst: badges, getuigenissen, held en openstaande weken.
 *
 * ⚠️ **Elk apart opgehaald en apart falend**, net als het stand-blok. Een badge
 *    is versiering, een getuigenis en een held zijn aanvullingen, en een storing
 *    in een van die vier hoort je week van vandaag niet mee te slepen.
 */
function useLosseBlokken(userId: string | null, tijd: Tijd, ronde: number) {
  const { klok, cyclusStart } = tijd;

  /** Verdiende badges — QS8-78. Zonder antwoord toont het blok niets. */
  const { data: badges } = useAsync(userId ? () => fetchBadges() : null, [userId, ronde]);

  /**
   * De straffen waarvan jij persoonlijk de getuige bent — QS8-292.
   *
   * ⚠️ `fetchGetuigenissen()` wérpt niet maar geeft een lege lijst, dus het
   *    blok verdwijnt stil in plaats van het scherm te breken.
   */
  const { data: getuigenissen } = useAsync(userId ? () => fetchGetuigenissen() : null, [userId, ronde]);

  // ⚠️ De held die vandaag gesproken heeft — QS8-475. Een mislukte leesactie is
  //    hier geen storing maar een blok dat niet verschijnt: de melding zelf is
  //    al aangekomen, en dit is de quote eronder.
  const { data: verschijning } = useAsync(
    userId ? () => laatsteVerschijning(userId) : null,
    [userId, ronde],
  );

  // Gemiste weken uit eerdere cycli. Apart opgehaald en apart falend: dit is
  // een blok onder de lijst, en een storing hier hoort je week van vandaag niet
  // mee te slepen.
  const openstaand = useAsyncMetTerugval(
    userId && klok ? () => fetchDoorschuifbaar(userId, klok) : null,
    GEEN_WEEKDOELEN,
    // ⚠️ `klok` staat hier niet in en `cyclusStart` wel, om dezelfde reden als
    //    bij `useWeek`: `userClock(profiel)` geeft elke render een vers object en
    //    zou dus een oneindige lus opleveren.
    [userId, cyclusStart, ronde],
  );

  return { badges, getuigenissen, verschijning, openstaand };
}

/**
 * Wat de weekkaarten naast de weekdoelen zelf nodig hebben — QS8-203, QS8-253,
 * QS8-174.
 *
 * ⚠️ **Eén verzoek voor alle weekdoelen samen, elke keer.** Een vraag per kaart
 *    is de klassieke N+1 (onwrikbare regel 12), en dit scherm toont er
 *    standaard vijf.
 *
 * ⚠️ Alles hieronder faalt apart en stil: de `fetch…`-functies vangen hun eigen
 *    fout af en geven een lege verzameling. Een teller die "0 van 5" toont, of
 *    een bijschrift dat terugvalt op "wacht op je buddy", is beter dan een
 *    hoofdscherm dat niet opkomt.
 */
function useKaartdata(tijd: Tijd, weekdoelen: readonly Weekdoel[], ronde: number) {
  const { cyclus, cyclusStart, vandaagLokaal } = tijd;

  /**
   * Weekdoelen van deze cyclus die uit een weekplan zijn ingeschoven — QS8-203.
   *
   * ⚠️ Dit is de eis dat inschuiven nooit stilzwijgend gebeurt: zonder de
   *    melding komt er een weekdoel bij zonder dat de gebruiker iets deed.
   *
   * ⚠️ **`cyclus` en niet `afTeSluiten`**, en dat is hetzelfde onderscheid dat de
   *    rollover maakt. Een stap schuift in in de week waar je nú in zit; zou dit
   *    `afTeSluiten` lezen, dan verdwijnt de melding precies in de
   *    coulanceperiode, het venster waarin ze het meest verrast.
   */
  const { data: ingeschoven } = useAsync(
    cyclus ? () => fetchIngeschovenDezeCyclus(cyclus) : null,
    [cyclusStart, ronde],
  );

  /**
   * Welke dagen van deze cyclus al afgevinkt zijn, per weekdoel — QS8-253, en
   * sinds QS8-301 de dagen zelf in plaats van alleen hun aantal.
   */
  const { data: afvinkingen } = useAsync(
    cyclus ? () => fetchAfvinkingenPerWeekdoel(cyclus) : null,
    [cyclusStart, ronde],
  );

  /** Hoeveel bevestigingen elke week nog nodig heeft — QS8-174. */
  const { data: bevestigingsstanden } = useAsync(
    weekdoelen.length === 0 ? null : () => fetchBevestigingsstanden(weekdoelen.map((w) => w.id)),
    [weekdoelen, ronde],
  );

  /**
   * Welke weekdoelen vandáág zijn afgevinkt.
   *
   * ⚠️ Een aparte verzameling en niet af te leiden uit de telling: bij drie van
   *    de vijf dagen weet je niet óf vandaag erbij zat, en dat is precies wat de
   *    knop moet weten.
   */
  const { data: vandaagAf } = useAsync(
    vandaagLokaal === null ? null : () => fetchAfgevinktOp(vandaagLokaal),
    [vandaagLokaal, ronde],
  );

  return { ingeschoven, afvinkingen, bevestigingsstanden, vandaagAf };
}

/** Alles wat het Vandaag-scherm laadt, op één plek. */
export function useVandaag() {
  const { userId } = useSession();
  const { profiel } = useProfiel();
  const [ronde, setRonde] = useState(0);
  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  const tijd = useTijd(profiel);
  const week = useWeek(userId, tijd, ronde);

  return {
    userId,
    profiel,
    herlaad,
    ...tijd,
    ...week,
    ...useStanden(userId, ronde, week.weekdoelen),
    mijlpaaltips: useTips(userId, ronde, week.weekdoelen),
    ...useLosseBlokken(userId, tijd, ronde),
    ...useKaartdata(tijd, week.weekdoelen, ronde),
  };
}
