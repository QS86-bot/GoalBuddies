/**
 * Wat een wachtwoordveld aan zijn invoer meegeeft — QS8-249.
 *
 * ⚠️ **Waarom dit een eigen functie is en niet drie regels in `Field.tsx`.** Er is
 *    geen renderer in dit project en geen enkele test in `app/`, dus een
 *    beslissing die in een component blijft zitten is niet te toetsen. Zelfde
 *    beweging als `routewacht.ts` en `aanmeldmodus.ts`.
 *
 * ⚠️ **En de beslissing die hier valt is stil als hij fout gaat.** Het
 *    aanmeldscherm zet `autoComplete` en `textContentType` per modus — bij
 *    inloggen `current-password`, bij aanmelden `new-password`. Zou het
 *    wachtwoordveld die overschrijven, dan biedt de wachtwoordmanager het
 *    verkeerde aan of niets. Er komt geen foutmelding en geen rode test van; je
 *    merkt het pas als je zelf inlogt en je opgeslagen wachtwoord niet krijgt
 *    aangeboden. Dat is precies de bug die QS8-248 net repareerde.
 */

/**
 * Het enige wat deze functie van de invoer hoeft te weten.
 *
 * ⚠️ **Bewust géén volledige beschrijving van een `TextInput`.** Zou hier
 *    `autoComplete?: string` staan, dan verbreedt dat het uniontype van React
 *    Native tot `string` en klapt de typecheck om — of erger, hij klapt níét om
 *    en dan is een typefout in `'current-passwrd'` opeens geldig. De functie is
 *    daarom generiek: wat er binnenkomt, komt er in dezelfde vorm weer uit.
 *
 * ⚠️ En de generieke parameter is `object` en niet dít type. Een interface met
 *    uitsluitend optionele velden is voor TypeScript een *weak type*: een object
 *    dat er niets mee deelt wordt dan afgewezen, en dat is precies elk gewoon
 *    veld in deze app.
 */
export interface Verbergbaar {
  readonly secureTextEntry?: boolean | undefined;
}

/**
 * De invoerprops van een veld, met de zichtbaarheid erin verwerkt.
 *
 * ⚠️ **De aanroeper wint, op één ding na.** Alles wat hij meegaf blijft staan —
 *    dat is de belofte hierboven. De uitzondering is `secureTextEntry`: dát is
 *    precies wat de knop bedient, en een veld dat "wachtwoord" heet en tóch open
 *    ligt omdat iemand er `secureTextEntry={false}` bij zette, is een lek dat
 *    niemand ziet.
 *
 * ⚠️ **Een gewoon veld wordt niet aangeraakt.** `wachtwoord` staat standaard uit;
 *    zonder die vlag komt er geen `secureTextEntry` bij en verandert er niets aan
 *    de tientallen velden die al bestaan.
 */
export function invoerProps<T extends object>({
  wachtwoord,
  zichtbaar,
  opgegeven,
}: {
  readonly wachtwoord: boolean;
  readonly zichtbaar: boolean;
  readonly opgegeven: T;
}): T & Verbergbaar {
  if (!wachtwoord) return opgegeven;
  return { ...opgegeven, secureTextEntry: !zichtbaar };
}

/**
 * Welke sleutel op de knop hoort, gegeven de stand.
 *
 * ⚠️ **Tekst en geen icoon.** Dit project heeft bewust geen icoonbibliotheek, en
 *    een oogje is bovendien dubbelzinnig: betekent het "hij staat aan" of "druk
 *    hier om te tonen"? Tekst schaalt mee met de systeemletter en een
 *    schermlezer leest hem meteen goed voor.
 */
export function knopSleutel(zichtbaar: boolean): 'veld.wachtwoord_verbergen' | 'veld.wachtwoord_tonen' {
  return zichtbaar ? 'veld.wachtwoord_verbergen' : 'veld.wachtwoord_tonen';
}
