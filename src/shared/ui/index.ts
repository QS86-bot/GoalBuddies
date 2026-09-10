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
export { laad, terugvalZetters, useAsync, useAsyncMetTerugval } from './useAsync';
export { bindVertrekwacht, vertrekstap } from './vertrekwacht';
export type { Terugknop, Venster, Vertrekstap, Vertrekwacht, VertrekGebeurtenis } from './vertrekwacht';
export { useVertrekwacht } from './useVertrekwacht';
export { TeBeoordelenKaart } from './TeBeoordelenKaart';
export {
  beoordeelkopSleutel,
  toonBeoordeelkaart,
} from './tebeoordelen';
export { Bevestiging } from './Bevestiging';
export { Avatar } from './Avatar';
export { AvatarKeuze } from './AvatarKeuze';
export { initialen } from './naming';
export { Button, type ButtonVariant } from './Button';
export { Card } from './Card';
export { ChatRegel } from './ChatRegel';
export { Choice, type Optie } from './Choice';
export { CategorieMerk } from './CategorieMerk';
export { DatumKeuze } from './DatumKeuze';
export { Kalender, type KalenderDag } from './Kalender';
export { Ritmestrook } from './Ritmestrook';
export { DAGEN_IN_STROOK, ritmestrook, type Strookdag } from './ritmestrook';
export { Weekbalken, type WeekbalkRegel } from './Weekbalken';
export { CATEGORIEMERKEN, categoriemerk, type Categoriemerk, type Familie } from './categoriemerk';
export { GegroepeerdeKeuze, type Keuzegroep } from './GegroepeerdeKeuze';
export { Deelknop } from './Deelknop';
export { kiesFoto, type Fotokeuze, type Fotofoutsleutel } from './kiesFoto';
export { useBewijsfotokeuze, type Bewijsfotokeuze } from './useBewijsfotokeuze';
export { BEWIJSFOTO_TEKSTEN, CHATFOTO_TEKSTEN, Foto, type FotoProps } from './Foto';
export { DoelStandKaart } from './DoelStandKaart';
export { EmptyState } from './EmptyState';
export { Field } from './Field';
export { Ketting } from './Ketting';
export { FloorCeiling } from './FloorCeiling';
export { Meldpaneel, type MeldpaneelProps } from './Meldpaneel';
export { MemberRow } from './MemberRow';
export { MilestoneProgress } from './MilestoneProgress';
export { RisicoBadge } from './RisicoBadge';
export { BovenrandAlVerrekend, useBovenrandAlVerrekend, veiligeBovenrand } from './bovenrand';
export { Screen, useTerug, type Terug } from './Screen';
export { StreakCounter } from './StreakCounter';
export { Weekpas } from './Weekpas';
export { Weekplanblok, type WeekplanRegel } from './Weekplanblok';
export { Viering } from './Viering';
export { TaalKeuze } from './TaalKeuze';
export {
  noemtTegenvaller,
  TEGENVALLER_WOORDEN,
  TIP_SETS,
  TIPSET_PER_CATEGORIE,
  tipSetVoor,
  ZEEF_IJKING,
  TIPS_PER_CATEGORIE,
  tipVoorWeek,
  weektip,
  type TipSet,
} from './tips';
export { TijdzoneKeuze } from './TijdzoneKeuze';
export { isBruikbareZone, VOORSTELLEN_MAX, zoekTijdzones } from './tijdzone';
export { WeekStartKeuze } from './WeekStartKeuze';
export { Body, Caption, Eyebrow, Heading, Subheading } from './Text';

export {
  bevestigingen,
  type BevestigingsNaam,
  weekdoelActies,
  type BevestigingsTekst,
  type WeekdoelActies,
} from './acties';

export {
  aantalDeeltjes,
  magVieren,
  viering,
  type Viering as VieringInhoud,
  type VieringSoort,
} from './vieringen';

export { HULPVRAAG_MAX, hulpvraagVoorstel } from './hulpvraag';

export {
  risicoLabel,
  risicoTeken,
  risicoToon,
  risicoUitleg,
} from './risico';

export { useHulpvraagVerborgen, useVieringenAan } from './voorkeuren';

export { focusRing, motionDuration, useReducedMotion } from './a11y';
export { bewegingsDuur, bewegingsStijl, type BewegingsStijl } from './beweging';
export { Wachtbalk } from './Wachtbalk';
export {
  VERWACHTE_WACHT_MS,
  voortgangsweergave,
  wachtstand,
  type Voortgangsweergave,
  type Wachtfase,
  type Wachtstand,
} from './wachtvoortgang';
export {
  FLOOR_MARK,
  milestoneProgress,
  rangeState,
  kettingLabel,
  kettingVulling,
  besteReeksLabel,
  streakLabel,
  puntenUitleg,
  weekpasUitleg,
  weekpasLabel,
  weekpasReddeDezeCyclus,
  weekpasVoortgang,
  type Achieved,
  type RangeState,
  type Tone,
  type Viewer,
  type WeeklyGoalStatus,
} from './metrics';
