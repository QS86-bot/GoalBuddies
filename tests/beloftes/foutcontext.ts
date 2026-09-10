/**
 * De zeef achter `foutcode-uit-een-bron.test.ts`, apart zodat hij te voeden is.
 *
 * ⚠️ **Waarom dit bestaat** — QS8-338. Dezelfde duplicatie is twee keer gegroeid:
 *    57 aanroepen met `pgcode` (QS8-330) en 76 met `code`. Allebei stuurden ze
 *    de waarde die `beschrijfFout()` al in de melding zet, en allebei zijn ze
 *    één voor één ontstaan doordat de vórige regel het ook deed. Zonder grendel
 *    is er geen reden om aan te nemen dat er geen derde ronde komt.
 *
 * ⚠️ **De grens loopt bij de bron van de waarde en niet bij de sleutelnaam.** Een
 *    `code` die de aanroeper zélf schrijft — `{ code: 'profielen_ophalen_mislukt' }`,
 *    tien keer in `rollover` en `notificaties` — draagt informatie die nergens
 *    anders staat en hoort er te blijven. Rood is alleen wat de fout die al
 *    meegaat nóg een keer uitleest.
 */

/** Commentaar eruit, regelnummers erin. */
function zonderCommentaar(bron: string): string {
  return bron
    .split('\n')
    .map((regel) => regel.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, (blok) => blok.replace(/[^\n]/g, ' '));
}

/** Index net na de sluithaak van de aanroep die op `open` opent. */
function haakjeseind(bron: string, open: number): number {
  let diepte = 0;
  for (let i = open; i < bron.length; i += 1) {
    if (bron[i] === '(') diepte += 1;
    else if (bron[i] === ')') {
      diepte -= 1;
      if (diepte === 0) return i + 1;
    }
  }
  return -1;
}

/** Het eerste argument van een aanroeptekst, als kale uitdrukking. */
function eersteArgument(aanroep: string): string {
  let diepte = 0;
  for (let i = 0; i < aanroep.length; i += 1) {
    const teken = aanroep[i] as string;
    if ('([{'.includes(teken)) diepte += 1;
    else if (')]}'.includes(teken)) diepte -= 1;
    else if (teken === ',' && diepte === 1) return aanroep.slice(aanroep.indexOf('(') + 1, i).trim();
  }
  return '';
}

/**
 * Elke `reportError()`-aanroep in `bron` die de foutcode van zijn éígen eerste
 * argument nog een keer meestuurt.
 */
export function dubbeleFoutcodesIn(bron: string): string[] {
  const schoon = zonderCommentaar(bron);
  const uit: string[] = [];

  for (const m of schoon.matchAll(/\b(?:reportError|meld)\s*\(/g)) {
    const open = schoon.indexOf('(', m.index);
    const eind = haakjeseind(schoon, open);
    if (eind === -1) continue;

    const aanroep = schoon.slice(m.index, eind);
    const fout = eersteArgument(aanroep);
    if (fout === '') continue;

    // ⚠️ De waarde tot de eerstvolgende komma of accolade — `?? 'onbekend'` hoort
    //    er nog bij, en dat is precies een van de vormen die in de bron stond.
    const sleutel = /\bcode:\s*([^,}]+)/.exec(aanroep);
    if (sleutel === null) continue;

    const waarde = (sleutel[1] as string).trim();
    const bron_van_de_code = new RegExp(
      `^${fout.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\??\\.code\\b`,
    );
    if (!bron_van_de_code.test(waarde)) continue;

    const regel = schoon.slice(0, m.index + (sleutel.index ?? 0)).split('\n').length;
    uit.push(`${regel} — code: ${waarde}`);
  }

  return uit;
}
