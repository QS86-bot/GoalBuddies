// Publieke rand van de module helden.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  held,
  HELDBRONNEN,
  HELDEN,
  HELDSLEUTELS,
  heldVoorTrigger,
  isHeldsleutel,
  isTrigger,
  TRIGGERS,
  type Held,
  type Heldbron,
  type Heldsleutel,
  type Trigger,
} from './helden';

export {
  fetchGroepshelden,
  GROEPSHELDEN_PER_PAGINA,
  type Groepsheldrij,
} from './groepshelden';

export { heldTekstSleutel, type Heldtekst } from './heldteksten';

export {
  AFGEKEURDE_QUOTES,
  alleQuoteSleutels,
  quoteSleutels,
  quoteVoorVerschijning,
  type Quotesleutels,
} from './quotes';

export {
  bewaarHeld,
  heldprofiel,
  laatsteVerschijning,
  type Heldprofiel,
  type HeldUitkomst,
  type Verschijning,
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

export {
  kiesStem,
  magVerschijnen,
  STILTEDREMPEL_DAGEN,
  tegenslagtrigger,
  type Stem,
  type Stemreden,
} from './stem';

export { heldregel, STEMMOMENTEN, type Stemmoment } from './stemteksten';
