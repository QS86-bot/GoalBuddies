// Publieke rand van de module todos — De Lijst.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  TAAK_MAX,
  TAAK_MIN,
  VOLGORDE_MAX,
  taakInvoerSchema,
  taakPatchSchema,
  type TaakInvoer,
  type TaakPatch,
} from './todo-schemas';

export {
  TAKEN_PER_PAGINA,
  deelTaak,
  fetchTaken,
  maakTaak,
  verwijderTaak,
  verzetTaak,
  zetAfgevinkt,
  zetTekst,
  type Taak,
} from './api';
