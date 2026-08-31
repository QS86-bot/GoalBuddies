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
     * ⚠️ **Dit is de indamming en niet de genezing.** Hier stond dat de echte
     * reparatie "een eigen naamruimte per bestand" is. **Dat is later op 27-08
     * nagemeten en het is het verkeerde doel**, en die tegenspraak hoort niet in
     * twee documenten te blijven staan: het opruimen is al id-gescoped
     * (`removeTestUsers()` doet `.in(column, ids)` met uitsluitend de gebruikers
     * van dát bestand) en de identiteiten zijn al uniek per bestand. Een
     * naamruimte voegt geen isolatie toe die er niet al is — wie hem bouwt,
     * hernoemt het probleem.
     *
     * ⚠️ **Op 31-08 is de oorzaak alsnog gevonden, en het was geen identiteit
     * maar een `update` zonder grens** (QS8-145). `statuscache.test.ts` riep
     * `herstel_weekdoelstatus()` aan, en die schreef over de héle
     * `weekly_goals`-tabel: de vier met de hand op `approved` gezette weken van
     * `reeks.test.ts` gelden per definitie als drift, dus die werden
     * teruggezet naar `todo`. Gemeten in één transactie op een lege database:
     *
     *   reeks VOOR herstel:  4
     *   herstel raakte 4 rijen aan
     *   reeks NA herstel:    0
     *   rijen nog aanwezig:  5
     *
     * Dat is exact de faalsignatuur hierboven, en het verklaart ook waarom
     * `fixtureGaaf()` zweeg: die telt rijen, en de rijen bleven staan.
     * Migratie 0137 geeft de functie een grens; `tests/rls/nevenschade.test.ts`
     * bewaakt de klasse.
     *
     * ⚠️ **En tóch blijft deze regel staan.** Er is één pad bewezen en gedicht,
     * niet aangetoond dat er geen tweede is — vier van de vijf globale
     * schrijvers in dit schema worden vandaag alleen tegengehouden door een
     * aanname over de fixtures, en die staan als zodanig opgeschreven in
     * `nevenschade.test.ts`. Sequentieel kost dertig seconden en die koop je
     * hiermee niet af.
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
        resolve: {
          alias: {
            '@': resolve(here, './src'),
            /**
             * ⚠️ **Zodat een test een échte Edge Function kan importeren** —
             * QS8-195. `supabase/functions/*` draait op Deno en importeert zijn
             * client met een `jsr:`-specifier; Node kent die niet. Zonder deze
             * regel is de enige manier om een handler te toetsen, hem
             * nabouwen — en een nagebouwde reproductie die niets vindt, leest
             * als bewijs dat er niets aan de hand is.
             *
             * De stub bootst niets na en valt bij elke aanroep om; zie
             * `tests/edge/supabase-js-stub.ts`.
             */
            'jsr:@supabase/supabase-js@2': resolve(here, './tests/edge/supabase-js-stub.ts'),
          },
        },
      },
      {
        test: {
          ...gedeeld,
          name: 'rls',
          include: ['tests/rls/**/*.test.ts'],
          // ⚠️ De hele reden dat deze groep bestaat. Hier stond "niet weghalen
          //    zonder de fixture-naamruimte hierboven", en die naamruimte is
          //    verworpen — zie de kop. Wat er nu geldt: niet weghalen zolang er
          //    globale schrijvers zijn die alleen door een aanname over de
          //    fixtures worden tegengehouden. `tests/rls/nevenschade.test.ts`
          //    somt ze op en noemt per stuk wanneer die aanname vervalt.
          fileParallelism: false,
          sequence: { concurrent: false },
        },
        resolve: { alias: { '@': resolve(here, './src') } },
      },
    ],
  },
});
