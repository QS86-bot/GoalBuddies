import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from './roept-aan';

/**
 * Het Vandaag-scherm toont na de splitsing dezelfde tekstsleutels — QS8-748.
 *
 * ⚠️ **De belofte is "dezelfde tekst, andere bestanden", en dat is een eigenschap
 *    van het geheel.** `app/(tabs)/index.tsx` is gesplitst in
 *    `src/schermen/vandaag/`; een test die in het ene bestand naar één zin zoekt,
 *    verhuist niet mee (regel 18, vraag 4). Daarom legt dit bestand de
 *    **verzameling** vast die het scherm vóór de splitsing droeg, en leest hij
 *    alles terug wat het scherm nu is: het routebestand én de map eronder.
 *
 * ⚠️ De lijst is gemeten aan het bestand zoals het op `main` stond vóór dit issue
 *    (1505 regels): elke `t('…')` met een letterlijke sleutel. Sleutels die via
 *    een helper komen (`heldTekstSleutel`, `badgeLabels`, de bevestigingen) staan
 *    niet in dit bestand en zijn dus ook niet verhuisd.
 *
 * ⚠️ Wil je bewust een sleutel toevoegen of laten vervallen, pas dan deze lijst
 *    aan in dezelfde commit — dat is de handeling die het besluit zichtbaar maakt.
 */
const SLEUTELS_VOOR_DE_SPLITSING: readonly string[] = [
  'algemeen.laden',
  'badge.blijven_staan',
  'badge.kop',
  'badge.nog_geen',
  'bewijsfoto.gekozen',
  'bewijsfoto.knop',
  'bewijsfoto.vereist',
  'bewijsfoto.weghalen',
  'commitment.begunstigde.naamloos',
  'dagzet.alleen_ik',
  'dagzet.deel_groep',
  'dagzet.titel',
  'dagzet.uitleg',
  'dagzet.vandaag',
  'dagzet.vastleggen',
  'dagzet.voorbeeld',
  'dagzet.zichtbaarheid',
  'dagzet.zichtbaarheid_hint',
  'dashboard.week_van',
  'getuigenis.afgehandeld',
  'getuigenis.titel',
  'getuigenis.uitleg',
  'getuigenis.van',
  'getuigenis.verschuldigd',
  'overzicht.open',
  'ritme.dagen_gehaald',
  'ritme.maak_ongedaan',
  'ritme.maak_ongedaan_label',
  'ritme.plafond_gehaald',
  'ritme.vink_af',
  'ritme.vink_af_label',
  'ritme.vloer_gehaald',
  'ritme.vloer_nog_niet',
  'vandaag.afronden',
  'vandaag.annuleren',
  'vandaag.antwoord_opnieuw',
  'vandaag.buddy_vraag',
  'vandaag.coulance_tekst',
  'vandaag.coulance_titel',
  'vandaag.eyebrow_deze',
  'vandaag.eyebrow_week',
  'vandaag.indienen',
  'vandaag.leeg_tekst',
  'vandaag.leeg_titel',
  'vandaag.meenemen_knop',
  'vandaag.meenemen_uitleg',
  'vandaag.niveau_hint',
  'vandaag.niveau_label',
  'vandaag.notitie_label',
  'vandaag.notitie_optioneel',
  'vandaag.notitie_verplicht',
  'vandaag.openstaand',
  'vandaag.opnieuw_indienen',
  'vandaag.plafond',
  'vandaag.reeks_telt_weken',
  'vandaag.stand',
  'vandaag.stand_leeg',
  'vandaag.titel',
  'vandaag.toevoegen_uitleg',
  'vandaag.vloer',
  'vandaag.week_afsluiten',
  'vandaag.weekdoel_toevoegen',
  'vandaag.weggooien',
  'vandaag.weggooien_label',
  'weekplan.ingeschoven_kop',
  'weekplan.ingeschoven_tekst',
  'weekstrook.dag',
  'weekstrook.dag_actief',
  'weekstrook.dag_rustig',
  'weekstrook.dag_vandaag',
  'weekstrook.fout',
  'weekstrook.leeg'
];

const WORTEL = join(__dirname, '..', '..');
const SCHERMDIR = join(WORTEL, 'src', 'schermen', 'vandaag');

function schermBronnen(): readonly string[] {
  const bestanden = readdirSync(SCHERMDIR)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(SCHERMDIR, f));
  return [join(WORTEL, 'app', '(tabs)', 'index.tsx'), ...bestanden].map((p) =>
    zonderCommentaar(readFileSync(p, 'utf8')),
  );
}

/** Elke letterlijke sleutel in `t('…')`, ook als de aanroep over twee regels loopt. */
function sleutelsIn(bron: string): ReadonlySet<string> {
  return new Set([...bron.matchAll(/\bt\(\s*'([a-z_.0-9]+)'/g)].map((m) => m[1] as string));
}

describe('het Vandaag-scherm na de splitsing (QS8-748)', () => {
  it('toont precies de tekstsleutels van vóór de splitsing', () => {
    const nu = new Set<string>();
    for (const bron of schermBronnen()) for (const k of sleutelsIn(bron)) nu.add(k);

    expect([...nu].sort()).toEqual([...SLEUTELS_VOOR_DE_SPLITSING].sort());
  });

  it('de zeef is geijkt: hij vindt een sleutel op één regel en over twee regels, en laat een naam met rust', () => {
    expect([...sleutelsIn("t('a.b') + t(\n  'c.d',\n) + gebeurt('x.y')")].sort()).toEqual(['a.b', 'c.d']);
  });

  it('het routebestand zelf draagt geen logica meer buiten de samenstelling', () => {
    const route = readFileSync(join(WORTEL, 'app', '(tabs)', 'index.tsx'), 'utf8');
    expect(route).not.toMatch(/\buseEffect\(|\buseState\(|\bfetch[A-Z]\w*\(/);
  });
});
