import { z } from 'zod';

/**
 * Het zes-vragen-interview dat aan de Doelcoach voorafgaat — QS8-37.
 *
 * De zes vragen: meetbaarheid · identiteit · deadline en waarom die datum ·
 * beschikbare uren per week · wat is er al gedaan · waar liep het eerder vast.
 *
 * ⚠️ Elke vraag is overslaanbaar en alles overslaan moet werken. Dat is geen
 *    coulance maar het acceptatiecriterium: wie niets invult krijgt een
 *    generieker resultaat, geen blokkade. Daarom is elk veld nullable en niet
 *    optional — een overgeslagen vraag is een expliciete `null` en geen
 *    ontbrekende sleutel. Dat scheelt bij vraag 3.2 het onderscheid tussen "niet
 *    gevraagd" en "niet beantwoord".
 *
 * ⚠️ `available_hours_per_week` is het enige veld dat een getal is en geen
 *    tekst, en dat is met opzet: de Risico-radar (EPIC 12) rekent ermee. Een
 *    doel van zes maanden bij twee uur per week is een ander doel dan hetzelfde
 *    doel bij twintig uur, en dat verschil is het halve nut van de radar.
 *    `goals_hours_sane` in migratie 0001 begrenst de kolom; deze grenzen lopen
 *    daarmee gelijk.
 */

/** Ruim genoeg voor een eerlijk antwoord, krap genoeg om geen essay te worden. */
export const ANTWOORD_MAX = 1000;

const antwoord = z
  .string()
  .trim()
  .max(ANTWOORD_MAX, { error: `Maximaal ${ANTWOORD_MAX} tekens.` })
  .nullable();

export const interviewSchema = z.object({
  /** 1. Waaraan zie je dat het gelukt is? */
  measurable: antwoord,
  /** 2. Wie word je als dit lukt? Spiegelt naar `goals.identity_statement`. */
  identity: antwoord,
  /** 3. Waarom juist die datum? De datum zelf staat op `goals.target_date`. */
  deadline_reason: antwoord,
  /** 4. Hoeveel uur per week heb je? Spiegelt naar `goals.available_hours_per_week`. */
  hours_per_week: z
    .number()
    .min(0, { error: 'Minder dan nul uur bestaat niet.' })
    .max(168, { error: 'Een week heeft 168 uur.' })
    .nullable(),
  /** 5. Wat is er al gedaan? */
  already_done: antwoord,
  /**
   * 6. Waar liep het eerder vast?
   *
   * ⚠️ Dit is het gevoeligste veld van het formulier. `goal_interviews` heeft
   *    RLS die uitsluitend de eigenaar toelaat (migratie 0003) en dat moet zo
   *    blijven: dit antwoord gaat per definitie over een eerdere mislukking, en
   *    domeinregel 7 houdt eigen tegenslag privé. Het mag naar de Doelcoach —
   *    die werkt voor jou — en nooit naar de groep.
   */
  stuck_before: antwoord,
});

export type InterviewInvoer = z.infer<typeof interviewSchema>;

/** Een interview waarin alles is overgeslagen. Geldig, en dat is het punt. */
export const LEEG_INTERVIEW: InterviewInvoer = {
  measurable: null,
  identity: null,
  deadline_reason: null,
  hours_per_week: null,
  already_done: null,
  stuck_before: null,
};

/** De zes stappen in de volgorde waarin het scherm ze stelt. */
export const INTERVIEW_STAPPEN = [
  {
    veld: 'measurable',
    vraag: 'Waaraan zie je straks dat het gelukt is?',
    toelichting: 'Iets wat je kunt aanwijzen of tellen werkt beter dan een gevoel.',
  },
  {
    veld: 'identity',
    vraag: 'Wie word je als dit lukt?',
    toelichting: 'Bij een doel van maanden is identiteit de brandstof die het langst meegaat.',
  },
  {
    veld: 'deadline_reason',
    vraag: 'Waarom juist die datum?',
    toelichting: 'Een datum met een reden erachter verschuif je minder makkelijk.',
  },
  {
    veld: 'hours_per_week',
    vraag: 'Hoeveel uur per week heb je hiervoor?',
    toelichting: 'Eerlijk schatten helpt meer dan hoog inzetten.',
  },
  {
    veld: 'already_done',
    vraag: 'Wat heb je al gedaan?',
    toelichting: 'Je begint zelden bij nul, en dat scheelt in de planning.',
  },
  {
    veld: 'stuck_before',
    vraag: 'Waar liep het eerder vast?',
    toelichting: 'Alleen voor jou en de Doelcoach zichtbaar — je groep ziet dit nooit.',
  },
] as const satisfies readonly {
  veld: keyof InterviewInvoer;
  vraag: string;
  toelichting: string;
}[];

/**
 * Heeft dit interview iets bruikbaars opgeleverd?
 *
 * ⚠️ Niet om een leeg interview te weigeren — dat mag juist — maar om 3.2 te
 *    laten kiezen tussen een gerichte en een generieke prompt.
 */
export function heeftAntwoorden(invoer: InterviewInvoer): boolean {
  return Object.values(invoer).some((waarde) => waarde !== null && waarde !== '');
}
