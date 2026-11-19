/**
 * De knip die commentaar uit JS- en TS-bron haalt — QS8-446.
 *
 * ⚠️⚠️ **Dit is een grendel en geen hulpfunctie, en CLAUDE.md zegt dat met
 *    zoveel woorden.** Elke bronzeef in dit project leunt erop: hij bepaalt wat
 *    er *code* heet en wat *uitleg*. Knipt hij te veel weg, dan blijft de zeef
 *    groen terwijl de belofte breekt — en dat is precies wat een zeef nooit mag.
 *
 * 📏 **Het gemeten geval (QS8-412).** De vorm `bron.replace(/\/\/[^\n]*\/g, '')`
 *    eet alles op ná de `//` van een URL:
 *
 *      bron   : const x = 'https://opslag/x'; Linking.openURL(x);
 *      blind  : const x = 'https:
 *
 *    Dezelfde knip stond toen in twee testbestanden en was in allebei blind.
 *    Bij het ijken werd de suite rood op een ándere toets dan de grendel die de
 *    mutatie noemde, en de bedoelde grendel bleef groen.
 *
 * ⚠️ **De regelvorm hieronder is juist de vorm die dát overleeft**: hij kijkt of
 *    de **regel** met `//` begint en knipt niet midden in een regel. Een URL
 *    staat nooit aan het begin van zijn regel, een regelcommentaar wel.
 *
 * ⚠️ **Waarom blokken eerst en per regex.** `/* … *\/` dekt zowel JSDoc als de
 *    JSX-vorm `{/* … *\/}`. Bij die tweede blijven `{` en `}` staan; dat is voor
 *    een zeef onschadelijk — wat telt is dat de tékst eruit is.
 *
 * ⚠️⚠️ **Hij vervangt een blok door één spatie en niet door evenveel
 *    regeleindes.** Wie regelnúmmers meldt, heeft de tweede vorm nodig, want
 *    anders wijst zijn melding naar de verkeerde regel — `gedeelde-identiteit-
 *    controle.mjs` doet dat en houdt daarom met reden zijn eigen knip. Zie het
 *    register in `scripts/knip-controle.mjs`.
 *
 * ⚠️ **`.mjs` en niet `.ts`, zodat beide bomen hem kunnen importeren.**
 *    `scripts/` is plain JS en kan geen `.ts` uit `tests/` halen; andersom kan
 *    wel. Dat is dezelfde vorm als het psql-register (QS8-414): twee bomen
 *    mogen elk hun eigen standaard hebben, zolang ze er elk maar één hebben —
 *    hier is het er zelfs één voor allebei.
 *
 * ⚠️⚠️ **Sinds QS8-709 leest hij strings, templates en regexen mee.** De oude
 *    regex had geen anker: een `/**` in `${app}/**` of `'goalbuddies://**'` telde
 *    als begin van een blok, en alles tot de volgende `*\/` verdween — ook een
 *    `process.exit`. 📏 Gemeten over 892 bronbestanden: **60** waarin de oude knip
 *    code opat, 0 in `src/` en `app/`, de rest in `scripts/` en `tests/`. De
 *    regelvorm (alleen een regel die ermee *begint*) en de blokvorm (één spatie)
 *    zijn ongewijzigd, dus wie op die uitvoer leunt ziet hetzelfde. Een regex wordt
 *    herkend aan het teken ervoor; dat is een heuristiek en geen parser, en de
 *    toets hieronder legt vast welke vormen hij haalt. Uitleg in
 *    `docs/decisions/2026-11-18-de-knip-leest-strings-mee.md`.
 *
 * ⚠️ Geïjkt in `tests/scripts/zonder-commentaar.test.ts`, met de URL-vorm erin.
 *    **Een knip zonder die toets is een aanname.**
 */
export function zonderCommentaar(bron) {
  // `diepte` telt per openstaande template-expressie `${ … }` de accolades, zodat
  // de `}` die de expressie sluit niet voor een gewone accolade doorgaat.
  const st = { i: 0, uit: '', diepte: [], regelBegin: true };

  while (st.i < bron.length) {
    if (!commentaarStap(bron, st) && !literalStap(bron, st) && !accoladeStap(bron, st)) {
      const c = bron[st.i];
      st.uit += c;
      st.i += 1;
      if (c.trim() !== '') st.regelBegin = false;
    }
  }

  return st.uit;
}

/** Commentaar en regeleinden. Waar als er iets verwerkt is. */
function commentaarStap(bron, st) {
  const c = bron[st.i];
  const volgende = bron[st.i + 1];

  if (c === '\n') {
    st.uit += c;
    st.i += 1;
    st.regelBegin = true;
    return true;
  }
  if (c === '/' && volgende === '*') {
    const einde = bron.indexOf('*/', st.i + 2);
    st.uit += ' ';
    st.i = einde === -1 ? bron.length : einde + 2;
    return true;
  }
  if (c === '/' && volgende === '/' && st.regelBegin) {
    // Een regelcommentaar begint hier de regel — niet midden in een regel, want
    // dat is een URL (QS8-412). De regel gaat eruit, newline inbegrepen.
    const einde = bron.indexOf('\n', st.i);
    st.uit = st.uit.slice(0, st.uit.lastIndexOf('\n') + 1);
    st.i = einde === -1 ? bron.length : einde + 1;
    return true;
  }
  return false;
}

/** Strings, templates en regexen: alles daarbinnen is code of tekst, nooit commentaar. */
function literalStap(bron, st) {
  const c = bron[st.i];
  let einde = -1;

  if (c === "'" || c === '"') einde = eindeString(bron, st.i, c);
  else if (c === '/' && begintRegex(st.uit)) einde = eindeRegex(bron, st.i);
  else if (c === '`') einde = sjabloonTekst(bron, st, st.i + 1);
  else return false;

  st.uit += bron.slice(st.i, einde);
  st.i = einde;
  st.regelBegin = false;
  return true;
}

/** De accolades binnen een template-expressie; de sluitende `}` zet de tekst voort. */
function accoladeStap(bron, st) {
  if (st.diepte.length === 0) return false;
  const c = bron[st.i];
  const laatste = st.diepte.length - 1;

  if (c === '{') st.diepte[laatste] += 1;
  else if (c === '}' && st.diepte[laatste] > 0) st.diepte[laatste] -= 1;
  else if (c === '}') {
    st.diepte.pop();
    const einde = sjabloonTekst(bron, st, st.i + 1);
    st.uit += bron.slice(st.i, einde);
    st.i = einde;
    return true;
  }
  return false;
}

/** Leest templatetekst tot de sluitende backtick of een `${`; die laatste zet een expressie open. */
function sjabloonTekst(bron, st, van) {
  const einde = eindeSjabloonTekst(bron, van);
  if (einde.opent) st.diepte.push(0);
  return einde.positie;
}

/** Het eerste teken ná de sluitende aanhaling; een string eindigt ook aan het eind van zijn regel. */
function eindeString(bron, begin, aanhaling) {
  let i = begin + 1;
  while (i < bron.length && bron[i] !== '\n') {
    if (bron[i] === '\\') i += 2;
    else if (bron[i] === aanhaling) return i + 1;
    else i += 1;
  }
  return Math.min(i, bron.length);
}

/**
 * Leest templatetekst vanaf `van` tot de sluitende backtick of tot een `${`.
 * `opent` is waar als hij op `${` stopt: dan staat er code tot de bijpassende `}`.
 */
function eindeSjabloonTekst(bron, van) {
  let i = van;
  while (i < bron.length) {
    if (bron[i] === '\\') i += 2;
    else if (bron[i] === '`') return { positie: i + 1, opent: false };
    else if (bron[i] === '$' && bron[i + 1] === '{') return { positie: i + 2, opent: true };
    else i += 1;
  }
  return { positie: bron.length, opent: false };
}

/**
 * Staat hier een regex en geen deling? Dat hangt af van wat er voor de `/` komt.
 * ⚠️ Een regex met een aanhaling of backtick erin zou anders een string openen.
 */
function begintRegex(uitTotNu) {
  const voor = uitTotNu.trimEnd();
  if (voor === '') return true;
  const laatste = voor[voor.length - 1];
  if ('(,=:[!&|?{};+-*%<>~^'.includes(laatste)) return true;
  return /(?:^|[^\w$.])(?:return|typeof|case|in|of|delete|void|throw|new)$/.test(voor);
}

function eindeRegex(bron, begin) {
  let i = begin + 1;
  let klasse = false;
  while (i < bron.length && bron[i] !== '\n') {
    if (bron[i] === '\\') i += 2;
    else if (bron[i] === '[') { klasse = true; i += 1; }
    else if (bron[i] === ']') { klasse = false; i += 1; }
    else if (bron[i] === '/' && !klasse) return i + 1;
    else i += 1;
  }
  return Math.min(i, bron.length);
}
