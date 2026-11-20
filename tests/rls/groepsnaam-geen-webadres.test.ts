/**
 * De belofte van QS8-771: **de database weigert in een groepsnaam wat de client
 * weigert** — `bevat_linkachtige_tekst()` (migratie 0328) en
 * `bevatLinkAchtigeTekst()` geven op dezelfde lijst hetzelfde antwoord.
 *
 * ⚠️ Een pariteitstest en geen losse toets per kant: twee regexen die elkaar
 *    "spiegelen" lopen uit elkaar zonder dat een van beide rood wordt. De lijst
 *    bevat ook de omzeilingen uit de security-review (andere punten, een accent
 *    op de punt, IDN-letters), want `[[:alpha:]]` hangt van de locale af.
 */
import { describe, expect, it } from 'vitest';

import { bevatLinkAchtigeTekst } from '../../src/shared/tekst';
import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

const beschikbaar = stackBeschikbaarOfFaal(
  "select to_regprocedure('public.bevat_linkachtige_tekst(text)')::text",
  import.meta.url,
);

const WEIGEREN = [
  'Account verlopen, log in via evil.example',
  'https://evil.example',
  'go to www.x',
  'a://b',
  'evil。com',
  'evil．com',
  'evil｡com',
  'evil․com',
  'evil﹒com',
  'evil.\u0301com',
  'évil.com',
  'пример.рф',
  'Jan\nAdmin',
  'Jan\u2029Admin',
  'log in via 185.12.3.4',
  'Lopen 5.5 km',
  'Log in via evil\u200E.com',
  'evil.\u200Ecom',
  'evil\u200F.com',
  'evil\u061C.com',
  '185\u200E.12\u200E.3\u200E.4',
  'evile\u0301.com',
  'evile\uFE0F.com',
  'evile\u200D.com',
  'goalbuddies-login.\u200Dсом',
  'https\uFF1A\uFF0F\uFF0Fevil',
];
const TOELATEN = ['Sportmaatjes', 'Team 3A', 'Lopen, 5 km', 'Jan & Piet', 'e.g. wij', 'Jan’s groep'];

describe.skipIf(!beschikbaar)('groepsnaam zonder webadres: client en database zijn gelijk', () => {
  const db = (tekst: string): boolean => {
    const lit = tekst.replace(/'/g, "''").replace(/\n/g, "' || chr(10) || '");
    return psqlMetInvoer(`select public.bevat_linkachtige_tekst('${lit}')::text;`, { verbose: false })
      .split('\n')
      .some((r) => r.trim() === 'true' || r.trim() === 't');
  };

  it.each(WEIGEREN)('weigert %j in beide', (naam) => {
    expect(bevatLinkAchtigeTekst(naam)).toBe(true);
    expect(db(naam)).toBe(true);
  });

  it.each(TOELATEN)('laat %j door in beide', (naam) => {
    expect(bevatLinkAchtigeTekst(naam)).toBe(false);
    expect(db(naam)).toBe(false);
  });
});
