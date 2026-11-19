import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ROUTE_AANMELDEN, useProfiel, useSession } from '@/modules/auth';
import {
  bewaarOpenstaandeUitnodiging,
  fetchMijnLidmaatschap,
  fetchUitnodiging,
  huddledagLabel,
  actieVoor,
  magAutomatischToetreden,
  neemDeel,
  lidmaatschapStand,
  titelIsVerlopen,
  uitnodigingsStand,
  verwerkToetreding,
  type ToetredenUitvoer,
  vergeetOpenstaandeUitnodiging,
  zichtbaarheidLabels,
  zichtbaarheidUitleg,
} from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  Accountregel,
  AsyncView,
  Avatar,
  Body,
  Button,
  Caption,
  Card,
  Screen,
  Subheading,
  useAsync,
} from '@/shared/ui';

/**
 * De gastvrije uitnodigingslink — QS8-59.
 *
 * ⚠️ Dit scherm is de eerste indruk van het product voor iemand die de app nog
 *    nooit gezien heeft. Een uitnodiging die op een loginscherm eindigt, is een
 *    verloren buddy — dat is de goedkoopste retentie-ingreep die er is, en de
 *    reden dat `app/_layout.tsx` deze route bewust buiten de routewacht houdt.
 *
 * ⚠️ De code wordt bewaard vóór er ergens heen genavigeerd wordt. Zonder dat
 *    overleeft hij het aanmelden niet: met e-mailbevestiging aan tikt iemand een
 *    mailtje aan, komt terug in een verse app-sessie, en dit scherm is dan allang
 *    weg. Dat is niet het randgeval maar het hoofdpad, en het scherm belooft er
 *    letterlijk het tegenovergestelde van.
 *
 * ⚠️ Ingelogd de link openen maakt je níét automatisch lid. Een eerdere versie
 *    deed dat wel, en dan word je lid door alleen maar te kijken — terwijl er
 *    (nog) geen knop is om een groep te verlaten. Toetreden is nu altijd een
 *    druk op de knop, behalve op de ene route waar het de bedoeling is: als de
 *    sessie verschijnt terwijl dit scherm openstaat, want dan kwam je hier via
 *    "account maken en meedoen".
 */
export default function UitnodigingScherm() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { session, loading: sessieLaadt } = useSession();
  const { profiel } = useProfiel();

  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [binnen, setBinnen] = useState<string | null>(null);

  /** Had dit scherm al een sessie toen het openging? Dan kwam je hier niet via aanmelden. */
  const sessieBijBinnenkomst = useRef<boolean | null>(null);
  const automatischGeprobeerd = useRef(false);

  // ⚠️ Onthouden vóór alles, en apart van het laden. Gaat de bezoeker hierna
  //    aanmelden, dan overleeft de uitnodiging de bevestigingsmail en de
  //    onboarding — ook als het ophalen mislukt.
  useEffect(() => {
    if (code) void bewaarOpenstaandeUitnodiging(code);
  }, [code]);

  const {
    data: uitnodiging,
    loading,
    error,
    herlaad,
  } = useAsync(code ? () => fetchUitnodiging(code) : null, [code]);

  // ⚠️ QS8-708. De uitnodiging draagt het groeps-id; of dít account al lid is,
  //    leest de pagina uit zijn eigen lidmaatschapsrij (RLS: alleen de eigen rij
  //    of die van een groepsgenoot). `invite_preview()` blijft ongemoeid: aan een
  //    niet-lid vertelt dat antwoord niets nieuws.
  const userId = session?.user.id ?? null;
  const groupId = uitnodiging?.group_id ?? null;
  const lidmaatschap = useAsync(
    groupId && userId ? () => fetchMijnLidmaatschap(groupId, userId) : null,
    [groupId, userId],
  );

  const stand = uitnodigingsStand({
    uitnodiging,
    ingelogd: session !== null,
    sessieLaadt,
    lidmaatschap: lidmaatschapStand({
      gevraagd: groupId !== null && userId !== null,
      laadt: lidmaatschap.loading,
      fout: lidmaatschap.error !== null,
      status: lidmaatschap.data?.status ?? null,
      antwoordVan: lidmaatschap.data?.user_id ?? null,
      gebruiker: userId,
    }),
  });
  const magToetreden = magAutomatischToetreden(stand);
  const actie = actieVoor(stand, binnen);
  const alLidGroep = stand.soort === 'al-lid' ? stand.groupId : null;

  // Wie al lid is heeft de bewaarde code niet meer nodig; blijft hij staan, dan
  // probeert de app hem bij de volgende start nog eens te verzilveren.
  useEffect(() => {
    if (alLidGroep !== null) void vergeetOpenstaandeUitnodiging();
  }, [alLidGroep]);

  // ⚠️ QS8-712. Of het scherm er nog is en of het profiel inmiddels binnen is, wordt
  //    bij de afhandeling gevraagd en niet bij het starten van de toetreding: een
  //    effectronde die afloopt terwijl `neemDeel` loopt is geen reden om de
  //    uitkomst van een geslaagde toetreding weg te gooien.
  const gemount = useRef(true);
  const profielRef = useRef(profiel);
  useEffect(() => {
    gemount.current = true;
    return () => {
      gemount.current = false;
    };
  }, []);
  useEffect(() => {
    profielRef.current = profiel;
  }, [profiel]);

  const uitvoer = useMemo<ToetredenUitvoer>(
    () => ({
      gemount: () => gemount.current,
      onboarded: () => Boolean(profielRef.current?.onboarded_at),
      vergeetCode: () => void vergeetOpenstaandeUitnodiging(),
      zetFout: setFout,
      zetBinnen: setBinnen,
      naarGroep: (groupId) => router.replace(`/groep/${groupId}`),
    }),
    [router],
  );

  const deelnemen = useCallback(async () => {
    if (!code) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await neemDeel(code);
    setBezig(false);
    verwerkToetreding(uitkomst, uitvoer);
  }, [code, uitvoer]);

  /**
   * Verschijnt er een sessie terwijl dit scherm openstaat, dan kwam die van het
   * aanmeldscherm hiernaast — en dan is toetreden geen extra stap meer.
   *
   * ⚠️ Deze route zet geen `bezig` vóór de aanroep, anders is dat een setState in
   *    de body van een effect en dus een cascade van renders. De toestand
   *    verandert hier uitsluitend in de callback.
   *
   * ⚠️ De ref en niet de state als slot. State is pas bij de volgende render
   *    bijgewerkt, en tot dat moment zou een tweede effectronde nog een keer
   *    kunnen toetreden — en elke toetreding kost een poging uit de dagelijkse
   *    limiet van twintig.
   */
  useEffect(() => {
    if (sessieLaadt) return;

    // De momentopname staat in dezelfde effect-body als de beslissing die hem
    // gebruikt. Dat is geen elegantie maar noodzaak: een ref uitlezen tijdens de
    // render mag niet, en twee losse effecten geven geen vaste volgorde.
    if (sessieBijBinnenkomst.current === null) {
      sessieBijBinnenkomst.current = session !== null;
    }

    if (!session || uitnodiging === null || !code) return;
    if (!magToetreden) return;
    if (sessieBijBinnenkomst.current !== false) return;
    if (automatischGeprobeerd.current) return;

    automatischGeprobeerd.current = true;

    neemDeel(code)
      .then((uitkomst) => verwerkToetreding(uitkomst, uitvoer))
      .catch(() => {
        if (gemount.current) setFout(t('uitnodiging.deelnemen_mislukt'));
      });
  }, [sessieLaadt, session, uitnodiging, code, uitvoer, magToetreden]);

  return (
    <Screen
      title={titelIsVerlopen(stand) ? t('uitnodiging.titel_verlopen') : t('uitnodiging.titel')}
      eyebrow={t('uitnodiging.eyebrow')}
      terug={{ naar: '/' }}
    >
      <AsyncView
        loading={loading}
        error={error}
        data={uitnodiging ?? undefined}
        isEmpty={() => false}
        onRetry={herlaad}
        empty={{
          title: t('uitnodiging.leeg_titel'),
          body: t('uitnodiging.leeg_tekst'),
        }}
      >
        {(u) => (
          <View style={styles.lijst}>
            {stand.soort === 'al-lid' && binnen === null ? (
              <AlLidKaart groupId={stand.groupId} />
            ) : null}

            <Card>
              <Subheading>{u.group_name}</Subheading>
              <Caption>
                {t(u.member_count === 1 ? 'uitnodiging.leden_een' : 'uitnodiging.leden_meer', {
                  n: u.member_count,
                  dag: huddledagLabel(u.huddle_day).toLowerCase(),
                })}
              </Caption>

              {u.members.map((lid, i) => (
                <View key={`${lid.display_name}-${i}`} style={styles.lid}>
                  <Avatar name={lid.display_name} url={lid.avatar_url} />
                  <View style={styles.lidTekst}>
                    <Body>{lid.display_name}</Body>
                    {/*
                      Geen doel gekoppeld is geen tekortkoming: het betekent
                      alleen dat deze persoon niets met de groep deelt. En zonder
                      account staat er sowieso geen doel — zie migratie 0019.
                    */}
                    {u.detailed ? (
                      <Caption>{lid.goal_title ?? t('uitnodiging.geen_gedeeld_doel')}</Caption>
                    ) : null}
                  </View>
                </View>
              ))}

              {u.detailed ? null : <Caption>{t('uitnodiging.pas_bij_meedoen')}</Caption>}
            </Card>

            {/*
              ⚠️ **Dit blok staat vóór "wat je doet" en niet erna, en dat is geen
                 opmaak.** Meedoen met een open groep maakt de gemiste weken van
                 déze bezoeker zichtbaar voor de anderen — dezelfde overgang als
                 wanneer een groep wordt opengezet, maar zonder systeembericht,
                 want er verandert niets aan de groep. Dit scherm is de enige plek
                 waar dat feit kan staan, en dan hoort het boven de knop.

                 Besluit A41; migratie 0080 zet `zichtbaarheid` daarom ook in het
                 antwoord voor wie nog geen account heeft.
            */}
            {stand.soort === 'al-lid' && binnen === null ? null : (
              <>
                <Card nested>
                  <Subheading>{zichtbaarheidLabels()[u.zichtbaarheid]}</Subheading>
                  <Body muted>{zichtbaarheidUitleg()[u.zichtbaarheid]}</Body>
                  {u.zichtbaarheid === 'open' ? (
                    <Caption danger>{t('uitnodiging.open_waarschuwing')}</Caption>
                  ) : null}
                </Card>

                <Card nested>
                  <Subheading>{t('uitnodiging.wat_je_doet')}</Subheading>
                  <Body muted>{t('uitnodiging.uitleg_kern')}</Body>
                  {/*
                ⚠️ Voorwaardelijk sinds besluit A41. Hier stond onvoorwaardelijk
                   "Niemand in de groep ziet het", drie kaarten onder de
                   waarschuwing hierboven dat een open groep je gemiste weken wél
                   ziet. Twee kaarten die elkaar tegenspreken op het scherm waar
                   je besluit of je meedoet — en de geruststellende was de laatste
                   die je las.
              */}
                  <Body muted>
                    {u.zichtbaarheid === 'open'
                      ? t('uitnodiging.uitleg_missen_open')
                      : t('uitnodiging.uitleg_missen_beschermd')}
                  </Body>
                </Card>
              </>
            )}

            {binnen === null && stand.soort !== 'al-lid' ? <AccountBlok /> : null}

            {actie === 'controleren' ? <Caption>{t('uitnodiging.controleren')}</Caption> : null}

            {actie === 'binnen' ? (
              <Card>
                <Subheading>{t('uitnodiging.al_lid')}</Subheading>
                <Body muted>
                  {profiel?.onboarded_at
                    ? t('uitnodiging.doorsturen')
                    : t('uitnodiging.eerst_profiel')}
                </Body>
                {/*
                  ⚠️ Altijd een knop. Een scherm dat zegt "maak eerst je profiel
                     af" zonder te zeggen waar, is een doodlopend pad — en de
                     routewacht slaat deze route juist bewust over.
                */}
                <Button
                  variant="primair"
                  block
                  onPress={() =>
                    router.replace(
                      profiel?.onboarded_at ? `/groep/${binnen}` : '/onboarding/uitleg',
                    )
                  }
                >
                  {profiel?.onboarded_at
                    ? t('uitnodiging.naar_groep')
                    : t('uitnodiging.profiel_afmaken')}
                </Button>
              </Card>
            ) : null}

            {actie === 'deelnemen' ? (
              <Button variant="primair" block busy={bezig} onPress={() => void deelnemen()}>
                {t('uitnodiging.deelnemen')}
              </Button>
            ) : null}

            {actie === 'inloggen' ? (
              <>
                {/*
                  ⚠️ Rechtstreeks op het aanmeldformulier (QS8-248). Wie een
                     uitnodiging krijgt is bijna altijd nieuw; het scherm zelf
                     opent standaard op inloggen, want dat is het geval dat
                     honderden keren voorkomt.
                */}
                <Button variant="primair" block onPress={() => router.push(ROUTE_AANMELDEN)}>
                  {t('uitnodiging.inloggen')}
                </Button>
                <Caption>{t('uitnodiging.blijft_bewaard')}</Caption>
              </>
            ) : null}

            {lidmaatschap.error ? <Caption>{t('uitnodiging.lid_onbekend')}</Caption> : null}
            {fout === null ? null : <Caption danger>{fout}</Caption>}
          </View>
        )}
      </AsyncView>

      {titelIsVerlopen(stand) ? (
        <Button variant="secundair" block onPress={() => router.replace('/aanmelden')}>
          {t('uitnodiging.rondkijken')}
        </Button>
      ) : null}
    </Screen>
  );
}

/**
 * Het account staat bij de knop en niet bovenaan — QS8-708. Bovenaan is het op een
 * telefoon al uit beeld op het moment dat je beslist.
 *
 * ⚠️ Niets tonen zolang de sessie laadt: dan zegt "je bent niet ingelogd" iets
 *    wat nog niet vaststaat.
 */
function AccountBlok() {
  const { session, loading } = useSession();
  const { profiel } = useProfiel();
  if (loading) return null;
  return (
    <View>
      <Accountregel
        ingelogd={session !== null}
        naam={profiel?.display_name ?? null}
        adres={session?.user.email ?? null}
      />
      {session ? <Caption>{t('account.verkeerd_account')}</Caption> : null}
    </View>
  );
}

/** Een bestaand lid ziet dit bovenaan, vóór de uitleg voor nieuwkomers. */
function AlLidKaart({ groupId }: { readonly groupId: string }) {
  const router = useRouter();
  return (
    <Card>
      <Subheading>{t('uitnodiging.al_lid_titel')}</Subheading>
      <Body muted>{t('uitnodiging.al_lid_tekst')}</Body>
      <AccountBlok />
      <Button variant="primair" block onPress={() => router.replace(`/groep/${groupId}`)}>
        {t('uitnodiging.naar_groep')}
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  lid: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  lidTekst: { flex: 1, gap: 2 },
});
