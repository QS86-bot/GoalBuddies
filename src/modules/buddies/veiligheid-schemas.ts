import { t } from '../../shared/i18n';

/**
 * De woordenschat van melden — QS8-232, migratie 0145.
 *
 * ⚠️ **Een eigen bestand zonder Supabase-client, en dat is geen netheid.**
 *    `veiligheid.ts` importeert de client, en die trekt React Native mee; een
 *    test die deze lijst naast de CHECK in de database wil leggen, valt dan om op
 *    Flow-syntax in `react-native/index.js`. Dezelfde valkuil als bij
 *    `chat-schemas.ts` en `overzicht-stand.ts`.
 */

/**
 * De vijf redenen uit `reports_reden_geldig` (0145).
 *
 * ⚠️ **Een kopie van die CHECK en geen bron.** `tests/rls/veiligheid.test.ts`
 *    legt de twee naast elkaar via `check_waarden()`. Een reden erbij is dus
 *    altijd eerst een migratie — precies de vorm van 0032/0034.
 *
 * ⚠️ `other` staat achteraan en niet vooraan. Wie de lijst leest, kiest de
 *    dichtstbijzijnde beschrijving; staat "iets anders" bovenaan, dan is dat het
 *    antwoord van iedereen die haast heeft en wordt de reden waardeloos.
 */
export const MELDREDENEN = [
  'harassment',
  'spam',
  'inappropriate',
  'impersonation',
  'other',
] as const;
export type Meldreden = (typeof MELDREDENEN)[number];

/** Zie de andere meldingentabellen: een functie, want de taal ligt niet vast op importtijd. */
export function meldredenLabels(): Readonly<Record<Meldreden, string>> {
  return {
    harassment: t('melden.reden.harassment'),
    spam: t('melden.reden.spam'),
    inappropriate: t('melden.reden.inappropriate'),
    impersonation: t('melden.reden.impersonation'),
    other: t('melden.reden.other'),
  };
}

/**
 * Dezelfde grens als `reports_toelichting_len`.
 *
 * ⚠️ Geteld in codepunten met `telTekens()` en niet met `.length` — Postgres
 *    telt codepunten en JavaScript UTF-16-eenheden (CLAUDE.md).
 */
export const TOELICHTING_MAX = 1000;
