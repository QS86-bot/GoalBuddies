import { z } from 'zod';

import { t, type Sleutel } from '../../shared/i18n';
import { kapAf } from '../../shared/tekst';

import { voegOplopendSamen } from './merge';

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
/**
 * ⚠️ **Een functie en geen constante** — QS8-115. Een `const` met `t()` erin
 *    wordt één keer bij het importeren opgebouwd, en dat is vóórdat het profiel
 *    geladen is; de taal staat dan vast op de apparaattaal. Zelfde val als bij
 *    `BEVESTIGING` in `shared/ui` en de meldingentabellen in de andere modules.
 *
 * ⚠️ `AntwoordVeld` blijft wél een type over de constante veldnamen. Die zijn
 *    kolomnamen en geen tekst; die veranderen niet met de taal.
 */
export function vragen() {
  return VELDEN.map((veld, i) => ({
    veld,
    label: t(`weekafsluiting.v${i + 1}.label` as Sleutel),
    hint: t(`weekafsluiting.v${i + 1}.hint` as Sleutel),
    placeholder: t(`weekafsluiting.v${i + 1}.voorbeeld` as Sleutel),
  }));
}

const VELDEN = ['did_text', 'blocked_text', 'next_text'] as const;


export type AntwoordVeld = (typeof VELDEN)[number];

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
    { error: () => t('weekafsluiting.leeg') },
  );

export type WeekafsluitingInvoer = z.infer<typeof weekafsluitingSchema>;

export const reactieSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { error: () => t('weekafsluiting.reactie_leeg') })
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

/**
 * Voegt een volgende pagina reacties bij de reacties die er al staan.
 *
 * ⚠️ Ontdubbelen op id, want tussen twee pagina's kan er een reactie bijkomen en
 *    dan schuift de offset. Zonder dit staat dezelfde reactie twee keer op de
 *    kaart — en dat leest als iemand die zichzelf herhaalt.
 *
 * ⚠️ Deze functie stond eerst in `app/groep/weekafsluiting/[id].tsx`, en dat was
 *    domeinlogica in een scherm. Bevinding van de code-review op EPIC 7.
 */
export function voegReactiesSamen(
  bestaand: readonly Reactie[],
  nieuw: readonly Reactie[],
): readonly Reactie[] {
  return voegOplopendSamen(bestaand, nieuw);
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
 * De beginwaarde van vraag 1 — QS8, de rij van 18-08 in ENGINEER-REVIEW.
 *
 * ⚠️ **Neemt het voorstel bewust niet aan, en dat is de hele functie.** Vraag 1
 *    stond tot 27-08-2026 voorgevuld met je eigen Dagzetten. De Dagzet is
 *    standaard privé (domeinregel 9); de weekafsluiting is dat niet. Met een
 *    voorinvulling is de standaard dus "delen", en moet je actief wegkijken en
 *    wissen om dat níét te doen — de omgekeerde volgorde van wat dit project
 *    overal elders aanhoudt.
 *
 *    De signatuur ís de bescherming: er is geen parameter waar het voorstel in
 *    kan. Wie het er tóch in wil, moet deze functie veranderen, en dan valt
 *    `tests/beloftes/dagzet-privacy.test.ts` om.
 */
export function beginwaardeVraag1(opgeslagen: string | null | undefined): string {
  return opgeslagen ?? '';
}

/**
 * Mag de knop "overnemen uit mijn Dagzetten" nu getoond worden?
 *
 * ⚠️ De derde voorwaarde — het veld moet leeg zijn — voorkomt dat één tik
 *    getypte tekst overschrijft. Overnemen is een gemak en mag nooit iets
 *    weggooien.
 */
export function magOvernemenUitDagzetten(invoer: {
  readonly voorstel: string;
  readonly huidig: string;
}): boolean {
  return invoer.voorstel.trim() !== '' && invoer.huidig.trim() === '';
}

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

  // ⚠️ `kapAf()` en niet `slice()` — QS8-118. `slice()` snijdt op een
  //    UTF-16-grens en houdt bij een emoji een halve codepoint over, die als `�`
  //    in de samenvatting van de gebruiker belandt. `kapAf()` telt bovendien in
  //    codepunten, en dat is de eenheid waarin `week_reviews_tekstlengte` telt.
  return kapAf(uniek.join('\n'), ANTWOORD_MAX).trimEnd();
}
