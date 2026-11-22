import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

import { t } from '@/shared/i18n';
import { Body, Button, Card, Subheading } from '@/shared/ui';

/**
 * De uitnodigingskaart: "Zet het klassement aan" — QS8-666 (A57), deel 3b, keuze B3 van Quinten.
 *
 * ⚠️ **Deze kaart zet niets aan.** Hij leidt naar Groepsbeheer, waar de schakelaar van 3a met zijn bevestigingsblad de
 *    enige weg blijft. Een tweede bevestigingspad naast die ene is een tweede plek waar de belofte aan álle leden
 *    kan afwijken.
 *
 * ⚠️ **Geen wegklikknop, met opzet.** Wegklikken per beheerder is een eigen besluit met een eigen migratie
 *    (QS8-784); zonder die opslag zou een wegklik alleen op dit apparaat gelden en bij de volgende lading terugkomen.
 *
 * ⚠️ **Herladen alleen na een bezoek aan Groepsbeheer via deze kaart.** `useFocusEffect` vuurt ook bij de eerste
 *    mount en bij elke terugkeer uit de chat of de weekafsluiting; een vaste herlaadronde kost zes RPC's per keer.
 *    De ref onthoudt dat deze kaart de reden van het vertrek was.
 */
export function KlassementUitnodiging({
  groupId,
  onTerug,
}: {
  readonly groupId: string;
  readonly onTerug: () => void;
}) {
  const router = useRouter();
  const weg = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!weg.current) return;
      weg.current = false;
      onTerug();
    }, [onTerug]),
  );

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
    </Card>
  );
}
