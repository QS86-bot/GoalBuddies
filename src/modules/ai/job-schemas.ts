/**
 * De vormen van een AI-job, los van de Supabase-client — QS8-41.
 *
 * ⚠️ **Dit bestand importeert bewust niets uit `jobs.ts`.** Zou het dat wel
 *    doen, dan trekt elke test die deze lijst controleert de Supabase-client en
 *    AsyncStorage mee, en daarmee React Native in een test die in Node draait.
 *    Dat is precies wat er bij de eerste opzet van `jobstatus.test.ts` gebeurde:
 *    `Flow is not supported`, uit `react-native/index.js`.
 *
 *    Zelfde reden als bij `uitvoer.ts`, `weekly-schemas.ts`,
 *    `mijlpaal-schemas.ts`, `chat-schemas.ts` en `notifications/regels.ts` — en
 *    het is inmiddels de vierde keer in deze codebase dat precies dit misgaat.
 *    **Pure gegevens die je wilt testen, horen in een bestand dat de client niet
 *    importeert.**
 */

/**
 * De statussen die een AI-job kan hebben, in dezelfde volgorde als de CHECK.
 *
 * ⚠️ **Dit stond tot 27-08-2026 als `'error'` in `jobs.ts`, en de database kent
 *    `'failed'`.** Elk onderdeel klopte en de keten liep nergens door: de CHECK
 *    `ai_jobs_status_valid` (migratie 0001, regel 512) zegt `failed`,
 *    `supabase/functions/doelcoach/index.ts` schrijft `failed`, en het
 *    coach-scherm testte op `'error'`. Die tak was onbereikbaar.
 *
 *    Het gevolg: een mislukte generatie bleef zestig rondes van twee seconden
 *    pollen en toonde daarna "dit duurt te lang", terwijl de échte reden keurig
 *    in `ai_jobs.error` stond. Dat is zo sinds QS8-38, dus niemand heeft die
 *    reden ooit gezien.
 *
 * ⚠️ **Dezelfde vorm als de allowlist van systeemberichten** (`SYSTEEM_
 *    GEBEURTENISSEN` in `buddies/chat-schemas.ts`, migraties 0032 en 0034): twee
 *    kopieën van dezelfde lijst, aan weerszijden van de grens, zonder test die
 *    ze op **gelijkheid** legt. `tests/beloftes/jobstatus.test.ts` doet dat nu,
 *    en leest de CHECK uit het migratiebestand in plaats van hem over te typen —
 *    een derde kopie zou het probleem groter maken.
 */
export const JOB_STATUSSEN = ['queued', 'running', 'done', 'failed'] as const;

export type JobStatus = (typeof JOB_STATUSSEN)[number];
