import { z } from 'zod';

/**
 * De uiterlijkvoorkeur van een gebruiker — QS8-729, migratie 0303.
 *
 * ⚠️ **Dit bestand importeert bewust niets uit een datalaag.** Zelfde reden als
 *    `todo-schemas.ts`: een test die de regels wil controleren trekt anders
 *    `lib/supabase` mee, en daarmee React Native en AsyncStorage.
 *
 * ⚠️ **De lijsten hieronder zijn de bron en de CHECK's van
 *    `gebruikersvoorkeuren` zijn een kopie.** Een waarde erbij vraagt dus eerst
 *    een migratie; een onbekende waarde faalt dicht, aan beide kanten.
 *    `tests/rls/gebruikersvoorkeuren.test.ts` legt de twee in béide richtingen
 *    naast elkaar.
 *
 * ⚠️ **Dit is een voorkeur en geen domeinregel.** Zet hier nooit iets in dat de
 *    app anders laat rékenen. De voorkeur is eigenaar-only en nooit zichtbaar
 *    voor een groepslid (domeinregel 7).
 */

export const STIJLEN = ['a', 'b', 'c'] as const;
export const KLEURVARIANTEN = ['geen', 'baai', 'avondgloed', 'bosrand', 'pruim', 'koraal'] as const;
export const WEERGAVEN = ['donker', 'licht', 'systeem'] as const;
export const DICHTHEDEN = ['ruim', 'compact'] as const;

export type Stijl = (typeof STIJLEN)[number];
export type Kleurvariant = (typeof KLEURVARIANTEN)[number];
export type Weergave = (typeof WEERGAVEN)[number];
export type Dichtheid = (typeof DICHTHEDEN)[number];

export interface Uiterlijkvoorkeur {
  readonly stijl: Stijl;
  readonly kleurvariant: Kleurvariant;
  readonly weergave: Weergave;
  readonly dichtheid: Dichtheid;
  readonly emoji: boolean;
}

/**
 * Wat een nieuwe gebruiker krijgt: stijl B, donker, ruim, emoji aan.
 *
 * ⚠️ Een kopie van de kolomdefaults van 0303, en door dezelfde test naast de
 *    database gelegd. Verander je er één, dan verandert er voor een gebruiker
 *    die zijn keuze nooit gemaakt heeft het hele uiterlijk.
 */
export const STANDAARD_VOORKEUR: Uiterlijkvoorkeur = {
  stijl: 'b',
  kleurvariant: 'geen',
  weergave: 'donker',
  dichtheid: 'ruim',
  emoji: true,
};

/**
 * ⚠️ **Een kleurvariant hoort bij stijl C en bij niets anders** — de CHECK
 *    `gebruikersvoorkeuren_variant_hoort_bij_c`. Het issue noemt alleen "geen
 *    variant" als standaard; deze koppeling is een aanname van de bouwsessie.
 *    De database weigert een rij die haar breekt, dus dit schema doet dat ook,
 *    en `normaliseerVoorkeur()` herstelt hem vóór het schrijven.
 */
export const voorkeurSchema = z
  .object({
    stijl: z.enum(STIJLEN),
    kleurvariant: z.enum(KLEURVARIANTEN),
    weergave: z.enum(WEERGAVEN),
    dichtheid: z.enum(DICHTHEDEN),
    emoji: z.boolean(),
  })
  .strict()
  .refine((v) => (v.stijl === 'c') === (v.kleurvariant !== 'geen'), {
    message: 'kleurvariant hoort bij stijl c en bij niets anders',
    path: ['kleurvariant'],
  });

/** De variant die stijl C krijgt als de gebruiker er nog geen koos. */
export const STANDAARD_VARIANT_VAN_C: Kleurvariant = 'baai';

/**
 * Herstelt de koppeling tussen stijl en variant.
 *
 * Wie van C naar A of B wisselt, houdt geen variant over; wie naar C wisselt
 * zonder variant krijgt `baai`. Dit wijzigt nooit een van de andere drie
 * voorkeuren.
 */
export function normaliseerVoorkeur(v: Uiterlijkvoorkeur): Uiterlijkvoorkeur {
  if (v.stijl !== 'c') return v.kleurvariant === 'geen' ? v : { ...v, kleurvariant: 'geen' };
  return v.kleurvariant === 'geen' ? { ...v, kleurvariant: STANDAARD_VARIANT_VAN_C } : v;
}

/** Een onbekende of onvolledige waarde wordt `null` en nooit half overgenomen. */
export function leesVoorkeur(onbekend: unknown): Uiterlijkvoorkeur | null {
  const uitkomst = voorkeurSchema.safeParse(onbekend);
  return uitkomst.success ? uitkomst.data : null;
}
