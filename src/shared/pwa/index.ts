// Publieke rand van shared/pwa.
// Zelfde vorm als shared/time, shared/theme, shared/tekst en shared/ui: de rest
// van de app importeert uit `@/shared/pwa` en nooit uit een bestand erbinnen.

export {
  huidigInstallatieadvies,
  installatieadvies,
  type Installatieadvies,
  type Omgeving,
} from './installatie';
