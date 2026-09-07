import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { roeptAan } from './roept-aan';

const WORTEL = join(__dirname, '..', '..');

/**
 * Datalaagfuncties die een knop hóren te hebben, met de reden erbij.
 *
 * ⚠️ **Een lijst met redenen en geen lijst met namen** — zelfde vorm als
 *    `BEWUST_ONGESCHREVEN` in `dode-keten-controle.mjs`. Wie hier iets aan
 *    toevoegt zonder op te schrijven wat de gebruiker eraan heeft, heeft een
 *    naam geparkeerd in plaats van een belofte vastgelegd.
 */
const MOET_EEN_SCHERM_HEBBEN: Readonly<Record<string, string>> = {
  wijzigDoel:
    'Zonder scherm is een doel na aanmaken niet meer te wijzigen — ook een ' +
    'typefout in de titel niet.',
  wijzigMijlpaal:
    'Aanmaken, verwijderen, herordenen en op gehaald zetten konden allemaal; ' +
    'alleen de tekst van een mijlpaal was permanent.',
  dagenUitKeuze:
    'De belofte van A53: een weekdoel dat in dagen telt. Zonder scherm dat deze ' +
    'functie aanroept blijft `ceiling_days` altijd NULL en gedraagt élk weekdoel ' +
    'zich zoals vóór A53 — precies de toestand die QS8-260 heeft opgelost. ⚠️ ' +
    'Deze regel staat er omdat de mutatie het aantoonde: het scherm de twee ' +
    'velden op `null` laten zetten maakte géén enkele test rood, want ' +
    '`kolomrechten:controle` kijkt naar kolomnamen in `maakWeekdoel()` en niet ' +
    'naar wat een scherm meegeeft.',
  useAvatarKeuze:
    'De hele leeskant van een profielfoto stond er sinds migratie 0001 — kolom, ' +
    'grant, `Avatar`-component, vier schermen die hem tonen — en er was geen ' +
    'enkele knop die hem kon vullen. ⚠️ **Deze regel staat er pas sinds QS8-196, ' +
    'en de knop bestond toen al**: hij is op 03-09 van `app/(tabs)/profiel.tsx` ' +
    'naar `shared/ui` verhuisd zodat de onboarding hem ook kan gebruiken, en bij ' +
    'die verhuizing bleek dat geen enkele test zag of hij er nog was. Dat is de ' +
    'gevaarlijkste beweging die er is (CLAUDE.md over verhuizingen) en precies ' +
    'waar dit register voor bestaat. ' +
    '⚠️ **De hook staat hier en niet `uploadAvatar`, en dat is een grens van dit ' +
    'register.** Sinds de splitsing roept het scherm de hook aan en de hook de ' +
    'datalaag; deze toets ziet alleen de eerste schakel. De tweede — dat de hook ' +
    'écht uploadt én verwijdert — staat in `tests/beloftes/avatar.test.ts`. Twee ' +
    'schakels, twee toetsen, want deze lijst kan niet door een module heen kijken ' +
    '(zie de kop: dat vraagt een parser).',
  fetchGetuigenissen:
    'Het leesrecht van de persoon-getuige bestaat sinds 0168 — `commitments_select`, ' +
    'derde tak — en er was tot QS8-292 geen enkel scherm dat het gebruikte. De ' +
    'énige lezing van `commitments` vraagt per doel en staat op het scherm van de ' +
    'eigenaar, dat de getuige niet eens kan openen. ⚠️ **Dit is de rij waar dit ' +
    'register voor bestaat**: elk schakeltje was af, de keten was onderbroken, en ' +
    'geen enkele test kon het zien. Verdwijnt het blok van *Vandaag*, dan is de ' +
    'straf weer een voornemen in plaats van een commitment device — de werking ' +
    'komt uit het gezien wórden.',
  fetchCommitmentSpoor:
    'Domeinregel 5 eist dat een commitment auditeerbaar is. Een spoor dat ' +
    'niemand kan opvragen is precies zo goed als geen spoor.',
  stelWeekplanstapBij:
    'Een geplande stap was aan te maken, te herordenen, te starten en weg te ' +
    'gooien — alleen niet bij te stellen. Een tikfout in de titel kostte je de ' +
    'hele stap én zijn plek in de volgorde. ⚠️ **Deze rij staat er sinds ' +
    'QS8-301, en hij is niet met de hand gevonden**: `exports:controle` (QS8-150) ' +
    'meldde hem als functie zonder pad naar een mens. Dat is precies waar die ' +
    'detector voor gebouwd is, en dit is het eerste gat dat hij heeft opgeleverd ' +
    'in plaats van bevestigd. ' +
    '⚠️ **En wat déze rij níét bewaakt, is dat er een knóp is.** Gemeten bij het ' +
    'ijken: haal de knop uit `Weekplanblok` en deze test blijft groen, want het ' +
    'scherm roept de functie nog steeds aan — alleen kan niemand er meer bij. ' +
    'Wat dat wél vindt is `catalogus:controle`: zonder knop staan ' +
    '`weekplan.bijstellen` en `weekplan.bijstellen_label` nergens meer en wordt ' +
    'die rood. Twee controles, twee helften van dezelfde keten, en geen van ' +
    'beide dekt hem alleen.',
  vulVoorInterview:
    'De onboarding vraagt hoeveel minuten per dag je hebt en wat je gewoontes ' +
    'normaal laat stuklopen, en de Doelcoach stelde die twee vragen daarna ' +
    'blanco opnieuw. De functie die dat oplost stond er, onder test, en werd ' +
    'door geen enkel scherm aangeroepen — dan is de vragenlijst een formulier ' +
    'waar niets mee gebeurt. ⚠️ **Tweede rij uit `exports:controle` (QS8-150), ' +
    'en het tweede gat van QS8-301 groep 1.** ' +
    '⚠️ **De rij staat op de samenstelling en niet op `vulVoorUitProfiel` zelf**, ' +
    'want die is sinds QS8-301 een schakel in `vulVoorInterview()` — de twee ' +
    'vullingen zijn daar samengevoegd omdat hun naad in een component-effect ' +
    'voor geen enkele test bereikbaar was. `exports:controle` loopt de ' +
    'aanroepen transitief na en ziet hem dus nog steeds; deze lijst kijkt ' +
    'alleen naar de eerste schakel (zie `useAvatarKeuze` hierboven). ' +
    '⚠️ **Wat déze rij níét bewaakt, is de contextkant.** Gemeten bij het ' +
    'ijken: haal de valkuilen uit `toelichtingBij()` en deze test blijft groen, ' +
    'want het scherm roept de functie nog steeds aan voor de uren. Wat dat wél ' +
    'vindt is `catalogus:controle` — `coach.eerder_genoemd` staat dan nergens ' +
    'meer. Zelfde tweedeling als bij `stelWeekplanstapBij` hierboven: twee ' +
    'controles, twee helften van dezelfde keten.',
};

/**
 * Een datalaagfunctie zonder scherm is dood hout dat geen enkele test ziet.
 *
 * ⚠️ **Dit is de variant van onwrikbare regel 18 zonder kapot onderdeel.** Elk
 *    schakeltje is af: de functie is geschreven, het schema klopt, de policy
 *    staat. Er is niets rood te maken, want er is niets stuk — de keten is
 *    alleen nergens verbonden. Vraag 5 van regel 18 vraagt daar met zoveel
 *    woorden naar: *kan een gebruiker hier daadwerkelijk bij, en langs welke
 *    knop?*
 *
 * ⚠️ **Drie keer eerder gebeurd, en drie keer pas achteraf gezien.** QS8-112
 *    (`maakWeekdoel()` had geen aanroeper terwijl twee issues op Done stonden),
 *    QS8-113 (`profiles.locale` had kolom, CHECK, grant, leeskant én catalogus,
 *    en geen schrijfpad), en QS8-106 (vier datalaagfuncties zonder scherm). De
 *    controleronde van 28-08 vond de vierde ronde: deze drie.
 *
 * ⚠️ **Waarom een lijst en geen algemene detector.** Een export die nergens
 *    buiten zijn module wordt gebruikt, is generiek te vinden — maar niet met een
 *    grep: schema's en constanten worden vaak rechtstreeks geïmporteerd in plaats
 *    van via de barrel, en een ruwe telling gaf tientallen valse meldingen. Dat
 *    vraagt een echte parser, en dat is eigen werk; het staat als rij in
 *    `docs/ENGINEER-REVIEW.md`. Wat je zónder parser wél kunt vastleggen is de
 *    belofte per functie, en dat is deze lijst.
 */
describe('een datalaagfunctie met een belofte heeft een scherm', () => {
  const schermen = schermbestanden(join(WORTEL, 'app'));

  it('vindt de schermen, anders toetst de rest niets', () => {
    // Ondergrens en geen exact getal: `app/` groeit, en dan hoort deze test niet
    // rood te worden om iets dat er niets mee te maken heeft.
    expect(schermen.length).toBeGreaterThan(10);
  });

  for (const [naam, reden] of Object.entries(MOET_EEN_SCHERM_HEBBEN)) {
    it(`${naam}() wordt vanuit een scherm aangeroepen`, () => {
      const gevonden = schermen.filter((s) => roeptAan(s.bron, naam));

      expect(
        gevonden.map((s) => s.pad),
        `${naam}() heeft geen enkel scherm. ${reden}`,
      ).not.toEqual([]);
    });
  }

  /**
   * ⚠️ **De ijking van de zeef zelf.** Zonder deze is niet te zien of
   *    `roeptAan()` überhaupt iets kán vinden — en een controle die nooit rood is
   *    geweest, is een aanname. Met de hand nagedaan: de aanroep in
   *    `app/doel/bewerk/[id].tsx` weghalen maakt de test over `wijzigDoel` rood.
   */
  describe('de zeef is geijkt', () => {
    it('herkent een echte aanroep', () => {
      expect(roeptAan('const uit = await wijzigDoel(doel.id, patch);', 'wijzigDoel')).toBe(true);
      expect(roeptAan('onPress={() => void wijzigMijlpaal(m.id, invoer)}', 'wijzigMijlpaal')).toBe(true);
    });

    it('telt een import zonder aanroep niet mee', () => {
      // ⚠️ Dit is de vorm die een naïeve tekstzoektocht doorlaat: het scherm
      //    importeert de functie en gebruikt hem nergens. Dan is er nog steeds
      //    geen knop.
      expect(roeptAan("import { wijzigDoel } from '@/modules/goals';", 'wijzigDoel')).toBe(false);
    });

    it('trapt niet in een langere naam die de kortere bevat', () => {
      expect(roeptAan('await wijzigDoelStatus(id)', 'wijzigDoel')).toBe(false);
    });

    it('en laat commentaar met rust', () => {
      expect(roeptAan('/** De knop bij wijzigDoel() ontbrak tot 28-08. */', 'wijzigDoel')).toBe(false);
      expect(roeptAan('// void wijzigDoel(id, patch);', 'wijzigDoel')).toBe(false);
    });

    /**
     * ⚠️ **Dit geval liet de eerste versie door, en het is de vorm die dit
     *    project overal gebruikt.** Een JSX-commentaarblok begint niet met een
     *    sterretje op elke regel; bij het ijken bleven daardoor twee van de drie
     *    gevallen groen terwijl de aanroep eruit was.
     */
    it('telt een JSX-commentaarblok niet mee, ook niet met een waarschuwingsteken', () => {
      const jsx = [
        '{/*',
        '  \u26a0\ufe0f **De knop bij wijzigMijlpaal(), die tot 28-08 ontbrak.**',
        '*/}',
      ].join('\n');

      expect(roeptAan(jsx, 'wijzigMijlpaal')).toBe(false);
    });
  });
});

/** Alle schermbestanden onder `app/`, met hun bron. */
function schermbestanden(
  dir: string,
  uit: { pad: string; bron: string }[] = [],
): { pad: string; bron: string }[] {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) schermbestanden(pad, uit);
    else if (/\.tsx?$/.test(naam)) uit.push({ pad, bron: readFileSync(pad, 'utf8') });
  }
  return uit;
}
