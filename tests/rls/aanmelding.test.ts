/**
 * Wat er van een aanmelding een profiel maakt — QS8-197, migratie 0154.
 *
 * `handle_new_user()` draait **ín de transactie** van de `auth.users`-insert.
 * Faalt hij, dan rolt die insert terug en bestaat het account niet. Deze trigger
 * is dus geen bijwerking van aanmelden maar een voorwaarde ervoor.
 *
 * ⚠️⚠️ **Aanmelden met Google was onmogelijk, en niemand kon dat zien.** Gemeten
 *    op 03-09: een insert zoals Supabase die voor Google aanmaakt liep stuk op
 *    `profiles_avatar_url_eigen_pad`, want de trigger schreef de
 *    `https://lh3.googleusercontent.com/...`-URL van de provider ongefilterd in
 *    een kolom die een opslagpad verwacht. Een naam van 125 tekens liep stuk op
 *    `profiles_display_name_len`.
 *
 *    **De naad is 125 migraties breed.** De trigger schrijft `avatar_url` sinds
 *    0002; de CHECKs kwamen in 0127 en 0129 bij de avatar-upload. Beide kanten
 *    waren op zichzelf correct — dit is regel 18 in zijn zuiverste vorm.
 *
 *    Het bleef onzichtbaar omdat de providers uitstaan: er is nooit een gebruiker
 *    langs deze route gekomen, en geen enkele test deed dat ook.
 *    `createTestUser()` in de harness stuurt geen `avatar_url` mee, dus de hele
 *    RLS-suite raakte deze tak niet.
 *
 * ⚠️ **Daarom psql en niet de harness.** Deze test móét `raw_user_meta_data`
 *    zelf samenstellen — dat is precies het verschil tussen een provider- en een
 *    e-mailaanmelding, en het is wat `createTestUser()` niet doet. Elk geval
 *    draait in een eigen transactie die teruggerold wordt, dus er blijft niets
 *    achter.
 *
 * ⚠️ **De must-allow staat er met opzet bij.** "De avatar wordt genegeerd" is
 *    goedkoop te halen door hem altijd op `null` te zetten; de laatste test
 *    bewijst dat een pad dat wél aan de CHECK voldoet er nog steeds in komt.
 *    Zonder die helft zou een kapotte reparatie er groen uitzien.
 */
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { PSQL_DB, PSQL_OMGEVING, stackBeschikbaarOfFaal } from './psql-stack';

const TEST_TIMEOUT = 30_000;

/**
 * Scheidingsteken tussen naam en avatarpad.
 *
 * ⚠️ Drukbaar en niet een stuurteken, en het komt in geen enkele waarde hier
 *    voor: de namen staan in dit bestand en een avatarpad mag alleen
 *    `[A-Za-z0-9._-]` na de id (`profiles_avatar_url_eigen_pad`).
 */
const SCHEIDING = '|~|';

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'handle_new_user'",
  import.meta.url,
);

// ⚠️ Het werpen zit sinds QS8-270 in `stackBeschikbaarOfFaal()` hierboven, en
//    geldt daarmee voor alle vier de bestanden die psql gebruiken. De regel is
//    ongewijzigd: overslaan mag alleen als niemand beweerde te meten.

/**
 * Meldt een gebruiker aan met deze metadata en geeft het profiel terug dat de
 * trigger ervan maakte. Draait in een teruggedraaide transactie.
 *
 * ⚠️ Geeft `null` terug als de aanmelding zélf mislukt — dat is de uitkomst die
 *    ertoe doet, want dan bestaat het account niet.
 */
/**
 * ⚠️⚠️ **Een SQL-fout is geen geweigerde aanmelding.** De eerste versie ving elke
 *    exception op en gaf `null` — dus "psql viel om" en "de constraint weigerde"
 *    kwamen er hetzelfde uit. Gemeten bij de review: een volstrekt gewone
 *    providernaam als `Siobhan O'Brien` brak de string en leverde een rode test
 *    met de melding *"de aanmelding is mislukt"*, terwijl de database die naam
 *    prima accepteert. De volgende die hier een geval met een apostrof, een
 *    backslash of `$$` toevoegt, gaat de trigger verdenken.
 *
 *    Twee dingen daartegen: de waarden gaan als **parameter** de SQL in
 *    (`psql -v` plus `:'naam'`), en een fout die géén constraintschending is,
 *    wordt hier gegooid in plaats van stilletjes `null`.
 */
function meldAan(
  id: string,
  email: string,
  metadata: string,
): { naam: string; avatar: string } | null {
  const sql =
    `begin; ` +
    `insert into auth.users (id, email, raw_user_meta_data) ` +
    `values (:'id', :'email', :'meta'::jsonb); ` +
    `select display_name || '${SCHEIDING}' || coalesce(avatar_url, '') ` +
    `from profiles where id = :'id'; ` +
    `rollback;`;

  let uit: string;
  try {
    uit = execFileSync(
      'psql',
      [
        '-U', PSQL_OMGEVING.PGUSER as string, '-d', PSQL_DB, '-q', '-w',
        '-v', 'ON_ERROR_STOP=1',
        '-v', `id=${id}`, '-v', `email=${email}`, '-v', `meta=${metadata}`,
        '-tA',
      ],
      // ⚠️ **Via stdin en niet via `-c`.** Gemeten: met `-c` laat psql `:'id'`
      //    letterlijk staan en krijg je `syntax error at or near ":"`. Variabelen
      //    worden alleen geïnterpoleerd bij invoer die psql zelf inleest.
      { env: PSQL_OMGEVING, encoding: 'utf8', input: sql },
    ).trim();
  } catch (fout) {
    const tekst = fout instanceof Error ? `${fout.message}` : String(fout);
    // Een constraintschending ís de uitkomst die deze tests meten: de trigger
    // faalt, de insert rolt terug, het account bestaat niet.
    if (/violates check constraint|violates not-null|invalid byte sequence/i.test(tekst)) {
      return null;
    }
    throw new Error(
      `meldAan: psql viel om op iets anders dan een constraint. Dat is geen ` +
        `geweigerde aanmelding maar een kapotte test.\n${tekst.split('\n').slice(0, 4).join('\n')}`,
    );
  }

  const regel = uit.split('\n').find((r) => r.includes(SCHEIDING));
  if (regel === undefined) return null;
  // ⚠️ `split` geeft `string | undefined` per element onder `noUncheckedIndexedAccess`.
  //    Een lege avatar is hier een geldige uitkomst — dat is precies wat de
  //    Google-test verwacht — dus die valt terug op de lege string.
  const [naam = '', avatar = ''] = regel.split(SCHEIDING);
  return { naam, avatar };
}

/** Telt codepunten, niet UTF-16-eenheden. */
const codepunten = (s: string): number => [...s].length;

const ID = (n: number): string => `00000000-0000-4000-8000-00000000f2${n.toString().padStart(2, '0')}`;

describe.skipIf(!beschikbaar)('een aanmelding wordt een profiel', () => {
  it(
    'een Google-aanmelding landt, en de avatar van de provider gaat niet mee',
    () => {
      const uit = meldAan(
        ID(1),
        'iemand@gmail.com',
        '{"full_name":"Iemand Google","avatar_url":"https://lh3.googleusercontent.com/a/ACg8ocK"}',
      );

      expect(
        uit,
        'de aanmelding is mislukt — de trigger draait in dezelfde transactie, dus ' +
          'dit betekent dat het account niet bestaat en aanmelden met Google niet kan',
      ).not.toBeNull();
      expect(uit?.naam).toBe('Iemand Google');
      expect(
        uit?.avatar,
        'de URL van de provider staat in `avatar_url`, en die kolom verwacht een ' +
          'opslagpad — dat is precies wat `profiles_avatar_url_eigen_pad` weigert',
      ).toBe('');
    },
    TEST_TIMEOUT,
  );

  it(
    'een Apple-aanmelding landt, ook met een relay-adres en alleen `name`',
    () => {
      const uit = meldAan(ID(2), 'abc@privaterelay.appleid.com', '{"name":"Iemand Apple"}');
      expect(uit, 'de aanmelding is mislukt').not.toBeNull();
      expect(uit?.naam).toBe('Iemand Apple');
    },
    TEST_TIMEOUT,
  );

  it(
    'een naam die langer is dan de CHECK toestaat, kost geen aanmelding',
    () => {
      const lang = 'Naam '.repeat(25).trim();
      const uit = meldAan(ID(3), 'lang@gmail.com', JSON.stringify({ full_name: lang }));

      expect(
        uit,
        'de aanmelding is mislukt op `profiles_display_name_len` — een lange naam ' +
          'mag nooit een account kosten',
      ).not.toBeNull();
      expect(codepunten(uit?.naam ?? ''), 'de naam is niet afgekapt op 80 codepunten').toBe(80);
    },
    TEST_TIMEOUT,
  );

  it(
    'een naam met emoji wordt op een heel teken afgekapt, niet middenin',
    () => {
      // ⚠️⚠️ **Dit geval ontbrak, en daardoor bewaakte dit bestand zijn eigen
      //    belofte niet.** De migratie zegt dat `left(..., 80)` codepunten telt en
      //    dat een byte-afkapping een teken doormidden zou knippen. Bij de review
      //    is die belofte met de hand gebroken — de body vervangen door
      //    `convert_from(substring(convert_to(...,'UTF8') from 1 for 80),'UTF8')`
      //    — en alle vijf de tests bleven groen, terwijl een echte Google-naam met
      //    emoji de aanmelding dan kost (`invalid byte sequence`).
      //
      //    De oorzaak was dat élke naam in dit bestand ASCII was, en dat de
      //    telling met `.length` liep — dat telt UTF-16-eenheden, wat voor ASCII
      //    toevallig hetzelfde is. Vandaar `codepunten()` hierboven.
      // ⚠️ Honderd en niet zestig: `👩` is **één** codepunt (U+1F469), dus zestig
      //    stuks halen de grens van 80 niet eens en wordt er niets afgekapt. Twee
      //    UTF-16-eenheden per emoji is precies het verschil waar deze test over
      //    gaat, en het kostte hier bijna een test die niets meet.
      const naam = `a${'👩'.repeat(100)}`;
      const uit = meldAan(ID(6), 'emoji@gmail.com', JSON.stringify({ full_name: naam }));

      expect(
        uit,
        'de aanmelding is mislukt op een naam met emoji — dat is de byte-afkapping',
      ).not.toBeNull();
      expect(codepunten(uit?.naam ?? ''), 'niet op 80 codepunten afgekapt').toBe(80);
      expect(
        uit?.naam.endsWith('👩'),
        'de laatste emoji is doormidden geknipt — dat is een afkapping op bytes ' +
          'of op UTF-16-eenheden en niet op codepunten',
      ).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'een e-mailaanmelding zonder metadata krijgt het deel vóór de @',
    () => {
      // ⚠️ De app stuurt bij `signUp()` geen naam mee (alleen e-mail en
      //    wachtwoord), dus dit is de gewone route en niet een randgeval.
      const uit = meldAan(ID(4), 'iemand@voorbeeld.nl', '{}');
      expect(uit?.naam).toBe('iemand');
    },
    TEST_TIMEOUT,
  );

  it(
    'een avatarpad dat wél naar jezelf wijst, komt er nog steeds in',
    () => {
      // ⚠️ **De must-allow.** Zonder deze test is "de avatar gaat niet mee" te
      //    halen door de kolom altijd leeg te laten, en dan bewaakt dit bestand
      //    een reparatie die te ver ging.
      const id = ID(5);
      const uit = meldAan(id, 'x@y.nl', `{"avatar_url":"${id}/foto.png"}`);
      expect(uit?.avatar).toBe(`${id}/foto.png`);
    },
    TEST_TIMEOUT,
  );

  it(
    'een avatarpad dat naar iemand ánders wijst, gaat niet mee',
    () => {
      // ⚠️ **Het spiegelbeeld van de must-allow, en het ontbrak.** Zonder deze
      //    test blijven alle andere groen als iemand de regex verruimt tot
      //    `^[0-9a-f-]+/…` — een `https://`-URL matcht die verruiming immers ook
      //    niet. Maar een aanmelding mét een vreemd pad loopt dan alsnog stuk op
      //    `profiles_avatar_url_eigen_pad`, en dat is precies de dichte deur die
      //    0154 komt repareren.
      const uit = meldAan(ID(7), 'vreemd@y.nl', `{"avatar_url":"${ID(1)}/foto.png"}`);
      expect(uit, 'de aanmelding is mislukt').not.toBeNull();
      expect(uit?.avatar, 'het pad van een ander is overgenomen').toBe('');
    },
    TEST_TIMEOUT,
  );

  it(
    'een avatarpad dat te lang is voor `profiles_avatar_url_len`, gaat niet mee',
    () => {
      // ⚠️ De **derde** CHECK, die in de eerste versie van de migratiekop
      //    ontbrak. De regex is daarom begrensd op 200 tekens na de id: een pad
      //    van 1001 tekens zou anders de hele aanmelding kosten.
      const id = ID(8);
      const uit = meldAan(id, 'lang@y.nl', JSON.stringify({ avatar_url: `${id}/${'a'.repeat(1001)}` }));
      expect(uit, 'de aanmelding is mislukt op profiles_avatar_url_len').not.toBeNull();
      expect(uit?.avatar, 'een pad van 1001 tekens is alsnog overgenomen').toBe('');
    },
    TEST_TIMEOUT,
  );
});
