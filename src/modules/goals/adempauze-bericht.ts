import type { Resultaat } from '../../shared/api';

/**
 * Een adempauze inplannen en daarna (optioneel) je groep laten weten — QS8-753.
 *
 * ⚠️ **Twee handelingen die elkaar nooit meenemen.** Besluit Quinten 19-11-2026:
 *    de pauze en het bericht zijn onafhankelijk. Eerst plannen, dan pas berichten;
 *    mislukt het plannen, dan gaat er geen bericht; mislukt het bericht, dan blijft
 *    de pauze staan. Er is hier bewust geen `annuleer` in `deps`: een pauze die
 *    achteraf verdwijnt omdat een chatbericht faalde, is een straf voor een storing
 *    die de gebruiker niet kon zien (domeinregel 5: nooit stilzwijgend iets doen).
 *
 * ⚠️ **Het bericht is een gewoon chatbericht** via het bestaande `stuurBericht`,
 *    geen systeemtype en geen migratie. Het is wat de gebruiker zegt en niet wat
 *    de app zegt, en dat verschil is de bescherming van domeinregel 7.
 *
 * ⚠️ **Injectie, want `goals` importeert `buddies` niet** (modulegrenzen). Het
 *    scherm geeft `stuurBericht` mee; deze functie kent alleen de vorm.
 */

export interface BerichtKeuze {
  /** Alleen `true` na een uitdrukkelijke handeling van de gebruiker. */
  readonly aan: boolean;
  readonly groupId: string;
  readonly tekst: string;
}

export type BerichtUitkomst = 'niet_gevraagd' | 'verstuurd' | { readonly mislukt: string };

export interface PauzeMetBerichtUitkomst {
  readonly pauze: Resultaat<string>;
  readonly bericht: BerichtUitkomst;
}

export interface PauzeMetBerichtDeps {
  readonly plan: () => Promise<Resultaat<string>>;
  readonly stuur: (groupId: string, tekst: string) => Promise<Resultaat<string>>;
}

/**
 * Wat er verstuurd wordt, of `null` als er niets te versturen is.
 *
 * Leeg na `trim` is "geen bericht" en geen fout: wie het voorstel wist, kiest
 * ervoor niets te zeggen. Een gekozen groep is vereist; zonder ontvanger gaat er
 * niets weg, hoe aan de schakelaar ook staat.
 */
export function berichtOmTeSturen(keuze: BerichtKeuze): { groupId: string; tekst: string } | null {
  const tekst = keuze.tekst.trim();
  if (!keuze.aan || keuze.groupId === '' || tekst === '') return null;

  return { groupId: keuze.groupId, tekst };
}

export async function pauzeMetBericht(
  deps: PauzeMetBerichtDeps,
  bericht: BerichtKeuze,
): Promise<PauzeMetBerichtUitkomst> {
  const pauze = await deps.plan();
  if (!pauze.ok) return { pauze, bericht: 'niet_gevraagd' };

  const te_sturen = berichtOmTeSturen(bericht);
  if (te_sturen === null) return { pauze, bericht: 'niet_gevraagd' };

  return { pauze, bericht: await stuurLos(deps, te_sturen) };
}

/** Alleen het bericht, voor "Bericht opnieuw versturen": de pauze staat al. */
export async function stuurLos(
  deps: Pick<PauzeMetBerichtDeps, 'stuur'>,
  bericht: { readonly groupId: string; readonly tekst: string },
): Promise<BerichtUitkomst> {
  const uitkomst = await deps.stuur(bericht.groupId, bericht.tekst);

  return uitkomst.ok ? 'verstuurd' : { mislukt: uitkomst.melding };
}

/** Een groep zoals het doelscherm hem kent: de koppeling van het doel. */
interface GekoppeldeGroep {
  readonly group_id: string;
  readonly name: string;
}

/** Een groep uit "mijn groepen": alleen wat de filter nodig heeft. */
interface MijnGroep {
  readonly id: string;
  readonly status: string;
}

export interface BerichtGroep {
  readonly id: string;
  readonly name: string;
}

/**
 * De groepen waar het bericht naartoe mag: gekoppeld aan dit doel, waar je lid
 * van bent, niet gearchiveerd.
 *
 * ⚠️ **Gebruiksgemak en geen grens.** `chat_messages_insert` blijft de controle
 *    (lid van de groep). Deze lijst voorkomt alleen dat je een groep aanbiedt waar
 *    het versturen toch weigert. `fetchMijnGroepen()` geeft alleen groepen terug
 *    die RLS aan jou laat zien en filtert archief al; de eigen filter hier staat
 *    er omdat dit geen aanname over een andere functie mag zijn.
 */
export function berichtGroepen(
  doelGroepen: readonly GekoppeldeGroep[],
  mijnGroepen: readonly MijnGroep[],
): readonly BerichtGroep[] {
  const levend = new Set(mijnGroepen.filter((g) => g.status !== 'archived').map((g) => g.id));

  return doelGroepen
    .filter((g) => levend.has(g.group_id))
    .map((g) => ({ id: g.group_id, name: g.name }));
}

/**
 * Mag er bij deze periode een bericht aan de groep? Niet als ze helemaal voorbij is.
 *
 * ⚠️ **Conservatief, en dat is domeinregel 7.** Een pauze die je achteraf aankondigt
 *    legt weken bloot die je niet gehaald hebt, en de berichtstap nodigt dan uit
 *    om dat te delen. Zo'n uitnodiging bestaat niet; typ je het zelf in de
 *    groepschat, dan is dat jouw keuze. De datum komt van de cyclus die
 *    `periodeUitDatums()` uit de klok haalde (`endDate` is de laatste dag, inclusief);
 *    hier wordt alleen vergeleken, nooit gerekend.
 */
export function berichtMagBij(periode: { readonly eind: { readonly endDate: string } }, vandaag: string): boolean {
  return periode.eind.endDate >= vandaag;
}

/** Een slot dat een tweede verzending afwijst zolang de eerste loopt (een `useRef` past erop). */
export interface Slot {
  current: boolean;
}

/**
 * "Bericht opnieuw versturen" met een rem tegen dubbel tikken — `null` als er al
 * een verzending loopt. Twee tikken voor de eerste klaar is zijn twee berichten in
 * de groepschat, en dat haal je niet terug (de afzender mag wel verwijderen, maar
 * de groep heeft het dan al gezien).
 */
export async function stuurLosMetRem(
  slot: Slot,
  deps: Pick<PauzeMetBerichtDeps, 'stuur'>,
  bericht: { readonly groupId: string; readonly tekst: string },
): Promise<BerichtUitkomst | null> {
  if (slot.current) return null;
  slot.current = true;
  try {
    return await stuurLos(deps, bericht);
  } finally {
    slot.current = false;
  }
}
