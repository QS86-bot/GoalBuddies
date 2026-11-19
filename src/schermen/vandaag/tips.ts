import { vraagMijlpaalTip, werkJobAf } from '@/modules/ai';
import { fetchMijlpaalTips, fetchVolgendeMijlpalen, type Mijlpaaltip } from '@/modules/goals';

/**
 * De tips bij de volgende mijlpaal van elk opgegeven doel — QS8-137.
 *
 * ⚠️ **Het aanvragen gebeurt hier en niet in een eigen effect**, en dat is een
 *    afweging. Een tweede effect zou een tweede `levend`-vlag vragen voor iets
 *    dat geen state schrijft; dit doet dat niet en heeft die bewaking dus niet
 *    nodig. De prijs is dat een laadfunctie een neveneffect heeft, en die staat
 *    hier opgeschreven zodat de volgende lezer hem niet per ongeluk weghaalt.
 *
 * ⚠️ **De aanvraag is stilzwijgend en kost uit het gedeelde dagbudget**,
 *    hetzelfde quotum als het opsplitsen van een doel en de weekstappen. Dat is
 *    aanvaardbaar omdat het per mijlpaal één keer gebeurt en niet per week — de
 *    grendel daarvoor staat in `vraag_ai_job()` (migratie 0103) en niet hier.
 *    Is het quotum op, dan komt er `quota_reached` terug, doet deze functie
 *    niets, en ziet de gebruiker de vaste regel. Met opzet geen foutmelding: hij
 *    heeft niets gevraagd.
 *
 * ⚠️ `gevraagd` is de rem binnen één sessie. De échte grendel is de primaire
 *    sleutel op `milestone_tips`, maar een aanvraag die tóch elke ronde vertrekt
 *    kost wél een plek in het quotum.
 */
export async function laadTips(
  goalIds: readonly string[],
  gevraagd: { current: Set<string> },
): Promise<ReadonlyMap<string, Mijlpaaltip>> {
  const volgende = await fetchVolgendeMijlpalen(goalIds);
  if (volgende.size === 0) return new Map();

  const mijlpaalIds = [...volgende.values()].map((m) => m.id);
  let tips = await fetchMijlpaalTips(mijlpaalIds);
  let gegenereerd = false;

  for (const [doelId, mijlpaal] of volgende) {
    if (tips.has(mijlpaal.id) || gevraagd.current.has(mijlpaal.id)) continue;
    gevraagd.current.add(mijlpaal.id);

    const aanvraag = await vraagMijlpaalTip(doelId, mijlpaal.id);
    if (aanvraag.ok && !aanvraag.waarde.hergebruikt) {
      await werkJobAf(aanvraag.waarde.jobId);
      gegenereerd = true;
    }
  }

  // ⚠️ **Zonder deze tweede ophaling betaalde deze functie voor een tip die hij
  //    in dezelfde ronde weggooide.** `tips` is een momentopname van vóór de
  //    generatielus, dus een net gegenereerde tip zit er per definitie niet in —
  //    en niets draait `laadTips` daarna opnieuw: `useAsync` hangt aan
  //    `[userId, gehaaldeDoelen, ronde]`. De gebruiker zag niets, de job stond op
  //    `done` en de kosten waren geboekt.
  //
  // ⚠️ Alleen als er echt iets gegenereerd is: anders is dit een tweede verzoek
  //    per bezoek aan Vandaag, voor niets.
  if (gegenereerd) tips = await fetchMijlpaalTips(mijlpaalIds);

  return new Map(
    [...volgende].flatMap(([doelId, mijlpaal]) => {
      const tip = tips.get(mijlpaal.id);
      return tip === undefined ? [] : [[doelId, tip] as const];
    }),
  );
}
