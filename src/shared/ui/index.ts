/**
 * De componentbibliotheek. Eén import voor elk scherm.
 *
 * ⚠️ Drie regels die in deze componenten zijn ingebakken en die je niet moet
 *    omzeilen door "even zelf" iets te tekenen:
 *
 *    1. `FloorCeiling` en `MemberRow` verbergen tegenslag voor de groep
 *       (domeinregel 7). Ze renderen niets in plaats van iets grijs.
 *    2. `MilestoneProgress` heet zo omdat er nooit een score in mag
 *       (domeinregel 10). Voortgang stijgt; score kan dalen.
 *    3. `AsyncView` dwingt loading, error én leeg af (CLAUDE.md regel 16).
 */

export { AsyncView } from './AsyncView';
export { Button, type ButtonVariant } from './Button';
export { Card } from './Card';
export { EmptyState } from './EmptyState';
export { FloorCeiling } from './FloorCeiling';
export { MemberRow } from './MemberRow';
export { MilestoneProgress } from './MilestoneProgress';
export { Screen } from './Screen';
export { StreakCounter } from './StreakCounter';
export { Body, Caption, Eyebrow, Heading, Subheading } from './Text';

export { focusRing, motionDuration, useReducedMotion } from './a11y';
export {
  FLOOR_MARK,
  milestoneProgress,
  rangeState,
  streakLabel,
  type Achieved,
  type RangeState,
  type Tone,
  type Viewer,
  type WeeklyGoalStatus,
} from './metrics';
