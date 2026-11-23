import { useRouter } from 'expo-router';

import { heeftVragenlijstAntwoord, type VragenlijstVelden } from '@/modules/goals';
import { t } from '@/shared/i18n';
import { Body, Button, Card, Subheading } from '@/shared/ui';

import { vragenlijstVanafProfiel } from './herkomst';

/**
 * De vaste ingang naar de vragenlijst, op Profiel onder Instellingen — QS8-817.
 *
 * ⚠️ **Besluit Quinten (23-11-2026, 17:06 UTC, variant B).** De vragenlijst belooft
 *    "je kunt het later invullen", en na "Niet nu" op de kaart van Vandaag was er
 *    geen knop meer die dat waarmaakte. Deze kaart staat er daarom **voor iedereen en
 *    altijd**: ook na "Niet nu", en ook als de vragenlijst al is ingevuld.
 *
 * ⚠️ Zonder een enkel antwoord "Vragen beantwoorden", met minstens één antwoord
 *    "Antwoorden aanpassen". Dezelfde grens als de kaart op Vandaag
 *    (`heeftVragenlijstAntwoord()`), zodat de twee nooit iets anders zeggen. De
 *    vragenlijst laadt bestaande antwoorden zelf in (`useAntwoorden(profiel)`).
 *
 * ⚠️ De knop geeft `van=profiel` mee: na afloop gaat de gebruiker terug naar Profiel
 *    (zie `./herkomst.ts`).
 */
export function VragenlijstIngang({ profiel }: { readonly profiel: VragenlijstVelden }) {
  const router = useRouter();
  const ingevuld = heeftVragenlijstAntwoord(profiel);
  return (
    <Card>
      <Subheading>{t('profiel.vragenlijst_titel')}</Subheading>
      <Body muted>
        {ingevuld ? t('profiel.vragenlijst_tekst_ingevuld') : t('profiel.vragenlijst_tekst_leeg')}
      </Body>
      <Button onPress={() => router.push(vragenlijstVanafProfiel())}>
        {ingevuld ? t('profiel.vragenlijst_knop_aanpassen') : t('profiel.vragenlijst_knop_beantwoorden')}
      </Button>
    </Card>
  );
}
