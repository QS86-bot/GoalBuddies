/**
 * htaccess-routering — wat geeft de server terug op een adres, gegeven de
 * gegenereerde `.htaccess` en de bestanden in `dist/`? — QS8-789.
 *
 * ⚠️⚠️ **De aanleiding is een 403 die geen enkele test kon zien.** `expo export`
 *    maakt `groep.html` (de tab) én een map `groep/` (voor `app/groep/*`). De
 *    oude `.htaccess` liet elke bestaande map ongemoeid door; mod_dir stuurde
 *    `/groep` dan door naar `/groep/`, en daar staat geen `index.html`: een 403
 *    van Hostinger in plaats van de app. 📏 Gemeten op productie op 22-11-2026:
 *    `/groep` en `/doel` → 301 → 403, `/mensen/` → 403, `/groep.html`,
 *    `/groep/ontdek` en `/groep/abc-123` → 200. `deploy-htaccess.test.ts`
 *    toetste de tekst van het bestand en niet wat de server ermee doet.
 *
 * ⚠️ **Dit is een model van Apache, en het is tegen Apache geijkt** — niet
 *    tegen Hostinger. Het kent precies de vormen die `htaccessInhoud()`
 *    schrijft: `RewriteCond` met `-f`, `-d` of een regex (met `[OR]`, `$N` en
 *    `%N`), `RewriteRule` met `-` of een pad en de vlag `[L]`, `DirectorySlash`,
 *    en een query die het negeert zoals Apache dat doet. Een directief, vlag of
 *    operator die het niet kent, laat het **werpen** in plaats van overslaan: een model
 *    dat een regel negeert, meet een ander bestand dan de server leest.
 *
 * ⚠️ **Twee eigenschappen van mod_dir zijn gemeten en niet afgeleid**, met
 *    Apache 2.4 lokaal, `Options -Indexes` en mod_autoindex geladen (zo geeft
 *    een map zonder index 403 en geen 404, net als Hostinger):
 *    (1) een map zonder schuine streep wordt doorgestuurd, óók als een
 *        `RewriteRule` het verzoek al naar `groep.html` herschreef — de 301
 *        komt dus vóór de herschrijving en alleen `DirectorySlash Off` haalt
 *        hem weg;
 *    (2) een map mét schuine streep zonder `index.html` geeft 403.
 *
 * IJKING — met de hand gedraaid op 22-11-2026: de echte export (48 pagina's, 34
 * mappen) achter echte Apache 2.4. Elk adres uit `teMetenAdressen()` (188) plus
 * vier met een query is met curl opgevraagd en naast `beantwoord()` gelegd.
 * Omdat veel pagina's byte-gelijk zijn (de prerender heeft een lege body,
 * QS8-740), kreeg elke `.html` in de kopie een eigen merkteken, zodat ook het
 * géserveerde bestand vergeleken is en niet alleen de status:
 *
 *   oude regels (`-f [OR] -d` → doorlaten)   192 van 192 gelijk; 94 bezwaren, o.a.
 *                                            /groep 301, /groep/ 403, /mensen/ 403,
 *                                            /doelen/x 500
 *   nieuwe regels                            192 van 192 gelijk; 0 bezwaren
 *   nieuwe regels zonder `DirectorySlash`    192 van 192 gelijk; 34 bezwaren, alle 301
 *   nieuwe regels zonder de `$1#`-eis        192 van 192 gelijk; 28 bezwaren, alle 500
 *
 *   De eerste versie van dit model week bij de oude regels op 28 adressen af —
 *   zie `bestandsnaamVoor()`. Zonder die vergelijking had het model die regels
 *   strenger beoordeeld dan de server, en dat is een ijking die je overslaat.
 *   De 500 op `/<pagina>/x` vond de code-critic; hij stond ook op productie
 *   (📏 `/doelen/x` → 500 op 22-11-2026) en was ouder dan QS8-789.
 *
 *   Mutatie per grendel in `tests/scripts/htaccess-routering.test.ts`: elk van
 *   de vier onderdelen van de regels maakt daar een eigen toets rood.
 */

/** Een denkbeeldige documentroot; alleen het verschil met het verzoek telt. */
const ROOT = '/www';
const MAX_RONDES = 10;

/** @param {string} regel */
function tokens(regel) {
  return regel.trim().split(/\s+/);
}

/** De vlaggen die dit model uitvoert; elke andere laat het werpen. */
const BEKENDE_VLAGGEN = new Set(['L', 'OR']);

/** @param {string | undefined} vlaggen */
function vlagUit(vlaggen) {
  const set = new Set(String(vlaggen ?? '').replace(/^\[|\]$/g, '').split(',').filter(Boolean));
  for (const vlag of set) {
    if (!BEKENDE_VLAGGEN.has(vlag)) throw new Error(`htaccess-routering kent de vlag [${vlag}] niet`);
  }
  return set;
}

/**
 * De herschrijfregels en de `DirectorySlash`-stand uit een `.htaccess`.
 *
 * @param {string} htaccess
 */
export function leesRegels(htaccess) {
  const regels = [];
  let voorwaarden = [];

  for (const regel of htaccess.split(/\r?\n/)) {
    const [directief, a, b, c] = tokens(regel);
    if (directief === 'RewriteCond') {
      voorwaarden.push({ test: a, patroon: b, of: vlagUit(c).has('OR') });
    } else if (directief === 'RewriteRule') {
      regels.push({ patroon: a, doel: b, vlaggen: vlagUit(c), voorwaarden });
      voorwaarden = [];
    } else if (directief?.startsWith('Rewrite') && directief !== 'RewriteEngine') {
      throw new Error(`htaccess-routering kent ${directief} niet — breid het model uit`);
    }
  }

  const directorySlash = !/^\s*DirectorySlash\s+Off\b/im.test(htaccess);
  return { regels, directorySlash };
}

/**
 * Elke map die in een lijst bestanden besloten ligt, met `''` voor de root.
 *
 * @param {Iterable<string>} bestanden
 */
function mappenUit(bestanden) {
  const mappen = new Set(['']);
  for (const pad of bestanden) {
    const delen = pad.split('/');
    for (let i = 1; i < delen.length; i += 1) mappen.add(delen.slice(0, i).join('/'));
  }
  return mappen;
}

/** @param {string} pad */
function relatief(pad) {
  return pad.replace(/^\/+/, '');
}

/**
 * Vervangt `$N` en `%N`.
 *
 * @param {string} tekst
 * @param {string[]} dollar
 * @param {string[]} procent
 */
function vul(tekst, dollar, procent) {
  return tekst
    .replace(/\$(\d)/g, (_, n) => dollar[Number(n)] ?? '')
    .replace(/%(\d)/g, (_, n) => procent[Number(n)] ?? '');
}

/**
 * Geldt één `RewriteCond`? Geeft de nieuwe `%N`-groepen terug, of `null`.
 *
 * @param {{test: string, patroon: string}} voorwaarde
 * @param {{bestandsnaam: string, bestanden: Set<string>, mappen: Set<string>,
 *          dollar: string[], procent: string[]}} ctx
 */
function toets(voorwaarde, ctx) {
  const tekst = vul(voorwaarde.test.replace('%{REQUEST_FILENAME}', ctx.bestandsnaam), ctx.dollar, ctx.procent);
  if (/%\{/.test(tekst)) throw new Error(`htaccess-routering kent ${voorwaarde.test} niet`);
  const ontkend = voorwaarde.patroon.startsWith('!');
  const patroon = ontkend ? voorwaarde.patroon.slice(1) : voorwaarde.patroon;
  // -s, -l, =, <, > en de rest zijn geen regex; als regex uitgevoerd zouden ze stil iets anders meten.
  if (/^(-[a-zA-Z]|[=<>])/.test(patroon) && patroon !== '-f' && patroon !== '-d') {
    throw new Error(`htaccess-routering kent de voorwaarde ${patroon} niet`);
  }
  const binnen = tekst.startsWith(`${ROOT}/`) ? tekst.slice(ROOT.length + 1) : null;

  let groepen = null;
  if (patroon === '-f') groepen = binnen !== null && ctx.bestanden.has(binnen) ? ctx.procent : null;
  else if (patroon === '-d') groepen = binnen !== null && ctx.mappen.has(binnen.replace(/\/+$/, '')) ? ctx.procent : null;
  else groepen = new RegExp(patroon).exec(tekst);

  if (ontkend) return groepen ? null : ctx.procent;
  return groepen ? [...groepen] : null;
}

/**
 * Gelden de voorwaarden van een regel, met Apache's `[OR]`-ketting?
 *
 * @param {{test: string, patroon: string, of: boolean}[]} voorwaarden
 * @param {Parameters<typeof toets>[1]} ctx
 * @returns {string[] | null}
 */
function voorwaardenGelden(voorwaarden, ctx) {
  let procent = ctx.procent;
  let ketting = false;

  for (const voorwaarde of voorwaarden) {
    const uitslag = ketting ? procent : toets(voorwaarde, { ...ctx, procent });
    if (uitslag === null && !voorwaarde.of) return null;
    if (uitslag !== null) procent = uitslag;
    ketting = uitslag !== null && voorwaarde.of;
  }

  return procent;
}

/**
 * `%{REQUEST_FILENAME}` zoals Apache hem vult: het pad tot en met het eerste
 * segment dat geen map is; de rest is `PATH_INFO` en valt eraf.
 *
 * 📏 Gemeten en niet afgeleid: `/doelen/` heeft als bestandsnaam `…/doelen`
 *    (zonder streep), dus de oude regel `%{REQUEST_FILENAME}.html -f` vond
 *    `doelen.html` wél. Een bestaande map houdt zijn streep: `/groep/` blijft
 *    `…/groep/`. Zonder dit verschil week het model op 28 van de 157 adressen
 *    af van Apache.
 *
 * @param {string} pad
 * @param {Set<string>} mappen
 */
function bestandsnaamVoor(pad, mappen) {
  const delen = relatief(pad).split('/');
  for (let i = 1; i <= delen.length; i += 1) {
    const voorvoegsel = delen.slice(0, i).join('/');
    if (delen[i - 1] !== '' && !mappen.has(voorvoegsel)) return `${ROOT}/${voorvoegsel}`;
  }
  return `${ROOT}/${relatief(pad)}`;
}

/**
 * Eén ronde door de regels: het nieuwe pad, `null` voor "niets doen", of
 * `undefined` als geen regel paste.
 *
 * @param {ReturnType<typeof leesRegels>['regels']} regels
 * @param {string} pad
 * @param {{bestanden: Set<string>, mappen: Set<string>}} boom
 */
function ronde(regels, pad, boom) {
  const bestandsnaam = bestandsnaamVoor(pad, boom.mappen);

  for (const regel of regels) {
    const dollar = new RegExp(regel.patroon).exec(relatief(pad));
    if (!dollar) continue;
    const procent = voorwaardenGelden(regel.voorwaarden, { ...boom, bestandsnaam, dollar: [...dollar], procent: [] });
    if (procent === null) continue;
    if (regel.doel === '-') return null;
    if (!regel.vlaggen.has('L')) throw new Error('htaccess-routering kent alleen regels met [L]');
    return vul(regel.doel, [...dollar], procent);
  }

  return undefined;
}

/**
 * Wat de server geeft na het herschrijven: een bestand, 403 of 404.
 *
 * @param {string} pad
 * @param {{bestanden: Set<string>, mappen: Set<string>}} boom
 */
function serveer(pad, boom) {
  const rel = relatief(pad);
  if (boom.bestanden.has(rel)) return { status: 200, bestand: rel };
  if (!boom.mappen.has(rel.replace(/\/+$/, ''))) return { status: 404 };

  const index = rel === '' ? 'index.html' : `${rel.replace(/\/+$/, '')}/index.html`;
  if (pad.endsWith('/') && boom.bestanden.has(index)) return { status: 200, bestand: index };
  return { status: 403 };
}

/**
 * Het antwoord van de server op één adres.
 *
 * @param {string} htaccess
 * @param {Iterable<string>} bestanden  paden ten opzichte van `dist/`, met `/`
 * @param {string} adres                beginnend met `/`
 * @returns {{status: number, bestand?: string, locatie?: string}}
 */
export function beantwoord(htaccess, bestanden, adres) {
  const { regels, directorySlash } = leesRegels(htaccess);
  const boom = { bestanden: new Set(bestanden), mappen: mappenUit(bestanden) };

  // Een RewriteRule en mod_dir zien de query niet; Apache serveert hetzelfde bestand.
  const zonderQuery = adres.split('?')[0] ?? adres;
  const query = adres.slice(zonderQuery.length);
  const rel = relatief(zonderQuery);
  if (directorySlash && rel !== '' && !zonderQuery.endsWith('/') && boom.mappen.has(rel) && !boom.bestanden.has(rel)) {
    return { status: 301, locatie: `${zonderQuery}/${query}` };
  }

  let pad = zonderQuery;
  for (let i = 0; i < MAX_RONDES; i += 1) {
    const volgende = ronde(regels, pad, boom);
    if (volgende === null || volgende === undefined || volgende === pad) return serveer(pad, boom);
    pad = volgende;
  }
  return { status: 500 };
}

/**
 * Welke adressen een gebruiker kan intypen of verversen, met het bestand dat
 * hij hoort te krijgen (`null`: elke pagina is goed, de app routeert zelf).
 *
 * @param {Iterable<string>} bestanden
 * @returns {{adres: string, verwacht: string | null}[]}
 */
export function teMetenAdressen(bestanden) {
  const lijst = [...bestanden];
  const adressen = [];

  for (const pad of lijst.filter((p) => p.endsWith('.html'))) {
    const route = pad.replace(/\.html$/, '').replace(/(^|\/)index$/, '').replace(/\[[^/\]]+\]/g, 'voorbeeld');
    if (route === '') continue;
    adressen.push({ adres: `/${route}`, verwacht: pad }, { adres: `/${route}/`, verwacht: pad });
    // Een pagina met iets erachter (een verouderde link): de app, nooit een 500.
    if (!pad.includes('[')) adressen.push({ adres: `/${route}/x`, verwacht: null });
  }

  for (const map of mappenUit(lijst)) {
    if (map === '' || adressen.some((a) => a.adres === `/${map}`)) continue;
    adressen.push({ adres: `/${map}`, verwacht: null }, { adres: `/${map}/`, verwacht: null });
  }

  return [{ adres: '/', verwacht: 'index.html' }, ...adressen];
}

/**
 * Elk adres dat geen directe 200 met een pagina geeft, of de verkeerde pagina.
 *
 * ⚠️ **Een 301 is ook een bezwaar, niet alleen een 403.** De doorverwijzing van
 *    mod_dir is permanent: een browser die hem één keer zag, vraagt daarna zelf
 *    het adres mét schuine streep — en dat is precies het adres dat 403 gaf.
 *
 * @param {string} htaccess
 * @param {Iterable<string>} bestanden
 */
export function routeringsbezwaren(htaccess, bestanden) {
  const lijst = [...bestanden];
  const bezwaren = [];

  for (const { adres, verwacht } of teMetenAdressen(lijst)) {
    const antwoord = beantwoord(htaccess, lijst, adres);
    const goedeStatus = antwoord.status === 200 && antwoord.bestand?.endsWith('.html');
    if (!goedeStatus || (verwacht !== null && antwoord.bestand !== verwacht)) {
      bezwaren.push({ adres, verwacht, antwoord });
    }
  }

  return bezwaren;
}
