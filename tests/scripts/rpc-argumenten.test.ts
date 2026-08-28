import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als de andere
//    scriptcontroles. TypeScript leest de JSDoc ernaast.
import {
  aanroepenIn,
  bovensteSleutels,
  controleer,
  overloadsUit,
  parameternamen,
} from '../../scripts/rpc-argumenten-controle.mjs';

/**
 * `rpc:controle` — stuurt elke `.rpc()` argumenten die bestaan?
 *
 * ⚠️ **Dit script bestaat omdat typecheck hier een gat heeft dat eruitziet als
 *    dekking.** Alle drie de vormen zijn op 28-08 los gemeten: een verkeerd type
 *    op een bestaande parameter wordt gevangen, een weggelaten verplichte
 *    parameter wordt gevangen, en een parameter die **niet bestaat** komt
 *    erdoor. Dat laatste is precies wat een hernoeming oplevert.
 *
 * ⚠️ **De eerste werkende versie van dit script meldde nul terwijl de fout er
 *    met de hand in gezet was.** `bovensteSleutels()` kreeg de accolades ván het
 *    argumentenblok mee binnen, stond dus meteen op diepte 1, en gaf voor élke
 *    aanroep een lege sleutellijst — en een lege lijst past in elke
 *    handtekening. Groen zonder iets te toetsen, in het script dat juist die
 *    klasse fout moet vangen. Gevonden door te vragen "vindt hij de fout van
 *    vandaag?" en niet door het te lezen.
 *
 * ⚠️ De helft "wat hij met rust moet laten" is hier even zwaar als de andere.
 *    De eerste meting gaf acht valse meldingen op `vraag_ai_job()`, allemaal
 *    sleutels uit het jsonb-object dat in `p_input` gaat.
 */

/** Een SQL-bestand zoals de controle het leest. */
function sql(...regels: readonly string[]) {
  return [{ pad: 'proef.sql', sql: regels.join('\n') }];
}

/** Een bronbestand zoals de controle het leest. */
function bron(...regels: readonly string[]) {
  return [{ pad: 'proef.ts', bron: regels.join('\n') }];
}

/** De meldingen over dit fragment, gegeven deze functies. */
function meldingen(sqlRegels: readonly string[], bronRegels: readonly string[]): readonly string[] {
  const overloads = overloadsUit(sql(...sqlRegels)) as Map<string, Map<number, string[]>>;
  return (
    controleer(overloads, bron(...bronRegels)) as { meldingen: string[] }
  ).meldingen;
}

describe('wat de controle moet vinden', () => {
  it('een parameter die niet bestaat', () => {
    // Precies de fout van 28-08: 0125 hernoemde `p_offset`, en één aanroeper
    // bleef hem sturen. Typecheck zweeg; PostgREST gaf `PGRST202`.
    const uit = meldingen(
      ['create function public.f(p_limit integer default 20, p_na_at timestamptz) returns void as $$ $$;'],
      ["await db.rpc('f', { p_limit: 50, p_offset: 0 });"],
    );

    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('p_offset');
  });

  it('een functie die helemaal niet bestaat', () => {
    expect(meldingen([], ["await db.rpc('bestaat_niet', { p_a: 1 });"])).toHaveLength(1);
  });

  it('een oude parameternaam nadat een migratie de functie heeft omgebouwd', () => {
    // ⚠️ **De drop moet meetellen, anders keurt de controle de kapotte aanroep
    //    goed.** Zonder de drop blijft de oude handtekening als geldige overload
    //    staan en past `p_offset` gewoon.
    const uit = meldingen(
      // ⚠️ **De nieuwe vorm heeft drie parameters en de oude twee, en dat is de
      //    hele fixture.** Met twee tegen twee overschrijft de tweede `create`
      //    de eerste toch al en doet de drop niets — dan blijft deze test groen
      //    als je het honoreren van drops weghaalt, en bewaakt hij niets. Dat
      //    stond hier eerst zo, en de mutatie liet het zien. Dit is bovendien de
      //    échte vorm van 0125.
      [
        'create function public.f(p_limit integer, p_offset integer) returns void as $$ $$;',
        'drop function if exists public.f(integer, integer);',
        'create function public.f(p_limit integer, p_na_at timestamptz, p_na_id uuid) returns void as $$ $$;',
      ],
      ["await db.rpc('f', { p_limit: 20, p_offset: 40 });"],
    );

    expect(uit).toHaveLength(1);
  });
});

describe('wat de controle met rust moet laten', () => {
  it('sleutels binnen een jsonb-argument', () => {
    // ⚠️ Acht valse meldingen bij de eerste meting, allemaal op `vraag_ai_job()`:
    //    `p_input` is één parameter van het type jsonb, en de aanroepers vullen
    //    daar een object in.
    expect(
      meldingen(
        ['create function public.f(p_kind text, p_input jsonb) returns void as $$ $$;'],
        ["await db.rpc('f', { p_kind: 'coach', p_input: { doel: 'x', vraag: 'y' } });"],
      ),
    ).toEqual([]);
  });

  it('een drop die bóven zijn create staat in hetzelfde bestand', () => {
    // ⚠️ **Gemeten en niet bedacht.** Zonder sortering op positie meldde de
    //    eerste versie zeventien functies als "onbekend", omdat de drop bovenaan
    //    een migratie ná de create eronder werd toegepast — en de functie dus
    //    verdween.
    expect(
      meldingen(
        [
          'drop function if exists public.f(integer);',
          'create function public.f(p_limit integer) returns void as $$ $$;',
        ],
        ["await db.rpc('f', { p_limit: 20 });"],
      ),
    ).toEqual([]);
  });

  it('een aanroep die op één van twee overloads past', () => {
    expect(
      meldingen(
        [
          'create function public.f(p_a uuid) returns void as $$ $$;',
          'create function public.f(p_a uuid, p_b date, p_c integer) returns void as $$ $$;',
        ],
        ["await db.rpc('f', { p_a: id, p_b: dag, p_c: 3 });"],
      ),
    ).toEqual([]);
  });

  it('een aanroep die maar een deel van de parameters stuurt', () => {
    // Alles met een `default` mag weg. Een ontbrekende verplíchte parameter
    // vangt typecheck al — dat is los gemeten en hoeft hier niet nog eens.
    expect(
      meldingen(
        ['create function public.f(p_a integer default 1, p_b integer default 2) returns void as $$ $$;'],
        ["await db.rpc('f', { p_b: 9 });"],
      ),
    ).toEqual([]);
  });

  it('een ternary en een string met een dubbele punt erin', () => {
    // ⚠️ Een dubbele punt is niet altijd een sleutel. Zonder de eis dat er een
    //    komma of het begin van het blok vóór staat, is `x ? a : b` er een en
    //    `'Europe/Amsterdam: nu'` ook.
    expect(
      meldingen(
        ['create function public.f(p_a text, p_b text) returns void as $$ $$;'],
        // ⚠️ **Identifiers in de ternary en niet twee stringliteralen.** Met
        //    `open ? 'ja' : 'nee'` slaat de quote-tak allebei de takken al over
        //    en raakt de fixture de komma-eis nooit — groen met of zonder die
        //    eis. Met `ja : nee` staat er een kale naam vóór een dubbele punt,
        //    en dát is wat er zonder de komma-eis als sleutel binnenkomt.
        ["await db.rpc('f', { p_a: open ? ja : nee, p_b: 'let op: dit telt niet' });"],
      ),
    ).toEqual([]);
  });
});

describe('de drie soorten aanroep worden apart geteld', () => {
  /**
   * ⚠️ **Dit is het getal dat mag liegen als je niet oplet.** Zes aanroepen geven
   *    hun argumenten via een variabele door, en met een regex zijn die niet te
   *    lezen. Zou het script ze als "gecontroleerd" meetellen, dan zegt de
   *    slotregel iets dat niet waar is — precies hoe de blinde vlek van
   *    `keten:controle` maandenlang onzichtbaar bleef.
   */
  it('telt een aanroep met een variabele als niet te lezen, niet als goedgekeurd', () => {
    const overloads = overloadsUit(sql('create function public.f(p_a integer) returns void as $$ $$;')) as Map<
      string,
      Map<number, string[]>
    >;
    const uit = controleer(overloads, bron("await db.rpc('f', argumenten);")) as {
      meldingen: string[];
      geteld: { inline: number; indirect: number; zonder: number };
    };

    expect(uit.meldingen).toEqual([]);
    expect(uit.geteld).toEqual({ inline: 0, indirect: 1, zonder: 0 });
  });

  it('telt een aanroep zonder argumenten apart', () => {
    const overloads = overloadsUit(sql('create function public.f() returns void as $$ $$;')) as Map<
      string,
      Map<number, string[]>
    >;
    const uit = controleer(overloads, bron("await db.rpc('f');")) as {
      geteld: { inline: number; indirect: number; zonder: number };
    };

    expect(uit.geteld).toEqual({ inline: 0, indirect: 0, zonder: 1 });
  });
});

describe('de onderdelen los', () => {
  it('leest parameternamen uit een create en typen uit een drop', () => {
    expect(parameternamen('p_limit integer default 20, p_na_at timestamptz default null')).toEqual([
      'p_limit',
      'p_na_at',
    ]);
    // Bij een drop staan er typen. Ze dienen alleen om het aantal te tellen —
    // dat is het enige dat beide vormen delen.
    expect(parameternamen('integer, timestamptz, uuid')).toHaveLength(3);
  });

  it('leest geen sleutels uit een genest object', () => {
    expect(bovensteSleutels("p_kind: 'coach', p_input: { doel: 'x' }")).toEqual([
      'p_kind',
      'p_input',
    ]);
  });

  it('vindt de regel waar een aanroep staat', () => {
    const gevonden = aanroepenIn(['', '', "  await db.rpc('f', { p_a: 1 });"].join('\n')) as {
      regel: number;
    }[];

    expect(gevonden[0]?.regel).toBe(3);
  });
});
