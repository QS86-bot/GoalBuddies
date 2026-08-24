/**
 * Welke registerrijen moeten uitgelijnd worden, en welke kúnnen dat niet — QS8-122.
 *
 * ⚠️ **Waarom dit los staat van het script dat het uitvoert.** Zelfde reden als
 *    bij `migratieregister-vergelijk.mjs`: het uitlijnen praat met het échte
 *    project, dus zonder credentials draait het nooit — en een stap die je nooit
 *    rood ziet worden is een aanname. Hier staat de beslissing los van de
 *    verbinding, en `migratieregister-plan.test.ts` breekt élk geval met de hand.
 *
 * ⚠️ **Uitlijnen gebeurt op naam en niet op volgorde.** Als het nummer al
 *    uiteenloopt, is de naam het enige dat het bestand en de registerrij nog
 *    delen. Sorteren op tijdstempel en dan "de volgende vrije nummers uitdelen"
 *    lijkt makkelijker en is fout: dan koppelt één verkeerd toegepaste migratie
 *    alle volgende aan het verkeerde bestand, en dat is niet te zien.
 */

/**
 * @typedef {{ versie: string, naam: string, bestand?: string }} Migratie
 * @typedef {{ naam: string, versie: string }} Paar
 * @typedef {{ paren: Paar[], waarschuwingen: string[] }} Plan
 */

/** Eén nummering: vier cijfers, eventueel met een letter erachter (`0052a`). */
const GENUMMERD = /^\d{4}[a-z]?$/;

/**
 * Wat er uitgelijnd moet worden tussen repo en project.
 *
 * @param {readonly Migratie[]} repo
 * @param {readonly Migratie[]} project
 * @returns {Plan}
 */
export function plan(repo, project) {
  /** @type {Paar[]} */
  const paren = [];
  /** @type {string[]} */
  const waarschuwingen = [];

  const bezetteVersies = new Set(project.map((m) => m.versie));

  for (const rij of project) {
    // Rijen die al een nummer dragen zijn klaar. Ze worden hier nooit
    // aangeraakt — zie grendel 1 in migratie 0081.
    if (GENUMMERD.test(rij.versie)) continue;

    const kandidaten = repo.filter((m) => m.naam === rij.naam);

    // ⚠️ Het gevaarlijkste geval, en niet met uitlijnen op te lossen: er is
    //    iets toegepast waar geen bestand van bestaat. Dat is precies wat 0057
    //    t/m 0061 waren. Uitlijnen zou hier een nummer verzinnen en het gat
    //    onzichtbaar maken — dus dat gebeurt niet.
    if (kandidaten.length === 0) {
      waarschuwingen.push(
        `${rij.versie} (${rij.naam}) is toegepast maar heeft geen bestand in de repo — ` +
          'uitlijnen lost dit niet op; het bestand moet terug',
      );
      continue;
    }

    // ⚠️ Twee bestanden met dezelfde naam onder een ander nummer. Raden welke
    //    bedoeld is, is de ene helft van de tijd fout.
    if (kandidaten.length > 1) {
      const nummers = kandidaten.map((m) => m.versie).join(', ');
      waarschuwingen.push(
        `${rij.versie} (${rij.naam}) past op meer dan één bestand (${nummers}) — ` +
          'los dit met de hand op',
      );
      continue;
    }

    const doel = kandidaten[0].versie;

    // ⚠️ Het doelnummer is al bezet. Migratie 0081 weigert dit ook, maar hier
    //    weten we welke twee rijen botsen en dat is bruikbaarder dan een
    //    weigering achteraf.
    if (bezetteVersies.has(doel)) {
      waarschuwingen.push(
        `${rij.versie} (${rij.naam}) hoort op ${doel}, maar dat nummer is al in gebruik ` +
          'door een andere registerrij',
      );
      continue;
    }

    paren.push({ naam: rij.naam, versie: doel });

    // Vanaf nu bezet, zodat twee tijdstempels niet naar hetzelfde nummer wijzen.
    bezetteVersies.add(doel);
  }

  return { paren, waarschuwingen };
}
