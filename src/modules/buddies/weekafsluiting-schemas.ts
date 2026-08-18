import { z } from 'zod';

/**
 * De regels van de weekafsluiting, zonder Supabase en zonder React Native —
 * QS8-73.
 *
 * ⚠️ Geen import uit `api.ts` of `weekafsluiting.ts`: die trekken de
 *    Supabase-client mee en daarmee React Native, in tests die in Node draaien.
 */

/** Gelijk aan `week_reviews_tekstlengte` uit migratie 0026. */
export const ANTWOORD_MAX = 2000;
/** Gelijk aan `week_review_replies_body_len` uit migratie 0026. */
export const REACTIE_MAX = 1000;

/**
 * De drie vragen, in deze volgorde.
 *
 * ⚠️ Vraag 2 is de enige plek in de hele app waar tegenslag benoemd wordt, en dat
 *    is de eerste van precies twee routes waarlangs tegenslag de groep bereikt
 *    (domeinregel 7; de tweede is de hulpknop van de Risico-radar). De toon van
 *    de hint doet hier het echte werk: het moet voelen als een vergadering waar
 *    dit de normale vraag is, niet als een bekentenis. Vandaar "wat zat in de
 *    weg" en niet "wat is er niet gelukt" — het eerste gaat over de omstandigheid,
 *    het tweede over de persoon.
 *
 * ⚠️ Alle drie zijn optioneel. Overslaan mag, en wie niets invult verschijnt niet
 *    op de kaart. Er is nergens een "X heeft niet gereageerd", en de database kan
 *    het niet eens: zonder rij is er niets om te tonen.
 */
export const VRAGEN = [
  {
    veld: 'did_text',
    label: 'Wat heb je gedaan?',
    hint: 'Voorgevuld uit je Dagzetten van deze week. Pas aan wat je wilt.',
    placeholder: 'Drie ochtenden geschreven, samen ongeveer vier uur.',
  },
  {
    veld: 'blocked_text',
    label: 'Wat zat in de weg?',
    hint: 'De enige plek waar dit hoort. Je groep leest mee om te helpen, niet om te beoordelen.',
    placeholder: 'Twee avonden overwerk, en daarna kwam ik er niet meer in.',
  },
  {
    veld: 'next_text',
    label: 'Wat is je volgende week?',
    hint: 'Eén concrete zin is genoeg.',
    placeholder: 'Hoofdstuk drie af, en dinsdag een uur extra inplannen.',
  },
] as const;

export type AntwoordVeld = (typeof VRAGEN)[number]['veld'];

const antwoordTekst = z
  .string()
  .trim()
  .max(ANTWOORD_MAX, { error: `Maximaal ${ANTWOORD_MAX} tekens.` });

/**
 * ⚠️ De `refine` is de tegenhanger van `week_reviews_iets_ingevuld` uit migratie
 *    0026. Zonder hem levert "opslaan" met drie lege velden een lid op dat op de
 *    kaart staat met niets erin — precies wat "wie niets invult verschijnt gewoon
 *    niet" uitsluit. De database weigert het ook; deze regel zorgt dat je er geen
 *    netwerkronde en geen Postgres-jargon voor nodig hebt.
 */
export const weekafsluitingSchema = z
  .object({
    did_text: antwoordTekst,
    blocked_text: antwoordTekst,
    next_text: antwoordTekst,
  })
  .refine(
    (a) =>
      a.did_text.length > 0 || a.blocked_text.length > 0 || a.next_text.length > 0,
    { error: 'Vul minstens één vraag in. Alle drie overslaan mag ook — dan sla je niets op.' },
  );

export type WeekafsluitingInvoer = z.infer<typeof weekafsluitingSchema>;

export const reactieSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { error: 'Er staat nog niets in je reactie.' })
    .max(REACTIE_MAX, { error: `Maximaal ${REACTIE_MAX} tekens.` }),
});

// ---------------------------------------------------------------------------
// Wat er op de kaart staat
// ---------------------------------------------------------------------------

export interface Antwoord {
  readonly review_id: string;
  readonly user_id: string;
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly did_text: string | null;
  readonly blocked_text: string | null;
  readonly next_text: string | null;
  readonly created_at: string;
}

export interface Reactie {
  readonly id: string;
  readonly week_review_id: string;
  readonly author_id: string;
  readonly author_name: string;
  readonly author_avatar: string | null;
  readonly body: string;
  readonly created_at: string;
}

/**
 * De reacties per antwoord.
 *
 * ⚠️ Eén doorloop over de platte lijst en geen `filter` per antwoord. Bij twaalf
 *    leden is dat het verschil tussen twaalf doorlopen en één — dezelfde N+1 die
 *    het beslisdocument voor het groepsoverzicht met naam noemt, maar dan in de
 *    browser.
 */
export function groepeerReacties(
  reacties: readonly Reactie[],
): ReadonlyMap<string, readonly Reactie[]> {
  const per = new Map<string, Reactie[]>();

  for (const reactie of reacties) {
    const lijst = per.get(reactie.week_review_id);
    if (lijst === undefined) per.set(reactie.week_review_id, [reactie]);
    else lijst.push(reactie);
  }

  return per;
}

/** Heeft dit antwoord iets om te tonen? */
export function heeftInhoud(antwoord: Antwoord): boolean {
  return (
    (antwoord.did_text ?? '').trim() !== '' ||
    (antwoord.blocked_text ?? '').trim() !== '' ||
    (antwoord.next_text ?? '').trim() !== ''
  );
}

// ---------------------------------------------------------------------------
// Vraag 1 voorvullen uit de Dagzetten
// ---------------------------------------------------------------------------

/**
 * Maakt van de Dagzetten van deze periode een voorstel voor vraag 1.
 *
 * ⚠️ Een vóórstel, en niets meer. Het staat in een veld dat de gebruiker moet
 *    bevestigen, met een hint erbij dat het uit zijn Dagzetten komt. Dat is geen
 *    formaliteit: de Dagzet is standaard privé (domeinregel 9) en de
 *    weekafsluiting is niet privé. Zou dit ergens automatisch verstuurd worden,
 *    dan is een privé dagboek stilzwijgend een groepsbericht geworden — en dan is
 *    de belofte "standaard privé" gebroken door de app zelf.
 *
 * ⚠️ Oudste eerst, want dat leest als een week en niet als een omgekeerde lijst.
 *    `fetchDagzetten()` levert nieuwste eerst, dus deze functie sorteert zelf.
 *    Sorteren op `local_date` en niet op tijd: de Dagzet hoort bij een dag in de
 *    tijdzone van de gebruiker, en dat is precies wat die kolom vastlegt.
 *
 * ⚠️ Geen datums in de tekst. Die zouden hier opgemaakt moeten worden en dat is
 *    een tijdberekening buiten `shared/time` (CLAUDE.md, correctheidsregel 7).
 *    Wat de week deed, staat in de regels zelf.
 */
export function voorstelUitDagzetten(
  dagzetten: readonly { readonly body: string; readonly local_date: string }[],
): string {
  const regels = [...dagzetten]
    .sort((a, b) => (a.local_date === b.local_date ? 0 : a.local_date < b.local_date ? -1 : 1))
    .map((d) => d.body.trim())
    .filter((body) => body !== '');

  // Twee keer dezelfde regel op twee dagen is één regel in een samenvatting.
  const uniek = [...new Set(regels)];

  const voorstel = uniek.join('\n');
  return voorstel.length <= ANTWOORD_MAX ? voorstel : voorstel.slice(0, ANTWOORD_MAX).trimEnd();
}
