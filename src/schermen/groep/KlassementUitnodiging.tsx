import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { klikKlassementUitnodigingWeg } from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { Body, Button, Caption, Card, Subheading } from '@/shared/ui';

/**
 * De uitnodigingskaart: "Zet het klassement aan" — QS8-666 (A57), deel 3b, keuze B3 van Quinten.
 *
 * ⚠️ **Deze kaart zet niets aan.** Hij leidt naar Groepsbeheer, waar de schakelaar van 3a met zijn bevestigingsblad de
 *    enige weg blijft. Een tweede bevestigingspad naast die ene is een tweede plek waar de belofte aan álle leden
 *    kan afwijken.
 *
 * ⚠️ **Wegklikken is per beheerder en staat in de database** (QS8-784): een eigen rij in `klassement_uitnodiging_weg`
 *    die niemand anders kan lezen. Hij blijft weg tot iemand het klassement aan en weer uit zet; dan wist de database
 *    de rijen van de hele groep (besluit Quinten 22-11-2026). De kaart verdwijnt meteen; mislukt het opslaan, dan
 *    komt hij terug met een foutregel. Herladen hoeft niet: het scherm leest de rij bij de volgende lading zelf.
 *
 * ⚠️ **Herladen alleen na een bezoek aan Groepsbeheer via deze kaart.** `useFocusEffect` vuurt ook bij de eerste
 *    mount en bij elke terugkeer uit de chat of de weekafsluiting; een vaste herlaadronde kost zes RPC's per keer.
 *    De ref onthoudt dat deze kaart de reden van het vertrek was.
 */
/**
 * Wegklikken met een optimistische stand (QS8-784): de kaart verdwijnt meteen, en komt terug met een foutregel als de
 * database weigert of onbereikbaar is.
 */
function useWegklikken(groupId: string, userId: string) {
  const [verborgen, setVerborgen] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const wegklikken = useCallback(() => {
    setFout(null);
    setVerborgen(true);
    // ⚠️ Ook een worp (bv. een client die niet start) zet de kaart terug met een foutregel: nooit stil weg.
    void klikKlassementUitnodigingWeg(groupId, userId)
      .catch(() => ({ ok: false as const, melding: t('klassement.uitnodiging_weg_mislukt') }))
      .then((uit) => {
        if (uit.ok) return;
        setVerborgen(false);
        setFout(uit.melding);
      });
  }, [groupId, userId]);

  return { verborgen, fout, wegklikken };
}

export function KlassementUitnodiging({
  groupId,
  userId,
  onTerug,
}: {
  readonly groupId: string;
  readonly userId: string;
  readonly onTerug: () => void;
}) {
  const router = useRouter();
  const weg = useRef(false);
  const { verborgen, fout, wegklikken } = useWegklikken(groupId, userId);

  useFocusEffect(
    useCallback(() => {
      if (!weg.current) return;
      weg.current = false;
      onTerug();
    }, [onTerug]),
  );

  if (verborgen) return null;

  return (
    <Card>
      <Subheading>{t('klassement.uitnodiging_titel')}</Subheading>
      <Body muted>{t('klassement.uitnodiging_tekst')}</Body>
      <Button
        variant="secundair"
        block
        onPress={() => {
          weg.current = true;
          router.push(`/groep/beheer/${groupId}`);
        }}
      >
        {t('klassement.uitnodiging_knop')}
      </Button>
      <Button variant="stil" block onPress={wegklikken}>
        {t('klassement.uitnodiging_weg_knop')}
      </Button>
      <Caption muted>{t('klassement.uitnodiging_weg_uitleg')}</Caption>
      {fout === null ? null : (
        <Caption danger accessibilityRole="alert">
          {fout}
        </Caption>
      )}
    </Card>
  );
}
