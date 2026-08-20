// Publieke rand van de module goals.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  fetchDoel,
  fetchDoelen,
  maakDoel,
  PER_PAGINA,
  wijzigDoel,
  zetArchief,
  zetStreefdatum,
  type Doel,
  type DoelMetVoortgang,
  type Pagina,
  type Resultaat,
} from './api';

export {
  ARGUMENT_MAX,
  ARGUMENT_MIN,
  beslisDeadlineVerzoek,
  deadlineVerzoekSchema,
  fetchLaatsteBesluit,
  fetchOpenVerzoek,
  fetchOpenVerzoekenVoorGroep,
  trekDeadlineVerzoekIn,
  VERZOEKEN_PER_PAGINA,
  vraagDeadlineVerschuiving,
  type DeadlineVerzoek,
  type DeadlineVerzoekInvoer,
} from './deadline';

export {
  afsluitbareCyclus,
  huidigeCyclus,
  inCoulanceperiode,
  zojuistAfgeslotenCyclus,
} from './cycles';

export {
  annuleerAdempauze,
  fetchAdempauzes,
  planAdempauze,
  planbareCycli,
  type Adempauze,
} from './adempauze';

export { bewaarInterview, fetchInterview, type Interview } from './interview';

export {
  ANTWOORD_MAX,
  heeftAntwoorden,
  INTERVIEW_STAPPEN,
  interviewSchema,
  LEEG_INTERVIEW,
  type InterviewInvoer,
} from './interview-schemas';

export {
  eersteCyclusVanDoel,
  fetchDoorschuifbaar,
  fetchMijlpalen,
  fetchWeekdoelen,
  maakWeekdoel,
  schuifDoor,
  sluitWeekdoelAf,
  verwijderWeekdoel,
  type Mijlpaal,
  type Weekdoel,
} from './weekly';

export { weekdoelSchema, type AfrondInvoer, type WeekdoelInvoer } from './weekly-schemas';

export { verwijderDoel } from './api';
export { fetchWeekpasStanden, type WeekpasStanden } from './weekpas';

export { fetchDoelStanden, type DoelStand, type Reeks } from './stand';

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
