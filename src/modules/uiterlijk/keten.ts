import { reportError } from '../../lib/observability';

import type { Verzoening } from './verzoenen';
import type { Uiterlijkvoorkeur } from './voorkeur';

/**
 * De keten van de provider zonder React: eerst de lokale lezing, dan de verzoening met de account.
 *
 * ⚠️ **Hier staat de racebescherming en niet in de hook**, zodat ze te toetsen is zonder renderer
 *    (`keten.test.ts`). `nogGeldig()` is waar zolang het effect leeft én de gebruiker sindsdien niets koos; een
 *    uitslag die daarna terugkomt, verliest van de keuze die er al staat.
 */
export interface KetenDelen {
  readonly userId: string | null;
  readonly leesStart: () => Promise<Verzoening>;
  readonly verzoen: (userId: string) => Promise<Verzoening>;
  readonly zet: (v: Uiterlijkvoorkeur) => void;
  readonly nogGeldig: () => boolean;
  readonly levend: () => boolean;
  readonly klaar: () => void;
}

export async function loopKeten(d: KetenDelen): Promise<void> {
  const start = await d.leesStart().catch((fout: unknown) => {
    reportError(fout, 'uiterlijk.keten.start', {});
    return null;
  });
  if (start !== null && d.nogGeldig()) d.zet(start.voorkeur);
  if (d.levend()) d.klaar();
  if (d.userId === null) return;
  const uitslag = await d.verzoen(d.userId).catch((fout: unknown) => {
    reportError(fout, 'uiterlijk.keten.verzoenen', {});
    return null;
  });
  if (uitslag !== null && d.nogGeldig()) d.zet(uitslag.voorkeur);
}
