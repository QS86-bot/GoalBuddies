/**
 * Of `bron` de functie daadwerkelijk aanroept — niet alleen noemt.
 *
 * ⚠️ **Verhuisd uit `bereikbaar.test.ts` bij QS8-301**, toen een tweede
 *    beloftetest hem nodig had en de voor de hand liggende weg — importeren uit
 *    een `.test.ts` — dat bestand een tweede keer laat draaien. Wat er aan
 *    zo'n verhuizing hangt, is de vraag waar CLAUDE.md voor waarschuwt: de
 *    ijking van deze zeef (`de zeef is geijkt`) staat nog steeds in
 *    `bereikbaar.test.ts` en is meeverhuisd noch verdwenen. Wie hem hiervandaan
 *    weghaalt, haalt hem daar ook weg.
 *
 * ⚠️ **Blokcommentaar gaat er als blok af en niet per regel, en dat is een
 *    reparatie.** De eerste versie filterde regels die met `//`, `*` of `/*`
 *    beginnen. Dat dekt JSDoc, maar niet de JSX-vorm die dit project overal
 *    gebruikt:
 *
 *      {** De knop bij `wijzigMijlpaal()`, die tot 28-08 ontbrak. **}
 *
 *    Zo'n regel begint met een waarschuwingsteken en niet met een sterretje, dus
 *    hij bleef staan — en dan telde de tóelichting op de knop als de knop. Bij
 *    het ijken bleven twee van de drie gevallen groen terwijl de aanroep eruit
 *    was. **Precies de fout die deze test moet vangen, in de test zelf.**
 */
/**
 * De bron zonder commentaar.
 *
 * ⚠️⚠️ **Sinds QS8-446 staat hij in `scripts/zonder-commentaar.mjs` en wordt hij
 *    hier alleen doorgegeven.** De reden dat hij bij QS8-443 hiernaartoe kwam
 *    staat nog overeind — CLAUDE.md noemt deze knip een grendel op zichzelf, en
 *    bij QS8-412 was dezelfde knip in twee bestanden blind voor `https://` —
 *    maar het antwoord was te klein. 📏 Er stonden er zeventien verschillende,
 *    verdeeld over `scripts/` en `tests/`, en deze boom kon de andere niet
 *    bereiken. Een `.mjs` kan dat wél in beide richtingen.
 *
 * ⚠️ De importeurs van dít bestand blijven werken; die hoefden niet mee te
 *    verhuizen.
 */
import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

export { zonderCommentaar };

export function roeptAan(bron: string, naam: string): boolean {
  const schoon = zonderCommentaar(bron);

  // ⚠️ De haakjes horen erbij: een `import { wijzigDoel }` is geen knop. En de
  //    negatieve vooruitblik houdt `wijzigDoelStatus` buiten de deur.
  return new RegExp(`(?<![a-zA-Z0-9_])${naam}\\s*\\(`).test(schoon);
}
