import { z } from 'zod';

import { t, type Sleutel } from '../../shared/i18n';

/**
 * Het zes-vragen-interview dat aan de Doelcoach voorafgaat — QS8-37.
 *
 * De zes vragen: meetbaarheid · identiteit · deadline en waarom die datum ·
 * beschikbare uren per week · wat is er al gedaan · waar liep het eerder vast.
 *
 * ⚠️ Elke vraag is overslaanbaar en alles overslaan moet werken. Dat is geen
 *    coulance maar het acceptatiecriterium: wie niets invult krijgt een
 *    generieker resultaat, geen blokkade. Daarom is elk veld nullable en niet
 *    optional — een overgeslagen vraag is een expliciete `null` en geen
 *    ontbrekende sleutel. Dat scheelt bij vraag 3.2 het onderscheid tussen "niet
 *    gevraagd" en "niet beantwoord".
 *
 * ⚠️ `available_hours_per_week` is het enige veld dat een getal is en geen
 *    tekst, en dat is met opzet: de Risico-radar (EPIC 12) rekent ermee. Een
 *    doel van zes maanden bij twee uur per week is een ander doel dan hetzelfde
 *    doel bij twintig uur, en dat verschil is het halve nut van de radar.
 *    `goals_hours_sane` in migratie 0001 begrenst de kolom; deze grenzen lopen
 *    daarmee gelijk.
 */

/** Ruim genoeg voor een eerlijk antwoord, krap genoeg om geen essay te worden. */
export const ANTWOORD_MAX = 1000;

const antwoord = z
  .string()
  .trim()
  .max(ANTWOORD_MAX, { error: `Maximaal ${ANTWOORD_MAX} tekens.` })
  .nullable();

export const interviewSchema = z.object({
  /** 1. Waaraan zie je dat het gelukt is? */
  measurable: antwoord,
  /** 2. Wie word je als dit lukt? Spiegelt naar `goals.identity_statement`. */
  identity: antwoord,
  /** 3. Waarom juist die datum? De datum zelf staat op `goals.target_date`. */
  deadline_reason: antwoord,
  /** 4. Hoeveel uur per week heb je? Spiegelt naar `goals.available_hours_per_week`. */
  hours_per_week: z
    .number()
    .min(0, { error: () => t('validatie.uren_min') })
    .max(168, { error: () => t('validatie.uren_max') })
    .nullable(),
  /** 5. Wat is er al gedaan? */
  already_done: antwoord,
  /**
   * 6. Waar liep het eerder vast?
   *
   * ⚠️ Dit is het gevoeligste veld van het formulier. `goal_interviews` heeft
   *    RLS die uitsluitend de eigenaar toelaat (migratie 0003) en dat moet zo
   *    blijven: dit antwoord gaat per definitie over een eerdere mislukking, en
   *    domeinregel 7 houdt eigen tegenslag privé. Het mag naar de Doelcoach —
   *    die werkt voor jou — en nooit naar de groep.
   */
  stuck_before: antwoord,
});

export type InterviewInvoer = z.infer<typeof interviewSchema>;

/** Een interview waarin alles is overgeslagen. Geldig, en dat is het punt. */
export const LEEG_INTERVIEW: InterviewInvoer = {
  measurable: null,
  identity: null,
  deadline_reason: null,
  hours_per_week: null,
  already_done: null,
  stuck_before: null,
};

/**
 * De zes stappen in de volgorde waarin het scherm ze stelt.
 *
 * ⚠️ **Een functie en geen constante** — QS8-115. Een `const` met `t()` erin
 *    bevriest de taal op importtijd, vóórdat het profiel geladen is. De
 *    vólgorde blijft hier staan: die is het interview zelf en geen tekst.
 */
export function interviewStappen(): readonly {
  readonly veld: keyof InterviewInvoer;
  readonly vraag: string;
  readonly toelichting: string;
}[] {
  return STAP_VELDEN.map((veld) => ({
    veld,
    vraag: t(`interview.${veld}.vraag` as Sleutel),
    toelichting: t(`interview.${veld}.toelichting` as Sleutel),
  }));
}

const STAP_VELDEN = [
  'measurable',
  'identity',
  'deadline_reason',
  'hours_per_week',
  'already_done',
  'stuck_before',
] as const satisfies readonly (keyof InterviewInvoer)[];


/**
 * Heeft dit interview iets bruikbaars opgeleverd?
 *
 * ⚠️ Niet om een leeg interview te weigeren — dat mag juist — maar om 3.2 te
 *    laten kiezen tussen een gerichte en een generieke prompt.
 */
export function heeftAntwoorden(invoer: InterviewInvoer): boolean {
  return Object.values(invoer).some((waarde) => waarde !== null && waarde !== '');
}


/**
 * De twee vragen die `/doel/nieuw` al gesteld heeft — QS8-205.
 *
 * ⚠️ **Dit is de tegenhanger van de spiegeling naar `goals`, en dat is de hele
 *    reden dat het bestaat.** Een interviewantwoord wordt teruggeschreven naar
 *    `goals.identity_statement` en `goals.available_hours_per_week`; de app weet
 *    dus al dat het één ding is. Tot 31-08-2026 liep die weg maar één kant op, en
 *    het gevolg was dat het interview twee vragen stelde die één scherm eerder
 *    al beantwoord waren.
 *
 * ⚠️ **Eén tabel en geen twee lijsten.** De voor de hand liggende vorm was een
 *    lijst hier en een `if` per veld in `spiegelNaarDoel()`, met een test die de
 *    twee tegen elkaar legt. Dat is precies de constructie die in dit project al
 *    drie keer is gaan lekken: twee correcte onderdelen, en een naad die
 *    stilvalt zodra iemand er één bijwerkt. Hier is er niets om uit de pas te
 *    lopen — `spiegelpatch()` en `vulVoorUitDoel()` lezen allebei deze tabel.
 */
export const SPIEGELING = {
  identity: 'identity_statement',
  hours_per_week: 'available_hours_per_week',
} as const;

export type GespiegeldVeld = keyof typeof SPIEGELING;

export const GESPIEGELDE_VELDEN = Object.keys(SPIEGELING) as readonly GespiegeldVeld[];

/** Precies zoveel van een doel als de spiegeling nodig heeft. */
export interface DoelVoorvulling {
  readonly identity_statement: string | null;
  readonly available_hours_per_week: number | null;
}

/**
 * Is dit antwoord gegeven, of overgeslagen?
 *
 * ⚠️ `''` en `null` zijn allebei overgeslagen. Twee functies die dat verschillend
 *    lezen, is precies hoe een naad gaat lekken: de ene schrijft een lege string
 *    weg en de andere vult hem voor.
 */
function gegeven(waarde: string | number | null): boolean {
  if (waarde === null) return false;
  return typeof waarde === 'string' ? waarde.trim() !== '' : true;
}

/**
 * Wat er van een interview naar `goals` gaat.
 *
 * ⚠️ Een overgeslagen vraag overschrijft niets. Wie bij het tweede interview de
 *    urenvraag overslaat, houdt het getal uit het eerste — anders zou overslaan
 *    stilletjes gegevens wissen, en dat is niet wat "overslaan mag" betekent.
 */
export function spiegelpatch(antwoorden: InterviewInvoer): Partial<DoelVoorvulling> {
  const patch: Record<string, string | number> = {};

  for (const veld of GESPIEGELDE_VELDEN) {
    const waarde = antwoorden[veld];
    if (gegeven(waarde)) patch[SPIEGELING[veld]] = waarde as string | number;
  }

  return patch as Partial<DoelVoorvulling>;
}

export interface Voorvulling {
  readonly antwoorden: InterviewInvoer;
  /** Welke velden uit het doel komen in plaats van uit een eerder interview. */
  readonly voorgevuld: readonly GespiegeldVeld[];
}

/**
 * Vult de gespiegelde vragen voor met wat er al op het doel staat.
 *
 * ⚠️ **Een eerder antwoord wint altijd.** Wat de gebruiker in het interview
 *    getypt heeft, is zijn antwoord op déze vraag; de kolom op `goals` is een
 *    afgeleide daarvan. Zou het doel winnen, dan kan een tweede bezoek aan dit
 *    scherm een antwoord overschrijven met een oudere waarde.
 *
 * ⚠️ **Er wordt niets afgerond.** `goals.available_hours_per_week` is
 *    `numeric(4,1)`, dus 6,5 uur is een geldige waarde. Die naar 6 of 7 brengen
 *    om in een invoerveld te passen is gegevens veranderen zonder dat iemand
 *    erom vroeg — het veld moet zich aanpassen, niet de waarde. Zie
 *    `urenUitTekst()` hieronder.
 */
export function vulVoorUitDoel(
  antwoorden: InterviewInvoer,
  doel: DoelVoorvulling,
): Voorvulling {
  const voorgevuld: GespiegeldVeld[] = [];
  const uit: Record<string, unknown> = { ...antwoorden };

  for (const veld of GESPIEGELDE_VELDEN) {
    if (gegeven(antwoorden[veld])) continue;

    const uitDoel = doel[SPIEGELING[veld]];
    if (!gegeven(uitDoel)) continue;

    uit[veld] = uitDoel;
    voorgevuld.push(veld);
  }

  return { antwoorden: uit as InterviewInvoer, voorgevuld };
}

/**
 * Leest een urenantwoord uit wat de gebruiker typt.
 *
 * ⚠️ **Dit bestond niet en dat was tot QS8-205 niet te merken.** Het veld
 *    streepte alles weg wat geen cijfer was (`replace(/[^0-9]/g, '')`), en dat
 *    kon omdat er via het interview nooit een breuk binnenkwam. Maar
 *    `/doel/nieuw` accepteert er wél een — `available_hours_per_week` is
 *    `numeric(4,1)` — en zodra dit scherm die waarde voorvult, verandert
 *    zes-en-een-half uur in vijfenzestig zodra de gebruiker het veld aanraakt.
 *
 *    Elk onderdeel klopte; de naad tussen de twee schermen lekte. Precies de
 *    vorm uit regel 18.
 *
 * ⚠️ Komma én punt, want een Nederlandstalig toetsenbord geeft een komma.
 */
export function urenUitTekst(tekst: string): number | null {
  const schoon = tekst.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  if (schoon === '') return null;

  // ⚠️ Alleen het eerste scheidingsteken telt. "6.5.5" is geen getal, en
  //    `Number()` geeft daar `NaN` op — dat mag nooit als antwoord landen.
  const [heel, ...rest] = schoon.split('.');
  const samen = rest.length === 0 ? heel : `${heel}.${rest.join('')}`;

  const waarde = Number(samen);
  return Number.isFinite(waarde) ? waarde : null;
}

/**
 * Wat de vragenlijst uit de onboarding al beantwoord heeft — QS8-257.
 *
 * ⚠️ **Twee tabellen en niet één, want er zijn twee soorten overlap.** QS8-205
 *    loste dubbel vragen op met één tabel, omdat daar élk gespiegeld veld
 *    dezelfde vorm had aan beide kanten. Hier niet:
 *
 *    - **`hours_per_week` is echt voor te vullen.** Een getal uit een getal, via
 *      één gedocumenteerde omrekening (`urenPerWeekUitMinuten`). Wat er in het
 *      veld komt, is wat de gebruiker zelf gezegd heeft, in een andere eenheid —
 *      en het scherm laat die omrekening zien.
 *
 *    - **`stuck_before` is dat níét.** Daar staat aan de ene kant een lijstje
 *      aangevinkte valkuilen en aan de andere kant vrije tekst. Die omzetten zou
 *      betekenen dat de app een zin schríjft en hem opslaat alsof de gebruiker
 *      hem getypt heeft. Dat is erger dan de vraag nog een keer stellen.
 *
 *      Dus: tonen wat er al ligt, en het veld leeg laten voor wat iemand wil
 *      toevoegen. De vraag wordt daarmee één keer gesteld — met zijn eerdere
 *      antwoord ernaast — en niet twee keer blanco.
 *
 * ⚠️ Zou dit één tabel zijn met een `if` per veld, dan is dat precies de
 *    constructie waar QS8-205 vanaf is gestapt. Twee tabellen met elk één regel
 *    en een test die zegt dat ze elkaar niet overlappen, is de vorm die niet uit
 *    de pas kan lopen.
 */
export const PROFIELSPIEGELING = {
  hours_per_week: 'minutes_per_day',
} as const;

export const PROFIELCONTEXT = {
  stuck_before: 'what_breaks_it',
} as const;

export type ProfielGespiegeldVeld = keyof typeof PROFIELSPIEGELING;
export type ProfielContextVeld = keyof typeof PROFIELCONTEXT;

/** Precies zoveel van een profiel als de spiegeling nodig heeft. */
export interface ProfielVoorvulling {
  readonly minutes_per_day: number | null;
  readonly what_breaks_it: readonly string[] | null;
}

export interface ProfielInvulling {
  readonly antwoorden: InterviewInvoer;
  /** Velden die met een waarde uit het profiel gevuld zijn. */
  readonly voorgevuld: readonly ProfielGespiegeldVeld[];
  /** Velden waar het profiel iets over weet, zonder het in te vullen. */
  readonly context: Readonly<Partial<Record<ProfielContextVeld, readonly string[]>>>;
}

/**
 * Vult het interview aan met wat de vragenlijst al weet.
 *
 * ⚠️ **Een eerder antwoord wint altijd**, net als in `vulVoorUitDoel()`. Wat de
 *    gebruiker in het interview getypt heeft, is zijn antwoord op déze vraag.
 *
 * @param urenUitMinuten de omrekening, meegegeven en niet geïmporteerd — anders
 *   hangt dit bestand aan `vragenlijst-schemas.ts` en die aan dit bestand.
 */
export function vulVoorUitProfiel(
  antwoorden: InterviewInvoer,
  profiel: ProfielVoorvulling,
  urenUitMinuten: (minuten: number | null) => number | null,
): ProfielInvulling {
  const uit: Record<string, unknown> = { ...antwoorden };
  const voorgevuld: ProfielGespiegeldVeld[] = [];

  if (!gegeven(antwoorden.hours_per_week)) {
    const uren = urenUitMinuten(profiel.minutes_per_day);
    if (uren !== null) {
      uit.hours_per_week = uren;
      voorgevuld.push('hours_per_week');
    }
  }

  const valkuilen = profiel.what_breaks_it ?? [];

  return {
    antwoorden: uit as InterviewInvoer,
    voorgevuld,
    // ⚠️ Context ook als het veld al ingevuld is: het is geen voorvulling maar
    //    een herinnering aan wat je eerder zei, en die is dan juist nuttig.
    context: valkuilen.length > 0 ? { stuck_before: valkuilen } : {},
  };
}
