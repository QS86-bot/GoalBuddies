import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  behouden,
  bewustVallen,
  definitiesIn,
  GRENS,
  MIN_OVERLAP,
  verliezenInRegels,
} from '../../scripts/registerdrift-regels.mjs';

/**
 * De tweede helft van `registerdrift:controle` — QS8-766.
 *
 * ⚠️ **Wat dit bewaakt is de belofte en niet de zeef:** een migratie die een
 *    functie, CHECK of policy herdefinieert op basis van een oudere stand laat
 *    de wijziging van `main` niet stil vallen. De vier geijkte gevallen hieronder
 *    zijn de vier die op 20-11-2026 met de hand gevangen zijn, en ze draaien op
 *    een kopie van de échte migratiemap met de regel eruit — geen zelfgevoerd
 *    object, want dan is "klopt dat object" niet te stellen.
 *
 * ⚠️⚠️ **Blinde vlekken, bewust, besloten 20-11-2026:** alleen migraties vanaf
 *    `GRENS` worden beoordeeld (daaronder 1389 meldingen, gemeten), en alleen een
 *    herdefinitie waarvan `MIN_OVERLAP` (70%) van de vorige regels terugkomt. Een
 *    bijna volledige herschrijving die een voorwaarde laat vallen ziet deze
 *    controle niet; de test 'laat een herschrijving met weinig overlap met rust'
 *    legt die grens vast, zodat hij een keuze blijft.
 *
 * IJKING — met de hand, 20-11-2026, op de echte map (een kopie als `0999_…`):
 *   1  `and c.periode_start is null` uit `straffen_bij_uitstelverzoek` (0312) → rood
 *   2  het `prestatie_gedeeld`-blok uit `verwijder_mijn_account` (0309) → rood
 *   3  `'prestatie_gedeeld'` uit de CHECK `chat_messages_system_event_bekend` → rood
 *   4  de `(select …)`-wikkel in `commitments_select` (0254) → rood
 */

const MAP = join(__dirname, '..', '..', 'supabase', 'migrations');
const echt = readdirSync(MAP)
  .filter((n) => n.endsWith('.sql'))
  .sort()
  .map((naam) => ({ naam, bron: readFileSync(join(MAP, naam), 'utf8') }));

/** De laatste echte migratie die `tekst` bevat. */
function laatsteMet(tekst: string) {
  const m = [...echt].reverse().find((e) => e.bron.includes(tekst));
  if (m === undefined) throw new Error(`geen migratie met «${tekst}»`);
  return m;
}

/** Een kopie van die migratie als nieuwe `0999`, met `muteer` toegepast. */
function metKopie(bron: string, muteer: (b: string) => string) {
  return [...echt, { naam: '0999_ijking.sql', bron: muteer(bron) }];
}

const verliezenIn999 = (migraties: { naam: string; bron: string }[]) =>
  verliezenInRegels(migraties).filter((v: { migratie: string }) => v.migratie === '0999_ijking.sql');

describe('de echte map — de basislijn', () => {
  it('een ongewijzigde kopie van de laatste definitie verliest niets', () => {
    const f = laatsteMet('function public.straffen_bij_uitstelverzoek');
    // ⚠️ Alleen deze functie: de kopie van 0321 bevat ook `group_overview`, en die
    //    heeft 0327 intussen gewijzigd. Dat is een echt verlies, en precies de klasse
    //    die de controle vangt — de kopie is dus zelf een oude stand.
    const v = verliezenIn999(metKopie(f.bron, (b) => b));
    expect(v.filter((x: { sleutel: string }) => x.sleutel.startsWith('straffen_bij_uitstelverzoek'))).toEqual([]);
  });

  it('de bestaande map is groen onder de grens', () => {
    expect(verliezenInRegels(echt)).toEqual([]);
  });

  it('de grens en de drempel zijn wat besloten is', () => {
    expect(GRENS).toBe('0328');
    expect(MIN_OVERLAP).toBe(0.7);
  });
});

describe('de vier echte gevallen van 20-11-2026', () => {
  it('1: de voorwaarde `periode_start is null` uit straffen_bij_uitstelverzoek', () => {
    const f = laatsteMet('function public.straffen_bij_uitstelverzoek');
    expect(f.bron).toContain('periode_start is null');

    const v = verliezenIn999(
      metKopie(f.bron, (b) => b.replace(/^.*periode_start is null.*\n/gm, '')),
    );

    expect(v.some((x: { sleutel: string; item: string }) =>
      x.sleutel.startsWith('straffen_bij_uitstelverzoek') && x.item.includes('periode_start is null'),
    )).toBe(true);
  });

  it('2: het prestatie_gedeeld-blok uit verwijder_mijn_account', () => {
    const f = laatsteMet('function public.verwijder_mijn_account');
    expect(f.bron).toContain('prestatie_gedeeld');

    const v = verliezenIn999(
      metKopie(f.bron, (b) => b.replace(/^.*prestatie_gedeeld.*\n/gm, '')),
    );

    expect(v.some((x: { sleutel: string }) => x.sleutel.startsWith('verwijder_mijn_account'))).toBe(true);
  });

  it('3: `prestatie_gedeeld` uit de allowlist chat_messages_system_event_bekend', () => {
    const f = laatsteMet('add constraint chat_messages_system_event_bekend');

    const v = verliezenIn999(
      metKopie(f.bron, (b) => b.replace(/'prestatie_gedeeld',?\s*/g, '')),
    );

    expect(v).toContainEqual(
      expect.objectContaining({ soort: 'check', item: "'prestatie_gedeeld'" }),
    );
  });

  it('4: de (select …)-wikkel in commitments_select', () => {
    const f = laatsteMet('create policy commitments_select');
    expect(f.bron).toContain('(select commitment_zichtbaar_voor_groep())');

    const v = verliezenIn999(
      metKopie(f.bron, (b) =>
        b.replace('(select commitment_zichtbaar_voor_groep())', 'commitment_zichtbaar_voor_groep()'),
      ),
    );

    expect(v.some((x: { soort: string; sleutel: string }) =>
      x.soort === 'policy' && x.sleutel === 'commitments_select on commitments',
    )).toBe(true);
  });
});

describe('wat hij met rust moet laten', () => {
  const f = () => laatsteMet('function public.straffen_bij_uitstelverzoek');
  const zonderRegel = (b: string) => b.replace(/^.*periode_start is null.*\n/gm, '');

  it('laat een bewust verlies toe als de kop het regel voor regel noemt', () => {
    const kop = '-- laat bewust vallen: and c.periode_start is null\n';
    const v = verliezenIn999(metKopie(f().bron, (b) => kop + zonderRegel(b)));
    expect(v.filter((x: { item: string }) => x.item.includes('periode_start is null'))).toEqual([]);
  });

  it('een markering voor een andere regel dekt deze niet', () => {
    const kop = '-- laat bewust vallen: iets heel anders\n';
    const v = verliezenIn999(metKopie(f().bron, (b) => kop + zonderRegel(b)));
    expect(v.length).toBeGreaterThan(0);
  });

  it('een markering ná de kop telt niet', () => {
    const v = verliezenIn999(
      metKopie(f().bron, (b) => `select 1;\n-- laat bewust vallen: periode_start is null\n${zonderRegel(b)}`),
    );
    expect(v.length).toBeGreaterThan(0);
  });

  it('laat een herschrijving met weinig overlap met rust (de blinde vlek)', () => {
    // ⚠️ Met dezelfde signatuur als het echte origineel, anders is er niets om
    //    mee te vergelijken en groen zegt niets (ijking G2 ving dat).
    const kop = /create or replace function public\.straffen_bij_uitstelverzoek\([^)]*\)/.exec(f().bron);
    expect(kop).not.toBeNull();
    const nieuw = `${kop?.[0]} returns setof uuid language sql as $function$ select 1; $function$;`;
    const v = verliezenIn999(metKopie(f().bron, () => nieuw));
    expect(v.filter((x: { sleutel: string }) => x.sleutel.startsWith('straffen_bij_uitstelverzoek'))).toEqual([]);
  });

  it('beoordeelt een migratie onder de grens niet', () => {
    const m = [
      ...echt,
      { naam: '0327_oud.sql', bron: zonderRegel(f().bron) },
    ].sort((a, b) => a.naam.localeCompare(b.naam));
    expect(
      verliezenInRegels(m).filter((v: { migratie: string }) => v.migratie === '0327_oud.sql'),
    ).toEqual([]);
  });

  it('beoordeelt wel zodra de grens verlaagd wordt', () => {
    const m = metKopie(f().bron, zonderRegel);
    expect(
      verliezenInRegels(m, { grens: '0000' }).some(
        (v: { migratie: string }) => v.migratie === '0999_ijking.sql',
      ),
    ).toBe(true);
  });
});

describe('de onderdelen', () => {
  it('bewustVallen leest alleen het kopblok', () => {
    expect(bewustVallen('-- x\n-- laat bewust vallen: Een Regel\nselect 1;\n-- laat bewust vallen: nee')).toEqual([
      'een regel',
    ]);
  });

  it('behouden telt het deel dat terugkomt', () => {
    expect(behouden(['a', 'b', 'c', 'd'], ['a', 'b', 'c'])).toBe(0.75);
    expect(behouden([], ['a'])).toBe(1);
  });

  it('definitiesIn vindt functie, check en policy en negeert commentaar', () => {
    const bron = [
      'create or replace function public.f(a int) returns int as $$ select 1; $$ language sql;',
      "alter table t add constraint c1 check (x in ('a', 'b'));",
      '-- create policy verborgen on t using (true);',
      'create policy p on public.t for select using (true);',
    ].join('\n');
    expect(definitiesIn(bron).map((d: { soort: string }) => d.soort)).toEqual(['functie', 'policy', 'check']);
  });
});
