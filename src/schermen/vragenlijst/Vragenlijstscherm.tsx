import { HELDVRAGEN } from '@/modules/helden';
import { type Categorie, type Gevoel, type Minuten, type Moment, type Valkuil } from '@/modules/goals';
import { useProfiel } from '@/modules/auth';
import { t } from '@/shared/i18n';
import { AsyncView, Caption, Voortgangsstreep } from '@/shared/ui';

import { Samenvatting } from './Samenvatting';
import { Stapnavigatie } from './Stapnavigatie';
import {
  aantalVragen,
  EERSTE_HELDVRAAG,
  FOCUS,
  GEVOEL,
  isVraag,
  MOMENT,
  SAMENVATTING,
  stapNummer,
  stapVoortgang,
  TIJD,
  VALKUIL,
  VOORBEELD,
} from './stappen';
import { useVragenlijst } from './useVragenlijst';
import { Focus } from './vragen/Focus';
import { Gevoel as GevoelVraag } from './vragen/Gevoel';
import { Held } from './vragen/Held';
import { Moment as MomentVraag } from './vragen/Moment';
import { Tijd } from './vragen/Tijd';
import { Valkuil as ValkuilVraag } from './vragen/Valkuil';
import { Voorbeeld } from './vragen/Voorbeeld';

/**
 * De korte vragenlijst, één vraag per scherm — QS8-257 (A56) en QS8-733.
 *
 * ⚠️ **Ná de aanmeldmuur en niet ervoor** (besluit A56, bevestigd 19-11-2026): ervoor
 *    vraagt een uitgelogd AI-eindpunt met een limiet en een kostenrem (regel 5 en 6).
 *
 * ⚠️ **Alles overslaan mag en wist niets** (QS8-37, criterium 4): `patchUitVragenlijst()`
 *    laat een overgeslagen antwoord met rust.
 *
 * ⚠️ **Wacht tot het profiel bekend is en laat het formulier daarna pas monteren.** De
 *    initialisatoren draaien één keer; monteert het formulier met een onbekend profiel,
 *    dan vervangt "Bewaren" eerdere antwoorden door lege. Een buitenste component en
 *    geen `if` erin, zodat de hooks-volgorde niet breekt.
 */
export function Vragenlijstscherm() {
  const { profiel, loading, error, herlaad } = useProfiel();

  return (
    <AsyncView
      loading={loading}
      error={error}
      data={profiel ?? undefined}
      isEmpty={() => false}
      onRetry={herlaad}
      empty={{ title: t('onboarding.profiel_leeg_titel'), body: t('onboarding.profiel_leeg_tekst') }}
    >
      {() => <Formulier />}
    </AsyncView>
  );
}

function Formulier() {
  const v = useVragenlijst();
  const voortgang = stapVoortgang(v.stap);

  return (
    <>
      {/* ⚠️ De titel en de terugknop staan in het routebestand (`<Screen>`, QS8-211); hier
          alleen wat van de stap afhangt: waar je bent en hoe ver je bent. */}
      {isVraag(v.stap) ? (
        <Caption>{t('vragenlijst.stap_van', { stap: stapNummer(v.stap), totaal: aantalVragen() })}</Caption>
      ) : null}
      {voortgang === null ? null : <Voortgangsstreep voortgang={voortgang} />}
      <Stap v={v} />
      {v.fout === null ? null : <Caption danger>{v.fout}</Caption>}
      <Stapnavigatie
        stap={v.stap}
        bezig={v.bezig}
        geblokkeerd={v.geblokkeerd}
        onVolgende={v.volgende}
        onVorige={v.vorige}
        onOverslaan={v.overslaan}
        onBewaar={() => void v.bewaar()}
      />
    </>
  );
}

function Stap({ v }: { readonly v: ReturnType<typeof useVragenlijst> }) {
  const i = v.invoer;

  if (v.stap === FOCUS) return <Focus gekozen={(i.focus_areas ?? []) as Categorie[]} onWissel={v.wisselFocus} />;
  if (v.stap === TIJD) {
    return <Tijd waarde={(i.minutes_per_day ?? null) as Minuten | null} onKies={(m) => v.zet({ minutes_per_day: m })} />;
  }
  if (v.stap === MOMENT) {
    return <MomentVraag waarde={(i.when_i_do_it ?? null) as Moment | null} onKies={(m) => v.zet({ when_i_do_it: m })} />;
  }
  if (v.stap === VALKUIL) {
    return <ValkuilVraag gekozen={(i.what_breaks_it ?? []) as Valkuil[]} onWissel={v.wisselValkuil} />;
  }
  if (v.stap === GEVOEL) {
    return (
      <GevoelVraag
        gevoel={(i.feeling ?? null) as Gevoel | null}
        eigen={i.feeling_own ?? null}
        onKies={(g) => v.zet({ feeling: g })}
        onEigen={(tekst) => v.zet({ feeling_own: tekst })}
      />
    );
  }
  if (v.stap === VOORBEELD) {
    return <Voorbeeld toon={v.profiel?.reminder_tone === 'firm' ? 'firm' : 'gentle'} gevoel={i.feeling ?? null} />;
  }
  if (v.stap === SAMENVATTING) {
    return (
      <Samenvatting
        invoer={i}
        keuze={v.held.keuze}
        bestaandeHeld={v.held.bestaande}
        onKiesHeld={v.held.kiesGelijkspel}
        onWijzig={v.naar}
      />
    );
  }

  // ⚠️ De vier heldenvragen komen uit `HELDVRAGEN`; het enige wat verschilt is data.
  const vraag = HELDVRAGEN[v.stap - EERSTE_HELDVRAAG];
  if (vraag === undefined) return null;
  return <Held vraag={vraag} waarde={v.held.antwoorden[vraag] ?? null} onKies={(h) => v.held.kies(vraag, h)} />;
}
