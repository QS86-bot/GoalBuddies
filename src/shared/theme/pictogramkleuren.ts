/**
 * De kleuren van de meerkleurige pictogrammen — QS8-730.
 *
 * ⚠️ **Eigen waarden, vast per modus en niet per uiterlijk.** Een trofee blijft goud
 *    en een vlam blijft een vlam, ook in uiterlijk A waar het accent blauwgroen is.
 *    Dat is dezelfde keuze als bij het heldenpalet: een vaste set naast het palet in
 *    plaats van een afgeleide ervan. Het huisstijlbesluit (QS8-722) vraagt om
 *    kleurrijke pictogrammen; ze uit `accent` afleiden maakt ze eenkleurig.
 *
 * ⚠️ **Geen statusrood.** `red` is uitsluitend deadline-risico (palet-commentaar). De
 *    vlam loopt dus van geel naar diep oranje, en het lint van de medaille is blauw.
 *
 * ⚠️ **Wat de toets meet** (`pictogrammen.test.ts`): de *dragende* kleuren van elk
 *    pictogram halen 3:1 tegen `bg`, `panel` en `panelDark` van élk palet van élk
 *    uiterlijk — de drie vlakken waar ook een heldenoppervlak uit kiest. Vullingen
 *    die licht zijn op een licht vlak mogen onder 3:1 blijven zolang de rand dat
 *    haalt; de vorm wordt dan door de contour gedragen.
 */

export interface Pictogramkleuren {
  readonly goud: string;
  readonly goudDiep: string;
  readonly goudRand: string;
  readonly vlamBoven: string;
  readonly vlamMidden: string;
  readonly vlamOnder: string;
  readonly vlamRand: string;
  readonly groen: string;
  readonly groenRand: string;
  readonly blauw: string;
  readonly blauwRand: string;
  readonly cyaan: string;
  readonly oranje: string;
  readonly roze: string;
  readonly rozeRand: string;
  /** Een highlight op een vlak; wordt altijd met een dekking getekend. */
  readonly licht: string;
  /** Het vergrendelde pictogram: vlak, rand en highlight. Geen kruis, geen treurig teken. */
  readonly slot: string;
  readonly slotRand: string;
  readonly slotLicht: string;
}

export const pictogramkleurenDonker: Pictogramkleuren = {
  goud: '#fde68a',
  goudDiep: '#d9a21b',
  goudRand: '#e8b648',
  vlamBoven: '#fde047',
  vlamMidden: '#fb923c',
  vlamOnder: '#f0803c',
  vlamRand: '#f59e0b',
  groen: '#6ee7b7',
  groenRand: '#3fbf8f',
  blauw: '#93c5fd',
  blauwRand: '#60a5fa',
  cyaan: '#22d3ee',
  oranje: '#fb923c',
  roze: '#f9a8d4',
  rozeRand: '#f472b6',
  licht: '#ffffff',
  slot: '#4a5a86',
  slotRand: '#8091ba',
  slotLicht: '#a9b6d8',
};

export const pictogramkleurenLicht: Pictogramkleuren = {
  goud: '#f5c445',
  goudDiep: '#c98a14',
  goudRand: '#8a6620',
  vlamBoven: '#f5c445',
  vlamMidden: '#ef8a2e',
  vlamOnder: '#c2571b',
  vlamRand: '#a34a14',
  groen: '#5fcfa0',
  groenRand: '#1f7a56',
  blauw: '#6ea8f7',
  blauwRand: '#1d4ed8',
  cyaan: '#0b6b8f',
  oranje: '#c2571b',
  roze: '#f08ab8',
  rozeRand: '#b4235f',
  licht: '#ffffff',
  slot: '#b8c0d4',
  slotRand: '#6b7793',
  slotLicht: '#e3e7f0',
};
