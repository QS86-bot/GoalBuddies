/**
 * Wat er van een **servermelding** overblijft als hij de deur uit gaat — QS8-319.
 *
 * ⚠️ **Waarom dit een eigen bestand is naast `scrub.test.ts` en
 *    `rapport.test.ts`.** Die twee toetsen de bezem en de bedrading. Dit bestand
 *    toetst de belofte waar de bezem principieel niet bij kan: een
 *    `%`-interpolatie is zonder het formaatsjabloon niet van de rest van de zin
 *    te onderscheiden, dus `scrubMessage()` kán `Europe/Bogus is geen bekende
 *    tijdzone` niet schonen. De belofte is daarom niet "de melding is geschoond"
 *    maar **"de melding van een serverfout gaat niet mee"**.
 *
 * ⚠️ **De ijkgevallen komen uit de migraties zelf en staan niet overgetypt in
 *    dit bestand.** Overgetypte vormen verouderen bij de eerstvolgende `raise`
 *    die iemand erbij zet, en dan bewaakt dit bestand een verzameling die niet
 *    meer bestaat. Vindt de scan er te weinig, dan faalt hij — een test met nul
 *    gevallen is groen zonder iets te beweren, en dat is vraag 3 van regel 18.
 *
 * ⚠️ **Beide aanroepers staan hieronder, en dat is met opzet.** `reportError()`
 *    (de app) en `meldEdgeFout()` (de jobs) delen sinds QS8-319 één
 *    `beschrijfFout()`, maar een test op alleen die functie zou groen blijven als
 *    één van de twee hem later langs een eigen weg omzeilt.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  AuthApiError,
  AuthError,
  AuthWeakPasswordError,
  FunctionsHttpError,
  PostgrestError,
  StorageApiError,
} from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

import { beschrijf, meldEdgeFout, type Verzending } from './edge-rapport';
import {
  foutcodeVan,
  isServerfout,
  reportError,
  SERVERMELDING_WEGGELATEN,
  setErrorSink,
  type ErrorEvent,
} from './index';

/** De naamvorm uit `scrub.ts`, hier alleen om te tónen dat een geval hem mist. */
const SERVERFOUTNAAM_MIST = /^(?!(?:Postgrest|Auth|Storage|Functions|Realtime)\w*Error$).*/;

const MIGRATIES = fileURLToPath(new URL('../../../supabase/migrations', import.meta.url));

/** De `raise`-regels met een `%` erin, zoals ze vandaag in de migraties staan. */
function raiseVormenMetInterpolatie(): readonly string[] {
  const vormen = new Set<string>();
  const patroon = /raise\s+(?:exception|warning)\s+'([^']*%[^']*)'/gi;

  for (const bestand of readdirSync(MIGRATIES).filter((n) => n.endsWith('.sql'))) {
    const sql = readFileSync(`${MIGRATIES}/${bestand}`, 'utf8');
    for (const [, vorm] of sql.matchAll(patroon)) if (vorm !== undefined) vormen.add(vorm);
  }

  return [...vormen];
}

/** De vorm met een waarde erin, zoals PL/pgSQL hem invult. */
function ingevuld(vorm: string, waarde: string): string {
  return vorm.replaceAll('%', waarde);
}

function vang(): ErrorEvent[] {
  const gebeurtenissen: ErrorEvent[] = [];
  setErrorSink({ capture: (e) => gebeurtenissen.push(e) });
  return gebeurtenissen;
}

/**
 * De vorm die PostgREST écht terugstuurt, **overgetypt uit een echte response**
 * van de lokale stack op 07-09-2026:
 *
 *     {"code":"42501","details":null,"hint":null,"message":"permission denied…"}
 *
 * ⚠️ **Twee dingen hieraan zijn geen detail.** (1) `details` en `hint` zijn
 *    `null` — 84 van de 87 `raise exception` in dit project zijn kaal, zonder
 *    `using detail` of `using hint`. (2) Het is **geen `Error`**: zonder
 *    `throwOnError()` — en dat staat nul keer in deze repo — geeft postgrest-js
 *    letterlijk `JSON.parse(body)` terug, dus zonder `name`, zonder `stack` en
 *    zonder marker.
 *
 *    Hier stond eerst een `new PostgrestError({message, details, hint, code})`
 *    met alle vier de velden gevuld. Die vorm ontstaat in deze app nergens, en
 *    de test toetste dus mijn aanname over de vorm in plaats van de vorm. Zelfde
 *    fout als de fixture van 28-08 die `Key (invite_code)=('zomer-2026')` mét
 *    aanhalingstekens schreef en daardoor groen was om de verkeerde reden.
 */
function postgrestAntwoord(melding: string, code = '23505'): Record<string, unknown> {
  return { code, details: null, hint: null, message: melding };
}

/** Dezelfde fout zoals hij eruitziet ná `throwOnError()`: wél een `Error`. */
function postgrestFout(melding: string, code = '23505'): PostgrestError {
  return new PostgrestError({ message: melding, details: '', hint: '', code });
}

afterEach(() => {
  setErrorSink(undefined);
});

describe('isServerfout', () => {
  it('herkent de échte foutklassen van Supabase', () => {
    // ⚠️ De echte klassen uit de geïnstalleerde pakketten, niet nagebouwd. Een
    //    nagebouwd object toetst of mijn aanname over de vorm klopt; dit toetst
    //    de vorm.
    expect(isServerfout(postgrestFout('x'))).toBe(true);
    expect(isServerfout(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')))
      .toBe(true);
    // ⚠️ Vijf argumenten, want zo vult de bibliotheek hem: `statusCode` is de
    //    HTTP-code als string en `code` de dienstcode (`NoSuchKey`). Met drie
    //    argumenten belandt `NoSuchKey` in `statusCode`, en dan toetst de test
    //    een verdeling die niet bestaat.
    expect(isServerfout(new StorageApiError('Object not found', 404, '404', 'storage', 'NoSuchKey')))
      .toBe(true);
    expect(isServerfout(new AuthWeakPasswordError('Password is too weak', 422, ['length'])))
      .toBe(true);
  });

  it('laat een gewone fout met rust, want anders is er niets meer te lezen', () => {
    expect(isServerfout(new Error('Onvolledige rij uit goal_dashboard'))).toBe(false);
    expect(isServerfout('een string')).toBe(false);
    expect(isServerfout(null)).toBe(false);
    expect(isServerfout(undefined)).toBe(false);
    // Alleen een `code` is niet de PostgREST-vorm; die vraagt ook `details` en
    // `hint`. Anders valt elke eigen fout met een code er stil onder.
    expect(isServerfout({ code: 'iets' })).toBe(false);
  });

  /**
   * ⚠️ **Drie herkenningen, en hieronder staat per stuk het geval dat álleen
   *    die vindt.** Voor élke klasse die de bibliotheken vandaag hebben, slaan
   *    de marker en de naamvorm allebei aan — dus een ijking met een gewone
   *    `AuthApiError` zegt niets over welke van de twee het werk doet, en de
   *    andere zou stil verwijderd kunnen worden. Zelfde vorm als een grendel
   *    die door een eerdere grendel wordt afgevangen.
   */
  it('vindt via de marker een subklasse die zich buiten de naamvorm hernoemt', () => {
    // ⚠️ De échte basisklasse, met een naam die de vorm mist — precies het
    //    geval waarvoor de marker er staat. Auth-js hernoemt zijn subklassen
    //    zelf (`AuthApiError`, `AuthWeakPasswordError`), dus dit is geen
    //    bedacht risico.
    class Netwerkstoring extends AuthError {}
    const fout = new Netwerkstoring('x', 503, 'over_capacity');
    fout.name = 'Netwerkstoring';

    expect(SERVERFOUTNAAM_MIST.test(fout.name)).toBe(true);
    expect(isServerfout(fout)).toBe(true);
  });

  it('vindt via de naamvorm een klasse zónder marker en zonder PostgREST-vorm', () => {
    const fout = new FunctionsHttpError({ status: 500 } as unknown as Response);

    expect((fout as unknown as Record<string, unknown>)['__isAuthError']).toBeUndefined();
    expect((fout as unknown as Record<string, unknown>)['details']).toBeUndefined();
    expect(isServerfout(fout)).toBe(true);
  });

  it('vindt via de PostgREST-vorm het kale antwoord met lege details en hint', () => {
    // ⚠️ **De vorm die deze app dagelijks krijgt**, niet een nagebouwde: geen
    //    `Error`, geen `name`, en `details` en `hint` op `null`. Een toets die
    //    drie strings eist, slaat hier níét aan — en dat was de eerste versie.
    expect(isServerfout(postgrestAntwoord('permission denied for table goals', '42501')))
      .toBe(true);
  });

  it('vindt ook de netwerkfoutvorm van postgrest-js, die een lege code draagt', () => {
    const netwerk = {
      message: 'AbortError: The operation was aborted',
      details: 'Request timed out',
      hint: '',
      code: '',
    };

    expect(isServerfout(netwerk)).toBe(true);
    // Een lege code is geen code — anders is `Servermelding weggelaten ()` het
    // resultaat, en dat is een veld dat doet alsof het iets zegt.
    expect(foutcodeVan(netwerk)).toBeUndefined();
  });
});

describe('de %-vormen uit onze eigen migraties', () => {
  const vormen = raiseVormenMetInterpolatie();

  it('vindt de vormen die dit issue heeft gemeten', () => {
    // 📏 22 op 07-09-2026. Deze ondergrens is er zodat de gevallen hieronder
    //    niet stilletjes op nul kunnen uitkomen — een lus over een lege lijst is
    //    groen en bewaakt niets.
    expect(vormen.length).toBeGreaterThanOrEqual(22);
    expect(vormen).toContain('% is geen bekende tijdzone');
  });

  it.each(vormen)('laat de waarde uit `%s` niet de deur uit', (vorm) => {
    const gebeurtenissen = vang();
    const waarde = 'Europe/Lek_Deze_Waarde_Niet';

    // ⚠️ **Beide vormen waarin deze fout de app bereikt, en niet alleen de
    //    nette.** Zonder `throwOnError()` — nul keer in deze repo — is het een
    //    kaal object met `details` en `hint` op `null`; mét is het een
    //    `PostgrestError`. De eerste versie van deze test voerde alleen de
    //    tweede, en die kwam er als enige doorheen.
    reportError(postgrestAntwoord(ingevuld(vorm, waarde)), 'kaal');
    reportError(postgrestFout(ingevuld(vorm, waarde)), 'error');

    expect(JSON.stringify(gebeurtenissen)).not.toContain(waarde);
    expect(gebeurtenissen[0]?.message).toContain(SERVERMELDING_WEGGELATEN);
    expect(gebeurtenissen[1]?.message).toContain(SERVERMELDING_WEGGELATEN);
  });

  it.each(vormen)('laat de waarde uit `%s` ook niet via de Edge Function uitgaan', async (vorm) => {
    const waarde = 'Europe/Lek_Deze_Waarde_Niet';
    let body = '';

    const vervoer = async (verzending: Verzending): Promise<number> => {
      body = verzending.body;
      return 200;
    };

    const uitkomst = await meldEdgeFout(postgrestAntwoord(ingevuld(vorm, waarde)), 'rollover', {
      dsn: 'https://sleutel@ingest.example.com/42',
      nu: new Date('2026-09-07T12:00:00.000Z'),
      id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      vervoer,
    });

    expect(uitkomst).toBe('verstuurd');
    expect(body).not.toContain(waarde);
  });
});

describe('reportError met een echte serverfout', () => {
  it('laat de waarde ook niet via de stack ontsnappen', () => {
    const gebeurtenissen = vang();
    const waarde = 'Europe/Lek_Deze_Waarde_Niet';
    const fout = postgrestFout(`${waarde} is geen bekende tijdzone`);

    // ⚠️ Een échte stack, want de kop daarvan ís de melding. Zonder deze regel
    //    toetst de test een fout zonder stack, en dat was precies het lek van
    //    24-08.
    fout.stack = `PostgrestError: ${waarde} is geen bekende tijdzone\n    at ergens (api.ts:1:1)`;

    reportError(fout, 'rollover.tijdzone');

    expect(gebeurtenissen[0]?.stack).toBeDefined();
    expect(JSON.stringify(gebeurtenissen)).not.toContain(waarde);
    expect(gebeurtenissen[0]?.stack).toContain('at ergens (api.ts:1:1)');
  });

  it('houdt de foutcode, want zonder iets is een gebeurtenis niet te plaatsen', () => {
    const gebeurtenissen = vang();

    reportError(postgrestFout('Weekdoel abc bestaat niet', '23505'), 'weekly.save');

    expect(gebeurtenissen[0]?.message).toBe(`${SERVERMELDING_WEGGELATEN} (23505)`);
    expect(gebeurtenissen[0]?.name).toBe('PostgrestError');
    expect(gebeurtenissen[0]?.where).toBe('weekly.save');
  });

  it('houdt ook de symboolcode van auth en storage', () => {
    const gebeurtenissen = vang();

    reportError(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'), 'auth');
    reportError(
      new StorageApiError('Object not found', 404, '404', 'storage', 'NoSuchKey'),
      'avatar',
    );

    expect(gebeurtenissen[0]?.message).toBe(`${SERVERMELDING_WEGGELATEN} (invalid_credentials)`);
    // ⚠️ `NoSuchKey` staat in `code`, niet in `statusCode` — daar zet de
    //    bibliotheek de HTTP-code als string neer. Deze fixture geeft alle vijf
    //    de argumenten mee, precies zoals storage-js hem zelf vult.
    expect(gebeurtenissen[1]?.message).toBe(`${SERVERMELDING_WEGGELATEN} (NoSuchKey)`);
  });

  it('geeft het kale antwoord een zin en een code, en niet `[object Object]`', () => {
    // ⚠️ **De tegenhanger van de lektest, en net zo belangrijk.** Voordat de
    //    vormherkenning op sleutelaanwezigheid ging, viel dit object door naar
    //    `scrubMessage(String(fout))` — dat lekt niets, maar levert letterlijk
    //    `[object Object]` op: een gebeurtenis zonder melding én zonder code,
    //    en dus niet te plaatsen. Een grens die dicht faalt is goed; een grens
    //    die niet aangaat en er wél zo uitziet, is de gevaarlijkste soort.
    const gebeurtenissen = vang();

    reportError(postgrestAntwoord('Europe/Bogus is geen bekende tijdzone', '22023'), 'rollover.tz');

    expect(gebeurtenissen[0]?.message).toBe(`${SERVERMELDING_WEGGELATEN} (22023)`);
  });

  it('knipt een meerregelige melding uit de stack en laat regel twee niet staan', () => {
    // ⚠️ **Het lek van 24-08 in een nieuwe jas.** De kop van een stack wordt
    //    opnieuw opgebouwd, maar het frame-filter kijkt per regel: een tweede
    //    meldingsregel die met `at ` begint, leest als frame. Een notitie met
    //    "ik werk\nat home met …" erin komt zo alsnog mee — óók als de melding
    //    zelf onderdrukt is, want die tweede regel is dan al aan de kop
    //    ontsnapt.
    const gebeurtenissen = vang();
    const melding = 'Weekdoel ongeldig: ik werk\nat home met Sanne Jansen';
    const fout = postgrestFout(melding);
    fout.stack = `PostgrestError: ${melding}\n    at fn (api.ts:1:1)`;

    reportError(fout, 'weekly.save');

    expect(gebeurtenissen[0]?.stack).not.toContain('Sanne Jansen');
    expect(gebeurtenissen[0]?.stack).toContain('at fn (api.ts:1:1)');
  });

  it('laat een handgeschreven melding staan, want alles wegpoetsen is geen oplossing', () => {
    // ⚠️ **De kostenkant, en die hoort onder test.** Zonder deze test is een
    //    schoonmaak die élke melding vervangt ook groen, en dan is er van een
    //    foutrapport niets meer over. 📏 13 van de 160 aanroepen geven een
    //    handgeschreven `Error` door; dit is wat die overhouden.
    const gebeurtenissen = vang();

    reportError(new Error('Onvolledige rij uit goal_dashboard'), 'goals.parse');

    expect(gebeurtenissen[0]?.message).toBe('Onvolledige rij uit goal_dashboard');
  });
});

describe('foutcodeVan', () => {
  it('laat een code door die als code leest', () => {
    expect(foutcodeVan(postgrestFout('x', '23505'))).toBe('23505');
    expect(foutcodeVan(postgrestFout('x', 'PGRST202'))).toBe('PGRST202');
    expect(foutcodeVan(new AuthApiError('x', 400, 'invalid_credentials')))
      .toBe('invalid_credentials');
  });

  it('weigert alles wat geen code is, ook al zou de bezem het doorlaten', () => {
    // ⚠️ Dezelfde grens als bij de `sqlstate`-sleutel: een veld dat als
    //    vervanging van een lek is ingevoerd, mag niet het volgende lek zijn.
    expect(foutcodeVan(postgrestFout('x', 'Europe/Bogus is geen bekende tijdzone')))
      .toBeUndefined();
    expect(foutcodeVan(postgrestFout('x', 'sanne@voorbeeld.nl'))).toBeUndefined();
    expect(foutcodeVan(postgrestFout('x', ''))).toBeUndefined();
    expect(foutcodeVan(new Error('x'))).toBeUndefined();
  });
});

describe('beschrijf in de Edge Functions', () => {
  it('gebruikt dezelfde grens als de app', () => {
    // ⚠️ De naad tussen de twee aanroepers. Zou `beschrijf()` ooit weer zijn
    //    eigen afweging krijgen, dan valt deze om — en dat is precies waarvoor
    //    hij er staat.
    const uit = beschrijf(postgrestFout('Te veel avatars voor deze gebruiker (12).'), {});

    expect(uit.melding).toBe(`${SERVERMELDING_WEGGELATEN} (23505)`);
    expect(JSON.stringify(uit)).not.toContain('12');
  });
});
