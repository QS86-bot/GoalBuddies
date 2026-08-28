#!/usr/bin/env node
/**
 * Geen Nederlandse UI-tekst meer hard in de code — QS8-115, criterium 1.
 *
 * ⚠️ **Waarom een controle en niet een test per scherm.** De belofte van dit
 *    issue is niet "dit scherm is vertaald" maar "er staat nergens meer tekst
 *    hard in de code". Dat is een eigenschap van het gehéél, en precies het
 *    soort belofte dat volgens regel 18 in `CLAUDE.md` een eigen slot verdient:
 *    per bestand testen laat de naad onbewaakt, en de naad is waar de volgende
 *    hardgecodeerde zin binnenkomt.
 *
 * ⚠️ **Hij is rood zolang QS8-115 loopt, en dat is de bedoeling.** Elke map die
 *    omgezet wordt, haalt er treffers af. Pas als hij groen is, hoort hij in
 *    `/audit` — een controle die je aanzet terwijl hij rood staat, leert je om
 *    rood te negeren.
 *
 * ## Wat als tekst telt
 *
 * Een letterlijke string met **twee of meer woorden achter elkaar** in
 * JSX-tekst of in een prop die de gebruiker leest. Eén woord telt niet mee: dat
 * is vaker een sleutel, een testid of een stijlwaarde dan een zin.
 *
 * Niet meegeteld:
 *
 *   * commentaar — het gaat om wat de gebruiker leest, niet de bouwer;
 *   * testbestanden — die zetten met opzet vaste teksten neer;
 *   * `src/shared/i18n/` — dat ís de catalogus;
 *   * alles wat door `t(...)` heen gaat.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { metSchuineStrepen } from './paden.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAPPEN = ['src', 'app'];

/** Props waarvan de waarde op het scherm belandt. */
const TEKSTPROPS = [
  'title',
  'label',
  'placeholder',
  'eyebrow',
  'melding',
  'hint',
  'uitleg',
  'bevestig',
  'annuleer',
  'accessibilityLabel',
  'accessibilityHint',
];

/**
 * Namen die van iemand anders zijn.
 *
 * ⚠️ **Een merknaam hóórt niet in de catalogus, en dat is geen uitzondering uit
 *    gemak.** Een sleutel in `nl.ts` en `en.ts` is een uitnodiging om er iets
 *    anders van te maken, en "Apple" is in élke taal Apple. Zou hij er wel in
 *    staan, dan is de eerste vertaler die hem netjes lokaliseert een bug in een
 *    inlogknop.
 *
 * ⚠️ Deze lijst hoort kort te blijven. Groeit hij, dan is dat een teken dat er
 *    gewone app-tekst in weggemoffeld wordt.
 */
const MERKNAMEN = new Set(['Apple', 'Google']);

/**
 * Waarden die eruitzien als tekst maar geen táál zijn.
 *
 * ⚠️ Zelfde gedachte als `MERKNAMEN`: een sleutel in de catalogus is een
 *    uitnodiging om er iets anders van te maken, en dat is hier fout. Een
 *    tijdzone-identificatie is een IANA-naam die Postgres moet herkennen, en een
 *    voorbeeldcode is opgebouwd uit het alfabet van `generate_invite_code()` —
 *    wie die vertaalt, breekt het voorbeeld.
 *
 * ⚠️ Ook deze lijst hoort niet te groeien met gewone app-tekst. Beide regels zijn
 *    daarom smal: een identificatie heeft een schuine streep en geen spaties, en
 *    een voorbeeldcode is hoofdletters mét minstens één cijfer. "ALLEEN VOOR
 *    BEHEERDERS" valt op beide af.
 */
function isGeenTaal(tekst) {
  return (
    (/^[A-Za-z][A-Za-z_]*\/[A-Za-z_+-]+$/.test(tekst) && !/\s/.test(tekst)) ||
    (/^[A-Z0-9-]+$/.test(tekst) && /[0-9]/.test(tekst))
  );
}

/** Twee woorden achter elkaar, met minstens één kleine letter — dus een zin. */
const ZIN = /[A-Za-zÀ-ÿ]{2,}[ ,][a-zà-ÿ]{2,}/;

export const OVERSLAAN = [
  /\/shared\/i18n\//,
  /\.test\.tsx?$/,
  /\/database\.types\.ts$/,
];

function bestanden(map) {
  const gevonden = [];
  const loop = (pad) => {
    for (const naam of readdirSync(pad)) {
      const vol = join(pad, naam);
      if (statSync(vol).isDirectory()) loop(vol);
      else if (/\.tsx?$/.test(naam)) gevonden.push(vol);
    }
  };
  loop(join(WORTEL, map));
  return gevonden;
}

/**
 * Loopt door een bestand en zegt per regel of hij commentaar is.
 *
 * ⚠️ **Blokcommentaar bijhouden is geen finesse maar de helft van het werk.**
 *    Een `{/* ... *\/}` in JSX loopt over meerdere regels, en die vervolgregels
 *    beginnen niet met `*`. Zonder deze toestand meldde de controle in zijn
 *    eerste versie zes uitleggende alinea's als hardgecodeerde tekst — en een
 *    controle die zes valse meldingen geeft, leert je om hem te negeren.
 */
function commentaarregels(regels) {
  const uit = new Array(regels.length).fill(false);
  let inBlok = false;

  regels.forEach((regel, i) => {
    const kaal = regel.trim();

    if (inBlok) {
      uit[i] = true;
      if (kaal.includes('*/')) inBlok = false;
      return;
    }

    if (kaal.startsWith('//')) {
      uit[i] = true;
      return;
    }

    const opent = kaal.indexOf('/*');
    if (opent !== -1 && !kaal.includes('*/', opent)) {
      uit[i] = true;
      inBlok = true;
      return;
    }

    uit[i] = kaal.startsWith('*') || kaal.startsWith('/*');
  });

  return uit;
}

/**
 * Zegt per regel of hij bínnen een meerregelige tekstprop valt.
 *
 * ⚠️ **De heuristiek per regel kan dit principieel niet zien**, en dat was het
 *    laatste gat van deze controle. Een prop met een lange zin loopt door:
 *
 *      hint={
 *        'De gedeelde dag van de groep. Verandert niets aan wanneer jouw eigen ' +
 *        'weekdoelen resetten — dat blijft je persoonlijke week-startdag.'
 *      }
 *
 *    De propregex eist de sluitquote op dezelfde regel, dus hij ziet niets. En
 *    een losse regel met alleen een string als kandidaat behandelen kan niet: dan
 *    meldt de controle elke `throw new Error('...')` en elke SQL-string, en een
 *    controle met tientallen valse meldingen leert je hem te negeren.
 *
 *    De uitweg is de tóestand. Binnen `hint={ … }` is een kale string per
 *    definitie schermtekst; erbuiten is dat maar de vraag.
 */
function binnenTekstProp(regels) {
  const uit = new Array(regels.length).fill(false);
  let binnen = false;

  const opent = new RegExp(`\\b(?:${TEKSTPROPS.join('|')})=\\{\\s*$`);

  regels.forEach((regel, i) => {
    if (binnen) {
      // De accolade die de prop sluit, staat op zijn eigen regel of vooraan.
      if (/^\s*\}/.test(regel)) {
        binnen = false;
        return;
      }
      uit[i] = true;
      return;
    }

    if (opent.test(regel)) binnen = true;
  });

  return uit;
}

/**
 * Zegt per regel of hij bínnen de kinderen van een JSX-tag valt.
 *
 * ⚠️ **Een zin die over twee regels loopt, was onzichtbaar** — en dat is
 *    dezelfde blinde vlek als bij `binnenTekstProp()`, één laag verderop. De
 *    kale-JSX-tekstheuristiek onderaan `kandidaten()` eist een hoofdletter aan
 *    het begin en verbiedt een komma aan het eind, en allebei die eisen breken
 *    op een afgebroken zin:
 *
 *      <Caption>
 *        Eén schakel per lid dat deze week zijn cyclus afsloot. Het gaat om opdagen,
 *        niet om hoeveel je haalde.
 *      </Caption>
 *
 *    De eerste regel eindigt op een komma (die eis houdt `Subheading,` uit een
 *    importlijst buiten de deur) en de tweede begint klein (die eis houdt
 *    doodgewone code buiten de deur). Twee terechte eisen, en samen zien ze een
 *    hele alinea niet. Er stonden er twee in de app terwijl de controle "nul"
 *    meldde.
 *
 *    De uitweg is dezelfde als bij een meerregelige prop: de tóestand. Staat een
 *    openingstag alleen op zijn regel, dan is alles tot de eerstvolgende tag per
 *    definitie kindertekst, en dan hoeven hoofdletter noch komma iets te
 *    bewijzen.
 *
 * ⚠️ **De toestand is met opzet kortlevend**, want een toestandspas die te lang
 *    aan blijft staan meldt hele bestanden. Hij begint alleen op een regel die
 *    hélemaal uit één openingstag bestaat, en hij stopt bij het eerste teken dat
 *    een tag kan zijn — dus ook bij een genest element. Kindertekst van dat
 *    geneste element wordt door zijn eigen openingstag opnieuw opgepakt.
 *
 * ⚠️ De eis "begint met `<`" is wat een generic buiten de deur houdt. `Array<Item>`
 *    eindigt óók op een `>` en heeft óók een hoofdletter, maar staat nooit vooraan.
 */
function binnenJsxTekst(regels, isTsx) {
  const uit = new Array(regels.length).fill(false);
  if (!isTsx) return uit;

  let binnen = false;
  let diep = 0;

  regels.forEach((regel, i) => {
    const kaal = regel.trim();

    // Elk teken dat een tag kan openen of sluiten beëindigt de kindertekst.
    //
    // ⚠️ **Beëindigen is niet hetzelfde als overslaan, en dat was de derde
    //    ijking.** Deze tak stond eerst met een `return` erin, en dan is een
    //    genest element het einde van álle kindertekst in plaats van het begin
    //    van de zijne:
    //
    //      <View style={styles.vult}>      ← opent
    //        {uitCache ? (
    //          <Caption>                   ← sloot af, opende niet opnieuw
    //            Je leest de bewaarde berichten van deze week.
    //
    //    Precies dat verborg een van de twee zinnen waarvoor deze pas gebouwd is.
    //    De regel valt nu door naar de openingstoets eronder.
    if (binnen && (kaal.includes('<') || kaal.includes('>'))) {
      binnen = false;
      diep = 0;
    }

    if (binnen) {
      const na = diep + balans(kaal);
      // ⚠️ **Alleen een regel die zelf in evenwicht is, is tekst** — en dat is de
      //    tweede ijking van deze pas. Zonder deze eis meldde hij achttien
      //    regels, allemaal een ternary of een `t()`-aanroep die over meerdere
      //    regels loopt:
      //
      //      <Body>
      //        {stand === 'gekopieerd'
      //          ? t('delen.gekopieerd')
      //          : label}
      //      </Body>
      //
      //    Zulke regels dragen geen tagteken en zagen er dus uit als kindertekst,
      //    terwijl het de bínnenkant van één accolade is — en die is per definitie
      //    code. `zonderWaarden()` kan er niets mee, want de accolade sluit pas
      //    drie regels verderop.
      uit[i] = diep === 0 && na === 0;
      diep = na;
      return;
    }

    if (/^<[A-Z][A-Za-z0-9_.]*(?:\s[^]*)?>$/.test(kaal) && !kaal.endsWith('/>') && !kaal.includes('</')) {
      binnen = true;
      diep = 0;
    }
  });

  return uit;
}

/** Hoeveel accolades en haakjes deze regel openlaat. Negatief als hij er sluit. */
function balans(regel) {
  let n = 0;
  for (const teken of regel) {
    if (teken === '{' || teken === '(') n += 1;
    else if (teken === '}' || teken === ')') n -= 1;
  }
  return n;
}

/**
 * Ziet deze regel eruit als JSX?
 *
 * ⚠️ **Zonder deze grens is de accoladepas onbruikbaar**, en dat is gemeten: hij
 *    meldde 39 regels waarvan de meeste gewone code waren. `crypto.subtle.sign({
 *    name: 'ECDSA', hash: 'SHA-256' }, …)` is een accoladegroep met hoofdletters
 *    erin, en `{ error: 'Onbekend' }` in een datalaag ook. Die teksten zijn geen
 *    schermtekst; ze horen bij een algoritme of bij een logboek.
 *
 *    De grens is smal gehouden: een componenttag op deze regel (`<Body`), of een
 *    regel die zélf met een accolade of een tag begint. Dat dekt de drie vormen
 *    waar het om gaat en laat objectliteralen in gewone code met rust.
 */
function ziterUitAlsJsx(regel, isTsx) {
  // ⚠️ **Alleen in een `.tsx`.** Een regel die met een accolade begint is in een
  //    `.ts` doodgewoon een objectliteraal: `{ name: 'ECDSA', hash: 'SHA-256' }`
  //    in de webpush-crypto, `{ onConflict: 'group_id,user_id' }` in een upsert.
  //    Vijf van die meldingen kwamen bij de eerste meting terug, en het zijn geen
  //    van alle schermtekst. JSX bestaat in dit project uitsluitend in `.tsx`.
  if (!isTsx) return false;

  const kaal = regel.trim();
  return /<[A-Z]/.test(regel) || kaal.startsWith('{') || kaal.startsWith('<');
}

/**
 * De regel met de sleutels van `t(...)` eruit.
 *
 * ⚠️ Een vertaalde regel mag nooit op zijn eigen catalogussleutel afgaan.
 *    `{t('reeks.beste', { aantal })}` bevat een stringliteral, en zonder deze
 *    stap is dat een treffer op precies de regel die goed is.
 */
function zonderSleutels(regel) {
  return regel.replaceAll(/\bt\(\s*['"`][^'"`]*['"`]/g, 't(_');
}

/**
 * Knipt alle `{…}`-waarden uit JSX-tekst, ook geneste.
 *
 * ⚠️ **Eén ronde is niet genoeg, en dat was de zevende ijking.** `{t('sleutel',
 *    { naam })}` heeft een accolade in een accolade: één vervanging haalt de
 *    binnenste weg en laat `{t('sleutel',  )}` staan — drie letters achter
 *    elkaar, dus een treffer. Achttien valse meldingen bij de eerste meting,
 *    allemaal regels die juist wél vertaald zijn.
 *
 *    Dit verving de oude ontsnapping `if (/\bt\(/.test(regel)) return`, die een
 *    hele regel oversloeg zodra er érgens een `t(` op stond. Dat is te grof:
 *    `<Body>{t('kop')} en de rest in het Nederlands</Body>` kwam er zo langs.
 */
function zonderWaarden(tekst) {
  let vorig;
  let nu = tekst;

  do {
    vorig = nu;
    nu = nu.replaceAll(/\{[^{}]*\}/g, ' ');
  } while (nu !== vorig);

  return nu;
}

/** De stukken van een regel die tekst zouden kunnen zijn. */
function kandidaten(regel, inTekstProp = false, isTsx = true, inJsxTekst = false) {
  const uit = [];

  // 1. Een prop met een letterlijke string: title="..." of title={'...'}
  //
  // ⚠️ **Losse woorden tellen hier sinds 24-08-2026 wél mee, mits ze met een
  //    hoofdletter beginnen.** De oude regel ("bij een prop is één woord vaker
  //    een sleutel dan een zin") liet `label="Huddledag"` er precies langs — en
  //    dat is een knoplabel dat vertaald moet worden. De hoofdletter is wat een
  //    zin scheidt van een testid, een stijlwaarde of een enum: `variant="stil"`,
  //    `mode="date"` en `testID="knop"` beginnen klein.
  for (const prop of TEKSTPROPS) {
    const m = new RegExp(`\\b${prop}=(?:\\{)?['"\`]([^'"\`]{4,})['"\`]`).exec(regel);
    if (m?.[1]) {
      uit.push({ tekst: m[1], losseWoordenTellen: /^[A-ZÀ-Ý]/.test(m[1].trim()) });
    }
  }

  // 1c-bis. Een stringliteral bínnen een JSX-accolade.
  //
  // ⚠️ **Dit gat is op 24-08 door de controle van diezelfde dag veroorzaakt.**
  //    `zonderWaarden()` knipt herhaald elke `{…}` weg om achttien valse
  //    meldingen te doden — en knipt daarmee ook de tékst weg die er letterlijk
  //    in staat. Drie doodgewone React-vormen werden onzichtbaar:
  //
  //      <Body>{'Twee woorden hier'}</Body>
  //      {bewaard ? 'Bewaard' : 'Antwoorden bewaren'}
  //      <Subheading>{`${n} mijlpalen voorgesteld`}</Subheading>
  //
  //    Het bewijs stond in dezelfde ronde: de derde vorm is met de hand uit
  //    `app/doel/coach/[id].tsx` gehaald, en de tweede stond er nog steeds —
  //    twee Nederlandse knoplabels, terwijl de controle "nul" meldde.
  //
  //    Een controle die een klasse vormen niet ziet, is erger dan een controle
  //    met ruis: hij geeft toestemming om te stoppen met kijken. Vandaar dat de
  //    literals er hier úit gehaald worden vóórdat `zonderWaarden()` de rest
  //    wegknipt.
  //
  // ⚠️ **Sleutels van `t()` gaan er eerst uit**, anders is elke vertaalde regel
  //    een treffer op zijn eigen sleutel.
  //
  // ⚠️ **Een hoofdletter of een echte zin, anders telt het niet.** Zonder die eis
  //    meldt `style={{ color: 'red' }}` een treffer, en `'center'`, en `'none'`.
  //    Dat is dezelfde grens als bij een prop: een hoofdletter scheidt een zin van
  //    een stijlwaarde.
  for (const groep of ziterUitAlsJsx(regel, isTsx) ? zonderSleutels(regel).matchAll(/\{[^{}]*\}/g) : []) {
    for (const m of groep[0].matchAll(/['"`]([^'"`]{3,})['"`]/g)) {
      const inhoud = m[1]?.replaceAll(/\$\{[^{}]*\}/g, ' ').trim();
      if (!inhoud) continue;
      if (!/^[A-ZÀ-Ý]/.test(inhoud) && !ZIN.test(inhoud)) continue;

      uit.push({ tekst: inhoud, losseWoordenTellen: true });
    }
  }

  // 1c-ter. Een template-literal met tekst erin.
  //
  // ⚠️ Aparte pas, want een template draagt zijn eigen accolades: `${n} mijlpalen`
  //    valt buiten `\{[^{}]*\}` hierboven. De waarden gaan eruit, de tekst blijft.
  //    Dit was de vorm op `app/doel/coach/[id].tsx:410`, met de hand gevonden
  //    omdat de controle hem niet zag.
  for (const m of ziterUitAlsJsx(regel, isTsx) ? zonderSleutels(regel).matchAll(/`([^`]{3,})`/g) : []) {
    const inhoud = m[1]?.replaceAll(/\$\{[^{}]*\}/g, ' ').trim();
    if (!inhoud) continue;
    if (!/^[A-ZÀ-Ý]/.test(inhoud) && !ZIN.test(inhoud)) continue;

    uit.push({ tekst: inhoud, losseWoordenTellen: true });
  }

  // 1d. Een kale string binnen een meerregelige tekstprop. Zie `binnenTekstProp`.
  if (inTekstProp) {
    const m = /^\s*['"`]([^'"`]{4,})['"`]/.exec(regel);
    if (m?.[1]) uit.push({ tekst: m[1], losseWoordenTellen: true });
  }

  // 1b. Dezelfde namen, maar als sleutel in een objectliteraal:
  //     `empty={{ title: '...', body: '...' }}`.
  //
  // ⚠️ **Dit gat kostte vijf zinnen in één bestand.** De propvariant hierboven
  //    zoekt naar `title=`, en in een object staat er `title:`. `AsyncView` neemt
  //    zijn lege staat zo aan, en dat is de plek waar de gebruiker leest dat er
  //    niets is — de laatste plek waar je een onvertaalde zin wilt hebben.
  //
  // ⚠️ **De terugval ervóór mag er sinds 25-08-2026 tussen staan.** In
  //    `app/doel/coach/[id].tsx` stond `melding: job.error ?? 'De Doelcoach liep
  //    vast.'`, en het patroon eiste de string direct achter de dubbele punt. Dat
  //    is uitgerekend de gevaarlijkste vorm van de twee: de zin ís hier de
  //    terugval, dus hij verschijnt precies wanneer er iets misgaat en de
  //    gebruiker het meest op een begrijpelijke tekst zit te wachten.
  for (const prop of TEKSTPROPS) {
    const m = new RegExp(
      `\\b${prop}:\\s*(?:[^'"\`,{}]*\\?\\?\\s*)?['"\`]([^'"\`]{4,})['"\`]`,
    ).exec(regel);
    if (m?.[1]) {
      uit.push({ tekst: m[1], losseWoordenTellen: /^[A-ZÀ-Ý]/.test(m[1].trim()) });
    }
  }

  // 1c. Een kale zin als argument van een setter die op het scherm belandt.
  //
  // ⚠️ `setMelding('Opgeslagen. Lopende kettingschakels blijven staan waar ze
  //    staan.')` was geen prop en geen JSX-tekst, en viel dus door élke
  //    heuristiek heen.
  //
  // ⚠️ **Hier stond tot 25-08-2026 een lijst van drie namen** — `setMelding`,
  //    `setFout`, `setStatus` — met de onderbouwing dat hij kort hoorde te
  //    blijven. Dat was precies de fout die dit script bij ánderen opspoort: hij
  //    bewaakte een lijst namen in plaats van een vorm. `app/aanmelden.tsx`
  //    gebruikt `setGelukt(...)`, en die zin — op de laatste stap van de enige
  //    werkende aanmeldroute — stond maandenlang onvertaald in de app terwijl
  //    deze controle nul meldde. Nu is de vorm de maat: élke `setX(` met een
  //    hoofdletter erachter. Een naam erbij verzinnen kan niet meer.
  //
  // ⚠️ Dat dit weinig valse meldingen geeft, komt niet door deze regex maar door
  //    `ZIN`: een setter met een sleutel of een statuswoord (`setFase('mislukt')`)
  //    heeft geen twee woorden achter elkaar en valt af.
  //
  // ⚠️ De drie oorspronkelijke namen blijven staan mét hun strengere gedrag:
  //    die dragen in dit project uitsluitend schermtekst, dus daar telt élke
  //    waarde — ook een los woord zonder hoofdletter. De generieke variant
  //    eronder is de vangnet, geen vervanging.
  for (const zetter of ['setMelding', 'setFout', 'setStatus']) {
    const m = new RegExp(`\\b${zetter}\\(\\s*['"\`]([^'"\`]{4,})['"\`]`).exec(regel);
    if (m?.[1]) uit.push({ tekst: m[1], losseWoordenTellen: true });
  }

  {
    const m = /\bset[A-Z]\w*\(\s*['"\`]([^'"\`]{4,})['"\`]/.exec(regel);
    // ⚠️ Zelfde twee eisen. Een wíllekeurige setter draagt net zo goed een
    //    toestand — `setFase('rust')`, `setStand('pending')` — en zonder hen
    //    meldde deze variant er drieëntwintig, allemaal onzin.
    if (m?.[1] && /^[A-ZÀ-Ý]/.test(m[1].trim())) {
      uit.push({ tekst: m[1], losseWoordenTellen: false });
    }
  }

  // 1d. Een zin die een functie teruggéeft.
  //
  // ⚠️ `src/modules/ai/jobs.ts` vertaalde elke foutcode netjes met `t(...)` op
  //    één na, en die ene stond als `return \`Je hebt vandaag al ...\`;`. Een
  //    `return` is geen prop, geen JSX en geen setter, dus geen enkele
  //    heuristiek keek ernaar — terwijl een functie die een zin teruggeeft per
  //    definitie schermtekst levert. Gevonden op 25-08-2026, vijf regels naast
  //    een `t()`-aanroep.
  {
    const m = /\breturn\s+['"\`]([^'"\`]{4,})['"\`]/.exec(regel);
    // ⚠️ Hoofdletter én een echte zin, en zonder die twee eisen meldde deze
    //    variant elke `return 'note_required'`, `return 'android'` en elke
    //    redencode uit `regels.ts` — zesentwintig stuks. Een teruggegeven
    //    redencode is in dit project kleingeschreven en een zin voor de
    //    gebruiker begint met een hoofdletter; dat is het enige onderscheid dat
    //    een regex hier kán maken, en het is genoeg.
    if (m?.[1] && /^[A-ZÀ-Ý]/.test(m[1].trim())) {
      uit.push({ tekst: m[1], losseWoordenTellen: false });
    }
  }

  // 3. JSX-tekst tussen twee tags op dezelfde regel: `<Subheading>Kop</Subheading>`.
  //
  // ⚠️ **Dit is de vierde ijking, en hij kwam pas bovendrijven toen de controle
  //    groen stond.** De variant hieronder eist dat de regel met een hoofdletter
  //    begint, en dus zag hij niets van een zin die achter een openingstag staat.
  //    In `app/doel/[id].tsx` waren dat er tientallen — "Je verzoek loopt",
  //    "Deadline", "Nieuwe streefdatum" — allemaal onzichtbaar voor de meting.
  //
  //    Een controle die nul meldt terwijl er tekst staat, is erger dan geen
  //    controle: hij geeft toestemming om te stoppen met kijken. Vandaar de
  //    regel dat je een nieuw meetinstrument één keer naast een handmatige
  //    telling legt — en dat opnieuw doet zodra hij groen wordt.
  //
  // ⚠️ De sluittag (`</`) staat niet voor niets in het patroon. Zonder die eis
  //    meldde deze variant bij de eerste meting negen coderegels: `Promise<T>`
  //    gevolgd door een `<`, een vergelijking `maand > 12 || dag < 1`, en de pijl
  //    van elke `(x) => f(x) <= n`. Alleen tekst die eindigt op een sluittag is
  //    tekst tussen twee JSX-tags.
  //
  // ⚠️ **Accolades mogen er sinds 24-08-2026 in staan, en dat was de vijfde
  //    ijking.** `<Caption>Voorlezen kan ook: {toonCode(g.invite_code)}</Caption>`
  //    viel buiten het patroon omdat er een `{` in stond — terwijl juist dít de
  //    vorm is die je vergeet, want hij ziet eruit als code. De waarden worden
  //    eruit geknipt vóór de meting, zodat `{a} {b}` niets oplevert en
  //    "Voorlezen kan ook:" wel.
  for (const m of regel.matchAll(/>([^<>=]{3,})<\//g)) {
    //
    // ⚠️ **Entiteiten gaan er eerst uit, en dat is de zesde ijking.** Sinds de
    //    accolades erin mogen, houdt `<Body>&ldquo;{titel}&rdquo;</Body>` na het
    //    knippen `&ldquo;  &rdquo;` over — drie letters achter elkaar, dus een
    //    treffer. Zes valse meldingen bij de eerste meting, allemaal
    //    aanhalingstekens om een waarde. De oude toets keek of de héle inhoud
    //    één entiteit was, en dat is te weinig zodra er meer dan één in staat.
    const inhoud = zonderWaarden(m[1] ?? '')
      .replaceAll(/&\w+;/g, ' ')
      .trim();
    // Drie letters achter elkaar, anders is het opmaak of een streepje.
    if (inhoud && /[A-Za-zÀ-ÿ]{3,}/.test(inhoud)) {
      uit.push({ tekst: inhoud, losseWoordenTellen: true });
    }
  }

  // 2. Kale JSX-tekst op een eigen regel: een regel die met een hoofdletter
  //    begint en niet met een haakje, accolade of punt-komma eindigt.
  //
  // ⚠️ **Hier geldt de tweewoordeneis niet, en dat is een correctie op de eerste
  //    versie.** Die miste "Terug", "Goedkeuren" en "Versturen" — losse woorden
  //    op een knop, en juist die moeten vertaald worden. Bij een prop is één
  //    woord vaker een sleutel of een stijlwaarde dan een zin, dus daar blijft de
  //    eis staan; kale tekst tussen JSX-tags is per definitie voor de lezer.
  //
  //    Gevonden door de controle één keer naast een handmatige telling te
  //    leggen. Een nieuw meetinstrument dat je niet ijkt, meet wat het toevallig
  //    ziet.
  const kaal = regel.trim();
  //    ⚠️ Geen haakjes: `AccessibilityInfo.isReduceMotionEnabled()` begint óók
  //    met een hoofdletter en staat óók alleen op een regel. Drie van die
  //    coderegels waren de eerste valse meldingen van deze variant. JSX-tekst mét
  //    een haakje bestaat, maar die wordt door de propregel hierboven gedekt.
  if (
    // ⚠️ Accolades mogen erin, en dat is de derde correctie op deze heuristiek.
    //    JSX-tekst met een waarde erin — "Je kunt dit nog {MINUTEN} minuten
    //    terugdraaien" — is doodgewone zinstekst, en juist het soort dat je
    //    vergeet omdat het eruitziet als code. De eis van drie letters achter
    //    elkaar hieronder houdt `{foo} {bar}` er weer buiten.
    /^[A-ZÀ-Ý][^<>=()]*$/.test(kaal) &&
    !kaal.endsWith(';') &&
    !kaal.endsWith(',') &&
    !kaal.endsWith('.tsx')
  ) {
    return [...uit, { tekst: kaal, losseWoordenTellen: true }];
  }

  // 2b. Dezelfde kale tekst, maar bínnen de kinderen van een tag. Zie
  //     `binnenJsxTekst`.
  //
  // ⚠️ **Hier vervallen de hoofdletter én de komma-eis, en dat mág hier omdat de
  //    toestand het al bewezen heeft.** Buiten een tag zijn die twee eisen het
  //    enige dat een zin van een importregel scheidt; erbinnen is élke regel
  //    zonder tagteken kindertekst. Precies dat verschil maakte een zin die over
  //    twee regels liep onzichtbaar: de eerste helft eindigt op een komma, de
  //    tweede begint klein.
  //
  // ⚠️ De waarden gaan er eerst uit, net als bij de tak hierboven, zodat een
  //    regel met alleen `{aantal}` erop niets oplevert.
  if (inJsxTekst) {
    const inhoud = zonderWaarden(kaal)
      .replaceAll(/&\w+;/g, ' ')
      .trim();
    if (inhoud && !inhoud.endsWith(';') && /[A-Za-zÀ-ÿ]{3,}/.test(inhoud)) {
      return [...uit, { tekst: inhoud, losseWoordenTellen: true }];
    }
  }

  return uit;
}

/**
 * De treffers in één bestand, als `{ regelnummer, tekst }`.
 *
 * ⚠️ **Geëxporteerd, en dat is de reparatie van 24-08-2026.** Deze controle stond
 *    maandenlang groen terwijl er in één scherm vijf onvertaalde zinnen zaten. De
 *    reden was niet dat de heuristieken slecht waren maar dat ze nóóit tegen een
 *    bekend geval gelegd zijn: er was geen manier om te zien wat hij *wél* vindt
 *    zonder de hele codebase te wijzigen. `tests/scripts/tekst-controle.test.ts`
 *    voedt hem nu elk van de zeven vormen los, plus de vier die hij met rust moet
 *    laten. Een controle die je nooit rood ziet worden is een aanname
 *    (CLAUDE.md, regel 18).
 *
 * @param {string[]} regels de regels van één bestand
 * @param {boolean} [isTsx] staat er JSX in dit bestand? Alleen `.tsx` telt.
 * @returns {{ regel: number, tekst: string }[]}
 */
export function treffersIn(regels, isTsx = true) {
  const commentaar = commentaarregels(regels);
  const inProp = binnenTekstProp(regels);
  const inJsx = binnenJsxTekst(regels, isTsx);
  const uit = [];

  regels.forEach((regel, i) => {
    if (commentaar[i]) return;

    for (const { tekst, losseWoordenTellen } of kandidaten(regel, inProp[i], isTsx, inJsx[i])) {
      if (MERKNAMEN.has(tekst)) continue;
      if (isGeenTaal(tekst)) continue;
      if (!losseWoordenTellen && !ZIN.test(tekst)) continue;
      if (losseWoordenTellen && !/[A-Za-zÀ-ÿ]{3,}/.test(tekst)) continue;
      uit.push({ regel: i + 1, tekst });
      return;
    }
  });

  return uit;
}

/**
 * De controle zelf.
 *
 * ⚠️ **Achter een `main()` en een aanroepwacht, en dat is geen netheid.** Dit
 *    bestand exporteert sinds 24-08-2026 `treffersIn()` zodat er tests op kunnen
 *    staan. Zonder deze scheiding draait bij élke import de hele scan én de
 *    `process.exit()` eronder — en dan valt de testsuite om op een geslaagde
 *    controle.
 */
function main() {
  const treffers = [];

  for (const map of MAPPEN) {
    for (const pad of bestanden(map)) {
      if (OVERSLAAN.some((r) => r.test(metSchuineStrepen(pad)))) continue;

      const regels = readFileSync(pad, 'utf8').split('\n');

      for (const { regel, tekst } of treffersIn(regels, pad.endsWith('.tsx'))) {
        treffers.push(`${pad.replace(WORTEL, '')}:${regel}  ${tekst.slice(0, 70)}`);
      }
    }
  }

  if (treffers.length === 0) {
    console.log('tekst-controle: geen hardgecodeerde UI-tekst meer in src/ en app/.');
    process.exit(0);
  }

  /** Per map, want QS8-115 wordt map voor map afgewerkt. */
  const perMap = new Map();
  for (const t of treffers) {
    const map = t.slice(0, t.lastIndexOf('/'));
    perMap.set(map, [...(perMap.get(map) ?? []), t]);
  }

  console.error(`tekst-controle: ${treffers.length} regels hardgecodeerde UI-tekst.\n`);
  for (const [map, regels] of [...perMap].sort((a, b) => b[1].length - a[1].length)) {
    console.error(`  ${map}  (${regels.length})`);
    if (process.argv.includes('--alles')) for (const r of regels) console.error(`      ${r}`);
  }
  console.error('\nZie QS8-115. Draai met --alles voor de regels zelf.');
  process.exit(1);
}

// Alleen draaien als dit bestand zelf is aangeroepen, niet bij een import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
