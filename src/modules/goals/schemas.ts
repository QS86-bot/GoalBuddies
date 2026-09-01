import { z } from 'zod';

import { CATEGORIEEN, isCategorie, type Categorie } from '../../shared/categorieen';
import { t } from '../../shared/i18n';
import { isGeldigeIsoDatum, type IsoDate } from '../../shared/time';

/**
 * De invoer van de doelschermen.
 *
 * ⚠️ De streefdatum is het gevoeligste veld van dit formulier. Hij voedt de
 *    Risico-radar (EPIC 12) én het moment waarop een straf verschuldigd wordt
 *    (domeinregel 11). Een datum in het verleden zou allebei meteen laten
 *    afgaan.
 */

/**
 * Het ritme van een doel — besluit A53, migratie 0140.
 *
 * ⚠️ **Dit veld bepaalt niet hoe een week beoordeeld wordt.** Dat doet
 *    `weekly_goals.ceiling_days`. Het ritme is de voorkeur van de gebruiker: het
 *    stuurt het voorstel voor het volgende weekdoel, en straks de vraag of er
 *    een dagreeks bestaat.
 *
 *    Waarom die scheiding: leest het oordeel het doel, dan verandert het oordeel
 *    over een afgelopen week zodra iemand zijn ritme omzet. Een week die op
 *    vrijdag "drie van vijf dagen" was, moet dat blijven — de rij draagt de
 *    regel waaronder hij is aangemaakt.
 *
 * ⚠️ Deze lijst is een kopie van de CHECK `goals_ritme_valid` en geen bron.
 *    `tests/rls/policies.test.ts` legt hem naast de CHECK zélf — niet naast
 *    zichzelf, want dat is precies wat 0032 en 0034 uit elkaar liet lopen zonder
 *    dat er iets rood werd.
 */
export const RITMES = ['weekly', 'times_per_week', 'daily'] as const;
export type Ritme = (typeof RITMES)[number];

/**
 * Leest een ritme uit iets waarvan je de vorm niet kent.
 *
 * ⚠️ **Onbekend is `weekly`, en dat is de hele functie.** De gegenereerde types
 *    geven `goals.ritme` als `string` terug, dus élke lezer moet versmallen — en
 *    elke lezer die dat met de hand doet, kan het één keer anders opschrijven.
 *    Dezelfde vorm en dezelfde reden als `leesZichtbaarheid()` in `buddies`.
 *
 * ⚠️ **`weekly` is de veilige kant** en niet zomaar de eerste waarde: dat is de
 *    stand waarin een weekdoel zich gedraagt zoals vóór A53 — geen dagen, geen
 *    afgeleid niveau. Een tikfout of een oudere server levert dus het gedrag op
 *    dat er altijd al was, en niet een week die ineens dagen telt.
 */
export function leesRitme(waarde: unknown): Ritme {
  return waarde === 'daily' || waarde === 'times_per_week' ? waarde : 'weekly';
}

/** Zie de andere meldingentabellen: een functie, want de taal ligt niet vast op importtijd. */
export function ritmeLabels(): Readonly<Record<Ritme, string>> {
  return {
    weekly: t('ritme.weekly'),
    times_per_week: t('ritme.times_per_week'),
    daily: t('ritme.daily'),
  };
}

/** De toelichting onder elke keuze. Hij legt uit wat het kóst, niet wat het is. */
export function ritmeUitleg(): Readonly<Record<Ritme, string>> {
  return {
    weekly: t('ritme.weekly_uitleg'),
    times_per_week: t('ritme.times_per_week_uitleg'),
    daily: t('ritme.daily_uitleg'),
  };
}

/**
 * ⚠️ Een week heeft zeven dagen en dat is de enige bovengrens die hier klopt.
 *    Hij staat ook in `weekly_goals_dagen_geordend` in 0140; loopt hij uiteen,
 *    dan accepteert het formulier iets wat de database met een `23514` weigert
 *    en zegt die melding de gebruiker niets.
 */
export const MAX_DAGEN_PER_WEEK = 7;

/**
 * Het bereikte niveau, afgeleid uit het aantal afgevinkte dagen.
 *
 * ⚠️ **Dit is een tweede uitvoering van een regel die in de database staat**, en
 *    dat is met opzet én met een risico. `niveau_uit_dagen()` in 0140 is de
 *    waarheid — die beslist wat er in `completions` landt. Deze functie bestaat
 *    omdat het scherm móét kunnen zeggen wát je gaat indienen vóórdat je op de
 *    knop drukt; zonder dat is "afronden" een gok.
 *
 *    Twee uitvoeringen van één regel is precies de naad waar onwrikbare regel 18
 *    over gaat. De grendel staat daarom in `tests/rls/ritme.test.ts`: dezelfde
 *    gevallen gaan door de database én door deze functie, en de twee moeten
 *    hetzelfde zeggen.
 *
 * ⚠️ Zonder vloer is het plafond de ondergrens — dat is wat "geen vloer"
 *    betekent: er is één niveau, en dat haal je of niet.
 *
 * @returns `'ceiling'` of `'floor'` als de week telt, en `null` als hij de vloer
 *   niet haalt. `null` is geen fout maar de normale toestand op woensdag.
 */
export function niveauUitDagen(
  gehaald: number,
  vloerDagen: number | null,
  plafondDagen: number,
): 'ceiling' | 'floor' | null {
  const ondergrens = vloerDagen ?? plafondDagen;
  if (gehaald < ondergrens) return null;
  return gehaald >= plafondDagen ? 'ceiling' : 'floor';
}

/**
 * De vijftien gebieden waar een doel over kan gaan — QS8-224, migratie 0142.
 *
 * ⚠️ **De lijst zelf staat sinds QS8-231 in `shared/categorieen`**, want een
 *    groep deelt hem sindsdien (0144) en `modules/buddies` kan hem hier niet
 *    vandaan halen zonder de Supabase-client mee te trekken. Hij wordt hier
 *    doorgeëxporteerd, zodat elke bestaande lezer op zijn plek blijft. De
 *    onderbouwing en de drie CHECK-naden staan in dat bestand.
 */
export { CATEGORIEEN, isCategorie, type Categorie };

/** Zie de andere meldingentabellen: een functie, want de taal ligt niet vast op importtijd. */
export function categorieLabels(): Readonly<Record<Categorie, string>> {
  return {
    fitness: t('categorie.fitness'),
    nutrition: t('categorie.nutrition'),
    self_care: t('categorie.self_care'),
    mindfulness: t('categorie.mindfulness'),
    connection: t('categorie.connection'),
    helping: t('categorie.helping'),
    creativity: t('categorie.creativity'),
    productivity: t('categorie.productivity'),
    organization: t('categorie.organization'),
    learning: t('categorie.learning'),
    skills: t('categorie.skills'),
    resilience: t('categorie.resilience'),
    business: t('categorie.business'),
    study: t('categorie.study'),
    other: t('categorie.other'),
  };
}

/**
 * De vier groepen waarin die vijftien uiteenvallen.
 *
 * ⚠️ **Dit bestaat omdat vijftien knoppen naast elkaar geen keuze is maar een
 *    muur** — precies het bezwaar uit QS8-224 punt 4. `Choice` is de vorm voor
 *    twee tot zeven opties; met een groep erboven is elke groep weer die maat.
 *
 * ⚠️ **De eerste drie groepen zijn de kleurfamilies uit besluit A55** (QS8-255),
 *    en dat is met opzet dezelfde indeling: kleur codeert de familie, het
 *    pictogram het gebied. Zou de keuzelijst anders groeperen dan de kleur, dan
 *    ziet een gebruiker twee indelingen van dezelfde vijftien woorden.
 *
 * ⚠️ **De vierde groep heeft geen kleur, en dat is een open punt van A55 en niet
 *    van dit bestand.** Besluit A55 meet drie kleuren voor twaalf gebieden; wat
 *    `business`, `study` en `other` krijgen, is daar nooit beantwoord. Ze staan
 *    hier daarom als eigen groep en niet weggemoffeld bij een van de drie.
 */
export const CATEGORIE_GROEPEN = [
  { sleutel: 'lichaam', leden: ['fitness', 'nutrition', 'self_care', 'mindfulness'] },
  { sleutel: 'mensen', leden: ['connection', 'helping', 'creativity'] },
  { sleutel: 'werk', leden: ['productivity', 'organization', 'learning', 'skills', 'resilience'] },
  { sleutel: 'rest', leden: ['business', 'study', 'other'] },
] as const satisfies readonly {
  readonly sleutel: string;
  readonly leden: readonly Categorie[];
}[];

export type CategorieGroep = (typeof CATEGORIE_GROEPEN)[number]['sleutel'];

/** Een functie, om dezelfde reden als `categorieLabels()`. */
export function groepLabels(): Readonly<Record<CategorieGroep, string>> {
  return {
    lichaam: t('categoriegroep.lichaam'),
    mensen: t('categoriegroep.mensen'),
    werk: t('categoriegroep.werk'),
    rest: t('categoriegroep.rest'),
  };
}

/**
 * In welke groep dit gebied valt.
 *
 * ⚠️ Geeft `null` bij een onbekende waarde in plaats van een terugval op `rest`.
 *    `Doel.category` is in de gegenereerde typen een `string`: de database kan
 *    er iets in hebben staan wat deze build niet kent, en dan is "ik weet het
 *    niet" het eerlijke antwoord. Een stille terugval zou zo'n doel in een
 *    groep tonen waar het niet in hoort.
 */
export function categorieGroep(categorie: string): CategorieGroep | null {
  const groep = CATEGORIE_GROEPEN.find((g) => (g.leden as readonly string[]).includes(categorie));
  return groep?.sleutel ?? null;
}

/**
 * De vijftien gebieden als vier groepen met vertaalde labels, klaar voor
 * `GegroepeerdeKeuze`.
 *
 * ⚠️ **Hier en niet in elk scherm apart.** `/doel/nieuw` en `/doel/bewerk` bouwen
 *    allebei dezelfde lijst; stond die op twee plekken, dan is een nieuwe groep
 *    één scherm bijwerken en het andere vergeten. Dat is de fout die dit project
 *    al drie keer op een andere plek heeft gemaakt.
 *
 * ⚠️ **Geen import uit `shared/ui`, ook al past de vorm op `Keuzegroep`.** Dat
 *    zou react-native in de datalaag trekken, en dan is `schemas.ts` niet meer
 *    los te testen. De vorm komt structureel overeen en dat is genoeg —
 *    TypeScript vergelijkt hier op vorm en niet op naam.
 *
 * ⚠️ Een functie en geen constante, om dezelfde reden als `categorieLabels()`:
 *    de labels komen uit `t()` en die ligt niet vast op importtijd.
 */
export function categorieKeuzegroepen(): readonly {
  readonly sleutel: CategorieGroep;
  readonly label: string;
  readonly opties: readonly { readonly waarde: Categorie; readonly label: string }[];
}[] {
  const labels = categorieLabels();
  const groepen = groepLabels();

  return CATEGORIE_GROEPEN.map((groep) => ({
    sleutel: groep.sleutel,
    label: groepen[groep.sleutel],
    opties: groep.leden.map((lid) => ({ waarde: lid, label: labels[lid] })),
  }));
}

/**
 * ⚠️ Geëxporteerd sinds de deadline-verzoeken van A7. Die hadden hun eigen veld
 *    zonder formaatcontrole, en dat is niet zichtbaar fout: `datumLigtInDeToekomst`
 *    vergelijkt strings, en `'morgen' > '2026-08-18'` is gewoon waar. Het
 *    formulier liet zo'n waarde dus door, waarna Postgres struikelde over de cast
 *    en de gebruiker een storingsmelding kreeg voor een tikfout — nadat hij zijn
 *    argument al had getypt. Eén schema voor alle datumvelden.
 */
export const isoDatum = z
  .string()
  .trim()
  .refine(isGeldigeIsoDatum, { error: () => t('validatie.datum_vorm') });

export const doelSchema = z.object({
  /**
   * ⚠️ Standaard `weekly`, en dat is de hele migratiestrategie: elk bestaand
   *    doel is een weekdoel en verandert niet. Wie het veld niet aanraakt,
   *    krijgt precies het gedrag van vóór A53.
   */
  ritme: z.enum(RITMES).default('weekly'),
  title: z
    .string()
    .trim()
    .min(3, { error: () => t('validatie.doeltitel_kort') })
    .max(200, { error: () => t('validatie.doeltitel_lang') }),
  description: z.string().trim().max(2000, { error: () => t('validatie.omschrijving_lang') }).nullable(),
  category: z.enum(CATEGORIEEN),
  target_date: isoDatum,
  /**
   * ⚠️ Prominent, niet weggestopt. Bij een doel van zes maanden is identiteit de
   *    enige brandstof die zo lang meegaat — zie QS8-36 en voorstel §1.5.
   *    Optioneel blijft het wel: verplicht stellen levert ingevulde onzin op.
   */
  identity_statement: z
    .string()
    .trim()
    .max(200, { error: () => t('validatie.identiteit_lang') })
    .nullable(),
  available_hours_per_week: z
    .number()
    .min(0)
    .max(168, { error: () => t('validatie.uren_max') })
    .nullable(),
});

/**
 * ⚠️ `z.input` en niet `z.infer`. Sinds A53 heeft dit schema velden met een
 *    `.default()`, en die zijn aan de invoerkant optioneel en aan de
 *    uitvoerkant gevuld. Met `z.infer` (de uitvoer) zou elke bestaande
 *    aanroeper ineens verplicht een ritme of een dagental moeten meesturen —
 *    en dan is de standaard geen standaard.
 */
export type DoelInvoer = z.input<typeof doelSchema>;

/**
 * ⚠️ `target_date` staat hier bewust níét in, en op typeniveau niet in plaats van
 *    stilzwijgend genegeerd. `wijzigDoel()` bouwde zijn UPDATE met de hand en
 *    liet die kolom eruit, dus een aanroeper die hem meestuurde kreeg `ok: true`
 *    terug terwijl de datum niet opgeslagen was. Vandaag heeft die functie nog
 *    geen scherm; de eerste die er een bouwt en het formulier van het
 *    aanmaakscherm hergebruikt, loopt er zo in.
 *
 *    Verschuiven loopt sinds Q-TODO A7 via `zetStreefdatum()` of via een verzoek
 *    aan de groep. Dat hoort een compilerfout te zijn en geen stille verrassing.
 */
export const doelPatchSchema = doelSchema.omit({ target_date: true }).partial();
export type DoelPatch = z.infer<typeof doelPatchSchema>;

/**
 * Ligt de streefdatum in de toekomst?
 *
 * ⚠️ Losse functie en geen `.refine()` op het schema, omdat "vandaag" van de
 *    klok van de gebruiker afhangt en `shared/time` de enige plek is die dat
 *    mag bepalen (CLAUDE.md, correctheidsregel 7). Een schema dat zelf
 *    `new Date()` aanroept, rekent in de tijdzone van de server.
 */
export function datumLigtInDeToekomst(datum: string, vandaag: IsoDate): boolean {
  return datum > vandaag;
}

/**
 * De levensloop van een doel. Spiegelt de CHECK `goals_status_valid`.
 *
 * ⚠️ **`missed` stond hier tot 25-08-2026 en is er met een migratie uit gehaald**
 *    (0082), niet omdat hij hinderde maar omdat hij een lek wás zodra iemand hem
 *    zou vullen: groepsgenoten lezen deze kolom via `goals_select`, en RLS kan
 *    geen kolommen beperken. Een tegenslagwaarde hier is domeinregel 7 die de
 *    database uit loopt.
 *
 * ⚠️ **Deze lijst is een kopie en geen bron.** `tests/rls/policies.test.ts`
 *    vergelijkt hem met de CHECK zelf, in beide richtingen — want de vorige keer
 *    dat twee zulke lijsten uit elkaar liepen (0032/0034), vergeleek de test de
 *    app-lijst met zichzelf en bleef groen.
 */
/**
 * De gebeurtenissen in de audittrail van een doel. Spiegelt de CHECK
 * `goal_events_type_valid`.
 *
 * ⚠️ **`scope_reduced` en `milestone_dropped` stonden hier tot 25-08-2026 en zijn
 *    er met een migratie uit gehaald** (0087). Groepsgenoten lezen deze tabel via
 *    `goal_events_select`, en dat zijn tegenslagsignalen over iemand anders —
 *    domeinregel 7. `milestone_dropped` stond bovendien al op
 *    `VERBODEN_GEBEURTENISSEN` in `chat-schemas.ts`: de ene kant van de app zei
 *    "de groep hoort dit nooit te zien" terwijl de andere het via een SELECT
 *    uitgaf.
 *
 * ⚠️ **`deadline_moved` blijft, en dat is geen inconsequentie:** die vraag je
 *    zelf aan en een buddy keurt hem goed (A7, verruiming §4a).
 *
 * ⚠️ **Deze lijst is een kopie en geen bron.** `tests/rls/policies.test.ts`
 *    vergelijkt hem met de CHECK zelf, in beide richtingen.
 */
export const DOELGEBEURTENISSEN = [
  'created',
  'deadline_moved',
  'archived',
  'completed',
] as const;
export type Doelgebeurtenis = (typeof DOELGEBEURTENISSEN)[number];

/**
 * Wat een client zelf mag wegschrijven.
 *
 * ⚠️ `deadline_moved` staat er bewust niet bij: die schrijft
 *    `beslis_deadline_verzoek()`, en hij is de enige gebeurtenis die een uitspraak
 *    over een ánder mens draagt ("een buddy ging akkoord"). De policy
 *    `goal_events_insert` dwingt dezelfde grens af — dit is de kopie, niet de bron.
 */
export const DOELGEBEURTENISSEN_CLIENT = ['created', 'archived', 'completed'] as const;
export type DoelgebeurtenisClient = (typeof DOELGEBEURTENISSEN_CLIENT)[number];

export const STATUSSEN = ['active', 'completed', 'archived'] as const;
export type DoelStatus = (typeof STATUSSEN)[number];
