import { defineConfig, configDefaults } from 'vitest/config';
import { resolve } from 'node:path';

const here = import.meta.dirname;

/**
 * Wat elke groep deelt. Losgetrokken omdat `projects` niet van de wortel erft:
 * zet je `setupFiles` alleen bovenin, dan draait `test-env.ts` nergens meer en
 * valt de hele suite om op ontbrekende omgeving.
 */
const gedeeld = {
  globals: true,
  environment: 'node' as const,
  setupFiles: ['src/lib/test-env.ts'],
};

export default defineConfig({
  test: {
    /**
     * ⚠️ **Twee groepen, en de reden is een gemeten bevinding en geen smaak.**
     *
     * De RLS-tests praten allemaal met dezelfde database. Vitest draait
     * testbestanden standaard parallel, dus het opruimen van het ene bestand
     * loopt door de fixtures van het andere heen. Op 27-08-2026 gemeten met de
     * oude opstelling (één pool voor alle 110 bestanden):
     *
     *   - `reeks.test.ts` alleen gedraaid          → groen (4/4)
     *   - volle suite parallel                     → 4× rood op ~9 runs
     *   - volle suite met `--no-file-parallelism`  → 3× groen op 3
     *
     * De faalsignatuur was `4, 4, 4, 4, 4, 4, 0, 0, 0, 0`: een reeks die
     * hálverwege een lus omklapt die zelf niets schrijft. Dat kán geen ruis in
     * `herbereken_reeks()` zijn — daar haalt iemand anders data onder weg.
     *
     * ⚠️ **Wat deze regel níét bewijst, en dat hoort erbij te staan.** Na het
     * opsplitsen in groepen is de tegenproef mislukt: met `fileParallelism` op
     * `true` bleef de suite zes keer op zes groen. De vlag wérkt aantoonbaar
     * (12s parallel tegen 27s sequentieel voor deze groep), dus de bestanden
     * liepen echt naast elkaar — de fout kwam alleen niet opzetten. Mogelijk is
     * hij zeldzamer dan die 4-op-9 suggereert, mogelijk verandert het
     * opsplitsen zelf het beeld doordat deze dertig bestanden niet langer een
     * pool met tachtig unit-bestanden delen.
     *
     * **Wat overeind blijft is de kant die telt:** sequentieel is negen keer op
     * negen groen en parallel is vier keer omgevallen. Deze regel kost weinig
     * en haalt een bekende bron van dubbelzinnige uitslagen weg; hij is geen
     * bewezen genezing.
     *
     * ⚠️ **Waarom niet gewoon `--no-file-parallelism` over alles.** Gemeten op
     * dezelfde machine: 21s parallel tegen 51s sequentieel, en die 30 seconden
     * worden betaald door ~110 unit-testbestanden die nooit een database
     * aanraken. De grens loopt precies om `tests/rls/`, dus daar leggen we hem.
     *
     * ⚠️ **Dit is de indamming en niet de genezing.** De echte reparatie is dat
     * het opruimen van bestand A de fixtures van bestand B niet kán raken — een
     * eigen naamruimte per bestand. Zolang die er niet is, houdt deze regel de
     * uitslag betrouwbaar; hij maakt de suite niet robuust. Zie de rij van
     * 27-08 in `docs/ENGINEER-REVIEW.md`.
     *
     * ⚠️ `sequence.concurrent` doet dit **niet**. Dat gaat over `test.concurrent`
     * bínnen één bestand; hier stond het al op `false` met een commentaarregel
     * die precies deze belofte deed, en de belofte werd niet waargemaakt.
     * `fileParallelism` is de stand die tússen bestanden gaat.
     */
    projects: [
      {
        test: {
          ...gedeeld,
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'tests/rls/**'],
          sequence: { concurrent: false },
        },
        resolve: { alias: { '@': resolve(here, './src') } },
      },
      {
        test: {
          ...gedeeld,
          name: 'rls',
          include: ['tests/rls/**/*.test.ts'],
          // ⚠️ De hele reden dat deze groep bestaat. Niet weghalen zonder de
          //    fixture-naamruimte die hierboven staat.
          fileParallelism: false,
          sequence: { concurrent: false },
        },
        resolve: { alias: { '@': resolve(here, './src') } },
      },
    ],
  },
});
