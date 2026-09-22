import { reportError } from '../../lib/observability';
import { type Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { type Resultaat } from '../../shared/api';
import { t, type Sleutel } from '../../shared/i18n';
import { schoneVrijeTekst } from '../../shared/tekst';

import { type Meldreden } from './veiligheid-schemas';

/**
 * Melden, blokkeren en een lid verwijderen — QS8-232, migratie 0145.
 *
 * ⚠️ **Dit bestand bestaat omdat 0144 vreemden bij elkaar in een groep heeft
 *    gezet.** Tot die dag bestond elke groep uit mensen die elkaar kenden en werd
 *    wangedrag buiten de app afgehandeld. Die rem is weg.
 *
 * ⚠️ **De gemelde persoon merkt niets, en dat is een eigenschap van de database
 *    en niet van dit bestand.** `reports_select` noemt de melder en de beheerder
 *    en sluit de gemelde met zoveel woorden uit — óók als die beheerder is. Dit
 *    scherm kan die belofte dus niet breken, en dat is precies de bedoeling.
 *
 * ⚠️ **Een blokkade werkt twee kanten op en zegt dat nooit.** Wie jij blokkeert,
 *    komt niet in een groep waar jij in zit — en andersom. `user_blocks_select`
 *    laat alleen de blokkeerder zijn eigen rijen zien; er is geen manier om te
 *    weten dat je geblokkeerd bent, en dat is geen omissie.
 */

function meldingBijReden(reden: string | undefined): string {
  const bekend: Readonly<Record<string, Sleutel>> = {
    rate_limited: 'melden.te_veel',
    not_member: 'melden.geen_lid',
    unknown_message: 'melden.bericht_weg',
    unknown_subject: 'melden.onbekend',
    self: 'melden.jezelf',
    not_admin: 'melden.geen_beheerder',
    not_confirmed: 'melden.niet_bevestigd',
    already_removed: 'melden.al_verwijderd',
    last_admin: 'melden.laatste_beheerder',
    blocked: 'melden.geblokkeerd',
    // ⚠️ QS8-586 — de afhandelroute. `not_allowed` dekt zowel "je mag deze
    //    melding niet beoordelen" als "deze melding bestaat niet", en dat is
    //    met opzet één tekst: anders vertelt de melding of een id bestaat.
    not_allowed: 'meldingen.niet_van_jou',
    already_handled: 'meldingen.al_afgehandeld',
    status_invalid: 'meldingen.afhandelen_mislukt',
    not_authenticated: 'meldingen.afhandelen_mislukt',
  };

  const sleutel = reden === undefined ? undefined : bekend[reden];
  return t(sleutel ?? 'melden.mislukt');
}

interface Uitkomst {
  ok?: boolean;
  reason?: string;
  ontkoppelde_doelen?: number;
}

/**
 * Meld een bericht of een persoon.
 *
 * ⚠️ **Bij een bericht gaat `subjectId` niet mee, en dat is geen versimpeling.**
 *    De database leest `sender_id` uit het bericht zelf; zou de client zeggen wie
 *    hij meldt, dan kan hij een melding over A aan een bericht van B hangen.
 */
export async function meldBericht(
  groupId: string,
  messageId: string,
  reden: Meldreden,
  toelichting: string,
): Promise<Resultaat<true>> {
  return await stuurMelding({
    p_group_id: groupId,
    p_message_id: messageId,
    p_reden: reden,
    p_toelichting: toelichting.trim() === '' ? null : toelichting,
  });
}

export async function meldPersoon(
  groupId: string,
  subjectId: string,
  reden: Meldreden,
  toelichting: string,
): Promise<Resultaat<true>> {
  return await stuurMelding({
    p_group_id: groupId,
    p_subject_id: subjectId,
    p_reden: reden,
    p_toelichting: toelichting.trim() === '' ? null : toelichting,
  });
}

async function stuurMelding(argumenten: {
  p_group_id: string;
  p_subject_id?: string;
  p_message_id?: string;
  p_reden: Meldreden;
  p_toelichting: string | null;
}): Promise<Resultaat<true>> {
  // ⚠️ Zelfde reden als in `beslisDeadlineVerzoek()`: `reports.toelichting`
  //    draagt sinds 0284 de twee regels en deze route kent geen Zod-schema.
  //    QS8-507.
  //
  // ⚠️ **`p_reden` gaat er met opzet niet langs**, en `bericht_kopie` evenmin:
  //    de eerste is een enum en de tweede zet `meld()` zelf uit
  //    `chat_messages.body`. Allebei staan ze mét hun meting in de kop van 0284.
  const schoneToelichting = schoneVrijeTekst(argumenten.p_toelichting ?? '');

  const { data, error } = await supabase().rpc('meld', {
    ...argumenten,
    p_toelichting: schoneToelichting === '' ? null : schoneToelichting,
  });

  if (error) {
    // ⚠️ Geen `subject_id` in de context. Een melding is stil, en een sink is
    //    een plek waar iemand anders meeleest.
    reportError(error, 'safety.report', { group_id: argumenten.p_group_id });
    return { ok: false, melding: t('melden.mislukt') };
  }

  const uit = data as unknown as Uitkomst;
  if (uit.ok !== true) return { ok: false, melding: meldingBijReden(uit.reason) };

  return { ok: true, waarde: true };
}

/** Hoeveel meldingen je vandaag nog mag doen, of `null` als dat niet te bepalen is. */
export async function fetchMeldingenOver(): Promise<number | null> {
  const { data, error } = await supabase().rpc('meldingen_over');

  if (error) {
    reportError(error, 'safety.reports_left');
    return null;
  }

  return typeof data === 'number' ? data : null;
}

/**
 * Blokkeer iemand.
 *
 * ⚠️ **Dit zet niemand uit een groep waar hij al in zit**, en de tekst bij de
 *    knop zegt dat ook. Zou blokkeren verwijderen, dan ís de blokkade een luide
 *    mededeling aan de geblokkeerde — hij vliegt eruit op het moment dat jij
 *    drukt. Blokkeren werkt vooruit.
 */
export async function blokkeer(userId: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('blokkeer', { p_user: userId });

  if (error) {
    reportError(error, 'safety.block');
    return { ok: false, melding: t('melden.mislukt') };
  }

  const uit = data as unknown as Uitkomst;
  if (uit.ok === true) return { ok: true, waarde: true };

  // ⚠️⚠️ **`rate_limited` betekent hier iets anders dan bij melden.** De gedeelde
  //    tabel mapt hem op `melden.te_veel`, en die zin noemt *twintig meldingen* —
  //    hier gaat het om blokkades en om een heel ander getal. Op de knop
  //    "blokkeer deze persoon" is een verkeerd getal geen schoonheidsfout: dit
  //    is de handeling waar 0203 met opzet géén rem op zette, en wie hem raakt
  //    moet lezen wat er echt aan de hand is en wat er wél kan. Zie 0276.
  if (uit.reason === 'rate_limited') {
    return { ok: false, melding: t('melden.te_veel_blokkades') };
  }

  return { ok: false, melding: meldingBijReden(uit.reason) };
}

export async function deblokkeer(userId: string): Promise<Resultaat<true>> {
  const { error } = await supabase().rpc('deblokkeer', { p_user: userId });

  if (error) {
    reportError(error, 'safety.unblock');
    return { ok: false, melding: t('melden.mislukt') };
  }

  return { ok: true, waarde: true };
}

export interface Blokkade {
  readonly userId: string;
  readonly naam: string;
  readonly sinds: string;
}

/**
 * Wie jij geblokkeerd hebt.
 *
 * ⚠️ **Via een RPC en niet via de tabel, en dat is geen voorkeur.**
 *    `profiles_select` laat `display_name` alleen door voor wie een groep met je
 *    deelt, en iemand die je geblokkeerd hebt deelt er vaak geen meer. Een
 *    ingebedde join geeft dan een lijst met "Iemand" erin: een rij die je niet
 *    kunt thuisbrengen en dus niet durft op te heffen. `mijn_blokkades()` (0145)
 *    geeft uitsluitend je eigen lijst terug, en die mensen ken je per definitie.
 */
export async function fetchBlokkades(): Promise<readonly Blokkade[]> {
  const { data, error } = await supabase().rpc('mijn_blokkades');

  if (error) {
    reportError(error, 'safety.blocks');
    throw new Error(t('melden.blokkades_mislukt'));
  }

  return (data ?? []).map((rij) => ({
    userId: rij.user_id,
    naam: rij.display_name ?? t('melden.onbekend_lid'),
    sinds: rij.created_at,
  }));
}

/**
 * Zet een lid uit de groep.
 *
 * ⚠️ **`bevestigd` is geen formaliteit.** Dit neemt iemand zijn groep af,
 *    ontkoppelt zijn doelen en trekt zijn openstaande deadline-verzoeken in. De
 *    RPC weigert zonder, dus dit scherm is de tweede rem en niet de enige.
 */
export async function verwijderLid(
  groupId: string,
  userId: string,
  bevestigd: boolean,
): Promise<Resultaat<number>> {
  const { data, error } = await supabase().rpc('verwijder_lid', {
    p_group_id: groupId,
    p_user_id: userId,
    p_bevestigd: bevestigd,
  });

  if (error) {
    reportError(error, 'safety.remove_member', { group_id: groupId });
    return { ok: false, melding: t('melden.mislukt') };
  }

  const uit = data as unknown as Uitkomst;
  if (uit.ok !== true) return { ok: false, melding: meldingBijReden(uit.reason) };

  return { ok: true, waarde: uit.ontkoppelde_doelen ?? 0 };
}

/**
 * Een openstaande melding zoals de beoordelaar hem ziet — QS8-586, migratie 0296.
 *
 * ⚠️ **Zonder `reporter_id`, en dat is een eigenschap van de RPC en niet van dit
 *    bestand.** *RLS kan geen kolommen beperken*, dus de kolomlijst zit in
 *    `openstaande_meldingen()` zelf. Wie er meldde is niet nodig om te
 *    beoordelen, en weglaten beschermt de melder tegen een beheerder die het hem
 *    betaald zet. Wat er wél in zit is `meldingen_over_onderwerp` — *"vijf mensen
 *    melden dezelfde persoon"* is het signaal dat telt, en dat kan zonder één
 *    naam prijs te geven.
 */
export type OpenstaandeMelding =
  Database['public']['Functions']['openstaande_meldingen']['Returns'][number];

/** Waar de volgende pagina begint. Beide helften of geen van beide. */
export interface Meldingcursor {
  at: string;
  id: string;
}

/**
 * De meldingen die jij mag beoordelen.
 *
 * ⚠️ **Twee routes, en de RPC bepaalt welke voor jou geldt**: je bent beheerder
 *    van de groep en niet zelf het onderwerp, óf je bent platformbeheerder en het
 *    onderwerp is beheerder van die groep — het geval dat de groep per definitie
 *    niet kan afhandelen. 📏 Dat tweede is gemeten: vóór 0296 kwam een melding
 *    over de groepsbeheerder bij niemand aan die kon handelen.
 *
 * ⚠️ Beide cursorhelften of geen van beide, zelfde vorm als `fetchWachtrij()`:
 *    de RPC behandelt een half ingevulde cursor als "geen cursor", maar dat is de
 *    tweede grendel. Deze is de eerste — de fout is hier niet te máken.
 */
export async function fetchOpenstaandeMeldingen(
  opties: { limiet?: number; na?: Meldingcursor | null } = {},
): Promise<OpenstaandeMelding[]> {
  const na = opties.na ?? null;
  const argumenten =
    na === null
      ? { p_limit: opties.limiet ?? 20 }
      : { p_limit: opties.limiet ?? 20, p_na_at: na.at, p_na_id: na.id };

  const { data, error } = await supabase().rpc('openstaande_meldingen', argumenten);

  if (error) {
    reportError(error, 'safety.reports_queue');
    throw new Error(t('meldingen.laden_mislukt'));
  }

  return data ?? [];
}

/**
 * Handel een melding af.
 *
 * ⚠️ **`reports_update` is `false` en blijft dat.** Deze RPC is de enige weg naar
 *    een andere status, en hij legt vast wie het besloot en wanneer — een
 *    afhandeling zonder spoor is administratie en geen bewijs.
 *
 * ⚠️ Een tweede oordeel op dezelfde melding geeft `already_handled` en niet
 *    stilzwijgend succes: anders zou `afgehandeld_door` niet meer wie het besloot.
 */
export async function handelMeldingAf(
  meldingId: string,
  status: 'reviewed' | 'dismissed',
): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('handel_melding_af', {
    p_report_id: meldingId,
    p_status: status,
  });

  if (error) {
    reportError(error, 'safety.report_handle');
    return { ok: false, melding: t('meldingen.afhandelen_mislukt') };
  }

  const uit = data as unknown as Uitkomst;
  if (uit.ok !== true) return { ok: false, melding: meldingBijReden(uit.reason) };

  return { ok: true, waarde: true };
}
