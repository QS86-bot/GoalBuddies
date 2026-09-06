import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');

/**
 * Een datum komt uit een kalender — QS8-223.
 *
 * ⚠️ **De belofte is niet "`DatumKeuze` bestaat" en ook niet "de vijf velden zijn
 *    omgezet".** Die twee zijn waar op de dag dat ze geschreven worden en zeggen
 *    niets over het volgende datumveld dat iemand toevoegt. De belofte is:
 *    *geen enkel datumveld in de app eist nog dat de gebruiker het formaat kent.*
 *
 * ⚠️ **Daarom zoekt deze test naar de vórm van de fout en niet naar de vijf
 *    plekken.** Een kaal `Field` met `2026-12-31` als plaatshouder is precies wat
 *    er stond; wie er morgen een zesde bijzet, hoort hier rood te worden en niet
 *    pas bij de volgende doorloop met een mens.
 *
 * ⚠️ Dat `isoDatum` in `modules/goals/schemas.ts` bestaat, komt hier rechtstreeks
 *    uit: er was een veld zonder formaatcontrole, iemand typte iets anders, en
 *    `datumLigtInDeToekomst` vergelijkt strings — `'morgen' > '2026-08-18'` is
 *    gewoon waar. De kalender haalt dat weg bij de bron; de schema's en de CHECK's
 *    blijven staan, want een scherm is geen grens.
 */

function schermen(map: string): string[] {
  const uit: string[] = [];

  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...schermen(pad));
    else if (naam.endsWith('.tsx')) uit.push(pad);
  }

  return uit;
}

function zonderCommentaar(bron: string): string {
  return bron.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Elke `<Field …/>` in een bron, met alles wat er tussen de haken staat.
 *
 * ⚠️ Telt niet op `/>` maar op de eerste `>` die geen deel is van een prop, want
 *    een `Field` met een expressie erin (`{a > b}`) zou anders halverwege
 *    afgekapt worden. In de praktijk is de vorm hier altijd zelfsluitend; de
 *    lezerstests hieronder leggen beide vormen voor.
 */
export function velden(bron: string): readonly string[] {
  const schoon = zonderCommentaar(bron);
  const uit: string[] = [];

  let vanaf = schoon.indexOf('<Field');
  while (vanaf !== -1) {
    const sluit = schoon.indexOf('/>', vanaf);
    if (sluit !== -1) uit.push(schoon.slice(vanaf, sluit));
    vanaf = schoon.indexOf('<Field', vanaf + 1);
  }

  return uit;
}

/**
 * Is dit veld een datumveld?
 *
 * ⚠️ **Twee aanwijzingen, want één was te weinig.** De plaatshouder vangt de vorm
 *    die er stond (`placeholder="2026-12-31"`); de sleutel vangt het veld dat
 *    iemand zónder plaatshouder toevoegt, zoals `deadline.datum_label` — dat had
 *    er geen. Een veld dat "wanneer" heet en een ISO-plaatshouder draagt, valt
 *    onder de eerste.
 */
export function isDatumveld(veld: string): boolean {
  if (/placeholder=["']\d{4}-\d{2}-\d{2}["']/.test(veld)) return true;
  return /t\(['"][a-z0-9_]+\.[a-z0-9_]*datum[a-z0-9_]*['"]/i.test(veld);
}

const SCHERMEN = schermen(join(WORTEL, 'app'));

describe('geen enkel datumveld is nog een kaal tekstveld', () => {
  it('vindt de schermen, anders toetst de rest niets', () => {
    expect(SCHERMEN.length).toBeGreaterThan(10);
  });

  it('en geen enkele Field draagt een datum', () => {
    const gevonden: string[] = [];

    for (const pad of SCHERMEN) {
      for (const veld of velden(readFileSync(pad, 'utf8'))) {
        if (isDatumveld(veld)) gevonden.push(`${relative(WORTEL, pad)}: ${veld.slice(0, 90)}`);
      }
    }

    expect(
      gevonden,
      'Een datum hoort uit `DatumKeuze` te komen en niet uit een tekstveld: dan ' +
        'moet de gebruiker JJJJ-MM-DD kennen, en dat is precies wat QS8-223 ' +
        'weghaalde.',
    ).toEqual([]);
  });

  /**
   * ⚠️ **Domeinregel 1 op deze component.** `DatumKeuze` neemt `startDag` aan
   *    omdat de eerste kolom van een kalender de week-startdag van de gebruiker
   *    hoort te volgen. Een vaste `1` erin zetten is dezelfde fout als een vaste
   *    week-start in een query, en hij is met het blote oog niet te zien.
   */
  it('en geen enkele DatumKeuze krijgt een verzonnen week-startdag', () => {
    const gevonden = SCHERMEN.filter((pad) =>
      /startDag=\{\s*[0-6]\s*\}/.test(zonderCommentaar(readFileSync(pad, 'utf8'))),
    ).map((pad) => relative(WORTEL, pad));

    expect(
      gevonden,
      'startDag hoort uit het profiel te komen (domeinregel 1), niet uit een getal ' +
        'in het scherm.',
    ).toEqual([]);
  });

  it('en de app gebruikt de component ook echt', () => {
    const gebruikers = SCHERMEN.filter((pad) => readFileSync(pad, 'utf8').includes('<DatumKeuze'));

    expect(
      gebruikers.length,
      'Geen enkel scherm rendert `DatumKeuze`. Dan toetst de regel hierboven alleen ' +
        'nog dat er nérgens een datum in te vullen is — een groene test voor een ' +
        'app zonder datumvelden.',
    ).toBeGreaterThan(0);
  });
});

/**
 * ⚠️ De tweede helft: de lezers vinden de vormen die ze moeten vinden en laten de
 *    rest met rust. Een controle die alles meldt, leer je negeren.
 */
describe('de lezers lezen wat er staat', () => {
  it('velden vindt elke Field en stopt bij het einde ervan', () => {
    const bron = '<Field label={t("a.b")} /><Body/><Field value={x} />';
    expect(velden(bron)).toHaveLength(2);
    expect(velden(bron)[0]).not.toContain('Body');
  });

  it('velden slaat een Field in commentaar over', () => {
    expect(velden('{/* <Field placeholder="2026-01-01" /> */}')).toEqual([]);
  });

  it('isDatumveld herkent een ISO-plaatshouder', () => {
    expect(isDatumveld('<Field placeholder="2026-12-31" ')).toBe(true);
    expect(isDatumveld("<Field placeholder='2027-03-31' ")).toBe(true);
  });

  it('isDatumveld herkent een sleutel met datum erin', () => {
    expect(isDatumveld("<Field label={t('deadline.datum_label')} ")).toBe(true);
    expect(isDatumveld("<Field label={t('nieuwdoel.streefdatum')} ")).toBe(true);
  });

  /**
   * ⚠️ Deze drie zijn geen datumvelden en moeten met rust gelaten worden. Zonder
   *    deze regel zou een lezer die op elk cijfer of op het woord "dat" aanslaat,
   *    ook groen zijn — en dan meldt hij straks elk veld in de app.
   */
  it('isDatumveld laat een gewoon veld met rust', () => {
    expect(isDatumveld("<Field label={t('nieuwdoel.wat')} placeholder={t('x')} ")).toBe(false);
    expect(isDatumveld('<Field placeholder="2026" ')).toBe(false);
    expect(isDatumveld("<Field label={t('aanmelden.wachtwoord')} ")).toBe(false);
  });
});
