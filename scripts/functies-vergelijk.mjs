/**
 * Bouwen de migraties nog wat er draait? — de vergelijking, los van het ophalen.
 *
 * ⚠️ **Eigen bestand omdat een controle die je niet kunt voeden, niet te ijken
 *    is.** Dezelfde reden als bij `migratieregister-vergelijk.mjs` en
 *    `migratieregister-omgeving.mjs`: het script eromheen praat met twee
 *    databases, en dan is er geen manier om te zien wat de vergelijking wél
 *    vindt zonder er twee op te tuigen.
 *
 * ⚠️ **Twee soorten verschil, en ze wegen niet hetzelfde.**
 *
 *      `kaal` verschilt → de lógica loopt uiteen. Dat is een fout: de bestanden
 *              bouwen niet meer wat er draait, en een lokale stack of een tweede
 *              project toetst dan een ander schema dan productie.
 *      alleen `ruw` verschilt → commentaar of opmaak. Geen fout, wél iets dat je
 *              wilt weten: `CLAUDE.md` zegt dat `pg_get_functiondef()` de
 *              waarheid is, en wie die leest zonder het commentaar mist de
 *              redenering die zegt waaróm er iets staat.
 *
 * ⚠️ **De steigerfuncties worden hier gefilterd en niet in de database.** De
 *    lokale stack heeft `shim_maak_gebruiker()` en `shim_verwijder_gebruiker()`
 *    omdat er geen GoTrue is; productie heeft ze niet, en zonder filter meldt de
 *    controle die twee elke run als "alleen lokaal". Het hoorde eerst in de RPC,
 *    maar `tests/scripts/steiger.test.ts` eist dat géén migratiebestand die naam
 *    noemt — die test bewaakt dat er nooit een deur naar `auth.users` op het echte
 *    project komt, en hij kan een onschuldig filter niet van een gekopieerd blok
 *    onderscheiden. Dat hóórt hij ook niet te kunnen.
 *
 * @typedef {{naam: string, kaal: string, ruw: string}} Vingerafdruk
 */

/** De GoTrue-vervangers uit `lokale-stack.sh`; zie de kop. */
const STEIGER = /^shim_/;

/**
 * @param {readonly Vingerafdruk[]} productie
 * @param {readonly Vingerafdruk[]} lokaal
 * @returns {{logica: string[], commentaar: string[], alleenProductie: string[], alleenLokaal: string[]}}
 */
export function vergelijkFuncties(productie, lokaal) {
  const p = new Map(productie.filter((f) => !STEIGER.test(f.naam)).map((f) => [f.naam, f]));
  const l = new Map(lokaal.filter((f) => !STEIGER.test(f.naam)).map((f) => [f.naam, f]));

  const logica = [];
  const commentaar = [];

  for (const [naam, prod] of p) {
    const lok = l.get(naam);
    if (lok === undefined) continue;
    if (prod.kaal !== lok.kaal) logica.push(naam);
    else if (prod.ruw !== lok.ruw) commentaar.push(naam);
  }

  return {
    logica: logica.sort(),
    commentaar: commentaar.sort(),
    // ⚠️ Beide kanten apart. "Staat alleen op productie" is een functie die uit
    //    de migraties verdwenen is maar nooit gedropt; "staat alleen lokaal" is
    //    een migratie die nooit is toegepast. Dat zijn twee verschillende
    //    problemen en ze horen niet op één hoop.
    alleenProductie: [...p.keys()].filter((n) => !l.has(n)).sort(),
    alleenLokaal: [...l.keys()].filter((n) => !p.has(n)).sort(),
  };
}

/**
 * Is dit een fout, of alleen iets om te weten?
 *
 * ⚠️ Alleen een logicaverschil en een functie die aan één kant ontbreekt zijn
 *    fout. Commentaarverschil is een melding: het is echt, het hoort opgeruimd,
 *    en het mag geen deploy tegenhouden.
 *
 * @param {ReturnType<typeof vergelijkFuncties>} uitslag
 */
export function isFout(uitslag) {
  return (
    uitslag.logica.length > 0 ||
    uitslag.alleenProductie.length > 0 ||
    uitslag.alleenLokaal.length > 0
  );
}

/**
 * De regels die de controle afdrukt, in volgorde — QS8-220.
 *
 * ⚠️⚠️ **Waarom dit een functie is en geen `console.error` in het script.** De
 *    commentaarmelding stond dáár ná `process.exit(1)`, en dus was hij
 *    onbereikbaar zodra er óók een logicaverschil was. 📏 Gemeten op 08-09-2026:
 *    productie staat op migratie 0186 en de map op 0213, dus 75 functies
 *    verschillen van logica en 48 staan alleen lokaal — allebei een fout. De 21
 *    functies die hun commentaar kwijt zijn werden daardoor **nooit afgedrukt**,
 *    terwijl `vergelijkFuncties()` ze al die tijd wél teruggaf.
 *
 *    Dat is precies de klasse van dit issue: de informatie is er, en niemand
 *    krijgt hem te zien. En het is niet te ijken zolang het printen in een script
 *    zit dat twee databases nodig heeft — vandaar hier.
 *
 * ⚠️ **De commentaarregels komen vóór de fouten en niet erna.** Een lezer die
 *    afkapt bij de eerste fout, heeft ze anders alsnog gemist.
 */
export function bouwRapport(uitslag) {
  const regels = [];

  if (uitslag.commentaar.length > 0) {
    regels.push({
      soort: 'melding',
      tekst:
        `⚠ ${uitslag.commentaar.length} functie(s) draaien met dezelfde logica maar ` +
        'zonder hun commentaar:',
      namen: uitslag.commentaar,
      uitleg:
        'Geen fout — de logica klopt. Wel de moeite: CLAUDE.md zegt dat\n' +
        '`pg_get_functiondef()` de waarheid is, en wie die leest zonder het commentaar\n' +
        'mist de redenering die zegt waaróm er iets staat. Pas de functie opnieuw toe\n' +
        'met de volledige body uit het migratiebestand.',
    });
  }

  if (uitslag.logica.length > 0) {
    regels.push({
      soort: 'fout',
      tekst: `✗ ${uitslag.logica.length} functie(s) hebben op productie een ándere logica:`,
      namen: uitslag.logica,
      uitleg:
        'De migratiebestanden bouwen dus niet meer wat er draait. Een lokale stack of\n' +
        'een tweede project toetst daarmee een ánder schema dan productie — groen\n' +
        'zonder iets te bewijzen. Zie stap 20 van /audit.',
    });
  }

  for (const [lijst, zin] of [
    [
      uitslag.alleenProductie,
      'staan alleen op productie (uit de migraties verdwenen, nooit gedropt)',
    ],
    [uitslag.alleenLokaal, 'staan alleen lokaal (een migratie die nooit is toegepast)'],
  ]) {
    if (lijst.length > 0) {
      regels.push({ soort: 'fout', tekst: `✗ ${lijst.length} functie(s) ${zin}:`, namen: lijst });
    }
  }

  return regels;
}
