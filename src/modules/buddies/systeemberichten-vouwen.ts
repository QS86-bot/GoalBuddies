import { localDateOf, type IsoDate, type TimeZone } from '../../shared/time';
import { t, type Sleutel } from '../../shared/i18n';

import type { ChatBericht } from './chat-schemas';
import { isSysteembericht } from './chat-schemas';

/**
 * Systeemberichten samenvouwen — QS8-198.
 *
 * ⚠️ **Het probleem is dichtheid en geen lekkage.** De inhoud klopt: een
 *    systeembericht noemt de persoon en de gebeurtenis, nooit een titel, notitie
 *    of niveau, en de CHECK `chat_messages_system_event_bekend` is een allowlist
 *    die ook voor `service_role` geldt. Wat er misgaat is dat een actieve groep
 *    zijn eigen gesprek onder de systeemregels bedelft.
 *
 * ⚠️ **Daarom vouwen en niet filteren.** Van de drie opties in het issue —
 *    samenvouwen, een stiller register, een aparte strook — is dit de enige die
 *    níéts weglaat: elke gebeurtenis blijft zichtbaar, alleen op één regel in
 *    plaats van drie. Een oppervlak dat mínder toont kan domeinregel 7 niet
 *    verruimen, en dat is precies waarom deze kant is gekozen.
 *
 * ⚠️ **Dit is render-tijd en raakt de database niet.** Sinds migratie 0059 maakt
 *    de app de zin uit `system_event` plus de kolommen (oppervlak 9 in
 *    `docs/decisions/002-domeinregel7-oppervlakken.md`). Er komt dus géén nieuw
 *    type systeembericht bij, en de CHECK blijft ongemoeid — een nieuw type zou
 *    per definitie een migratie vragen.
 *
 * ## ⚠️ De valkuil die 0070 al een keer heeft omzeild
 *
 * Een samenvatting die **voorwaardelijk** is, maakt van de afwezigheid een
 * signaal: verschijnt een regel alleen als iedereen meedeed, dan vertelt het
 * uitblijven ervan dat er iemand ontbrak. Dat is exact de reden dat de
 * ketting-mijlpaal cumulatief is en niet "voltallig deze periode".
 *
 * Deze vouw is **onvoorwaardelijk**: een reeks van `DREMPEL` of meer wordt altijd
 * één regel, ongeacht wie erin staat en wie niet. Uit het uitblijven van een
 * gevouwen regel volgt niets anders dan "er stonden er minder dan drie achter
 * elkaar".
 */

/**
 * De gebeurtenissen die zich laten samenvouwen.
 *
 * ⚠️ **Niet alles mag hierin, en de grens is of de regels onderling
 *    uitwisselbaar zijn.** `chain_milestone` draagt een drempel en
 *    `season_recap` drie groepstotalen: twee zulke regels zijn verschillende
 *    feiten, en die op één hoop gooien is geen samenvatting maar verlies.
 *    `milestone_done` en `goal_completed` zijn per persoon een eigen prestatie —
 *    juist de berichten die je wél stuk voor stuk wilt zien. Wat overblijft zijn
 *    de drie die in een actieve groep in reeksen binnenkomen.
 */
const VOUWBAAR = ['member_joined', 'completion_pending', 'completion_approved'] as const;

type VouwbareGebeurtenis = (typeof VOUWBAAR)[number];

/**
 * Vanaf hoeveel gelijksoortige berichten er gevouwen wordt.
 *
 * Drie, zoals het issue voorstelt. Bij twee is de winst één regel en ben je de
 * namen kwijt uit hun eigen zin; vanaf drie wordt het een lijst.
 */
const DREMPEL = 3;

function isVouwbaar(event: string | null): event is VouwbareGebeurtenis {
  return event !== null && (VOUWBAAR as readonly string[]).includes(event);
}

/** Eén regel in de chatlijst: een gewoon bericht, of een samengevouwen reeks. */
export type ChatRegelItem =
  | { readonly soort: 'bericht'; readonly bericht: ChatBericht }
  | {
      readonly soort: 'gevouwen';
      /** Het id van het eerste bericht in de reeks — stabiel als sleutel. */
      readonly id: string;
      readonly system_event: VouwbareGebeurtenis;
      /** De personen over wie de reeks gaat, ontdubbeld en in volgorde. */
      readonly namen: readonly string[];
      /** Wie de weken bevestigde. Alleen bij `completion_approved`. */
      readonly actor: string | null;
      /** Hoeveel berichten er in deze regel zitten. */
      readonly aantal: number;
    };

/** De naam zoals hij getoond wordt, met de nette vervanging voor een weg account. */
function naam(waarde: string | null): string {
  const schoon = (waarde ?? '').trim();
  return schoon === '' ? t('algemeen.oud_lid') : schoon;
}

/**
 * "Anna, Bram en Chris".
 *
 * ⚠️ Het voegwoord komt uit de catalogus en staat niet in deze functie: "en" is
 *    "and" en straks iets anders, en een opsomming die in één taal klopt is geen
 *    opsomming maar een Nederlandse zin met gaten.
 */
export function voegNamenSamen(namen: readonly string[]): string {
  if (namen.length === 0) return '';
  if (namen.length === 1) return namen[0] as string;

  const laatste = namen[namen.length - 1] as string;
  const rest = namen.slice(0, -1).join(', ');
  return `${rest} ${t('algemeen.en')} ${laatste}`;
}

/** Kunnen deze twee berichten in dezelfde reeks? */
function hoortBijReeks(eerste: ChatBericht, volgende: ChatBericht, tz: TimeZone): boolean {
  if (eerste.system_event !== volgende.system_event) return false;

  if (dagVan(eerste, tz) !== dagVan(volgende, tz)) return false;

  // ⚠️ **`completion_approved` vouwt alleen binnen één bevestiger, en dat is
  //    geen detail.** Die zin noemt twee mensen: wie bevestigde en wiens week.
  //    Twee bevestigers in één regel zou de tweede naam moeten laten vallen, en
  //    dan verdwijnt er een positief signaal — precies wat deze regel niet mag
  //    doen. Met dezelfde actor blijft de zin volledig: "X bevestigde de weken
  //    van A, B en C."
  if (eerste.system_event === 'completion_approved') {
    return naam(eerste.actor_name) === naam(volgende.actor_name);
  }

  return true;
}

/**
 * De lokale dag van een bericht, in de tijdzone van de groep.
 *
 * ⚠️ **Via `shared/time` en niet met `toDateString()` of `getDate()`.** Dat is
 *    correctheidsregel 7, en het is hier geen formaliteit: de grens tussen twee
 *    dagen ligt in de tijdzone van de gróep, en een lezer die op reis is hoort
 *    dezelfde regels te zien als zijn groepsgenoten thuis.
 */
function dagVan(bericht: ChatBericht, tz: TimeZone): IsoDate {
  return localDateOf(bericht.created_at, tz);
}

/**
 * Vouwt reeksen van gelijksoortige systeemberichten samen.
 *
 * De volgorde blijft die van de invoer: er wordt alleen aaneengesloten gevouwen,
 * nooit over een mensbericht of een andere gebeurtenis heen. Een gesprek waarin
 * de regels van plaats wisselen, is erger dan een gesprek met te veel regels.
 */
export function vouwSysteemberichten(
  berichten: readonly ChatBericht[],
  tz: TimeZone,
): readonly ChatRegelItem[] {
  const uit: ChatRegelItem[] = [];
  let i = 0;

  while (i < berichten.length) {
    const bericht = berichten[i] as ChatBericht;

    if (!isSysteembericht(bericht) || !isVouwbaar(bericht.system_event)) {
      uit.push({ soort: 'bericht', bericht });
      i += 1;
      continue;
    }

    // ⚠️ **Geen aparte `isSysteembericht`-toets hier, en dat is gemeten.** Die
    //    stond er eerst wél, en het weghalen ervan maakte geen enkele test rood:
    //    `hoortBijReeks` vergelijkt `system_event`, en dat van een mensbericht is
    //    `null` — de reeks stopt er dus al. Een tweede slot dat nooit dichtvalt,
    //    leest als bescherming en is er geen; het volgende geval dat ernaast
    //    glipt, glipt er langs allebei.
    let eind = i + 1;
    while (
      eind < berichten.length &&
      hoortBijReeks(bericht, berichten[eind] as ChatBericht, tz)
    ) {
      eind += 1;
    }

    const reeks = berichten.slice(i, eind);

    if (reeks.length < DREMPEL) {
      for (const los of reeks) uit.push({ soort: 'bericht', bericht: los });
    } else {
      uit.push({
        soort: 'gevouwen',
        id: bericht.id,
        system_event: bericht.system_event,
        namen: [...new Set(reeks.map((r) => naam(r.subject_name)))],
        actor: bericht.system_event === 'completion_approved' ? naam(bericht.actor_name) : null,
        aantal: reeks.length,
      });
    }

    i = eind;
  }

  return uit;
}

/** De zin voor een samengevouwen regel. */
export function gevouwenTekst(regel: Extract<ChatRegelItem, { soort: 'gevouwen' }>): string {
  return t(`systeembericht.${regel.system_event}_gevouwen` as Sleutel, {
    namen: voegNamenSamen(regel.namen),
    actor: regel.actor ?? '',
  });
}
