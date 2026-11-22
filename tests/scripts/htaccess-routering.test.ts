import { describe, expect, it } from 'vitest';

// ⚠️ `.mjs` zonder eigen typings — zelfde patroon als `deploy-htaccess.test.ts`.
import { eisWerkendeRouting, htaccessInhoud } from '../../scripts/deploy-web.mjs';
import { beantwoord, routeringsbezwaren } from '../../scripts/htaccess-routering.mjs';

/**
 * Wat de server teruggeeft op een adres dat iemand intypt of ververst — QS8-789.
 *
 * ⚠️⚠️ **De belofte is "elk adres geeft direct een pagina", niet "de .htaccess
 *    bevat regel X".** `deploy-htaccess.test.ts` toetste de tekst en bleef groen
 *    terwijl `/groep` op productie een 403 gaf: de tekst klopte, wat Apache
 *    ermee deed niet. Deze toetsen leggen de gegenereerde regels via een
 *    tegen Apache geijkt model (`scripts/htaccess-routering.mjs`) op een boom
 *    met precies de vormen die `expo export` maakt.
 *
 * 📏 De boom hieronder is de echte export van 22-11-2026, ingekort tot één
 *    voorbeeld per klasse. Elke klasse heeft op productie een eigen uitkomst
 *    gehad: de eerste twee een 403, de andere drie een 200.
 */
const BOOM = [
  'index.html',
  // Een pagina én een map met dezelfde naam — het geval van QS8-789.
  'groep.html',
  'groep/ontdek.html',
  'groep/[id].html',
  'groep/beheer/[id].html',
  // Een map zonder eigen pagina en zonder index: /doel, /mensen.
  'doel/[id].html',
  'doel/nieuw.html',
  'mensen/[id].html',
  // Een map met een eigen index.
  'instellingen/index.html',
  'instellingen/[onderdeel].html',
  // Een gewone pagina zonder map.
  'doelen.html',
  '_expo/static/js/web/entry-abc.js',
  'manifest.json',
];

const DYNAMISCH = BOOM.filter((pad) => /\[[^/]+\]\.html$/.test(pad));
const HTACCESS: string = htaccessInhoud(DYNAMISCH);

/** De regels van vóór QS8-789, letterlijk zoals ze op productie staan. */
const OUDE_REGELS = `<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  RewriteCond %{REQUEST_FILENAME}.html -f
  RewriteRule ^(.+?)/?$ /$1.html [L]
  RewriteRule ^groep/[^/]+/?$ /groep/[id].html [L]
  RewriteRule ^ /index.html [L]
</IfModule>`;

describe('een route met een gelijknamige map geeft de pagina', () => {
  it.each([
    ['/groep', 'groep.html'],
    // De 301 van vóór de reparatie is permanent: browsers vragen dit adres zelf.
    ['/groep/', 'groep.html'],
    ['/doelen', 'doelen.html'],
    ['/doelen/', 'doelen.html'],
    ['/instellingen', 'instellingen/index.html'],
    ['/instellingen/', 'instellingen/index.html'],
    ['/instellingen/taal', 'instellingen/[onderdeel].html'],
    ['/groep/ontdek', 'groep/ontdek.html'],
    ['/groep/abc-123', 'groep/[id].html'],
    ['/groep/beheer/abc-123', 'groep/beheer/[id].html'],
    ['/', 'index.html'],
  ])('%s → 200 %s', (adres, bestand) => {
    expect(beantwoord(HTACCESS, BOOM, adres)).toEqual({ status: 200, bestand });
  });

  it.each(['/doel', '/doel/', '/mensen', '/mensen/', '/bestaat-niet'])(
    '%s (geen pagina) → de app, die zelf "niet gevonden" toont',
    (adres) => {
      expect(beantwoord(HTACCESS, BOOM, adres)).toEqual({ status: 200, bestand: 'index.html' });
    },
  );

  it.each(['/doelen/x', '/groep/ontdek/x', '/doel/nieuw/x', '/instellingen/taal/x'])(
    '%s (een pagina met iets erachter) → de app, geen 500',
    (adres) => {
      expect(beantwoord(HTACCESS, BOOM, adres)).toEqual({ status: 200, bestand: 'index.html' });
    },
  );

  it.each([
    ['/groep?x=1', 'groep.html'],
    ['/doel/nieuw?titel=a', 'doel/nieuw.html'],
    ['/instellingen?x=1', 'instellingen/index.html'],
  ])('%s → de query verandert de pagina niet (%s)', (adres, bestand) => {
    expect(beantwoord(HTACCESS, BOOM, adres)).toEqual({ status: 200, bestand });
  });

  it('laat echte bestanden met rust', () => {
    expect(beantwoord(HTACCESS, BOOM, '/_expo/static/js/web/entry-abc.js')).toEqual({
      status: 200,
      bestand: '_expo/static/js/web/entry-abc.js',
    });
  });

  it('heeft over de hele boom geen enkel bezwaar', () => {
    expect(routeringsbezwaren(HTACCESS, BOOM)).toEqual([]);
  });
});

/**
 * ⚠️ **Het model moet de fout zíen, anders bewaakt het niets** (regel 18,
 *    vraag 3). Deze kanarie legt de regels die nu op productie staan op dezelfde
 *    boom en eist precies wat daar gemeten is.
 */
describe('kanarie: de oude regels geven wat productie gaf', () => {
  it('/groep → 301 naar /groep/, en /groep/ → 403', () => {
    expect(beantwoord(OUDE_REGELS, BOOM, '/groep')).toEqual({ status: 301, locatie: '/groep/' });
    expect(beantwoord(OUDE_REGELS, BOOM, '/groep/')).toEqual({ status: 403 });
  });

  it('/doel/ en /mensen/ → 403', () => {
    expect(beantwoord(OUDE_REGELS, BOOM, '/doel/')).toEqual({ status: 403 });
    expect(beantwoord(OUDE_REGELS, BOOM, '/mensen/')).toEqual({ status: 403 });
  });

  it('/doelen/x → 500 (een kringloop van herschrijvingen, gemeten op productie)', () => {
    expect(beantwoord(OUDE_REGELS, BOOM, '/doelen/x')).toEqual({ status: 500 });
  });

  it('wat op productie wél werkte, werkt ook hier', () => {
    expect(beantwoord(OUDE_REGELS, BOOM, '/groep/ontdek')).toEqual({ status: 200, bestand: 'groep/ontdek.html' });
    expect(beantwoord(OUDE_REGELS, BOOM, '/groep/abc')).toEqual({ status: 200, bestand: 'groep/[id].html' });
  });
});

/**
 * Mutatie per grendel: elk van de drie onderdelen van de reparatie draagt een
 * eigen deel van de belofte, en het weghalen van één ervan moet rood worden.
 */
describe('elke grendel van de reparatie draagt iets', () => {
  const adressenMetBezwaar = (htaccess: string): string[] =>
    routeringsbezwaren(htaccess, BOOM).map((b: { adres: string }) => b.adres);

  it('zonder DirectorySlash Off komt de 301 terug', () => {
    const zonder = HTACCESS.replace(/^\s*DirectorySlash Off\s*$/m, '');
    expect(zonder).not.toBe(HTACCESS);
    expect(adressenMetBezwaar(zonder)).toContain('/groep');
  });

  it('met een map die weer zomaar doorgelaten wordt, komt de 403 terug', () => {
    const doorlaten = HTACCESS.replace(
      'RewriteCond %{REQUEST_FILENAME} -f\n',
      'RewriteCond %{REQUEST_FILENAME} -f [OR]\n  RewriteCond %{REQUEST_FILENAME} -d\n',
    );
    expect(doorlaten).not.toBe(HTACCESS);
    expect(beantwoord(doorlaten, BOOM, '/groep/')).toEqual({ status: 403 });
  });

  it('zonder de regel voor een map met index geeft /instellingen/ niet zijn eigen pagina', () => {
    // Het hele blok van drie voorwaarden en de regel, anders hangen de
    // voorwaarden zich aan de volgende regel en meet deze mutatie twee dingen.
    const zonder = HTACCESS.replace(/(\s*RewriteCond [^\n]+\n){2}\s*RewriteCond %1\/index\.html -f\n\s*RewriteRule [^\n]+\n/, '\n');
    expect(zonder).not.toBe(HTACCESS);
    expect(adressenMetBezwaar(zonder)).toContain('/instellingen/');
  });
});

describe('de eis dat het adres het einde van de bestandsnaam is', () => {
  it('zonder die eis komt de 500 op /doelen/x terug', () => {
    const zonder = HTACCESS.replace(/^\s*RewriteCond \$1#[^\n]+\n/gm, '');
    expect(zonder).not.toBe(HTACCESS);
    expect(beantwoord(zonder, BOOM, '/doelen/x')).toEqual({ status: 500 });
  });
});

describe('de deploy stopt vóór de upload als een adres geen pagina geeft', () => {
  it('weigert de oude regels op deze boom', () => {
    expect(() => eisWerkendeRouting(OUDE_REGELS, BOOM)).toThrow(/geven geen pagina/);
  });

  it('laat de gegenereerde regels door', () => {
    expect(() => eisWerkendeRouting(HTACCESS, BOOM)).not.toThrow();
  });
});

describe('het model meet alleen wat het kent', () => {
  it('werpt op een herschrijfdirectief die het niet modelleert', () => {
    expect(() => beantwoord(`${HTACCESS}\nRewriteBase /app/\n`, BOOM, '/groep')).toThrow(/RewriteBase/);
  });

  it('werpt op een vlag die het niet modelleert', () => {
    const metR = HTACCESS.replace('RewriteRule ^ /index.html [L]', 'RewriteRule ^ /index.html [R=301,L]');
    expect(metR).not.toBe(HTACCESS);
    expect(() => beantwoord(metR, BOOM, '/bestaat-niet')).toThrow(/R=301/);
  });

  it('werpt op een voorwaarde die geen -f, -d of regex is', () => {
    const metS = HTACCESS.replace('RewriteCond %{REQUEST_FILENAME} -f\n', 'RewriteCond %{REQUEST_FILENAME} -s\n');
    expect(metS).not.toBe(HTACCESS);
    expect(() => beantwoord(metS, BOOM, '/groep')).toThrow(/-s/);
  });
});
