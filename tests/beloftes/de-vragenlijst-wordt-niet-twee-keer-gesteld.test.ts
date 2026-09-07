import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  LEEG_INTERVIEW,
  PROFIELCONTEXT,
  PROFIELSPIEGELING,
  vulVoorInterview,
  vulVoorUitProfiel,
  type InterviewInvoer,
} from '../../src/modules/goals/interview-schemas';
import { urenPerWeekUitMinuten } from '../../src/modules/goals/vragenlijst-schemas';

import { roeptAan } from './roept-aan';

/**
 * De onboarding vraagt iets één keer — QS8-301, groep 1.
 *
 * ⚠️ **De naad, en het is er een tussen twee vullingen die allebei kloppen.**
 *    `vulVoorUitDoel()` vult wat er op `goals` staat, `vulVoorUitProfiel()` vult
 *    wat de vragenlijst weet, en allebei laten ze een bestaand antwoord met
 *    rust. Het geheel lekt op de plek waar ze aan elkaar knopen: de tweede
 *    draait op de uitkomst van de eerste, en alléén daarom kan het scherm per
 *    veld zeggen waar de tekst vandaan komt. Draaien ze los van elkaar, dan
 *    melden ze allebei hetzelfde veld en liegt die zin over de bron.
 *
 * ⚠️ **De tweede belofte is dat `stuck_before` níét voorgevuld wordt.** Aan de
 *    ene kant staan aangevinkte valkuilen, aan de andere vrije tekst; die
 *    omzetten betekent dat de app een zin schrijft en hem opslaat alsof de
 *    gebruiker hem getypt heeft. Dat is de reden dat `PROFIELCONTEXT` een
 *    tweede tabel is naast `PROFIELSPIEGELING` en geen `if` in dezelfde lus.
 *
 * ⚠️ **Waarom een bronscan voor het schermdeel.** Er is in dit project geen
 *    React-testbibliotheek. Wat je zonder renderer wél kunt vastleggen is dat
 *    het scherm de twee bronnen uit elkaar houdt in plaats van ze op één hoop
 *    te gooien — de vorm die de zin onder het veld onwaar maakt.
 *
 *    Met de hand rood gemaakt, mutatie voor mutatie:
 *    1. het profiel vóór het doel laten vullen           → grendel 1 rood.
 *    2. de urenvulling uit `vulVoorUitProfiel()`         → grendel 2 rood.
 *    3. `uit.stuck_before = valkuilen.join(', ')`        → grendel 3 rood.
 *    4. `stuck_before` óók in `PROFIELSPIEGELING`        → grendel 4 rood.
 *    5. `vulVoorInterview()` uit het effect gehaald      → grendel 5 rood,
 *       plus `bereikbaar.test.ts` en `exports:controle` (die drie meldt:
 *       ook `vulVoorUitDoel` en `vulVoorUitProfiel` hangen er dan los bij).
 *    6. `bron(…, 'vragenlijst')` op `'doel'` gezet       → grendel 2 rood.
 *    7. `t('coach.uit_vragenlijst')` terug op
 *       `t('coach.al_ingevuld')`                         → grendel 6 rood,
 *       plus `catalogus:controle` op de losgeraakte sleutel.
 *    8. `if (!profielLaadt)` uit het effect gehaald       → grendel 7 rood.
 *    9. de valkuilregel uit `toelichtingBij()`           → géén test rood;
 *       alléén `catalogus:controle`, op `coach.eerder_genoemd`. Dat staat
 *       hier omdat het de grens van deze suite is en geen tekortkoming die
 *       je wegpoetst: zonder renderer is "de zin staat onder het veld" niet
 *       te toetsen, en de catalogus is wat er dan overblijft.
 *
 *    ⚠️ **Mutatie 5 vond een fout in deze test zelf, en dat is de reden dat
 *       ijken niet optioneel is.** Grendel 5 was eerst een eigen regex
 *       (`/vulVoorInterview\s*\(/`) en bleef groen: de kop van het effect
 *       noemt de functie mét haakjes, dus de toelichting op de aanroep telde
 *       als de aanroep. Hij gebruikt nu `roeptAan()`, die blokcommentaar
 *       eerst wegstreept.
 */
const COACHSCHERM = fileURLToPath(
  new URL('../../app/doel/coach/[id].tsx', import.meta.url),
);

const uren = urenPerWeekUitMinuten;

/** Een doel met beide gespiegelde velden gevuld. */
const DOEL = { identity_statement: 'iemand die schrijft', available_hours_per_week: 6.5 };

/** Een profiel met beide vragenlijstantwoorden gevuld. */
const PROFIEL = { minutes_per_day: 30, what_breaks_it: ['forget', 'life_chaotic'] };

describe('de vragenlijst wordt niet twee keer blanco gesteld', () => {
  /**
   * ⚠️ **Grendel 1 — de naad zelf.** Het doel is de specifiekere bron, dus het
   *    vult eerst; het profiel draait op die uitkomst en moet dan zwijgen over
   *    hetzelfde veld. Zou de volgorde omdraaien, of zou de tweede op de kále
   *    antwoorden draaien, dan staat `hours_per_week` in béide lijsten en zegt
   *    het scherm de verkeerde herkomst.
   */
  it('een veld dat uit het doel komt, wordt als doel gemeld en niet als vragenlijst', () => {
    const vulling = vulVoorInterview(LEEG_INTERVIEW, DOEL, PROFIEL, uren);

    expect(vulling.antwoorden.hours_per_week).toBe(6.5);
    expect(vulling.voorgevuld.hours_per_week).toBe('doel');
    expect(vulling.voorgevuld.identity).toBe('doel');
  });

  /** ⚠️ Grendel 2 — en zonder deze bewaakt grendel 1 een vulling die niets doet. */
  it('vult de uren wél uit de vragenlijst zodra het doel ze niet heeft', () => {
    const leegDoel = { identity_statement: null, available_hours_per_week: null };
    const vulling = vulVoorInterview(LEEG_INTERVIEW, leegDoel, PROFIEL, uren);

    // 30 minuten per dag is 3,5 uur per week — de omrekening die het scherm noemt.
    expect(vulling.antwoorden.hours_per_week).toBe(3.5);
    expect(vulling.voorgevuld.hours_per_week).toBe('vragenlijst');
  });

  /**
   * ⚠️ **Grendel 3 — de belofte van `PROFIELCONTEXT`.** De valkuilen komen naar
   *    buiten als context en landen nooit in het antwoord. Een app die hier een
   *    zin van maakt, slaat tekst op die de gebruiker niet getypt heeft.
   */
  it('schrijft de valkuilen nooit in het antwoord, maar geeft ze als context', () => {
    const uit = vulVoorUitProfiel(LEEG_INTERVIEW, PROFIEL, uren);

    expect(uit.antwoorden.stuck_before).toBeNull();
    expect(uit.voorgevuld).not.toContain('stuck_before');
    expect(uit.context.stuck_before).toEqual(['forget', 'life_chaotic']);
  });

  it('geeft de context ook als de vraag al beantwoord is', () => {
    const beantwoord: InterviewInvoer = { ...LEEG_INTERVIEW, stuck_before: 'ik begon te laat' };
    const uit = vulVoorUitProfiel(beantwoord, PROFIEL, uren);

    expect(uit.antwoorden.stuck_before).toBe('ik begon te laat');
    expect(uit.context.stuck_before).toEqual(['forget', 'life_chaotic']);
  });

  /**
   * ⚠️ **Grendel 4 — de twee tabellen mogen elkaar niet raken.** Dit is het
   *    verschil dat het hele ontwerp draagt: voorvullen aan de ene kant, tonen
   *    aan de andere. Eén veld in allebei betekent dat het én ingevuld wordt én
   *    als "dit zei je eerder" verschijnt, en dan is de app twee dingen tegelijk
   *    aan het beweren.
   */
  it('geen enkel veld staat in allebei de profieltabellen', () => {
    const gespiegeld = Object.keys(PROFIELSPIEGELING);
    const context = Object.keys(PROFIELCONTEXT);

    expect(gespiegeld.filter((veld) => context.includes(veld))).toEqual([]);
    expect(gespiegeld.length).toBeGreaterThan(0);
    expect(context.length).toBeGreaterThan(0);
  });

  describe('en het scherm houdt de twee bronnen uit elkaar', () => {
    const bron = readFileSync(COACHSCHERM, 'utf8');

    /**
     * ⚠️ **Grendel 5 — zonder aanroep gebeurt de hele voorvulling niet.**
     *
     * ⚠️ `roeptAan()` uit `bereikbaar.test.ts` en geen eigen regex, en dat is
     *    een reparatie uit de ijking. De eerste versie was
     *    `/vulVoorInterview\s*\(/` en die bleef groen toen de aanroep eruit
     *    ging: de kop van het effect noemt de functie mét haakjes, dus de
     *    tóelichting op de aanroep telde als de aanroep. Precies de fout waar
     *    `roeptAan()` voor bestaat — en precies de reden dat CLAUDE.md zegt dat
     *    je de grendel breekt die je ijking noemt.
     */
    it('roept de vulling aan, en telt de kop erboven niet mee', () => {
      expect(roeptAan(bron, 'vulVoorInterview')).toBe(true);
    });

    /**
     * ⚠️ **Grendel 7 — vullen gebeurt één keer, en pas als het profiel er is.**
     *    Het profiel komt uit een context die bij een diepe link ná dit scherm
     *    laadt. Vult het effect al vóór die tijd, dan is de vragenlijst voor
     *    niets ingevuld; vult het opnieuw zodra het profiel binnenkomt, dan
     *    gooit het weg wat de gebruiker intussen getypt heeft — het leest het
     *    interview immers uit de database en niet uit het veld.
     *
     * ⚠️ **En dit is de grens van een bronscan, met zoveel woorden.** Er is
     *    geen renderer in dit project, dus "vult niet twee keer" is niet als
     *    gedrag te toetsen; wat hier staat is dat de rem er is. Hernoemt iemand
     *    `profielLaadt`, dan wordt deze rood zonder dat er iets stuk is — dat
     *    is de prijs, en hij is lager dan een rem die stil kan verdwijnen.
     */
    it('vult niet zolang het profiel nog laadt, en maar één keer', () => {
      expect(bron).toContain('profielLaadt');
      expect(bron).toMatch(/if\s*\(!profielLaadt\)/);
      expect(bron).toContain('gevuld.current');
    });

    /**
     * ⚠️ **Grendel 6 — en het is de reden dat dit geen platte lijst is.** De zin
     *    onder een voorgevuld veld zegt waar de tekst vandaan komt. Met één
     *    lijst zonder herkomst zou hij bij de uren "dit had je al ingevuld bij
     *    je doel" zeggen terwijl het uit de vragenlijst kwam — een melding die
     *    de gebruiker naar het verkeerde scherm stuurt om het bij te stellen.
     */
    it('noemt beide herkomsten, elk met een eigen zin', () => {
      expect(bron).toContain("'doel'");
      expect(bron).toContain("'vragenlijst'");
      expect(bron).toContain("t('coach.al_ingevuld')");
      expect(bron).toContain("t('coach.uit_vragenlijst')");
    });
  });
});
