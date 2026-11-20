/**
 * Wat de uitnodigingspagina een bezoeker laat doen — QS8-708.
 *
 * ⚠️ Waarom dit een eigen functie is en geen `if` in het scherm. Een scherm is hier
 *    niet te renderen (de renderopstelling van QS8-714 draait voor één hook, niet voor
 *    schermen), dus alles wat in `app/uitnodiging/[code].tsx` beslist, is onbewaakt. De beslissing hoort hier,
 *    waar de vier gevallen van het issue elk een test hebben.
 *
 * ⚠️ De aanleiding. `join_group_with_code()` geeft voor wie al actief lid is
 *    `ok: true` terug (`on conflict do nothing`, migratie 0204), dus de knop
 *    "Deelnemen" deed voor een bestaand lid niets en leek te slagen. Wie de link
 *    met het verkeerde account opende, kon dat niet zien.
 *
 * ⚠️ Onbekend is "deelnemen aanbieden", niet "al lid". Kan het lidmaatschap niet
 *    gelezen worden, dan is de knop onschadelijk (een no-op voor een lid) en
 *    "Je zit al in deze groep" een bewering die onwaar kan zijn.
 */

export type LidmaatschapStand = 'laden' | 'actief' | 'geen' | 'onbekend';

export type UitnodigingsStand =
  /**
   * De server zegt: deze code werkt niet (meer) — ingetrokken, vervangen, verlopen,
   * nooit bestaan of uitgesloten (0277). Het scherm toont de lege staat van `AsyncView`.
   */
  | { readonly soort: 'ongeldig' }
  /** Geen antwoord: nog niet binnen, of ophalen mislukt. Dat is géén "ongeldig". */
  | { readonly soort: 'uitnodiging-onbekend' }
  | { readonly soort: 'niet-ingelogd' }
  /** Ingelogd, het lidmaatschap wordt nog gelezen: geen knop, geen automatische stap. */
  | { readonly soort: 'controleren' }
  | { readonly soort: 'al-lid'; readonly groupId: string }
  | { readonly soort: 'kan-deelnemen' };

/**
 * Zet wat de lidmaatschapsquery teruggaf om in een stand.
 *
 * ⚠️ Alleen `active` is "al lid". `inactive` geeft de uitnodigingskaart al `null`
 *    (0277) en komt hier dus niet; een andere waarde telt als geen lid.
 */
export function lidmaatschapStand(invoer: {
  /** Is er een groep én een gebruiker om naar te vragen? Zo niet, dan valt er niets te laden. */
  readonly gevraagd: boolean;
  readonly laadt: boolean;
  readonly fout: boolean;
  readonly status: string | null;
  /** Van wie is het antwoord dat er ligt? `null` als er (nog) geen antwoord is. */
  readonly antwoordVan: string | null;
  /** Wie is er nu ingelogd? */
  readonly gebruiker: string | null;
}): LidmaatschapStand {
  if (!invoer.gevraagd) return 'geen';
  if (invoer.laadt) return 'laden';
  // ⚠️ `useAsync` wist zijn antwoord niet als de invoer wisselt. Hoort het
  //    antwoord bij een ander account dan het huidige, dan is het er nog niet.
  if (invoer.antwoordVan !== null && invoer.antwoordVan !== invoer.gebruiker) return 'laden';
  if (invoer.fout) return 'onbekend';
  return invoer.status === 'active' ? 'actief' : 'geen';
}

export function uitnodigingsStand(invoer: {
  /** `null`: de code werkt niet (meer). `undefined`: nog niet binnen of niet op te halen. */
  readonly uitnodiging: { readonly group_id: string } | null | undefined;
  readonly ingelogd: boolean;
  /** Laadt de sessie nog? Dan weten we niet of je ingelogd bent. */
  readonly sessieLaadt: boolean;
  readonly lidmaatschap: LidmaatschapStand;
}): UitnodigingsStand {
  if (invoer.uitnodiging === undefined) return { soort: 'uitnodiging-onbekend' };
  if (invoer.uitnodiging === null) return { soort: 'ongeldig' };
  if (invoer.sessieLaadt) return { soort: 'controleren' };
  if (!invoer.ingelogd) return { soort: 'niet-ingelogd' };

  switch (invoer.lidmaatschap) {
    case 'laden':
      return { soort: 'controleren' };
    case 'actief':
      return { soort: 'al-lid', groupId: invoer.uitnodiging.group_id };
    default:
      return { soort: 'kan-deelnemen' };
  }
}

/**
 * Mag het scherm vanzelf toetreden? Alleen als vaststaat dat je geen lid bent.
 *
 * ⚠️ Elke toetreding kost een poging uit de dagelijkse limiet van twintig, en
 *    voor een lid is hij een no-op die er toch een kost.
 */
export function magAutomatischToetreden(stand: UitnodigingsStand): boolean {
  return stand.soort === 'kan-deelnemen';
}

/** Wat staat er onder de uitnodigingskaart? De enige plek die dit beslist. */
export type Actie = 'binnen' | 'controleren' | 'deelnemen' | 'inloggen' | 'geen';

/**
 * ⚠️ `al-lid` is `geen`: dat staat als kaart bovenaan, vóór de uitleg voor
 *    nieuwkomers. Een `binnen` (net toegetreden) gaat voor alles, ook voor
 *    `controleren`: wie net lid is geworden hoeft niet nog te wachten.
 */
export function actieVoor(stand: UitnodigingsStand, binnen: string | null): Actie {
  if (binnen !== null) return 'binnen';

  switch (stand.soort) {
    case 'controleren':
      return 'controleren';
    case 'kan-deelnemen':
      return 'deelnemen';
    case 'niet-ingelogd':
      return 'inloggen';
    case 'al-lid':
    case 'ongeldig':
    case 'uitnodiging-onbekend':
      return 'geen';
  }
}

/** Zegt de titel dat deze link niet meer werkt? Alleen bij een antwoord, nooit tijdens laden. */
export function titelIsVerlopen(stand: UitnodigingsStand): boolean {
  return stand.soort === 'ongeldig';
}
