import { supabase } from '../../lib/supabase';
import { reportError } from '../../lib/observability';

/**
 * Is het schrijfbudget van deze gebruiker op?
 *
 * Migratie 0090 zette een rem op `chat_messages` en `week_review_replies`:
 * vijfhonderd berichten en honderd weekreacties per voortschrijdend etmaal,
 * afgedwongen in de INSERT-policy (beveiligingsregel 5).
 *
 * ⚠️ **Dit is een uitleg-functie en geen tweede grens.** De policy beslist; deze
 *    functie beantwoordt achteraf de vraag *waaróm* de policy weigerde. Zou de
 *    app zelf vooraf tellen, dan stond het getal op twee plekken en zou de app
 *    de gebruiker kunnen tegenhouden waar de database hem doorlaat — of erger,
 *    andersom.
 *
 * ⚠️ **De grens staat niet in deze code.** `berichten_over()` en
 *    `weekreacties_over()` geven het *resterende* budget terug, niet het
 *    verbruik, juist zodat het getal alleen in de migratie staat. Nul betekent
 *    op. Dat is de reden dat 0090 het anders doet dan 0083, dat vooruit telde.
 *
 * ⚠️ **Bij twijfel: geen rem.** Elke fout — geen sessie, geen netwerk, een
 *    onbekende code — levert `false` op, en dan valt de aanroeper terug op zijn
 *    gewone melding. Een gebruiker vertellen dat hij zijn limiet bereikt heeft
 *    terwijl er iets anders stuk is, stuurt hem een uur weg voor een probleem
 *    dat over twee tellen over is.
 */
export async function budgetOp(teller: 'berichten_over' | 'weekreacties_over'): Promise<boolean> {
  const { data, error } = await supabase().rpc(teller);

  if (error) {
    reportError(error, 'rem.budget', { teller, pgcode: error.code });
    return false;
  }

  return data === 0;
}
