/**
 * IJking van `.github/workflows/deploy-web.yml` en `scripts/deploy-workflow.mjs`
 * — QS8-718.
 *
 * ⚠️ **De belofte is een eigenschap van het bestand als geheel**: dat een deploy
 *    nooit vanzelf start, en dat er geen geheim in een log kan belanden. Een
 *    test die één stap controleert, bewaakt het onderdeel. Daarom leest de
 *    eerste groep het ECHTE bestand in en voert de tweede dezelfde functie
 *    gemuteerde kopieën — de ijking van vraag 3: *kan deze test groen blijven
 *    terwijl de belofte breekt?*
 *
 * ⚠️ De mutaties zijn per grendel, niet één voor het geheel: een mutatie die
 *    twee grendels tegelijk raakt, bewijst niet welke van de twee werkt.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  bezwaren,
  beoordeelAllesGroen,
  beoordeelShaInvoer,
  geheimeNamen,
  runRegels,
  triggersUit,
} from '../../scripts/deploy-workflow.mjs';

const ECHT = readFileSync(join(__dirname, '../../.github/workflows/deploy-web.yml'), 'utf8');

/**
 * De `run:`-regel van de droge run, als anker voor mutaties.
 *
 * ⚠️ **Niet de tekst `npm run deploy:droog`**: die staat ook in de kop van het
 *    bestand, en een mutatie die in commentaar landt gaf hier tien rode toetsen
 *    om de verkeerde reden — de mutatie raakte de bron niet.
 */
const DROOG_REGEL = /^( +)npm run deploy:droog$/m;
const ECHT_REGEL = /^( +)npm run deploy$/m;

/** Vervangt precies één plek; faalt luid als de plek er niet is. */
function muteer(yml: string, van: string | RegExp, naar: string): string {
  const uit = yml.replace(van, naar);
  if (uit === yml) throw new Error(`mutatie raakt niets: ${String(van)}`);
  return uit;
}

describe('het echte bestand', () => {
  it('heeft precies één trigger: workflow_dispatch', () => {
    expect(triggersUit(ECHT)).toEqual(['workflow_dispatch']);
  });

  it('heeft geen enkel bezwaar', () => {
    expect(bezwaren(ECHT)).toEqual([]);
  });

  it('geeft secrets alleen door via env en leest ze nergens in een run-blok', () => {
    const namen = geheimeNamen(ECHT);
    expect(namen).toContain('HOSTINGER_API_TOKEN');

    const run = runRegels(ECHT)
      .map((r) => r.tekst)
      .join('\n');
    expect(run).not.toMatch(/\$\{\{/);
    for (const naam of namen) expect(run).not.toMatch(new RegExp(`\\$\\{?${naam}\\b`));
  });

  it('draait de deploy op een runner waar pakIn() werkt', () => {
    // De naad tussen workflow en script: `pakIn()` roept `powershell` aan en
    // pakt over een pad met backslashes. Staat dat er, dan moet de job op
    // Windows draaien; anders is de droge run groen tot `Inpakken` en rood erna.
    const script = readFileSync(join(__dirname, '../../scripts/deploy-web.mjs'), 'utf8');
    expect(script).toMatch(/spawnSync\(\s*'powershell'/);

    const deploy = ECHT.slice(ECHT.indexOf('\n  deploy:'));
    expect(deploy).toMatch(/runs-on:\s*windows-latest/);
  });

  it('geeft de droge run geen enkel secret', () => {
    const stap = ECHT.slice(ECHT.indexOf('- name: Droge run'), ECHT.indexOf('- name: Echte deploy'));
    expect(stap).not.toMatch(/secrets\./);
  });

  it('heeft in package.json de twee scripts die de workflow aanroept', () => {
    const scripts = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')).scripts;
    expect(scripts.deploy).toContain('deploy-web.mjs');
    expect(scripts['deploy:droog']).toContain('--droog');
  });
});

describe('triggersUit — alle drie de schrijfwijzen', () => {
  it('leest een blok', () => {
    expect(triggersUit('name: x\non:\n  push:\n    branches: [main]\n  schedule:\n    - cron: "1 * * * *"\njobs: {}\n')).toEqual([
      'push',
      'schedule',
    ]);
  });

  it('leest een lijst en een kale naam', () => {
    expect(triggersUit('on: [push, pull_request]\n')).toEqual(['push', 'pull_request']);
    expect(triggersUit('on: push\n')).toEqual(['push']);
  });

  it('laat een uitgelegd push: in commentaar met rust', () => {
    expect(triggersUit('on:\n  # geen push: hier\n  workflow_dispatch:\n')).toEqual(['workflow_dispatch']);
  });
});

describe('IJking — elke mutatie van het echte bestand wordt gevonden', () => {
  it.each([
    ['een push-trigger erbij', /on:\n  workflow_dispatch:/, 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:', /trigger/],
    ['een schedule-trigger erbij', /on:\n  workflow_dispatch:/, "on:\n  schedule:\n    - cron: '0 * * * *'\n  workflow_dispatch:", /trigger/],
    ['een pull_request-trigger erbij', /on:\n  workflow_dispatch:/, 'on:\n  pull_request:\n  workflow_dispatch:', /trigger/],
    ['een kale on: push', /on:\n  workflow_dispatch:\n    inputs:/, 'on: push\nx:\n    inputs:', /trigger/],
  ])('%s', (_naam, van, naar, verwacht) => {
    expect(bezwaren(muteer(ECHT, van, naar)).join('\n')).toMatch(verwacht);
  });

  it.each([
    ['een secret in een run-blok', DROOG_REGEL, '$1echo ${{ secrets.HOSTINGER_API_TOKEN }}\n$1npm run deploy:droog', /secret staat in een run-blok/],
    ['een geheim als $NAAM in een run-blok', DROOG_REGEL, '$1echo "$HOSTINGER_API_TOKEN"\n$1npm run deploy:droog', /HOSTINGER_API_TOKEN wordt in een run-blok gelezen/],
    ['een geheim als ${NAAM}', DROOG_REGEL, '$1printf "%s" "${HOSTINGER_API_TOKEN}"\n$1npm run deploy:droog', /HOSTINGER_API_TOKEN wordt in een run-blok gelezen/],
    ['een indirecte expansie die geschreven wordt', DROOG_REGEL, '$1echo "${!naam}"\n$1npm run deploy:droog', /indirecte variabele/],
    ['set -x', DROOG_REGEL, '$1set -x\n$1npm run deploy:droog', /log/],
    ['printenv', DROOG_REGEL, '$1printenv\n$1npm run deploy:droog', /log/],
    ['een invoerveld in een run-blok', DROOG_REGEL, '$1echo ${{ inputs.sha }}\n$1npm run deploy:droog', /scriptinjectie/],
    ['debuglogging', 'permissions: {}', 'permissions: {}\nenv:\n  ACTIONS_STEP_DEBUG: true', /debuglogging/],
    ['een artefact', DROOG_REGEL, '$1npm run deploy:droog\n      - uses: actions/upload-artifact@v4', /artefact/],
    ['set -ex', DROOG_REGEL, '$1set -ex\n$1npm run deploy:droog', /log/],
    ['bash -x als shell-opdracht', DROOG_REGEL, '$1bash -x -c "npm run deploy:droog"', /log/],
    ['kale set', DROOG_REGEL, '$1set\n$1npm run deploy:droog', /log/],
    ['export -p', DROOG_REGEL, '$1export -p\n$1npm run deploy:droog', /log/],
    ['/proc/self/environ', DROOG_REGEL, '$1cat /proc/self/environ\n$1npm run deploy:droog', /log/],
    ['node die process.env leest', DROOG_REGEL, "$1node -e \"console.log(process.env.X)\"\n$1npm run deploy:droog", /log/],
    ['$env:NAAM (PowerShell)', DROOG_REGEL, '$1Write-Output $env:HOSTINGER_API_TOKEN\n$1npm run deploy:droog', /HOSTINGER_API_TOKEN wordt in een run-blok gelezen/],
    ['%NAAM% (cmd)', DROOG_REGEL, '$1echo %HOSTINGER_API_TOKEN%\n$1npm run deploy:droog', /HOSTINGER_API_TOKEN wordt in een run-blok gelezen/],
    ['een geheim achter een # in een run-regel', DROOG_REGEL, '$1echo "tok #$HOSTINGER_API_TOKEN"\n$1npm run deploy:droog', /HOSTINGER_API_TOKEN wordt in een run-blok gelezen/],
    ['een secret in with: van een actie', /          node-version: '22'\n          cache: npm/, "          node-version: '22'\n          token: ${{ secrets.HOSTINGER_API_TOKEN }}\n          cache: npm", /niet direct als waarde onder env/],
    ['een andere shell dan bash', /shell: bash/, 'shell: pwsh', /shell is niet precies/],
    ['gequote push-sleutel', /on:\n  workflow_dispatch:/, 'on:\n  "push":\n  workflow_dispatch:', /trigger/],
    ['gequote schedule-sleutel', /on:\n  workflow_dispatch:/, "on:\n  'schedule':\n  workflow_dispatch:", /trigger/],
    ['# binnen een run-blok', DROOG_REGEL, '$1echo "t #1: $HOSTINGER_API_TOKEN"\n$1npm run deploy:droog', /gelezen/],
    ['een gequote env-waarde', /HOSTINGER_API_TOKEN: \$\{\{ secrets\.HOSTINGER_API_TOKEN \}\}/, 'HOSTINGER_API_TOKEN: "${{ secrets.HOSTINGER_API_TOKEN }}"', /niet direct als waarde/],
    ['een flow-step', DROOG_REGEL, '$1- { name: x, run: "echo ${{ secrets.HOSTINGER_API_TOKEN }}" }\n$1npm run deploy:droog', /flow-mapping/],
    ['een run met block-indicator |2', /run: \|\n          echo "Let op/, 'run: |2\n          echo "Let op', /block-indicator/],
    ['format() om een secret', DROOG_REGEL, "$1echo ${{ format('{0}', secrets.HOSTINGER_API_TOKEN) }}\n$1npm run deploy:droog", /secret/],
    ['v="${!naam}" en dan echo', DROOG_REGEL, '$1v="${!naam}"\n$1echo "$v"\n$1npm run deploy:droog', /indirecte variabele/],
    ['env > bestand', DROOG_REGEL, '$1env > e.txt\n$1npm run deploy:droog', /log/],
    ['een tweede echte deploy zonder voorwaarde', /(\n      - name: Samenvatting)/, '\n      - run: npm run deploy$1', /exact/],
    ['de voorwaarde met || true', /if: inputs\.modus == 'echt'\n        env:\n          EXPO_PUBLIC_SUPABASE_URL: \$\{\{ secrets\.EXPO_PUBLIC_SUPABASE_URL \}\}\n          EXPO_PUBLIC_SUPABASE_ANON_KEY: \$\{\{ secrets\.EXPO_PUBLIC_SUPABASE_ANON_KEY \}\}\n          HOSTINGER_API_TOKEN: \$\{\{ secrets\.HOSTINGER_API_TOKEN \}\}\n          EXPO_PUBLIC_SENTRY_DSN/, "if: inputs.modus == 'echt' || true\n        env:\n          EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.EXPO_PUBLIC_SUPABASE_URL }}\n          EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.EXPO_PUBLIC_SUPABASE_ANON_KEY }}\n          HOSTINGER_API_TOKEN: ${{ secrets.HOSTINGER_API_TOKEN }}\n          EXPO_PUBLIC_SENTRY_DSN", /exact/],
    ['toJSON(secrets)', DROOG_REGEL, '$1echo ${{ toJSON(secrets) }}\n$1npm run deploy:droog', /toJSON/],
  ])('%s', (_naam, van, naar, verwacht) => {
    expect(bezwaren(muteer(ECHT, van, naar)).join('\n')).toMatch(verwacht);
  });

  it.each([
    ['een schrijfrecht', 'contents: read\n      checks: read', 'contents: write\n      checks: read', /schrijfrecht/],
    ['geen concurrency-bescherming', 'cancel-in-progress: false', 'cancel-in-progress: true', /concurrency/],
    ['een tweede deploypad via curl', DROOG_REGEL, '$1curl -X POST https://example.invalid\n$1npm run deploy:droog', /tweede deploypad/],
    ['de echte deploy zonder modus-voorwaarde', /- name: Echte deploy\n        if: inputs\.modus == 'echt'/, '- name: Echte deploy', /modus == 'echt'/],
    ['geen refcontrole op main', /refs\/heads\/main/g, 'refs/heads/dev', /main niet/],
    ['geen environment op deploy', /    environment: productie\n/, '', /environment/],
  ])('%s', (_naam, van, naar, verwacht) => {
    expect(bezwaren(muteer(ECHT, van, naar)).join('\n')).toMatch(verwacht);
  });

  it('de droge run na de echte deploy', () => {
    const gewisseld = ECHT.replace(DROOG_REGEL, '$1@@A')
      .replace(ECHT_REGEL, '$1npm run deploy:droog')
      .replace('@@A', 'npm run deploy');
    expect(bezwaren(gewisseld).join('\n')).toMatch(/ná de echte deploy/);
  });
});

describe('IJking — wat met rust gelaten moet worden', () => {
  it('een geheim dat alleen als NAAM in een for-lijst staat is geen lek', () => {
    expect(bezwaren(ECHT).filter((b) => /gelezen/.test(b))).toEqual([]);
  });

  it('een uitleg in commentaar over secrets of push: telt niet', () => {
    const met = muteer(ECHT, 'permissions: {}', '# geen push: en geen ${{ secrets.X }} in een run\npermissions: {}');
    expect(bezwaren(met)).toEqual([]);
  });

  it('GITHUB_TOKEN in env is geen bezwaar', () => {
    expect(geheimeNamen(ECHT)).toContain('GITHUB_TOKEN');
  });

  it('een nepwaarde-melding met de naam erin is geen lek', () => {
    const met = muteer(ECHT, DROOG_REGEL, '$1echo "nepwaarde voor $naam"\n$1npm run deploy:droog');
    expect(bezwaren(met)).toEqual([]);
  });
});

describe('beoordeelShaInvoer', () => {
  it('neemt leeg en main als de punt van main', () => {
    expect(beoordeelShaInvoer('')).toMatchObject({ ok: true, soort: 'main' });
    expect(beoordeelShaInvoer(undefined)).toMatchObject({ ok: true, soort: 'main' });
    expect(beoordeelShaInvoer(' main ')).toMatchObject({ ok: true, soort: 'main' });
  });

  it('neemt een hash, ook afgekort en in hoofdletters', () => {
    expect(beoordeelShaInvoer('63341150')).toEqual({ ok: true, soort: 'hash', waarde: '63341150' });
    expect(beoordeelShaInvoer('ABCDEF1')).toMatchObject({ ok: true, waarde: 'abcdef1' });
  });

  it.each(['HEAD~3', 'origin/andere', 'v1.0.0', 'abc', '63341150; rm -rf', '$(id)', '--upload-pack=x', 'main\nx'])(
    'weigert %j',
    (invoer) => {
      expect(beoordeelShaInvoer(invoer).ok).toBe(false);
    },
  );
});

describe('beoordeelAllesGroen', () => {
  const run = (conclusion: string | null, extra = {}) => ({
    name: 'Alles groen',
    status: conclusion === null ? 'in_progress' : 'completed',
    conclusion,
    app: { slug: 'github-actions' },
    ...extra,
  });

  it('is groen bij één geslaagde run', () => {
    expect(beoordeelAllesGroen([run('success')]).ok).toBe(true);
  });

  it('weigert zonder enige run', () => {
    expect(beoordeelAllesGroen([]).ok).toBe(false);
    expect(beoordeelAllesGroen([{ name: 'andere job', status: 'completed', conclusion: 'success', app: { slug: 'github-actions' } }]).ok).toBe(false);
  });

  it('weigert een run die nog loopt', () => {
    expect(beoordeelAllesGroen([run(null)]).ok).toBe(false);
    expect(beoordeelAllesGroen([run('success'), run(null)]).ok).toBe(false);
  });

  it.each(['failure', 'timed_out', 'action_required', 'neutral', 'stale'])('weigert %s', (c) => {
    expect(beoordeelAllesGroen([run(c)]).ok).toBe(false);
  });

  it('laat een rode niet winnen van een groene ernaast — andersom ook niet', () => {
    expect(beoordeelAllesGroen([run('success'), run('failure')]).ok).toBe(false);
    expect(beoordeelAllesGroen([run('failure'), run('success')]).ok).toBe(false);
  });

  it('laat afgebroken en overgeslagen runs niet meetellen, in geen van beide richtingen', () => {
    expect(beoordeelAllesGroen([run('success'), run('cancelled')]).ok).toBe(true);
    expect(beoordeelAllesGroen([run('cancelled')]).ok).toBe(false);
    expect(beoordeelAllesGroen([run('skipped'), run('cancelled')]).ok).toBe(false);
  });

  it('weigert een check met deze naam die niet van GitHub Actions komt', () => {
    expect(beoordeelAllesGroen([run('success', { app: { slug: 'iets-anders' } })]).ok).toBe(false);
    expect(beoordeelAllesGroen([run('success', { app: null })]).ok).toBe(false);
  });
});

describe('de sha-stap tegen een echte git-repo', () => {
  const script = join(__dirname, '../../scripts/deploy-workflow.mjs');

  function repo() {
    const dir = mkdtempSync(join(tmpdir(), 'deploy-sha-'));
    const g = (...a: string[]) =>
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir, encoding: 'utf8' }).trim();
    g('init', '-q', '-b', 'main');
    g('commit', '-q', '--allow-empty', '-m', 'a');
    g('checkout', '-q', '-b', 'pr');
    g('commit', '-q', '--allow-empty', '-m', 'tussencommit');
    const tussen = g('rev-parse', 'HEAD');
    g('checkout', '-q', 'main');
    g('merge', '-q', '--no-ff', '-m', 'merge', 'pr');
    const merge = g('rev-parse', 'HEAD');
    g('update-ref', 'refs/remotes/origin/main', merge);
    return { dir, tussen, merge };
  }

  function draai(dir: string, invoer: string) {
    // ⚠️ Zonder `GITHUB_OUTPUT`: in CI wijst die naar de uitvoer van de échte stap.
    const rest = { ...process.env };
    delete rest.GITHUB_OUTPUT;
    return spawnSync('node', [script, 'sha'], { cwd: dir, env: { ...rest, INVOER_SHA: invoer }, encoding: 'utf8' });
  }

  it('neemt main en de merge-commit, weigert een tussencommit van de PR', () => {
    const { dir, tussen, merge } = repo();
    expect(draai(dir, 'main').status).toBe(0);
    expect(draai(dir, merge).status).toBe(0);
    const uit = draai(dir, tussen);
    expect(uit.status).toBe(1);
    expect(uit.stderr).toMatch(/hoofdlijn/);
  });

  it('weigert een hash die geen commit is', () => {
    const { dir } = repo();
    expect(draai(dir, 'deadbeef').status).toBe(1);
  });
});
