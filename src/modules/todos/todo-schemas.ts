import { z } from 'zod';

import { t } from '../../shared/i18n';
import { telTekens } from '../../shared/tekst';

/**
 * De invoerregels van De Lijst — QS8-379, migratie 0219.
 *
 * ⚠️ **Dit bestand importeert bewust niets uit een datalaag.** Zou het dat wel
 *    doen, dan trekt elke test die deze regels wil controleren `lib/supabase`
 *    mee, en daarmee de Supabase-client, AsyncStorage en React Native — in een
 *    test die in Node draait. Dezelfde reden als boven `deadline-schemas.ts`,
 *    `chat-schemas.ts` en `commitment-schemas.ts`.
 *
 * ⚠️ **`visibility` staat hier met opzet niet in, en dat is geen vergeetpost.**
 *    De kolom bestaat sinds 0219 en is voor geen enkele client schrijfbaar; het
 *    delen krijgt in QS8-381 een eigen RPC. Een veld hier zou een schrijfpad
 *    suggereren dat er niet is, en de eerste die het invult krijgt een `42501`
 *    uit Postgres in plaats van een zin. `tests/rls/todo-lijst.test.ts` bewaakt
 *    de databasekant; `todo-schemas.test.ts` deze.
 */

/** Ondergrens uit de CHECK `todo_items_body_len` — na `btrim`, in codepunten. */
export const TAAK_MIN = 1;
export const TAAK_MAX = 500;

/**
 * Bovengrens uit de CHECK `todo_items_order_bereik`.
 *
 * ⚠️ **Een bovengrens omdat "achteraan toevoegen" `max + 1` is.** `order_index`
 *    is een `integer`; zonder grens zet een verzoek er `2147483647` in en valt
 *    de eerstvolgende taak om met `22003 integer out of range` — op een
 *    berekening die nergens fout lijkt. Gevonden in de security-review op
 *    QS8-379. De database is de grendel (onwrikbare regel 3); dit is de melding.
 */
export const VOLGORDE_MAX = 1_000_000;

/**
 * ⚠️ **`telTekens()` en niet `.min()`/`.max()` — QS8-118.** Zod telt
 *    UTF-16-eenheden en `char_length` in Postgres telt codepunten. Eén emoji
 *    kost twee UTF-16-eenheden en één codepunt, een samengesteld gezin elf tegen
 *    zeven. Een taak van 300 emoji haalt `char_length` 300 — die hoort erdoor —
 *    maar `.max(500)` ziet er 600 en weigert hem. De gebruiker krijgt dan een
 *    grens te zien die de database niet stelt.
 *
 * ⚠️ **En `.trim()` vóór de telling, want de CHECK doet `btrim(body)`.** Zonder
 *    dat is een taak van vijf spaties hier geldig en in de database niet.
 */
const taakTekst = z
  .string()
  .trim()
  .refine((tekst) => telTekens(tekst) >= TAAK_MIN, {
    error: () => t('lijst.taak_leeg'),
  })
  .refine((tekst) => telTekens(tekst) <= TAAK_MAX, {
    error: () => t('lijst.taak_lang'),
  });

/** Een nieuwe taak. `order_index` is optioneel; de database zet hem anders op 0. */
export const taakInvoerSchema = z.object({
  body: taakTekst,
  order_index: z.number().int().min(0).max(VOLGORDE_MAX).optional(),
});

/**
 * Een wijziging aan een bestaande taak.
 *
 * ⚠️ Precies de drie kolommen die in de UPDATE-kolomgrant van 0219 staan, en
 *    geen vierde. Staat hier ooit een veld bij dat de grant niet kent, dan is de
 *    melding die de gebruiker krijgt een `42501` en niet een zin.
 */
export const taakPatchSchema = z
  .object({
    body: taakTekst,
    done_at: z.string().datetime().nullable(),
    order_index: z.number().int().min(0).max(VOLGORDE_MAX),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    error: () => t('lijst.patch_leeg'),
  });

export type TaakInvoer = z.infer<typeof taakInvoerSchema>;
export type TaakPatch = z.infer<typeof taakPatchSchema>;
