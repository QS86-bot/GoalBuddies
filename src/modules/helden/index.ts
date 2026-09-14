// Publieke rand van de module helden.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  held,
  HELDBRONNEN,
  HELDEN,
  HELDSLEUTELS,
  heldTekstSleutel,
  heldVoorTrigger,
  isHeldsleutel,
  isTrigger,
  TRIGGERS,
  type Held,
  type Heldbron,
  type Heldsleutel,
  type Heldtekst,
  type Trigger,
} from './helden';

export {
  AFGEKEURDE_QUOTES,
  alleQuoteSleutels,
  quoteSleutels,
  type Quotesleutels,
} from './quotes';

export {
  bewaarHeld,
  heldprofiel,
  type Heldprofiel,
  type HeldUitkomst,
} from './heldprofiel';

export {
  GEEN_HELDANTWOORDEN,
  heldkeuze,
  heldoptieTekstSleutel,
  heldScores,
  HELDVRAAGOPTIES,
  HELDVRAGEN,
  heldvraagTekstSleutel,
  koplopers,
  teBewarenHeld,
  type Heldantwoorden,
  type Heldkeuze,
  type Heldvraag,
} from './quiz';
