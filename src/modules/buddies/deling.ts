import { leesZichtbaarheid, type Zichtbaarheid } from './schemas';

import type { Tables } from '../../lib/database.types';

/**
 * Eén doel in meer dan één groep — QS8-56 (PRD 5.5).
 *
 * ⚠️ **Waarom dit een eigen bestand is en geen paar regels in het scherm.** De
 *    belofte van deze feature is niet "er staat een lijstje" maar "elke groep is
 *    een aparte toestemming, en de app kiest er nooit stilzwijgend een voor je".
 *    Dat is een eigenschap van een beslissing, en een beslissing die in een
 *    component staat kun je alleen toetsen door het component te renderen — of
 *    door in de broncode naar een letterlijke regel te grijpen, en dat is precies
 *    de testvorm die bij QS8-85 stilletjes ophield iets te bewaken.
 *
 *    Hier staan ze als functie, en dan is de vraag uit onwrikbare regel 18
 *    beantwoordbaar: kan deze test groen blijven terwijl de belofte breekt? Voor
 *    `beslissendeGroep()` is het antwoord nee — de ongeldige toestand bestaat
 *    niet meer in het type.
 */

type Groep = Tables<'groups'>;

/**
 * Eén groep waar een doel aan gekoppeld is, zoals het doelscherm hem toont.
 *
 * ⚠️ **`zichtbaarheid` hoort erbij en dat is geen luxe.** Vanaf het doelscherm
 *    kun je sinds QS8-56 koppelen, en koppelen aan een **open** groep deelt sinds
 *    migratie 0077 élke weekdoelrij — ook de gemiste. Het groepsscherm zei dat al
 *    boven zijn eigen knop (`koppel.uitleg_open`); een tweede knop zonder die zin
 *    zou dezelfde toestemming vragen met een stillere belofte, en dat is precies
 *    hoe besluit A41 verwatert.
 */
export interface DoelGroep {
  readonly group_id: string;
  readonly name: string;
  readonly zichtbaarheid: Zichtbaarheid;
}

/**
 * De groepen waar je dit doel nóg aan kunt koppelen — QS8-56.
 *
 * ⚠️ **Een aftrekking en geen vraag aan de database.** Beide helften worden op het
 *    doelscherm toch al opgehaald (`fetchMijnGroepen` voor de straf,
 *    `fetchGroepenVanDoel` voor het deadlineverzoek), dus dit kost nul extra
 *    verzoeken. Een `not.in`-query zou een derde ronde zijn met hetzelfde
 *    antwoord.
 *
 * ⚠️ **Dit is gebruiksgemak en geen grens.** Wie deze lijst omzeilt en zelf een
 *    `goal_group_links`-rij schrijft, loopt tegen `goal_group_links_insert`: lid
 *    van de groep én eigenaar van het doel. Dát is de controle. Deze functie mag
 *    dus nooit ergens gebruikt worden om een recht te bepálen.
 */
export function koppelbareGroepen(
  mijnGroepen: readonly Groep[],
  gekoppeld: readonly DoelGroep[],
): readonly DoelGroep[] {
  const bezet = new Set(gekoppeld.map((g) => g.group_id));

  return mijnGroepen
    .filter((groep) => !bezet.has(groep.id) && groep.status !== 'archived')
    .map((groep) => ({
      group_id: groep.id,
      name: groep.name,
      zichtbaarheid: leesZichtbaarheid(groep.zichtbaarheid),
    }));
}

/**
 * Welke groep beslist over een verzoek om de streefdatum te verschuiven — A7.
 *
 * ⚠️ **Tot QS8-56 stond hier `groepen[0]` in het scherm, en dat was een keuze die
 *    niemand gemaakt had.** Het verzoek ging naar de eerste groep uit de lijst, en
 *    die lijst had niet eens een `order by` — welke dat was, beloofde Postgres
 *    niet. Zolang de app geen scherm had om een doel aan twéé groepen te hangen,
 *    kwam dat nooit boven. PRD 5.5 is precies dat scherm, dus dit is het moment
 *    waarop de aanname een vraag wordt.
 *
 * ⚠️ **Bij precies één groep is er niets te kiezen en wordt `keuze` genegeerd.**
 *    Dat is bewust: anders zou het scherm een keuze moeten onthouden die het
 *    nooit aan de gebruiker gesteld heeft, en dan is de stille keuze terug onder
 *    een andere naam.
 *
 * ⚠️ **Bij twee of meer telt alleen een keuze die nog bestáát.** Ontkoppel je de
 *    gekozen groep terwijl het formulier openstaat, dan is het antwoord
 *    `undefined` — geen beslisser — en niet de volgende groep in de rij. Een
 *    verzoek dat naar een andere groep verhuist dan je aanwees, is erger dan een
 *    verzoek dat niet weggaat.
 */
export function beslissendeGroep(
  groepen: readonly DoelGroep[],
  keuze: string,
): DoelGroep | undefined {
  if (groepen.length === 0) return undefined;
  if (groepen.length === 1) return groepen[0];

  return groepen.find((groep) => groep.group_id === keuze);
}
