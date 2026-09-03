// Publieke rand van de module auth.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  signInWithEmail,
  signInWithOAuth,
  signOut,
  signUpWithEmail,
  verwijderMijnAccount,
  type OAuthProvider,
  type Uitkomst,
} from './api';

export {
  AVATAR_BUCKET,
  AVATAR_GELDIGHEID_S,
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  avatarPad,
  base64NaarBytes,
  keurBestand,
  metGetekendeAvatars,
  tekenAvatars,
  uploadAvatar,
  verwijderAvatar,
} from './avatar';

export { SessionProvider, useRequiredUserId, useSession } from './SessionProvider';
export { ProfielProvider, useProfiel } from './ProfielProvider';
export { useAvatarKeuze, type Avatarkeuze } from './useAvatarKeuze';

export {
  fetchProfiel,
  isOnboarded,
  rondOnboardingAf,
  updateProfiel,
  userClock,
  zetWeekStartdag,
  type Profiel,
  type ProfielUitkomst,
} from './profile';

export {
  aanmeldenSchema,
  emailSchema,
  inloggenSchema,
  profielPatchSchema,
  profielSchema,
  tijdzoneSchema,
  wachtwoordSchema,
  weekdagSchema,
  type AanmeldenInvoer,
  type InloggenInvoer,
  type ProfielInvoer,
  type ProfielPatch,
} from './schemas';

export { bestemmingVoor, NA_ONBOARDING_BEREIKBAAR, type Bestemming, type Routestand } from './routewacht';

export {
  andereModus,
  beginModus,
  ROUTE_AANMELDEN,
  type Aanmeldmodus,
  type Routeparameters,
} from './aanmeldmodus';
