/**
 * Staat in voor `jsr:@supabase/supabase-js@2` zodra vitest een Edge Function
 * importeert — QS8-195.
 *
 * ⚠️ **Geen nagebouwde client, en dat is met opzet.** De test die dit bestand
 *    nodig heeft, voert de échte handler een `OPTIONS`-verzoek; die tak raakt
 *    geen enkele client. Zou deze stub gedrag nabootsen, dan zou een volgende
 *    test op dat namaakgedrag kunnen leunen en groen blijven terwijl de echte
 *    client iets anders doet. Wat hier staat is precies genoeg om het
 *    `jsr:`-specifier op te lossen, en niets meer: elke aanroep valt om.
 *
 *    Wie hier een POST-pad wil toetsen, bouwt dus niet dit bestand uit maar
 *    schrijft een test tegen een echte functie — zie `tests/rls/`.
 */
export function createClient(): never {
  throw new Error(
    'De stub voor supabase-js is aangeroepen. Deze test hoort alleen de ' +
      'CORS-tak van een Edge Function te raken; die praat met niemand.',
  );
}
