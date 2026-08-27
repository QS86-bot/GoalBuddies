import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { beoordeelOmgeving } from '../../scripts/migratieregister-omgeving.mjs';

/**
 * Wanneer mag `register:controle` zwijgen, en wanneer niet?
 *
 * ⚠️ **De bevinding waar dit uit komt.** Deze controle is de enige die de repo
 *    naast het échte project legt, en zonder `EXPO_PUBLIC_SUPABASE_URL` en
 *    `SUPABASE_SERVICE_ROLE_KEY` deed hij niets — met een regel op **stdout**,
 *    tussen de geslaagde controles in. Daar las `overgeslagen` als `gelukt`.
 *    Dezelfde faalvorm als de Windows-job in CI: een script dat niets doet en
 *    toch niets meldt.
 *
 * ⚠️ **Overslaan blijft goed, en dat is geen compromis.** De service-role-key
 *    hoort niet bij een runner die op elke push draait; een controle die in CI
 *    omvalt op een ontbrekende sleutel, leert je rood te negeren. Wat er
 *    veranderde is dat overslaan er nu úitziet als overslaan (stderr, met een
 *    teken ervoor) en dat er een stand is waarin het wél fout is.
 *
 * ⚠️ **Die stand is `npm run db:push`.** Dat is het pad waarlangs een migratie
 *    op productie landt, en daar zijn de credentials per definitie aanwezig —
 *    dus daar is zwijgen geen afspraak maar een gemiste controle. Precies het
 *    gevaar dat de rij in `docs/ENGINEER-REVIEW.md` noemde: *"een migratie op
 *    productie zonder dat de controle daarna draait"*.
 *
 * ⚠️ Tweezijdig geijkt: elk geval dat moet draaien staat naast het geval dat
 *    mag zwijgen en het geval dat moet vallen.
 */
describe('beoordeelOmgeving', () => {
  const SLEUTEL = 'service-role-sleutel';
  const URL = 'https://voorbeeld.supabase.co';

  it('draait als beide er zijn', () => {
    expect(beoordeelOmgeving({ url: URL, sleutel: SLEUTEL })).toBe('draaien');
  });

  it('draait ook streng als beide er zijn — streng maakt niets strenger dan nodig', () => {
    expect(beoordeelOmgeving({ url: URL, sleutel: SLEUTEL, streng: true })).toBe('draaien');
  });

  it('slaat over zonder sleutel', () => {
    expect(beoordeelOmgeving({ url: URL })).toBe('overslaan');
  });

  it('slaat over zonder url', () => {
    expect(beoordeelOmgeving({ sleutel: SLEUTEL })).toBe('overslaan');
  });

  it('slaat over met een lege omgeving — dit is CI', () => {
    expect(beoordeelOmgeving({})).toBe('overslaan');
  });

  it('valt streng om zonder sleutel — dit is na een db:push', () => {
    expect(beoordeelOmgeving({ url: URL, streng: true })).toBe('ontbreekt');
  });

  it('valt streng om zonder url', () => {
    expect(beoordeelOmgeving({ sleutel: SLEUTEL, streng: true })).toBe('ontbreekt');
  });

  it('valt streng om met een lege omgeving', () => {
    expect(beoordeelOmgeving({ streng: true })).toBe('ontbreekt');
  });

  it('behandelt een lege string als afwezig', () => {
    // ⚠️ Een lege env-var is geen sleutel. Zonder deze regel zou `SUPABASE_
    //    SERVICE_ROLE_KEY=` de controle laten dóórgaan en pas op een HTTP-401
    //    stuklopen — een foutmelding die naar het project wijst in plaats van
    //    naar de omgeving.
    expect(beoordeelOmgeving({ url: URL, sleutel: '' })).toBe('overslaan');
    expect(beoordeelOmgeving({ url: '', sleutel: SLEUTEL, streng: true })).toBe('ontbreekt');
  });
});


/**
 * En de andere helft van de bevinding: **een overgeslagen controle mag er niet
 * uitzien als een geslaagde.**
 *
 * ⚠️ Dit toetst het kanaal en niet het besluit, en dat is met opzet een aparte
 *    test. `beoordeelOmgeving()` kan perfect kloppen terwijl de melding op stdout
 *    tussen de groene regels blijft staan — dat wás de situatie. Regel 18,
 *    vraag 3: kan deze test groen blijven terwijl de belofte breekt?
 *
 * ⚠️ Als subproces, want de belofte gaat over wat het script naar buiten
 *    schrijft en met welke exitcode. Dat is niet te importeren.
 *
 * ⚠️ De twee variabelen worden expliciet uit de omgeving gehaald: `vitest` laadt
 *    `.env` in de setup, en op de machine van Quinten staan ze daar wél in. Zonder
 *    dat regeltje toetst deze test daar iets anders dan in CI.
 */
describe('het script zelf — overslaan ziet eruit als overslaan', () => {
  const SCRIPT = fileURLToPath(new URL('../../scripts/migratieregister-controle.mjs', import.meta.url));

  /**
   * De omgeving zoals CI hem heeft: zonder de twee variabelen en zonder de vlag.
   *
   * ⚠️ De cast aan het eind is nodig omdat de Expo-typings `NODE_ENV` verplicht
   *    maken in `ProcessEnv`, en `delete` daar dan niet op mag. De waarde staat er
   *    gewoon in — er wordt hier niets weggehaald wat het type belooft.
   */
  function omgevingZonderCredentials(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
    const omgeving: Record<string, string | undefined> = { ...process.env };
    delete omgeving.EXPO_PUBLIC_SUPABASE_URL;
    delete omgeving.SUPABASE_SERVICE_ROLE_KEY;
    delete omgeving.REGISTER_CONTROLE_STRENG;

    return { ...omgeving, ...extra } as NodeJS.ProcessEnv;
  }

  function draai(argumenten: readonly string[]): {
    code: number;
    stdout: string;
    stderr: string;
  } {
    // ⚠️ `spawnSync` en niet `execFileSync`: die tweede geeft bij exit 0 alleen
    //    stdout terug, en dan is stderr onzichtbaar — precies de stroom waar
    //    deze test over gaat.
    const uit = spawnSync(process.execPath, [SCRIPT, ...argumenten], {
      encoding: 'utf8',
      env: omgevingZonderCredentials(),
    });

    return { code: uit.status ?? -1, stdout: uit.stdout, stderr: uit.stderr };
  }

  it('zegt niets op stdout, en zegt op stderr dat hij is overgeslagen', () => {
    const uit = draai([]);

    expect(uit.code).toBe(0);
    // ⚠️ Dit is de kern. Stond de melding op stdout, dan las hij mee in de rij
    //    geslaagde controles van `/audit` — en `overgeslagen` las als `gelukt`.
    expect(uit.stdout).toBe('');
    expect(uit.stderr).toContain('OVERGESLAGEN');
  });

  it('valt om met --streng, en zegt waarom', () => {
    const uit = draai(['--streng']);

    expect(uit.code).toBe(1);
    expect(uit.stdout).toBe('');
    expect(uit.stderr).toContain('kon niet draaien');
  });

  it('doet met REGISTER_CONTROLE_STRENG=1 hetzelfde als met --streng', () => {
    const uit = spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      env: omgevingZonderCredentials({ REGISTER_CONTROLE_STRENG: '1' }),
    });

    expect(uit.status).toBe(1);
  });
});
