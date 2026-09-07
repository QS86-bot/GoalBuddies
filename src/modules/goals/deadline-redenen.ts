import { t } from '../../shared/i18n';

/**
 * Elk kenmerk dat de deadline-RPC's teruggeven, in gewone taal — QS8-311.
 *
 * ⚠️ **Waarom dit een eigen module is en niet in `deadline.ts` staat.** De
 *    grendel die deze tabellen bewaakt (`tests/rls/deadline-redenen.test.ts`)
 *    draait in Node tegen de lokale stack, en `deadline.ts` trekt via
 *    `lib/supabase` AsyncStorage en React Native mee. Zelfde reden waarom
 *    `bewijseis.test.ts` rechtstreeks uit `schemas.ts` leest.
 *
 * ⚠️ **Functies en geen constanten** — QS8-115. Een `const` met `t()` erin wordt
 *    één keer bij het importeren opgebouwd, en dat is vóórdat het profiel geladen
 *    is; de taal staat dan vast op de apparaattaal.
 *
 * ⚠️ **Eén lijst per functie, en de melding wordt eruit afgeleid.** Stonden de
 *    sleutels ergens apart voor de test, dan zijn het twee lijsten die het
 *    oneens kunnen worden — en dan bewaakt de bewaker iets anders dan de app
 *    gebruikt. Dat is de fout die dit bestand juist repareert.
 *
 * ⚠️ **Wat hier misging, en waarom er nu een grendel op staat.** 📏 Gemeten op
 *    07-09-2026 tegen de gedeployde functies: van de eenentwintig kenmerken die
 *    de drie RPC's teruggeven, hadden er acht geen melding. Twee daarvan waren
 *    erger dan de rest, want de zin die het uitlegde stónd er en was onbereikbaar:
 *
 *      * `beslis_deadline_verzoek()` geeft `not_yourself`, de tabel kende
 *        `own_request`. Wie zijn eigen verzoek probeerde goed te keuren las
 *        *"Beslissen lukte niet"* — een storingsmelding voor een regel.
 *      * De tabel kende `same_date`; die geeft de functie nergens.
 *
 *    Elk onderdeel klopte: de functie gaf netjes een kenmerk, de tabel had netjes
 *    een zin. De belofte brak op de naad ertussen, en die was onbewaakt —
 *    onwrikbare regel 18, vraag 1.
 */

export function vraagRedenen(): Readonly<Record<string, string>> {
  return {
    not_signed_in: t('doel.niet_ingelogd'),
    not_owner: t('doel.niet_van_jou'),
    not_member: t('deadline.geen_lid'),
    not_linked: t('deadline.niet_gekoppeld'),
    reason_too_short: t('deadline.argument_leeg'),
    reason_too_long: t('deadline.argument_lang'),
    already_open: t('deadline.al_open'),
    // ⚠️ QS8-309. Zonder deze regel valt hij op de algemene melding terug, en
    //    die zegt "het versturen lukte niet" — dat is precies de verkeerde
    //    uitleg: er is niets misgegaan, er is alleen niemand die ja kan zeggen.
    geen_beslisser: t('deadline.geen_beslisser'),
    // ⚠️ Deze stond er niet sinds 0170 hem toevoegde (QS8-293), dus een datum
    //    in het verleden las als een technische storing.
    datum_in_verleden: t('deadline.datum_in_verleden'),
    // ⚠️ QS8-311, en beide waren onbereikbaar: `bad_date` en `rate_limited`
    //    lazen als een storing terwijl er niets stuk was.
    bad_date: t('deadline.datum_onleesbaar'),
    rate_limited: t('deadline.te_veel_verzoeken'),
  };
}

/** Zie `vraagRedenen()`. */
export function beslisRedenen(): Readonly<Record<string, string>> {
  return {
    not_signed_in: t('doel.niet_ingelogd'),
    not_found: t('deadline.bestaat_niet'),
    already_decided: t('deadline.al_beslist'),
    // ⚠️ **Hier stond `own_request`, en dat kenmerk bestaat niet — QS8-311.** De
    //    functie geeft `not_yourself`, dus wie zijn eigen verzoek probeerde goed
    //    te keuren las *"Beslissen lukte niet"* — een storingsmelding voor een
    //    regel. En de zin die het wél uitlegde stond er, onbereikbaar, naast.
    //    Precies het geval dat `deadline-redenen.test.ts` sindsdien bewaakt.
    not_yourself: t('deadline.niet_zelf'),
    not_member: t('deadline.geen_lid'),
    note_too_long: t('deadline.argument_lang'),
    verzoek_verlopen: t('deadline.verzoek_verlopen'),
  };
}

/** Zie `vraagRedenen()`. */
export function intrekRedenen(): Readonly<Record<string, string>> {
  return {
    not_signed_in: t('doel.niet_ingelogd'),
    not_found: t('deadline.bestaat_niet'),
    not_yours: t('deadline.niet_van_jou'),
    already_decided: t('deadline.intussen_beslist'),
  };
}

/**
 * Zie `vraagRedenen()`. Deze hoort bij `zet_streefdatum()` — de ándere weg naar
 * een nieuwe streefdatum, en de andere helft van de doodlopende weg (QS8-311).
 *
 * ⚠️ **Hier stonden er drie van de zes**, en de drie die ontbraken waren juist de
 *    regels waar een gebruiker iets mee kan: `recent_ontkoppeld` is de zeven
 *    dagen van 0110 en las als *"de actie is mislukt"*.
 */
export function streefdatumRedenen(): Readonly<Record<string, string>> {
  return {
    not_signed_in: t('doel.niet_ingelogd'),
    not_owner: t('doel.niet_van_jou'),
    bad_date: t('doel.datum_ongeldig'),
    datum_in_verleden: t('deadline.datum_in_verleden'),
    needs_group_approval: t('doel.groepsakkoord_nodig'),
    // ⚠️ De uitkomst draagt ook `weer_toegestaan_op`, en die datum staat
    //    bewust níet in deze zin: de tabel krijgt alleen het kenmerk. Wie de
    //    datum wil tonen, geeft hem apart door — een tabel die een parameter
    //    nodig heeft, is geen tabel meer.
    recent_ontkoppeld: t('doel.recent_ontkoppeld'),
    // ⚠️ Sinds 0184 (QS8-317): een doel met een openstaande straf laat zijn
    //    deadline niet vooruit schuiven. Naar vóren halen mag wel, dus de zin
    //    zegt allebei — anders leest de gebruiker een verbod waar een grens
    //    staat.
    straf_staat_open: t('doel.straf_staat_open'),
  };
}
