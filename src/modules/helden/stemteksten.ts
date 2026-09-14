import type { Taal } from '../../shared/i18n/types';

import { type Heldsleutel } from './helden';

/**
 * Wat een held zegt — QS8-475, epic QS8-468.
 *
 * ⚠️⚠️ **De feitzin blijft van de melding, de slotregel is van de held.** Het
 *    issue zegt *"dezelfde berichten, andere stem"*, en dat is letterlijk wat
 *    hier gebeurt: `berichtVoor()` in `regels.ts` levert nog steeds "Er staat
 *    nog een weekdoel open", en de held zet er zijn eigen zin achter. De
 *    gebeurtenis is een eigenschap van de melding; de stem is een eigenschap van
 *    de held. Twee dingen, twee plekken.
 *
 *    ⚠️ De vorm die hier níet gekozen is: een volledige hertaling van elke
 *       meldingstekst per held. Dat zijn zes soorten maal zes helden maal twee
 *       talen — tweeënzeventig teksten die allemaal hetzelfde feit moeten
 *       blijven melden. Eén ervan die afdrijft is een melding die iets anders
 *       zegt dan wat er gebeurd is, en niets zou dat rood maken.
 *
 * ⚠️ **Dit bestand gaat mee naar Deno** (`edge:sync`), want de meldingenjob
 *    stelt het bericht samen. Vandaar dat het alleen `helden.ts` en de
 *    taal-typen aanraakt, allebei importvrije bestanden.
 *
 * ⚠️ **De teksten zijn geschreven naar `held.<x>.persoonlijkheid` in de
 *    catalogus.** Strix zegt niets aanmoedigends, Ignis niets zachts, Quip
 *    maakt het doel niet belachelijk. Wijzigt een persoonlijkheid, dan hoort
 *    deze regel mee te wijzigen — `stemteksten.test.ts` kan dat niet toetsen,
 *    en dat is handwerk dat handwerk blijft.
 */

/**
 * Het soort moment waarop een held spreekt.
 *
 * ⚠️ **Drie en niet zes, en dat is een keuze met een reden.** Er zijn zes
 *    meldingsteksten, maar ze vallen in drie soorten momenten: er staat nog iets
 *    open, er is iets goed gegaan, of er wordt iets van je gevraagd. Een held
 *    klinkt binnen zo'n moment hetzelfde — het verschil tussen "je week is
 *    bevestigd" en "je week is afgelopen" zit in de feitzin en niet in de stem.
 *
 *    Eén regel per held zou wél te weinig zijn: dezelfde zin onder een
 *    felicitatie en onder een herinnering leest als een sjabloon, en dat is
 *    precies het tegenovergestelde van een stem.
 */
export type Stemmoment =
  /** Er staat nog iets open. */
  | 'aansporing'
  /** Er is iets goed gegaan. */
  | 'erkenning'
  /** Er wordt iets van je gevraagd. */
  | 'gevraagd';

export const STEMMOMENTEN: readonly Stemmoment[] = ['aansporing', 'erkenning', 'gevraagd'] as const;

const REGELS: Readonly<Record<Taal, Readonly<Record<Heldsleutel, Readonly<Record<Stemmoment, string>>>>>> = {
  nl: {
    strix: {
      aansporing: 'Wat je vandaag doet, kiest wie je volgende week bent.',
      erkenning: 'Je hebt gedaan wat je zei. Dat is zeldzamer dan het klinkt.',
      gevraagd: 'Iemand wacht op jouw oordeel. Neem er even de tijd voor.',
    },
    ignis: {
      aansporing: 'Nog niet klaar. Kom op.',
      erkenning: 'Gewonnen. Volgende.',
      gevraagd: 'Iemand rekent op je. Ga staan.',
    },
    meridian: {
      aansporing: 'Eén stap en je bent al onderweg. Ik wacht aan de overkant.',
      erkenning: 'Mooi. En nu: wat ligt er hierna?',
      gevraagd: 'Er ligt iets voor je klaar. Kijk even.',
    },
    forge: {
      aansporing: 'Wat is het kleinste stuk dat je nu wél af krijgt?',
      erkenning: 'Het systeem werkt. Laat het zo staan.',
      gevraagd: 'Er ligt een beslissing bij jou. Lees hem rustig door.',
    },
    lucerna: {
      aansporing: 'Geen haast. Maar wel vandaag nog iets kleins.',
      erkenning: 'Dat heb je zelf gedaan. Gun jezelf dat even.',
      gevraagd: 'Iemand heeft je nodig. Dat is een mooi soort werk.',
    },
    quip: {
      aansporing: 'Je doel staat er nog. Het heeft geduld, maar niet oneindig veel.',
      erkenning: 'Kijk aan. Doe maar even alsof je verbaasd bent.',
      gevraagd: 'Er wacht iemand. Geen druk. Nou ja, een beetje.',
    },
  },
  en: {
    strix: {
      aansporing: 'What you do today picks who you are next week.',
      erkenning: 'You did what you said you would. That is rarer than it sounds.',
      gevraagd: 'Someone is waiting on your call. Take a moment for it.',
    },
    ignis: {
      aansporing: 'Not done yet. Come on.',
      erkenning: 'Won. Next.',
      gevraagd: 'Someone is counting on you. Stand up.',
    },
    meridian: {
      aansporing: 'One step and you are already moving. I will be on the other side.',
      erkenning: 'Good. Now: what is next?',
      gevraagd: 'Something is waiting for you. Go take a look.',
    },
    forge: {
      aansporing: 'What is the smallest piece you can actually finish now?',
      erkenning: 'The system works. Leave it standing.',
      gevraagd: 'A decision is sitting with you. Read it through calmly.',
    },
    lucerna: {
      aansporing: 'No rush. But something small today.',
      erkenning: 'You did that yourself. Take a second for it.',
      gevraagd: 'Someone needs you. That is a good kind of work.',
    },
    quip: {
      aansporing: 'Your goal is still there. It is patient, but not infinitely so.',
      erkenning: 'Well, look at that. Feel free to act surprised.',
      gevraagd: 'Someone is waiting. No pressure. All right, a little.',
    },
  },
};

/**
 * De slotregel van deze held op dit moment.
 *
 * ⚠️ Valt terug op Nederlands bij een onbekende of ontbrekende taal, net als
 *    `kies()` in `regels.ts`. Een lege regel zou een bericht opleveren dat
 *    halverwege ophoudt.
 */
export function heldregel(held: Heldsleutel, moment: Stemmoment, taal?: Taal | null): string {
  const catalogus = taal === 'en' ? REGELS.en : REGELS.nl;
  return catalogus[held][moment];
}
