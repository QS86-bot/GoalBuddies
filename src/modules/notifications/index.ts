// Publieke rand van de module notifications.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  berichtVoor,
  herinneringStandaard,
  meldingPoortReden,
  meldingsoortVelden,
  MELDINGSOORTEN,
  VOORKEUR_PER_SOORT,
  herinneringVelden,
  nudgeBericht,
  nudgeReden,
  STANDAARD_HERINNERINGSTIJD,
  tijdVoorInvoer,
  uurUit,
  type Bericht,
  type Melding,
  type Meldingsvoorkeuren,
  type NudgeSituatie,
  type Toon,
} from './regels';

export { PUSH_WEIGERGRONDEN, pushWeigerMelding, type PushWeigergrond } from './push-redenen';

export {
  geenPush,
  laatstePushWeigering,
  registreerPushToken,
  verwijderPushToken,
  zetPushBron,
  type Platform,
  type PushBron,
} from './tokens';

// ⚠️ Het enige bestand dat `expo-notifications` importeert. Zie `expo-bron.ts`:
//    de bibliotheek raakt de datalaag, de schermen en de Edge Function niet aan.
export { expoPush } from './expo-bron';

// De webkant van dezelfde rand. Twee bronnen, één interface: `expoPush` op
// native, `maakWebPushBron()` op web — zie `app/_layout.tsx`.
export {
  abonnementNaarToken,
  huidigeMeldingenstand,
  maakWebPushBron,
  meldingenstand,
  SERVICE_WORKER_PAD,
  zetMeldingenAan,
  zetMeldingenUit,
  type Aanzetresultaat,
  type Meldingenstand,
  type Pushomgeving,
  type Webabonnement,
  type Webpushtoken,
} from './webpush-registratie';
