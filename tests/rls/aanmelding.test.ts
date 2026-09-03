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

const OMGEVING = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? '127.0.0.1',
  PGPORT: process.env.PGPORT ?? '5432',
  PGPASSWORD: process.env.PGPASSWORD ?? 'postgres',
};

const DB = process.env.PGDATABASE ?? 'goalbuddies_rls';
const TEST_TIMEOUT = 30_000;

/**
 * Scheidingsteken tussen naam en avatarpad.
 *
 * ⚠️ Drukbaar en niet een stuurteken, en het komt in geen enkele waarde hier
 *    voor: de namen staan in dit bestand en een avatarpad mag alleen
 *    `[A-Za-z0-9._-]` na de id (`profiles_avatar_url_eigen_pad`).
 */
const SCHEIDING = '|~|';

function psql(sql: string): string {
  return execFileSync(
    'psql',
    ['-U', 'postgres', '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1', '-tAc', sql],
    { env: OMGEVING, encoding: 'utf8' },
  ).trim();
}

function stackBeschikbaar(): boolean {
  try {
    return psql("select count(*) from pg_proc where proname = 'handle_new_user'") === '1';
  } catch {
    return false;
  }
}

const beschikbaar = stackBeschikbaar();

/**
 * Meldt een gebruiker aan met deze metadata en geeft het profiel terug dat de
 * trigger ervan maakte. Draait in een teruggedraaide transactie.
 *
 * ⚠️ Geeft `null` terug als de aanmelding zélf mislukt — dat is de uitkomst die
 *    ertoe doet, want dan bestaat het account niet.
 */
function meldAan(
  id: string,
  email: string,
  metadata: string,
): { naam: string; avatar: string } | null {
  try {
    const uit = psql(
      `begin; ` +
        `insert into auth.users (id, email, raw_user_meta_data) ` +
        `values ('${id}', '${email}', '${metadata}'::jsonb); ` +
        `select display_name || '${SCHEIDING}' || coalesce(avatar_url, '') ` +
        `from profiles where id = '${id}'; ` +
        `rollback;`,
    );
    const regel = uit.split('\n').find((r) => r.includes(SCHEIDING));
    if (regel === undefined) return null;
    // ⚠️ `split` geeft `string | undefined` per element onder `noUncheckedIndexedAccess`.
    //    Een lege avatar is hier een geldige uitkomst — dat is precies wat de
    //    Google-test verwacht — dus die valt terug op de lege string en niet op
    //    een fout.
    const [naam = '', avatar = ''] = regel.split(SCHEIDING);
    return { naam, avatar };
  } catch {
    return null;
  }
}

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
      expect(uit?.naam.length, 'de naam is niet afgekapt op 80 codepunten').toBe(80);
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
});
