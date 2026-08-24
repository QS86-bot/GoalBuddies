import { z } from 'zod';

import { telTekens } from '../../shared/tekst';
import { t } from '../../shared/i18n';

import { isoDatum } from './schemas';

/**
 * De invoerregels van een deadline-verzoek — Q-TODO A7, losgemaakt in QS8-120.
 *
 * ⚠️ Dit bestand importeert bewust niets uit `deadline.ts`. Zou het dat wel
 *    doen, dan trekt elke test die deze regels wil controleren `lib/supabase`
 *    mee, en daarmee de Supabase-client, AsyncStorage en React Native — in een
 *    test die in Node draait. Precies de reden die ook boven `chat-schemas.ts`,
 *    `weekafsluiting-schemas.ts` en `weekly-schemas.ts` staat.
 *
 *    Tot QS8-120 stonden deze regels ín `deadline.ts` en waren ze daardoor
 *    onmogelijk te testen: een testbestand dat ze importeerde viel al om op de
 *    parser. Het schema dat bewaakt of je een deadline mág verschuiven had dus
 *    geen enkele test.
 */

/** Ondergrens uit de CHECK `deadline_requests_reason_len`. */
export const ARGUMENT_MIN = 20;
export const ARGUMENT_MAX = 1000;

/**
 * ⚠️ Dezelfde grenzen als de database, en dat is geen dubbel werk: zonder dit
 *    schema krijgt iemand die drie woorden typt een CHECK-fout uit Postgres te
 *    zien in plaats van een zin die uitlegt wat er wordt gevraagd.
 */
export const deadlineVerzoekSchema = z.object({
  // ⚠️ Hetzelfde schema als het doelformulier. Stond hier eerst `z.string().min(1)`,
  //    en dat is niet zichtbaar fout: `datumLigtInDeToekomst` vergelijkt strings,
  //    dus "morgen" gold als een geldige toekomstige datum. Postgres viel er
  //    daarna over en de gebruiker kreeg een storingsmelding voor een tikfout —
  //    nadat hij zijn argument al had getypt.
  new_date: isoDatum,
  // ⚠️ `telTekens()` en niet `.min()`/`.max()` — QS8-118. Zod telt
  //    UTF-16-eenheden, `deadline_requests_reason_len` telt met `char_length`
  //    codepunten. Bij een ondergrens gaat dat verschil de gevaarlijke kant op:
  //    tien emoji halen `.length >= 20` maar `char_length` is dan 10, dus Zod
  //    liet het door en Postgres weigerde het. Precies de storingsmelding die
  //    dit schema hierboven belooft te voorkomen.
  reason: z
    .string()
    .trim()
    .refine((tekst) => telTekens(tekst) >= ARGUMENT_MIN, {
      error: () => t('deadline.argument_kort'),
    })
    .refine((tekst) => telTekens(tekst) <= ARGUMENT_MAX, {
      error: () => t('deadline.argument_lang'),
    }),
});

export type DeadlineVerzoekInvoer = z.infer<typeof deadlineVerzoekSchema>;
