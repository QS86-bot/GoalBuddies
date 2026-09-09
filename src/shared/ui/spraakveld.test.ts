import { describe, expect, it } from 'vitest';

import {
  magSpraak,
  microfoonSleutel,
  spraakBeschikbaar,
  spraakfoutSleutel,
  spraakTaalTag,
  voegAan,
} from './spraakveld';

/**
 * IJking van de microfoon bij een tekstveld — QS8-250.
 *
 * ⚠️ **Waarom pure functies en geen render.** Er is geen renderer in dit project
 *    en geen enkele test in `app/`. Zolang deze beslissingen in `Field.tsx`
 *    blijven zitten, zijn ze niet te toetsen — zelfde beweging als
 *    `wachtwoordveld.ts`.
 *
 * ⚠️ **De belofte is niet "er staat een knop".** Die is triviaal. Er zijn er
 *    vier, en de laatste twee zijn de stille:
 *
 *    1. *Op een browser zonder herkenner staat er niets* — een knop die niets
 *       doet is erger dan geen knop.
 *    2. *Een wachtwoord-, e-mail- of getalveld krijgt er geen.*
 *    3. *Inspreken vult aan en overschrijft niet.* Wie halverwege een zin de
 *       microfoon pakt, hoort zijn eerste helft terug te zien — en daar komt
 *       geen foutmelding van als het misgaat, alleen weggevallen tekst.
 *    4. *Elke foutcode krijgt een zin, behalve de code die de gebruiker zelf
 *       veroorzaakte.* Zwijgen bij een geweigerde microfoon betekent dat iemand
 *       naar een knop zit te kijken die niets deed.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel:
 *
 *   A  `platform !== 'web'` eruit                          → 2 rood
 *   B  `webkitSpeechRecognition` uit de or                 → 1 rood
 *   C  de `wachtwoord`-tak uit `magSpraak`                 → 2 rood
 *   D  `GESLOTEN_INPUTMODE` leegmaken                      → 5 rood
 *   E  `GESLOTEN_KEYBOARDTYPE` leegmaken                   → 5 rood
 *   F  `GESLOTEN_AUTOCOMPLETE` leegmaken                   → 5 rood
 *   G  de `onChangeText`-tak eruit                         → 1 rood
 *   H  `voegAan` laten teruggeven `nieuw` (overschrijven)  → 5 rood
 *   I  de witruimte-tak uit `voegAan`                      → 2 rood
 *   J  `spraakfoutSleutel` de geweigerd-tak eruit          → 2 rood
 *   K  `aborted` óók een zin geven                         → 1 rood
 *   L  `spraakTaalTag` altijd `'nl-NL'`                    → 1 rood
 *   M  `microfoonSleutel` altijd dezelfde sleutel          → 1 rood
 *
 * ⚠️ **Elke mutatie is apart gedraaid en apart teruggezet** — niet één mutatie
 *    voor de hele module. Een ijking die zijn geval door een pad voert dat een
 *    eerdere grendel al afvangt, bewaakt niets van wat hij belooft.
 */

const CHROME = { webkitSpeechRecognition: function Herkenner() {} };
const MODERN = { SpeechRecognition: function Herkenner() {} };
const FIREFOX = {};

/** Een veld dat er wél een hoort te krijgen. De must-allow-kant. */
const VRIJE_TEKST = { onChangeText: () => {} };

describe('spraakBeschikbaar', () => {
  /** ⚠️ Grendel 1: geen knop die niets doet. */
  it('zwijgt op een browser zonder herkenner', () => {
    expect(spraakBeschikbaar('web', FIREFOX)).toBe(false);
  });

  it('herkent de ongeprefixte API', () => {
    expect(spraakBeschikbaar('web', MODERN)).toBe(true);
  });

  /**
   * ⚠️ **De prefix is geen legacy-detail.** Chrome en Edge leveren de API nog
   *    steeds alléén onder `webkit`. Wie die tak weghaalt, laat de knop nergens
   *    verschijnen — en geen enkele andere test merkt dat.
   */
  it('herkent de webkit-prefix, die Chrome en Edge vandaag nog gebruiken', () => {
    expect(spraakBeschikbaar('web', CHROME)).toBe(true);
  });

  /**
   * ⚠️ **Grendel 1b: op native staat er niets**, en dat is een besluit. Het
   *    systeemtoetsenbord heeft daar al een dicteerknop; zelf een herkenner
   *    inbouwen kost een dependency en een microfoontoestemming voor iets dat er
   *    al staat.
   */
  it.each(['ios', 'android'])('zwijgt op %s, waar het toetsenbord het al doet', (os) => {
    expect(spraakBeschikbaar(os, CHROME)).toBe(false);
  });

  it('valt dicht zonder venster', () => {
    expect(spraakBeschikbaar('web', null)).toBe(false);
    expect(spraakBeschikbaar('web', undefined)).toBe(false);
  });
});

describe('magSpraak', () => {
  /** ⚠️ De must-allow-kant: veertig velden in deze app zijn gewone vrije tekst. */
  it('geeft een gewoon tekstveld een microfoon', () => {
    expect(magSpraak(VRIJE_TEKST)).toBe(true);
  });

  it('geeft een meerregelig veld er een — daar levert het het meeste op', () => {
    expect(magSpraak({ ...VRIJE_TEKST, multiline: true } as never)).toBe(true);
  });

  /** ⚠️ Grendel 2, en de ergste als hij wegvalt. */
  it('houdt een wachtwoordveld dicht', () => {
    expect(magSpraak({ ...VRIJE_TEKST, wachtwoord: true })).toBe(false);
  });

  /**
   * ⚠️ **Óók zonder de vlag.** Een veld dat `autoComplete="new-password"` draagt
   *    zonder `wachtwoord` is een wachtwoordveld dat iemand vergeten is te
   *    markeren, en dat is precies het geval waarin een microfoon het ergst is.
   */
  it('houdt een wachtwoordveld dicht dat alleen aan zijn autoComplete te herkennen is', () => {
    expect(magSpraak({ ...VRIJE_TEKST, autoComplete: 'new-password' })).toBe(false);
  });

  it('houdt een veld met secureTextEntry dicht', () => {
    expect(magSpraak({ ...VRIJE_TEKST, secureTextEntry: true })).toBe(false);
  });

  it.each(['numeric', 'decimal', 'tel', 'email', 'url'])('sluit inputMode=%s uit', (inputMode) => {
    expect(magSpraak({ ...VRIJE_TEKST, inputMode })).toBe(false);
  });

  it.each(['email-address', 'numeric', 'number-pad', 'decimal-pad', 'phone-pad'])(
    'sluit keyboardType=%s uit',
    (keyboardType) => {
      expect(magSpraak({ ...VRIJE_TEKST, keyboardType })).toBe(false);
    },
  );

  it.each(['email', 'tel', 'one-time-code', 'postal-code'])('sluit autoComplete=%s uit', (autoComplete) => {
    expect(magSpraak({ ...VRIJE_TEKST, autoComplete })).toBe(false);
  });

  /** ⚠️ `search` is vrije tekst op een ander toetsenbord, en hoort er wél een te krijgen. */
  it('laat een zoekveld met rust — dat is vrije tekst', () => {
    expect(magSpraak({ ...VRIJE_TEKST, inputMode: 'search' })).toBe(true);
  });

  /**
   * ⚠️ **Grendel 3: zonder schrijfweg geen knop.** Inspreken vult aan, en
   *    aanvullen kan alleen langs `onChangeText`. Een knop zonder die weg zou
   *    luisteren en de tekst weggooien — zonder foutmelding.
   */
  it('zwijgt bij een veld zonder onChangeText', () => {
    expect(magSpraak({})).toBe(false);
  });

  it('zwijgt bij een veld dat niet te bewerken is', () => {
    expect(magSpraak({ ...VRIJE_TEKST, editable: false })).toBe(false);
  });
});

describe('voegAan', () => {
  /** ⚠️ Grendel 4, en de duurste: dit is de tak die tekst kan wegvegen. */
  it('plakt de herkende tekst achter wat er al stond', () => {
    expect(voegAan('Ik ga', 'drie keer hardlopen')).toBe('Ik ga drie keer hardlopen');
  });

  it('overschrijft een gevuld veld nooit', () => {
    expect(voegAan('Eerste helft', 'tweede helft')).toContain('Eerste helft');
  });

  it('zet niets voor de eerste zin', () => {
    expect(voegAan('', 'Hallo')).toBe('Hallo');
  });

  /** ⚠️ De witruimte die de gebruiker zelf zette, blijft van hem. */
  it('respecteert een nieuwe regel die er al stond', () => {
    expect(voegAan('Vraag een:\n', 'het ging goed')).toBe('Vraag een:\nhet ging goed');
  });

  it('verdubbelt een spatie niet', () => {
    expect(voegAan('Ik ga ', 'hardlopen')).toBe('Ik ga hardlopen');
  });

  it('laat het veld met rust als er niets verstaan is', () => {
    expect(voegAan('Blijft staan', '   ')).toBe('Blijft staan');
  });

  /**
   * ⚠️ **De emoji-regel.** Gebruikers mogen ze overal typen en de herkenner
   *    voegt er zelf soms een toe. Snijden op een UTF-16-grens rendert als een
   *    vervangingsteken; `trim` en `endsWith` raken geen codepunt.
   */
  it('laat een samengestelde emoji heel', () => {
    const uit = voegAan('Klaar 👨‍👩‍👧‍👦', 'en tevreden');
    expect(uit).toBe('Klaar 👨‍👩‍👧‍👦 en tevreden');
    expect(uit).not.toContain('�');
  });
});

describe('spraakTaalTag', () => {
  it('herkent Nederlands als de app Nederlands praat', () => {
    expect(spraakTaalTag('nl')).toBe('nl-NL');
  });

  it('herkent Engels als de app Engels praat', () => {
    expect(spraakTaalTag('en')).toBe('en-US');
  });

  it('valt terug op de standaardtaal bij iets onbekends', () => {
    expect(spraakTaalTag('kl')).toBe('nl-NL');
  });
});

describe('spraakfoutSleutel', () => {
  /**
   * ⚠️ **Grendel 5: geen stilte.** De acceptatie vraagt er met zoveel woorden
   *    om, en onwrikbare regel 16 ook.
   */
  it.each([
    ['not-allowed', 'spraak.fout_geweigerd'],
    ['service-not-allowed', 'spraak.fout_geweigerd'],
    ['network', 'spraak.fout_verbinding'],
    ['no-speech', 'spraak.fout_niets_verstaan'],
    ['audio-capture', 'spraak.fout_niets_verstaan'],
  ])('geeft bij %s de melding %s', (code, sleutel) => {
    expect(spraakfoutSleutel(code)).toBe(sleutel);
  });

  /**
   * ⚠️ **Een onbekende code zwijgt niet.** Dat is de tak die het makkelijkst
   *    verkeerd gaat: `null` teruggeven bij iets wat we niet kennen laat de
   *    gebruiker naar een knop kijken die niets deed.
   */
  it('geeft een onbekende code de algemene melding', () => {
    expect(spraakfoutSleutel('iets-nieuws-uit-chrome-2027')).toBe('spraak.fout_algemeen');
  });

  /**
   * ⚠️ **De enige stille tak, en die is met opzet stil.** `aborted` komt binnen
   *    als de gebruiker zélf stopt. Een melding daarop is ruis: hij weet wat hij
   *    deed.
   */
  it('zwijgt als de gebruiker zelf stopte', () => {
    expect(spraakfoutSleutel('aborted')).toBeNull();
  });
});

describe('microfoonSleutel', () => {
  it('biedt aan te starten zolang hij stil is', () => {
    expect(microfoonSleutel(false)).toBe('spraak.starten');
  });

  it('biedt aan te stoppen zodra hij luistert', () => {
    expect(microfoonSleutel(true)).toBe('spraak.stoppen');
  });
});
