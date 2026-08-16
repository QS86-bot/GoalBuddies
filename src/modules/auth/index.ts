// Publieke rand van de module auth.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  signInWithEmail,
  signInWithOAuth,
  signOut,
  signUpWithEmail,
  type OAuthProvider,
  type Uitkomst,
} from './api';

export { SessionProvider, useRequiredUserId, useSession } from './SessionProvider';
export { ProfielProvider, useProfiel } from './ProfielProvider';

export {
  fetchProfiel,
  isOnboarded,
  rondOnboardingAf,
  updateProfiel,
  userClock,
  voorgesteldeTijdzone,
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
