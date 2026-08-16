// Publieke rand van de module goals.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  fetchDoel,
  fetchDoelen,
  maakDoel,
  PER_PAGINA,
  wijzigDoel,
  zetArchief,
  type Doel,
  type DoelMetVoortgang,
  type Pagina,
  type Resultaat,
} from './api';

export {
  CATEGORIEEN,
  CATEGORIE_LABELS,
  datumLigtInDeToekomst,
  doelPatchSchema,
  doelSchema,
  STATUSSEN,
  type Categorie,
  type DoelInvoer,
  type DoelPatch,
  type DoelStatus,
} from './schemas';
