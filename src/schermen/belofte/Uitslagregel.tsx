import { belofteweek, type Belofteuitslag } from '@/modules/commitments';
import type { Sleutel } from '@/shared/i18n';
import { opmaaktaal, t } from '@/shared/i18n';
import { toonDatumLang, type UserClock } from '@/shared/time';
import { Body } from '@/shared/ui';

/** De zin per uitslag — QS8-815, V3 = A. */
export const UITSLAGTEKST: Readonly<Record<Belofteuitslag, Sleutel>> = {
  gehouden: 'belofte.uitslag.gehouden',
  in_werking: 'belofte.uitslag.in_werking',
  ingetrokken: 'belofte.uitslag.ingetrokken',
};

/**
 * Eén regel met de uitslag van een besliste belofte — QS8-815 (besluit Quinten 23-11).
 *
 * ⚠️ Alleen voor de eigenaar: het beloftescherm toetst `doel.owner_id`, en het spoor
 *    waaruit de uitslag komt is alleen voor hem leesbaar (`commitment_events_select`).
 *    De zin noemt de week en de uitkomst, verder niets: geen getuige, geen tekst.
 * ⚠️ Een week die `shared/time` niet kan lezen, geeft geen regel (bij twijfel niets).
 */
export function Uitslagregel({
  uitslag,
  periodeStart,
  klok,
}: {
  readonly uitslag: Belofteuitslag;
  readonly periodeStart: string | null;
  readonly klok: UserClock;
}) {
  const week = belofteweek(klok, periodeStart ?? '');
  if (week === null) return null;
  const taal = opmaaktaal();
  return (
    <Body>
      {t(UITSLAGTEKST[uitslag], { start: toonDatumLang(week.start, taal), einde: toonDatumLang(week.laatsteDag, taal) })}
    </Body>
  );
}
