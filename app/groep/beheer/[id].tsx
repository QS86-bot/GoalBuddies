import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { clientEnv } from '@/lib/env';
import { useSession } from '@/modules/auth';
import {
  bewijseisLabels,
  BEWIJSEISEN,
  fetchGroep,
  fetchMijnLidmaatschap,
  huddledagen,
  type Bewijseis,
  toonCode,
  uitnodigingsLink,
  vernieuwUitnodiging,
  wijzigGroep,
  zetGroepszichtbaarheid,
  zetUitnodigingIngetrokken,
  zichtbaarheidLabels,
  zichtbaarheidUitleg,
  type Groep,
  type Zichtbaarheid,
} from '@/modules/buddies';
import { t } from '@/shared/i18n';
import type { Weekday } from '@/shared/time';
import {
  AsyncView,
  bevestigingen,
  Bevestiging,
  Body,
  Button,
  Caption,
  Card,
  Choice,
  Deelknop,
  Field,
  Screen,
  Subheading,
} from '@/shared/ui';

/**
 * Groepsinstellingen voor de beheerder — QS8-52 en QS8-58.
 *
 * ⚠️ Wie hier komt zonder beheerder te zijn, ziet de knoppen wel maar krijgt van
 *    de server een weigering. Dat is met opzet de volgorde: de UI verbergt, de
 *    database beslist (CLAUDE.md, beveiligingsregel 2). Zou de UI de enige
 *    controle zijn, dan is een aangepaste client genoeg.
 *
 * ⚠️ De uitnodigingscode staat in een veld en niet in lopende tekst. Op web én
 *    native is dat de enige manier om hem te kunnen selecteren en kopiëren zonder
 *    een nieuwe dependency (`expo-clipboard`) toe te voegen — en dependencies
 *    gaan niet zonder overleg.
 */
export default function GroepBeheer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useSession();

  const [groep, setGroep] = useState<Groep | null>(null);
  const [beheerder, setBeheerder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [naam, setNaam] = useState('');
  const [huddledag, setHuddledag] = useState<Weekday>(0);
  const [bewijseis, setBewijseis] = useState<Bewijseis>('note_required');
  const [bezig, setBezig] = useState<'opslaan' | 'vernieuwen' | 'sluiten' | 'zicht' | null>(null);
  /**
   * ⚠️ Openklappen en niet meteen doen. Besluit A41 grens 3: omzetten raakt
   *    ánderen, dus het krijgt dezelfde zwaarte als een commitment device — en
   *    dat is in dit project een `Bevestiging` met de prijs erin, geen "weet je
   *    het zeker?". De database weigert bovendien zonder `p_bevestigd`, dus dit
   *    scherm is de tweede rem en niet de enige.
   */
  const [zichtVraag, setZichtVraag] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !userId) return;
    let levend = true;

    Promise.all([fetchGroep(id), fetchMijnLidmaatschap(id, userId)])
      .then(([gevonden, lidmaatschap]) => {
        if (!levend) return;
        setGroep(gevonden);
        setBeheerder(lidmaatschap?.role === 'admin');
        setNaam(gevonden?.name ?? '');
        setHuddledag(((gevonden?.huddle_day ?? 0) % 7) as Weekday);
        setBewijseis((gevonden?.evidence_policy ?? 'note_required') as Bewijseis);
        setError(null);
      })
      .catch((f: unknown) => {
        if (levend) setError(f);
      })
      .finally(() => {
        if (levend) setLoading(false);
      });

    return () => {
      levend = false;
    };
  }, [id, userId]);

  async function slaOp() {
    if (!id) return;
    setBezig('opslaan');
    setFout(null);
    setMelding(null);

    const uitkomst = await wijzigGroep(id, {
      name: naam,
      huddle_day: huddledag,
      evidence_policy: bewijseis,
    });
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setGroep(uitkomst.waarde);
    setMelding('Opgeslagen. Lopende kettingschakels blijven staan waar ze staan.');
  }

  async function vernieuw() {
    if (!id) return;
    setBezig('vernieuwen');
    setFout(null);
    setMelding(null);

    const uitkomst = await vernieuwUitnodiging(id);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setGroep((huidig) => (huidig === null ? huidig : { ...huidig, invite_code: uitkomst.waarde }));
    setMelding('Nieuwe link. De oude werkt vanaf nu niet meer.');
  }

  async function zetZichtbaarheid(naar: Zichtbaarheid) {
    if (!id) return;
    setBezig('zicht');
    setFout(null);
    setMelding(null);

    const uitkomst = await zetGroepszichtbaarheid(id, naar, true);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setZichtVraag(false);
    setGroep((huidig) => (huidig === null ? huidig : { ...huidig, zichtbaarheid: naar }));
    setMelding(
      naar === 'open' ? t('beheer.melding_open_gezet') : t('beheer.melding_beschermd_gezet'),
    );
  }

  async function zetGesloten(gesloten: boolean) {
    if (!id) return;
    setBezig('sluiten');
    setFout(null);
    setMelding(null);

    const uitkomst = await zetUitnodigingIngetrokken(id, gesloten);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setGroep((huidig) => (huidig === null ? huidig : { ...huidig, invite_revoked: gesloten }));
    setMelding(gesloten ? t('beheer.melding_gesloten') : t('beheer.melding_open'));
  }

  return (
    <Screen title={t('beheer.titel')} eyebrow={t('beheer.eyebrow')}>
      <AsyncView
        loading={loading}
        error={error}
        data={groep ?? undefined}
        isEmpty={() => false}
        empty={{
          title: 'Deze groep is er niet, of niet voor jou',
          body: 'Je bent geen lid van deze groep, of hij bestaat niet meer.',
        }}
      >
        {(g) =>
          /*
            ⚠️ Een gewoon lid krijgt geen formulier te zien dat de server daarna
               weigert. De database is en blijft de bescherming — dat is
               beveiligingsregel 2 — maar een scherm dat je drie keer laat falen
               voordat het zegt dat je er niets te zoeken hebt, is een slecht
               scherm.
          */
          !beheerder ? (
            <Card>
              <Subheading>{t('beheer.geen_beheerder_titel')}</Subheading>
              <Body muted>{t('beheer.geen_beheerder_tekst')}</Body>
            </Card>
          ) : (
            <>
              <Card>
                <Field
                  label={t('beheer.naam')}
                  value={naam}
                  onChangeText={setNaam}
                  maxLength={60}
                  placeholder={t('beheer.naam_hint')}
                />

                <Choice
                  label="Huddledag"
                  hint={
                    'De gedeelde dag van de groep. Verandert niets aan wanneer jouw eigen ' +
                    'weekdoelen resetten — dat blijft je persoonlijke week-startdag.'
                  }
                  opties={huddledagen().map((d) => ({ waarde: d.waarde, label: d.label }))}
                  waarde={huddledag}
                  onKies={setHuddledag}
                />

                <Caption>{t('beheer.huddledag_uitleg')}</Caption>

                {/*
                  ⚠️ De bijlage-optie staat er wel en doet nog niets: er is geen
                     Storage-bucket (Q-TODO A12), dus die eis zou onhaalbaar zijn.
                     Tot die tijd gedraagt hij zich als "notitie verplicht", en dat
                     staat eronder in plaats van dat de knop stilletjes liegt.
                */}
                <Choice
                  label={t('beheer.bewijs_label')}
                  hint={t('beheer.bewijs_hint')}
                  opties={BEWIJSEISEN.map((e) => ({ waarde: e, label: bewijseisLabels()[e] }))}
                  waarde={bewijseis}
                  onKies={setBewijseis}
                />
                <Caption>{t('beheer.bijlagen_nog_niet')}</Caption>

                <Button
                  variant="primair"
                  block
                  busy={bezig === 'opslaan'}
                  onPress={() => void slaOp()}
                >
                  {t('beheer.opslaan')}
                </Button>
              </Card>

              {/*
                ⚠️ Een eigen kaart en niet een derde `Choice` in het formulier
                   hierboven. Dat formulier heeft één opslaanknop, en deze keuze
                   hoort nooit mee te liften op een knop die ook de groepsnaam
                   opslaat: dan zet je per ongeluk de weken van je buddy's open
                   terwijl je een typefout herstelde.
              */}
              <Card>
                <Subheading>{t('beheer.zichtbaarheid_titel')}</Subheading>
                <Body muted>
                  {t('beheer.zichtbaarheid_nu', {
                    stand: zichtbaarheidLabels()[(g.zichtbaarheid ?? 'beschermd') as Zichtbaarheid],
                  })}
                </Body>
                <Body muted>
                  {zichtbaarheidUitleg()[(g.zichtbaarheid ?? 'beschermd') as Zichtbaarheid]}
                </Body>
                <Caption>{t('beheer.zichtbaarheid_waarschuwing')}</Caption>

                {zichtVraag ? (
                  <Bevestiging
                    tekst={
                      g.zichtbaarheid === 'open'
                        ? bevestigingen().groepBeschermen
                        : bevestigingen().groepOpenzetten
                    }
                    bezig={bezig === 'zicht'}
                    onBevestig={() =>
                      void zetZichtbaarheid(g.zichtbaarheid === 'open' ? 'beschermd' : 'open')
                    }
                    onAnnuleer={() => setZichtVraag(false)}
                  />
                ) : (
                  <Button variant="secundair" block onPress={() => setZichtVraag(true)}>
                    {g.zichtbaarheid === 'open'
                      ? t('beheer.naar_beschermd')
                      : t('beheer.naar_open')}
                  </Button>
                )}
              </Card>

              <Card>
                <Subheading>{t('beheer.link_titel')}</Subheading>
                <Body muted>{t('beheer.link_uitleg')}</Body>

                <Deelknop
                  label={t('beheer.deel')}
                  titel={t('beheer.deel_titel', { groep: g.name })}
                  tekst={uitnodigingsLink(clientEnv().appUrl, g.invite_code)}
                />

                <Field
                  label={t('beheer.kopieer')}
                  value={uitnodigingsLink(clientEnv().appUrl, g.invite_code)}
                  editable={false}
                  selectTextOnFocus
                  multiline
                />
                <Caption>Voorlezen kan ook: {toonCode(g.invite_code)}</Caption>

                {g.invite_revoked ? (
                  <Caption danger>{t('beheer.link_gesloten')}</Caption>
                ) : null}

                <Button
                  variant="secundair"
                  block
                  busy={bezig === 'vernieuwen'}
                  onPress={() => void vernieuw()}
                >
                  {t('beheer.nieuwe_link')}
                </Button>
                <Button
                  variant="stil"
                  block
                  busy={bezig === 'sluiten'}
                  onPress={() => void zetGesloten(!g.invite_revoked)}
                >
                  {g.invite_revoked ? t('beheer.link_openzetten') : t('beheer.link_sluiten')}
                </Button>

                <Caption>{t('beheer.sluiten_uitleg')}</Caption>
              </Card>

              {melding === null ? null : <Caption muted={false}>{melding}</Caption>}
              {fout === null ? null : <Caption danger>{fout}</Caption>}
            </>
          )
        }
      </AsyncView>

      <Button variant="stil" block onPress={() => router.back()}>
        {t('beheer.terug')}
      </Button>
    </Screen>
  );
}
