import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { type Pagina, type RpcRij } from '../../shared/api';
import { t } from '../../shared/i18n';
import { isHeldsleutel, isTrigger, type Heldsleutel, type Trigger } from './helden';

/**
 * De heldenlijst van een open groep — QS8-493, RPC uit migratie 0268 (QS8-477).
 *
 * ⚠️ **De grens zit in de database en niet hier.** `groep_helden()` toetst
 *    `lid_van_open_groep()` en geeft in een beschermde groep nul rijen terug,
 *    net als `groep_klassement()`. Deze module verbergt dus niets — hij toont
 *    wat hij krijgt. Een scherm dat de regel zélf zou moeten kennen, is een
 *    regel die met één verzoek aan PostgREST te omzeilen valt.
 *
 * ⚠️⚠️ **Er komt hier nooit een tijdstip binnen, en dat is een besluit van
 *    0268 en geen omissie.** De RPC heeft die kolom niet: zonder venster zou
 *    "Ignis is langs geweest" een permanent merkteken worden, dus valt alles
 *    ouder dan zeven dagen eruit. Wie "vandaag" of "gisteren" wil tonen, vraagt
 *    een nieuwe kolom in de RPC — dat is een eigen afweging en niet iets wat je
 *    er in een component bij rekent. Zelfde reden als waarom `klassement.ts`
 *    geen delta kent.
 *
 * ⚠️ **Deze lijst staat op een eigen kaart en niet naast het klassement**, en
 *    dat is besloten bij QS8-493. `trigger = 'misser'` betekent dat iemand iets
 *    gemist heeft; dat is in een open groep toegestaan (A41, rij 37 in
 *    `docs/decisions/002-domeinregel7-oppervlakken.md`), maar naast een
 *    ranglijstpositie wordt het een ranglijst mét schandpaal. De regel staat
 *    toe wát er zichtbaar is, niet wáárnaast het hoort.
 */

/** Eén regel uit de heldenlijst: wie, welke held, en waarom hij langskwam. */
export interface Groepsheldrij {
  readonly userId: string;
  readonly naam: string;
  readonly held: Heldsleutel;
  readonly trigger: Trigger;
}

/**
 * ⚠️ Twintig, gelijk aan `KLASSEMENT_PER_PAGINA`, en net als daar bewust een
 *    eigen constante: één gedeeld getal maakt van een latere wijziging aan het
 *    ene oppervlak stilzwijgend een wijziging aan het andere.
 */
export const GROEPSHELDEN_PER_PAGINA = 20;

type RpcGroepsheld = RpcRij<{
  user_id: string;
  display_name: string;
  hero_key: string;
  trigger: string;
  totaal: number;
}>;

/**
 * Zet één RPC-rij om, of `null` als hij onbruikbaar is.
 *
 * ⚠️ **`isHeldsleutel()` en `isTrigger()` en niet een cast**, en dat is hier
 *    meer dan hygiëne: `hero_key` en `trigger` zijn in de database CHECK-kolommen
 *    (0264) waarvan `helden.ts` het register is. Komt er ooit een zevende held
 *    of een zevende trigger bij in de database zonder dat dit register meegaat,
 *    dan valt die rij hier weg in plaats van door te lekken naar een `t()` die
 *    een sleutel opzoekt die niet bestaat. Dezelfde keuze als `naarRij()` in
 *    `klassement.ts`: de gegenereerde typen beschrijven wat de functie belóóft,
 *    niet wat er over de lijn komt.
 */
function naarRij(rij: RpcGroepsheld): Groepsheldrij | null {
  if (typeof rij.user_id !== 'string') return null;
  if (!isHeldsleutel(rij.hero_key)) return null;
  if (!isTrigger(rij.trigger)) return null;

  return {
    userId: rij.user_id,
    naam: rij.display_name ?? '',
    held: rij.hero_key,
    trigger: rij.trigger,
  };
}

/**
 * De heldenlijst van een open groep.
 *
 * Geeft een lege pagina in een beschermde groep, en ook aan een niet-lid en aan
 * een uitgezet lid. Dat onderscheid bestaat bewust niet: alle drie krijgen ze
 * nul rijen van de RPC, en een aanroeper die het verschil kon zien, zou daarmee
 * kunnen uitlezen of een groep open staat zonder er lid van te zijn. Woordelijk
 * dezelfde afweging als bij `fetchKlassement()`.
 */
export async function fetchGroepshelden(
  groupId: string,
  opties: { readonly pagina?: number } = {},
): Promise<Pagina<Groepsheldrij>> {
  const pagina = opties.pagina ?? 0;
  const van = pagina * GROEPSHELDEN_PER_PAGINA;

  const { data, error } = await supabase().rpc('groep_helden', {
    p_group_id: groupId,
    p_limit: GROEPSHELDEN_PER_PAGINA,
    p_offset: van,
  });

  if (error) {
    reportError(error, 'heroes.group_list', { group_id: groupId });
    throw new Error(t('groepshelden.laden_mislukt'));
  }

  const ruw = (data ?? []) as readonly RpcGroepsheld[];
  const rijen = ruw.map(naarRij).filter((rij): rij is Groepsheldrij => rij !== null);

  // ⚠️ Onbruikbare rijen gaan óók van het totaal af — dezelfde aftrek als in
  //    `fetchKlassement()`. Zonder die aftrek blijft "meer" op waar staan en
  //    biedt de UI een volgende pagina aan die leeg terugkomt.
  const overgeslagen = ruw.length - rijen.length;
  const totaal = Math.max(0, (ruw[0]?.totaal ?? rijen.length) - overgeslagen);

  return { rijen, totaal, meer: van + rijen.length < totaal };
}
