// Publieke rand van de module ai.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  fetchJob,
  vraagMijlpalen,
  werkJobAf,
  type Job,
  type JobStatus,
  type JobVerwijzing,
  type Uitkomst,
} from './jobs';

export { haalbaarheidUit, mijlpalenUit, type VoorstelMijlpaal } from './uitvoer';
