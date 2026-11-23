import type { AfrondOpties, Profiel } from '@/modules/auth';
import {
  openstaandeUitnodiging,
  toegetredenGroep,
  type OpenstaandeUitnodiging,
} from '@/modules/buddies';
import { openstaandeWerkcode } from '@/modules/organisaties';

/**
 * Komt iemand ergens binnen via een uitnodiging of een werkcode? — QS8-805.
 *
 * ⚠️ **Besluit Quinten (23-11-2026, variant B): wie zo instapt, gaat na Klaar eerst
 *    naar zijn groep of naar het lid-worden-scherm, en niet naar de vragenlijst.** De
 *    vragenlijst komt later, als kaart op Vandaag. Een gewone aanmelding gaat zoals in
 *    QS8-793 na Klaar naar de vragenlijst.
 *
 * ⚠️ **Eén beslissing voor twee lezers, en dat is de reden dat ze hier staat.** Het
 *    profielscherm leest haar bij Klaar (wel of geen vragenlijst), `Uitnodigingswacht`
 *    leest haar daarna (waarheen). Zeggen die twee iets anders, dan raceten de
 *    vragenlijst en de groep weer, en dat is precies de klasse van QS8-793.
 *
 * ⚠️ Hier en niet in `modules/auth`: `buddies` importeert `auth`, dus `auth` kan niet
 *    weten of er een uitnodiging openstaat zonder een kringverwijzing.
 */
export type Instap =
  | { readonly soort: 'groep'; readonly groupId: string }
  | { readonly soort: 'uitnodiging'; readonly wachtend: OpenstaandeUitnodiging }
  | { readonly soort: 'werkcode'; readonly code: string };

/**
 * ⚠️ **De volgorde is de regel.** Een groep waar je al in zit gaat voor: daar hoeft
 *    niets meer te gebeuren. Daarna de uitnodiging vóór de werkcode, zoals de twee
 *    wachten het vóór QS8-805 al deden; de werkcode blijft staan tot de volgende
 *    start (`organisaties/pending.ts`).
 *
 * ⚠️ Elke bewaarde uitnodiging telt, ook een verlopen (`automatisch: false`): de
 *    wacht stuurt dan naar het uitnodigingsscherm, en ook dan is de vragenlijst niet
 *    wat er na Klaar komt (besluit A49).
 */
export function instapNa(bronnen: {
  readonly groep: string | null;
  readonly uitnodiging: OpenstaandeUitnodiging | null;
  readonly werkcode: string | null;
}): Instap | null {
  if (bronnen.groep !== null) return { soort: 'groep', groupId: bronnen.groep };
  if (bronnen.uitnodiging !== null) return { soort: 'uitnodiging', wachtend: bronnen.uitnodiging };
  if (bronnen.werkcode !== null) return { soort: 'werkcode', code: bronnen.werkcode };
  return null;
}

/** De drie bronnen op dit apparaat. Een lezer die faalt geeft `null` en meldt zelf. */
export async function leesInstap(userId: string): Promise<Instap | null> {
  const [groep, uitnodiging, werkcode] = await Promise.all([
    toegetredenGroep(userId),
    openstaandeUitnodiging(),
    openstaandeWerkcode(),
  ]);
  return instapNa({ groep, uitnodiging, werkcode });
}

/**
 * Het afgeronde profiel in de provider zetten, met of zonder de vragenlijst erna.
 *
 * ⚠️ **Eerst lezen, dan zetten.** Zodra het profiel afgerond in de provider staat,
 *    starten de routewacht en `Uitnodigingswacht`. Staat de instap dan nog niet vast,
 *    dan zet de vlag de routewacht op de vragenlijst terwijl de wacht naar de groep
 *    gaat: twee navigatoren, en de laatste wint (📏 0,1 s vragenlijst in beeld op de
 *    web-export met alleen QS8-793).
 */
export async function afrondenMetInstap(
  profiel: Profiel,
  zet: (profiel: Profiel, opties: AfrondOpties) => void,
): Promise<void> {
  const instap = await leesInstap(profiel.id);
  zet(profiel, { vragenlijst: instap === null });
}
