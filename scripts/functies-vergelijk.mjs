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
