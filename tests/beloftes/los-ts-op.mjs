/**
 * Een resolve-hook voor het kindproces van de QS8-702-grendel
 * (`tests/beloftes/rls-doel-kindproces.mjs`).
 *
 * ⚠️ **Waarom dit bestaat.** `tests/rls/harness.ts` importeert `./wezen` zonder
 *    extensie. Vitest (vite) lost dat op; een kaal `node` buiten vitest niet —
 *    ESM doet geen extensie-aanvulling. Deze hook plakt er `.ts` achter, zodat de
 *    harness in een kindproces laadbaar is zonder vitest.
 *
 * ⚠️ **Hij raakt niets anders.** Alleen een relatieve specifier (`.`/`/`) zónder
 *    extensie wordt aangevuld. Een bare specifier (`@supabase/supabase-js`,
 *    `node:module`) en een die al een extensie draagt (`./los-ts-op.mjs`) gaan
 *    ongemoeid naar de volgende resolver. Zo blijft dit een brug en geen tweede
 *    modulesysteem dat zijn eigen fouten kan maken.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (/^[./]/.test(specifier) && !/\.\w+$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw err;
  }
}
