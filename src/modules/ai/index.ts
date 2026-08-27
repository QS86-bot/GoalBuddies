// Publieke rand van de module ai.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  fetchJob,
  vraagMijlpaalTip,
  vraagMijlpalen,
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
  weekdoelenUit,
  type VoorstelMijlpaal,
  type VoorstelWeekdoel,
} from './uitvoer';
