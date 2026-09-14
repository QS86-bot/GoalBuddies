/**
 * De belofte: `schema-opbouwen.sh` past elke migratie in zijn geheel toe of
 * helemaal niet — QS8-466.
 *
 * ⚠️⚠️ **Deze test bestaat omdat de belofte hiervóór alléén in een comment
 *    stond.** Boven de lus stond *"elke migratie in zijn eigen transactie,
 *    precies zoals Supabase hem heeft toegepast"*, en de aanroep eronder droeg
 *    geen `--single-transaction`. In die vorm is elke **statement** zijn eigen
 *    transactie, niet elk bestand. \U0001f4cf Gemeten met precies die vlaggen, op
 *    `create table t1 (id int); select 1/0;`:
 *
 *    ```
 *    zonder --single-transaction   ->  t1 bestaat: 1   (halve migratie blijft staan)
 *    met    --single-transaction   ->  t1 bestaat: 0
 *    ```
 *
 *    Dat is de klasse van QS8-412: *een ontbrekende grendel valt op, een grendel
 *    waarvan in de bron staat dát hij er is valt niet op.* Daar ging het om een
 *    testbestand dat niet bestond; hier om een eigenschap die de comment
 *    toezegt en de code niet levert.
 *
 * ⚠️ **Waarom statisch en niet door de opbouw echt te laten omvallen.** Dat
 *    tweede vraagt een Postgres, en dan is de grendel die de opbouw bewaakt
 *    alleen te ijken mét die opbouw — de vorm die CLAUDE.md afraadt (*een
 *    controle die je niet kunt voeden, kun je niet ijken*). Dezelfde
 *    taakverdeling als bij `idempotent-controle`: het oordeel staat hier los
 *    aangeboden, en de gedragsmeting is met de hand gedaan en staat in
 *    `docs/decisions/2026-09-14-de-comment-beloofde-een-transactie.md`.
 *
 * ⚠️ Wat dit dus **niet** bewijst: dat Postgres de transactie ook echt
 *    terugrolt. Dat is de handmeting hierboven. Wat het wél bewijst is dat de
 *    aanroep die de migraties draait de vlag draagt — en dat is precies het
 *    verschil dat een jaar lang onopgemerkt bleef.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(import.meta.dirname, '..', '..');

/**
 * De klachten over de aanroep die de migratiebestanden afspeelt.
 *
 * ⚠️ Hij zoekt de regel die `"${BESTANDEN[@]}"` doorgeeft — dat is de aanroep
 *    die de migraties draait, en niet die van de steiger of het register. Een
 *    vlag die ergens ánders in het bestand staat, telt dus niet mee.
 *
 * @param {string} inhoud de inhoud van `schema-opbouwen.sh`
 * @returns {string[]} leeg als de aanroep atomair is
 */
export function klachten(inhoud: string): string[] {
  const regels = inhoud.split('\n');
  const aanroepen = regels.filter(
    (r) => r.includes('"${BESTANDEN[@]}"') && r.includes('${PSQL[@]}'),
  );

  if (aanroepen.length === 0) {
    return [
      'geen aanroep gevonden die `"${BESTANDEN[@]}"` doorgeeft — is de lus ' +
        'verhuisd? Dan verhuist deze belofte mee, en deze test niet.',
    ];
  }

  return aanroepen
    .filter((r) => !r.includes('--single-transaction') && !/\s-1(\s|$)/.test(r))
    .map(
      (r) =>
        'de aanroep die de migraties afspeelt draait niet per bestand in een ' +
        `transactie: ${r.trim()}`,
    );
}

describe('de opbouw past een migratie in zijn geheel toe', () => {
  it('draait de migratieaanroep met --single-transaction', () => {
    const inhoud = readFileSync(join(WORTEL, 'scripts', 'schema-opbouwen.sh'), 'utf8');

    expect(klachten(inhoud)).toEqual([]);
  });

  /**
   * ⚠️ De vormen die hij moet vínden. Zonder deze helft is een `klachten()` die
   *    altijd `[]` teruggeeft ook groen op de test hierboven.
   */
  it.each([
    ['de vorm van vóór QS8-466', '  if ! "${PSQL[@]}" -d "$DB" "${BESTANDEN[@]}" >/dev/null; then'],
    [
      'een vlag die op een ándere aanroep staat',
      '"${PSQL[@]}" --single-transaction -d "$DB" -f "$STEIGER"\n' +
        'if ! "${PSQL[@]}" -d "$DB" "${BESTANDEN[@]}" >/dev/null; then',
    ],
  ])('meldt %s', (_naam, bron) => {
    expect(klachten(bron)).toHaveLength(1);
  });

  /**
   * ⚠️ En de vormen die hij met rust moet laten — een controle die alles meldt,
   *    leer je uitzetten.
   */
  it.each([
    ['--single-transaction', 'if ! "${PSQL[@]}" --single-transaction -d "$DB" "${BESTANDEN[@]}"; then'],
    ['de korte vorm -1', 'if ! "${PSQL[@]}" -1 -d "$DB" "${BESTANDEN[@]}"; then'],
  ])('laat %s met rust', (_naam, bron) => {
    expect(klachten(bron)).toEqual([]);
  });

  /**
   * ⚠️ **De verhuizing is de gevaarlijkste beweging die er is.** Gaat de lus
   *    ooit naar een andere vorm, dan wordt deze test niet stil groen maar
   *    meldt hij dat hij zijn eigen onderwerp kwijt is.
   */
  it('meldt het als de aanroep helemaal niet meer te vinden is', () => {
    expect(klachten('echo "geen migratielus meer"')).toHaveLength(1);
    expect(klachten('echo "geen migratielus meer"')[0]).toContain('verhuisd');
  });
});
