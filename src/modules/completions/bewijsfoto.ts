import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';
import { now } from '../../shared/time';

import type { Resultaat } from '../goals';

/**
 * Een foto als bewijs bij een voltooiing — QS8-391, PRD 7.3b.
 *
 * ⚠️ **Waarom dit naast `buddies/chatfoto.ts` staat en er niet in.** De vorm is
 *    bewust gekopieerd — bucketconstante, padbouwer, keuring, tekenen per lijst
 *    — maar de sleutel is een andere: een chatfoto hoort bij een **groep**, een
 *    bewijsfoto bij een **weekdoel**. Dat verschil is geen detail maar de reden
 *    dat 0227 een eigen bucket neerzet: een chatbericht hangt aan precies één
 *    groep, een voltooiing aan een doel dat aan nul of meer groepen hangt.
 *
 *    Samenvoegen zou bovendien een verhuizing zijn, en CLAUDE.md noemt dat de
 *    gevaarlijkste beweging die er is: de tests verhuizen mee en blijven groen,
 *    want ze toetsen wat er in het bestand staat en niet wat het bestand
 *    beloofde. Dat is een eigen opruimissue en geen bijvangst hier.
 *
 * ⚠️ Wat wél gedeeld wordt is `kiesFoto()` uit `shared/ui` — dat is een
 *    platformvermogen en geen sleutelbeslissing.
 */

/**
 * ⚠️ Een letterlijke constante en geen berekening. `scripts/storage-controle.mjs`
 *    vindt alleen letterlijke strings in `.storage.from(...)`, en een bucket die
 *    die controle niet ziet, is een bucket zonder controle. Om diezelfde reden
 *    delen `chatfoto.ts` en dit bestand geen bucketvariabele.
 */
export const BEWIJSFOTO_BUCKET = 'bewijsfotos';

/**
 * Hoe lang een ondertekende bewijsfoto-URL geldig is: een kwartier.
 *
 * ⚠️ **Korter dan de chat, en dat is een keuze.** Een ondertekende URL is een
 *    bearer token: eenmaal getekend werkt hij voor iedereen die hem heeft,
 *    ongeacht RLS. Dat is niet te sluiten — dezelfde klasse als een
 *    schermafdruk — en de geldigheidsduur is de enige rem. Een chatfoto wordt
 *    doorgescrold en opnieuw bekeken; een bewijsfoto wordt één keer bekeken bij
 *    het beoordelen, dus daar kost een kwartier niets en scheelt het drie
 *    kwartier blootstelling.
 */
export const BEWIJSFOTO_GELDIGHEID_S = 900;

/**
 * De beeldtypes die de bucket accepteert.
 *
 * ⚠️ Een kopie van `allowed_mime_types` in migratie 0227 — de bucket is de
 *    grendel (onwrikbare regel 3), deze lijst is het gemak. Een test legt ze in
 *    **beide richtingen** naast elkaar: een type dat hier staat en daar niet
 *    geeft een upload die pas op de server sneuvelt, en andersom een lijst die
 *    ruimer is dan de app denkt.
 */
export const BEWIJSFOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** De grens die 0227 op de bucket zet: 1 MB. */
export const BEWIJSFOTO_MAX_BYTES = 1_048_576;

const EXTENSIE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Het pad waar dit bewijs komt te staan: `<weekdoel>/<eigenaar>/<naam>.<ext>`.
 *
 * ⚠️⚠️ **Het eerste segment is het weekdoel en niet een groep.** Daar hangen de
 *    policies van 0227 aan, én de CHECK van 0229 die het pad naast de
 *    `weekly_goal_id` en `user_id` van de voltooiingsrij legt. Bouw dit pad
 *    nooit met de hand ergens anders: dan bestaat de vorm op twee plekken en
 *    loopt er ooit een uit de pas.
 *
 * ⚠️ De extensie komt uit de MIME-tabel en niet uit de bestandsnaam die de
 *    gebruiker aanlevert. Een `.PNG` of een `.tar.gz` haalt de CHECK van 0229
 *    dus nooit, en het pad is per constructie in kleine letters — waar 0225 voor
 *    de chat nog een reparatie voor nodig had.
 */
export function bewijsfotoPad(weeklyGoalId: string, ownerId: string, mime: string): string {
  const ext = EXTENSIE[mime] ?? 'jpg';
  const uniek = `${now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${weeklyGoalId}/${ownerId}/${uniek}.${ext}`;
}

/** Wat er mis is met dit bestand, of `null` als het door mag. */
export function keurBewijsfoto(bytes: number, mime: string): string | null {
  if (!(BEWIJSFOTO_TYPES as readonly string[]).includes(mime)) {
    return t('bewijsfoto.type_niet_toegestaan');
  }
  if (bytes > BEWIJSFOTO_MAX_BYTES) return t('bewijsfoto.te_groot');
  return null;
}

/**
 * Zet het bewijs in de bucket en geeft het pad terug.
 *
 * ⚠️ **Alleen uploaden, niet koppelen.** Het pad gaat mee in de `insert` van de
 *    voltooiing, want `completions` is append-only (domeinregel 6) en heeft geen
 *    UPDATE-grant: `attachment_url` is **alleen bij INSERT** te zetten (0229
 *    §2). Die volgorde — eerst uploaden, dan invoegen — is daarmee geen
 *    stijlkeuze maar de enige die werkt, en de compenserende opruiming hoort bij
 *    de aanroeper.
 */
export async function uploadBewijsfoto(
  weeklyGoalId: string,
  ownerId: string,
  bestand: { readonly data: ArrayBuffer | Uint8Array; readonly mime: string },
): Promise<Resultaat<string>> {
  const bezwaar = keurBewijsfoto(bestand.data.byteLength, bestand.mime);
  if (bezwaar !== null) return { ok: false, melding: bezwaar };

  const pad = bewijsfotoPad(weeklyGoalId, ownerId, bestand.mime);

  const gezet = await supabase().storage.from(BEWIJSFOTO_BUCKET).upload(pad, bestand.data, {
    contentType: bestand.mime,
    upsert: false,
  });

  if (gezet.error) {
    reportError(gezet.error, 'bewijsfoto.upload', { weekly_goal_id: weeklyGoalId });
    // ⚠️ Het dagplafond van 0228 komt hier ook binnen, en die is te onderscheiden
    //    van een netwerkfout — dat was precies de klacht die 0226 opriep. De
    //    melding blijft verder algemeen: een storage-fout draagt soms het pad, en
    //    dat pad noemt twee uuid's.
    const rem = /Te veel bewijsfoto/.test(gezet.error.message ?? '');
    return { ok: false, melding: t(rem ? 'bewijsfoto.rem_bereikt' : 'bewijsfoto.uploaden_mislukt') };
  }

  return { ok: true, waarde: pad };
}

/** Haalt een bewijsfoto weg. Faalt stil: de aanroeper heeft de rij al opgeruimd. */
export async function verwijderBewijsfoto(pad: string): Promise<void> {
  const { error } = await supabase().storage.from(BEWIJSFOTO_BUCKET).remove([pad]);
  if (error) reportError(error, 'bewijsfoto.verwijderen');
}

/**
 * Ondertekent een lijst paden in één ronde.
 *
 * ⚠️ Een pad dat niet getekend kan worden, komt niet in de map en wordt bij de
 *    aanroeper `null`. Een beoordelingslijst die niet laadt omdat één bewijs weg
 *    is, zou een verwijderd bestand tot een kapotte wachtrij maken.
 */
export async function tekenBewijsfotos(
  paden: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  const uniek = [...new Set(paden.filter((p): p is string => typeof p === 'string' && p !== ''))];
  if (uniek.length === 0) return new Map();

  const { data, error } = await supabase()
    .storage.from(BEWIJSFOTO_BUCKET)
    .createSignedUrls(uniek, BEWIJSFOTO_GELDIGHEID_S);

  if (error) {
    reportError(error, 'bewijsfoto.tekenen', { aantal: uniek.length });
    return new Map();
  }

  const uit = new Map<string, string>();
  for (const rij of data ?? []) {
    if (rij.error === null && typeof rij.signedUrl === 'string' && typeof rij.path === 'string') {
      uit.set(rij.path, rij.signedUrl);
    }
  }
  return uit;
}

/**
 * Vervangt de paden in een lijst rijen door ondertekende URL's.
 *
 * ⚠️⚠️ **Wat er niet getekend kon worden, wordt `null` — en die regel kent geen
 *    uitzondering.** In `avatar.ts` stond hier ooit `if (getekend.size === 0)
 *    return rijen;` als zuinigheid, en dat was een gat: levert het tekenen
 *    níéts op, dan ging de lijst ongewijzigd terug met de kále paden erin. Een
 *    kaal pad in een `<Image>` is niet alleen kapot — het is de vorm waarin een
 *    vreemde URL zou meeliften als de CHECK van 0229 er ooit uit zou vallen.
 *    Twee sloten, en dit is het tweede.
 *
 * ⚠️ Één ronde tekenen voor de hele pagina, nooit per rij. Twintig openstaande
 *    beoordelingen is precies de schaal waarop een N+1 pijn doet
 *    (schaalbaarheidsregel 12).
 */
export async function metGetekendeBewijsfotos<T, K extends keyof T>(
  rijen: readonly T[],
  veld: K,
): Promise<readonly T[]> {
  if (rijen.length === 0) return rijen;

  const paden = rijen.map((r) => r[veld] as unknown as string | null);
  const getekend = await tekenBewijsfotos(paden);

  return rijen.map((rij) => {
    const pad = rij[veld] as unknown as string | null;
    const url = pad === null ? null : (getekend.get(pad) ?? null);
    return { ...rij, [veld]: url } as T;
  });
}
