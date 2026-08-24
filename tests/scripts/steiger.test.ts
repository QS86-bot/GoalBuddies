import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * De steiger blijft uit productie — QS8-119.
 *
 * ⚠️ **`supabase/shim/` bevat twee functies die op het echte project niets te
 *    zoeken hebben:** `shim_maak_gebruiker()` en `shim_verwijder_gebruiker()`
 *    maken en verwijderen rijen in `auth.users` met een SECURITY DEFINER. Ze
 *    bestaan omdat de lokale opstelling geen GoTrue heeft.
 *
 *    Vandaag is de scheiding een eigenschap van waar de bestanden staan: `db
 *    push` en `register:controle` kijken alleen naar `supabase/migrations/`.
 *    Dat is een aanname, en aannames horen in dit project een controle te zijn —
 *    zeker deze, want de fout is stil: een gekopieerd blok in een migratie zet
 *    een deur naar `auth.users` op het echte project, en niets wordt er rood van.
 */

const wortel = join(import.meta.dirname, '..', '..');

describe('de steiger blijft uit de migraties', () => {
  it('noemt `shim_` in geen enkel migratiebestand', () => {
    const map = join(wortel, 'supabase', 'migrations');

    const besmet = readdirSync(map)
      .filter((naam) => naam.endsWith('.sql'))
      .filter((naam) => readFileSync(join(map, naam), 'utf8').includes('shim_'));

    expect(besmet, 'deze migraties noemen `shim_`').toEqual([]);
  });

  /**
   * ⚠️ De positieve controle ernaast. Zonder deze test wordt de test hierboven
   *    groen zodra de steiger helemaal niet meer bestaat — en dan bewaakt hij
   *    niets meer terwijl de lokale stack stuk is.
   */
  it('heeft de twee functies wél in de steiger staan', () => {
    const steiger = readFileSync(
      join(wortel, 'supabase', 'shim', '0000_supabase_shim.sql'),
      'utf8',
    );

    expect(steiger).toContain('function public.shim_maak_gebruiker');
    expect(steiger).toContain('function public.shim_verwijder_gebruiker');

    // En ze staan dicht voor iedereen behalve de systeemrol.
    expect(steiger).toContain(
      'revoke all on function public.shim_maak_gebruiker(text, text) from public, anon, authenticated',
    );
    expect(steiger).toContain(
      'grant execute on function public.shim_maak_gebruiker(text, text) to service_role',
    );
  });

  /**
   * ⚠️ De steiger hoort ook niet in de vingerafdrukvergelijking mee te tellen
   *    als "verschil": hij draait alleen lokaal. Deze test bewaakt dat de
   *    opbouwscript hem uit een aparte map haalt en niet uit de migratiemap.
   */
  it('wordt door het opbouwscript apart toegepast', () => {
    const script = readFileSync(join(wortel, 'scripts', 'schema-opbouwen.sh'), 'utf8');

    expect(script).toContain('supabase/shim/0000_supabase_shim.sql');
  });
});
