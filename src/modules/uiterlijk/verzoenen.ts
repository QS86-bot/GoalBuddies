import { z } from 'zod';

import {
  normaliseerVoorkeur,
  STANDAARD_VOORKEUR,
  voorkeurSchema,
  type Uiterlijkvoorkeur,
  type Weergave,
} from './voorkeur';

/**
 * Lokaal en account naast elkaar leggen — QS8-729, criterium 7 en 8.
 *
 * ⚠️ **Dit is de hele regel en hij staat op één plek.** Het besluit van Quinten
 *    (19-11-2026): bij twee apparaten wint de laatste keuze, en een server-side
 *    `bijgewerkt_op` bepaalt wat nieuwer is. Geen samenvoegen per veld, geen
 *    voorkeur per apparaat.
 *
 * ⚠️ **Waarom de client zijn eigen klok niet vergelijkt met die van de server.**
 *    Een telefoon die twee uur voorloopt zou dan elke keuze van een ander
 *    apparaat overschrijven. De lokale kopie onthoudt daarom op welke
 *    `bijgewerkt_op` van de server hij gebaseerd is (`basis`), en of er sindsdien
 *    een keuze is gemaakt die nog niet verzonden is (`wacht`). Meer is er niet
 *    nodig om te weten wie nieuwer is:
 *
 *      - geen onverzonden keuze → de account wint, ook als hij anders is;
 *      - wel een onverzonden keuze en de account is nog dezelfde als waar de
 *        keuze op voortbouwt → de keuze wint en gaat naar de account;
 *      - wel een onverzonden keuze maar de account is sindsdien door een ander
 *        apparaat bijgewerkt → de account wint. Dat is "de laatste keuze wint"
 *        waar de server bepaalt wat de laatste was; een offline keuze die
 *        langer geleden is dan die van het andere apparaat verliest, en dat is
 *        gekozen boven het alternatief dat de oudste keuze de nieuwste
 *        overschrijft.
 */

/** Sleutel van de oude lokale voorkeur; blijft bestaan zodat niemand zijn keuze verliest. */
export const LEGACY_THEMASLEUTEL = 'goalbuddies.thema';

/** Sleutel van de lokale kopie van de accountvoorkeur. */
export const LOKALE_SLEUTEL = 'goalbuddies.uiterlijk';

export interface AccountVoorkeur {
  readonly voorkeur: Uiterlijkvoorkeur;
  /** `bijgewerkt_op` zoals de server het zette (ISO-UTC). */
  readonly bijgewerktOp: string;
}

export interface LokaleKopie {
  /** Van wie deze kopie is: een onverzonden keuze van A gaat nooit naar de account van B. */
  readonly userId: string;
  readonly voorkeur: Uiterlijkvoorkeur;
  /** De `bijgewerkt_op` van de server waar deze kopie op voortbouwt; `null` als de account nog geen rij had. */
  readonly basis: string | null;
  /** Is er een keuze gemaakt die nog niet naar de account is? */
  readonly wacht: boolean;
}

const lokaleKopieSchema = z.object({
  userId: z.string().min(1),
  voorkeur: voorkeurSchema,
  basis: z.string().nullable(),
  wacht: z.boolean(),
});

export function serialiseerLokaleKopie(kopie: LokaleKopie): string {
  return JSON.stringify(kopie);
}

/** Alles wat geen geldige kopie is — stuk, afgekapt, van een oudere vorm — is `null`. */
export function parseLokaleKopie(raw: string | null): LokaleKopie | null {
  if (raw === null) return null;
  try {
    const uitkomst = lokaleKopieSchema.safeParse(JSON.parse(raw));
    return uitkomst.success ? uitkomst.data : null;
  } catch {
    // Geen JSON: dan is er geen kopie. De aanroeper valt terug op de oude
    // voorkeur of de standaard; de gebruiker hoeft hier niets van te merken.
    return null;
  }
}

/**
 * De oude voorkeur (`systeem | navy | navy-licht`) als weergave.
 *
 * ⚠️ **Alleen de weergave en niets anders.** De oude drie standen kennen geen
 *    stijl, kleurvariant, dichtheid of emoji; die krijgen de standaard. Wie
 *    `navy-licht` bewaard heeft, houdt dus licht, en wie `systeem` had, volgt
 *    nog steeds zijn toestel. Alles wat niet herkend wordt is `null`: dan geldt
 *    de standaard (donker) en niet een gok.
 */
export function legacyWeergave(raw: string | null): Weergave | null {
  if (raw === 'navy') return 'donker';
  if (raw === 'navy-licht') return 'licht';
  if (raw === 'systeem') return 'systeem';
  return null;
}

export interface Verzoening {
  readonly voorkeur: Uiterlijkvoorkeur;
  /** Moet de keuze naar de account? Alleen waar `true`: een onverzonden keuze, of een oude lokale keuze zonder accountrij. */
  readonly schrijfNaarAccount: boolean;
  /** De `basis` voor de lokale kopie die hierna bewaard wordt. */
  readonly basis: string | null;
}

export interface VerzoenInvoer {
  /** `undefined` = de lezing mislukte of is er nog niet; `null` = de account heeft geen rij. */
  readonly account: AccountVoorkeur | null | undefined;
  readonly lokaal: LokaleKopie | null;
  readonly legacy: string | null;
}

/** De keuze die gelden moet als de account niets (meer) zegt. */
export function lokaleOfStandaard(
  lokaal: LokaleKopie | null,
  legacy: string | null,
): Uiterlijkvoorkeur {
  if (lokaal) return lokaal.voorkeur;
  const weergave = legacyWeergave(legacy);
  return weergave ? { ...STANDAARD_VOORKEUR, weergave } : STANDAARD_VOORKEUR;
}

export function verzoenVoorkeur({ account, lokaal, legacy }: VerzoenInvoer): Verzoening {
  // Mislukte lezing: de lokale kopie, anders de oude voorkeur, anders de standaard.
  // Nooit iets schrijven op grond van een lezing die niet gelukt is.
  if (account === undefined) {
    return {
      voorkeur: lokaleOfStandaard(lokaal, legacy),
      schrijfNaarAccount: false,
      basis: lokaal?.basis ?? null,
    };
  }

  // De account heeft geen rij. Een bestaande gebruiker behoudt zijn lokale keuze
  // en die gaat nu naar de account; een gebruiker zonder iets krijgt de standaard
  // en daar schrijven we niets voor — een rij is een keuze en geen toestand.
  if (account === null) {
    const heeftKeuze = lokaal !== null || legacyWeergave(legacy) !== null;
    return {
      voorkeur: lokaleOfStandaard(lokaal, legacy),
      schrijfNaarAccount: heeftKeuze,
      basis: null,
    };
  }

  const eigenKeuzeWint = lokaal !== null && lokaal.wacht && lokaal.basis === account.bijgewerktOp;
  if (eigenKeuzeWint) {
    return {
      voorkeur: normaliseerVoorkeur(lokaal.voorkeur),
      schrijfNaarAccount: true,
      basis: account.bijgewerktOp,
    };
  }

  return {
    voorkeur: account.voorkeur,
    schrijfNaarAccount: false,
    basis: account.bijgewerktOp,
  };
}
