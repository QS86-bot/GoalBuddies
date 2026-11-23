import { describe, expect, it } from 'vitest';

import { en } from './en';
import { nl } from './nl';

/**
 * Geen onzichtbaarheidsbelofte die de app niet waar kan maken — besluit A41.
 *
 * ⚠️ **Dit is het gat dat de critical-user-ronde van 24-08 vond, en het is de
 *    zuiverste vorm van onwrikbare regel 18 die dit project tot nu toe heeft
 *    opgeleverd.** EPIC 13 liet `weekly_goals_select` per groep variëren, met
 *    tests in beide standen. Wat níemand toetste, was de *zin* die de gebruiker
 *    leest op het moment dat hij toestemming geeft:
 *
 *      `koppel.uitleg` — "Koppelen deelt de titel en je mijlpaalvoortgang —
 *      niet je notities, **niet je weken** en niet je punten."
 *
 *    Die zin stond boven de koppelknop en was vanaf migratie 0077 onwaar in een
 *    open groep: koppelen deelt daar élke weekdoelrij, inclusief `missed` en
 *    `carried`. De policy klopte, de zin klopte voor een beschermde groep, en de
 *    combinatie was van niemand.
 *
 * ⚠️ **Waarom een allowlist en geen verbod.** De geruststelling ís waardevol —
 *    hij is de reden dat iemand zijn doel durft te koppelen. Weghalen kost
 *    product. Wat niet mag, is hem *onvoorwaardelijk* doen. Elke sleutel
 *    hieronder draagt daarom de reden waarom hij waar blijft; komt er een zevende
 *    bij zonder reden, dan wordt deze test rood en moet iemand nadenken.
 *
 *    Zelfde vorm en zelfde doel als `VERBODEN_GEBEURTENISSEN` in
 *    `chat-schemas.ts`: een lijst die bestaat om een test rood te maken, zodat
 *    niemand de regel hoeft te ónthouden.
 */

/**
 * Zinnen die beloven dat iets onzichtbaar is voor anderen.
 *
 * ⚠️ Bewust breed. Een patroon dat te veel vangt kost één regel in de lijst
 *    hieronder; een patroon dat te weinig vangt kost het vertrouwen van een
 *    gebruiker die dacht dat zijn gemiste week privé was.
 */
const ONZICHTBAARHEID = [
  /niemand[^.]{0,40}ziet/i,
  /ziet niemand/i,
  /niet je weken/i,
  /blijft priv/i,
  /nobody[^.]{0,40}sees/i,
  /no one[^.]{0,40}sees/i,
  /not your weeks/i,
  // QS8-798: de herschreven vorm noemt de week niet meer als geheel maar de gemiste week.
  /niet een gemiste/i,
  /not a missed/i,
  /stays? private/i,
  // ⚠️⚠️ **De vier vormen hieronder ontbraken, en dat is gemeten en geen
  //    vermoeden.** De doorlichting van 09-09-2026 vond vier sleutels met een
  //    privacybelofte die dit register nooit gezien had, waaronder
  //    `coach.alleen_voor_jou` — en díe was aantoonbaar onwaar (QS8-392). De
  //    meest gebruikelijke Nederlandse formulering, *"alleen jij"*, stond er
  //    domweg niet bij. Een register dat de gangbaarste vorm niet herkent,
  //    bewaakt de zinnen die er toevallig anders staan.
  // ⚠️ `alleen jij ziet` en niet `alleen jij`: dat tweede matcht ook *"Alleen
  //    jij kunt je eigen goedkeuring intrekken"*, en dat is een bevoegdheid en
  //    geen zichtbaarheidsbelofte. Dit register gaat over wie iets zíet, niet
  //    over wie iets mág — een zeef die dat door elkaar haalt, meldt zinnen
  //    waar niemand iets aan hoeft te doen, en dat is precies hoe je leert hem
  //    te negeren.
  /alleen jij (ziet|leest)/i,
  /alleen voor jou/i,
  /ziet .{0,25}nooit/i,
  // ⚠️⚠️ **De passieve vorm, en die ontbrak — QS8-233.** `/ziet .{0,25}nooit/`
  //    vangt *"je groep ziet dit nooit"* en niet *"dit is er nooit te zien"*,
  //    terwijl die tweede in het Nederlands minstens zo gewoon is. 📏 Gemeten op
  //    05-10-2026 over beide catalogi: twee sleutels gebruiken hem, en
  //    `radar.alleen_jij` werd alleen gevangen doordat hij óók *"alleen jij
  //    ziet"* zegt. Eén sleutel hing er dus volledig buiten.
  //
  //    Dat is dezelfde klasse als de vier vormen hierboven: het register bewaakte
  //    de zinnen die er toevallig in de actieve vorm stonden.
  /nooit te zien/i,
  /never visible/i,
  // ⚠️ `only you\b` en niet `only you`: dat tweede matcht ook *"only your
  //    group members"*, en dat is een scope-belofte en geen
  //    onzichtbaarheidsbelofte. Die vangen we hieronder apart, zodat het
  //    patroon zegt wat het bedoelt in plaats van per ongeluk raak te schieten.
  /only you (see|read)/i,
  /never sees/i,
  /alleen je groepsgenoten/i,
  /only your group/i,
];

/**
 * De sleutels die zo'n belofte mógen doen, met de reden erbij.
 *
 * ⚠️ De reden is niet decoratief: hij is wat een volgende lezer moet nalopen
 *    zodra er een oppervlak opengaat. Staat er "alleen in een beschermde groep",
 *    dan moet het scherm dat ook echt afdwingen.
 */
const TOEGESTAAN: Readonly<Record<string, string>> = {
  'zichtbaarheid.beschermd_uitleg':
    'QS8-798, variant B (besluit Quinten 23-11-2026). De zin belooft alleen wat de database in een ' +
    'beschermde groep dichthoudt: gemiste, doorgeschoven, geannuleerde en vrijgestelde weken ' +
    '(`weekly_goals_select`, rij 3 in 002; getoetst in `tests/rls/epic13.test.ts`) en je persoonlijke ' +
    'totaal (`points_ledger` eigenaar-only, A42). Wat wél zichtbaar is staat erbij: lopende en ' +
    'goedgekeurde weken, en met een klassement (A57, `groep_klassement()`) de in die groep verdiende ' +
    'punten. De zin is bewust niet gesplitst: hij geldt alleen voor de beschermde keuze en de open ' +
    'tegenhanger is `zichtbaarheid.open_uitleg`.',
  'belofte.bevestig_wie':
    'QS8-761. De zin gaat over de eigen weekbelofte en is onvoorwaardelijk waar, ook in een open ' +
    'groep: `commitments_select` geeft de begunstigde pas leesrecht vanaf `due` en kijkt niet naar ' +
    '`groups.zichtbaarheid` (rij 61 in 002: beschermd en open geven hetzelfde), en ' +
    '`straffen_bij_uitstelverzoek()` slaat een belofte over (0312). Getoetst met een tweede JWT in ' +
    '`tests/rls/weekbelofte-aangaan.test.ts` (criterium 4). Geen `_open`-tegenhanger nodig.',
  'prestaties.ingang_uitleg':
    'QS8-735. De zin gaat over het eigen Prestatiescherm en is onvoorwaardelijk waar, ook in een ' +
    'open groep: `badges_select` en `xp_grootboek` zijn eigenaar-only (`user_id = auth.uid()`, ' +
    'geen groepstak), en geen groepscomponent kan het scherm importeren ' +
    '(`tests/beloftes/prestaties-blijven-voor-jezelf.test.ts`). Er is geen `_open`-tegenhanger ' +
    'nodig, want er is geen groepsoppervlak dat varieert.',
  'prestaties.privacy':
    'QS8-735. De zin gaat over het eigen Prestatiescherm en is onvoorwaardelijk waar, ook in een ' +
    'open groep: `badges_select` en `xp_grootboek` zijn eigenaar-only (`user_id = auth.uid()`, ' +
    'geen groepstak), en geen groepscomponent kan het scherm importeren ' +
    '(`tests/beloftes/prestaties-blijven-voor-jezelf.test.ts`). Er is geen `_open`-tegenhanger ' +
    'nodig, want er is geen groepsoppervlak dat varieert.',
  'demping.privacy':
    'QS8-752. De zin gaat over de eigen demping en is onvoorwaardelijk waar, ook in een open ' +
    'groep: `groep_demping` heeft vier policies op `user_id = (select auth.uid())` zonder ' +
    'groepstak, er komt geen systeembericht en geen kolom op `group_members` ' +
    '(`tests/beloftes/een-gedempte-groep-belt-niet.test.ts`, `tests/rls/groep-demping.test.ts`). ' +
    'Er is geen `_open`-tegenhanger nodig, want geen groepsoppervlak varieert.',
  'klassement.uitnodiging_weg_uitleg':
    'QS8-784. "Alleen voor jou" gaat over de eigen wegklik en is onvoorwaardelijk waar, ook in een open ' +
    'groep: `klassement_uitnodiging_weg` heeft vier policies op `user_id = (select auth.uid())` zonder ' +
    'groepstak, geen bericht en geen `group_events`-rij (`tests/rls/klassement-uitnodiging-weg.test.ts`). ' +
    'Er is geen `_open`-tegenhanger nodig, want geen groepsoppervlak varieert.',
  'buddyzoek.bevestig_bescherming':
    'QS8-233. De zin geldt onvoorwaardelijk omdat een automatisch gevormde groep ' +
    'niet open kán worden: `groups_automatisch_is_beschermd` is een CHECK, en de ' +
    'derde pin in `guard_group_update()` houdt `automatisch` zelf vast. Daarom is ' +
    'hier géén `_open`-tegenhanger nodig — en daarom heet hij ook niet ' +
    '`_beschermd`: die naam betekent in dit project "het scherm kiest per groep", ' +
    'en dat is precies wat hier niet gebeurt. De zin belooft sinds 19-11-2026 ' +
    'alleen een gemiste week en een achterstand: de huidige reeks is zichtbaar voor ' +
    'de groep (A15, 002), en de tekst zegt dat nu. 📏 Geijkt als `service_role`: ' +
    '`zichtbaarheid = open` en `ontdekbaar = true` geven beide een 23514, en een ' +
    'beheerder die `automatisch` patcht krijgt de raise uit de guard.',
  'buddyzoek.bevestig_stoppen':
    'QS8-233. "Niemand ziet het" gaat over uit de wáchtrij stappen, en die belofte ' +
    'staat los van `groups.zichtbaarheid` — je bent op dat moment nog in geen ' +
    'enkele groep. 📏 Gemeten: `goal_match_queue_select` is `user_id = auth.uid()` ' +
    'en een ander krijgt nul rijen; `zoek_buddies_uit()` zet alleen status en ' +
    '`decided_at`, en boekt geen punt, plaatst geen `group_events`-rij en geen ' +
    'chatbericht. Dat is acceptatiecriterium 11 van het issue, en het is de reden ' +
    'dat er geen bevestiging om die knop zit: wie eruit wil, wil eruit.',
  'koppel.uitleg_beschermd':
    'Wordt alleen getoond als groups.zichtbaarheid = beschermd; app/groep/[id].tsx kiest. QS8-798: ' +
    'de zin leunt op `weekly_goals_select` (status <> all(missed, carried, cancelled, excused), ' +
    '0321) en op het persoonlijke totaal (`points_ledger` eigenaar-only, A42); het klassement ' +
    '(A57) staat er als wél zichtbaar bij.',
  'koppel.uitleg_open':
    'De belofte gaat hier over níét koppelen, en die geldt in beide standen. De zin zegt ' +
    'daarna expliciet dat koppelen je weken wél deelt.',
  'deling.uitleg_beschermd':
    'Staat op het doelscherm bij één specifieke groep en wordt alleen gekozen als die groep ' +
    'beschermd is; app/doel/[id].tsx kiest per groep, niet één keer boven de lijst. Een doel ' +
    'kan in een open én een beschermde groep tegelijk staan. QS8-798: zelfde grendels als ' +
    '`koppel.uitleg_beschermd` (`weekly_goals_select` 0321, A42, klassement A57).',
  'uitnodiging.uitleg_missen_beschermd':
    'Wordt alleen getoond als de uitnodiging een beschermde groep betreft; ' +
    'app/uitnodiging/[code].tsx kiest op invite_preview().zichtbaarheid.',
  'onboarding.stap4.b':
    'Hier is nog geen groep. De zin noemt de voorwaarde zelf ("in een beschermde groep — ' +
    'de standaard") in plaats van een belofte te doen die later gebroken wordt.',
  'lijst.prive_uitleg':
    '⚠️ **Herschreven op 09-09-2026 toen QS8-381 delen bouwde, en deze test was ' +
    'wat dat afdwong.** De zin luidde *"niemand in je groep ziet je taken. Delen ' +
    'kan nog niet"* — onvoorwaardelijk waar toen `todo_items` eigenaar-only was ' +
    '(0227), en onwaar op de dag dat er een deelknop kwam. Precies de val die ' +
    '`koppel.uitleg` in EPIC 13 was: de policy bewoog en de zin niet. ' +
    'Nu draagt hij de voorwaarde zelf: *een taak is prive tot je hem zelf deelt*. ' +
    '📏 De grendel eronder is `todo_items_select`, die een groepsgenoot alleen ' +
    'de rijen geeft met `visibility = group` én een `shared_group_id` waar hij ' +
    'lid van is — gemeten met een kaal API-verzoek in `tests/rls/taak-delen.test.ts`.',
  'lijst.deel_uitleg':
    'Staat boven de deelknop en geldt per taak. De belofte is *de rest van je ' +
    'lijst blijft prive*, en die is smaller dan hij lijkt: `todo_items_select` ' +
    'geeft per rij toegang op `shared_group_id`, dus een taak die je niet deelt ' +
    'valt buiten élke groepstak. ⚠️ **Hij noemt bewust "de groep die je kiest" ' +
    'en niet "je groep".** Wie in twee groepen zit, deelt met één ervan (variant ' +
    'B2, QS8-381); een zin die dat verzwijgt zou de andere groep impliciet ' +
    'meenemen. **Wordt onwaar zodra delen ooit meer dan één groep tegelijk kan.**',
  'coach.alleen_voor_jou':
    'Waar sinds migratie 0236. Was het niet: goals_select gaf een groepsgenoot de héle rij, ' +
    'inclusief identity_statement — gemeten, met de zin woordelijk terug op het scherm van ' +
    'een ander (QS8-392). authenticated heeft nu een kolomgrant zonder die kolom, en de ' +
    'eigenaar leest hem via de view mijn_doelvelden. Grendel: tests/rls/doelkolommen.test.ts.',
  'radar.alleen_jij':
    'goal_risk is eigenaar-only sinds migratie 0050 — dezelfde reparatie als hierboven, toen ' +
    'op risk_status. Geen enkele policy geeft een groepsgenoot een rij uit die tabel.',
  'overzicht.punten_prive':
    'points_ledger is eigenaar-only (domeinregel 10). De enige uitzondering is ' +
    'groep_klassement() (sinds A57 aan `klassement_aan` en niet meer aan open), en die geeft wat je in díe groep verdiend hebt — ' +
    'geen totaal, geen delta, geen datum, en cycle_missed boekt zonder group_id.',
  'melden.niet_zichtbaar':
    'reports_select geeft de rij aan de melder en aan een beheerder die niet zelf het ' +
    'onderwerp is. De gemelde persoon staat in geen van beide takken. ⚠️ Niet nagemeten in ' +
    'de ronde van 09-09; staat als open vraag in docs/ENGINEER-REVIEW.md.',
  'avatar.grens':
    'Een scope-belofte en geen onzichtbaarheidsbelofte, en hij is waar. 📏 Gemeten: ' +
    'avatars_select is (eigen map) OR shares_group_with_user(<uid uit het pad>), dus precies ' +
    'je groepsgenoten en niemand anders. De bucket is privé; er gaan ondertekende URLs uit.',
  'commitmentspoor.leeg_tekst':
    'Waar. 📏 Gemeten: commitment_events_select eist dat het commitment aan een doel hangt ' +
    'waarvan jij de eigenaar bent — één tak, geen groepstak. De begunstigde groep leest het ' +
    'commitment zelf pas vanaf unlocked/due/resolved en het spoor nooit.',
  'interview.stuck_before.toelichting':
    'Zelfde onderwerp en zelfde reparatie als coach.alleen_voor_jou: het antwoord staat in ' +
    'goal_interviews (eigenaar-only, één policy met alleen een eigenaarstak) en de twee ' +
    'velden die naar goals gespiegeld worden zijn sinds migratie 0236 niet meer leesbaar ' +
    'voor een groepsgenoot.',
  'vindbaar.wat_niet':
    'Waar, en nagemeten in plaats van aangenomen. De zin belooft dat doelen, reeks, punten, ' +
    'groepen en weken dicht blijven voor wie geen groep met je deelt. zoek_mensen() geeft ' +
    'precies drie kolommen — id, display_name, avatar_url — en is een SECURITY DEFINER met ' +
    'een expliciete kolomlijst, geen tak op profiles_select. 📏 De naadtest in ' +
    'tests/rls/vindbaar-buiten-je-groep.test.ts voert een gevonden id door goals, ' +
    'daily_moves, completions, points_ledger, group_members, user_streaks, chain_links en ' +
    'profiles en eist overal nul. ⚠️ groups.zichtbaarheid raakt dit oppervlak niet: A41 gaat ' +
    'over wat leden van elkaar zien, en de kijker is hier per definitie geen lid — de zin is ' +
    'dus in beide standen waar en hoeft niet gesplitst.',
  'vragenlijst.gevoel.toelichting':
    'Zelfde reden en zelfde meting als vragenlijst.gevoel.eigen_hint: profiles.feeling en ' +
    'profiles.feeling_own zijn voor geen enkele groepsgenoot leesbaar, in een open én een ' +
    'beschermde groep (tests/rls/gevoel.test.ts, QS8-733).',
  'vragenlijst.voorbeeld.toelichting':
    'De nudge gaat alleen naar de apparaten van de eigenaar (push_tokens van user_id = ' +
    'profiel.id, supabase/functions/notificaties) en noemt geen groep, naam of aantal; ' +
    'nudgeBericht() is dezelfde functie als die het voorbeeld tekent. Het is geen ' +
    'zichtbaarheid-van-andermans-gegevens-belofte maar "voor jou alleen", en waar in elke groep.',
  'vragenlijst.gevoel.eigen_hint':
    'Waar, en nagemeten in plaats van aangenomen. profiles.feeling en profiles.feeling_own ' +
    'staan in geen enkele select-grant voor authenticated (alleen id, display_name en ' +
    'avatar_url zijn leesbaar) en komen alleen via mijn_profiel bij de eigenaar; ze zijn ' +
    'niet afhankelijk van groups.zichtbaarheid. De eigen tekst komt bovendien in geen enkele ' +
    'melding (nudgeBericht() krijgt alleen de sleutel). tests/rls/gevoel.test.ts (QS8-733).',
  'straf.team.wanneer':
    'Gelezen in de migraties, niet in productie gemeten. De zin belooft dat een straf op een ' +
    'teamaandeel pas zichtbaar wordt als hij verschuldigd is. commitments_select geeft de ' +
    'begunstigde groep leesrecht pas vanaf unlocked/due/resolved, en getuigenissen() (0169, ' +
    '0293) geeft een getuige hetzelfde. commitment_zichtbaar_voor_groep() verandert in 0325 ' +
    'niet; bewaak_teamstraf() raakt alleen de keuze van de begunstigde, niet de leesroute. ' +
    'Dat geldt in een open groep net zo, want de leesroute kijkt niet naar groups.zichtbaarheid. ' +
    'Bij een teamaandeel is dat de bedoelde reden voor de straf-rol van een teamgroep (besluit 29, ' +
    'QS8-698).',
  'straf.tot_dan':
    'Een commitment vóór de deadline. Oppervlak 20 is in EPIC 13 bewust niet opengezet: ' +
    'commitments_select geeft de begunstigde groep pas leesrecht vanaf unlocked/due/resolved. ' +
    'Zie beslisdocument 002 §6b.',
};

/** Elke sleutel met een onzichtbaarheidsbelofte, in beide catalogi. */
function beloftes(): readonly string[] {
  const gevonden = new Set<string>();

  for (const catalogus of [nl, en] as const) {
    for (const [sleutel, zin] of Object.entries(catalogus)) {
      if (ONZICHTBAARHEID.some((p) => p.test(zin))) gevonden.add(sleutel);
    }
  }

  return [...gevonden].sort();
}

describe('onzichtbaarheidsbeloftes', () => {
  it('doet er geen enkele zonder dat iemand er een reden bij heeft gezet', () => {
    // ⚠️ Wordt deze rood, voeg dan niet blind een regel aan `TOEGESTAAN` toe.
    //    De vraag is eerst: is deze zin waar in een ópen groep? Zo niet, dan
    //    hoort hij gesplitst te worden in een `_beschermd` en een `_open`, en
    //    moet het scherm kiezen op `groups.zichtbaarheid`.
    for (const sleutel of beloftes()) {
      expect(TOEGESTAAN[sleutel], `${sleutel} belooft onzichtbaarheid zonder reden`).toBeTypeOf(
        'string',
      );
    }
  });

  it('houdt de lijst schoon: geen reden voor een sleutel die niets belooft', () => {
    // Anders groeit `TOEGESTAAN` uit tot een lijst waar niemand meer doorheen
    // kijkt, en dan bewaakt de test niets meer.
    const gevonden = new Set(beloftes());

    for (const sleutel of Object.keys(TOEGESTAAN)) {
      expect(gevonden.has(sleutel), `${sleutel} staat in TOEGESTAAN maar belooft niets`).toBe(true);
    }
  });

  it('geeft elke beschermde variant een open tegenhanger, in beide talen', () => {
    // ⚠️ Een `_beschermd` zonder `_open` betekent dat het scherm in een open
    //    groep terugvalt op... niets. Dat is precies de toestand van vóór deze
    //    reparatie, alleen met een langere sleutelnaam.
    for (const sleutel of Object.keys(nl)) {
      if (!sleutel.endsWith('_beschermd')) continue;

      const open = sleutel.replace(/_beschermd$/, '_open');
      expect(nl, `${open} ontbreekt in nl`).toHaveProperty(open);
      expect(en, `${open} ontbreekt in en`).toHaveProperty(open);
    }
  });

  it('laat de open variant niet dezelfde belofte doen als de beschermde', () => {
    // De hele reparatie is dat ze verschillen. Een copy-paste die de zin
    // ongemoeid laat, is geen reparatie.
    for (const sleutel of Object.keys(nl)) {
      if (!sleutel.endsWith('_beschermd')) continue;

      const open = sleutel.replace(/_beschermd$/, '_open');
      expect(nl[open as keyof typeof nl], sleutel).not.toBe(nl[sleutel as keyof typeof nl]);
    }
  });
});

describe('wat Beschermd belooft en wat het niet belooft (QS8-798, A57)', () => {
  // De belofte is een eigenschap van het geheel: sleutel én catalogus, in beide talen.
  // Niet het schermbestand: dat kiest alleen welke sleutel getoond wordt.
  // Afgeleid en niet vast: een nieuwe `_beschermd`-sleutel valt zo vanzelf onder de eisen.
  // Alleen de uitlegzinnen, niet knoppen als `beheer.naar_beschermd`. `uitnodiging.uitleg_missen_beschermd` gaat over een gemiste week, niet over wat de groep ziet.
  const GEEN_ZICHTBAARHEIDSTEKST = new Set(['uitnodiging.uitleg_missen_beschermd']);
  const BESCHERMD = [
    'zichtbaarheid.beschermd_uitleg',
    ...Object.keys(nl).filter((k) => k.endsWith('uitleg_beschermd') && !GEEN_ZICHTBAARHEIDSTEKST.has(k)),
  ] as (keyof typeof nl & keyof typeof en)[];

  it('belooft nergens meer "niet je weken" of "niet je punten", in geen enkele sleutel', () => {
    // Sinds 0077 zijn lopende en goedgekeurde weken leesbaar voor een lid, en sinds A57
    // (0333) heeft ook een beschermde groep een klassement.
    for (const [taal, catalogus] of [['nl', nl], ['en', en]] as const) {
      for (const [sleutel, zin] of Object.entries(catalogus)) {
        // "Een pas beschermt je reeks, niet je punten" gaat over iets anders en is waar.
        if (/^(weekpas\.uitleg|tellers\.label_vangnet)/.test(sleutel)) continue;
        expect(zin, `${taal}:${sleutel}`).not.toMatch(
          /niet je weken|niet je punten|not your weeks|not your points|je punten blijven van jou|your points stay yours/i,
        );
      }
    }
  });

  it('noemt in elke beschermde tekst het klassement, in beide talen', () => {
    for (const sleutel of BESCHERMD) {
      expect(nl[sleutel], `nl:${sleutel}`).toMatch(/klassement/i);
      expect(en[sleutel], `en:${sleutel}`).toMatch(/leaderboard/i);
    }
  });

  it('noemt in elke beschermde tekst dat lopende en goedgekeurde weken zichtbaar zijn', () => {
    for (const sleutel of BESCHERMD) {
      expect(nl[sleutel], `nl:${sleutel}`).toMatch(/lopende en goedgekeurde weken/i);
      expect(en[sleutel], `en:${sleutel}`).toMatch(/current and approved weeks/i);
    }
  });

  it('zegt in elke beschermde tekst dat de groep je huidige reeks ziet, ook als die op nul staat', () => {
    // A15, rij 2 in 002: `group_visible_streaks` geeft `current_streak` ook in een beschermde groep.
    for (const sleutel of BESCHERMD) {
      expect(nl[sleutel], `nl:${sleutel}`).toMatch(/huidige reeks/i);
      expect(nl[sleutel], `nl:${sleutel}`).toMatch(/op nul staat, ziet de groep wel/i);
      expect(en[sleutel], `en:${sleutel}`).toMatch(/current streak/i);
      expect(en[sleutel], `en:${sleutel}`).toMatch(/streak that stands at zero/i);
    }
  });

  it('zegt op het nieuw-groep- en uitnodigingsscherm dat het klassement standaard aan staat en uit kan', () => {
    // Besluit Quinten 23-11-2026; 0336 zet het aan voor elke nieuwe groep zonder organisatie.
    for (const sleutel of ['groepnieuw.klassement_standaard', 'uitnodiging.klassement_standaard'] as const) {
      expect(nl[sleutel], `nl:${sleutel}`).toMatch(/klassement/i);
      expect(nl[sleutel], `nl:${sleutel}`).toMatch(/beheerder/i);
      expect(en[sleutel], `en:${sleutel}`).toMatch(/leaderboard/i);
      expect(en[sleutel], `en:${sleutel}`).toMatch(/admin/i);
    }
  });

  it('zegt op de uitnodiging de echte stand, aan of uit, en dat een gemiste week er nooit in staat (QS8-801)', () => {
    // 0341: `invite_preview()` geeft `klassement_aan`. Wie uit leest, hoort ook te weten dat aanzetten
    // de punten van daarvóór meeneemt: `points_ledger` bewaart de group_id altijd (A57).
    expect(nl['uitnodiging.klassement_aan']).toMatch(/staat het klassement aan/i);
    expect(en['uitnodiging.klassement_aan']).toMatch(/leaderboard on/i);
    expect(nl['uitnodiging.klassement_uit']).toMatch(/staat het klassement uit/i);
    expect(en['uitnodiging.klassement_uit']).toMatch(/leaderboard off/i);
    expect(nl['uitnodiging.klassement_uit']).toMatch(/ook die van daarvóór/i);
    expect(en['uitnodiging.klassement_uit']).toMatch(/including points from before/i);
    for (const sleutel of ['uitnodiging.klassement_aan', 'uitnodiging.klassement_uit'] as const) {
      expect(nl[sleutel], `nl:${sleutel}`).toMatch(/gemiste week komt er nooit in voor/i);
      expect(en[sleutel], `en:${sleutel}`).toMatch(/missed week never appears/i);
    }
  });

  it('zegt bij een teamgroep dat er geen klassement is, en belooft niet dat het later aan kan (QS8-801)', () => {
    // CHECK `groups_team_geen_klassement`: aanzetten kan in een teamgroep nooit (grens 1).
    expect(nl['uitnodiging.klassement_team']).toBe('Deze groep heeft geen klassement.');
    expect(en['uitnodiging.klassement_team']).toBe('This group has no leaderboard.');
    expect(nl['uitnodiging.klassement_team']).not.toMatch(/later|aanzetten|beheerder/i);
    expect(en['uitnodiging.klassement_team']).not.toMatch(/later|turn|admin/i);
  });

  it('houdt de persoonlijke totaaltelling privé en zegt dat ook', () => {
    for (const sleutel of BESCHERMD) {
      expect(nl[sleutel], `nl:${sleutel}`).toMatch(/persoonlijke (puntentotaal|totaal)/i);
      expect(en[sleutel], `en:${sleutel}`).toMatch(/personal (point )?total/i);
    }
  });

  it('noemt het klassement nergens een puntentotaal van elkaar', () => {
    // Het klassement toont punten die in díe groep verdiend zijn (A54/A57), geen totaal.
    for (const sleutel of Object.keys(nl)) {
      expect(nl[sleutel as keyof typeof nl], `nl:${sleutel}`).not.toMatch(/elkaars puntentotaal/i);
      expect(en[sleutel as keyof typeof en], `en:${sleutel}`).not.toMatch(
        /each other.s point totals?/i,
      );
    }
  });
});

describe('de bevestiging bij het zoeken van buddy’s (QS8-233, security-review PR #700)', () => {
  // De groep leest je streefdatum en je huidige reeks (A15, 002). Wat de tekst
  // vóór de bevestigknop belooft, mag daar niet onder zitten.
  it('noemt wat onbekenden wél lezen: de streefdatum en de reeks', () => {
    expect(nl['buddyzoek.bevestig_onbekenden']).toMatch(/streefdatum/i);
    expect(en['buddyzoek.bevestig_onbekenden']).toMatch(/target date/i);
    expect(nl['buddyzoek.bevestig_bescherming']).toMatch(/huidige reeks ziet de groep wel/i);
    expect(en['buddyzoek.bevestig_bescherming']).toMatch(/does see your current streak/i);
  });

  it('belooft niet dat een verbroken reeks onzichtbaar is', () => {
    expect(nl['buddyzoek.bevestig_bescherming']).not.toMatch(/verbroken reeks/i);
    expect(en['buddyzoek.bevestig_bescherming']).not.toMatch(/broken streak/i);
  });
});
