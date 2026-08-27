/**
 * De naam waaronder een build zich bij Sentry meldt — QS8-24, criterium 2.
 *
 * ⚠️ **Deze vorm staat op twee plekken en dat is een naad.** De app stuurt hem
 *    mee bij elke gebeurtenis (`maakSentrySink`), en `scripts/deploy-web.mjs`
 *    hangt de source maps eraan op. Lopen ze uiteen, dan komen de maps netjes
 *    aan, staan de gebeurtenissen er netjes in, en matcht er niets — het stille
 *    geval waar dit project vandaag genoeg van gezien heeft.
 *
 *    De ene kant is TypeScript en de andere een `.mjs`-script, dus ze kunnen de
 *    functie niet delen. Wat ze wél delen is een test die beide aanroept en de
 *    uitkomst vergelijkt: `tests/scripts/release-naam.test.ts`.
 *
 * ⚠️ Weglaten en niet verzinnen. Zonder versie hoort er geen `release` in de
 *    gebeurtenis te staan; een verzonnen naam koppelt maps aan de verkeerde
 *    build en dat merk je pas als je een stack probeert te lezen.
 */
export function releaseVoor(versie: string | undefined | null): string | undefined {
  if (typeof versie !== 'string') return undefined;

  const schoon = versie.trim();
  return schoon === '' ? undefined : `goalbuddies@${schoon}`;
}
