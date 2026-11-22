import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

import {
  leesVoorkeur,
  normaliseerVoorkeur,
  voorkeurSchema,
  type Uiterlijkvoorkeur,
} from './voorkeur';
import type { AccountVoorkeur } from './verzoenen';

/**
 * De clientkant van `gebruikersvoorkeuren` — QS8-729, migratie 0303.
 *
 * ⚠️ Elke rij gaat door `leesVoorkeur()`: een rij die deze module niet kent is een
 *    luide fout, geen stille standaard.
 *
 * ⚠️⚠️ **`.upsert()` werkt hier niet**, om dezelfde reden als bij `hero_profiles`
 *    (zie `helden/heldprofiel.ts`): `user_id` mag je bij het aanmaken zetten en
 *    nooit meer, en PostgREST zet bij `merge-duplicates` elke payloadkolom in de
 *    `do update`-lijst. Bovendien kan een upsert "alleen als er niemand tussen
 *    is gekomen" niet uitdrukken. Vandaar insert of voorwaardelijke update.
 *
 * ⚠️ `bijgewerkt_op` gaat met opzet nooit mee. Hij staat in geen enkele grant
 *    en de trigger `gebruikersvoorkeuren_tijd` zet hem; de server bepaalt wat
 *    nieuwer is, de client leest het terug.
 */

const KOLOMMEN = 'stijl, kleurvariant, weergave, dichtheid, emoji, bijgewerkt_op';
const AL_AANWEZIG = '23505';

function alsAccountVoorkeur(rij: unknown): AccountVoorkeur | null {
  if (typeof rij !== 'object' || rij === null) return null;
  const { bijgewerkt_op: bijgewerktOp, ...rest } = rij as Record<string, unknown>;
  const voorkeur = leesVoorkeur(rest);
  return voorkeur && typeof bijgewerktOp === 'string' ? { voorkeur, bijgewerktOp } : null;
}

/**
 * De voorkeur van deze gebruiker, of `null` als hij er geen rij voor heeft.
 *
 * ⚠️ **Werpt bij een fout en geeft dan géén `null`.** `null` betekent *er is
 *    geen rij*; een mislukte lezing is iets anders, en de verzoening behandelt
 *    de twee verschillend (zie `verzoenVoorkeur`).
 */
export async function haalAccountVoorkeur(userId: string): Promise<AccountVoorkeur | null> {
  const { data, error } = await supabase()
    .from('gebruikersvoorkeuren')
    .select(KOLOMMEN)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('uiterlijk.haalAccountVoorkeur', error.message);
    reportError(
      new Error('De uiterlijkvoorkeur kon niet gelezen worden'),
      'uiterlijk.haalAccountVoorkeur',
      {
        code: error.code ?? null,
        user_id: userId,
      },
    );
    throw new Error('De uiterlijkvoorkeur kon niet gelezen worden');
  }
  if (data === null) return null;

  const uit = alsAccountVoorkeur(data);
  if (!uit) {
    // De CHECK's laten dit niet toe; komt het toch voor, dan loopt de database
    // uit de pas met deze module en dat moet luid zijn.
    const fout = new Error('gebruikersvoorkeuren: een rij die deze module niet kent');
    reportError(fout, 'uiterlijk.haalAccountVoorkeur.onbekend', {
      user_id: userId,
    });
    throw fout;
  }
  return uit;
}

export type BewaarUitkomst =
  | {
      readonly ok: true;
      readonly voorkeur: Uiterlijkvoorkeur;
      readonly bijgewerktOp: string;
    }
  | { readonly ok: false; readonly reden: 'conflict' | 'netwerk' };

/**
 * Legt de voorkeur vast op de account en geeft terug wat de server zette.
 *
 * `basis` is de `bijgewerkt_op` waar deze keuze op voortbouwt, of `null` als de
 * account nog geen rij had. Zo bepaalt de server wat de laatste keuze is:
 *
 *   - `basis === null` → insert; 23505 (iemand was eerder) is een `conflict`;
 *   - anders een update die alleen slaagt als `bijgewerkt_op` nog precies
 *     `basis` is; nul rijen is een `conflict`.
 *
 * Bij een `conflict` is de aanroeper aan zet: opnieuw lezen, en dan wint de
 * account (zie `verzoenVoorkeur`). ⚠️ `basis` gaat als de string die de server
 * gaf; nooit via `new Date()`, want dat kapt de microseconden af en dan slaagt
 * de vergelijking nooit meer.
 *
 * Een andere mislukking is `netwerk`: de keuze staat dan nog lokaal met `wacht`,
 * en de volgende start probeert het opnieuw. Een kleurkeuze die niet meteen
 * overkomt is geen reden voor een foutscherm.
 */
export async function bewaarAccountVoorkeur(
  userId: string,
  invoer: Uiterlijkvoorkeur,
  basis: string | null,
): Promise<BewaarUitkomst> {
  const voorkeur = normaliseerVoorkeur(invoer);
  // Servergevalideerd door de CHECK's; dit is dezelfde regel aan de clientkant.
  if (!voorkeurSchema.safeParse(voorkeur).success) return { ok: false, reden: 'netwerk' };

  return basis === null ? maakRij(userId, voorkeur) : wijzigRij(userId, voorkeur, basis);
}

async function maakRij(userId: string, voorkeur: Uiterlijkvoorkeur): Promise<BewaarUitkomst> {
  const nieuw = await supabase()
    .from('gebruikersvoorkeuren')
    .insert({
      user_id: userId,
      stijl: voorkeur.stijl,
      kleurvariant: voorkeur.kleurvariant,
      weergave: voorkeur.weergave,
      dichtheid: voorkeur.dichtheid,
      emoji: voorkeur.emoji,
    })
    .select('bijgewerkt_op')
    .single();
  if (!nieuw.error) return uitSchrijf(nieuw.data, voorkeur);
  if (nieuw.error.code === AL_AANWEZIG) return { ok: false, reden: 'conflict' };
  console.error('uiterlijk.bewaar.insert', nieuw.error.message);
  reportError(
    new Error('De uiterlijkvoorkeur kon niet aangemaakt worden'),
    'uiterlijk.bewaar.insert',
    {
      code: nieuw.error.code ?? null,
      user_id: userId,
    },
  );
  return { ok: false, reden: 'netwerk' };
}

async function wijzigRij(
  userId: string,
  voorkeur: Uiterlijkvoorkeur,
  basis: string,
): Promise<BewaarUitkomst> {
  // ⚠️ `.select()` erbij: een PATCH die nul rijen raakt geeft 204 en `error ===
  //    null`. Met `return=representation` is dat een lege lijst en dus te zien.
  //    Alle vijf de kolommen gaan mee: de CHECK koppelt stijl en variant, dus
  //    een update van alleen `stijl` kan 23514 geven.
  const bestaand = await supabase()
    .from('gebruikersvoorkeuren')
    .update({
      stijl: voorkeur.stijl,
      kleurvariant: voorkeur.kleurvariant,
      weergave: voorkeur.weergave,
      dichtheid: voorkeur.dichtheid,
      emoji: voorkeur.emoji,
    })
    .eq('user_id', userId)
    .eq('bijgewerkt_op', basis)
    .select('bijgewerkt_op');
  if (bestaand.error) {
    console.error('uiterlijk.bewaar.update', bestaand.error.message);
    reportError(
      new Error('De uiterlijkvoorkeur kon niet bijgewerkt worden'),
      'uiterlijk.bewaar.update',
      {
        code: bestaand.error.code ?? null,
        user_id: userId,
      },
    );
    return { ok: false, reden: 'netwerk' };
  }
  const rijen = Array.isArray(bestaand.data) ? bestaand.data : [];
  return rijen.length === 0 ? { ok: false, reden: 'conflict' } : uitSchrijf(rijen[0], voorkeur);
}

function uitSchrijf(rij: unknown, voorkeur: Uiterlijkvoorkeur): BewaarUitkomst {
  const tijd = (rij as { bijgewerkt_op?: unknown } | null)?.bijgewerkt_op;
  return typeof tijd === 'string'
    ? { ok: true, voorkeur, bijgewerktOp: tijd }
    : { ok: false, reden: 'netwerk' };
}
