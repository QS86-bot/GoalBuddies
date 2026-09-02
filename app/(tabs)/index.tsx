import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { vraagMijlpaalTip, werkJobAf } from '@/modules/ai';
import { useProfiel, useSession, userClock } from '@/modules/auth';
import {
  bewijseisVoorDoel,
  dienOpnieuwIn,
  fetchAfgevinktOp,
  fetchAfvinktellingen,
  fetchDagzetten,
  fetchVragen,
  maakAfvinkingOngedaan,
  rondAf,
  vinkDagAf,
  zetDagzet,
  type Bewijseis,
  type DagZet,
  type Vraag,
} from '@/modules/completions';
import {
  afsluitbareCyclus,
  eersteCyclusVanDoel,
  fetchDoelnamen,
  badgeLabels,
  badgeUitleg,
  fetchBadges,
  doelIdsInBeeld,
  fetchDoelStanden,
  type VerdiendeBadge,
  fetchDoorschuifbaar,
  fetchMijlpaalTips,
  fetchVolgendeMijlpalen,
  fetchIngeschovenDezeCyclus,
  fetchWeekdoelen,
  niveauUitDagen,
  huidigeCyclus,
  inCoulanceperiode,
  schuifDoor,
  sluitWeekdoelAf,
  verwijderWeekdoel,
  zojuistAfgeslotenCyclus,
  type DoelStand,
  type Doelnaam,
  type Mijlpaaltip,
  type Weekdoel,
} from '@/modules/goals';
import { t, taal, vergelijkTekst } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { localDateIn, now, type UserClock } from '@/shared/time';
import {
  AsyncView,
  bevestigingen,
  Bevestiging,
  Body,
  Button,
  Caption,
  Card,
  Choice,
  DoelStandKaart,
  Field,
  FloorCeiling,
  magVieren,
  Screen,
  Subheading,
  useAsync,
  useVieringenAan,
  Viering,
  tipVoorWeek,
  weekdoelActies,
  weekpasUitleg,
  type WeeklyGoalStatus,
} from '@/shared/ui';

/**
 * Vandaag — de huidige cyclus, de weekdoelen met vloer en plafond, de Dagzet.
 *
 * ⚠️ Dit scherm is de enige plek waar de coulanceperiode zichtbaar wordt
 *    (QS8-51). Zit je erin, dan sluit je nog de vórige week af, en dat moet er
 *    letterlijk staan — anders denkt iemand dat hij per ongeluk de verkeerde
 *    week aan het afronden is.
 */
export default function Vandaag() {
  const router = useRouter();
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const [weekdoelen, setWeekdoelen] = useState<readonly Weekdoel[]>([]);
  const [openstaand, setOpenstaand] = useState<readonly Weekdoel[]>([]);
  const [dagzetten, setDagzetten] = useState<readonly DagZet[]>([]);

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
  /**
   * De mijlpalen waarvoor deze sessie al een tip is aangevraagd.
   *
   * ⚠️ In een ref en niet in state: het mag geen render uitlokken, en het moet
   *    de herlaadrondes overleven. Zonder deze rem vraagt elke ronde opnieuw —
   *    en dan is "één keer per mijlpaal" een belofte die alleen de database nog
   *    waarmaakt.
   */
  const gevraagd = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);

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

  // Het stand-blok laadt apart en faalt apart: lukt het niet, dan blijft het
  // blok gewoon weg en houdt de rest van het scherm zijn gegevens.
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

  /**
   * De Doelcoach-tip bij de volgende mijlpaal — QS8-137, besluit A48 variant 2.
   *
   * ⚠️ **`useAsync` en geen eigen `levend`-vlag.** Die vlag stond op 25-08 nog 32
   *    keer woordelijk in deze codebase; `npm run levend:controle` telt af en gaf
   *    hier terecht rood toen ik er een 28e bij zette. De hook doet precies wat
   *    die vlag deed, en beter — hij dekt ook het geval dat `deps` wisselt terwijl
   *    het verzoek nog loopt.
   *
   * ⚠️ **Twee verzoeken voor alle kaarten samen, niet twee per kaart.** Dat is
   *    onwrikbare regel 12, en het is dezelfde reden waarom `doelcategorieen`
   *    hierboven uit één `fetchDoelnamen()` komt.
   *
   * ⚠️ **Falen is stil en dat is hier het goede gedrag.** Elke route die geen tip
   *    oplevert — geen mijlpaal, nog niets gegenereerd, quotum op, een storing —
   *    komt als een lege Map binnen, en dan toont de kaart de vaste regel uit
   *    variant 3. De gebruiker heeft niets gevraagd en hoort dus niets te missen.
   */
  const { data: mijlpaaltips } = useAsync(
    userId && gehaaldeDoelen !== '' ? () => laadTips(gehaaldeDoelen.split(','), gevraagd) : null,
    [userId, gehaaldeDoelen, ronde],
  );

  /**
   * Verdiende badges — QS8-78.
   *
   * ⚠️ **Apart opgehaald en apart falend**, net als het stand-blok en de
   *    mijlpaaltips. Een badge is versiering; een storing daarin hoort je week
   *    van vandaag niet mee te slepen. Zonder antwoord toont het blok gewoon
   *    niets, en dat is hetzelfde beeld als "nog geen badges" — hier mag dat,
   *    want er valt niets te dóén met een badge die je nog niet hebt.
   */
  const { data: badges } = useAsync(userId ? () => fetchBadges() : null, [userId, ronde]);

  // Gemiste weken uit eerdere cycli. Apart opgehaald en apart falend, om
  // dezelfde reden als het stand-blok: dit is een blok onder de lijst, en een
  // storing hier hoort je week van vandaag niet mee te slepen.
  //
  // ⚠️ `klok` staat hier niet in de afhankelijkheden en `cyclusStart` wel, om
  //    dezelfde reden als hierboven: `userClock(profiel)` geeft elke render een
  //    vers object en zou dus een oneindige lus opleveren.
  useEffect(() => {
    if (!userId || !klok) return;
    let levend = true;

    fetchDoorschuifbaar(userId, klok)
      .then((gevonden) => {
        if (levend) setOpenstaand(gevonden);
      })
      .catch(() => {
        if (levend) setOpenstaand([]);
      });

    return () => {
      levend = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cyclusStart, ronde]);

  /**
   * Weekdoelen van deze cyclus die uit een weekplan zijn ingeschoven — QS8-203.
   *
   * ⚠️ Dit is de eis dat inschuiven nooit stilzwijgend gebeurt. Zonder deze
   *    melding komt er een weekdoel bij zonder dat de gebruiker iets deed, en
   *    verandert zijn puntenplafond zonder dat iemand het ziet.
   *
   * ⚠️ **`cyclus` en niet `afTeSluiten`**, en dat is hetzelfde onderscheid dat de
   *    rollover maakt. De lijst hierboven toont de week die je nog mág afsluiten
   *    — binnen de coulanceperiode is dat de vórige. Een stap schuift in in de
   *    week waar je nú in zit. Zou dit `afTeSluiten` lezen, dan verdwijnt de
   *    melding precies in het venster waarin ze het meest verrast.
   *
   * ⚠️ Apart opgehaald en apart falend, om dezelfde reden als het stand-blok:
   *    dit is een melding en geen gegeven dat het scherm nodig heeft.
   *    `fetchIngeschovenDezeCyclus()` vangt zijn eigen fout af en geeft dan een
   *    lege verzameling — geen melding is hier het juiste faalgedrag.
   */
  const { data: ingeschoven } = useAsync(
    cyclus ? () => fetchIngeschovenDezeCyclus(cyclus) : null,
    [cyclusStart, ronde],
  );

  /**
   * De afvinktellingen van deze cyclus — QS8-253.
   *
   * ⚠️ Eén verzoek voor alle weekdoelen samen. Een telling per kaart is de
   *    klassieke N+1 (onwrikbare regel 12), en dit scherm toont er standaard vijf.
   *
   * ⚠️ Apart falend: `fetchAfvinktellingen()` vangt zijn eigen fout af en geeft
   *    dan een lege telling. Een teller die "0 van 5" toont is beter dan een
   *    hoofdscherm dat niet opkomt — en het afvinken zelf blijft werken.
   */
  const { data: afvinkingen } = useAsync(
    cyclus ? () => fetchAfvinktellingen(cyclus) : null,
    [cyclusStart, ronde],
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

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  return (
    <Screen
      title={t('vandaag.titel')}
      eyebrow={
        afTeSluiten
          ? t('vandaag.eyebrow_week', { datum: afTeSluiten.startDate })
          : t('vandaag.eyebrow_deze')
      }
    >
      {coulance && afTeSluiten ? (
        <Card nested>
          <Subheading>{t('vandaag.coulance_titel')}</Subheading>
          <Body muted>
            {t('vandaag.coulance_tekst', { datum: afTeSluiten.startDate })}
          </Body>
        </Card>
      ) : null}

      {ingeschoven === undefined || ingeschoven.size === 0 ? null : (
        <Card nested>
          <Subheading>{t('weekplan.ingeschoven_kop')}</Subheading>
          <Body muted>{t('weekplan.ingeschoven_tekst')}</Body>
        </Card>
      )}

      <AsyncView
        loading={loading}
        error={error}
        data={weekdoelen}
        isEmpty={(d) => d.length === 0}
        onRetry={herlaad}
        empty={{
          title: t('vandaag.leeg_titel'),
          body: t('vandaag.leeg_tekst'),
        }}
      >
        {(doelen) => (
          <View style={styles.lijst}>
            {doelen.map((weekdoel) => (
              <WeekdoelKaart
                key={weekdoel.id}
                weekdoel={weekdoel}
                categorie={doelcategorieen.get(weekdoel.goal_id) ?? ''}
                mijlpaaltip={mijlpaaltips?.get(weekdoel.goal_id) ?? null}
                afgevinkt={afvinkingen?.get(weekdoel.id) ?? 0}
                vandaagAfgevinkt={(vandaagAf ?? new Set()).has(weekdoel.id)}
                localDate={vandaagLokaal}
                userId={userId ?? ''}
                onKlaar={herlaad}
              />
            ))}
          </View>
        )}
      </AsyncView>

      {/*
        ⚠️ Deze knop stuurde je naar de doelenlijst en daar hield het op: er was
           geen formulier, dus de route liep dood (QS8-112). Het formulier staat
           nu op het doelscherm, want een weekdoel hangt altijd aan een doel. De
           bijschrift zegt dat, anders is twee keer tikken zonder uitleg.
      */}
      <View style={styles.toevoegen}>
        <Button variant="primair" block onPress={() => router.push('/doelen')}>
          {t('vandaag.weekdoel_toevoegen')}
        </Button>
        <Caption>{t('vandaag.toevoegen_uitleg')}</Caption>

        {/*
          ⚠️ De ingang naar het overzicht staat hier en niet als vijfde tabblad:
             `(tabs)/_layout.tsx` legt vast dat het er vier zijn en waarom. Hij
             staat onderaan omdat Vandaag over vandaag gaat — een terugblik op
             twaalf weken hoort niet bovenaan het scherm dat je 's ochtends
             opent.
        */}
        <Button variant="stil" block onPress={() => router.push('/overzicht')}>
          {t('overzicht.open')}
        </Button>
      </View>

      <OpenstaandBlok weekdoelen={openstaand} klok={klok} onKlaar={herlaad} />

      <StandBlok
        standen={standen}
        titels={doeltitels}
        afgeslotenCyclus={geslotenStart}
        loading={loading}
      />

      <BadgeBlok badges={badges ?? []} />

      <DagzetBlok
        userId={userId ?? ''}
        localDate={profiel ? localDateIn(profiel.tz, now()) : null}
        zetten={dagzetten}
        onKlaar={herlaad}
      />
    </Screen>
  );
}

/**
 * Je stand: reeks, punten en weekpassen per doel — QS8-75 en QS8-81.
 *
 * ⚠️ **Alles hier is privé en dat is een domeinregel, geen voorkeur.** Punten
 *    zijn alleen voor de eigenaar (domeinregel 10) omdat een dalend totaal
 *    zichtbaar bewijs is van een gemiste week, en een verbruikte weekpas is dat
 *    net zo goed. Dit blok hoort daarom op dít scherm en op geen enkel
 *    groepsscherm. Kopieer het niet naar `groep/[id]`.
 *
 * ⚠️ Rendert niets zolang er geen enkel doel is. Een leeg kader met "0 punten"
 *    is de eerste indruk van iemand die net begint, en dat is precies de
 *    verkeerde: er is nog niets gemist, er is nog niets te tellen.
 */
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
 * ⚠️ **Alleen verdiende badges, geen grijze vakjes voor wat je nog niet hebt.**
 *    Een lijst met vijf slots waarvan er één gevuld is, is een lijst van wat je
 *    níét gehaald hebt — met een vrolijk randje eromheen. Dat is precies het
 *    beeld dat dit product bij de groep verbiedt, en er is geen reden om het bij
 *    jezelf wél te doen.
 */
function BadgeBlok({ badges }: { readonly badges: readonly VerdiendeBadge[] }) {
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

function StandBlok({
  standen,
  titels,
  afgeslotenCyclus,
  loading,
}: {
  readonly standen: ReadonlyMap<string, DoelStand>;
  readonly titels: ReadonlyMap<string, string>;
  readonly afgeslotenCyclus: string | null;
  readonly loading: boolean;
}) {
  // ⚠️ Alleen doelen waarvan we de titel kennen. Een stand zonder titel is een
  //    gearchiveerd of net verwijderd doel; die hoort niet op het dashboard van
  //    vandaag, en "Onbekend doel" is geen tekst die iemand vertrouwen geeft.
  const rijen = [...standen.values()]
    .map((stand) => ({ stand, titel: titels.get(stand.goalId) }))
    .filter((r): r is { stand: DoelStand; titel: string } => r.titel !== undefined)
    .sort((a, b) => vergelijkTekst(a.titel, b.titel));

  if (loading || rijen.length === 0) return null;

  // ⚠️ Dag één is een eigen geval, en het pijnlijke geval is niet "nul doelen"
  //    maar "het eerste doel". Zonder deze tak krijgt iemand die net begonnen is
  //    vier keer nul te lezen ("Nog geen reeks", "Punten 0", "Nog geen weekpas")
  //    plus een uitleg over gemiste weken en minpunten — voordat hij één week
  //    gedaan heeft. Dat is geen stand maar een waarschuwing vooraf.
  const nogNietsTeTellen = rijen.every(
    ({ stand }) =>
      stand.huidigeReeks === 0 &&
      stand.besteReeks === 0 &&
      stand.punten === 0 &&
      (stand.weekpas?.voltooideCycli ?? 0) === 0,
  );

  if (nogNietsTeTellen) {
    return (
      <Card nested>
        <Subheading>{t('vandaag.stand')}</Subheading>
        <Body muted>{t('vandaag.stand_leeg')}</Body>
      </Card>
    );
  }

  return (
    <Card nested>
      <Subheading>{t('vandaag.stand')}</Subheading>
      {/*
        ⚠️ Niet meer "een week telt zodra je vloer gehaald is". Dat gebruikt
           "vloer" als bekend woord, en het klopte bovendien niet voor een
           weekdoel zónder vloer — daar telt gewoon het plafond.
      */}
      <Body muted>{t('vandaag.reeks_telt_weken')}</Body>

      <View style={styles.standen}>
        {rijen.map(({ stand, titel }) => (
          <DoelStandKaart
            key={stand.goalId}
            titel={titel}
            huidigeReeks={stand.huidigeReeks}
            besteReeks={stand.besteReeks}
            punten={stand.punten}
            weekpas={stand.weekpas}
            afgeslotenCyclus={afgeslotenCyclus}
          />
        ))}
      </View>

      {/*
        ⚠️ Eén keer onderaan, en niet bij elk doel. Bij vijf doelen stond deze
           tekst vijf keer onder elkaar en dan leest niemand hem meer — ook niet
           de ene keer dat het uitmaakt.
      */}
      {rijen.some(({ stand }) => stand.weekpas !== null) ? (
        <Caption>{weekpasUitleg()}</Caption>
      ) : null}
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
function OpenstaandBlok({
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

    // ⚠️ De eerste cyclus van het doel bepaalt `cycle_index` van de nieuwe rij.
    //    Zonder deze opzoeking wordt elke doorgeschoven week "week 1" van dat
    //    doel, en dan telt de weekteller in het doeloverzicht niet meer mee.
    const eerste = await eersteCyclusVanDoel(weekdoel.goal_id, klok);

    // ⚠️ `schuifDoor()` was tot 0091 twee aanroepen zonder transactie eromheen,
    //    en viel de verbinding daartussen weg dan stond de oude week op `carried`
    //    zonder opvolger — weg uit dit blok, want `fetchDoorschuifbaar()` haalt
    //    alleen `missed` op. Sinds 0091 doet één RPC beide, dus dat gat is dicht.
    //    De cyclus wordt nog steeds hier uitgerekend en meegegeven: de database
    //    kent de week-startdag van deze gebruiker niet (correctheidsregel 7).
    const uitkomst = await schuifDoor(weekdoel, klok, eerste);

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
        <Caption>{t('dashboard.week_van', { datum: weekdoel.cycle_start_date })}</Caption>
      </View>

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button onPress={() => setVraagt(true)}>{t('vandaag.meenemen_knop')}</Button>
    </Card>
  );
}

/**
 * Eén weekdoel, met de mogelijkheid het af te ronden — QS8-46.
 *
 * ⚠️ De status wordt `pending`, nooit direct `approved`. Zelf afvinken is geen
 *    goedkeuring, ook niet als je alleen werkt.
 */
function WeekdoelKaart({
  weekdoel,
  categorie,
  mijlpaaltip,
  afgevinkt,
  vandaagAfgevinkt,
  localDate,
  userId,
  onKlaar,
}: {
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
   * Het aantal dagen dat deze week al is afgevinkt — QS8-253.
   *
   * ⚠️ Komt van de ouder en wordt hier niet opgehaald. Het hoofdscherm toont
   *    alle weekdoelen, dus een verzoek per kaart is de klassieke N+1
   *    (onwrikbare regel 12). `fetchAfvinktellingen()` haalt ze in één keer.
   */
  readonly afgevinkt: number;
  readonly vandaagAfgevinkt: boolean;
  /** Vandaag in de tijdzone van de gebruiker, uit `shared/time`. */
  readonly localDate: string | null;
  readonly userId: string;
  readonly onKlaar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [niveau, setNiveau] = useState<'floor' | 'ceiling'>('ceiling');
  const [notitie, setNotitie] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [eis, setEis] = useState<Bewijseis>('note_required');
  const [vragen, setVragen] = useState<readonly Vraag[]>([]);
  const [vraagt, setVraagt] = useState<'afsluiten' | 'verwijderen' | null>(null);
  const [gevierd, setGevierd] = useState(false);
  const { aan: vieringenAan } = useVieringenAan();

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
  const afgeleidNiveau = telDagen
    ? niveauUitDagen(afgevinkt, weekdoel.floor_days, weekdoel.ceiling_days ?? 0)
    : null;
  const afgerond = weekdoel.status !== 'todo';
  const wachtOpOordeel = weekdoel.status === 'pending';

  // Wat dit weekdoel op grond van zijn status mag. Staat in `shared/ui/acties`
  // zodat het niet in elk scherm opnieuw bedacht wordt, en zodat er een test op
  // kan staan zonder renderer.
  const acties = weekdoelActies(weekdoel.status as WeeklyGoalStatus);

  // ⚠️ De bewijseis komt uit de groep en niet uit een constante. Hij is hier
  //    alleen bedoeld om vooraf de juiste zin te tonen; afdwingen doet de
  //    trigger `enforce_evidence_policy` (migratie 0021).
  useEffect(() => {
    let levend = true;

    bewijseisVoorDoel(weekdoel.goal_id)
      .then((gevonden) => {
        if (levend) setEis(gevonden);
      })
      .catch(() => {
        if (levend) setEis('note_required');
      });

    return () => {
      levend = false;
    };
  }, [weekdoel.goal_id]);

  // De vragen die buddy's gesteld hebben — zonder dit is "vertel me meer" een
  // dood spoor en denkt de beoordelaar dat hij iets gedaan heeft.
  useEffect(() => {
    if (!wachtOpOordeel) return;
    let levend = true;

    fetchVragen(weekdoel.id)
      .then((gevonden) => {
        if (levend) setVragen(gevonden);
      })
      .catch(() => {
        if (levend) setVragen([]);
      });

    return () => {
      levend = false;
    };
  }, [weekdoel.id, wachtOpOordeel]);

  const [vinkBezig, setVinkBezig] = useState(false);

  /**
   * Vandaag afvinken, of het weer ongedaan maken — QS8-253.
   *
   * ⚠️ Geen bevestiging en geen viering. Een afvinking is de kleinste handeling
   *    in de app en moet in één tik klaar zijn; alles wat je eromheen zet, maakt
   *    hem duurder dan hij is. De viering hoort bij de wéék, en die staat er al.
   */
  async function wisselVandaag() {
    if (localDate === null) return;
    setVinkBezig(true);
    setFout(null);

    const uitkomst = vandaagAfgevinkt
      ? await maakAfvinkingOngedaan(weekdoel.id, localDate)
      : await vinkDagAf(weekdoel.id, localDate);

    setVinkBezig(false);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    onKlaar();
  }

  async function afronden() {
    setBezig(true);
    setFout(null);

    // ⚠️ Bij een ritme-week wint de afleiding uit de dagen van de keuze in het
    //    formulier. De database doet dat sowieso; hier meesturen wat er ook
    //    uitkomt, voorkomt dat de gebruiker een ander woord ziet dan er landt.
    const niveauKeuze = telDagen ? (afgeleidNiveau ?? 'floor') : heeftVloer ? niveau : 'ceiling';

    // ⚠️ Opnieuw indienen loopt via een RPC: `completions` is append-only en
    //    heeft geen UPDATE-policy, dus de client kan `superseded_by` niet zelf
    //    zetten (domeinregel 6).
    const uitkomst = wachtOpOordeel
      ? await dienOpnieuwIn(weekdoel.id, niveauKeuze, notitie)
      : await rondAf(weekdoel.id, userId, { achieved_level: niveauKeuze, note: notitie }, eis);

    if (!uitkomst.ok) setFout(uitkomst.melding);
    else {
      setOpen(false);
      setNotitie('');
      onKlaar();
    }
    setBezig(false);
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
  async function voerUit(wat: 'afsluiten' | 'verwijderen') {
    setBezig(true);
    setFout(null);

    const uitkomst =
      wat === 'afsluiten'
        ? await sluitWeekdoelAf(weekdoel.id)
        : await verwijderWeekdoel(weekdoel.id);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setVraagt(null);
    onKlaar();
  }

  // Het bevestigingsblok vervangt de kaart zolang het openstaat: twee schermen
  // met knoppen tegelijk maakt onduidelijk waar de vraag over gaat.
  if (vraagt !== null) {
    return (
      <Bevestiging
        tekst={
          vraagt === 'afsluiten'
            ? bevestigingen().weekdoelAfsluiten
            : bevestigingen().weekdoelVerwijderen
        }
        bezig={bezig}
        fout={fout}
        onBevestig={() => void voerUit(vraagt)}
        onAnnuleer={() => {
          setVraagt(null);
          setFout(null);
        }}
      />
    );
  }

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
      />

      {/*
        ⚠️ **De knop die van dit ritme meer maakt dan een kolom** — QS8-253. Een
           tabel met een RPC en een grant waar geen scherm bij kan, is dood hout
           dat geen enkele test ziet; dat is de les van QS8-113 en QS8-112.

        ⚠️ Alleen bij een ritme-weekdoel, en alleen zolang de week nog loopt. Een
           afgeronde week nog kunnen bijvinken zou betekenen dat je je eigen
           niveau achteraf omhoog schuift, en dat is precies wat
           `niveau_uit_dagen()` in de database voorkomt.
      */}
      {telDagen && !afgerond && localDate !== null ? (
        <View style={styles.afvinken}>
          <Body>
            {t('ritme.dagen_gehaald', {
              gehaald: afgevinkt,
              plafond: weekdoel.ceiling_days ?? 0,
            })}
          </Body>

          {/*
            ⚠️ De regel eronder zegt waar je staat ten opzichte van je vlóér, en
               niet ten opzichte van je plafond. De vloer is de belofte die telt
               (domeinregel 8); het plafond is de bonus. Andersom framen maakt van
               elke gehaalde week een half gehaalde week.
          */}
          <Caption>
            {afgeleidNiveau === 'ceiling'
              ? t('ritme.plafond_gehaald')
              : afgeleidNiveau === 'floor'
                ? t('ritme.vloer_gehaald')
                : t('ritme.vloer_nog_niet', {
                    aantal: (weekdoel.floor_days ?? weekdoel.ceiling_days ?? 0) - afgevinkt,
                  })}
          </Caption>

          <Button
            variant={vandaagAfgevinkt ? 'stil' : 'secundair'}
            busy={vinkBezig}
            accessibilityLabel={
              vandaagAfgevinkt
                ? t('ritme.maak_ongedaan_label', { titel: weekdoel.title })
                : t('ritme.vink_af_label', { titel: weekdoel.title })
            }
            onPress={() => void wisselVandaag()}
          >
            {vandaagAfgevinkt ? t('ritme.maak_ongedaan') : t('ritme.vink_af')}
          </Button>
        </View>
      ) : null}

      {/*
        ⚠️ **De weektip — besluit A48, variant 3.** Tot nu toe kreeg je tussen je
           eerste weekpas en de volgende vijf keer niets, en dat zijn precies de
           weken waarin iemand afhaakt.

        ⚠️ Hij blijft stáán en verdwijnt niet met het feestje. Het feestmoment
           duurt 2,2 seconden — te kort om een zin te lezen die de moeite waard
           is. En hij hangt niet aan `vieringenAan`: wie de confetti uitzette,
           zette geen tekst uit.

        ⚠️ Aan `approved` en niet aan het indienen, om dezelfde reden als het
           feestje hierboven: zelf afvinken is geen goedkeuring (domeinregel 3).
      */}
      {weekdoel.status === 'approved' ? (
        <Caption>
          {tipVoorWeek({
            gegenereerd: mijlpaaltip,
            taal: taal(),
            categorie,
            cycleStart: weekdoel.cycle_start_date,
          })}
        </Caption>
      ) : null}

      {/*
        ⚠️ Een vraag van een buddy is geen afkeuring en de kaart zegt dat ook
           niet. "Vertel me meer" is een gelijkwaardige actie naast goedkeuren
           (6.2); de meeste onduidelijkheid is gewoon onduidelijkheid.
      */}
      {vragen.length === 0 ? null : (
        <Card nested>
          <Subheading>{t('vandaag.buddy_vraag')}</Subheading>
          {vragen.map((v) => (
            <Body key={v.id} muted>
              &ldquo;{v.comment}&rdquo;
            </Body>
          ))}
          {open ? null : (
            <Button onPress={() => setOpen(true)}>{t('vandaag.antwoord_opnieuw')}</Button>
          )}
        </Card>
      )}

      {(afgerond && !wachtOpOordeel) || !open ? null : (
        <View style={styles.afrond}>
          {heeftVloer && !telDagen ? (
            <Choice
              label={t('vandaag.niveau_label')}
              hint={t('vandaag.niveau_hint')}
              opties={[
                { waarde: 'floor', label: t('vandaag.vloer') },
                { waarde: 'ceiling', label: t('vandaag.plafond') },
              ]}
              waarde={niveau}
              onKies={setNiveau}
            />
          ) : null}

          <Field
            label={t('vandaag.notitie_label')}
            hint={
              eis === 'optional'
                ? t('vandaag.notitie_optioneel')
                : t('vandaag.notitie_verplicht')
            }
            value={notitie}
            onChangeText={setNotitie}
            multiline
            numberOfLines={3}
          />

          {fout === null ? null : <Caption danger>{fout}</Caption>}

          <View style={styles.knoppen}>
            <Button variant="primair" busy={bezig} onPress={() => void afronden()}>
              {wachtOpOordeel ? t('vandaag.opnieuw_indienen') : t('vandaag.indienen')}
            </Button>
            <Button variant="stil" onPress={() => setOpen(false)}>
              {t('vandaag.annuleren')}
            </Button>
          </View>
        </View>
      )}

      {/*
        ⚠️ Afronden staat als eerste en de rest ernaast in stille knoppen. Deze
           drie zijn geen gelijkwaardige keuzes: afronden is wat je wilt,
           afsluiten is wat je soms moet, en weggooien is voor een vergissing.
           Ze even zwaar maken zou de uitweg net zo aantrekkelijk maken als de
           week zelf.
      */}
      {open || !(acties.afronden || acties.afsluiten || acties.verwijderen) ? null : (
        <View style={styles.knoppen}>
          {/*
            Staat er een vraag van een buddy, dan zit de knop om opnieuw in te
            dienen al in dat blok hierboven en met een beter label. Twee knoppen
            die hetzelfde doen laten de gebruiker zoeken naar het verschil.
          */}
          {acties.afronden && vragen.length === 0 ? (
            <Button onPress={() => setOpen(true)}>
              {wachtOpOordeel ? t('vandaag.opnieuw_indienen') : t('vandaag.afronden')}
            </Button>
          ) : null}

          {acties.afsluiten ? (
            <Button variant="stil" onPress={() => setVraagt('afsluiten')}>
              {t('vandaag.week_afsluiten')}
            </Button>
          ) : null}

          {acties.verwijderen ? (
            <Button
              variant="stil"
              onPress={() => setVraagt('verwijderen')}
              accessibilityLabel={t('vandaag.weggooien_label', { titel: weekdoel.title })}
            >
              {t('vandaag.weggooien')}
            </Button>
          ) : null}
        </View>
      )}
    </Card>
  );
}

/**
 * De Dagzet — QS8-50.
 *
 * ⚠️ Domeinregel 9: standaard privé, nooit punten, nooit goedkeuring. Een dag
 *    overslaan heeft geen enkel gevolg — er staat dus ook geen teller, geen
 *    reeks en geen inhaalprikkel.
 */
function DagzetBlok({
  userId,
  localDate,
  zetten,
  onKlaar,
}: {
  readonly userId: string;
  readonly localDate: string | null;
  readonly zetten: readonly DagZet[];
  readonly onKlaar: () => void;
}) {
  const [tekst, setTekst] = useState('');
  const [delen, setDelen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    if (!localDate) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await zetDagzet(
      userId,
      { body: tekst, weekly_goal_id: null, visibility: delen ? 'group' : 'private' },
      localDate,
    );

    if (!uitkomst.ok) setFout(uitkomst.melding);
    else {
      setTekst('');
      onKlaar();
    }
    setBezig(false);
  }

  return (
    <Card nested>
      <Subheading>{t('dagzet.titel')}</Subheading>
      <Body muted>{t('dagzet.uitleg')}</Body>

      <Field
        label={t('dagzet.vandaag')}
        value={tekst}
        onChangeText={setTekst}
        placeholder={t('dagzet.voorbeeld')}
      />

      <Choice
        label={t('dagzet.zichtbaarheid')}
        hint={t('dagzet.zichtbaarheid_hint')}
        opties={[
          { waarde: 'prive', label: t('dagzet.alleen_ik') },
          { waarde: 'groep', label: t('dagzet.deel_groep') },
        ]}
        waarde={delen ? 'groep' : 'prive'}
        onKies={(v) => setDelen(v === 'groep')}
      />

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button disabled={tekst.trim() === ''} busy={bezig} onPress={() => void bewaar()}>
        {t('dagzet.vastleggen')}
      </Button>

      {zetten.length === 0 ? null : (
        <View style={styles.zetten}>
          {zetten.map((zet) => (
            <View key={zet.id} style={styles.zet}>
              <Caption>{zet.local_date}</Caption>
              <Body>{zet.body}</Body>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  afvinken: { gap: 6, marginTop: 8 },
  lijst: { gap: space.blokGap },
  standen: { gap: space.blokGap + 3 },
  afrond: { gap: space.blokGap - 3, paddingTop: space.blokGap - 4 },
  kop: { gap: 2 },
  toevoegen: { gap: space.blokGap - 5 },
  // `wrap` omdat er nu drie knoppen naast elkaar kunnen staan; op een smalle
  // telefoon vallen ze anders buiten beeld in plaats van door te lopen.
  knoppen: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.blokGap - 3,
    alignItems: 'center',
  },
  zetten: { gap: space.blokGap - 4, paddingTop: space.blokGap - 4 },
  zet: { gap: 2 },
});

/**
 * De tips bij de volgende mijlpaal van elk opgegeven doel — QS8-137.
 *
 * ⚠️ **Het aanvragen gebeurt hier en niet in een eigen effect**, en dat is een
 *    afweging. Een tweede effect zou een tweede `levend`-vlag vragen voor iets
 *    dat geen state schrijft; dit doet dat niet en heeft die bewaking dus niet
 *    nodig. De prijs is dat een laadfunctie een neveneffect heeft, en die staat
 *    hier opgeschreven zodat de volgende lezer hem niet per ongeluk weghaalt.
 *
 * ⚠️ **De aanvraag is stilzwijgend en kost uit het gedeelde dagquotum van tien**,
 *    hetzelfde quotum als het opsplitsen van een doel en de weekstappen. Dat is
 *    aanvaardbaar omdat het per mijlpaal één keer gebeurt en niet per week — de
 *    grendel daarvoor staat in `vraag_ai_job()` (migratie 0103) en niet hier.
 *    Is het quotum op, dan komt er `quota_reached` terug, doet deze functie
 *    niets, en ziet de gebruiker de vaste regel. Met opzet geen foutmelding: hij
 *    heeft niets gevraagd.
 *
 * ⚠️ `gevraagd` is de rem binnen één sessie. De échte grendel is de primaire
 *    sleutel op `milestone_tips`, maar een aanvraag die tóch elke ronde vertrekt
 *    kost wél een plek in het quotum.
 */
async function laadTips(
  goalIds: readonly string[],
  gevraagd: { current: Set<string> },
): Promise<ReadonlyMap<string, Mijlpaaltip>> {
  const volgende = await fetchVolgendeMijlpalen(goalIds);
  if (volgende.size === 0) return new Map();

  const mijlpaalIds = [...volgende.values()].map((m) => m.id);
  let tips = await fetchMijlpaalTips(mijlpaalIds);
  let gegenereerd = false;

  for (const [doelId, mijlpaal] of volgende) {
    if (tips.has(mijlpaal.id) || gevraagd.current.has(mijlpaal.id)) continue;
    gevraagd.current.add(mijlpaal.id);

    const aanvraag = await vraagMijlpaalTip(doelId, mijlpaal.id);
    if (aanvraag.ok && !aanvraag.waarde.hergebruikt) {
      await werkJobAf(aanvraag.waarde.jobId);
      gegenereerd = true;
    }
  }

  // ⚠️ **Zonder deze tweede ophaling betaalde deze functie voor een tip die hij
  //    in dezelfde ronde weggooide.** `tips` is een momentopname van vóór de
  //    generatielus, dus een net gegenereerde tip zit er per definitie niet in —
  //    en niets draait `laadTips` daarna opnieuw: `useAsync` hangt aan
  //    `[userId, gehaaldeDoelen, ronde]`. De gebruiker zag niets, de job stond op
  //    `done` en de kosten waren geboekt.
  //
  // ⚠️ Alleen als er echt iets gegenereerd is: anders is dit een tweede verzoek
  //    per bezoek aan Vandaag, voor niets.
  if (gegenereerd) tips = await fetchMijlpaalTips(mijlpaalIds);

  return new Map(
    [...volgende].flatMap(([doelId, mijlpaal]) => {
      const tip = tips.get(mijlpaal.id);
      return tip === undefined ? [] : [[doelId, tip] as const];
    }),
  );
}
