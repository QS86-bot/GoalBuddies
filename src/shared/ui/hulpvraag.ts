/**
 * "Vraag je groep om hulp" — QS8-95, het scharnierpunt van EPIC 12.
 *
 * ⚠️ **Dit is een van de drie routes waarlangs tegenslag de groep bereikt, en
 *    alle drie lopen ze via de gebruiker zelf** (domeinregel 7). De andere twee
 *    zijn vraag 2 van de weekafsluiting en het verzoek om je streefdatum te
 *    verschuiven. Er is geen vierde, en dit bestand hoort er ook geen te worden:
 *    de tekst wordt vóór verzending getoond, is aanpasbaar, en gaat pas weg als
 *    de gebruiker op verzenden drukt.
 *
 * ⚠️ **Het bericht is een gewoon chatbericht, geen systeembericht.** Dat is een
 *    bewuste keuze en hij scheelt een migratie: de allowlist
 *    `chat_messages_system_event_bekend` hoeft er niet voor open, er komt geen
 *    negende gebeurtenistype bij, en reageren werkt vanzelf omdat het gewoon de
 *    chat is. Belangrijker nog: een systeembericht is iets dat de app zegt, en
 *    dit is iets dat de gebruiker zegt. Dat verschil ís de bescherming.
 *
 * ⚠️ De tekst noemt geen gemiste weken en geen reeks. "Ik loop achter op X" is
 *    wat de gebruiker deelt; hoevéél hij achterloopt en welke weken hij miste,
 *    blijft van hem. Zou de app dat invullen, dan lekt de Risico-radar alsnog de
 *    groep in — via een tekstveld in plaats van via een kolom.
 */

export const HULPVRAAG_MAX = 4000;

/**
 * Het voorstel dat in het tekstveld staat.
 *
 * De gebruiker kan het aanpassen; dit is een startpunt en geen sjabloon dat
 * verstuurd wordt. Vandaar dat het een hele zin is en geen invulformulier —
 * iets wat je kunt wegvegen leest prettiger dan iets wat je moet aanvullen.
 */
export function hulpvraagVoorstel(input: {
  readonly doeltitel: string;
  readonly wekenOver: number | null;
}): string {
  const { doeltitel, wekenOver } = input;

  const opening = `Ik loop achter op "${doeltitel}".`;

  // ⚠️ Alleen de tijd die nog rest, want dat is een feit over de toekomst. Geen
  //    "ik heb drie weken gemist" — dat is een feit over het verleden en het is
  //    precies wat domeinregel 7 uit de groep houdt, tenzij de gebruiker het er
  //    zelf bij typt. Dat mag; de app zet het er niet vast in.
  const tijd =
    wekenOver === null || wekenOver <= 0
      ? ''
      : ` Ik heb nog ${wekenOver} ${wekenOver === 1 ? 'week' : 'weken'} te gaan.`;

  return `${opening}${tijd} Iemand een idee?`;
}
