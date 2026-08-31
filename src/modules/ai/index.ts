// Publieke rand van de module ai.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  fetchJob,
  vraagMijlpaalTip,
  vraagMijlpalen,
  vraagPlan,
  vraagWeekdoelen,
  werkJobAf,
  type Job,
  type JobVerwijzing,
  type Uitkomst,
} from './jobs';

export { JOB_STATUSSEN, type JobStatus } from './job-schemas';

export {
  haalbaarheidUit,
  mijlpalenUit,
  planUit,
  weekdoelenUit,
  type VoorstelMijlpaal,
  type VoorstelPlan,
  type VoorstelWeekdoel,
} from './uitvoer';

export {
  onvolledigMelding,
  pasPlanToe,
  type PlanUitkomst,
} from './plan-toepassen';

export {
  MAX_MIJLPALEN,
  rijenUitPlan,
  type MijlpaalRij,
  type PlanRijen,
} from './plan-rijen';
