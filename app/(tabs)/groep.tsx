import { Card, EmptyState, Screen } from '@/shared/ui';

/**
 * Groep — de leden, De Ketting, de feed, de chat en de weekafsluiting.
 *
 * ⚠️ Het gevaarlijkste scherm van de app voor domeinregel 7. Alles hier is
 *    zichtbaar over iemand ánders. Bij elk ding dat hier bij komt: kan hieruit
 *    iemands gemiste week worden afgeleid? Zo ja, dan is het fout, ook als het
 *    technisch werkt.
 *
 *    Er zijn precies twee routes waarlangs tegenslag dit scherm mag bereiken, en
 *    beide lopen via de gebruiker zelf: vraag 2 van de weekafsluiting, en de knop
 *    "vraag je groep om hulp" van de Risico-radar.
 */
export default function Groep() {
  return (
    <Screen title="Groep">
      <Card>
        <EmptyState
          title="Nog geen buddy-groep"
          body={
            'Drie mensen is de beste maat: groot genoeg dat er altijd iemand ' +
            'reageert, klein genoeg dat je je niet kunt verstoppen. Maak een groep ' +
            'aan of gebruik de uitnodigingslink die je hebt gekregen.'
          }
        />
      </Card>
    </Screen>
  );
}
