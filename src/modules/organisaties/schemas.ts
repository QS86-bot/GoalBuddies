import { z } from 'zod';

import { t } from '../../shared/i18n';
import { schoneNaam, telTekens } from '../../shared/tekst';

/**
 * De grenzen van `maak_organisatie()` (0299): 1 tot 80 codepunten na het
 * strijken van de naam. De server blijft de waarheid; dit schema is er zodat
 * iemand geen databasefout krijgt voor iets dat de app zelf zag.
 */
export const ORGANISATIENAAM_MAX = 80;

/** Geteld in codepunten (`telTekens`) en niet met `.max()`: dat is wat `char_length` telt. */
export const TEAMNAAM_MIN = 2;
export const TEAMNAAM_MAX = 60;

/** Zelfde paginagrootte als `organisatieleden()` en `organisatieteams()` als default. */
export const ORGANISATIELEDEN_PER_PAGINA = 20;

export const uuidSchema = z.uuid();

export const naamSchema = z
  .string()
  .transform(schoneNaam)
  .refine((v) => telTekens(v) >= 1, { error: () => t('organisatie.naam_leeg') })
  .refine((v) => telTekens(v) <= ORGANISATIENAAM_MAX, {
    error: () => t('organisatie.naam_lang'),
  });

/** `maak_teamgroep()` houdt dezelfde grenzen aan als `create_group()`: 2 tot 60. */
export const teamNaamSchema = z
  .string()
  .transform(schoneNaam)
  .refine((v) => telTekens(v) >= TEAMNAAM_MIN, { error: () => t('groep.naam_kort') })
  .refine((v) => telTekens(v) <= TEAMNAAM_MAX, {
    error: () => t('validatie.groepsnaam_lang'),
  });
