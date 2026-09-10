/**
 * Wat er van een gekozen bijlage naar `stuurBericht()` gaat — QS8-72.
 *
 * ⚠️⚠️ **Een eigen bestand naast `useChatbijlage.ts`, en dat is een gemeten
 *    noodzaak en geen ordelijkheid.** De hook staat naast de twee kiezers, en
 *    die slepen react-native mee; een suite die deze functie wil toetsen, krijgt
 *    dan `Flow is not supported` op `node_modules/react-native/index.js` en
 *    draait geen enkel geval. 📏 Gemeten op 10-09-2026, met
 *    `vi.mock('expo-document-picker')` erbij — dat helpt niet, want de keten
 *    loopt verder. De belofte hieronder is te belangrijk om onmeetbaar te zijn.
 */
export type Gekozenbijlage =
  | { readonly soort: 'foto'; readonly data: Uint8Array; readonly mime: string }
  | {
      readonly soort: 'doc';
      readonly data: Uint8Array;
      readonly mime: string;
      readonly naam: string;
    };

/**
 * Wat er van een keuze naar `stuurBericht()` gaat.
 *
 * ⚠️⚠️ **`naam` is bij `stuurBericht()` de soortbepaler**, en dat staat daar met
 *    zoveel woorden: staat hij er, dan is het een document. Een foto mag hem dus
 *    níet meekrijgen — ook geen lege string, want `typeof '' === 'string'` en dan
 *    gaat een jpeg naar `chatdocs`. Vandaar deze functie in plaats van een spread.
 */
export function naarVerzending(
  bijlage: Gekozenbijlage,
): { readonly data: Uint8Array; readonly mime: string; readonly naam?: string } {
  if (bijlage.soort === 'foto') return { data: bijlage.data, mime: bijlage.mime };
  return { data: bijlage.data, mime: bijlage.mime, naam: bijlage.naam };
}
