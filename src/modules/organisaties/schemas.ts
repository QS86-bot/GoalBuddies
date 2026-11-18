import { z } from 'zod';

import { t } from '../../shared/i18n';
import { schoneEneRegel, schoneNaam, schoneVrijeTekst, telTekens } from '../../shared/tekst';
import { isGeldigeIsoDatum } from '../../shared/time';

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

/** Teamdoelen per pagina: de grootte van `useBladerlijst`-pagina's elders in de module. */
export const TEAMDOELEN_PER_PAGINA = 20;

/** De grenzen van `team_goals` (0301): titel 1 tot 200, beschrijving hoogstens 2000 codepunten. */
export const TEAMDOEL_TITEL_MAX = 200;
export const TEAMDOEL_BESCHRIJVING_MAX = 2000;

/** Eén regel, geteld in codepunten. De server toetst de CHECK's van 0301 opnieuw. */
export const teamdoelTitelSchema = z
  .string()
  .transform(schoneEneRegel)
  .refine((v) => telTekens(v) >= 1, { error: () => t('teamdoel.titel_leeg') })
  .refine((v) => telTekens(v) <= TEAMDOEL_TITEL_MAX, { error: () => t('teamdoel.titel_lang') });

export const teamdoelBeschrijvingSchema = z
  .string()
  .transform(schoneVrijeTekst)
  .refine((v) => telTekens(v) <= TEAMDOEL_BESCHRIJVING_MAX, {
    error: () => t('teamdoel.beschrijving_lang'),
  });

/**
 * Alleen de vorm: of de datum niet voorbij is, beslist de server in de kalender
 * van de groep (`groepsdatum()`), en het scherm houdt de kiezer binnen die grens.
 */
export const teamdoelDatumSchema = z
  .string()
  .trim()
  .refine(isGeldigeIsoDatum, { error: () => t('teamdoel.datum_ongeldig') });
