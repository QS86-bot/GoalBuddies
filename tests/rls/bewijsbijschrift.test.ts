/**
 * Het bijschrift onder de bewijseis belooft iets over de database — QS8-261.
 *
 * Onder de keuze "hoeveel bewijs vraagt deze groep?" staat één zin:
 * *"Wijzigen raakt bestaande afrondingen niet."* Dat is geen geruststelling maar
 * een bewering over `completions_evidence`, de trigger die de eis afdwingt. Die
 * staat sinds 0021 op `before insert`, en dáárom is de zin waar: een afronding
 * die er al is, komt nooit opnieuw langs de eis.
 *
 * ⚠️ **Dit bestand bestaat omdat de vorige ronde de zin kwijtraakte en niets
 *    rood werd.** 0150 haalde `note_and_attachment` uit de keuze; het bijschrift
 *    eronder droeg twee beweringen, en bij het opruimen (#169) gingen ze allebei
 *    weg terwijl er maar één verlopen was. `catalogus:controle` zoekt sleutels
 *    zónder aanroeper en `tekst:controle` bewaakt of tekst ín de catalogus staat
 *    — geen van beide kan zien of een zin nog wáár is. Deze test kan dat wel,
 *    want hij toetst de zin tegen de reden waarom hij waar is.
 *
 * ⚠️ **Niet op de triggernaam maar op wat de trigger doet.** Een toets op
 *    `completions_evidence` alleen blijft groen als iemand een tweede trigger
 *    bijzet die de eis wél op UPDATE herhaalt — dan is de naam nog steeds netjes
 *    en de belofte alsnog gebroken. De query zoekt daarom élke trigger op
 *    `completions` waarvan de functie `evidence_policy` noemt.
 *
 * ⚠️ **De lege verzameling is hier het gevaar** (regel 18, vraag 3). Vindt de
 *    query niets, dan is "geen ervan vuurt op UPDATE" waar zonder iets te
 *    bewijzen. Er staat daarom een aparte assertie dat er minstens één is, en
 *    die twee staan los van elkaar: een assertie die twee grendels tegelijk
 *    raakt, kan niet zien dat er één weg is.
 *
 * ⚠️ Geijkt met de hand, één mutatie per grendel en niet één voor het geheel:
 *
 *    1. de trigger heraangemaakt als `before insert or update` — assertie 1 rood,
 *       2 en 3 groen;
 *    2. de trigger gedropt — assertie 2 rood, 1 groen (en dát is waarom 2
 *       bestaat: 1 is dan waar zonder iets te bewijzen);
 *    3. de sleutel uit `nl.ts` — assertie 3 rood, 1 en 2 groen;
 *    4. het `<Caption>` uit het scherm met de sleutel nog in de catalogus —
 *       assertie 3 rood. Dat is letterlijk de regressie van #169, en de reden
 *       dat deze test niet bij de catalogus stopt.
 *
 *    Na 1 en 2 is het schema opnieuw opgebouwd; een teruggezette mutatie is geen
 *    gemeten schema.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { en } from '../../src/shared/i18n/en';
import { nl } from '../../src/shared/i18n/nl';

import { psql, schemaHeeft, stackBeschikbaar } from './psql';

// ⚠️ De verbindingsgegevens staan in `./psql` en niet hier — zie de kop van dat
//    bestand: dit blok stond vier keer en was drie keer fout (QS8-270).

/** De sleutel staat hier één keer; hij is het onderwerp van alle drie de tests. */
const SLEUTEL = 'beheer.bewijs_wijzigen';

/** Het scherm waar het bijschrift hoort te staan. */
const SCHERM = 'app/groep/beheer/[id].tsx';

/**
 * Elke trigger op `completions` waarvan de functie de bewijseis leest, met de
 * opdrachten waarop hij vuurt.
 *
 * ⚠️ `tgtype` is een bitmasker: 4 = INSERT, 8 = DELETE, 16 = UPDATE. De belofte
 *    gaat over UPDATE, dus bit 16 is degene die nul moet zijn.
 */
const TRIGGERS = `
  select t.tgname || ':' || (t.tgtype & 16)
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.completions'::regclass
    and not t.tgisinternal
    and p.prosrc like '%evidence_policy%'
  order by t.tgname
`;

const beschikbaar = stackBeschikbaar(
  schemaHeeft("select count(*) from pg_class where relname = 'completions'"),
);

function triggers(): string[] {
  const uit = psql(TRIGGERS);
  return uit === '' ? [] : uit.split('\n');
}

describe.skipIf(!beschikbaar)('het bijschrift onder de bewijseis', () => {
  it('wordt door geen enkele bewijseis-trigger op UPDATE herhaald', () => {
    const opUpdate = triggers().filter((r) => !r.endsWith(':0'));

    expect(
      opUpdate,
      `Deze trigger(s) op completions lezen de bewijseis én vuren op UPDATE. ` +
        `Daarmee wordt "${nl[SLEUTEL]}" onwaar: een groep die zijn eis aanscherpt, ` +
        `raakt dan afrondingen die er al waren. Haal het bijschrift weg (sleutel ` +
        `${SLEUTEL}, getoond in ${SCHERM}) of laat de trigger op insert staan.`,
    ).toEqual([]);
  });

  it('gaat over een trigger die er daadwerkelijk is', () => {
    // ⚠️ Los van de test hierboven, en met opzet. Verdwijnt de trigger, dan is
    //    "geen ervan vuurt op UPDATE" nog steeds waar en bewijst het niets meer.
    expect(
      triggers().length,
      `Geen enkele trigger op completions leest nog de bewijseis. De test ` +
        `hierboven kan dan niet meer rood worden, en het bijschrift ` +
        `"${nl[SLEUTEL]}" belooft iets waarvoor geen grendel meer bestaat.`,
    ).toBeGreaterThan(0);
  });
});

describe('de zin die dat belooft', () => {
  it('staat in beide catalogi en wordt getoond', () => {
    expect(nl[SLEUTEL], `${SLEUTEL} ontbreekt in nl.ts`).toBeTruthy();
    expect(en[SLEUTEL], `${SLEUTEL} ontbreekt in en.ts`).toBeTruthy();

    const scherm = readFileSync(SCHERM, 'utf8');
    expect(
      scherm.includes(`t('${SLEUTEL}')`),
      `${SCHERM} toont ${SLEUTEL} niet meer. Staat de zin er bewust uit, haal ` +
        `dan ook dit bestand weg — een grendel op een zin die niemand ziet, ` +
        `bewaakt niets.`,
    ).toBe(true);
  });
});
