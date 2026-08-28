import { z } from 'zod';

import { t, weekdagNaam } from '../../shared/i18n';

import type { Weekday } from '../../shared/time';

/**
 * De invoer van de groepsschermen, plus het formaat van de uitnodigingscode.
 *
 * ⚠️ Dit bestand importeert bewust geen Supabase-client. Zou het dat wel doen,
 *    dan trekt elke test die deze regels wil controleren React Native mee — de
 *    valkuil die `shared/ui/naming.ts` en `modules/goals/cycles.ts` al eerder
 *    heeft opgeleverd.
 */

// ---------------------------------------------------------------------------
// De uitnodigingscode
// ---------------------------------------------------------------------------

/**
 * Hetzelfde alfabet als `generate_invite_code()` in migratie 0016: dertig
 * tekens, zonder 0/O, 1/I/L en U.
 *
 * ⚠️ Deze constante mag nooit uit elkaar lopen met de database. Staat hij hier
 *    ruimer, dan accepteert de app codes die de server nooit uitgeeft; staat hij
 *    krapper, dan weigert de app een geldige code voordat de server hem ziet.
 *    Er is een test die precies dit vastlegt.
 */
export const CODE_ALFABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTE = 12;

const CODE_PATROON = new RegExp(`^[${CODE_ALFABET}]{${CODE_LENGTE}}$`);

/**
 * Maakt van wat iemand plakt of typt een code die de server herkent.
 *
 * Mensen plakken links, typen met streepjes ertussen, en zetten er spaties
 * omheen. Ze typen ook een kleine l waar een 1 hoort en een O waar een 0 hoort —
 * behalve dat het alfabet die tekens juist niet kent, dus die twee omzettingen
 * zijn hier fout en gebeuren niet. Wat wel gebeurt: hoofdletters maken, en alles
 * weggooien wat niet in het alfabet zit.
 */
export function normaliseerCode(invoer: string): string {
  // ⚠️ Eerst de afsluitende schuine strepen eraf. Chat-apps en tekstverwerkers
  //    plakken die er graag achter, en `split('/').pop()` levert dan een lege
  //    string op — waarna de app de gebruiker een fout aanwrijft voor de link die
  //    hij letterlijk zo gekregen heeft.
  const zonderSlot = invoer.trim().replace(/[/\s]+$/, '');
  const zonderQuery = zonderSlot.split('?')[0] ?? '';
  const staart = zonderQuery.split('/').pop() ?? '';

  return staart
    .toUpperCase()
    .split('')
    .filter((teken) => CODE_ALFABET.includes(teken))
    .join('');
}

/** Heeft deze code de vorm die de server uitgeeft? Zegt niets over geldigheid. */
export function isCodeVorm(code: string): boolean {
  return CODE_PATROON.test(code);
}

/**
 * De code zoals hij op het scherm staat: drie blokjes van vier.
 *
 * Alleen voor de weergave — overal waar hij naar de server gaat, gaat hij zonder
 * streepjes.
 */
export function toonCode(code: string): string {
  const schoon = normaliseerCode(code);
  return (schoon.match(/.{1,4}/g) ?? []).join('-');
}

/** De deelbare link. Het pad komt overeen met `app/uitnodiging/[code].tsx`. */
export function uitnodigingsLink(basis: string, code: string): string {
  const schoon = basis.replace(/\/+$/, '');
  return `${schoon}/uitnodiging/${normaliseerCode(code)}`;
}

// ---------------------------------------------------------------------------
// Formulieren
// ---------------------------------------------------------------------------

/**
 * ⚠️ De grenzen zijn dezelfde als in `create_group()`. De server blijft de
 *    waarheid — dit schema is er om iemand niet met een foutmelding uit de
 *    database op te zadelen voor iets dat de app zelf kon zien.
 */
/**
 * De zichtbaarheidskeuze van een groep — besluit A41 (QS8-132).
 *
 * ⚠️ **`beschermd` staat vooraan en dat is de standaard, niet de eerste optie
 *    die toevallig bovenaan viel.** Grens 1 van het besluit: bestaande groepen
 *    zijn beschermd, en een groep die niets kiest ook. De database dwingt dat af
 *    met `default 'beschermd'` (migratie 0076); deze lijst mag daar nooit van
 *    afwijken.
 */
export const ZICHTBAARHEDEN = ['beschermd', 'open'] as const;
export type Zichtbaarheid = (typeof ZICHTBAARHEDEN)[number];

/**
 * Leest een zichtbaarheid uit iets waarvan je de vorm niet kent.
 *
 * ⚠️ **Onbekend is beschermd, en dat is de hele functie.** De gegenereerde types
 *    geven `groups.zichtbaarheid` als `string` terug, dus élke lezer moet
 *    versmallen — en elke lezer die dat met de hand doet, kan het één keer
 *    andersom opschrijven. Eén keer `=== 'beschermd' ? 'beschermd' : 'open'` is
 *    genoeg om een oudere server, een lege kolom of een tikfout als "open" te
 *    laten lezen, en dan dénkt de gebruiker dat hij iets deelt wat hij niet
 *    deelt — of erger, andersom.
 *
 *    Daarom staat de versmalling hier één keer en niet bij elke lezer. Zie
 *    besluit A41 in CLAUDE.md: voor élk oppervlak is beschermd het antwoord tot
 *    iemand het tegendeel besluit.
 */
export function leesZichtbaarheid(waarde: unknown): Zichtbaarheid {
  return waarde === 'open' ? 'open' : 'beschermd';
}

/** Zie `meldingen()` in `api.ts`: een functie, want de taal ligt niet vast op importtijd. */
export function zichtbaarheidLabels(): Readonly<Record<Zichtbaarheid, string>> {
  return {
    beschermd: t('zichtbaarheid.beschermd'),
    open: t('zichtbaarheid.open'),
  };
}

/** De uitleg onder de keuze. Twee zinnen die zeggen wat er ánders wordt. */
export function zichtbaarheidUitleg(): Readonly<Record<Zichtbaarheid, string>> {
  return {
    beschermd: t('zichtbaarheid.beschermd_uitleg'),
    open: t('zichtbaarheid.open_uitleg'),
  };
}

export const groepSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: () => t('groep.naam_kort') })
    .max(60, { error: () => t('validatie.groepsnaam_lang') }),
  huddle_day: z
    .number()
    .int()
    .min(0)
    .max(6, { error: () => t('validatie.weekdag_kort') }),
  /**
   * ⚠️ Optioneel met een default, en de default is de veilige kant. Een
   *    aanroeper die dit veld niet kent — een oudere schermversie, een test —
   *    maakt daarmee een beschermde groep en geen open. Dat is grens 4 van het
   *    besluit: nooit iets vooruitlopend "vast open".
   */
  zichtbaarheid: z.enum(ZICHTBAARHEDEN).default('beschermd'),
});

export type GroepInvoer = z.infer<typeof groepSchema>;

/**
 * De bewijseis van een groep — QS8-66, beslispunt 3.
 *
 * ⚠️ Alleen te wijzigen bij een bestaande groep en niet bij het aanmaken: een
 *    nieuwe groep begint op de standaard (notitie verplicht), want dat is de
 *    keuze die de sociale lus op gang brengt. Een duim omhoog op een bewering is
 *    een formaliteit; één zin geeft de goedkeurder iets om op te reageren.
 */
export const BEWIJSEISEN = ['note_required', 'note_and_attachment', 'optional'] as const;
export type Bewijseis = (typeof BEWIJSEISEN)[number];

/** Zie `meldingen()` in `api.ts`: een functie, want de taal ligt niet vast op importtijd. */
export function bewijseisLabels(): Readonly<Record<Bewijseis, string>> {
  return {
    note_required: t('bewijseis.note_required'),
    note_and_attachment: t('bewijseis.note_and_attachment'),
    optional: t('bewijseis.optional'),
  };
}

/**
 * De goedkeuringsregel van een groep — QS8-65, PRD 6.4.
 *
 * ⚠️ **`any` is de standaard en blijft dat.** De PRD noemt het risico van
 *    één-buddy-goedkeuring — snel, maar manipuleerbaar als een groep samenspant —
 *    en schrijft er meteen bij: *monitoren vóór verharden*. Een groep die
 *    strenger wil, kiest dat zelf.
 *
 * ⚠️ Deze lijst is een kopie van de CHECK `groups_approval_rule_valid` (migratie
 *    0111). Loopt hij uiteen, dan accepteert het scherm een waarde die de
 *    database weigert — en dat is een storingsmelding op het moment dat iemand
 *    zijn groep instelt. `goedkeuringsregels.test.ts` legt de twee naast elkaar.
 */
export const GOEDKEURINGSREGELS = ['any', 'majority', 'quorum'] as const;
export type Goedkeuringsregel = (typeof GOEDKEURINGSREGELS)[number];

/**
 * De onder- en bovengrens van een quorum, gelijk aan `groups_approval_quorum_bereik`.
 *
 * ⚠️ Onder 2 is het geen quorum maar `any`, en boven 12 is het onhaalbaar — een
 *    groep is bij twaalf actieve leden vol (migratie 0016).
 */
export const QUORUM_MIN = 2;
export const QUORUM_MAX = 12;

/** Zie `meldingen()` in `api.ts`: een functie, want de taal ligt niet vast op importtijd. */
export function goedkeuringsregelLabels(): Readonly<Record<Goedkeuringsregel, string>> {
  return {
    any: t('goedkeuringsregel.any'),
    majority: t('goedkeuringsregel.majority'),
    quorum: t('goedkeuringsregel.quorum'),
  };
}

/** De uitleg onder de keuze: wat wordt er ánders voor de leden. */
export function goedkeuringsregelUitleg(): Readonly<Record<Goedkeuringsregel, string>> {
  return {
    any: t('goedkeuringsregel.any_uitleg'),
    majority: t('goedkeuringsregel.majority_uitleg'),
    quorum: t('goedkeuringsregel.quorum_uitleg'),
  };
}

/**
 * Leest een goedkeuringsregel uit iets waarvan je de vorm niet kent.
 *
 * ⚠️ **Onbekend is `any`, en dat is hier de kant die niets kapotmaakt.** Anders
 *    dan bij `leesZichtbaarheid()` gaat het hier niet om een privacybelofte maar
 *    om hoeveel mensen moeten bevestigen. Een onbekende waarde als `majority`
 *    lezen zou een week laten hangen die de database allang bevestigd heeft; als
 *    `any` lezen laat het scherm hooguit te weinig zien terwijl de database de
 *    échte regel gewoon toepast. De database beslist, dit scherm vertelt het na.
 */
export function leesGoedkeuringsregel(waarde: unknown): Goedkeuringsregel {
  return waarde === 'majority' || waarde === 'quorum' ? waarde : 'any';
}

/**
 * ⚠️ **`zichtbaarheid` gaat er expliciet uit, en dat is geen opruimwerk.** Zonder
 *    deze `omit` erft het patch-schema het veld van `groepSchema`, en dan
 *    typecheckt `wijzigGroep(id, { zichtbaarheid: 'open' })`, valideert hij,
 *    geeft `ok: true` terug — en doet niets, want `wijzigGroep()` bouwt zijn
 *    update uit een handmatige lijst van drie kolommen.
 *
 *    Geen lek: de kolomgrant en `guard_group_update()` staan er ook nog
 *    (migratie 0076 §2). Wel een val voor de volgende schrijver, want het type
 *    belooft een schrijfpad dat beslisdocument 002 §6a juist uitsluit —
 *    `zet_groepszichtbaarheid()` is de enige route. Gevonden door de
 *    code-critic-ronde van 24-08.
 */
export const groepPatchSchema = groepSchema
  .partial()
  .omit({ zichtbaarheid: true })
  .extend({
    evidence_policy: z.enum(BEWIJSEISEN).optional(),
    approval_rule: z.enum(GOEDKEURINGSREGELS).optional(),
    /**
     * ⚠️ `null` betekent hier "haal het quorum weg", en dat is een andere
     *    handeling dan "laat ongemoeid" (`undefined`). De CHECK
     *    `groups_quorum_bij_regel` eist dat het getal er precies is bij
     *    `approval_rule = 'quorum'`, dus wie terugschakelt naar `any` móet het
     *    kunnen legen — anders weigert de database de hele update.
     */
    approval_quorum: z
      .number()
      .int()
      .min(QUORUM_MIN, { error: () => t('validatie.quorum_bereik') })
      .max(QUORUM_MAX, { error: () => t('validatie.quorum_bereik') })
      .nullable()
      .optional(),
  })
  /**
   * ⚠️ **De twee velden horen bij elkaar en dat wordt hier al geweigerd.** De
   *    database heeft dezelfde eis (`groups_quorum_bij_regel`), maar die geeft
   *    een Postgres-foutmelding en geen zin die een mens leest — en `api.ts`
   *    laat servertekst nooit door tot het scherm.
   */
  .refine(
    (p) => p.approval_rule !== 'quorum' || typeof p.approval_quorum === 'number',
    { error: () => t('validatie.quorum_ontbreekt'), path: ['approval_quorum'] },
  )
  .refine(
    (p) =>
      p.approval_rule === undefined ||
      p.approval_rule === 'quorum' ||
      p.approval_quorum === undefined ||
      p.approval_quorum === null,
    { error: () => t('validatie.quorum_overbodig'), path: ['approval_quorum'] },
  );

export type GroepPatch = z.infer<typeof groepPatchSchema>;

export const codeSchema = z
  .string()
  .transform(normaliseerCode)
  .refine(isCodeVorm, { error: () => t('validatie.uitnodigingscode') });

// ---------------------------------------------------------------------------
// Weergave
// ---------------------------------------------------------------------------
//
// ⚠️ Hier stond een constante `GRENZEN` met de limieten uit migratie 0016 erin.
//    Die is weggehaald: geen enkel scherm gebruikte hem, en een derde kopie van
//    getallen die in SQL staan zonder test ertussen is een tijdbom en geen
//    documentatie. De limieten komen als kenmerk terug uit de RPC's
//    (`group_full`, `daily_limit`) en `api.ts` maakt er een zin van.

/**
 * De zeven huddledagen, met maandag voorop.
 *
 * ⚠️ **De namen komen uit `Intl` via `weekdagNaam()`** en staan niet in de
 *    catalogus — QS8-115. Dit was de twééde hardgecodeerde weekdagenlijst in het
 *    project; `WeekStartKeuze` had dezelfde. Twee lijstjes met dezelfde zeven
 *    namen is twee plekken waar een 0 en een 7 verward kunnen raken, en in een
 *    taal die hier niemand spreekt ziet niemand dat.
 *
 * ⚠️ Een functie en geen constante: de namen hangen van de taal af. De vólgorde
 *    blijft wel hier — welke dag bovenaan staat is een productkeuze.
 */
export function huddledagen(): readonly { readonly waarde: Weekday; readonly label: string }[] {
  return ([1, 2, 3, 4, 5, 6, 0] as const).map((waarde) => ({
    waarde,
    label: weekdagNaam(waarde),
  }));
}

export function huddledagLabel(dag: number): string {
  // ⚠️ De terugval is zondag en niet de dag zelf: `weekdagNaam` rekent modulo,
  //    dus een 9 zou stilzwijgend dinsdag opleveren. Een waarde buiten 0–6 is een
  //    fout in de data en hoort niet als een geldige dag te lezen.
  return dag >= 0 && dag <= 6 ? weekdagNaam(dag) : weekdagNaam(0);
}
