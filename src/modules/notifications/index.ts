// Publieke rand van de module notifications.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  berichtVoor,
  magNudgen,
  nudgeBericht,
  nudgeReden,
  uurUit,
  type Bericht,
  type Melding,
  type NudgeSituatie,
  type Toon,
} from './regels';

export {
  geenPush,
  registreerPushToken,
  verwijderPushToken,
  zetPushBron,
  type Platform,
  type PushBron,
} from './tokens';

// ⚠️ Het enige bestand dat `expo-notifications` importeert. Zie `expo-bron.ts`:
//    de bibliotheek raakt de datalaag, de schermen en de Edge Function niet aan.
export { expoPush } from './expo-bron';
