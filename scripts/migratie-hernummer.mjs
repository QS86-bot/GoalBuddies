#!/usr/bin/env node
/**
 * Een migratie hernummeren, inclusief élke verwijzing — QS8-241.
 *
 * ⚠️ **Waarom dit bestaat, en waarom het níét over detectie gaat.** Op 31-08-2026
 *    botste het nummer van één branch drie keer op één dag. Dat is geen defect:
 *    een branch die uren openstaat wordt ingehaald, en `migratie-nieuw.mjs`
 *    schrijft in zijn eigen kop al op dat een nummer pas van jou is als je landt.
 *    `migraties:controle` ziet de botsing ook — met de hand gemeten, exitcode 1,
 *    beide bestandsnamen bij naam.
 *
 *    **Het gat zit in de repáratie.** Hernummeren is `git mv` plus elke
 *    verwijzing, en die staan op vier soorten plekken: de kopregel, de rest van
 *    het bestand, code-commentaar elders, en de documenten.
 *
 * ⚠️ **De fout die dit script bestaat om te voorkomen.** De reparatie van 31-08
 *    was:
 *
 *      sed -i 's/\b0134\b/0136/g' supabase/migrations/0136_….sql
 *
 *    Die laat de kopregel **stil staan**, want `_` is in GNU sed een woordteken:
 *    in `0134_een_plan` staat geen woordgrens achter de `4`. Het bestand heette
 *    daarna `0136_…` terwijl zijn eerste regel `0134_…` zei. Gevonden met het oog
 *    in een grep — en de kop is juist de regel die een lezer als eerste gelooft.
 *
 *    Vandaar `verwijzingsPatroon()` hieronder: dat staat een `_` uitdrukkelijk
 *    toe waar `\b` hem afwijst.
 *
 * ⚠️ **`kopNummer()` wordt óók door `migraties:controle` gebruikt, en dat is de
 *    kern van het ontwerp.** Zou de controle zijn eigen opvatting hebben van
 *    "wat zegt de kop", dan kunnen de herschrijver en de bewaker het oneens
 *    worden — en dan bewaakt de tweede iets anders dan de eerste schrijft. Dat
 *    is de twee-lijsten-fout uit 0032/0034. Eén definitie, twee aanroepers.
 *
 * Gebruik:
 *   npm run migratie:hernummer -- 0134 0136
 *   npm run migratie:hernummer -- 0134 0136 --droog     # laat zien, doe niets
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { haalRemoteOp, nummersPerBranch, versheidsmelding } from './migratiebranches.mjs';
import { beoordeelOmgeving } from './migratieregister-omgeving.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAP = join(WORTEL, 'supabase', 'migrations');

/** Waar een verwijzing kan staan. `supabase/` zit erbij voor de migraties zelf. */
const DOORZOEKEN = ['src', 'app', 'scripts', 'tests', 'docs', 'supabase'];
const EXTENSIES = ['.ts', '.tsx', '.mjs', '.js', '.sql', '.md', '.json'];

/**
 * ⚠️ **Dit is de regel waar het vandaag op misging.**
 *
 *   - vóór het nummer: geen cijfer of letter, zodat `20134` niet meetelt;
 *   - ná het nummer: geen cijfer en geen kléine letter. Een `_` mág dus wél, en
 *     dát is het verschil met `\b`. Een `a` mag níét, want `0039a` is een eigen
 *     deelmigratie en geen verwijzing naar `0039`.
 */
function verwijzingsPatroon(nummer) {
  return new RegExp(`(?<![0-9a-zA-Z])${nummer}(?![0-9a-z])`, 'g');
}

/** `0134_een_plan_uit_een_zin.sql` → `0134_een_plan_uit_een_zin` */
export function basisUit(bestandsnaam) {
  const m = /^(\d{4}[a-z]?_[a-z0-9_]+)\.sql$/.exec(bestandsnaam);
  return m === null ? null : m[1];
}

/**
 * Het nummer dat de **kop** van zichzelf beweert.
 *
 * ⚠️ **Het nummer en niet de slug, en dat is een ijking en geen versoepeling.**
 *    De eerste versie hiervan eiste de volledige vorm `NNNN_naam.sql`, en die
 *    meldde **vijftien gezonde bestanden**. Er zijn namelijk twee kopstijlen in
 *    deze repo, allebei legitiem:
 *
 *      -- 0139_de_week_startdag_verzet_de_lopende_week_mee.sql — …   (het sjabloon)
 *      -- 0062 — Web push: de twee sleutels van een PushSubscription  (ouder)
 *
 *    Een controle die vijftien correcte bestanden meldt, leer je uitzetten —
 *    CLAUDE.md zegt dat met zoveel woorden. **En de belofte gaat ook niet over
 *    de slug**: de fout van 31-08 was een kop die `0134` zei in een bestand dat
 *    `0136` heette. Het nummer is wat liegt na een hernummering.
 *
 * ⚠️ **Het hele kopblok en niet alleen regel één**, want sommige migraties
 *    openen met een scheidingslijn (`-- ----`) en noemen zichzelf op regel twee.
 *    Het eerste nummer dat in het blok staat, is het nummer van het bestand;
 *    verwijzingen naar ándere migraties komen verderop in de prozatekst.
 */
export function kopNummer(inhoud) {
  const regels = (inhoud ?? '').split('\n');

  for (const regel of regels) {
    if (regel.trim() === '') continue;
    if (!regel.trimStart().startsWith('--')) break;

    const m = /(?<![0-9a-zA-Z])(\d{4})(?![0-9])/.exec(regel);
    if (m !== null) return m[1];
  }

  return null;
}

/**
 * Zegt de kop van dit bestand zijn eigen nummer?
 *
 * ⚠️ **Gebruikt door `migraties:controle`.** Zie de kop van dit bestand voor
 *    waarom die niet zijn eigen versie hiervan heeft.
 */
export function kopKlopt(bestandsnaam, inhoud) {
  const basis = basisUit(bestandsnaam);
  // Geen leesbare bestandsnaam is een andere fout, en die meldt stap 1 al.
  if (basis === null) return true;

  const kop = kopNummer(inhoud);
  if (kop === null) return false;

  return kop === basis.slice(0, 4);
}

/**
 * Herschrijft de kop naar het nieuwe nummer, in béíde stijlen.
 *
 * ⚠️ De volledige vorm eerst: staat er `0134_naam.sql`, dan moet de hele slug
 *    mee en niet alleen het getal. Staat er alleen `-- 0134 — titel`, dan is het
 *    getal alles wat er is.
 */
export function herschrijfKop(inhoud, nieuweBasis) {
  const regels = (inhoud ?? '').split('\n');
  const naar = nieuweBasis.slice(0, 4);

  for (let i = 0; i < regels.length; i += 1) {
    const regel = regels[i];
    if (regel.trim() === '') continue;
    if (!regel.trimStart().startsWith('--')) break;

    if (/\d{4}[a-z]?_[a-z0-9_]+\.sql/.test(regel)) {
      regels[i] = regel.replace(/\d{4}[a-z]?_[a-z0-9_]+\.sql/, `${nieuweBasis}.sql`);
      return regels.join('\n');
    }

    if (/(?<![0-9a-zA-Z])\d{4}(?![0-9])/.test(regel)) {
      regels[i] = regel.replace(/(?<![0-9a-zA-Z])\d{4}(?![0-9])/, naar);
      return regels.join('\n');
    }
  }

  return inhoud;
}

/**
 * De volledige basis van een migratie, veilig als patroon.
 *
 * ⚠️ De staart-lookahead is er zodat `0159_een_plan` niet matcht binnen
 *    `0159_een_plan_b`. Zonder die regel hernoemt het script een migratie die
 *    toevallig met dezelfde woorden begint.
 */
function basisPatroon(basis) {
  return new RegExp(`(?<![0-9a-zA-Z])${basis}(?![a-z0-9_])`, 'g');
}

/**
 * Herschrijft de verwijzingen in één bestand — QS8-277.
 *
 * ⚠️⚠️ **Waarom de oude `vervangIn()` hierin opgegaan is.** Die zocht op
 *    **nummer** en verder niets, en dat is precies één ding te weinig zodra er
 *    twee migraties met dat nummer in de map staan. 📏 Gemeten op
 *    05-09-2026, bij het oplossen van de vierde nummerbotsing:
 *
 *      supabase/migrations/0159_een_adempauze_telt_niet_als_gemiste_week.sql
 *      -- 0159_een_adempauze_… — …      →    -- 0160_een_adempauze_… — …
 *
 *    Het script schreef de **kopregel van de ánder** bij, plus twee verwijzingen
 *    in `docs/ENGINEER-REVIEW.md` die bij het issue van die ander hoorden. Beide
 *    met de hand teruggezet; dat is precies de correctie die je een keer vergeet.
 *
 * ⚠️ **De oude vorm wist het al en zei het alleen.** `kiesBron()` gaf `gedeeld`
 *    terug en de CLI drukte *"loop de lijst na vóór je zonder --droog draait"* —
 *    en herschreef daarna alles alsof er niets aan de hand was. Dat is dezelfde
 *    vorm die QS8-247 in `migratie:nieuw` wegnam: **een gereedschap dat bestaat
 *    om een botsing op te ruimen, mag zijn juistheid niet laten afhangen van een
 *    handeling die het zelf niet doet.** Een waarschuwing die je toch moet
 *    negeren om verder te komen, is een disclaimer.
 *
 * **De regel, in twee helften:**
 *
 * 1. **Een volledige basis is bewijs.** `0159_een_uitgezet_lid_…` kan maar naar
 *    één bestand wijzen, ook als er twee migraties 0159 heten. Die wordt altijd
 *    herschreven.
 * 2. **Een kaal nummer is dat niet.** Bij een gedeeld nummer wordt het
 *    *gemeld* — met bestand en regel — en niet aangeraakt. Bij een uniek nummer
 *    valt er niets te verwarren en wordt het gewoon herschreven, zoals altijd.
 *
 * ⚠️ **En een kaal nummer dat de naam van een ánder bestand begint, telt niet
 *    eens als vondst.** `0159_een_adempauze_…` ís de naam van een migratie die
 *    in de map staat; dat is geen verwijzing naar de onze en ook geen twijfelgeval.
 *    Zonder die uitzondering meldt het script bij élke botsing de kop van de
 *    buurman, en een melding die je altijd wegwuift, leer je wegwuiven.
 *
 * ⚠️ **Het issue vroeg om "het zusterbestand nooit aanraken" als harde
 *    uitzondering. Dit is scherper en niet losser:** de basisregel laat de kop
 *    van de zuster met rust omdat die zijn éígen naam noemt, maar staat wél toe
 *    dat de zuster een verwijzing naar óns bestand bij krijgt — en dat hoort ook.
 *    Een blanket-uitzondering zou daar een verouderde verwijzing achterlaten.
 *
 * ⚠️ De opties dragen hier een expliciet type, en niet uit netheid: twee velden
 *    hebben een standaardwaarde en dan leidt `tsc` het hele object daaruit af —
 *    de velden zónder standaard vallen dan weg en elke aanroeper wordt rood.
 *
 * @param {string} tekst de inhoud van het bestand
 * @param {{
 *   nummer: string,
 *   oudeBasis: string,
 *   nieuweBasis: string,
 *   gedeeld?: boolean,
 *   bekendeBases?: readonly string[],
 * }} opties
 *   `nummer` is het bronnummer in vier cijfers, `oudeBasis` en `nieuweBasis` zijn
 *   de volledige namen zonder `.sql`, `gedeeld` zegt of er meer migraties op dit
 *   nummer staan, en `bekendeBases` is de basis van élke migratie in de map.
 */
export function herschrijfVerwijzingen(tekst, opties) {
  const { nummer, oudeBasis, nieuweBasis, gedeeld = false, bekendeBases = [] } = opties;
  const naar = (nieuweBasis ?? '').slice(0, 4);
  const bekend = new Set(bekendeBases);
  const basis = basisPatroon(oudeBasis);
  const kaal = verwijzingsPatroon(nummer);

  let treffers = 0;
  const geraakt = new Set();
  const gemeld = [];

  const uit = (tekst ?? '').split('\n').map((regel, i) => {
    // 1. De volledige basis: bewijs, dus altijd.
    basis.lastIndex = 0;
    const metBasis = regel.replace(basis, () => {
      treffers += 1;
      geraakt.add(i + 1);
      return nieuweBasis;
    });

    // 2. Wat er kaal overblijft.
    kaal.lastIndex = 0;
    return metBasis.replace(kaal, (treffer, positie) => {
      // De naam van een ánder bestand is geen verwijzing naar het onze, en ook
      // geen twijfelgeval: die staat gewoon in de map.
      const staart = /^(\d{4}[a-z]?_[a-z0-9_]+)/.exec(metBasis.slice(positie));
      if (staart !== null && bekend.has(staart[1])) return treffer;

      if (gedeeld) {
        gemeld.push({ regel: i + 1, fragment: regel.trim() });
        return treffer;
      }

      treffers += 1;
      geraakt.add(i + 1);
      return naar;
    });
  });

  return {
    tekst: uit.join('\n'),
    treffers,
    regels: [...geraakt].sort((a, b) => a - b),
    gemeld,
  };
}

/**
 * Mag deze hernummering?
 *
 * @param aanwezig  de nummers die lokaal in de map staan (strings van 4 cijfers)
 * @param perBranch `{ branch: hoogsteNummer }` uit `migratiebranches.mjs`
 * @param register  de versies op productie, of `null` als dat ongemeten is
 */
/**
 * Welk bestand bedoelt `<van>`?
 *
 * ⚠️⚠️ **Dit bestond niet, en de oude regel was `bestanden.find(...)` — de
 *    eerste treffer.** Op 01-09-2026 stonden er na een merge twee migraties met
 *    nummer `0146`: eentje die via PR #149 op `main` geland was, en eentje die
 *    nog niet gelandwas. `migratie:hernummer -- 0146 0147` pakte **het gelande
 *    bestand**, hernoemde het, en werkte alle verwijzingen bij — inclusief een
 *    bronbestand dat bij die ándere migratie hoorde. De kans dat hij het
 *    verkeerde koos was precies vijftig procent (QS8-263).
 *
 * ⚠️ **De bestaande weigering dekte dit niet, en dat is de kern.** Het script
 *    weigert al als het bronnummer in het register op productie staat — maar
 *    die vraag gaat over het **nummer**, en bij twee bestanden kan het antwoord
 *    per **bestand** verschillen. Was dit doorgegaan, dan was een gelande
 *    migratie hernummerd terwijl zijn oude nummer op productie staat: precies
 *    de uiteenloop van QS8-122.
 *
 * ⚠️ **Weigeren en niet kiezen.** Er was een variant denkbaar die per bestand in
 *    het register kijkt en automatisch het níet-gelande exemplaar neemt. Die
 *    klinkt slim en is het niet: hij beslist iets namens de gebruiker in precies
 *    het geval waar vergissen duur is. `<van>` mag daarom ook een bestandsnaam
 *    zijn — dan is er niets meer te raden.
 *
 * @param van het argument zoals de gebruiker het gaf: een nummer of een bestandsnaam
 * @param bestanden alle `.sql`-namen in de migratiemap
 */
export function kiesBron(van, bestanden) {
  const namen = bestanden ?? [];

  // Een bestandsnaam wijst zichzelf aan; er valt dan niets te kiezen.
  if (/\.sql$/i.test(van ?? '')) {
    const naam = (van ?? '').replace(/^.*[/\\]/, '');
    if (!namen.includes(naam)) {
      return { ok: false, reden: 'bestand_ontbreekt', uitleg: `${naam} staat niet in de map.` };
    }
    // ⚠️ **Gekozen is niet hetzelfde als veilig, en dat moet de CLI zeggen.**
    //    De verwijzingsvervanging verderop gaat op **nummer**: hij zoekt overal
    //    naar `0146` en kan niet weten of zo'n vermelding bij dít bestand hoort
    //    of bij de ander met hetzelfde nummer. Bij een botsing is de hernoeming
    //    dus wél de goede, maar de verwijzingen zijn dat niet noodzakelijk.
    const nummer = naam.slice(0, 4);
    const gedeeld = namen.filter((n) => n.startsWith(`${nummer}_`)).length > 1;
    return { ok: true, bestand: naam, nummer, gedeeld };
  }

  const treffers = namen.filter((n) => n.startsWith(`${van}_`));

  if (treffers.length === 0) {
    return { ok: false, reden: 'bron_ontbreekt', uitleg: `Er staat geen migratie ${van} in de map.` };
  }

  if (treffers.length > 1) {
    return {
      ok: false,
      reden: 'bron_dubbel',
      uitleg:
        `Er staan ${treffers.length} migraties met nummer ${van} in de map:\n` +
        treffers.map((n) => `    ${n}`).join('\n') +
        '\n  Welke van de twee bedoel je? Geef de bestandsnaam in plaats van het\n' +
        '  nummer. ⚠️ Eén ervan kan al geland of toegepast zijn, en juist díe\n' +
        '  hernummeren maakt de map onverenigbaar met het register (QS8-263).',
      treffers,
    };
  }

  return { ok: true, bestand: treffers[0], nummer: van };
}

export function beoordeelHernummering({ van, naar, aanwezig, perBranch, register }) {
  if (!/^\d{4}$/.test(van ?? '') || !/^\d{4}$/.test(naar ?? '')) {
    return { ok: false, reden: 'vorm', uitleg: 'Beide nummers zijn vier cijfers, zoals 0134.' };
  }

  if (van === naar) {
    return { ok: false, reden: 'gelijk', uitleg: 'Van en naar zijn hetzelfde nummer.' };
  }

  if (!aanwezig.includes(van)) {
    return { ok: false, reden: 'bron_ontbreekt', uitleg: `Er staat geen migratie ${van} in de map.` };
  }

  if (aanwezig.includes(naar)) {
    return {
      ok: false,
      reden: 'doel_bezet',
      uitleg: `${naar} staat al in deze map. Kies een vrij nummer.`,
    };
  }

  // ⚠️ Dezelfde bron als `migratie:nieuw`, en om dezelfde reden: een nummer dat
  //    elders al vergeven is, botst opnieuw zodra die branch landt.
  const bezet = Object.entries(perBranch ?? {})
    .filter(([, hoogste]) => Number(naar) <= (hoogste ?? 0))
    .map(([branch]) => branch);

  if (bezet.length > 0) {
    return {
      ok: false,
      reden: 'doel_bezet_elders',
      uitleg:
        `${naar} ligt niet boven wat deze branches al dragen: ${bezet.join(', ')}. ` +
        'Dat botst opnieuw zodra die landen.',
    };
  }

  // ⚠️ **De enige toets die schade voorkomt in plaats van gedoe.** Staat de
  //    migratie al op productie, dan is `git mv` de verkeerde reparatie: je houdt
  //    een map over die niet meer opbouwt wat het register zegt, en dan toetst de
  //    RLS-suite elders een ánder schema dan productie. Dat is QS8-122 en QS8-237.
  if (register === null) {
    return {
      ok: false,
      reden: 'register_ongemeten',
      uitleg:
        'Het migratieregister is niet te lezen zonder EXPO_PUBLIC_SUPABASE_URL en\n' +
        '  SUPABASE_SERVICE_ROLE_KEY. Ongemeten is hier niet hetzelfde als veilig:\n' +
        '  staat deze migratie al op productie, dan is hernummeren de verkeerde\n' +
        '  reparatie. Draai met credentials, of bevestig met --register-ongemeten.',
    };
  }

  if (register.includes(van)) {
    return {
      ok: false,
      reden: 'bron_toegepast',
      uitleg:
        `${van} staat in het register op productie. Hernummeren maakt de map dan\n` +
        '  onverenigbaar met wat er draait. Wat hier moet is een ingreep in het\n' +
        '  register (docs/DEPLOY.md §2.2), niet een hernoeming.',
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vanaf hier: de CLI
// ---------------------------------------------------------------------------

function bestandenOnder(map) {
  const uit = [];
  const loop = (pad) => {
    for (const naam of readdirSync(pad)) {
      if (naam === 'node_modules' || naam === '.git' || naam === 'dist') continue;
      const vol = join(pad, naam);
      if (statSync(vol).isDirectory()) loop(vol);
      else if (EXTENSIES.some((e) => naam.endsWith(e))) uit.push(vol);
    }
  };
  try {
    loop(map);
  } catch {
    // Een map die niet bestaat is geen fout; niet elk project heeft ze alle zes.
  }
  return uit;
}

async function leesRegister() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const sleutel = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (beoordeelOmgeving({ url, sleutel, streng: false }) !== 'draaien') return null;

  try {
    const antwoord = await fetch(`${url}/rest/v1/rpc/migratieregister`, {
      method: 'POST',
      headers: {
        apikey: sleutel,
        Authorization: `Bearer ${sleutel}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(15_000),
    });
    if (!antwoord.ok) return null;
    const rijen = await antwoord.json();
    return (rijen ?? []).map((r) => String(r.version ?? r.versie ?? ''));
  } catch {
    return null;
  }
}

async function hoofd() {
  const argumenten = process.argv.slice(2);
  const droog = argumenten.includes('--droog');
  const negeerRegister = argumenten.includes('--register-ongemeten');
  const [van, naar] = argumenten.filter((a) => !a.startsWith('--'));

  if (van === undefined || naar === undefined) {
    console.error(
      'Gebruik: npm run migratie:hernummer -- <van> <naar> [--droog]\n' +
        '  <van> is een viercijferig nummer, of een bestandsnaam wanneer er twee\n' +
        '  migraties met hetzelfde nummer in de map staan.',
    );
    process.exit(1);
  }

  // ⚠️ Ook dit script deelt een nummer uit — `doel_bezet_elders` is alleen zoveel
  //    waard als het beeld waarop hij rust. Zelfde grens als `migratie:nieuw`
  //    (QS8-247).
  for (const regel of versheidsmelding({ ...haalRemoteOp(), nu: new Date() })) {
    console.log(regel);
  }

  const bestanden = readdirSync(MAP).filter((n) => n.endsWith('.sql'));
  const aanwezig = [...new Set(bestanden.map((n) => n.slice(0, 4)))];
  const register = negeerRegister ? [] : await leesRegister();

  // ⚠️ **Eerst wélk bestand, dan pas of het mag.** Die volgorde is de reparatie
  //    van QS8-263: de toets op het register gaat over het númmer, en bij twee
  //    bestanden met hetzelfde nummer kan het antwoord per bestand verschillen.
  const bron = kiesBron(van, bestanden);
  if (!bron.ok) {
    console.error(`✗ ${van} → ${naar} kan niet: ${bron.reden}\n  ${bron.uitleg}`);
    process.exit(1);
  }

  if (bron.gedeeld === true) {
    console.log(
      `⚠️  Er staan meer migraties met nummer ${bron.nummer} in de map.\n` +
        '    Buiten het gekozen bestand worden daarom alleen verwijzingen herschreven\n' +
        '    die de vólledige naam noemen — die kan maar naar één bestand wijzen. Een\n' +
        `    kaal ${bron.nummer} elders wordt gemeld en niet aangeraakt: dat is met twee\n` +
        '    bestanden op hetzelfde nummer niet te bewijzen. QS8-277.\n',
    );
  }

  const oordeel = beoordeelHernummering({
    van: bron.nummer,
    naar,
    aanwezig,
    perBranch: nummersPerBranch(),
    register,
  });

  if (!oordeel.ok) {
    console.error(`✗ ${bron.nummer} → ${naar} kan niet: ${oordeel.reden}\n  ${oordeel.uitleg}`);
    process.exit(1);
  }

  const oud = bron.bestand;
  // ⚠️ Vanaf hier telt het nummer van het gékozen bestand, niet het argument —
  //    dat kan een bestandsnaam zijn geweest.
  const bronNummer = bron.nummer;
  const oudeBasis = basisUit(oud);
  const nieuweBasis = `${naar}${oudeBasis.slice(4)}`;

  console.log(`${oudeBasis}.sql → ${nieuweBasis}.sql\n`);

  // ⚠️ Élke migratienaam in de map, zodat een verwijzing naar een ánder bestand
  //    als zodanig herkend wordt en niet als kaal nummer meetelt.
  const bekendeBases = bestanden.map((n) => basisUit(n)).filter((b) => b !== null);

  // ⚠️ **Binnen het gekozen bestand mag het script kiezen, daarbuiten niet.** Dit
  //    is het bestand dat je zelf hebt aangewezen en waarvan het nummer verandert;
  //    een kaal nummer erin gaat over zijn eigen nummering. Vandaar `gedeeld:
  //    false` — de naam van een ánder bestand blijft ook hier staan, want die
  //    uitzondering zit in `herschrijfVerwijzingen()` zelf.
  const oudPad = join(MAP, oud);
  const inhoud = readFileSync(oudPad, 'utf8');
  const metKop = herschrijfKop(inhoud, nieuweBasis);
  const { tekst: nieuweInhoud, treffers } = herschrijfVerwijzingen(metKop, {
    nummer: bronNummer,
    oudeBasis,
    nieuweBasis,
    gedeeld: false,
    bekendeBases,
  });

  console.log(`  ${relative(WORTEL, oudPad)}`);
  console.log(`    kopregel herschreven naar ${nieuweBasis}.sql`);
  console.log(`    ${treffers} verwijzing(en) in het bestand`);

  // 2. Elke andere plek.
  const elders = [];
  const nagelopen = [];
  for (const map of DOORZOEKEN) {
    for (const pad of bestandenOnder(join(WORTEL, map))) {
      if (pad === oudPad) continue;
      const tekst = readFileSync(pad, 'utf8');
      const uit = herschrijfVerwijzingen(tekst, {
        nummer: bronNummer,
        oudeBasis,
        nieuweBasis,
        gedeeld: bron.gedeeld === true,
        bekendeBases,
      });

      if (uit.gemeld.length > 0) nagelopen.push({ pad, gemeld: uit.gemeld });
      if (uit.treffers === 0) continue;

      elders.push({ pad, inhoud: uit.tekst, treffers: uit.treffers, regels: uit.regels });
    }
  }

  for (const e of elders) {
    console.log(`  ${relative(WORTEL, e.pad)}`);
    console.log(`    ${e.treffers} verwijzing(en), regel ${e.regels.join(', ')}`);
  }

  // ⚠️ **Onderaan en met naam, want dit is het werk dat overblijft.** Bij een
  //    gedeeld nummer kan het script deze regels niet bewijzen, en dan hoort het
  //    ze niet te raden. Ze staan hier zodat een mens ze naloopt — niet als
  //    disclaimer vooraf maar als een lijst achteraf.
  if (nagelopen.length > 0) {
    const totaal = nagelopen.reduce((n, e) => n + e.gemeld.length, 0);
    console.log(
      `\n⚠️  ${totaal} kale verwijzing(en) naar ${bronNummer} niet aangeraakt, in ` +
        `${nagelopen.length} bestand(en):`,
    );
    for (const e of nagelopen) {
      console.log(`  ${relative(WORTEL, e.pad)}`);
      for (const g of e.gemeld) {
        console.log(`    regel ${g.regel}: ${g.fragment.slice(0, 100)}`);
      }
    }
    console.log(
      `\n  Hoort zo'n regel bij ${oudeBasis}, zet hem dan met de hand op ${naar}.\n` +
        `  Hoort hij bij de ándere migratie ${bronNummer}, laat hem staan.`,
    );
  }

  if (droog) {
    console.log('\n(droog — er is niets gewijzigd)');
    return;
  }

  writeFileSync(oudPad, nieuweInhoud);
  execFileSync('git', ['mv', oudPad, join(MAP, `${nieuweBasis}.sql`)], { cwd: WORTEL });
  for (const e of elders) writeFileSync(e.pad, e.inhoud);

  const rest =
    nagelopen.length > 0
      ? `, maar ${nagelopen.reduce((n, e) => n + e.gemeld.length, 0)} kale verwijzing(en) ` +
        'hierboven niet aangeraakt'
      : '';
  console.log(`\n✓ hernummerd${rest}. Draai \`npm run poort\` voordat je pusht.`);
}

// ⚠️ Alleen draaien als script, niet bij het importeren vanuit een test.
//
// ⚠️ `pathToFileURL()` en niet `fileURLToPath()`, en dat is geen smaak: op
//    Windows levert de omgekeerde vergelijking een pad met backslashes tegenover
//    een `file:///C:/…`-URL, en dan is de guard altijd onwaar en draait het
//    script nooit. `tests/scripts/padvormen.test.ts` bewaakt dat — en ving deze
//    versie ook daadwerkelijk.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd().catch((fout) => {
    console.error(fout.message);
    process.exit(1);
  });
}
