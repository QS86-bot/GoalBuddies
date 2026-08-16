/**
 * Naamweergave. Staat los van `Avatar.tsx` omdat dat bestand React Native
 * importeert en daarmee niet in een gewone node-testomgeving te laden is.
 *
 * Dat is niet alleen een testtruc: de regel "wat moet er staan als er geen
 * avatar is" is een productregel, geen opmaak.
 */

/**
 * Maximaal twee letters. "Quinten Strijdonk" wordt QS, "Quinten" wordt Q.
 *
 * ⚠️ Werkt met codepoints en niet met `charAt`. Een naam die met een emoji of een
 *    teken buiten het basisvlak begint, zou anders halverwege een surrogaatpaar
 *    afgekapt worden en als kapot teken op het scherm komen.
 */
export function initialen(naam: string): string {
  const woorden = naam.trim().split(/\s+/).filter(Boolean);
  if (woorden.length === 0) return '?';

  const eerste = [...(woorden[0] ?? '')][0] ?? '?';
  if (woorden.length === 1) return eerste.toUpperCase();

  const laatste = [...(woorden[woorden.length - 1] ?? '')][0] ?? '';
  return (eerste + laatste).toUpperCase();
}
