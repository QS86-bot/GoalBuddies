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
 * Wat deze module van een groep nodig heeft — QS8-387.
 *
 * ⚠️ **Vier kolommen en geen rij.** `koppelbareGroepen()` leest `id`, `name`,
 *    `status` en `zichtbaarheid`; dat is wat hij hier moet vrágen. Vroeg hij om
 *    een hele `Tables<'groups'>`, dan zou elke aanroeper een volledige rij moeten
 *    hebben — en dan is de smalle lijst uit `fetchMijnGroepen()` opeens "te
 *    weinig" terwijl hij precies genoeg is. Een functie die meer vraagt dan ze
 *    gebruikt, duwt haar aanroepers naar een `select('*')`.
 */
export type KoppelbaarGroep = Pick<Groep, 'id' | 'name' | 'status' | 'zichtbaarheid'>;

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
  mijnGroepen: readonly KoppelbaarGroep[],
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
 * De ene regel voor "welke van mijn groepen (of mensen) bedoel je" — QS8-651.
 *
 * Nul kandidaten geeft niets. Eén kandidaat zonder keuze geeft die ene. In élk
 * ander geval geldt alleen wat de gebruiker aanwees, en bestaat dat niet meer in
 * de lijst, dan is het antwoord `undefined` en niet de volgende in de rij.
 *
 * ⚠️ **"Zonder keuze" staat er met reden.** De eerste versie negeerde `keuze`
 *    bij één kandidaat (de regel van QS8-56). De security-ronde van 05-11-2026
 *    vond het gat: kies "Vrienden", ontkoppel "Vrienden" op hetzelfde scherm, en
 *    de lijst krimpt tot "Werk" — die dan stilzwijgend de ontvanger werd, met de
 *    keuzelijst verborgen en de verstuurknop aan. Iets dat naar een andere groep
 *    gaat dan je aanwees, is erger dan iets dat niet weggaat; het scherm toont
 *    dan de lijst opnieuw zodat de gebruiker de overgebleven groep kan aanwijzen.
 *
 * ⚠️ **Deze functie kent geen teamgroepen (QS8-649): bij één kandidaat kiest hij
 *    die, teamgroep of niet.** Een teamgroep als enige kandidaat uitsluiten is
 *    aan de aanroeper, die de rij kent — open tot QS8-649, zie
 *    `docs/decisions/2026-11-05-de-eerste-groep-is-geen-keuze.md` §3.
 *
 * @param items   de kandidaten, in de volgorde van het scherm
 * @param keuze   wat de gebruiker aanwees; `''` is "nog niets"
 * @param idVan   de sleutel waarop `keuze` vergeleken wordt
 */
export function enigeOfGekozen<T>(
  items: readonly T[],
  keuze: string,
  idVan: (item: T) => string,
): T | undefined {
  if (items.length === 1 && keuze === '') return items[0];

  return items.find((item) => idVan(item) === keuze);
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
 * ⚠️ **Sinds QS8-651 is dit de regel van `enigeOfGekozen()` met een naam.** De
 *    naam blijft, want `tests/beloftes/doel-in-meerdere-groepen.test.ts` bindt het
 *    uitstelverzoek eraan en het beslisdocument van 27-08 noemt hem; de regel
 *    zelf staat één keer, hierboven — inclusief de aanscherping dat een oude
 *    keuze bij één overgebleven groep niet meer genegeerd wordt.
 */
export function beslissendeGroep(
  groepen: readonly DoelGroep[],
  keuze: string,
): DoelGroep | undefined {
  return enigeOfGekozen(groepen, keuze, (groep) => groep.group_id);
}
