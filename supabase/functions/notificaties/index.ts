import { createClient } from 'jsr:@supabase/supabase-js@2';

// ⚠️ Rechtstreeks uit de bestanden en niet via een index. Zie de rollover: een
//    index re-exporteert ook `clock.ts`, dat `process.env` leest om `freezeNow()`
//    in productie te weigeren — op Deno is dat een valkuil die je pas merkt als
//    de job stilvalt.
import { partsIn } from '../_shared/time/zoned.ts';
import { userCycle } from '../_shared/time/cycle.ts';
import type { Weekday } from '../_shared/time/types.ts';
import {
  berichtVoor,
  magNudgen,
  nudgeBericht,
  uurUit,
  type Bericht,
  type Melding,
  type Toon,
} from '../_shared/notificaties/regels.ts';

/**
 * De meldingen-job — EPIC 11 (QS8-91) en de dagelijkse nudge (QS8-77).
 *
 * ⚠️ **`push_tokens` is vandaag leeg en blijft dat tot `expo-notifications`
 *    erbij mag** (Q-TODO B4). Deze functie draait dan gewoon, vindt geen
 *    ontvangers en stuurt niets. Dat is met opzet: de hele keten staat en is
 *    getest, en toestemming krijgen betekent één implementatie in de app —
 *    niet een epic alsnog bouwen.
 *
 * ⚠️ Waarom hier geen credentials nodig zijn. De Expo-pushdienst accepteert een
 *    bericht op basis van het token zelf; FCM- en APNs-sleutels zitten in de
 *    build, niet in deze aanroep. De server hoeft dus niets geheims te kennen
 *    behalve zijn eigen service-role-key.
 *
 * ⚠️ Elk uur, net als de rollover. Gevolg dat je moet weten: een
 *    goedkeuringsverzoek kan tot een uur oud zijn voordat de melding komt. Het
 *    alternatief is een trigger die `pg_net` gebruikt, en dan staat de
 *    service-role-key in de database — precies wat Quinten op 19-08 heeft
 *    afgewezen bij de rolloverplanning. Voor een app met een weekritme is een
 *    uur vertraging de goedkopere kant van die ruil.
 *
 * ⚠️ **Domeinregel 7.** Er zijn vier soorten en geen ervan gaat over de
 *    tegenslag van een ander; de CHECK op `notifications_sent.kind` dwingt dat
 *    af. Zie `_shared/notificaties/regels.ts` voor de onderbouwing.
 */

interface Profiel {
  id: string;
  tz: string;
  week_start_day: number;
  reminder_enabled: boolean;
  reminder_time: string | null;
  reminder_tone: string | null;
}

interface Token {
  token: string;
}

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

function rolUit(authHeader: string): string {
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const stukken = token.split('.');
  if (stukken.length !== 3) return '';

  try {
    const payload = stukken[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '='));
    const claims = JSON.parse(json) as { role?: string };
    return claims.role ?? '';
  } catch {
    return '';
  }
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';

  if (rolUit(auth) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Alleen aanroepbaar als service_role' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? auth.replace(/^Bearer\s+/i, ''),
    { auth: { persistSession: false } },
  );

  const nu = new Date();
  let verstuurd = 0;
  let overgeslagen = 0;
  let zonderToken = 0;

  const { data: profielen, error: profielFout } = await db
    .from('profiles')
    .select('id, tz, week_start_day, reminder_enabled, reminder_time, reminder_tone');

  if (profielFout) {
    return new Response(JSON.stringify({ error: profielFout.message }), { status: 500 });
  }

  for (const profiel of (profielen ?? []) as Profiel[]) {
    // ⚠️ In een try, om dezelfde reden als in de rollover: `profiles.tz` is
    //    vrije tekst zonder controle en `Intl` gooit op een onbekende zone.
    //    Zonder dit legt één profiel met een typefout de meldingen voor iedereen
    //    stil. De echte reparatie is een CHECK op die kolom (Q-TODO A38).
    let lokaalUur: number;
    let lokaleDatum: string;
    try {
      const p = partsIn(profiel.tz, nu);
      lokaalUur = p.hour;
      lokaleDatum = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    } catch (fout) {
      console.error(
        `tijdzone onbruikbaar (tz=${profiel.tz}): ${
          fout instanceof Error ? fout.message : String(fout)
        }`,
      );
      overgeslagen += 1;
      continue;
    }

    const { data: tokens } = await db
      .from('push_tokens')
      .select('token')
      .eq('user_id', profiel.id);

    const adressen = ((tokens ?? []) as Token[]).map((t) => t.token);

    if (adressen.length === 0) {
      // Geen apparaat geregistreerd. Vandaag geldt dat voor iedereen, want
      // `expo-notifications` staat nog niet in de app.
      zonderToken += 1;
      continue;
    }

    // -----------------------------------------------------------------------
    // 1. De dagelijkse nudge — QS8-77
    // -----------------------------------------------------------------------
    const situatie = {
      herinneringAan: profiel.reminder_enabled,
      herinneringUur: uurUit(profiel.reminder_time),
      lokaalUur,
      heeftDagzet: await heeftDagzetVandaag(db, profiel.id, lokaleDatum),
      heeftAfronding: await heeftAfrondingVandaag(db, profiel.id, lokaleDatum),
      heeftOpenWeekdoel: await heeftOpenWeekdoel(db, profiel.id),
      inAdempauze: await inAdempauze(db, profiel.id, lokaleDatum),
      alleenSlapendeGroepen: await alleenSlapendeGroepen(db, profiel.id),
      alVerstuurd: await alVerstuurd(db, profiel.id, 'nudge', lokaleDatum, null),
    };

    if (magNudgen(situatie)) {
      const toon: Toon = profiel.reminder_tone === 'firm' ? 'firm' : 'gentle';
      const gelukt = await stuur(db, {
        userId: profiel.id,
        adressen,
        soort: 'nudge',
        bericht: nudgeBericht(toon),
        lokaleDatum,
        refId: null,
      });
      if (gelukt) verstuurd += 1;
    }

    // -----------------------------------------------------------------------
    // 2. Goedkeuringsverzoeken — een buddy wacht op jou
    // -----------------------------------------------------------------------
    //
    // ⚠️ Eén melding per voltooiing (`ref_id`), niet één per dag. Twee buddy's
    //    die op je wachten zijn twee verzoeken, en dan is samenvoegen tot "er
    //    wacht iets" minder bruikbaar. De unieke index op (user_id, kind,
    //    ref_id) houdt het bij één per stuk.
    const teBeoordelen = await openBeoordelingen(db, profiel.id);

    for (const rij of teBeoordelen) {
      if (await alVerstuurd(db, profiel.id, 'approval_request', lokaleDatum, rij.completionId)) {
        continue;
      }

      const gelukt = await stuur(db, {
        userId: profiel.id,
        adressen,
        soort: 'approval_request',
        bericht: berichtVoor('approval_request', { naam: rij.naam }),
        lokaleDatum,
        refId: rij.completionId,
      });
      if (gelukt) verstuurd += 1;
    }

    // -----------------------------------------------------------------------
    // 3. Ontvangen goedkeuringen — goed nieuws over jezelf
    // -----------------------------------------------------------------------
    const ontvangen = await verseGoedkeuringen(db, profiel.id);

    for (const rij of ontvangen) {
      if (await alVerstuurd(db, profiel.id, 'approval_received', lokaleDatum, rij.approvalId)) {
        continue;
      }

      const gelukt = await stuur(db, {
        userId: profiel.id,
        adressen,
        soort: 'approval_received',
        bericht: berichtVoor('approval_received', { naam: rij.naam }),
        lokaleDatum,
        refId: rij.approvalId,
      });
      if (gelukt) verstuurd += 1;
    }

    // -----------------------------------------------------------------------
    // 4. Het cyclusoverzicht — je week is afgelopen
    // -----------------------------------------------------------------------
    //
    // ⚠️ Op de eerste dag van je nieuwe cyclus, op je eigen herinneringsuur (of
    //    negen uur als je er geen hebt ingesteld). Dat is het moment waarop
    //    terugkijken zin heeft: de vorige week is dicht en de nieuwe is nog leeg.
    //
    // ⚠️ De cyclusgrens komt uit `shared/time` en wordt hier niet uitgerekend —
    //    correctheidsregel 7. Zonder dat zou deze job een eigen antwoord geven
    //    op "welke week is het", en dan lopen de app en de meldingen uit elkaar
    //    voor iedereen met een andere week-startdag.
    try {
      const cyclus = userCycle(
        { weekStartDay: profiel.week_start_day as Weekday, tz: profiel.tz },
        nu,
      );

      const overzichtsUur = uurUit(profiel.reminder_time) ?? 9;

      if (cyclus.startDate === lokaleDatum && lokaalUur === overzichtsUur) {
        if (!(await alVerstuurd(db, profiel.id, 'cycle_summary', lokaleDatum, null))) {
          const gelukt = await stuur(db, {
            userId: profiel.id,
            adressen,
            soort: 'cycle_summary',
            bericht: berichtVoor('cycle_summary', {}),
            lokaleDatum,
            refId: null,
          });
          if (gelukt) verstuurd += 1;
        }
      }
    } catch (fout) {
      console.error(
        `cyclus bepalen mislukte voor ${profiel.id}: ${
          fout instanceof Error ? fout.message : String(fout)
        }`,
      );
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      verstuurd,
      overgeslagen,
      zonderToken,
      profielen: (profielen ?? []).length,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

// ---------------------------------------------------------------------------
// De vragen die de regels stellen
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof createClient>;

async function heeftDagzetVandaag(db: Db, userId: string, datum: string): Promise<boolean> {
  const { count } = await db
    .from('daily_moves')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('local_date', datum);

  return (count ?? 0) > 0;
}

async function heeftAfrondingVandaag(db: Db, userId: string, datum: string): Promise<boolean> {
  // ⚠️ Op `submitted_at` en niet op `cycle_start_date`: de vraag is of hij
  //    vandáág iets gedaan heeft, niet of er deze week iets ligt.
  const { count } = await db
    .from('completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('submitted_at', `${datum}T00:00:00Z`)
    .lte('submitted_at', `${datum}T23:59:59Z`);

  return (count ?? 0) > 0;
}

async function heeftOpenWeekdoel(db: Db, userId: string): Promise<boolean> {
  const { count } = await db
    .from('weekly_goals')
    .select('id, goals!inner(owner_id)', { count: 'exact', head: true })
    .eq('goals.owner_id', userId)
    .eq('status', 'todo');

  return (count ?? 0) > 0;
}

async function inAdempauze(db: Db, userId: string, datum: string): Promise<boolean> {
  const { count } = await db
    .from('breathers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('starts_cycle', datum)
    .gte('ends_cycle', datum);

  return (count ?? 0) > 0;
}

/**
 * ⚠️ "Alleen slapende groepen" en niet "geen enkele actieve groep". Wie in geen
 *    enkele groep zit, hoort zijn nudge gewoon te krijgen — solo werken mag, en
 *    dan is er niets dat slaapt.
 */
async function alleenSlapendeGroepen(db: Db, userId: string): Promise<boolean> {
  const { data } = await db
    .from('group_members')
    .select('groups!inner(status)')
    .eq('user_id', userId)
    .eq('status', 'active');

  const groepen = (data ?? []) as unknown as { groups: { status: string } | null }[];
  if (groepen.length === 0) return false;

  return groepen.every((g) => g.groups?.status === 'sleeping');
}

async function alVerstuurd(
  db: Db,
  userId: string,
  kind: Melding,
  datum: string,
  refId: string | null,
): Promise<boolean> {
  let vraag = db
    .from('notifications_sent')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind);

  vraag = refId === null ? vraag.eq('local_date', datum).is('ref_id', null) : vraag.eq('ref_id', refId);

  const { count } = await vraag;
  return (count ?? 0) > 0;
}

/**
 * Voltooiingen die op het oordeel van deze gebruiker wachten.
 *
 * ⚠️ Via `te_beoordelen_voor()` (migratie 0054) en **niet** via
 *    `openstaande_beoordelingen()`. Die laatste is geen SECURITY DEFINER en
 *    leunt op de RLS van de aanroeper; deze job draait als `service_role` en
 *    zou daarmee élke openstaande voltooiing in het hele project terugkrijgen.
 *    Een melding daarop baseren betekent iedereen een bericht sturen over de
 *    week van een wildvreemde. De autorisatiegrens staat nu in de functie zelf.
 */
async function openBeoordelingen(
  db: Db,
  userId: string,
): Promise<{ completionId: string; naam: string }[]> {
  const { data, error } = await db.rpc('te_beoordelen_voor', { p_user_id: userId });

  if (error) {
    console.error(`te beoordelen ophalen mislukte voor ${userId}: ${error.message}`);
    return [];
  }

  const rijen = (data ?? []) as unknown as {
    completion_id: string;
    owner_name: string | null;
  }[];

  return rijen.map((r) => ({ completionId: r.completion_id, naam: r.owner_name ?? '' }));
}

/** Goedkeuringen op je eigen weken van de afgelopen dag. */
async function verseGoedkeuringen(
  db: Db,
  userId: string,
): Promise<{ approvalId: string; naam: string }[]> {
  const sinds = new Date(Date.now() - 26 * 3_600_000).toISOString();

  const { data, error } = await db
    .from('completion_approvals')
    .select('id, approver_id, subject_id, status, created_at')
    .eq('subject_id', userId)
    .eq('status', 'approved')
    .gte('created_at', sinds)
    .limit(20);

  if (error) {
    console.error(`goedkeuringen ophalen mislukte voor ${userId}: ${error.message}`);
    return [];
  }

  return ((data ?? []) as { id: string }[]).map((r) => ({ approvalId: r.id, naam: '' }));
}

// ---------------------------------------------------------------------------
// Versturen
// ---------------------------------------------------------------------------

/**
 * Stuurt naar Expo en legt vast dát er gestuurd is.
 *
 * ⚠️ De rij in `notifications_sent` wordt **vóór** het versturen geschreven, en
 *    dat is een bewuste ruil. Andersom levert een crash tussen versturen en
 *    vastleggen een tweede melding op bij de volgende run; zo levert een
 *    mislukte verzending hooguit een gemiste melding op. Een dubbele push is
 *    vervelender dan een gemiste — en de unieke index is de grendel die deze
 *    volgorde pas betrouwbaar maakt.
 */
async function stuur(
  db: Db,
  opdracht: {
    userId: string;
    adressen: string[];
    soort: Melding;
    bericht: Bericht;
    lokaleDatum: string;
    refId: string | null;
  },
): Promise<boolean> {
  const { error: logFout } = await db.from('notifications_sent').insert({
    user_id: opdracht.userId,
    kind: opdracht.soort,
    local_date: opdracht.lokaleDatum,
    ref_type: opdracht.refId === null ? null : 'completion',
    ref_id: opdracht.refId,
  });

  if (logFout) {
    // Een unieke-indexfout betekent dat een andere run hem al gestuurd heeft.
    // Dat is geen storing maar precies waar die index voor is.
    if (logFout.code !== '23505') {
      console.error(`melding vastleggen mislukte voor ${opdracht.userId}: ${logFout.message}`);
    }
    return false;
  }

  const berichten = opdracht.adressen.map((to) => ({
    to,
    title: opdracht.bericht.titel,
    body: opdracht.bericht.body,
    // De diepe link. `expo-router` leest dit uit `data.pad`.
    data: { pad: opdracht.bericht.pad, soort: opdracht.soort },
    sound: 'default',
  }));

  try {
    const antwoord = await fetch(EXPO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(berichten),
      // CLAUDE.md coderegel 14: elke externe call heeft een timeout.
      signal: AbortSignal.timeout(15_000),
    });

    if (!antwoord.ok) {
      console.error(`Expo gaf HTTP ${antwoord.status} voor ${opdracht.userId}`);
      return false;
    }

    return true;
  } catch (fout) {
    console.error(
      `versturen mislukte voor ${opdracht.userId}: ${
        fout instanceof Error ? fout.message : String(fout)
      }`,
    );
    return false;
  }
}
